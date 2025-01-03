import NDK, {
  NDKEvent,
  NDKKind,
  NDKPrivateKeySigner,
} from '@nostr-dev-kit/ndk';
import { invariant } from '../utils/invariant';
import {
  createSharedSecret,
  decryptDM,
  dm,
  generateKeyPair,
  nip19EncodeNpub,
  nip19EncodeNsec,
  note,
  subscribeToEvent,
} from '../utils/nostr';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import * as nobleSecp256k1 from '@noble/secp256k1';
import { createKeyPair } from '../utils/ecash';
import { getDecodedToken } from '@cashu/cashu-ts';
import crypto from 'crypto';

type Game = {
  action: 'create' | 'play';
  side: 'head' | 'tail';
};

export const COINFLIP_NDK_FILTER = [
  {
    kinds: [NDKKind.Text],
    '#t': ['gamect'],
    since: Math.floor(Date.now() / 1000),
  },
];

export const createCoinflip = async (args: { game: NDKEvent; ndk: NDK }) => {
  // Validate game data
  invariant(isGame(args.game.content), 'Invalid game data');
  const game = JSON.parse(args.game.content) as Game;

  // Generate game account
  const nostrGameKeys = generateKeyPair();
  console.log('Game account:', {
    nsec: nip19EncodeNsec(nostrGameKeys.secretKey),
    npub: nip19EncodeNpub(nostrGameKeys.publicKey),
  });

  // Add signer to ndk using the game account
  const signer = new NDKPrivateKeySigner(nostrGameKeys.secretKey);
  Object.assign(args.ndk, { signer });

  // Generate ecash key pair for the player 1
  const eCashKeys = createKeyPair();

  // Create DM to send to player 1 with the game recap and the ecash pubkey where funds have to be locked
  await dm(args.ndk, {
    text: `You are about to create a new coin toss game. Your choice is ${game.side}. Lock ecash to this pubkey to proceed ${eCashKeys.publicKey}. Answer this DM with ecash to continue.`,
    fromSecretKey: nostrGameKeys.secretKey,
    fromPubkey: nostrGameKeys.publicKey,
    toPubkey: args.game.pubkey,
  });

  // Create DM and auto send it Game account with the ecash pubkey AND secret key, the winner will use it to redeem the funds
  await dm(args.ndk, {
    text: `Redeem ecash using this this secret key: ${eCashKeys.privateKey}`,
    fromSecretKey: nostrGameKeys.secretKey,
    fromPubkey: nostrGameKeys.publicKey,
    toPubkey: nostrGameKeys.publicKey,
  });

  // subscribe to DM response from player 1
  const dmRespSub = subscribeToEvent(args.ndk, {
    filters: [
      {
        kinds: [NDKKind.EncryptedDirectMessage],
        since: Math.floor(Date.now() / 1000),
        authors: [args.game.pubkey], // who is sending
        '#p': [nostrGameKeys.publicKey], // who it’s sent to
      },
    ],
    opts: { closeOnEose: false },
    onEvent: async (e) => {
      try {
        const decrypted = decryptDM({
          text: e.content,
          sk: nostrGameKeys.secretKey,
          pk: e.pubkey,
        });

        // Decode ecash
        const ecashDecoded = getDecodedToken(decrypted);

        // Ensure that secret  data eCashKeys.pubkey
        const secretParsed = JSON.parse(ecashDecoded.proofs[0].secret);

        invariant(secretParsed[0] === 'P2PK', 'Invalid ecash proof data');
        invariant(
          secretParsed[1].data === eCashKeys.publicKey,
          'Invalid ecash proof data'
        );
        invariant(ecashDecoded.proofs[0].amount > 0, 'Invalid ecash amount');

        console.log('New coinflip game started!');

        // publish note with the game data
        await note(args.ndk, {
          text: `New game started with ${ecashDecoded.proofs[0].amount} ecash locked to ${game.side}. The ecash mint is ${ecashDecoded.mint} and the token is ${decrypted}`,
          pubkey: nostrGameKeys.publicKey,
        });
      } catch (e) {
        console.error('Error:', e);
      }
    },
  });
};

const isGame = (game: unknown): game is Game => {
  if (typeof game !== 'string') return false;
  try {
    const data = JSON.parse(game);
    return data.action === 'create' && ['head', 'tail'].includes(data.side);
  } catch {
    return false;
  }
};
