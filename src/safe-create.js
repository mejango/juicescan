// A new Safe as a project's owner or a revnet's operator, created in the launch itself. The Safe's address is
// fixed by its signers, approval count and salt, so the launch can name it before it exists, and it is the same
// on every chain. The rule juicebox.money follows; the constants are the canonical Safe 1.4.1 deployments.

import {
  concatHex, decodeFunctionData, decodeFunctionResult, encodeFunctionData, encodePacked,
  getAddress as checksum, getContractAddress, isAddress, keccak256, toHex,
} from 'viem';

export var SAFE_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
export var SAFE_SINGLETON = '0x41675C099F32341bf84BFc5382aF534df5C7461a';
export var SAFE_FALLBACK = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99';
export var MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
export var MIN_SAFE_SIGNERS = 2;
export var MAX_SAFE_SIGNERS = 20;

// keccak256 of each contract's runtime: an address alone does not prove what runs there.
var CONTRACTS = [
  [SAFE_FACTORY, '0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317'],
  [SAFE_SINGLETON, '0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4'],
  [SAFE_FALLBACK, '0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9'],
];
var PROXY_CODE_HASH = '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c';
var SENTINEL = '0x0000000000000000000000000000000000000001';
var ZERO = '0x0000000000000000000000000000000000000000';
var SINGLETON_SLOT = toHex(0n, { size: 32 });
var GUARD_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8';
var FALLBACK_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';

var fn = function (name, inputs, outputs, mutability) {
  return { name: name, type: 'function', stateMutability: mutability || 'view', inputs: inputs, outputs: outputs || [] };
};
var arg = function (type, name) { return { type: type, name: name || '' }; };
var SAFE_ABI = [
  fn('setup', [arg('address[]', 'owners'), arg('uint256', 'threshold'), arg('address', 'to'), arg('bytes', 'data'),
    arg('address', 'fallbackHandler'), arg('address', 'paymentToken'), arg('uint256', 'payment'), arg('address', 'paymentReceiver')], [], 'nonpayable'),
  fn('proxyCreationCode', [], [arg('bytes')], 'pure'),
  fn('createProxyWithNonce', [arg('address', 'singleton'), arg('bytes', 'initializer'), arg('uint256', 'saltNonce')], [arg('address', 'proxy')], 'nonpayable'),
  fn('masterCopy', [], [arg('address')]),
  fn('VERSION', [], [arg('string')]),
  fn('getThreshold', [], [arg('uint256')]),
  fn('getOwners', [], [arg('address[]')]),
  fn('getModulesPaginated', [arg('address', 'start'), arg('uint256', 'pageSize')], [arg('address[]'), arg('address')]),
];
export var CREATE_BATCH_ABI = [{
  name: 'aggregate3Value', type: 'function', stateMutability: 'payable',
  inputs: [{ type: 'tuple[]', name: 'calls', components: [arg('address', 'target'), arg('bool', 'allowFailure'), arg('uint256', 'value'), arg('bytes', 'callData')] }],
  outputs: [{ type: 'tuple[]', name: 'returnData', components: [arg('bool', 'success'), arg('bytes', 'returnData')] }],
}];

var same = function (a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); };
var word = function (value) { return toHex(BigInt(value), { size: 32 }); };

// The signer's address, or null: the zero address and Safe's list sentinel cannot sign.
export function safeSignerAddress(value) {
  var text = String(value == null ? '' : value).trim();
  return isAddress(text, { strict: false }) && BigInt(text) > 1n ? checksum(text) : null;
}

// What is wrong with a signer list and approval count, or '' when a Safe can be created from them.
export function safePolicyIssue(signers, threshold) {
  var list = Array.isArray(signers) ? signers.map(safeSignerAddress) : [];
  if (list.length < MIN_SAFE_SIGNERS || list.length > MAX_SAFE_SIGNERS || list.some(function (signer) { return !signer; })) {
    return 'Add ' + MIN_SAFE_SIGNERS + ' to ' + MAX_SAFE_SIGNERS + ' signer addresses.';
  }
  if (new Set(list).size !== list.length) return 'Each signer must have a different address.';
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > list.length) return 'Choose how many signers must approve.';
  return '';
}

function initializer(plan) {
  var issue = safePolicyIssue(plan.owners, plan.threshold);
  if (issue) throw new Error(issue);
  return encodeFunctionData({ abi: SAFE_ABI, functionName: 'setup',
    args: [plan.owners.map(safeSignerAddress), BigInt(plan.threshold), ZERO, '0x', SAFE_FALLBACK, ZERO, 0n, ZERO] });
}

// The address the factory gives a Safe with these signers, approval count and salt.
export function predictSafeAddress(plan) {
  if (!/^0x[\da-f]{64}$/i.test(plan.saltNonce) || !/^0x(?:[\da-f]{2}){1,2048}$/i.test(plan.proxyCreationCode)) throw new Error('Invalid Safe deployment record.');
  return getContractAddress({ opcode: 'CREATE2', from: SAFE_FACTORY,
    salt: keccak256(encodePacked(['bytes32', 'uint256'], [keccak256(initializer(plan)), BigInt(plan.saltNonce)])),
    bytecode: concatHex([plan.proxyCreationCode, word(SAFE_SINGLETON)]) });
}

function assertPlan(plan) {
  if (!plan || !same(predictSafeAddress(plan), plan.address)) throw new Error('The Safe address differs from its saved signers and policy.');
}

function codeIs(code, hash) { return typeof code === 'string' && /^0x(?:[\da-f]{2}){1,24576}$/i.test(code) && keccak256(code) === hash; }

async function readCreationCode(client) {
  await Promise.all(CONTRACTS.concat([[MULTICALL3, null]]).map(async function (entry) {
    var code = await client.getCode({ address: entry[0] });
    if (entry[1] ? !codeIs(code, entry[1]) : !code || code === '0x') throw new Error('Safe creation is unavailable on this network.');
  }));
  var code = await client.readContract({ address: SAFE_FACTORY, abi: SAFE_ABI, functionName: 'proxyCreationCode' });
  if (!/^0x(?:[\da-f]{2}){1,2048}$/i.test(code)) throw new Error('Invalid Safe proxy creation code.');
  return code;
}

// One Safe for every launch chain: { owners, threshold, saltNonce, proxyCreationCode, address }.
// salt is the launch's own, so each launch gets its own Safe; role keeps an owner and an operator apart.
export async function resolveSafePlan(input, clients) {
  var issue = safePolicyIssue(input.owners, input.threshold);
  if (issue) throw new Error(issue);
  if (!clients.length) throw new Error('Select at least one network to create a Safe.');
  var codes = await Promise.all(clients.map(readCreationCode));
  if (codes.some(function (code) { return !same(code, codes[0]); })) throw new Error('Safe creation code differs across the selected networks.');
  var plan = { owners: input.owners.map(safeSignerAddress), threshold: input.threshold,
    saltNonce: keccak256(encodePacked(['bytes32', 'string'], [input.salt, input.role])), proxyCreationCode: codes[0] };
  plan.address = predictSafeAddress(plan);
  return plan;
}

// Is the Safe at the plan's address exactly the reviewed one: canonical proxy and singleton, these signers,
// this approval count, no module, no guard? Returns false only for a missing Safe when allowMissing is set.
export async function verifySafe(client, plan, options) {
  assertPlan(plan);
  var blockNumber = options && options.blockNumber, at = { address: plan.address, blockNumber: blockNumber };
  var mismatch = function () { return new Error('The Safe at ' + plan.address + ' does not match its reviewed signers and policy.'); };
  var code = await client.getCode(at);
  if (options && options.allowMissing && (!code || code === '0x')) return false;
  if (!codeIs(code, PROXY_CODE_HASH)) throw mismatch();
  var read = function (functionName, args) {
    return client.readContract({ address: plan.address, abi: SAFE_ABI, functionName: functionName, args: args, blockNumber: blockNumber });
  };
  var slot = function (key) { return client.getStorageAt({ address: plan.address, slot: key, blockNumber: blockNumber }); };
  var got = await Promise.all([slot(SINGLETON_SLOT), slot(GUARD_SLOT), slot(FALLBACK_SLOT), read('VERSION'), read('getThreshold'),
    read('getOwners'), read('getModulesPaginated', [SENTINEL, 1n])].concat(CONTRACTS.slice(1).map(function (entry) {
    return client.getCode({ address: entry[0], blockNumber: blockNumber }).then(function (runtime) { return codeIs(runtime, entry[1]); });
  })));
  var owners = got[5], modules = got[6];
  if (!same(got[0], word(SAFE_SINGLETON)) || !same(got[1], word(0n)) || !same(got[2], word(SAFE_FALLBACK)) || got[3] !== '1.4.1'
    || BigInt(got[4]) !== BigInt(plan.threshold) || !Array.isArray(owners) || owners.length !== plan.owners.length
    || plan.owners.some(function (owner) { return !owners.some(function (actual) { return same(actual, owner); }); })
    || !Array.isArray(modules) || modules[0].length !== 0 || !same(modules[1], SENTINEL) || !got[7] || !got[8]) throw mismatch();
  return true;
}

// The launch call with the Safe's creation ahead of it, as one Multicall3 batch. The creation may fail (the Safe
// already exists); the launch may not. A gas limit too small for the creation cannot slip through: the creation
// runs first on 63/64 of the gas, so it only runs out when the whole limit is under ~300k, and a launch that
// must then fit in the remaining 1/64 fails the batch. (With a trivial second call it does slip: seen on a fork.)
export function bundleSafeLaunch(call, plan) {
  assertPlan(plan);
  var calls = [
    { target: SAFE_FACTORY, allowFailure: true, value: 0n,
      callData: encodeFunctionData({ abi: SAFE_ABI, functionName: 'createProxyWithNonce', args: [SAFE_SINGLETON, initializer(plan), BigInt(plan.saltNonce)] }) },
    { target: call.to, allowFailure: false, value: BigInt(call.value), callData: call.data },
  ];
  return { to: MULTICALL3, value: BigInt(call.value), args: [calls],
    data: encodeFunctionData({ abi: CREATE_BATCH_ABI, functionName: 'aggregate3Value', args: [calls] }) };
}

// The launch call inside a batch, or null unless the batch is exactly this plan's creation followed by one call.
export function unbundleSafeLaunch(call, plan) {
  try {
    if (!same(call.to, MULTICALL3)) return null;
    var calls = decodeFunctionData({ abi: CREATE_BATCH_ABI, data: call.data }).args[0];
    var inner = { to: calls[calls.length - 1].target, data: calls[calls.length - 1].callData, value: BigInt(call.value) };
    return same(bundleSafeLaunch(inner, plan).data, call.data) ? inner : null;
  } catch (_) { return null; }
}

// After simulating the batch: the launch ran, and the Safe was either created at the reviewed address or is
// already there exactly as reviewed. data is the simulated call's return data.
export async function verifySafeSimulation(client, plan, data) {
  assertPlan(plan);
  if (!data || data === '0x') throw new Error('The Safe creation simulation returned no results.');
  var results = decodeFunctionResult({ abi: CREATE_BATCH_ABI, functionName: 'aggregate3Value', data: data });
  if (results.length !== 2 || !results[1].success) throw new Error('The creation batch did not simulate every required call.');
  if (!results[0].success) { await verifySafe(client, plan); return; }
  if (!same(results[0].returnData, word(plan.address))) throw new Error('The simulated factory returned a different Safe address.');
}
