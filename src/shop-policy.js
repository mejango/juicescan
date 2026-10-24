import { decodeFunctionData } from 'viem';
import { getABI } from './abi-registry.js';
import { SAFE_EXEC_ABI, MULTI_SEND_CALL_ONLY, decodeMultiSend } from './safe-batch.js';

// Saved unsigned launch/add calls retain their original bytes. Refuse outdated economics before
// another authorization; callers reconcile already-submitted hashes before applying this policy.
export function assertNewTierPolicy(value) {
  if (!value || typeof value !== 'object') return;
  if (value.initialSupply != null && value.price != null && value.flags) {
    if (value.flags.useVotingUnits) throw new Error('This saved item uses custom voting units. Rebuild and review it with price-based governance.');
    if (BigInt(value.initialSupply) === 1n && BigInt(value.reserveFrequency || 0) > 0n) throw new Error('A reserved item needs a supply of at least 2 (or unlimited).');
  }
  Object.values(value).forEach(assertNewTierPolicy);
}


var shopCallAbi;
// Inspect the app's supported wrappers and canonical creation/adjustment ABIs only. Unknown ordinary
// calls retain their existing behavior. This policy is for new authority, never passive receipt/history reads.
export function assertShopCallPolicy(data, to, operation, depth) {
  if (!data || data === '0x') return;
  depth = depth || 0;
  if (depth > 8) throw new Error('This saved shop call has too many nested wrappers. Rebuild and review it.');
  if (String(to || '').toLowerCase() === MULTI_SEND_CALL_ONLY.toLowerCase()) {
    var calls = decodeMultiSend(data);
    if (!calls) throw new Error('The saved MultiSend shop calls could not be decoded. Rebuild and review them.');
    calls.forEach(function (call) { assertShopCallPolicy(call.data, call.to, call.operation, depth + 1); });
    return;
  }
  if (!shopCallAbi) shopCallAbi = ['JB721TiersHook', 'JB721TiersHookDeployer', 'JB721TiersHookProjectDeployer', 'JBOmnichainDeployer', 'REVDeployer', 'ERC2771Forwarder']
    .reduce(function (abi, name) { return abi.concat(getABI(name) || []); }, SAFE_EXEC_ABI);
  var decoded;
  try { decoded = decodeFunctionData({ abi: shopCallAbi, data: data }); }
  catch (_) { return; }
  assertNewTierPolicy(decoded.args);
  if (decoded.functionName === 'execTransaction') assertShopCallPolicy(decoded.args[2], decoded.args[0], decoded.args[3], depth + 1);
  if (decoded.functionName === 'execute') {
    var request = decoded.args[0];
    assertShopCallPolicy(request.data, request.to, 0, depth + 1);
  }
  if (decoded.functionName === 'executeBatch') decoded.args[0].forEach(function (request) { assertShopCallPolicy(request.data, request.to, 0, depth + 1); });
}
