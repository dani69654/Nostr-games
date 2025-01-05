import WebSocket from 'ws';
import { connectNDK, subscribeToEvent } from './utils/nostr';
import { COINFLIP_NDK_FILTER, createCoinflip } from './modules/coinflip';
import http from 'http';

// @ts-ignore
global.WebSocket = WebSocket;

const main = async () => {
  const ndk = await connectNDK();
  console.log('🔌 Connected to NDK');

  subscribeToEvent(ndk, {
    filters: COINFLIP_NDK_FILTER,
    opts: { closeOnEose: false },
    onEvent: (game) => createCoinflip({ game, ndk }),
  });
};

// Add an HTTP server to bind to $PORT (required by Heroku)
const PORT = process.env.PORT || 3000; // Fallback to 3000 for local testing

http
  .createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Nostr Game backend is running!\n');
  })
  .listen(PORT, () => {
    main();
  });
