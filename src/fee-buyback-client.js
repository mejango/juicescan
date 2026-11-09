import { generationAddresses } from './abi-registry.js';
import { createPublicClientForChain } from './wallet.js';

export function feeBuybackContext(chainId, beneficiary) {
  var client = createPublicClientForChain(chainId);
  if (!client) throw new Error('Unsupported chain');
  var addresses = function (name) { return generationAddresses(name, chainId); };
  var terminals = addresses('JBMultiTerminal');
  return { client: client, options: {
    beneficiary: beneficiary, trustedHooks: addresses('JBBuybackHook'), terminals: terminals,
    controllers: addresses('JBController'), feePayers: terminals.concat(addresses('REVLoans')),
  } };
}
