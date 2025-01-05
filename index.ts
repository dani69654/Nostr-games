import WebSocket from 'ws';
import { connectNDK, subscribeToEvent } from './utils/nostr';
import { COINFLIP_NDK_FILTER, createCoinflip } from './modules/coinflip';

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
