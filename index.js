import NDK, { NDKEvent, NDKKind, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import WebSocket from 'ws';
import crypto from 'crypto';
import * as nobleSecp256k1 from '@noble/secp256k1';
// @ts-ignore
global.WebSocket = WebSocket;
(async () => {
    const ndk = new NDK({
        explicitRelayUrls: ['wss://relay.nostrdice.com'],
    });
    await ndk.connect();
    console.log('Connected to NDK');
    const notes = ndk.subscribe([{ kinds: [NDKKind.Text], '#t': ['gameCT'] }], { closeOnEose: false });
    await notes.start();
    notes.on('event', async (event) => {
        console.log('Received event:', event.content);
        const data = JSON.parse(event.content);
        console.log('game coin toss data:', data);
        const publicKey = event.pubkey;
        console.log('public key:', publicKey);
        const subscriptionSecretKey = generateSecretKey();
        const subscriptionPublicKey = getPublicKey(subscriptionSecretKey);
        const signer = new NDKPrivateKeySigner(subscriptionSecretKey);
        // Decode the `npub` key to its raw hex format
        const receiverPubkey = 'f0e986391b6644cad8f587d128a93dc74ed5c5ffdaa3f1e6bed002233f276e07';
        const { data: receiverHexPubkey } = nip19.decode(receiverPubkey);
        // Use the decoded hex public key
        const sharedPoint = nobleSecp256k1.getSharedSecret(subscriptionSecretKey, receiverHexPubkey);
        const sharedX = sharedPoint.slice(1, 33);
        const iv = crypto.randomFillSync(new Uint8Array(16));
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(sharedX), iv);
        const text = 'aasssssssssaa';
        let encryptedMessage = cipher.update(text, 'utf8', 'base64');
        encryptedMessage += cipher.final('base64');
        const ivBase64 = Buffer.from(iv.buffer).toString('base64');
        ndk.signer = signer;
        const dm = new NDKEvent(ndk, {
            pubkey: subscriptionPublicKey,
            kind: NDKKind.EncryptedDirectMessage,
            tags: [['p', receiverHexPubkey]],
            created_at: Math.floor(Date.now() / 1000),
            content: encryptedMessage + '?iv=' + ivBase64,
        });
        await dm.publish();
    });
    notes.on('eose', () => {
        console.log('End of stream received.');
    });
})();
