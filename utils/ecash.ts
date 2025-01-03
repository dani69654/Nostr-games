import { HDKey } from '@scure/bip32';
import bip39 from 'bip39';
import { getPublicKey } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { invariant } from './invariant';

const STANDARD_DERIVATION_PATH = `m/129372'/0'`;
const NOSTR_KEYS_PATH = `10101010`;

/**
 * Creates pk and sk pair
 * sats should be locked to pk and sk can be used to unlock them
 */
export const createKeyPair = () => {
  const counters = [0];
  let largest = -1;

  for (let i = 0; i < counters.length; i++) {
    if (counters[i] > largest) {
      largest = counters[i];
    }
  }

  largest++;

  const mnemonic = bip39.generateMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdkey = HDKey.fromMasterSeed(seed);
  const keysId = '0';
  const derivationPath = `${STANDARD_DERIVATION_PATH}/${NOSTR_KEYS_PATH}'/${keysId}'/${largest}`;
  const sk = hdkey.derive(derivationPath).privateKey;
  invariant(sk, 'Could not derive private key');
  const pk = getPublicKey(sk);
  console.log('res', {
    counter: largest,
    publicKey: '02' + pk,
    privateKey: bytesToHex(sk),
  });
  return { publicKey: '02' + pk, privateKey: bytesToHex(sk) };
};
