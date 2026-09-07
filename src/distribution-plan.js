import { quotedOutputFloor } from './slippage.js';
import { decodeEventLog, decodeFunctionData, parseAbi, toEventSelector, toFunctionSelector } from 'viem';

// V6 IJBController, IJBTokens, IJBPayoutTerminal and JBPayoutSplitGroupLib. The payout library
// runs by delegatecall, so its events must be emitted by the reviewed terminal.
var SPLIT = '(uint32 percent,uint64 projectId,address beneficiary,bool preferAddToBalance,uint48 lockedUntil,address hook)';
export var DISTRIBUTION_RECEIPT_ABI = parseAbi([
  'event ReservedDistributionReverted(uint256 indexed projectId,' + SPLIT + ' split,uint256 tokenCount,bytes reason,address caller)',
  'event SplitHookReverted(uint256 indexed projectId,address hook,bytes reason,address caller)',
  'event SendReservedTokensToSplit(uint256 indexed projectId,uint256 indexed rulesetId,uint256 indexed groupId,' + SPLIT + ' split,uint256 tokenCount,address caller)',
  'event SendReservedTokensToSplits(uint256 indexed rulesetId,uint256 indexed rulesetCycleNumber,uint256 indexed projectId,address owner,uint256 tokenCount,uint256 leftoverAmount,address caller)',
  'event Burn(address indexed holder,uint256 indexed projectId,uint256 count,uint256 creditBalance,uint256 tokenBalance,address caller)',
  'event PayoutReverted(uint256 indexed projectId,' + SPLIT + ' split,uint256 amount,bytes reason,address caller)',
  'event PayoutTransferReverted(uint256 indexed projectId,address addr,address token,uint256 amount,uint256 fee,bytes reason,address caller)',
  'event SendPayoutToSplit(uint256 indexed projectId,uint256 indexed rulesetId,uint256 indexed group,' + SPLIT + ' split,uint256 amount,uint256 netAmount,address caller)',
  'event SendPayouts(uint256 indexed rulesetId,uint256 indexed rulesetCycleNumber,uint256 indexed projectId,address projectOwner,uint256 amount,uint256 amountPaidOut,uint256 fee,uint256 netLeftoverPayoutAmount,address caller)',
]);
var DISTRIBUTION_TOPICS = new Set(DISTRIBUTION_RECEIPT_ABI.map(toEventSelector));

function incompleteDistribution(message) {
  var error = new Error(message + ' The transaction is confirmed, but the distribution is incomplete. Keep its saved receipt and inspect the affected recipients before starting another distribution.');
  error.code = 'DISTRIBUTION_INCOMPLETE';
  return error;
}

// A successful transaction can catch failed splits or burn unconsumed reserved tokens. Verify its
// destination effects before any receipt journal clears or a saved round advances.
export function verifyDistributionReceipt(call, receipt) {
  var reserved = call.functionName === 'sendReservedTokensToSplitsOf';
  if (!reserved && call.functionName !== 'sendPayoutsOf') throw new Error('The saved distribution call is not recognized.');
  if (!receipt || receipt.status !== 'success' || !Array.isArray(receipt.logs)) throw new Error('The distribution receipt and its logs are not verified yet.');
  var projectId = BigInt(call.args[0]);
  var tokens = reserved && call.validation && call.validation.tokens;
  var sender = call.validation && call.validation.sender;
  if (!/^0x[0-9a-f]{40}$/i.test(sender || '')) throw new Error('The saved distribution is missing its original sender. Keep its receipt for verification.');
  if (reserved && !/^0x[0-9a-f]{40}$/i.test(tokens || '')) throw new Error('The saved reserved distribution is missing its token-manager address. Keep its receipt for verification.');
  var finished = false, pendingBurn = 0n;
  for (var log of receipt.logs) {
    var fromTarget = sameAddress(log.address, call.to);
    if (!fromTarget && !(reserved && sameAddress(log.address, tokens))) continue;
    if (!Array.isArray(log.topics) || !DISTRIBUTION_TOPICS.has(String(log.topics[0]).toLowerCase())) continue;
    var decoded;
    try { decoded = decodeEventLog({ abi: DISTRIBUTION_RECEIPT_ABI, data: log.data, topics: log.topics, strict: true }); }
    catch (_) { throw new Error('A distribution receipt event could not be decoded. Keep its saved receipt for verification.'); }
    var args = decoded.args;
    if (args.projectId !== projectId) continue;
    if (reserved) {
      if (decoded.eventName === 'Burn' && sameAddress(log.address, tokens) && sameAddress(args.holder, call.to) && sameAddress(args.caller, call.to)) {
        pendingBurn += args.count;
      }
      if (!fromTarget) continue;
      if (!sameAddress(args.caller, sender)) {
        // A nested distribution finishes each of its burn/split pairs before returning to this call.
        if (decoded.eventName === 'SendReservedTokensToSplit') pendingBurn = 0n;
        continue;
      }
      if (decoded.eventName === 'ReservedDistributionReverted') throw incompleteDistribution('A reserved-token project payment reverted and used its fallback recipient.');
      if (decoded.eventName === 'SplitHookReverted') throw incompleteDistribution('A reserved-token split hook reverted.');
      if (decoded.eventName === 'SendReservedTokensToSplit') {
        if (pendingBurn > 0n && !sameAddress(args.split.hook, '0x0000000000000000000000000000000000000000')) {
          throw incompleteDistribution('A reserved-token split hook left tokens unconsumed and those tokens were burned.');
        }
        // A hook-free split to 0xdead deliberately burns its allocation.
        if (pendingBurn > 0n && !(args.split.projectId === 0n && sameAddress(args.split.beneficiary, '0x000000000000000000000000000000000000dead') && pendingBurn === args.tokenCount)) {
          throw incompleteDistribution('Reserved tokens were burned without a matching reviewed burn split.');
        }
        pendingBurn = 0n;
      }
      if (decoded.eventName === 'SendReservedTokensToSplits') finished = true;
    } else if (fromTarget) {
      if (!sameAddress(args.caller, sender)) continue;
      if (decoded.eventName === 'PayoutReverted') throw incompleteDistribution('A payout split reverted and its amount returned to the project balance.');
      if (decoded.eventName === 'PayoutTransferReverted' && sameAddress(args.token, call.args[1])) throw incompleteDistribution('The payout to the project owner reverted.');
      if (decoded.eventName === 'SendPayoutToSplit' && args.group === BigInt(call.args[1])) {
        // The local V6 fee floors amount *25/1000. A larger shortfall is partial delivery, not a fee.
        if (args.netAmount > args.amount || args.netAmount < args.amount - args.amount / 40n) {
          throw incompleteDistribution('A payout recipient received less than its allocation after the maximum terminal fee.');
        }
      }
      if (decoded.eventName === 'SendPayouts') finished = true;
    }
  }
  if (pendingBurn > 0n) throw incompleteDistribution('Reserved-token burns could not be matched to an intentional burn split.');
  if (!finished) throw new Error('The distribution completion event is missing. Keep the saved receipt and verify its destination effects.');
  return true;
}

// Queued Safe rows and persisted raw Relayr bindings keep exact inner calldata even after the
// originating UI closes. Reconstruct these checks from that calldata, never from a new form.
var DISTRIBUTION_CALL_ABI = parseAbi([
  'function sendReservedTokensToSplitsOf(uint256 projectId) returns (uint256)',
  'function sendPayoutsOf(uint256 projectId,address token,uint256 amount,uint256 currency,uint256 minTokensPaidOut) returns (uint256)',
]);
export function distributionCallFromTransaction(tx, sender) {
  var decoded;
  try { decoded = decodeFunctionData({ abi: DISTRIBUTION_CALL_ABI, data: tx.data }); } catch (_) { return null; }
  if (Number(tx.operation || 0) !== 0) throw new Error('A delegated distribution cannot be verified as a project call. Keep its saved receipt.');
  return { to: tx.to, data: tx.data, functionName: decoded.functionName, args: decoded.args, validation: { sender: sender } };
}
export async function readDistributionTokens(client, controller) {
  var raw = await client.request({ method: 'eth_call', params: [{ to: controller, data: toFunctionSelector('TOKENS()'), gas: '0x30d40' }, 'latest'] });
  if (typeof raw !== 'string' || !/^0x0{24}[0-9a-f]{40}$/i.test(raw)) throw new Error('The original controller token manager could not be verified. Keep its saved receipt.');
  return '0x' + raw.slice(-40);
}
export async function verifyQueuedDistributionReceipt(tx, sender, receipt, readTokens) {
  var call = distributionCallFromTransaction(tx, sender);
  if (!call) return true;
  // JBController.TOKENS is immutable; read it from the reviewed controller address, not the
  // project's possibly changed current controller. This also works after a hosted queue row disappears.
  if (call.functionName === 'sendReservedTokensToSplitsOf') call.validation.tokens = await readTokens(call.to);
  return verifyDistributionReceipt(call, receipt);
}

function sameAddress(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }

export function assertPayoutDistributionFresh(request, live) {
  var name = request.chainName || String(request.chainId);
  if (!live || BigInt(live.projectId) !== BigInt(request.projectId)
      || !sameAddress(live.terminal, request.terminal) || !sameAddress(live.token, request.token)
      || !sameAddress(live.controller, request.controller)
      || Number(live.decimals) !== Number(request.decimals)
      || BigInt(live.accountingCurrency) !== BigInt(request.accountingCurrency)
      || BigInt(live.rulesetId) !== BigInt(request.rulesetId)
      || BigInt(live.cycleNumber) !== BigInt(request.cycleNumber)) {
    throw new Error('The payout configuration changed on ' + name + '. Reload its amounts before submitting.');
  }
  var amount = BigInt(request.amount);
  var limit = (live.limits || []).find(function (row) { return BigInt(row.currency) === BigInt(request.currency); });
  if (amount <= 0n) throw new Error('Enter a positive payout amount on ' + name + '.');
  if (!limit || amount > BigInt(limit.remaining)) throw new Error('The payout limit no longer covers this amount on ' + name + '.');
  if (amount > BigInt(limit.available)) throw new Error('The terminal balance or price no longer covers this payout on ' + name + '.');
}

// Each intent keeps its own token, decimal scale, currency and lower bound. Validate every destination
// before signing the group; a failed quote never turns into a zero-minimum payout.
export async function preparePayoutDistributions(requests, readLive, simulate) {
  var calls = [];
  for (var request of requests) {
    var live = await readLive(request.chainId);
    assertPayoutDistributionFresh(request, live);
    var args = [BigInt(request.projectId), request.token, BigInt(request.amount), BigInt(request.currency), 0n];
    var quoted = BigInt(await simulate(request, args));
    if (quoted <= 0n) throw new Error('This payout would send no tokens on ' + (request.chainName || request.chainId) + '.');
    var minOut = BigInt(request.currency) === BigInt(request.accountingCurrency) ? quoted : quotedOutputFloor(quoted);
    args[4] = minOut;
    calls.push(Object.assign({}, request, { args: args, quoted: quoted, minOut: minOut }));
  }
  return calls;
}

export async function prepareReservedDistributions(chains, readLive) {
  var calls = [];
  for (var chain of chains) {
    var live = await readLive(Number(chain.id));
    if (!live || !live.controller || BigInt(live.projectId) <= 0n) throw new Error('Could not verify the project on ' + chain.name + '.');
    if (BigInt(live.pending) <= 0n) throw new Error('Nothing is pending on ' + chain.name + '. Deselect that chain or reload its balance.');
    calls.push({ chainId: Number(chain.id), chainName: chain.name, projectId: BigInt(live.projectId),
      controller: live.controller, tokens: live.tokens, pending: BigInt(live.pending), args: [BigInt(live.projectId)] });
  }
  return calls;
}
