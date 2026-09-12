import { decodeFunctionData, encodeFunctionData } from 'viem';
import { getAddress, registry } from './abi-registry.js';

var ABI = registry.contracts.JBRouterTerminalGateway;
var GATEWAY_NAMES = ['JBRouterTerminalGateway', 'JBRouterTerminalGateway_deprecated1', 'JBRouterTerminalGateway_deprecated'];

// This exception is for the deployed gateway's original, nonpayable retry calldata. A Safe's
// arbitrary destinations, delegatecalls and ordinary protocol calls retain their existing gas cap.
export function isPendingPaymentTransaction(chainId, tx) {
  try {
    if (!Number.isSafeInteger(Number(chainId)) || Number(chainId) <= 0 || !tx
        || Number(tx.operation == null ? 0 : tx.operation) !== 0 || BigInt(tx.value == null ? 0 : tx.value) !== 0n
        || typeof tx.to !== 'string' || !GATEWAY_NAMES.some(function (name) {
          var address = getAddress(name, chainId);
          return address && address.toLowerCase() === tx.to.toLowerCase();
        }) || typeof tx.data !== 'string' || tx.data.length > 10000 || !/^0x(?:[0-9a-f]{2})+$/i.test(tx.data)) return false;
    var decoded = decodeFunctionData({ abi: ABI, data: tx.data });
    if (!['processPendingCall', 'finalizePendingCall'].includes(decoded.functionName)) return false;
    var [id, call, memo, metadata] = decoded.args;
    if (BigInt(id) === 0n || call.amount === 0n || call.projectId === 0n || call.sourceProjectId === 0n || call.sourceProjectId >= (1n << 64n)
        || new TextEncoder().encode(memo).length > 4096 || !/^0x[0-9a-f]{64}$/i.test(metadata) || BigInt(metadata) !== call.sourceProjectId) return false;
    return encodeFunctionData({ abi: ABI, functionName: decoded.functionName, args: decoded.args }).toLowerCase() === tx.data.toLowerCase();
  } catch (_) { return false; }
}

export async function pendingPaymentTransactionGasCap(chainId, tx, client) {
  if (!isPendingPaymentTransaction(chainId, tx)) return null;
  if (client.chain && Number(client.chain.id) !== Number(chainId)) throw new Error('The pending payment RPC is on the wrong chain.');
  var block = await client.getBlock({ blockTag: 'latest' });
  if (!block || (typeof block.gasLimit !== 'bigint' && !(typeof block.gasLimit === 'number' && Number.isSafeInteger(block.gasLimit))
      && !(typeof block.gasLimit === 'string' && /^[1-9][0-9]*$/.test(block.gasLimit)))) throw new Error('The pending payment transaction gas limit could not be verified.');
  var limit = BigInt(block.gasLimit);
  if (limit <= 1500000n) throw new Error('The chain cannot supply the pending payment transaction gas reserve.');
  return limit < 16777216n ? limit : 16777216n;
}
