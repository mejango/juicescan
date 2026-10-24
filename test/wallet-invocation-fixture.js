// Existing transaction fixtures replace wallet getters. Execute the production boundary against those
// same getters so added final checks remain real rather than becoming an unguarded mock send.
import { readFileSync } from 'node:fs';
import { getViewAs } from '../src/view-as.js';
const source = readFileSync(process.cwd() + '/src/wallet.js', 'utf8');
const boundary = source.slice(source.indexOf('export async function invokeWallet('), source.indexOf('\nexport function onWalletChange')).replace('export ', '');
const create = new Function('getWalletClient', 'getAccount', 'isSafeConnected', 'getViewAs', 'VIEW_AS_TX_ERROR', boundary + '\nreturn invokeWallet;');
export function walletInvocationFor(state) {
  return create(() => state.wallet, () => state.account, () => !!(state.safe ?? state.safeApp), () => state.view || getViewAs(), 'View as is read-only.');
}
