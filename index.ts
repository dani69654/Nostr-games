import WebSocket from 'ws';
import { connectNDK, subscribeToEvent } from './utils/nostr';
import { COINFLIP_NDK_FILTER, createCoinflip } from './modules/coinflip';
import http from 'http';
import { initMaster } from './modules/master';

// @ts-ignore
global.WebSocket = WebSocket;

const main = async () => {
  const ndk = await connectNDK();
  const master = await initMaster();
  console.log('🔌 Connected to NDK');
  subscribeToEvent(ndk, {
    filters: COINFLIP_NDK_FILTER,
    opts: { closeOnEose: false },
    onEvent: (game) => createCoinflip({ game, ndk, master }),
  });
};

const PORT = process.env.PORT || 3000;

http
  .createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Nostr Game backend is running!\n');
  })
  .listen(PORT, () => {
    main();
  });
