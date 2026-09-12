import { decodeEventLog, encodeAbiParameters, encodeFunctionData, keccak256, stringToHex, toEventSelector } from 'viem';
import { registry } from './abi-registry.js';

// Use the generated deployment ABI for the tuple, calls and receipt events. Retried payments
// remain gateway custody until a matching settlement or refund event proves otherwise.
var ABI = registry.contracts.JBRouterTerminalGateway;
var CALL_TYPE = ABI.find(function (entry) { return entry.name === 'processPendingCall'; }).inputs[1];
var RECEIPT_EVENTS = ABI.filter(function (entry) {
  return entry.type === 'event' && ['JBRouterTerminalGateway_ProcessPendingCall', 'JBRouterTerminalGateway_RefundPendingCall', 'JBRouterTerminalGateway_RecordTerminalCallFailure'].includes(entry.name);
});
var RECEIPT_TOPICS = new Set(RECEIPT_EVENTS.map(toEventSelector));
var ZERO_HASH = '0x' + '0'.repeat(64);
var GAS_EXHAUSTED = keccak256(stringToHex('JBRouterTerminalGateway: gas exhausted'));
var TRANSACTION_GAS_CAP = 16777216n;
var TRANSACTION_GAS_RESERVE = 1500000n;
var PAGE_SIZE = 250;

export var PENDING_PAYMENTS_QUERY = `query PendingPayments($chainId: Int!, $sourceProjectId: Int!, $version: Int!, $limit: Int!, $offset: Int!) {
  routerPendingCalls(where: {chainId: $chainId, sourceProjectId: $sourceProjectId, version: $version, status_in: [queued, retried], retainedAmount_gt: "0"}, orderBy: "pendingCallId", orderDirection: "asc", limit: $limit, offset: $offset) {
    totalCount
    items { chainId version gateway pendingCallId projectId sourceProjectId token amount retainedAmount preferAddToBalance shouldReturnHeldFees beneficiary refundTo memo metadata callCommitment status }
  }
}`;

function uint(value, name, bits = 256) {
  if (typeof value !== 'bigint' && !(typeof value === 'number' && Number.isSafeInteger(value)) && !(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value))) throw new Error('Invalid pending payment ' + name + '.');
  var result = BigInt(value);
  if (result < 0n || result >= (1n << BigInt(bits))) throw new Error('Invalid pending payment ' + name + '.');
  return result;
}
function positiveInt(value, name) {
  var result = uint(value, name, 53);
  if (result === 0n) throw new Error('Invalid pending payment ' + name + '.');
  return Number(result);
}
function hex(value, bytes, name) {
  if (typeof value !== 'string' || !(bytes == null ? /^0x(?:[0-9a-f]{2})*$/i : new RegExp('^0x[0-9a-f]{' + bytes * 2 + '}$', 'i')).test(value)) throw new Error('Invalid pending payment ' + name + '.');
  return value.toLowerCase();
}
function callTuple(row) {
  return { amount: uint(row.amount, 'amount'), preferAddToBalance: row.preferAddToBalance,
    shouldReturnHeldFees: row.shouldReturnHeldFees, beneficiary: hex(row.beneficiary, 20, 'beneficiary'),
    projectId: uint(row.projectId, 'destination project'), refundTo: hex(row.refundTo, 20, 'refund terminal'),
    sourceProjectId: uint(row.sourceProjectId, 'source project'), token: hex(row.token, 20, 'token') };
}
function commitmentOf(call, memo, metadata) {
  return keccak256(encodeAbiParameters([CALL_TYPE, { type: 'string' }, { type: 'bytes' }], [call, memo, metadata]));
}
function normalizeRow(row) {
  if (!row || typeof row !== 'object' || typeof row.preferAddToBalance !== 'boolean' || typeof row.shouldReturnHeldFees !== 'boolean'
      || typeof row.memo !== 'string' || new TextEncoder().encode(row.memo).length > 4096
      || !['queued', 'retried'].includes(row.status)) throw new Error('The indexed pending payment is incomplete.');
  var result = { chainId: positiveInt(row.chainId, 'chain'), version: positiveInt(row.version, 'version'),
    gateway: hex(row.gateway, 20, 'gateway'), pendingCallId: hex(row.pendingCallId, 32, 'identifier'),
    projectId: positiveInt(row.projectId, 'destination project'), sourceProjectId: positiveInt(row.sourceProjectId, 'source project'),
    token: hex(row.token, 20, 'token'), amount: uint(row.amount, 'amount'), retainedAmount: uint(row.retainedAmount, 'retained amount'),
    preferAddToBalance: row.preferAddToBalance, shouldReturnHeldFees: row.shouldReturnHeldFees,
    beneficiary: hex(row.beneficiary, 20, 'beneficiary'), refundTo: hex(row.refundTo, 20, 'refund terminal'),
    memo: row.memo, metadata: hex(row.metadata, 32, 'metadata'), callCommitment: hex(row.callCommitment, 32, 'commitment'), status: row.status };
  if (result.version !== 6 || result.amount === 0n || result.retainedAmount !== result.amount || result.pendingCallId === ZERO_HASH
      || result.gateway === '0x' + '0'.repeat(40) || BigInt(result.metadata) !== BigInt(result.sourceProjectId)
      || result.callCommitment !== commitmentOf(callTuple(result), result.memo, result.metadata)) {
    throw new Error('The indexed pending payment does not match its original call commitment.');
  }
  return result;
}

export function pendingPaymentKey(row) {
  return positiveInt(row.chainId, 'chain') + ':' + hex(row.gateway, 20, 'gateway') + ':' + hex(row.pendingCallId, 32, 'identifier');
}

// No partial result is usable for "all pending": detect changed counts, repeated pages and
// cross-project responses before returning any rows to the action builder.
export async function fetchPendingPaymentRows(contexts, query) {
  if (!Array.isArray(contexts) || typeof query !== 'function') throw new Error('Pending payment project contexts are missing.');
  var seenContexts = new Set(), all = [];
  for (var context of contexts) {
    var chainId = positiveInt(context.chainId, 'chain'), sourceProjectId = positiveInt(context.sourceProjectId, 'source project');
    var version = positiveInt(context.version == null ? 6 : context.version, 'version');
    if (version !== 6) throw new Error('Pending routing is only available for V6 projects.');
    var contextKey = chainId + ':' + sourceProjectId + ':' + version;
    if (seenContexts.has(contextKey)) continue;
    seenContexts.add(contextKey);
    var offset = 0, total = null, seenRows = new Set(), rows = [];
    do {
      var data = await query(PENDING_PAYMENTS_QUERY, { chainId, sourceProjectId, version, limit: PAGE_SIZE, offset });
      var page = data && data.routerPendingCalls;
      if (!page || !Array.isArray(page.items) || !Number.isSafeInteger(page.totalCount) || page.totalCount < 0
          || page.totalCount > 10000 || page.items.length > PAGE_SIZE || (total !== null && total !== page.totalCount)) {
        throw new Error('The pending payment list is incomplete or changed while loading. Refresh before batching.');
      }
      total = page.totalCount;
      for (var item of page.items) {
        var row = normalizeRow(item), key = pendingPaymentKey(row);
        if (row.chainId !== chainId || row.sourceProjectId !== sourceProjectId || row.version !== version || seenRows.has(key)) {
          throw new Error('The pending payment list contains a repeated or unrelated call. Refresh before batching.');
        }
        seenRows.add(key); rows.push(row);
      }
      offset += page.items.length;
      if (offset > total || (!page.items.length && offset < total)) throw new Error('The pending payment list is incomplete. Refresh before batching.');
    } while (offset < total);
    all.push(...rows);
  }
  return all;
}

async function requireGateway(row, knownGateway) {
  var recognized = typeof knownGateway === 'function' ? await knownGateway(row.gateway, row.chainId)
    : (Array.isArray(knownGateway) ? knownGateway : [knownGateway]).some(function (address) { return typeof address === 'string' && address.toLowerCase() === row.gateway; });
  if (recognized !== true) throw new Error('This pending payment gateway is not a recognized deployment on this chain.');
}
function failureState(value) {
  if (!value || typeof value !== 'object') throw new Error('The pending payment failure state could not be read.');
  return { errorHash: hex(value.errorHash == null ? value[0] : value.errorHash, 32, 'failure hash'),
    count: Number(uint(value.count == null ? value[1] : value.count, 'failure count', 32)),
    lastFailureAt: uint(value.lastFailureAt == null ? value[2] : value.lastFailureAt, 'failure time', 48),
    highestGasLimit: uint(value.highestGasLimit == null ? value[3] : value.highestGasLimit, 'previous gas', 64) };
}

export async function readPendingPayment(indexedRow, { client, knownGateway }) {
  var row = normalizeRow(indexedRow);
  await requireGateway(row, knownGateway);
  if (client.chain && Number(client.chain.id) !== row.chainId) throw new Error('The pending payment RPC is on the wrong chain.');
  var block = await client.getBlock();
  var blockNumber = uint(block.number, 'block number'), timestamp = uint(block.timestamp, 'block timestamp');
  function read(functionName, args = []) { return client.readContract({ address: row.gateway, abi: ABI, functionName, args, blockNumber }); }
  var commitment = hex(await read('pendingCallCommitmentOf', [row.pendingCallId]), 32, 'live commitment');
  if (commitment === ZERO_HASH) return null;
  if (commitment !== row.callCommitment) throw new Error('The pending payment no longer matches the gateway commitment. Refresh before retrying.');
  var [storedFailure, baseGas, maximumGas, retryDelay, finalizationCount] = await Promise.all([
    read('pendingCallFailureOf', [row.pendingCallId]), read('QUALIFIED_CALL_GAS'), read('maximumQualifiedCallGas'), read('RETRY_DELAY'), read('FINALIZATION_FAILURE_COUNT'),
  ]);
  var failure = failureState(storedFailure);
  baseGas = uint(baseGas, 'qualified gas'); maximumGas = uint(maximumGas, 'maximum gas');
  retryDelay = uint(retryDelay, 'retry delay'); finalizationCount = uint(finalizationCount, 'finalization count');
  var cap = uint(block.gasLimit, 'block gas limit');
  if (cap > TRANSACTION_GAS_CAP) cap = TRANSACTION_GAS_CAP;
  var executable = cap > TRANSACTION_GAS_RESERVE ? (cap - TRANSACTION_GAS_RESERVE) * 63n / 64n : 0n;
  if (baseGas !== 5000000n || retryDelay !== 86400n || finalizationCount !== 3n || maximumGas !== executable || maximumGas < baseGas
      || (failure.count === 0 && (failure.errorHash !== ZERO_HASH || failure.lastFailureAt !== 0n || failure.highestGasLimit !== 0n))
      || (failure.count > 0 && (failure.errorHash === ZERO_HASH || failure.lastFailureAt === 0n || failure.highestGasLimit < baseGas))) {
    throw new Error('The gateway retry configuration or failure state could not be verified.');
  }
  var qualifiedGas = baseGas * (failure.errorHash === GAS_EXHAUSTED ? BigInt(failure.count) + 1n : 1n);
  if (qualifiedGas < failure.highestGasLimit) qualifiedGas = failure.highestGasLimit;
  if (qualifiedGas > maximumGas) qualifiedGas = maximumGas;
  var gas = (qualifiedGas * 64n + 62n) / 63n + TRANSACTION_GAS_RESERVE;
  if (gas > cap) throw new Error('This chain cannot supply the pending payment retry gas.');
  var nextAttemptAt = failure.count ? failure.lastFailureAt + retryDelay : 0n;
  var eligible = timestamp >= nextAttemptAt, finalizes = BigInt(failure.count) >= finalizationCount;
  var functionName = finalizes ? 'finalizePendingCall' : 'processPendingCall';
  var abi = ABI.filter(function (entry) { return entry.type === 'function' && entry.name === functionName; });
  var args = [row.pendingCallId, callTuple(row), row.memo, row.metadata];
  var descriptor = eligible ? { chainId: row.chainId, to: row.gateway, abi, functionName, args,
    data: encodeFunctionData({ abi, functionName, args }), value: 0n, gas,
    expectedState: { pendingPayment: true, commitment, failure }, pendingPayment: row } : null;
  return { row, commitment, failureCount: failure.count, nextAttemptAt, eligible, finalizes, gas, qualifiedGas, descriptor };
}

export async function preparePendingPayment(row, dependencies) {
  var state = await readPendingPayment(row, dependencies);
  if (state && !state.eligible) throw new Error('This payment is still in its retry cooldown. Refresh after its next attempt time.');
  return state && state.descriptor;
}

function assertDescriptor(descriptor) {
  var row = normalizeRow(descriptor && descriptor.pendingPayment);
  var expected = descriptor.expectedState;
  if (!expected || expected.pendingPayment !== true || expected.commitment !== row.callCommitment
      || !['processPendingCall', 'finalizePendingCall'].includes(descriptor.functionName)
      || Number(descriptor.chainId) !== row.chainId || hex(descriptor.to, 20, 'destination') !== row.gateway
      || uint(descriptor.value == null ? 0 : descriptor.value, 'transaction value') !== 0n) throw new Error('The saved pending payment does not match its reviewed call.');
  var args = [row.pendingCallId, callTuple(row), row.memo, row.metadata];
  var encoded = encodeFunctionData({ abi: ABI, functionName: descriptor.functionName, args });
  if (descriptor.data !== encoded || encodeFunctionData({ abi: ABI, functionName: descriptor.functionName, args: descriptor.args }) !== encoded) throw new Error('The saved pending payment calldata changed.');
  return row;
}

export async function reverifyPendingPayment(descriptor, dependencies) {
  var row = assertDescriptor(descriptor), fresh = await preparePendingPayment(row, dependencies);
  if (!fresh) throw new Error('This payment has already been settled or refunded. Refresh before starting another attempt.');
  var oldFailure = failureState(descriptor.expectedState.failure), newFailure = fresh.expectedState.failure;
  if (fresh.functionName !== descriptor.functionName || oldFailure.errorHash !== newFailure.errorHash || oldFailure.count !== newFailure.count
      || oldFailure.lastFailureAt !== newFailure.lastFailureAt || oldFailure.highestGasLimit !== newFailure.highestGasLimit
      || uint(descriptor.gas, 'reviewed gas') !== fresh.gas) throw new Error('The pending payment retry state changed. Review the refreshed call before continuing.');
  return fresh;
}

// Only use this after the transaction journal proves the reviewed call was never published.
// It preserves the original payment while allowing the caller to review a new retry state.
export async function refreshPendingPayment(descriptor, dependencies) {
  return preparePendingPayment(assertDescriptor(descriptor), dependencies);
}

export function pendingPaymentReceiptOutcome(descriptor, receipt) {
  var row = assertDescriptor(descriptor);
  if (!receipt || receipt.status !== 'success' || !Array.isArray(receipt.logs)) throw new Error('The pending payment receipt is not verified yet.');
  var outcome = null;
  for (var log of receipt.logs) {
    if (String(log.address).toLowerCase() !== row.gateway || !Array.isArray(log.topics) || !RECEIPT_TOPICS.has(log.topics[0])
        || String(log.topics[1]).toLowerCase() !== row.pendingCallId) continue;
    if (log.removed) throw new Error('The pending payment receipt was removed from the chain.');
    var event;
    try { event = decodeEventLog({ abi: RECEIPT_EVENTS, data: log.data, topics: log.topics, strict: true }); }
    catch (_) { throw new Error('The pending payment receipt event could not be verified.'); }
    if (outcome) throw new Error('The pending payment receipt contains conflicting outcomes.');
    if (event.eventName === 'JBRouterTerminalGateway_RecordTerminalCallFailure') {
      var args = event.args;
      // A queued Safe call may execute days after review, with other keepers having retried in
      // between. The authenticated gateway event proves the current result, not the old counter.
      if (!args.count || args.errorHash === ZERO_HASH || args.nextAttemptAt <= 0n) throw new Error('The pending payment failure event is malformed.');
      outcome = { status: 'pending', failureCount: Number(args.count), nextAttemptAt: args.nextAttemptAt, errorHash: args.errorHash };
    } else {
      if (commitmentOf(event.args.call, row.memo, row.metadata) !== row.callCommitment) throw new Error('The pending payment receipt refers to a different original call.');
      var refunded = event.eventName === 'JBRouterTerminalGateway_RefundPendingCall';
      if (refunded && descriptor.functionName !== 'finalizePendingCall') throw new Error('The retry receipt unexpectedly reports a refund.');
      outcome = { status: refunded ? 'refunded' : 'settled', beneficiaryTokenCount: refunded ? 0n : event.args.beneficiaryTokenCount };
    }
  }
  if (!outcome) throw new Error('The receipt does not prove a pending payment attempt. Keep its saved transaction for verification.');
  return outcome;
}
