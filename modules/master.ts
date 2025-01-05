import dotenv from 'dotenv';
import { invariant } from '../utils/invariant';
import NDK, {
  NDKEvent,
  NDKKind,
  NDKPrivateKeySigner,
} from '@nostr-dev-kit/ndk';
import { connectNDK, note } from '../utils/nostr';
dotenv.config();

const MASTER_SK = process.env.MASTER_SK;
export const MASTER_PK = process.env.MASTER_PK;
export const MASTER_NEW_GAME_TAG = 'nostr-game-new';
export const MASTER_COMPLETED_GAME_TAG = 'nostr-game-completed';
export const MASTER_NDK_FILTER = [
  {
    kinds: [NDKKind.Text],
    '#t': [MASTER_NEW_GAME_TAG],
    since: Math.floor(Date.now() / 1000),
  },
];

export const initMaster = async () => {
  const ndk = await connectNDK();
  invariant(MASTER_SK, 'MASTER_SK is required');
  invariant(MASTER_PK, 'MASTER_PK is required');
  ndk.signer = new NDKPrivateKeySigner(MASTER_SK);
  return ndk;
};

export const newGameNote = async (args: { game: NDKEvent; master: NDK }) => {
  // remove Reply to this note with your ecash token to join! from the note
  const text = args.game.content.replace(
    'Reply to this note with your ecash token to join!',
    'Click on the link below to join the game!'
  );

  try {
    return await note(args.master, {
      text: `${text}

      https://primal.net/e/${args.game.id}

      https://snort.social/e/${args.game.id}`,
      pubkey: MASTER_PK!,
    });
  } catch (e) {
    console.error('Error creating new game note:', e);
  }
};
