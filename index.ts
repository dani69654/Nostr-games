import NDK, { NDKEvent, NDKKind, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import WebSocket from 'ws';
import crypto from 'crypto';
import * as nobleSecp256k1 from '@noble/secp256k1';

// @ts-ignore
global.WebSocket = WebSocket;

// Utility functions for handling hex and base64 conversions
const hexToBytes = (hex: string) => Uint8Array.from(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
const bytesToHex = (bytes: Uint8Array) => bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

(async () => {
    const ndk = new NDK({
        explicitRelayUrls: ['wss://relay.damus.io', 'wss://relay.nostrdice.com'],
    });

    await ndk.connect();
    console.log('Connected to NDK');

    const notes = ndk.subscribe([{ kinds: [NDKKind.Text], '#t': ['gamect'] }], { closeOnEose: false });
    await notes.start();

    notes.on('event', async (event: NDKEvent) => {
        console.log('Received event:', event.content);

        if (event.content.includes('#gamect')) {
            event.content = event.content.replace('#gamect', '');
        }

        const data: { action: 'create' | 'play'; side: 'head' | 'tail'; amount: number } = JSON.parse(event.content);
        console.log('game coin toss data:', data);

        const publicKey = event.pubkey;
        console.log('public key:', publicKey);

        const subscriptionSecretKey = generateSecretKey();
        const subscriptionPublicKey = getPublicKey(subscriptionSecretKey);
        console.log(
            'The game public and private keys. The winner will be able to log into this account and withdraw the funds',
            {
                subscriptionSecretKey: nip19.nsecEncode(subscriptionSecretKey),
                subscriptionPublicKey: nip19.npubEncode(subscriptionPublicKey),
            }
        );
        const signer = new NDKPrivateKeySigner(subscriptionSecretKey);

        // Decode the `npub` key to its raw hex format
        const receiverPubkey = 'npub1j4442yrhl9dfnxe68gk6jefachmmmd6a4e4p4t0s7fvck997r6gqkghe65';
        const { data: receiverHexPubkey } = { data: event.pubkey }; //nip19.decode(receiverPubkey);

        // Generate shared secret
        const sharedSecret = bytesToHex(
            nobleSecp256k1.getSharedSecret(subscriptionSecretKey, '02' + receiverHexPubkey, true)
        ).substring(2); // Strip prefix

        // Encrypt message
        const text = JSON.stringify(data);
        const iv = crypto.randomBytes(16); // Generate random IV
        const cipher = crypto.createCipheriv('aes-256-cbc', hexToBytes(sharedSecret), iv);
        let encryptedMessage = cipher.update(text, 'utf8', 'base64');
        encryptedMessage += cipher.final('base64');
        const ivBase64 = iv.toString('base64');
        const fullMessage = `${encryptedMessage}?iv=${ivBase64}`;

        // Publish encrypted message
        ndk.signer = signer;
        const dm = new NDKEvent(ndk, {
            pubkey: subscriptionPublicKey,
            kind: NDKKind.EncryptedDirectMessage,
            tags: [['p', receiverHexPubkey]],
            created_at: Math.floor(Date.now() / 1000),
            content: fullMessage,
        });

        console.log('Encrypted message published:', fullMessage);
        const note = new NDKEvent(ndk, {
            kind: NDKKind.Text,
            tags: [],
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify(data),
            pubkey: subscriptionPublicKey,
        });

        // publish msg and note
        await dm.publish();
        await note.publish().catch((err) => {
            console.error('Error publishing note:', err);
        });
    });

    notes.on('eose', () => {
        console.log('End of stream received.');
    });
})();

const createNote = () => {};
