// src/relayr.js
// Cross-chain transaction submission via relayr (the permissionless Bananapus relay), modelled on the
// revnet-app / juice-sdk-v4 flow. Each per-chain call is wrapped as an ERC-2771 meta-transaction:
// the operator signs an OpenZeppelin ForwardRequest, we encode `ERC2771Forwarder.execute(req)`, and
// relayr executes that on every chain after a single prepaid payment.
//
// Flow:
//   1. buildForwardedTx(chainId, from, to, data)  -> signs ForwardRequest, returns {chain, target, data, value}
//   2. relayrPostBundle(transactions)             -> POST /v1/bundle/prepaid -> { bundle_uuid, payment_info }
//   3. relayrPay(payment)                         -> one on-chain payment funds all chains
//   4. relayrPoll(uuid, onUpdate)                 -> GET /v1/bundle/{uuid} until every tx is "Success"
//
// No API key. Host confirmed from juice-sdk-v4: https://api.relayr.ba5ed.com

import { encodeFunctionData, isAddress } from 'viem';
import { getWalletClient, getAccount, createPublicClientForChain, getAddress, switchChain } from './component-base.js';
import { CHAINS } from './chain.js';

var RELAYR_API = 'https://api.relayr.ba5ed.com';

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

// Sign an ERC-2771 ForwardRequest for `to`/`data` on `chainId` and return the relayr transaction entry.
// The EIP-712 domain (name/version) is read from the forwarder at runtime (EIP-5267) so we never guess it.
// `value` is the ETH forwarded to the target (e.g. a project-creation fee); the relayer sends it with
// `execute`, so it appears as the bundle tx's `value` and Relayr's quote covers it.
export async function buildForwardedTx(chainId, from, to, data, gasHint, value) {
  var forwarder = getAddress('ERC2771Forwarder', chainId);
  if (!forwarder) throw new Error('No ERC2771Forwarder on ' + (CHAINS[chainId] && CHAINS[chainId].name || chainId));
  var pub = createPublicClientForChain(chainId);
  var wallet = getWalletClient();
  if (!wallet) throw new Error('Connect a wallet first');
  var val = value || 0n;

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
    throw new Error('Switch your wallet to ' + (CHAINS[chainId] && CHAINS[chainId].name || chainId) + ' to sign its request (' + ((e && e.message) || e) + ')');
  }
  if (!getAccount() || getAccount().toLowerCase() !== from.toLowerCase()) throw new Error('Connected account changed. Review the cross-chain request again.');

  var domTuple = await pub.readContract({ address: forwarder, abi: FORWARDER_ABI, functionName: 'eip712Domain', args: [] });
  var domainName = domTuple[1], domainVersion = domTuple[2];
  var nonce = await pub.readContract({ address: forwarder, abi: FORWARDER_ABI, functionName: 'nonces', args: [from] });

  var deadline = Math.floor(Date.now() / 1000) + 47 * 3600; // uint48 seconds (< 48h Relayr max)
  var gas = gasHint || 500000n;

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
  return { chain: Number(chainId), target: forwarder, data: execData, value: val.toString() };
}

// POST the bundle and return { bundle_uuid, payment_info:[{chain,amount,calldata,target,token,payment_deadline}], ... }.
export async function relayrPostBundle(transactions) {
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
  var res = await fetch(RELAYR_API + '/v1/bundle/prepaid', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: ordered, virtual_nonce_mode: 'ChainIndependent' }),
  });
  if (!res.ok) {
    var detail = ''; try { detail = await res.text(); } catch (_) {}
    throw new Error('Relayr HTTP ' + res.status + (detail ? ': ' + detail.slice(0, 240) : ''));
  }
  return await res.json();
}

// Send the single prepaid payment that funds execution on every chain. Caller ensures the wallet is on
// payment.chain. Returns the payment tx hash.
export async function relayrPay(payment, expectedAccount) {
  var chainId = Number(payment && payment.chain);
  if (!Number.isSafeInteger(chainId) || !CHAINS[chainId]) throw new Error('Relayr returned an unsupported payment chain.');
  if (!payment || !isAddress(payment.target, { strict: false })) throw new Error('Relayr returned an invalid payment target.');
  var amount; try { amount = BigInt(payment.amount); } catch (_) { throw new Error('Relayr returned an invalid payment amount.'); }
  if (amount < 0n) throw new Error('Relayr returned an invalid payment amount.');
  var calldata = payment.calldata || '0x';
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(calldata)) throw new Error('Relayr returned invalid payment calldata.');
  var wallet = getWalletClient();
  if (!wallet) throw new Error('Connect a wallet first');
  var account = getAccount();
  if (!account) throw new Error('Connect a wallet first');
  if (expectedAccount && account.toLowerCase() !== expectedAccount.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
  var active = await wallet.getChainId().catch(function () { return null; });
  if (active !== chainId) { await switchChain(chainId); wallet = getWalletClient(); }
  if (!wallet || !getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
  var pub = createPublicClientForChain(chainId);
  await pub.estimateGas({ account: account, to: payment.target, value: amount, data: calldata });
  if (!getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) throw new Error('Connected account changed. Review the Relayr payment again.');
  var hash = await wallet.sendTransaction({
    account: account,
    chain: CHAINS[chainId],
    to: payment.target,
    value: amount,
    data: calldata,
  });
  var receipt = await pub.waitForTransactionReceipt({ hash: hash });
  if (receipt && receipt.status && receipt.status !== 'success') throw new Error('Relayr payment reverted on-chain.');
  return hash;
}

// Poll GET /v1/bundle/{uuid} every `intervalMs` until every transaction reports state "Success".
// Calls onUpdate(transactions[]) each tick. Resolves with the final transactions; rejects on a "Failed"
// transaction or timeout. Each transaction's dest hash lives at status.data.hash (Success) or
// status.data.transaction.hash (other states).
export function relayrPoll(uuid, onUpdate, intervalMs, timeoutMs) {
  intervalMs = intervalMs || 2500;
  timeoutMs = timeoutMs || 5 * 60 * 1000;
  var start = Date.now();
  return new Promise(function (resolve, reject) {
    function tick() {
      fetch(RELAYR_API + '/v1/bundle/' + uuid).then(function (r) { return r.json(); }).then(function (body) {
        var txs = (body && body.transactions) || [];
        if (onUpdate) onUpdate(txs, body);
        if (txs.length && txs.every(function (t) { return t.status && t.status.state === 'Success'; })) return resolve(txs);
        var failed = txs.filter(function (t) { return t.status && t.status.state === 'Failed'; });
        if (failed.length) return reject(new Error('Could not execute on ' + failed.length + ' chain' + (failed.length > 1 ? 's' : '') + '.'));
        if (Date.now() - start > timeoutMs) return reject(new Error('Timed out waiting for Relayr execution.'));
        setTimeout(tick, intervalMs);
      }).catch(function () {
        if (Date.now() - start > timeoutMs) return reject(new Error('Timed out waiting for Relayr execution.'));
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
