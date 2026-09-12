import { getAddress } from './abi-registry.js';
import { createPublicClientForChain } from './wallet.js';

export function feeBuybackContext(chainId, beneficiary) {
  var client = createPublicClientForChain(chainId);
  if (!client) throw new Error('Unsupported chain');
  var addresses = function (name) {
    return [name, name + '_deprecated', name + '_deprecated1'].map(function (key) {
      try { return getAddress(key, chainId); } catch (_) { return null; }
    }).filter(Boolean);
  };
  var terminals = addresses('JBMultiTerminal');
  return { client: client, options: {
    beneficiary: beneficiary, trustedHooks: addresses('JBBuybackHook'), terminals: terminals,
    controllers: addresses('JBController'), feePayers: terminals.concat(addresses('REVLoans')),
  } };
}
