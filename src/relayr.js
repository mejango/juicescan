// src/relayr.js
// Cross-chain transaction submission via relayr (the permissionless Bananapus relay), modelled on the
// revnet-app / juice-sdk-v4 flow. Each per-chain call is wrapped as an ERC-2771 meta-transaction:
// the operator signs an OpenZeppelin ForwardRequest, we encode `ERC2771Forwarder.execute(req)`, and
// relayr executes that on every chain after a single prepaid payment.
//
// Flow:
//   1. buildForwardedTx(chainId, from, to, data)  -> signs ForwardRequest, returns {chain, target, data, value}
//   2. relayrPostBundle(transactions)             -> POST /v1/bundle/prepaid -> { bundle_uuid, payment_info }
//   3. relayrPay(payment)                         -> one onchain payment funds all chains
//   4. relayrPoll(uuid, onUpdate)                 -> GET /v1/bundle/{uuid} until every tx is complete
//
// No API key. Host confirmed from juice-sdk-v4: https://api.relayr.ba5ed.com

import { encodeFunctionData, isAddress, keccak256, stringToHex } from 'viem';
import { getWalletClient, getAccount, createPublicClientForChain, getAddress, switchChain, getViewAs, VIEW_AS_TX_ERROR, waitForTrackedTransactionReceipt, confirmTransactionModal } from './component-base.js';
import { CHAINS, chainNameFor } from './chain.js';
import { gasWithHeadroom } from './gas.js';
import { decodeSafeExecRelayrTx, hasExactSafeExecutionSuccess, readSafeUintBounded } from './safe.js';

var RELAYR_API = 'https://api.relayr.ba5ed.com';
var RELAYR_PENDING_PREFIX = 'jb-relayr-pending-v1:';
var RELAYR_QUOTE_TIMEOUT_MS = 45 * 1000;
var RELAYR_STATUS_REQUEST_TIMEOUT_MS = 15 * 1000;
// Consecutive 404s that prove the uuid was never Relayr's rather than a single blip from the gateway.
var RELAYR_NOT_FOUND_ATTEMPTS = 3;
var RELAYR_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var RELAYR_KNOWN_QUOTES = new Map();
var RELAYR_QUOTED_REQUESTS = new Map();
var RELAYR_SIGNED_FORWARD_REQUESTS = new Map();
var RELAYR_NONCE_RESERVATIONS_KEY = 'jb-relayr-forwarder-nonces-v1';
var RELAYR_PUBLICATION_LOCK = {};

// Exact quotes remain in memory only. After reload the durable marker prevents fresh signatures, while
// callers explain that an unpaid quote cannot be reconstructed automatically from its fingerprints.
export function relayrResumeQuotedBundle(scope) {
  var session = loadRelayrPendingSession(scope);
  if (!session || session.paymentState !== 'quoted') return null;
  var quote = RELAYR_KNOWN_QUOTES.get(relayrPendingStorageKey(scope, session));
  return quote && quote.bundle_uuid === session.bundleUuid ? quote : null;
}

// Called inside the payment Web Lock immediately before persisting the sending marker. A second review
// of the same bundle must not overwrite a payment that another window already submitted.
export function requireUnpaidRelayrSession(scope, bundleUuid) {
  var session = loadRelayrPendingSession(scope);
  if (!session || session.bundleUuid !== bundleUuid || session.paymentState !== 'quoted' || session.paymentHash) {
    var pending = new Error('This Relayr payment is already pending or its saved quote changed. Check the original request before paying again.');
    pending.code = 'RELAYR_PENDING_CONFLICT'; throw pending;
  }
  return session;
}

// Relayr's prepaid-native payment endpoint is deliberately pinned client-side. A quote is an untrusted HTTP
// response: accepting an arbitrary `target` + `calldata` here would turn a compromised API into a wallet
// transaction oracle (for example, an ERC-20 approve disguised as "Pay & execute"). The same immutable runtime
// is deployed at this address on all eight supported mainnet/Sepolia payment chains. Its sole entry point receives the
// quote's bytes16 bundle UUID and uint40 deadline, forwards msg.value to Relayr's fixed receiver, and emits the
// payment event. Keep the code hash, address, selector, and exact two-word calldata schema frozen together.
export var RELAYR_PAYMENT_ADDRESS = '0x1c05f7841379d4393574c0ffa17908ec40ffd97d';
export var RELAYR_PAYMENT_SELECTOR = '0x103903a7';
export var RELAYR_PAYMENT_CODE_HASH = '0x6006b5acadb4cd60aa5c00cb844c34563e182dff83d4f4ff4fde226f7df16fa6';
export var RELAYR_NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
var RELAYR_MAINNET_CHAINS = new Set([1, 10, 8453, 42161]);
var RELAYR_TESTNET_CHAINS = new Set([11155111, 11155420, 84532, 421614]);
// Payment deployments are authenticated independently by the frozen runtime above on every send.
var RELAYR_PAYMENT_CHAINS = new Set([...RELAYR_MAINNET_CHAINS, ...RELAYR_TESTNET_CHAINS]);
export function relayrSupportsChain(chainId) {
  return Number.isSafeInteger(Number(chainId)) && (RELAYR_MAINNET_CHAINS.has(Number(chainId)) || RELAYR_TESTNET_CHAINS.has(Number(chainId)));
}

function relayrNetworkFamily(chainIds) {
  if (!Array.isArray(chainIds) || !chainIds.length || !chainIds.every(relayrSupportsChain)) return null;
  if (chainIds.every(function (id) { return RELAYR_MAINNET_CHAINS.has(Number(id)); })) return 'mainnet';
  if (chainIds.every(function (id) { return RELAYR_TESTNET_CHAINS.has(Number(id)); })) return 'testnet';
  return null;
}

// Ordinary forwarded bundles have one independent request per supported destination. Multiple requests
// for the same sender on one chain would otherwise sign the same live forwarder nonce.
export function relayrSupportsChains(chainIds) {
  return !!relayrNetworkFamily(chainIds)
    && new Set(chainIds.map(Number)).size === chainIds.length;
}
var RELAYR_PAYMENT_GAS = 150000n;
var RELAYR_PAYMENT_CODE_MAX_BYTES = 2048;

function relayrDeadlineSeconds(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    var numeric = Number(value);
    if (Number.isSafeInteger(numeric) && numeric >= 0) return numeric;
  }
  var milliseconds = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  return Math.floor(milliseconds / 1000);
}

// Decode and authenticate the complete payment schema against the quote we just requested. Exported so the
// boundary stays regression-testable without a wallet or DOM.
export function relayrPaymentDetails(payment, expectedBundleUuid, nowSeconds) {
  var chainId = Number(payment && payment.chain);
  if (!Number.isSafeInteger(chainId) || !RELAYR_PAYMENT_CHAINS.has(chainId) || !CHAINS[chainId]) {
    throw new Error('Relayr returned an unsupported payment chain.');
  }
  if (!payment || !isAddress(payment.target, { strict: false }) || payment.target.toLowerCase() !== RELAYR_PAYMENT_ADDRESS) {
    throw new Error('Relayr returned an unrecognized payment contract.');
  }
  if (String(payment.token || '').toLowerCase() !== RELAYR_NATIVE_TOKEN) {
    throw new Error('Relayr returned an unsupported payment token.');
  }
  var amount;
  try { amount = BigInt(payment.amount); } catch (_) { throw new Error('Relayr returned an invalid payment amount.'); }
  if (amount < 0n) throw new Error('Relayr returned an invalid payment amount.');

  var bundleUuid = String(expectedBundleUuid || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(bundleUuid)) {
    throw new Error('Relayr returned an invalid bundle ID.');
  }
  var calldata = String(payment.calldata || '').toLowerCase();
  // 4-byte selector + ABI word(bytes16, right-padded) + ABI word(uint40).
  if (!/^0x[0-9a-f]{136}$/.test(calldata)) throw new Error('Relayr returned invalid payment calldata.');
  if (calldata.slice(0, 10) !== RELAYR_PAYMENT_SELECTOR) throw new Error('Relayr returned an unrecognized payment function.');
  var compactUuid = bundleUuid.replace(/-/g, '');
  if (calldata.slice(10, 74) !== compactUuid + '0'.repeat(32)) {
    throw new Error('Relayr payment calldata does not match this bundle.');
  }
  var deadline;
  try { deadline = BigInt('0x' + calldata.slice(74, 138)); } catch (_) { throw new Error('Relayr returned invalid payment calldata.'); }
  if (deadline > 0xffffffffffn) throw new Error('Relayr returned an invalid payment deadline.');
  var quotedDeadline = relayrDeadlineSeconds(payment.payment_deadline);
  if (quotedDeadline == null || BigInt(quotedDeadline) !== deadline) {
    throw new Error('Relayr payment calldata does not match the quote deadline.');
  }
  var now = Number.isSafeInteger(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  if (deadline <= BigInt(now + 15)) throw new Error('This Relayr quote expired. Review the action again for a new quote.');
  return { chainId: chainId, target: RELAYR_PAYMENT_ADDRESS, amount: amount, calldata: calldata, bundleUuid: bundleUuid, deadline: deadline };
}

// Authenticate and snapshot every displayed option before a user chooses where to fund the bundle.
export function relayrPaymentOptions(quote) {
  if (!quote || !Array.isArray(quote.payment_info) || !quote.payment_info.length) throw new Error('Relayr returned no payment option.');
  var bound = RELAYR_QUOTED_REQUESTS.get(quote.bundle_uuid);
  var destinations = bound ? bound.transactions : quote.expected_transactions;
  var family = relayrNetworkFamily((destinations || []).map(function (request) { return request.chain; }));
  if (!family) throw new Error('The Relayr quote must identify destinations in one supported network family.');
  var options = quote.payment_info.map(function (payment) {
    var details = relayrPaymentDetails(payment, quote.bundle_uuid);
    return Object.freeze({ chain: details.chainId, target: details.target, token: RELAYR_NATIVE_TOKEN,
      amount: details.amount.toString(), calldata: details.calldata, payment_deadline: details.deadline.toString() });
  }).filter(function (payment) { return relayrNetworkFamily([payment.chain]) === family; });
  if (!options.length) throw new Error('Relayr returned no payment option in the destination network family.');
  return options.sort(function (a, b) { return BigInt(a.amount) < BigInt(b.amount) ? -1 : BigInt(a.amount) > BigInt(b.amount) ? 1 : a.chain - b.chain; });
}

function relayrBoundPaymentDetails(payment, bundleUuid) {
  var bound = RELAYR_QUOTED_REQUESTS.get(bundleUuid);
  if (!bound) throw new Error('The original Relayr destination quote is unavailable. Resume its saved request before paying.');
  var details = relayrPaymentDetails(payment, bundleUuid);
  if (relayrNetworkFamily(bound.transactions.map(function (request) { return request.chain; })) !== relayrNetworkFamily([details.chainId])) {
    throw new Error('Relayr funding must use the same network family as its destinations. No payment was sent.');
  }
  return details;
}

async function requireRelayrPaymentRuntime(client) {
  var code = await client.request({ method: 'eth_getCode', params: [RELAYR_PAYMENT_ADDRESS, 'latest'] });
  if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || (code.length - 2) / 2 > RELAYR_PAYMENT_CODE_MAX_BYTES) {
    throw new Error('Could not authenticate the Relayr payment contract.');
  }
  if (keccak256(code) !== RELAYR_PAYMENT_CODE_HASH) throw new Error('Relayr payment contract code is not recognized.');
}

async function simulateRelayrPayment(client, account, details) {
  var result = await client.request({
    method: 'eth_call',
    params: [{
      from: account, to: details.target, value: '0x' + details.amount.toString(16), data: details.calldata,
      gas: '0x' + RELAYR_PAYMENT_GAS.toString(16),
    }, 'latest'],
  });
  if (result !== '0x') throw new Error('Relayr payment simulation returned an unexpected result.');
}

// A backend fetch can stall without ever rejecting, which used to leave the UI frozen forever. Bound each
// HTTP attempt; status polling will retry the same bundle, while quote requests fail before any payment.
function relayrFetch(url, options, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var requestOptions = Object.assign({}, options || {});
    if (controller) requestOptions.signal = controller.signal;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
      var error = new Error('Relayr request timed out.');
      error.code = 'RELAYR_HTTP_TIMEOUT';
      reject(error);
    }, Math.max(1, Number(timeoutMs) || RELAYR_STATUS_REQUEST_TIMEOUT_MS));
    fetch(url, requestOptions).then(function (value) {
      clearTimeout(timer); resolve(value);
    }, function (error) {
      clearTimeout(timer); reject(error);
    });
  });
}

// Minimal OpenZeppelin ERC2771Forwarder surface.
var FORWARDER_ABI = [
  { type: 'function', name: 'nonces', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'eip712Domain', stateMutability: 'view', inputs: [], outputs: [
    { name: 'fields', type: 'bytes1' }, { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
    { name: 'salt', type: 'bytes32' }, { name: 'extensions', type: 'uint256[]' } ] },
  { type: 'function', name: 'execute', stateMutability: 'payable', outputs: [], inputs: [
    { name: 'request', type: 'tuple', components: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'gas', type: 'uint256' }, { name: 'deadline', type: 'uint48' },
      { name: 'data', type: 'bytes' }, { name: 'signature', type: 'bytes' } ] }] },
];
var TRUSTED_FORWARDER_ABI = [{ type: 'function', name: 'isTrustedForwarder', stateMutability: 'view',
  inputs: [{ name: 'forwarder', type: 'address' }], outputs: [{ type: 'bool' }] }];

export async function relayrSupportsForwarding(chainId, target) {
  if (!relayrSupportsChain(chainId)) return false;
  var forwarder = getAddress('ERC2771Forwarder', chainId);
  if (!forwarder) return false;
  try {
    return await createPublicClientForChain(chainId).readContract({ address: target, abi: TRUSTED_FORWARDER_ABI,
      functionName: 'isTrustedForwarder', args: [forwarder] }) === true;
  } catch (_) { return false; }
}

// Sign an ERC-2771 ForwardRequest for `to`/`data` on `chainId` and return the relayr transaction entry.
// The EIP-712 domain (name/version) is read from the forwarder at runtime (EIP-5267) so we never guess it.
// `value` is the ETH forwarded to the target (e.g. a project-creation fee); the relayer sends it with
// `execute`, so it appears as the bundle tx's `value` and Relayr's quote covers it.
export async function buildForwardedTx(chainId, from, to, data, gasHint, value) {
  if (getViewAs()) throw new Error(VIEW_AS_TX_ERROR);
  if (!relayrSupportsChain(chainId)) throw new Error('Relayr does not support this destination chain. Use a direct wallet transaction.');
  var forwarder = getAddress('ERC2771Forwarder', chainId);
  if (!forwarder) throw new Error('No ERC2771Forwarder on ' + chainNameFor(chainId));
  var pub = createPublicClientForChain(chainId);
  var wallet = getWalletClient();
  if (!wallet) throw new Error('Connect a wallet first');
  var val = value || 0n;

  // Forwarding only preserves the wallet's identity when the recipient explicitly trusts this deployment.
  // In particular, a generic ABI target must never silently receive a relayer as its effective caller.
  var trusted = await pub.readContract({ address: to, abi: TRUSTED_FORWARDER_ABI,
    functionName: 'isTrustedForwarder', args: [forwarder] }).catch(function () { return false; });
  if (trusted !== true) throw new Error('This contract does not support the trusted forwarder on ' + chainNameFor(chainId) + '. Use a direct wallet transaction.');

  // MetaMask (and especially a Ledger via MetaMask) reject eth_signTypedData_v4 when the EIP-712 domain's
  // chainId differs from the wallet's ACTIVE chain ("Provided chainId X must match the active chainId Y").
  // Each forward request is domain-bound to its target chain, so switch the wallet there before signing.
  try {
    var active = await wallet.getChainId();
    if (active !== Number(chainId)) {
      await switchChain(Number(chainId));
      wallet = getWalletClient(); // switchChain recreates the client on the new chain
    }
  } catch (e) {
    throw new Error('Switch your wallet to ' + chainNameFor(chainId) + ' to sign its request (' + ((e && e.message) || e) + ')');
  }
  if (!getAccount() || getAccount().toLowerCase() !== from.toLowerCase()) throw new Error('Connected account changed. Review the cross-chain request again.');

  var domTuple = await pub.readContract({ address: forwarder, abi: FORWARDER_ABI, functionName: 'eip712Domain', args: [] });
  if (domTuple[0] !== '0x0f' || BigInt(domTuple[3]) !== BigInt(chainId)
      || String(domTuple[4]).toLowerCase() !== forwarder.toLowerCase()
      || !Array.isArray(domTuple[6]) || domTuple[6].length) throw new Error('The forwarder domain does not match this chain and deployment.');
  var domainName = domTuple[1], domainVersion = domTuple[2];
  var nonce = await pub.readContract({ address: forwarder, abi: FORWARDER_ABI, functionName: 'nonces', args: [from] });

  var deadline = Math.floor(Date.now() / 1000) + 47 * 3600; // uint48 seconds (< 48h Relayr max)
  // Measure the destination call rather than signing a flat guess. The forwarder caps the
  // inner call at `gas` and reverts `execute` if it runs out, so an undersized constant
  // burns a bundle the user has already paid for; an oversized one inflates every quote.
  // A caller hint is only a floor. Always try a live estimate and raise the
  // signed limit to the larger value so stale constants cannot cap execution.
  var gas = gasHint;
  try {
    var estimated = await pub.estimateGas({ account: forwarder, to: to, data: data + from.slice(2).toLowerCase(), value: val });
    var buffered = gasWithHeadroom(estimated);
    if (!gas || BigInt(gas) < buffered) gas = buffered;
  } catch (_) {
    if (!gas) gas = 500000n; // estimation unavailable — Relayr still simulates server-side and refuses a bad quote
  }

  var signature = await wallet.signTypedData({
    account: from,
    domain: { name: domainName, version: domainVersion, chainId: BigInt(chainId), verifyingContract: forwarder },
    types: { ForwardRequest: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'gas', type: 'uint256' }, { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint48' }, { name: 'data', type: 'bytes' } ] },
    primaryType: 'ForwardRequest',
    message: { from: from, to: to, value: val, gas: gas, nonce: nonce, deadline: deadline, data: data },
  });
  if (!getAccount() || getAccount().toLowerCase() !== from.toLowerCase()) throw new Error('Connected account changed. Review the cross-chain request again.');

  var requestData = { from: from, to: to, value: val, gas: gas, deadline: deadline, data: data, signature: signature };
  var execData = encodeFunctionData({ abi: FORWARDER_ABI, functionName: 'execute', args: [requestData] });
  var entry = { chain: Number(chainId), target: forwarder, data: execData, value: val.toString() };
  // execute(request) omits the signed nonce. Keep its exact local signature binding; never infer that nonce
  // later from a changed onchain value or accept caller-supplied metadata as a substitute for this proof.
  RELAYR_SIGNED_FORWARD_REQUESTS.set(relayrRequestFingerprint(Object.assign({}, entry, { virtual_nonce: 0 })), {
    chain: Number(chainId), forwarder: forwarder.toLowerCase(), signer: from.toLowerCase(),
    nonce: BigInt(nonce).toString(), deadline: String(deadline),
  });
  return entry;
}

function forwardedPublicationProofs(transactions, journal) {
  return transactions.map(function (request) {
    var forwarder = getAddress('ERC2771Forwarder', request.chain);
    if (!forwarder || String(request.target).toLowerCase() !== forwarder.toLowerCase()) return null;
    var hash = relayrRequestFingerprint(Object.assign({}, request, { virtual_nonce: 0 }));
    var proof = RELAYR_SIGNED_FORWARD_REQUESTS.get(hash);
    if (!proof) throw new Error('This forwarded request is missing its original signed nonce proof. Reopen its original review before publication.');
    if (!journal || !journal.scope || String(journal.account || getAccount()).toLowerCase() !== proof.signer) {
      throw new Error('A forwarded Relayr request needs its original signer and durable action scope.');
    }
    return Object.assign({}, proof, { scope: journal.scope, requestHash: hash });
  }).filter(Boolean);
}

function nonceReservationKey(value) { return [value.chain, value.forwarder, value.signer, value.nonce].join(':'); }
function readNonceReservations() {
  try {
    var raw = localStorage.getItem(RELAYR_NONCE_RESERVATIONS_KEY);
    if (!raw) return [];
    var rows = JSON.parse(raw), seen = new Set();
    if (!Array.isArray(rows) || rows.length > 512) throw new Error();
    rows.forEach(function (row) {
      if (!row || !relayrSupportsChain(row.chain) || !isAddress(row.forwarder, { strict: false })
          || !isAddress(row.signer, { strict: false }) || !/^\d+$/.test(row.nonce) || !/^\d+$/.test(row.deadline)
          || BigInt(row.nonce) >= 1n << 256n || BigInt(row.deadline) >= 1n << 48n
          || typeof row.scope !== 'string' || !row.scope || !/^0x[0-9a-f]{64}$/.test(row.requestHash || '')) throw new Error();
      row.forwarder = row.forwarder.toLowerCase(); row.signer = row.signer.toLowerCase();
      row.nonce = BigInt(row.nonce).toString(); row.chain = Number(row.chain);
      var key = nonceReservationKey(row);
      if (seen.has(key)) throw new Error();
      seen.add(key);
    });
    return rows;
  } catch (_) { throw new Error('The saved Relayr nonce reservations cannot be read. Keep the original requests and enable browser storage before publishing another bundle.'); }
}
function writeNonceReservations(rows) {
  try {
    if (rows.length > 512) throw new Error();
    var raw = JSON.stringify(rows);
    localStorage.setItem(RELAYR_NONCE_RESERVATIONS_KEY, raw);
    if (localStorage.getItem(RELAYR_NONCE_RESERVATIONS_KEY) !== raw) throw new Error();
  } catch (_) { throw new Error('The forwarded nonce reservations could not be saved. Enable browser storage. Nothing was published or paid.'); }
}

// Called only while the shared publication Web Lock is held. Reservations belong to signer + forwarder +
// chain + signed nonce across ALL action scopes. Clearing an action's UI receipt does not retire this guard.
// Only a chain-proven expired signature or consumed nonce makes its published request unable to execute.
async function reserveForwardedPublication(proofs) {
  if (!proofs.length) return;
  var rows = readNonceReservations(), seen = new Set();
  for (var proof of proofs) {
    var key = nonceReservationKey(proof);
    if (seen.has(key)) throw new Error('This Relayr bundle repeats a signed forwarder nonce. Use separate confirmed rounds for same-chain calls.');
    seen.add(key);
    var client = createPublicClientForChain(proof.chain);
    var state;
    try {
      var block = await client.getBlock({ blockTag: 'latest' });
      if (!block || block.number == null || block.timestamp == null) throw new Error();
      state = { timestamp: BigInt(block.timestamp), nonce: BigInt(await client.readContract({ address: proof.forwarder,
        abi: FORWARDER_ABI, functionName: 'nonces', args: [proof.signer], blockNumber: block.number })) };
      if (state.timestamp < 0n || state.nonce < 0n) throw new Error();
    } catch (_) { throw new Error('Could not verify the signed forwarder nonce and chain timestamp on ' + chainNameFor(proof.chain) + '. Nothing was published or paid.'); }
    if (state.nonce !== BigInt(proof.nonce) || state.timestamp > BigInt(proof.deadline)) {
      throw new Error('The signed forwarder request is stale on ' + chainNameFor(proof.chain) + '. Review its original nonce and deadline before publishing.');
    }
    rows = rows.filter(function (row) {
      return row.chain !== proof.chain || row.forwarder !== proof.forwarder || row.signer !== proof.signer
        || !(state.nonce > BigInt(row.nonce) || state.timestamp > BigInt(row.deadline));
    });
    var conflict = rows.find(function (row) { return nonceReservationKey(row) === key; });
    if (conflict) {
      var error = new Error('Another saved Relayr request already reserves this signer’s nonce on ' + chainNameFor(proof.chain) + '. Resume its original action (' + conflict.scope + '); do not publish or fund a competing bundle.');
      error.code = 'RELAYR_NONCE_RESERVED'; error.scope = conflict.scope;
      throw error;
    }
    rows.push(proof);
  }
  writeNonceReservations(rows);
}

// POST the bundle and return { bundle_uuid, payment_info:[{chain,amount,calldata,target,token,payment_deadline}], ... }.
export async function relayrPostBundle(transactions, journal, locked) {
  if (!Array.isArray(transactions) || !relayrNetworkFamily(transactions.map(function (tx) { return tx && tx.chain; }))) {
    throw new Error('Relayr destinations must use one supported network family: Ethereum, Optimism, Base, and Arbitrum mainnets or their Sepolia testnets.');
  }
  var forwarded = forwardedPublicationProofs(transactions, journal);
  if (locked !== RELAYR_PUBLICATION_LOCK && forwarded.length) {
    if (typeof navigator === 'undefined' || !navigator.locks || typeof navigator.locks.request !== 'function') {
      throw new Error('This browser cannot lock forwarded Relayr publication across actions. Use a browser with Web Locks support. Nothing was published or paid.');
    }
    return navigator.locks.request('jb-relayr-forwarder-publication-v1', function () {
      return relayrPostBundle(transactions, journal, RELAYR_PUBLICATION_LOCK);
    });
  }
  // Order each chain's transactions by their position in the array (per-chain 0,1,2… virtual nonces) and run in
  // ChainIndependent mode: chains execute in parallel, but a single chain's txs run STRICTLY in that order — each
  // after the previous confirms, against the updated state. This lets a bundle carry sequential same-chain txs
  // (e.g. Safe execTransactions at consecutive nonces) without Relayr quoting every one against the current state
  // (which reverts future-nonce txs — the "Disabled"-mode SimulationReverted). Cross-chain one-per-chain bundles
  // are unchanged (every tx gets virtual nonce 0). Callers must build the array in intended per-chain order.
  var perChain = {};
  var ordered = transactions.map(function (t) {
    var vn = perChain[t.chain] || 0; perChain[t.chain] = vn + 1;
    return Object.assign({}, t, { virtual_nonce: vn });
  });
  var publication = null;
  if (journal && journal.scope) {
    if (locked !== RELAYR_PUBLICATION_LOCK && typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      return navigator.locks.request('jb-relayr-publish:' + String(journal.account || getAccount()).toLowerCase() + ':' + journal.scope,
        function () { return relayrPostBundle(transactions, journal, RELAYR_PUBLICATION_LOCK); });
    }
    if (journal.account && (!getAccount() || String(getAccount()).toLowerCase() !== String(journal.account).toLowerCase())) {
      throw new Error('Connected account changed. Review the Relayr request again.');
    }
    if (loadRelayrPendingSession(journal.scope)) {
      var existing = new Error('A previous Relayr request for this action is still saved. Check that request before publishing another bundle.');
      existing.code = 'RELAYR_PUBLICATION_PENDING'; existing.retryable = true; throw existing;
    }
    await reserveForwardedPublication(forwarded);
    publication = saveRelayrPendingSession(journal.scope, {
      bundleUuid: 'publication-pending:' + crypto.randomUUID(), account: journal.account || getAccount(),
      paymentState: 'publication', expectedCount: ordered.length,
      chains: journal.chains || ordered.map(function (request) { return { id: Number(request.chain), name: chainNameFor(request.chain) }; }),
      publicationRequestHashes: ordered.map(relayrRequestFingerprint), records: [],
    });
    if (!publication || publication.persisted === false) {
      if (publication) clearRelayrPendingSession(journal.scope, publication);
      throw new Error('The request could not be saved before publication. Enable browser storage before requesting a Relayr quote. Nothing was published or paid.');
    }
  }
  var res;
  try {
    res = await relayrFetch(RELAYR_API + '/v1/bundle/prepaid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: ordered, virtual_nonce_mode: 'ChainIndependent' }),
    }, RELAYR_QUOTE_TIMEOUT_MS);
  } catch (error) {
    if (publication) {
      var unknown = new Error('Relayr may have received the signed requests, but no quote was confirmed. The saved request blocks new signatures and payments for this action. Keep it and verify the destination activity before retrying.');
      unknown.code = 'RELAYR_PUBLICATION_PENDING'; unknown.retryable = true; unknown.cause = error; unknown.relayrSession = publication;
      throw unknown;
    }
    if (error && error.code === 'RELAYR_HTTP_TIMEOUT') {
      var timeout = new Error('Relayr did not return a quote in time. Nothing was paid; it is safe to try again.');
      timeout.code = 'RELAYR_QUOTE_TIMEOUT'; timeout.retryable = true;
      throw timeout;
    }
    throw error;
  }
  if (!res.ok) {
    var detail = ''; try { detail = await res.text(); } catch (_) {}
    throw new Error('Relayr HTTP ' + res.status + (detail ? ': ' + detail.slice(0, 240) : ''));
  }
  var body = await res.json();
  if (!body || !RELAYR_UUID_RE.test(String(body.bundle_uuid || ''))) throw new Error('Relayr returned no valid bundle ID. Nothing was paid.');
  // Relayr deployments have exposed this field as both tx_uuids (current OpenAPI) and txn_uuids (legacy SDK).
  // Accept either exact array, but reject conflicting dual fields rather than guessing which quote mapping won.
  var txUuids = Array.isArray(body.tx_uuids) ? body.tx_uuids : body.txn_uuids;
  if (Array.isArray(body.tx_uuids) && Array.isArray(body.txn_uuids)
      && JSON.stringify(body.tx_uuids) !== JSON.stringify(body.txn_uuids)) txUuids = null;
  if (!Array.isArray(txUuids) || txUuids.length !== ordered.length
      || txUuids.some(function (uuid) { return !RELAYR_UUID_RE.test(String(uuid || '')); })
      || new Set(txUuids.map(function (uuid) { return String(uuid).toLowerCase(); })).size !== ordered.length) {
    throw new Error('Relayr did not bind every quoted transaction to a unique ID. Nothing was paid.');
  }
  // Freeze the exact request-to-transaction mapping returned with this quote. Only these small hashes/UUIDs are
  // persisted; calldata stays in memory. Status polling later requires the API's bundle UUID, tx UUID, and echoed
  // request to match this mapping before it may accept a success or clear a paid receipt.
  body.expected_transactions = ordered.map(function (request, index) {
    return {
      txUuid: String(txUuids[index]).toLowerCase(),
      requestHash: relayrRequestFingerprint(request),
      chain: Number(request.chain),
    };
  });
  RELAYR_QUOTED_REQUESTS.set(body.bundle_uuid, {
    transactions: Object.freeze(ordered.map(function (request) { return Object.freeze(Object.assign({}, request)); })),
    forwarded: Object.freeze(forwarded.map(function (proof) { return Object.freeze(Object.assign({}, proof)); })),
    quote: body,
  });
  if (publication) {
    // Authenticate every amount/target before retaining the quote that the user can reopen after Cancel.
    body.payment_info = relayrPaymentOptions(body);
    clearRelayrPendingSession(journal.scope, publication);
    var quoted = saveRelayrPendingSession(journal.scope, Object.assign({}, publication, {
      bundleUuid: body.bundle_uuid, paymentState: 'quoted', expectedTransactions: body.expected_transactions,
    }));
    RELAYR_KNOWN_QUOTES.set(relayrPendingStorageKey(journal.scope, quoted), body);
    if (quoted.persisted === false) throw new Error('The Relayr quote could not be saved. Keep this window open and check the saved request before paying.');
  }
  return body;
}

// Simulate the exact requests that this client published, including each signed forwarder nonce, deadline,
// value, and gas limit. Only the caller's native balance is overridden, because Relayr supplies call value.
// No target code, target storage, or authorization state is replaced.
export async function verifyRelayrQuotedRequests(bundleUuid, account) {
  var bound = RELAYR_QUOTED_REQUESTS.get(bundleUuid);
  if (!bound) return; // Standalone payment-boundary callers have no locally published destination bundle.
  if (bound.forwarded && bound.forwarded.length) {
    var reservations = readNonceReservations();
    bound.forwarded.forEach(function (proof) {
      var saved = reservations.find(function (row) { return nonceReservationKey(row) === nonceReservationKey(proof); });
      if (!saved || saved.scope !== proof.scope || saved.requestHash !== proof.requestHash || proof.signer !== String(account).toLowerCase()) {
        throw new Error('The original forwarded nonce reservation no longer matches this quote. Do not fund a competing request; resume its original saved action.');
      }
    });
  }
  await Promise.all(bound.transactions.map(async function (request, index) {
    var value = BigInt(request.value || '0');
    var params = [{ from: account, to: request.target, data: request.data,
      value: '0x' + value.toString(16), gas: '0x1c9c380' }, 'latest'];
    if (value > 0n) params.push({ [account]: { balance: '0x' + value.toString(16) } });
    var result;
    try { result = await createPublicClientForChain(request.chain).request({ method: 'eth_call', params: params }); }
    catch (cause) {
      throw new Error('The exact quoted transaction no longer simulates on ' + chainNameFor(request.chain) + '. No payment was sent; keep this quote and review its signed nonce, deadline, and destination state. ' + ((cause && cause.shortMessage) || (cause && cause.message) || ''));
    }
    var forwarder = getAddress('ERC2771Forwarder', request.chain);
    var proof = bound.quote.expected_transactions[index] && bound.quote.expected_transactions[index].result;
    if (typeof result !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(result) || result.length > 8194
        || (forwarder && String(request.target).toLowerCase() === forwarder.toLowerCase() && result !== '0x')
        || (proof && proof.kind === 'safe-exec' && result !== '0x' + '0'.repeat(63) + '1')) {
      throw new Error('The exact quoted transaction returned an unexpected simulation result on ' + chainNameFor(request.chain) + '. No payment was sent.');
    }
  }));
}

function normalizedRelayrQuantity(value, fallback) {
  if (value == null && fallback !== undefined) value = fallback;
  try {
    var numeric = BigInt(value);
    if (numeric < 0n) throw new Error('negative');
    return numeric.toString();
  } catch (_) { throw new Error('Relayr returned a malformed transaction quantity.'); }
}

// Canonical hash of the complete CallRequest schema Relayr accepts/echoes. This is intentionally independent of
// object key order and numeric string formatting, while binding every client-controlled submitted field. Relayr
// estimates and echoes `gas_limit` even when the client omitted it, so that server-added field is deliberately
// excluded; chain, target, calldata, value and our assigned virtual nonce remain exact.
export function relayrRequestFingerprint(request) {
  var chain = Number(request && request.chain);
  var target = String(request && request.target || '').toLowerCase();
  var data = request && request.data == null ? '0x' : String(request.data).toLowerCase();
  var virtualNonce = Number(request && request.virtual_nonce);
  if (!Number.isSafeInteger(chain) || chain < 1 || !isAddress(target, { strict: false })
      || !/^0x(?:[0-9a-f]{2})*$/i.test(data) || data.length > 2_000_002
      || !Number.isSafeInteger(virtualNonce) || virtualNonce < 0) {
    throw new Error('Relayr returned a malformed transaction request.');
  }
  var normalized = {
    chain: chain, target: target, data: data,
    value: normalizedRelayrQuantity(request && request.value, 0),
    virtualNonce: virtualNonce,
  };
  return keccak256(stringToHex(JSON.stringify(normalized)));
}

// Send the single prepaid payment that funds execution on every chain. The HTTP quote is authenticated against
// the exact bundle UUID and immutable payment runtime, then shown as a second exact transaction review before
// the wallet opens. Returns the payment tx hash.
export async function relayrPay(payment, expectedAccount, onSubmitted, expectedBundleUuid, reverify, onSending) {
  if (getViewAs()) throw new Error(VIEW_AS_TX_ERROR);
  var details = relayrBoundPaymentDetails(payment, expectedBundleUuid);
  var chainId = details.chainId;
  var wallet = getWalletClient();
  if (!wallet) throw new Error('Connect a wallet first');
  var account = getAccount();
  if (!account) throw new Error('Connect a wallet first');
  if (expectedAccount && account.toLowerCase() !== expectedAccount.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
  var pub = createPublicClientForChain(chainId);
  await requireRelayrPaymentRuntime(pub);
  if (reverify) await reverify();

  var approved = await confirmTransactionModal({
    summary: {
      action: 'Fund this exact Relayr bundle',
      rows: [
        ['Bundle ID', details.bundleUuid],
        ['Payment selector', RELAYR_PAYMENT_SELECTOR],
        ['Payment deadline', new Date(Number(details.deadline) * 1000).toISOString()],
        ['Native value', details.amount.toString() + ' wei'],
      ],
    },
    chain: chainNameFor(chainId), chainId: chainId,
    contract: 'Relayr prepaid payment', address: details.target,
    function: 'pay for bundle',
    args: { bundleUuid: details.bundleUuid, paymentDeadline: details.deadline.toString(), selector: RELAYR_PAYMENT_SELECTOR },
    calldata: details.calldata, value: details.amount,
  }, {
    title: 'Review Relayr payment', confirmText: 'Agree & pay Relayr',
    description: 'This separate native payment funds the already-reviewed Relayr bundle. Verify the exact destination, value, bundle ID, deadline, selector, and raw calldata before opening your wallet.',
  });
  if (!approved) throw new Error('Cancelled');
  // A review can remain open past the quote deadline or an authority change. Re-decode the same immutable
  // quote and repeat caller-specific freshness checks after it closes, before any simulation or wallet call.
  details = relayrBoundPaymentDetails(payment, expectedBundleUuid);
  if (reverify) await reverify();
  await verifyRelayrQuotedRequests(expectedBundleUuid, account);
  if (!getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
  var active = await wallet.getChainId().catch(function () { return null; });
  if (active !== chainId) { await switchChain(chainId); wallet = getWalletClient(); }
  if (!wallet || !getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
  await requireRelayrPaymentRuntime(pub);
  await simulateRelayrPayment(pub, account, details);
  details = relayrBoundPaymentDetails(payment, expectedBundleUuid);
  if (reverify) await reverify();
  if (!getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
  async function sendPayment() {
    // Another tab can have opened its own quote while this tab was reviewing. Serialize the final journal
    // check and wallet submission where Web Locks are available; the journal rejects a competing bundle.
    details = relayrBoundPaymentDetails(payment, expectedBundleUuid);
    if (!getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
    if (reverify) await reverify();
    await verifyRelayrQuotedRequests(expectedBundleUuid, account);
    details = relayrBoundPaymentDetails(payment, expectedBundleUuid);
    if (!getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
    if (onSending) await onSending();
    try {
      return await wallet.sendTransaction({
        account: account,
        chain: CHAINS[chainId],
        to: details.target,
        value: details.amount,
        data: details.calldata,
        gas: RELAYR_PAYMENT_GAS,
      });
    } catch (cause) {
      // Wallet/RPC transport errors can occur after broadcast but before returning a transaction hash.
      // Keep the pre-send bundle journal so a subsequent attempt can only inspect this original bundle.
      var uncertain = new Error('The Relayr payment request reached your wallet, but its submission could not be confirmed. Do not pay again; check the saved bundle and wallet activity.');
      uncertain.name = 'RelayrPaymentUncertainError';
      uncertain.code = 'RELAYR_PAYMENT_UNCERTAIN';
      uncertain.bundleUuid = details.bundleUuid;
      uncertain.chainId = chainId;
      uncertain.cause = cause;
      throw uncertain;
    }
  }
  var hash = typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function'
    ? await navigator.locks.request('jb-relayr-payment:' + account.toLowerCase(), sendPayment)
    : await sendPayment();
  if (onSubmitted) { try { onSubmitted(hash); } catch (_) {} }
  var receipt;
  try {
    receipt = await waitForTrackedTransactionReceipt(pub, hash, wallet, chainId);
  } catch (cause) {
    var submitted = new Error('Relayr payment ' + hash + ' was submitted, but confirmation tracking is temporarily unavailable. Do not pay again; resume the saved bundle instead.');
    submitted.name = 'RelayrPaymentSubmittedError';
    submitted.code = 'RELAYR_PAYMENT_SUBMITTED';
    submitted.hash = hash;
    submitted.chainId = chainId;
    submitted.cause = cause;
    throw submitted;
  }
  if (receipt && receipt.status && receipt.status !== 'success') throw new Error('Relayr payment reverted onchain.');
  return hash;
}

// Relayr has returned both Success and Completed for terminal successful records. Keep that protocol
// detail in one place so progress counters cannot sit at 0/N after the destination already confirmed.
export function relayrStateIsSuccess(state) {
  state = String(state || '').toLowerCase();
  return state === 'success' || state === 'completed';
}

export function relayrStateIsFailed(state) {
  state = String(state || '').toLowerCase();
  return state === 'failed' || state === 'reverted' || state === 'cancelled';
}

export function relayrProgress(records, expectedCount) {
  records = Array.isArray(records) ? records : [];
  var confirmed = records.filter(function (t) { return relayrStateIsSuccess(t && t.status && t.status.state); }).length;
  var failed = records.filter(function (t) { return relayrStateIsFailed(t && t.status && t.status.state); }).length;
  var expected = Number(expectedCount);
  var total = Number.isSafeInteger(expected) && expected > 0 ? Math.max(expected, records.length) : records.length;
  return {
    confirmed: confirmed, failed: failed, pending: Math.max(0, total - confirmed - failed), total: total,
    // Display summary only: API failure reports do not authorize discarding a paid receipt.
    allFailed: total > 0 && confirmed === 0 && failed >= total,
  };
}

function relayrExecutionError(message, code, uuid, records, retryable) {
  var error = new Error(message);
  error.name = 'RelayrExecutionError';
  error.code = code;
  error.bundleUuid = uuid;
  error.records = Array.isArray(records) ? records : [];
  error.retryable = !!retryable;
  return error;
}

export function relayrErrorIsUncertain(error) {
  return !!(error && (error.code === 'RELAYR_TIMEOUT' || error.code === 'RELAYR_PAYMENT_SUBMITTED'
    || error.code === 'RELAYR_PAYMENT_UNCERTAIN'
    || error.code === 'RELAYR_PUBLICATION_PENDING'
    || error.code === 'RELAYR_QUOTE_RECOVERY_PENDING'
    || error.code === 'RELAYR_STATUS_MISMATCH' || error.code === 'RELAYR_STATUS_UNBOUND'
    || error.code === 'RELAYR_POSTCONDITION_PENDING'));
}

// Persist only the small, non-sensitive receipt needed to resume status checks. In particular, never put
// signed forward requests or calldata in localStorage. `scope` is supplied by the feature (for example a
// project-specific "add shop items" key).
//
// Receipts are device-local AND wallet-local: the storage key carries the connected account, so a second
// wallet on the same browser never sees (or resumes) the first wallet's bundles. With no wallet connected
// there is nothing to key by, so storage falls back to the unkeyed (legacy) key; the first wallet that
// reads such an entry adopts it into its own namespace (best-effort migration).
function relayrAccountPart(session) {
  try {
    var account = session && Object.prototype.hasOwnProperty.call(session, 'account') ? session.account : getAccount && getAccount();
    return account ? String(account).toLowerCase() + ':' : '';
  } catch (_) { return ''; }
}
// Feature scopes never start with a bare address ('create-project', 'action:…', 'bundle:…', 'shop-…'),
// so an account prefix is unambiguous in stored keys.
var RELAYR_ACCOUNT_KEYED = /^0x[0-9a-f]{40}:/;
function relayrPendingStorageKey(scope, session) { return RELAYR_PENDING_PREFIX + relayrAccountPart(session) + String(scope || ''); }
function relayrLegacyStorageKey(scope) { return RELAYR_PENDING_PREFIX + String(scope || ''); }

// Status polling persists after every tick; skip the synchronous localStorage write when nothing changed.
var RELAYR_LAST_SAVED = {};
// Keep failed writes available for the lifetime of this page. Successfully persisted sessions are deliberately
// absent from this cache, so removing a receipt in another tab cannot resurrect it from an old in-memory copy.
var RELAYR_UNSAVED_SESSIONS = {};

function relayrStoredSession(raw) {
  try { var parsed = JSON.parse(raw); return parsed && parsed.bundleUuid ? parsed : null; } catch (_) { return null; }
}

function relayrPaymentStage(session) {
  if (session && session.paymentHash) return 2;
  if (session && session.paymentState === 'publication') return -1;
  if (session && session.paymentState === 'quoted') return 0;
  // Hashless sending, expired, and legacy receipts all block a new payment until their outcome is verified.
  return 1;
}

// A failed write can leave a newer local progress snapshot, but another tab may subsequently submit payment.
// Reconcile readable disk every time; an advanced durable payment must win over stale quoted memory.
function relayrStoredValue(key) {
  var memory = RELAYR_UNSAVED_SESSIONS[key], disk;
  try { disk = localStorage.getItem(key); } catch (_) {}
  if (!memory) return { raw: disk, persisted: !!disk, disk: disk };
  var memorySession = relayrStoredSession(memory), diskSession = relayrStoredSession(disk);
  if (diskSession && (!memorySession || diskSession.bundleUuid !== memorySession.bundleUuid
      || relayrPaymentStage(diskSession) > relayrPaymentStage(memorySession))) {
    delete RELAYR_UNSAVED_SESSIONS[key];
    return { raw: disk, persisted: true, disk: disk };
  }
  return { raw: memory, persisted: false, disk: disk };
}

function relayrRecordSnapshot(record) {
  return {
    tx_uuid: record && record.tx_uuid ? String(record.tx_uuid) : null,
    status: {
      state: String(record && record.status && record.status.state || ''),
      data: { hash: relayrDestinationHash(record) || null },
    },
  };
}

function sanitizedRelayrSafeExecution(value) {
  if (!value || value.kind !== 'safe-exec') return null;
  var safe = String(value.safe || '').toLowerCase();
  var safeTxHash = String(value.safeTxHash || '').toLowerCase();
  var nonce;
  try { nonce = BigInt(value.nonce); } catch (_) { return null; }
  if (!isAddress(safe, { strict: false }) || !/^0x[0-9a-f]{64}$/.test(safeTxHash)
      || nonce < 0n || nonce > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { kind: 'safe-exec', safe: safe, nonce: nonce.toString(), safeTxHash: safeTxHash };
}

// Attach one reviewed Safe proof to each immutable Relayr request binding. This happens after Relayr returns its
// tx UUIDs, so proof metadata is never sent to or trusted from the quote API. The exact outer calldata is already
// covered by requestHash; the proof supplies only execTransaction's omitted nonce and expected SafeTx hash.
export function bindRelayrSafeExecutions(expectedTransactions, proofs) {
  var expected = Array.isArray(expectedTransactions) ? expectedTransactions : [];
  var values = Array.isArray(proofs) ? proofs : [];
  if (!expected.length || values.length !== expected.length) throw new Error('Could not bind every Relayr Safe execution to its reviewed transaction.');
  return expected.map(function (binding, index) {
    var result = sanitizedRelayrSafeExecution(Object.assign({ kind: 'safe-exec' }, values[index] || {}));
    if (!result || Number(binding.chain) !== Number(values[index] && values[index].chain)) {
      throw new Error('A Relayr Safe execution proof does not match its destination chain.');
    }
    return Object.assign({}, binding, { result: result });
  });
}

export function saveRelayrPendingSession(scope, session) {
  if (!scope || !session || !session.bundleUuid) return null;
  // Pin the original object too: some submission callbacks retain it while the UI uses the returned snapshot.
  // Later polling must never move this receipt to a newly connected wallet's namespace.
  session.account = relayrAccountPart(session).slice(0, -1) || null;
  var snapshot = {
    account: session.account,
    bundleUuid: String(session.bundleUuid),
    paymentHash: session.paymentHash ? String(session.paymentHash) : null,
    paymentChainId: Number(session.paymentChainId) || null,
    expectedCount: Math.max(0, Number(session.expectedCount) || 0),
    chains: (session.chains || []).map(function (chain) {
      return { id: Number(chain.id || chain.cid), name: String(chain.name || '') };
    }).filter(function (chain) { return Number.isSafeInteger(chain.id) && chain.id > 0; }),
    expectedTransactions: (session.expectedTransactions || []).map(function (expected) {
      var result = sanitizedRelayrSafeExecution(expected && expected.result);
      return {
        txUuid: String(expected && expected.txUuid || '').toLowerCase(),
        requestHash: String(expected && expected.requestHash || '').toLowerCase(),
        chain: Number(expected && expected.chain),
        result: result,
      };
    }).filter(function (expected) {
      return RELAYR_UUID_RE.test(expected.txUuid) && /^0x[0-9a-f]{64}$/.test(expected.requestHash)
        && Number.isSafeInteger(expected.chain) && expected.chain > 0;
    }),
    records: (session.records || []).map(relayrRecordSnapshot),
    itemCount: Math.max(0, Number(session.itemCount) || 0),
    paymentState: ['expired', 'sending', 'publication', 'quoted'].indexOf(session.paymentState) !== -1 ? session.paymentState : null,
    publicationRequestHashes: (session.publicationRequestHashes || []).filter(function (hash) {
      return typeof hash === 'string' && /^0x[0-9a-f]{64}$/i.test(hash);
    }).map(function (hash) { return hash.toLowerCase(); }),
    persisted: true,
  };
  var key = relayrPendingStorageKey(scope, session);
  var serialized = JSON.stringify(snapshot);
  var stored = relayrStoredValue(key);
  var previous = stored.raw;
  if (previous) {
    var previousSession = relayrStoredSession(previous);
    if (previousSession && previousSession.bundleUuid && previousSession.bundleUuid !== snapshot.bundleUuid) {
      var conflict = new Error('A different Relayr bundle is already saved for this action. Check that original bundle before submitting another payment.');
      conflict.code = 'RELAYR_PENDING_CONFLICT';
      conflict.bundleUuid = previousSession.bundleUuid;
      throw conflict;
    }
    if (previousSession && relayrPaymentStage(previousSession) > relayrPaymentStage(snapshot)) {
      var durable = relayrStoredSession(stored.disk);
      // The caller stopped before opening its wallet because the sending journal could not be written.
      // Only an unchanged readable quoted record proves that this local failed write may return to quoted.
      var unsentRollback = snapshot.paymentState === 'quoted' && previousSession.paymentState === 'sending'
        && previousSession.persisted === false && !previousSession.paymentHash
        && durable && durable.bundleUuid === snapshot.bundleUuid && durable.paymentState === 'quoted' && !durable.paymentHash;
      if (!unsentRollback) {
        previousSession.account = snapshot.account;
        previousSession.persisted = stored.persisted;
        return previousSession;
      }
    }
  }
  try {
    if (RELAYR_LAST_SAVED[key] !== serialized || localStorage.getItem(key) !== serialized) {
      localStorage.setItem(key, serialized);
    }
    RELAYR_LAST_SAVED[key] = serialized;
    delete RELAYR_UNSAVED_SESSIONS[key];
  } catch (_) {
    snapshot.persisted = false;
    RELAYR_UNSAVED_SESSIONS[key] = JSON.stringify(snapshot);
  }
  return snapshot;
}

export function loadRelayrPendingSession(scope, ownerSession) {
  if (!scope) return null;
  var key = relayrPendingStorageKey(scope, ownerSession);
  var accountPart = relayrAccountPart(ownerSession);
  var stored = relayrStoredValue(key);
  var raw = stored.raw;
  // Adopt a pre-account-keyed receipt into the connected wallet's namespace on first read.
  if (!raw && accountPart) {
    var legacyKey = relayrLegacyStorageKey(scope);
    var legacy = RELAYR_UNSAVED_SESSIONS[legacyKey];
    if (!legacy) { try { legacy = localStorage.getItem(legacyKey); } catch (_) {} }
    if (legacy) {
      raw = legacy;
      try {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(legacyKey);
        delete RELAYR_UNSAVED_SESSIONS[legacyKey];
        stored.persisted = true;
      } catch (_) {
        RELAYR_UNSAVED_SESSIONS[key] = legacy;
      }
    }
  }
  if (!raw) return null;
  try {
    var session = JSON.parse(raw);
    if (!session || typeof session.bundleUuid !== 'string' || !session.bundleUuid) throw new Error('Invalid Relayr session');
    session.account = accountPart.slice(0, -1) || null;
    session.persisted = !!stored.persisted && !RELAYR_UNSAVED_SESSIONS[key];
    session.records = Array.isArray(session.records) ? session.records : [];
    session.chains = Array.isArray(session.chains) ? session.chains : [];
    session.expectedTransactions = Array.isArray(session.expectedTransactions) ? session.expectedTransactions : [];
    session.expectedCount = Math.max(0, Number(session.expectedCount) || session.chains.length || 0);
    return session;
  } catch (_) {
    delete RELAYR_UNSAVED_SESSIONS[key];
    try { localStorage.removeItem(key); } catch (_) {}
    return null;
  }
}

// Every scope with a persisted pending session for the CONNECTED wallet (the part of the storage key
// after the shared prefix and account). Lets the account view surface all in-flight Relayr work without
// knowing each feature's scope scheme. Other wallets' receipts are never listed; legacy unkeyed entries
// surface only once a wallet is connected (and are adopted by it on first load). With no wallet there is
// no identity to scope by, so nothing is listed.
export function listRelayrPendingScopes() {
  var scopes = [];
  var accountPart = relayrAccountPart();
  if (!accountPart) return scopes;
  var seen = {};
  var keys = Object.keys(RELAYR_UNSAVED_SESSIONS);
  try {
    for (var i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }
  } catch (_) {}
  keys.forEach(function (key) {
    if (!key || key.indexOf(RELAYR_PENDING_PREFIX) !== 0) return;
    var rest = key.slice(RELAYR_PENDING_PREFIX.length);
    var scope = null;
    if (RELAYR_ACCOUNT_KEYED.test(rest)) {
      if (rest.indexOf(accountPart) === 0) scope = rest.slice(accountPart.length);
    } else {
      scope = rest; // legacy unkeyed — adopted on first load
    }
    if (scope && !seen[scope]) { seen[scope] = true; scopes.push(scope); }
  });
  return scopes;
}

export function clearRelayrPendingSession(scope, session) {
  // Async completion clears the original wallet's copy even if the connected account changed while polling.
  // Remove its legacy copy too, so a cleared receipt cannot be adopted again after migration.
  [relayrPendingStorageKey(scope, session), relayrLegacyStorageKey(scope)].forEach(function (key) {
    if (session && session.bundleUuid) {
      var raw = relayrStoredValue(key).raw;
      if (raw) {
        var saved;
        try { saved = JSON.parse(raw); } catch (_) {}
        if (saved && saved.bundleUuid && saved.bundleUuid !== session.bundleUuid) return;
      }
    }
    delete RELAYR_LAST_SAVED[key];
    delete RELAYR_UNSAVED_SESSIONS[key];
    try { localStorage.removeItem(key); } catch (_) {}
  });
}

export function relayrBoundStatusRecords(uuid, body, expectedTransactions) {
  if (!body || String(body.bundle_uuid || '').toLowerCase() !== String(uuid || '').toLowerCase()) {
    throw new Error('Relayr status does not match the submitted bundle ID.');
  }
  var expected = Array.isArray(expectedTransactions) ? expectedTransactions : [];
  if (!expected.length) throw new Error('The Relayr receipt is missing its submitted transaction binding.');
  var expectedByUuid = {};
  expected.forEach(function (item) {
    var txUuid = String(item && item.txUuid || '').toLowerCase();
    var requestHash = String(item && item.requestHash || '').toLowerCase();
    if (!RELAYR_UUID_RE.test(txUuid) || !/^0x[0-9a-f]{64}$/.test(requestHash) || expectedByUuid[txUuid]) {
      throw new Error('The Relayr receipt contains an invalid transaction binding.');
    }
    expectedByUuid[txUuid] = { item: item, index: Object.keys(expectedByUuid).length };
  });
  var records = Array.isArray(body.transactions) ? body.transactions : [];
  if (records.length > expected.length) throw new Error('Relayr status contains unexpected transactions.');
  var seen = {}, ordered = [];
  records.forEach(function (record) {
    var txUuid = String(record && record.tx_uuid || '').toLowerCase();
    var match = expectedByUuid[txUuid];
    if (!match || seen[txUuid]) throw new Error('Relayr status contains a duplicate or unsubmitted transaction.');
    if (relayrRequestFingerprint(record.request) !== String(match.item.requestHash).toLowerCase()) {
      throw new Error('Relayr status transaction fields do not match the submitted request.');
    }
    if (relayrStateIsSuccess(record && record.status && record.status.state)
        && !/^0x[0-9a-f]{64}$/i.test(String(relayrDestinationHash(record) || ''))) {
      throw new Error('Relayr reported success without a valid destination transaction hash.');
    }
    seen[txUuid] = true;
    ordered[match.index] = record;
  });
  var complete = ordered.filter(Boolean);
  if (complete.length === expected.length
      && complete.every(function (record) { return relayrStateIsSuccess(record && record.status && record.status.state); })
      && body.payment_received !== true) {
    throw new Error('Relayr reported successful transactions without binding the confirmed payment.');
  }
  return complete;
}

// Poll GET /v1/bundle/{uuid} every `intervalMs` until every transaction reports Success/Completed.
// Calls onUpdate(transactions[]) each tick. Resolves with the final transactions; rejects with a structured
// RelayrExecutionError on a terminal Failed record or timeout. A timeout means outcome unknown, not failed.
// Each transaction's destination hash lives at status.data.hash or status.data.transaction.hash.
export function relayrPoll(uuid, onUpdate, intervalMs, timeoutMs, expectedCount, expectedTransactions) {
  intervalMs = intervalMs || 2500;
  timeoutMs = timeoutMs || 5 * 60 * 1000;
  expectedCount = Math.max(1, Number(expectedCount) || 1);
  expectedTransactions = Array.isArray(expectedTransactions) ? expectedTransactions : [];
  if (!expectedTransactions.length || expectedTransactions.length !== expectedCount) {
    return Promise.reject(relayrExecutionError('The saved Relayr receipt is missing an exact transaction binding.', 'RELAYR_STATUS_UNBOUND', uuid, [], true));
  }
  var start = Date.now();
  var lastRecords = [];
  return new Promise(function (resolve, reject) {
    // Sentinel body meaning "Relayr keeps saying it has never heard of this uuid" — distinct from any real payload.
    var NOT_FOUND = {};
    var notFoundStreak = 0;
    function timedOut() { return Date.now() - start >= timeoutMs; }
    function timeout() {
      return relayrExecutionError('Relayr is still processing paid bundle ' + uuid + '. Do not submit this action again; check the original bundle later.', 'RELAYR_TIMEOUT', uuid, lastRecords, true);
    }
    function tick() {
      var remaining = Math.max(1, timeoutMs - (Date.now() - start));
      relayrFetch(RELAYR_API + '/v1/bundle/' + uuid, null, Math.min(RELAYR_STATUS_REQUEST_TIMEOUT_MS, remaining)).then(function (r) {
        // A 404 is not a transient status error: Relayr has no such bundle. Retrying it to the full window and
        // then reporting RELAYR_TIMEOUT tells the user to keep waiting on something that will never land. Tolerate
        // a short blip from the gateway; only an unbroken run of 404s is terminal, and it is NOT retryable.
        if (r.status === 404) {
          notFoundStreak++;
          if (notFoundStreak >= RELAYR_NOT_FOUND_ATTEMPTS) return NOT_FOUND;
          throw new Error('Relayr status HTTP 404');
        }
        notFoundStreak = 0;
        if (!r.ok) throw new Error('Relayr status HTTP ' + r.status);
        return r.json();
      }).then(function (body) {
        if (body === NOT_FOUND) return reject(relayrExecutionError(
          'Relayr does not currently recognize bundle ' + uuid + '. Its destination outcomes are not verified. Keep the original payment hash and bundle ID, and check the affected chains before submitting anything again.',
          'RELAYR_NOT_FOUND', uuid, lastRecords, false
        ));
        var txs;
        try { txs = relayrBoundStatusRecords(uuid, body, expectedTransactions); }
        catch (error) { return reject(relayrExecutionError((error && error.message) || 'Relayr returned mismatched bundle status.', 'RELAYR_STATUS_MISMATCH', uuid, lastRecords, true)); }
        lastRecords = txs;
        if (onUpdate) onUpdate(txs, body);
        if (txs.length === expectedCount && txs.every(function (t) { return relayrStateIsSuccess(t && t.status && t.status.state); })) return resolve(txs);
        var failed = txs.filter(function (t) { return relayrStateIsFailed(t && t.status && t.status.state); });
        if (failed.length) return reject(relayrExecutionError(
          'Relayr bundle ' + uuid + ' failed on ' + failed.length + ' chain' + (failed.length > 1 ? 's' : '') + '. Nothing was resubmitted; check confirmed chains before trying again.',
          'RELAYR_FAILED', uuid, txs, false
        ));
        // A wallet receipt only proves that the payment-contract call mined.
        // Relayr separately reports whether it attributed that payment to this
        // bundle. Once an unrecognized quote expires, "Pending" is terminal:
        // continuing to poll forever hides the actual recovery path.
        var expiresAt = body && body.expires_at ? Date.parse(body.expires_at) : NaN;
        if (body && body.payment_received === false && Number.isFinite(expiresAt) && Date.now() >= expiresAt) {
          return reject(relayrExecutionError(
            'Relayr reports that no payment was recognized before bundle ' + uuid + ' expired. Its destination outcomes are not verified. Keep the payment hash and bundle ID, and review wallet activity and the affected chains before submitting anything again.',
            'RELAYR_PAYMENT_EXPIRED', uuid, txs, false
          ));
        }
        if (timedOut()) return reject(timeout());
        setTimeout(tick, intervalMs);
      }).catch(function () {
        if (timedOut()) return reject(timeout());
        setTimeout(tick, intervalMs);
      });
    }
    tick();
  });
}

// Pull the destination tx hash off a polled transaction record, whatever its state shape.
export function relayrDestinationHash(record) {
  var data = record && record.status && record.status.data;
  return (data && (data.hash || (data.transaction && data.transaction.hash))) || null;
}

// API status is not an onchain receipt. After the bundle/tx UUID and echoed-request bindings pass, fetch every
// reported destination transaction from its expected chain and match the exact outer `{to,input,value}` plus a
// successful receipt. A compromised status endpoint therefore cannot clear a paid receipt with invented hashes.
export async function verifyRelayrDestinationRecords(expectedTransactions, records, clientFactory) {
  var expected = Array.isArray(expectedTransactions) ? expectedTransactions : [];
  var results = Array.isArray(records) ? records : [];
  if (!expected.length || expected.length !== results.length) {
    throw new Error('Relayr completion does not match the submitted transaction count.');
  }
  clientFactory = clientFactory || createPublicClientForChain;
  var seenHashes = new Set();
  await Promise.all(results.map(async function (record, index) {
    var binding = expected[index];
    var request = record && record.request;
    if (!binding || relayrRequestFingerprint(request) !== String(binding.requestHash || '').toLowerCase()) {
      throw new Error('The saved Relayr transaction binding does not match the reviewed request.');
    }
    var hash = String(relayrDestinationHash(record) || '');
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Relayr did not return a valid destination transaction hash.');
    if (seenHashes.has(hash.toLowerCase())) throw new Error('Relayr returned the same destination transaction for multiple submitted entries.');
    seenHashes.add(hash.toLowerCase());
    var client = clientFactory(Number(request.chain));
    if (!client || typeof client.getTransaction !== 'function' || typeof client.getTransactionReceipt !== 'function') {
      throw new Error('The destination RPC cannot verify Relayr completion.');
    }
    var loaded = await Promise.all([
      client.getTransaction({ hash: hash }),
      client.getTransactionReceipt({ hash: hash }),
    ]);
    var transaction = loaded[0], receipt = loaded[1];
    if (!receipt || receipt.status !== 'success' || !transaction || !transaction.to
        || (receipt.transactionHash && String(receipt.transactionHash).toLowerCase() !== hash.toLowerCase())
        || String(transaction.to).toLowerCase() !== String(request.target || '').toLowerCase()
        || String(transaction.input || transaction.data || '').toLowerCase() !== String(request.data || '0x').toLowerCase()
        || BigInt(transaction.value || 0) !== BigInt(request.value || 0)) {
      throw new Error('Relayr’s destination transaction does not match the reviewed request on chain ' + request.chain + '.');
    }
    var safeProof = sanitizedRelayrSafeExecution(binding.result);
    if (binding.result && !safeProof) throw new Error('The saved Relayr Safe execution proof is malformed.');
    if (safeProof) {
      if (String(request.target || '').toLowerCase() !== safeProof.safe || BigInt(request.value || 0) !== 0n) {
        throw new Error('The saved Relayr Safe execution proof does not match its outer request.');
      }
      var decoded = decodeSafeExecRelayrTx(Number(request.chain), safeProof.safe, request.data, safeProof.nonce);
      if (String(decoded.safeTxHash).toLowerCase() !== safeProof.safeTxHash) {
        throw new Error('The saved Relayr Safe transaction hash does not match its exact execution calldata.');
      }
      if (!hasExactSafeExecutionSuccess(receipt.logs, safeProof.safe, safeProof.safeTxHash)) {
        throw new Error('The Safe did not emit ExecutionSuccess for the reviewed transaction.');
      }
      var liveNonce = BigInt(await readSafeUintBounded(client, safeProof.safe, 'nonce'));
      if (liveNonce <= BigInt(safeProof.nonce)) throw new Error('The Safe nonce did not advance after Relayr execution.');
    }
  }));
  return true;
}
