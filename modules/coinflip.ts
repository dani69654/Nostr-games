import NDK, {
  NDKEvent,
  NDKKind,
  NDKPrivateKeySigner,
} from '@nostr-dev-kit/ndk';
import { invariant } from '../utils/invariant';
import {
  decryptDM,
  dm,
  generateKeyPair,
  nip19EncodeNpub,
  nip19EncodeNsec,
  note,
  subscribeToEvent,
} from '../utils/nostr';
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
    '#t': ['nostr-game=cf'],
    since: Math.floor(Date.now() / 1000),
  },
];

export const createCoinflip = async ({
  game: rawGame,
  ndk,
}: {
  game: NDKEvent;
  ndk: NDK;
}) => {
  const game = decodeGame(rawGame.content);
  invariant(isGame(game), 'Invalid game data');

  // Game account
  const nostrGameKeys = generateKeyPair();
  console.log('Game account:', {
    nsec: nip19EncodeNsec(nostrGameKeys.secretKey),
    npub: nip19EncodeNpub(nostrGameKeys.publicKey),
  });
  ndk.signer = new NDKPrivateKeySigner(nostrGameKeys.secretKey);

  // eCash key pair for Player 1
  const eCashKeys = createKeyPair();

  // DM to player 1 (game recap & ecash pubkey)
  await dm(ndk, {
    text: `
          🎲 New Coin Toss game! You chose "${game.side}". \n
          Lock ecash to this pubkey to proceed: ${eCashKeys.publicKey} \n
          Reply with the ecash token to continue.
          `,
    fromSecretKey: nostrGameKeys.secretKey,
    fromPubkey: nostrGameKeys.publicKey,
    toPubkey: rawGame.pubkey,
  });

  // Subscribe to player's DM response
  const dmRespSub = subscribeToEvent(ndk, {
    filters: [
      {
        kinds: [NDKKind.EncryptedDirectMessage],
        since: Math.floor(Date.now() / 1000),
        authors: [rawGame.pubkey],
        '#p': [nostrGameKeys.publicKey],
      },
    ],
    opts: { closeOnEose: false },
    onEvent: async (playerEvent) => {
      try {
        const decrypted = decryptDM({
          text: playerEvent.content,
          sk: nostrGameKeys.secretKey,
          pk: playerEvent.pubkey,
        });

        const ecashDecoded = getDecodedToken(decrypted);
        invariant(ecashDecoded.proofs.length > 0, 'No proofs found');

        let totalAmount = 0;
        ecashDecoded.proofs.forEach((proof) => {
          const secretParsed = JSON.parse(proof.secret);
          invariant(secretParsed[0] === 'P2PK', 'Invalid ecash proof data');
          invariant(
            secretParsed[1].data === eCashKeys.publicKey,
            'Invalid ecash proof data'
          );
          invariant(proof.amount > 0, 'Invalid ecash amount');
          totalAmount += proof.amount;
        });

        console.log('New coinflip game started!');

        // Publish main game note
        const noteEvent = await note(ndk, {
          text: `
                🎉 Coin Toss Game Started! \n
                🔒 Locked ${totalAmount} ${ecashDecoded.unit}  (ecash) on "${game.side}". \n
                Mint: ${ecashDecoded.mint} \n
                Pubkey: ${eCashKeys.publicKey} \n
                Reply to this note with your ecash token to join! \n
                `,
          pubkey: nostrGameKeys.publicKey,
        });
        dmRespSub.stop();

        // Subscribe to game note replies
        const noteRespSub = subscribeToEvent(ndk, {
          filters: [
            {
              kinds: [NDKKind.Text],
              '#e': [noteEvent.id],
              since: Math.floor(Date.now() / 1000),
            },
          ],
          opts: { closeOnEose: false },
          onEvent: async (event) => {
            try {
              // Check if content is an ecash token
              const decoded = getDecodedToken(event.content);

              let total = 0;
              decoded.proofs.forEach((proof) => {
                const secretParsed = JSON.parse(proof.secret);
                invariant(
                  secretParsed[0] === 'P2PK',
                  'Invalid ecash proof data'
                );
                invariant(
                  secretParsed[1].data === eCashKeys.publicKey,
                  'Invalid ecash proof data'
                );
                invariant(proof.amount > 0, 'Invalid ecash amount');
                total += proof.amount;
              });
              invariant(total === totalAmount, 'Invalid total amount');
              invariant(decoded.mint === ecashDecoded.mint, 'Invalid mint');

              // Random coin toss result
              const result =
                crypto.randomBytes(1)[0] % 2 === 0 ? 'head' : 'tail';
              await note(ndk, {
                text: `🪙 The coin shows: "${result}"!`,
                pubkey: nostrGameKeys.publicKey,
              });

              // Determine winner
              const winnerPubkey =
                result === game.side ? rawGame.pubkey : event.pubkey;

              // DM winner with privateKey
              await dm(ndk, {
                text: `
                      🏆 You won! Redeem ecash with this secret key: ${eCashKeys.privateKey} \n
                      Mint: ${ecashDecoded.mint} \n
                      ${event.content} \n
                      ${decrypted} \n
                      `,
                fromSecretKey: nostrGameKeys.secretKey,
                fromPubkey: nostrGameKeys.publicKey,
                toPubkey: winnerPubkey,
              });
              noteRespSub.stop();
            } catch {}
          },
        });
      } catch (err) {
        console.error('Error:', err);
      }
    },
  });
};

// 'create:head' | 'create:tail'
const decodeGame = (game: string): Game | null => {
  if (typeof game !== 'string') return null;
  try {
    const command = game.trim().split(/\s+/);
    const [action, side] = command[1].split(':');
    return {
      action: action as Game['action'],
      side: side as Game['side'],
    };
  } catch {
    return null;
  }
};

const isGame = (game: Game | null): game is Game => {
  try {
    return game?.action === 'create' && ['head', 'tail'].includes(game.side);
  } catch {
    return false;
  }
};
