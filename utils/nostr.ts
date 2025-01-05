import WebSocket from 'ws';
import NDK, {
  NDKEvent,
  NDKFilter,
  NDKKind,
  NDKPrivateKeySigner,
  NDKSubscriptionOptions,
} from '@nostr-dev-kit/ndk';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import crypto from 'crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import * as nobleSecp256k1 from '@noble/secp256k1';

// @ts-ignore
global.WebSocket = WebSocket;

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostrdice.com',
  'wss://relay.primal.net',
];

/**
 * Connect to a list of relays.
 */
export const connectNDK = async (): Promise<NDK> => {
  const ndk = new NDK({ explicitRelayUrls: RELAYS });
  await ndk.connect();
  return ndk;
};

/**
 * Subscribe to NDK events.
 */
export const subscribeToEvent = (
  ndk: NDK,
  args: {
    filters: NDKFilter | NDKFilter[];
    opts?: NDKSubscriptionOptions;
    onEvent: (e: NDKEvent) => void;
  }
) => {
  const sub = ndk.subscribe(args.filters, args.opts);
  sub.on('event', args.onEvent);
  sub.start();
  return sub;
};

/**
 * Generate a key pair for signing or encryption.
 */
export const generateKeyPair = () => {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return { secretKey: sk, publicKey: pk };
};

/**
 * NIP-19 encode nsec.
 */
export const nip19EncodeNsec = (nsec: Uint8Array) => nip19.nsecEncode(nsec);

/**
 * NIP-19 encode npub.
 */
export const nip19EncodeNpub = (npub: string) => nip19.npubEncode(npub);

/**
 * Create a shared secret using secp256k1 (noble).
 */
export const createSharedSecret = (localSk: Uint8Array, remotePk: string) => {
  return bytesToHex(
    nobleSecp256k1.getSharedSecret(localSk, '02' + remotePk, true)
  ).substring(2);
};

/**
 * Send DM
 */
export const dm = async (
  ndk: NDK,
  args: {
    text: string;
    fromSecretKey: Uint8Array;
    fromPubkey: string;
    toPubkey: string;
  }
) => {
  const iv = crypto.randomBytes(16);
  const sharedSecret = createSharedSecret(args.fromSecretKey, args.toPubkey);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    hexToBytes(sharedSecret),
    iv
  );
  let encryptedMessage = cipher.update(args.text, 'utf8', 'base64');
  encryptedMessage += cipher.final('base64');
  const ivBase64 = iv.toString('base64');
  const fullMessage = `${encryptedMessage}?iv=${ivBase64}`;

  const dm = new NDKEvent(ndk, {
    pubkey: args.fromPubkey,
    kind: NDKKind.EncryptedDirectMessage,
    tags: [['p', args.toPubkey]],
    created_at: Math.floor(Date.now() / 1000),
    content: fullMessage,
  });

  await dm.publish();
};

/**
 * Decrypt DM
 */
export const decryptDM = (args: {
  text: string;
  sk: Uint8Array;
  pk: string;
}) => {
  // Extract ciphertext & IV from e.content
  const [ciphertextB64, ivB64] = args.text.split('?iv=');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');

  // Generate shared secret: (your game’s secret key, sender’s pubkey)
  const sharedSecret = createSharedSecret(args.sk, args.pk);

  // Decrypt
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    hexToBytes(sharedSecret),
    iv
  );
  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

/**
 * Publish text note
 */
export const note = async (
  ndk: NDK,
  args: {
    text: string;
    pubkey: string;
  }
) => {
  const note = new NDKEvent(ndk, {
    kind: NDKKind.Text,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    content: args.text,
    pubkey: args.pubkey,
  });

  await note.publish();

  return note;
};
