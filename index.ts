import NDK, {
  NDKEvent,
  NDKKind,
  NDKPrivateKeySigner,
} from '@nostr-dev-kit/ndk';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import WebSocket from 'ws';
import crypto from 'crypto';
import * as nobleSecp256k1 from '@noble/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { createKeyPair } from './utils/ecash';
import { connectNDK, subscribeToEvent } from './utils/nostr';
import { COINFLIP_NDK_FILTER, createCoinflip } from './modules/coinflip';
import { getDecodedToken } from '@cashu/cashu-ts';

// @ts-ignore
global.WebSocket = WebSocket;

const main = async () => {
  const ndk = await connectNDK();
  console.log('Connected to NDK');

  subscribeToEvent(ndk, {
    filters: COINFLIP_NDK_FILTER,
    opts: { closeOnEose: false },
    onEvent: (game) => createCoinflip({ game, ndk }),
  });
};

main();
