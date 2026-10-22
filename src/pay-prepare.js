// src/pay-prepare.js
// A person's payment: the pay transaction, its hook metadata (buyback quote and 721 tiers), and the minimum the
// terminal enforces. Lean mirror of nana-sdk-core v6/pay.ts at 557a9fc (3.5.2 with the swap-quote refusal:
// prepareUserPay and the helpers it calls), v6/terminals.ts#getAccountingContexts/#resolvePaymentTerminal and
// v6/uniswapV3.ts/uniswapV4.ts quotes; test/fixtures/sdk-557a9fc/pay-prepare.json pins identical metadata,
// previews, minimums, errors and reads.

import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress as checksumAddress, keccak256, zeroAddress } from 'viem';
import { getABI } from './abi-registry.js';
import { createHookMetadata, hookMetadataId } from './hook-metadata.js';
import { v6Address } from './nft-inventory-read.js';
import { NATIVE_TOKEN } from './safe-batch.js';
import { PAY_DEFAULT_SLIPPAGE_BPS, slippageFloor } from './slippage.js';

const MAX_RESERVED_PERCENT = 10000n;
const DEFAULT_ALLOW_OVERSPENDING = true;
const UINT128_MAX = (1n << 128n) - 1n;
const isNativeToken = (token) => token.toLowerCase() === NATIVE_TOKEN.toLowerCase();
const maxBigInt = (a, b) => (a > b ? a : b);

/** pay(projectId, token, amount, beneficiary, minReturnedTokens, memo, metadata); native pays carry the amount as value. */
export function buildPayTx({ chainId, terminal, projectId, token, amount, beneficiary, minReturnedTokens = 0n, memo = '', metadata = '0x' }) {
  return {
    chainId,
    address: terminal,
    abi: getABI('JBMultiTerminal', chainId),
    functionName: 'pay',
    args: [projectId, token, amount, beneficiary, minReturnedTokens, memo, metadata],
    value: isNativeToken(token) ? amount : 0n,
  };
}

/** The project's primary terminal for the token, else the router terminal registry. */
export async function resolvePaymentTerminal(client, { chainId, projectId, token }) {
  const primaryTerminal = await client.readContract({
    address: v6Address('JBDirectory', chainId),
    abi: getABI('JBDirectory', chainId),
    functionName: 'primaryTerminalOf',
    args: [projectId, token],
  });
  if (primaryTerminal === zeroAddress) return { address: v6Address('JBRouterTerminalRegistry', chainId), isRouter: true };
  return { address: primaryTerminal, isRouter: false };
}

export function getAccountingContexts(client, { chainId, projectId }) {
  return client.readContract({
    address: v6Address('JBMultiTerminal', chainId),
    abi: getABI('JBMultiTerminal', chainId),
    functionName: 'accountingContextsOf',
    args: [projectId],
  });
}

const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' },
];

/** The buyback hook's pool for a project and terminal token (native as address zero). */
export const poolKeyOfAbi = [{
  type: 'function', name: 'poolKeyOf', stateMutability: 'view',
  inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'terminalToken', type: 'address' }],
  outputs: [{ name: 'key', type: 'tuple', components: POOL_KEY_COMPONENTS }],
}];

/** A Uniswap V4 pool id: keccak256(abi.encode(PoolKey)). */
export function uniswapV4PoolId(key) {
  return keccak256(encodeAbiParameters([{ type: 'tuple', components: POOL_KEY_COMPONENTS.map(({ type }) => ({ type })) }], [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]]));
}

// Canonical V4Quoter deployments (hookmate, the address book JB's router uses); missing chains fail closed.
export const V4_QUOTER_BY_CHAIN = {
  1: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',
  10: '0x1f3131a13296fb91c90870043742c3cdbff1a8d7',
  8453: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
  42161: '0x3972c00f7ed4885e145823eb7c655375d275a1c5',
  11155111: '0x61b3f2011a92d183c7dbadbda940a7555ccf9227',
  84532: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
  421614: '0x7de51022d70a725b508085468052e25e22b5c4c9',
};

export const v4QuoterAbi = [{
  type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
    { name: 'zeroForOne', type: 'bool' }, { name: 'exactAmount', type: 'uint128' }, { name: 'hookData', type: 'bytes' },
  ] }],
  outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'gasEstimate', type: 'uint256' }],
}];

// Canonical Uniswap V3 QuoterV2 deployments, matching the factory and wrapped native token the v6 router swaps through.
const V3_QUOTER_BY_CHAIN = {
  1: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  10: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  8453: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  42161: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  84532: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
  421614: '0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B',
  11155111: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
};

const v3QuoterAbi = [{
  type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint256' },
    { name: 'fee', type: 'uint24' }, { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ] }],
  outputs: [
    { name: 'amountOut', type: 'uint256' }, { name: 'sqrtPriceX96After', type: 'uint160' },
    { name: 'initializedTicksCrossed', type: 'uint32' }, { name: 'gasEstimate', type: 'uint256' },
  ],
}];

// The quoters revert with the answer, so they are called, not read.
async function quote(client, quoter, abi, params, chainId, name) {
  if (!quoter) throw new Error(`No supported Uniswap ${name} quoter on chain ${chainId}.`);
  const call = await client.call({ to: quoter, data: encodeFunctionData({ abi, functionName: 'quoteExactInputSingle', args: [params] }) });
  if (!call.data) throw new Error(`Uniswap ${name} quoter returned no data.`);
  return decodeFunctionResult({ abi, functionName: 'quoteExactInputSingle', data: call.data })[0];
}

function quoteUniswapV4ExactInputSingle(client, { chainId, poolKey, zeroForOne, amountIn }) {
  if (amountIn <= 0n || amountIn > UINT128_MAX) throw new Error("Swap amount is outside Uniswap V4's uint128 range.");
  return quote(client, V4_QUOTER_BY_CHAIN[chainId], v4QuoterAbi, { poolKey, zeroForOne, exactAmount: amountIn, hookData: '0x' }, chainId, 'V4');
}

function quoteUniswapV3ExactInputSingle(client, { chainId, tokenIn, tokenOut, fee, amountIn }) {
  return quote(client, V3_QUOTER_BY_CHAIN[chainId], v3QuoterAbi, { tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }, chainId, 'V3');
}

// true when the pool swaps currency0 for currency1, false for the reverse, null when the pair is not the pool's.
function uniswapV4SwapDirection({ poolKey, tokenIn, tokenOut }) {
  const normalize = (token) => (isNativeToken(token) ? zeroAddress : token.toLowerCase());
  const input = normalize(tokenIn);
  const output = normalize(tokenOut);
  const currency0 = poolKey.currency0.toLowerCase();
  const currency1 = poolKey.currency1.toLowerCase();
  if (input === currency0 && output === currency1) return true;
  if (input === currency1 && output === currency0) return false;
  return null;
}

/**
 * A buyback pay specification: 17 words on 1.4, 15 on 1.1.1, which share the first 15. 1.1.1 has no skipSplits
 * and reports no reserved percent, so the ruleset's is used.
 */
function decodeBuybackPaySpec(spec, rulesetReservedPercent) {
  const words = (spec.metadata.length - 2) / 64;
  if (words !== 15 && words < 17) return null;
  const word = (i) => `0x${spec.metadata.slice(2 + i * 64, 2 + (i + 1) * 64)}`;
  const uint = (i) => BigInt(word(i));
  return {
    hook: spec.hook,
    noop: spec.noop,
    projectTokenIs0: uint(0) !== 0n,
    amountToMintWith: uint(1),
    minimumSwapAmountOut: uint(2),
    tokenCountWithoutHook: uint(5),
    weightRatio: uint(6),
    amountToSwapWith: uint(7),
    poolId: word(10),
    rawSwapQuote: uint(13),
    oracleUnseeded: uint(14) !== 0n,
    skipSplits: words >= 17 && uint(15) !== 0n,
    reservedPercent: words >= 17 ? uint(16) : rulesetReservedPercent,
  };
}

/** The controller's beneficiary share of a split mint, rounded the same way. */
function splitOf(tokenCount, reservedPercent) {
  const beneficiaryTokenCount = (tokenCount * (MAX_RESERVED_PERCENT - reservedPercent)) / MAX_RESERVED_PERCENT;
  return { beneficiaryTokenCount, reservedTokenCount: tokenCount - beneficiaryTokenCount };
}

/** Tokens the hook's direct-mint leg issues, as the hook computes them. */
function directMintOf(spec, weight) {
  return spec.amountToMintWith !== 0n && spec.weightRatio !== 0n ? (spec.amountToMintWith * weight) / spec.weightRatio : 0n;
}

/**
 * Fold the buyback hook's pay specification into a terminal preview, with the rule
 * JBPayRouteResolver._effectivePreviewPayTokenCounts scores routes by. The swap leg uses the hook's raw quote
 * (TWAP price times amount, no fee or impact): a ranking figure, not a minimum.
 */
function effectivePayPreview({ buybackHook, beneficiaryTokenCount, reservedTokenCount, weight, reservedPercent, hookSpecifications }) {
  let best = { beneficiaryTokenCount, reservedTokenCount };
  if (!buybackHook || beneficiaryTokenCount !== 0n || reservedTokenCount !== 0n) return best;
  for (const spec of hookSpecifications) {
    if (spec.noop || spec.hook.toLowerCase() !== buybackHook.toLowerCase()) continue;
    const decoded = decodeBuybackPaySpec(spec, reservedPercent);
    if (!decoded) continue;
    const directMintTokenCount = directMintOf(decoded, weight);
    const swapTokenCount = !decoded.oracleUnseeded && decoded.rawSwapQuote > decoded.minimumSwapAmountOut ? decoded.rawSwapQuote : decoded.minimumSwapAmountOut;
    const candidate = splitOf(decoded.skipSplits ? directMintTokenCount : swapTokenCount + directMintTokenCount, decoded.reservedPercent);
    if (decoded.skipSplits) candidate.beneficiaryTokenCount += swapTokenCount;
    if (candidate.beneficiaryTokenCount > best.beneficiaryTokenCount || (candidate.beneficiaryTokenCount === best.beneficiaryTokenCount && candidate.reservedTokenCount > best.reservedTokenCount)) {
      best = candidate;
    }
  }
  return best;
}

/** What the payer receives if the hook mints instead of swapping; every honest settlement clears it. */
function mintEntitlementOf(spec, weight) {
  const swapLeg = spec.skipSplits ? spec.tokenCountWithoutHook : splitOf(spec.tokenCountWithoutHook, spec.reservedPercent).beneficiaryTokenCount;
  return swapLeg + splitOf(directMintOf(spec, weight), spec.reservedPercent).beneficiaryTokenCount;
}

/** One terminal preview, with the project's buyback spec decoded. */
async function readPay(client, { chainId, terminal, projectId, token, amount, beneficiary, metadata = '0x' }) {
  const [ruleset, beneficiaryTokenCount, reservedTokenCount, hookSpecifications] = await client.readContract({
    address: terminal,
    abi: getABI('JBMultiTerminal', chainId),
    functionName: 'previewPayFor',
    args: [projectId, token, amount, beneficiary, metadata],
  });
  // Only a payment with hook specs needs to know which one is the buyback hook.
  const directBuybackHook = hookSpecifications.length > 0 ? await directBuybackHookOf(client, chainId, projectId, ruleset) : null;
  const buybackHook = directBuybackHook ?? (hookSpecifications.length > 0 ? await resolvedBuybackHookOf(client, chainId, projectId) : null);
  const reservedPercent = (ruleset.metadata >> 4n) & 0xffffn;
  const spec = buybackHook ? hookSpecifications.find((s) => s.hook.toLowerCase() === buybackHook.toLowerCase()) : undefined;
  return {
    preview: effectivePayPreview({ buybackHook, beneficiaryTokenCount, reservedTokenCount, weight: ruleset.weight, reservedPercent, hookSpecifications }),
    terminalBeneficiaryTokenCount: beneficiaryTokenCount,
    weight: ruleset.weight,
    buyback: spec ? decodeBuybackPaySpec(spec, reservedPercent) : null,
    unreadableSwap: !!spec && !spec.noop && !decodeBuybackPaySpec(spec, reservedPercent),
    directBuybackHook,
  };
}

// Only this read of the omnichain deployer: its full ABI would weigh on every pay card.
const extraDataHookOfAbi = [{
  type: 'function', name: 'extraDataHookOf', stateMutability: 'view',
  inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'rulesetId', type: 'uint256' }],
  outputs: [{ name: 'hook', type: 'tuple', components: [
    { name: 'dataHook', type: 'address' }, { name: 'useDataHookForPay', type: 'bool' }, { name: 'useDataHookForCashOut', type: 'bool' },
  ] }],
}];

/**
 * Buyback hook 1.4 when the ruleset's pay data hook is that hook itself, or the omnichain deployer forwarding to
 * it, rather than the registry. The hook then reads only metadata keyed to its own address.
 */
async function directBuybackHookOf(client, chainId, projectId, ruleset) {
  if (((ruleset.metadata >> 80n) & 1n) === 0n) return null;
  let buyback, omnichain;
  try {
    buyback = v6Address('JBBuybackHook', chainId);
    omnichain = v6Address('JBOmnichainDeployer', chainId);
  } catch {
    return null;
  }
  const is = (a, b) => a.toLowerCase() === b.toLowerCase();
  const dataHook = checksumAddress(`0x${(ruleset.metadata >> 82n).toString(16).padStart(40, '0').slice(-40)}`);
  if (is(dataHook, buyback)) return buyback;
  if (!is(dataHook, omnichain)) return null;
  const extra = await client.readContract({ address: omnichain, abi: extraDataHookOfAbi, functionName: 'extraDataHookOf', args: [projectId, BigInt(ruleset.id)] });
  return extra.useDataHookForPay && is(extra.dataHook, buyback) ? buyback : null;
}

/** The buyback hook the registry resolves for a project, or null. */
async function resolvedBuybackHookOf(client, chainId, projectId) {
  let registry;
  try {
    registry = v6Address('JBBuybackHookRegistry', chainId);
  } catch {
    return null;
  }
  // A failed read throws: guessing "no hook" would drop the payment's minimum.
  const hook = await client.readContract({ address: registry, abi: getABI('JBBuybackHookRegistry', chainId), functionName: 'hookOf', args: [projectId] });
  return hook === zeroAddress ? null : hook;
}

/**
 * The buyback pool a payment's spec reports, and the terminal token it is keyed to, or null. A router converts
 * the paid token first, so its pool is keyed to another token the project accepts. The pool id is the key's hash.
 */
async function buybackPoolOf(client, { chainId, hook, projectId, token, poolId }) {
  const poolOf = async (terminalToken) => ({
    terminalToken,
    key: await client.readContract({ address: hook, abi: poolKeyOfAbi, functionName: 'poolKeyOf', args: [projectId, isNativeToken(terminalToken) ? zeroAddress : terminalToken] }),
  });
  const paid = await poolOf(token);
  if (uniswapV4PoolId(paid.key) === poolId) return paid;
  const contexts = await getAccountingContexts(client, { chainId, projectId });
  const pools = await Promise.all(contexts.filter((c) => c.token.toLowerCase() !== token.toLowerCase()).map((c) => poolOf(c.token)));
  return pools.find((p) => uniswapV4PoolId(p.key) === poolId) ?? null;
}

// The terminal preview's outputs, which the router's preview returns too; identical on every chain.
const PREVIEW_PAY_FOR_OUTPUTS = getABI('JBMultiTerminal').find((item) => item.type === 'function' && item.name === 'previewPayFor').outputs;

// Only these reads of the router and core: their full ABIs would weigh on every pay card.
const routerConversionAbi = [
  { type: 'function', name: 'projectIdOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'primaryTerminalOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'token', type: 'address' }], outputs: [{ name: '', type: 'address' }] },
  {
    type: 'function', name: 'previewTerminalPayOf', stateMutability: 'view',
    inputs: [
      { name: 'destTerminal', type: 'address' }, { name: 'projectId', type: 'uint256' }, { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' }, { name: 'beneficiary', type: 'address' }, { name: 'metadata', type: 'bytes' },
    ],
    outputs: PREVIEW_PAY_FOR_OUTPUTS,
  },
  { type: 'function', name: 'terminalsOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'terminalOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'ROUTER', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'wrappedNativeToken', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  {
    type: 'function', name: 'previewSwapAmountOutOf', stateMutability: 'view',
    inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'metadata', type: 'bytes' }],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'discoverBestPool', stateMutability: 'view',
    inputs: [{ name: 'normalizedTokenIn', type: 'address' }, { name: 'normalizedTokenOut', type: 'address' }],
    outputs: [{ name: '', type: 'tuple', components: [
      { name: 'isV4', type: 'bool' }, { name: 'v3Pool', type: 'address' }, { name: 'v4Key', type: 'tuple', components: POOL_KEY_COMPONENTS },
    ] }],
  },
];

const v3PoolFeeAbi = [{ type: 'function', name: 'fee', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint24' }] }];

/**
 * Whether a payment to `terminal` reaches the current router: directly, through the gateway, or through the
 * registry's terminal for the project (which may be the gateway). The conversion reads quote that router.
 */
async function reachesRouter(client, chainId, projectId, terminal) {
  const addressOf = (name) => {
    try {
      return v6Address(name, chainId).toLowerCase();
    } catch {
      return null;
    }
  };
  let reached = terminal.toLowerCase();
  if (reached === addressOf('JBRouterTerminalRegistry')) {
    reached = (await client.readContract({ address: terminal, abi: routerConversionAbi, functionName: 'terminalOf', args: [projectId] })).toLowerCase();
  }
  if (reached === addressOf('JBRouterTerminalGateway')) {
    reached = (await client.readContract({ address: reached, abi: routerConversionAbi, functionName: 'ROUTER' })).toLowerCase();
  }
  const router = addressOf('JBRouterTerminal');
  return router !== null && reached === router;
}

/**
 * What the router terminal's swap of the whole payment into tokenOut is quoted to return (fee and impact
 * included), and the floor it reverts below. Null when the route is not that one swap, such as when the router
 * cashes a project token out first.
 */
async function routerConversionOf(client, { chainId, tokenIn, tokenOut, amount }) {
  const router = v6Address('JBRouterTerminal', chainId);
  const abi = routerConversionAbi;
  const [sourceProjectId, wrapped] = await Promise.all([
    client.readContract({ address: v6Address('JBTokens', chainId), abi, functionName: 'projectIdOf', args: [tokenIn] }),
    client.readContract({ address: router, abi, functionName: 'wrappedNativeToken' }),
  ]);
  // The router cashes a project token out before any swap.
  if (sourceProjectId !== 0n) return null;
  const isNative = (t) => isNativeToken(t) || t.toLowerCase() === zeroAddress;
  const wrap = (t) => (isNative(t) ? wrapped : t);
  // The router wraps or unwraps the native token 1:1, without a pool.
  if (wrap(tokenIn).toLowerCase() === wrap(tokenOut).toLowerCase()) return null;
  const [floor, pool] = await Promise.all([
    client.readContract({ address: router, abi, functionName: 'previewSwapAmountOutOf', args: [tokenIn, tokenOut, amount, '0x'] }),
    client.readContract({ address: router, abi, functionName: 'discoverBestPool', args: [wrap(tokenIn), wrap(tokenOut)] }),
  ]);
  let expected;
  if (pool.isV4) {
    // V4 pools hold the native token itself, which the router uses for wrapped input.
    const unwrap = (t) => (wrap(t).toLowerCase() === wrapped.toLowerCase() ? zeroAddress : t);
    const zeroForOne = uniswapV4SwapDirection({ poolKey: pool.v4Key, tokenIn: unwrap(tokenIn), tokenOut: unwrap(tokenOut) });
    if (zeroForOne === null) return null;
    try {
      expected = await quoteUniswapV4ExactInputSingle(client, { chainId, poolKey: pool.v4Key, zeroForOne, amountIn: amount });
    } catch (error) {
      if (poolCannotFill(error)) return null;
      throw error;
    }
  } else {
    expected = await quoteUniswapV3ExactInputSingle(client, {
      chainId,
      tokenIn: wrap(tokenIn),
      tokenOut: wrap(tokenOut),
      fee: await client.readContract({ address: pool.v3Pool, abi: v3PoolFeeAbi, functionName: 'fee' }),
      amountIn: amount,
    });
  }
  return expected >= floor ? { expected, floor } : null;
}

/**
 * The destination terminal's preview of a router payment whose conversion returns what it is quoted to, and the
 * router's floor. Null when the route is not one swap of the whole payment.
 */
async function quotedRoutePreviewOf(client, { chainId, projectId, tokenIn, tokenOut, amount, beneficiary, metadata }) {
  const conversion = await routerConversionOf(client, { chainId, tokenIn, tokenOut, amount });
  if (!conversion) return null;
  const abi = routerConversionAbi;
  const destination = await client.readContract({ address: v6Address('JBDirectory', chainId), abi, functionName: 'primaryTerminalOf', args: [projectId, tokenOut] });
  const [, beneficiaryTokenCount, reservedTokenCount, specs] = await client.readContract({
    address: v6Address('JBRouterTerminal', chainId),
    abi,
    functionName: 'previewTerminalPayOf',
    args: [destination, projectId, tokenOut, conversion.expected, beneficiary, metadata],
  });
  return { preview: { beneficiaryTokenCount, reservedTokenCount }, specs, floor: conversion.floor };
}

/**
 * The buyback spec the destination returns when the router's conversion returns what it is quoted to, and the
 * router's floor. Null when the route is not one swap of the whole payment. `swaps`: the hook would swap, so a
 * swap this cannot read throws.
 */
async function routedBuybackSpecOf(client, { hook, reservedPercent, swaps, ...route }) {
  const routed = await quotedRoutePreviewOf(client, route);
  if (!routed) return null;
  const raw = routed.specs.find((s) => s.hook.toLowerCase() === hook.toLowerCase());
  const spec = raw && decodeBuybackPaySpec(raw, reservedPercent);
  // A swap the destination reports but this cannot read has no safe minimum.
  if (swaps && raw && !raw.noop && !spec) throw new PaySwapQuoteFailedError();
  return spec ? { spec, floor: routed.floor } : null;
}

/** Why prepareUserPay refuses a buyback spec it cannot read. */
export const PAY_SPEC_UNREADABLE_MESSAGE = "The project's buyback hook swaps with an unknown specification, so no safe minimum can be set.";

/** What to tell the payer when a prepared payment has quoteFailed: its minimum is only the fallback. */
export const PAY_QUOTE_FAILED_MESSAGE = "Couldn't load the market price, so this payment's minimum may be lower than usual.";

/** The line to show, with a Retry, for PaySwapQuoteFailedError. */
export const PAY_SWAP_QUOTE_FAILED_MESSAGE = 'The swap quote could not be loaded.';

/**
 * prepareUserPay refused a payment the buyback hook would swap: its quote or a read after it failed, even on a
 * retry, came back empty or could not be decoded, or the minimum without a quote is zero. Nothing can be sent
 * until a new prepare succeeds; `cause` holds the read's error, if one failed.
 */
export class PaySwapQuoteFailedError extends Error {
  constructor(cause) {
    super(PAY_SWAP_QUOTE_FAILED_MESSAGE);
    this.code = 'PAY_SWAP_QUOTE_FAILED';
    this.name = 'PaySwapQuoteFailedError';
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause, configurable: true });
  }
}

/**
 * The revert data on viem's error cause chain: `raw` for contract reads, `data` on the RPC's execution-reverted
 * error (code 3) for plain calls. Other errors' `data`, such as a decoder's, is not a revert.
 */
function revertDataOf(error) {
  for (let e = error; e; e = e.cause) {
    if (typeof e.raw === 'string') return e.raw;
    if (e.code === 3 && typeof e.data === 'string') return e.data;
  }
  return undefined;
}

/** Whether a preview reverted with JBBuybackHook_SpecifiedSlippageExceeded. */
function rejectsMinimum(error) {
  return !!revertDataOf(error)?.startsWith('0xe2d708a9');
}

/**
 * Whether a V4 quote reverted because the pool cannot fill the whole amount: NotEnoughLiquidity(poolId), which the
 * quoter wraps in UnexpectedRevertBytes(bytes). That is the pool's state, not a dropped read.
 */
function poolCannotFill(error) {
  // Selector, then the bytes' offset (0x20) and length (0x24: a selector and a pool id), then NotEnoughLiquidity.
  return !!revertDataOf(error)?.startsWith(`0x6190b2b0${'20'.padStart(64, '0')}${'24'.padStart(64, '0')}7a5ed734`);
}

/**
 * Prepare a person's payment: preview it with buildUserPayMetadata, and set the minimum the terminal enforces
 * on the beneficiary's balance. When the buyback hook would swap, quote its pool (fee and impact included) and
 * send the slippage-floored quote as an explicit minimum, re-previewed so the payment stays on the mint path if
 * the hook would not swap with it. Behind a router that converts the paid token with one swap, the pool is the
 * one in the converted token, quoted on the conversion's quote. When the project has no buyback hook and accepts
 * one token, a router payment's minimum is what minting the quoted conversion issues, instead of the router's
 * floor.
 *
 * Otherwise (no pool, or a pool that cannot fill the swap) the minimum is the payer's mint entitlement when the
 * hook would swap, else the terminal's own issuance. A failed read is retried once. When the hook would swap, a
 * quote or read that fails twice, comes back empty or cannot be decoded, or a mint entitlement that floors to
 * zero, throws PaySwapQuoteFailedError: a swap never goes out on a minimum a failed read set, or on none. On a
 * payment the hook would not swap, reads that fail twice return `quoteFailed`, so the payer can be told the
 * pool's rate is not protected (PAY_QUOTE_FAILED_MESSAGE). A direct buyback hook (ruleset data hook, or through
 * the omnichain deployer) gets metadata keyed to itself.
 *
 * slippageBps: tolerance on the pool quote and on the fallback minimum (default 1%). skipSplits: whether the
 * beneficiary keeps swapped tokens without the reserved split (default true, as a pay card does).
 */
export async function prepareUserPay(client, { tiers, slippageBps = PAY_DEFAULT_SLIPPAGE_BPS, skipSplits = true, ...args }) {
  const { chainId, projectId, token } = args;
  let metadata = buildUserPayMetadata({ chainId, tiers, skipSplits });
  let read = await readPay(client, { ...args, metadata });
  // The direct hook ignores the registry's entry: preview again with its own.
  const hook = read.directBuybackHook;
  if (hook) {
    metadata = buildUserPayMetadata({ chainId, tiers, skipSplits, hook });
    read = await readPay(client, { ...args, metadata });
  }
  const { preview, terminalBeneficiaryTokenCount, weight, buyback, unreadableSwap } = read;
  if (unreadableSwap) throw new Error(PAY_SPEC_UNREADABLE_MESSAGE);
  const fallback = {
    metadata,
    preview,
    minReturnedTokens: slippageFloor(
      buyback && !buyback.noop
        // The swap and the leftover mint each round down once.
        ? maxBigInt(mintEntitlementOf(buyback, weight) - 2n, 0n)
        : terminalBeneficiaryTokenCount,
      slippageBps,
    ),
  };
  // The hook would swap: a failed read or a zero minimum refuses the payment instead of sending it unprotected.
  const swaps = !!buyback && !buyback.noop && buyback.amountToSwapWith !== 0n;
  const mintPath = () => {
    if (swaps && fallback.minReturnedTokens === 0n) throw new PaySwapQuoteFailedError();
    return fallback;
  };
  // Reads on a swap route go through a watched client, one per attempt, that records a read that fails, comes
  // back empty or resolves to nothing, so a lost read is told apart from a route that does not apply (no quoter,
  // an amount out of range).
  const watch = () => {
    const attempt = { readFailed: false };
    const lost = (error) => {
      attempt.readFailed = true;
      throw error;
    };
    const reads = !swaps ? client : {
      ...client,
      async readContract(parameters) {
        let result;
        try {
          result = await client.readContract(parameters);
        } catch (error) {
          lost(error);
        }
        return result ?? lost(new Error('The read returned nothing.'));
      },
      async call(parameters) {
        let result;
        try {
          result = await client.call(parameters);
        } catch (error) {
          lost(error);
        }
        if (!result?.data) attempt.readFailed = true;
        return result;
      },
    };
    return { attempt, reads };
  };
  // A failed read is retried once: a dropped request must not silently weaken the minimum.
  const withRetry = async (prepare) => {
    try {
      return await prepare(watch().reads);
    } catch {
      const { attempt, reads } = watch();
      try {
        return await prepare(reads);
      } catch (error) {
        if (error instanceof PaySwapQuoteFailedError) throw error;
        // Only this module's own plain errors mean the route does not apply; viem's errors and malformed answers
        // (a TypeError) are failed reads.
        if (swaps && (attempt.readFailed || Object.getPrototypeOf(error) !== Error.prototype)) throw new PaySwapQuoteFailedError(error);
        return { ...mintPath(), quoteFailed: true };
      }
    }
  };
  const isRouter = args.terminal.toLowerCase() !== v6Address('JBMultiTerminal', chainId).toLowerCase();
  if (!buyback && isRouter) {
    // The router previews minting on its conversion's floor, which sits up to its sigmoid slippage below the
    // pool's quote. Require what minting the quoted conversion issues when the router has only that route: the
    // project's one terminal is the multi-terminal, accepting one token, and the payment reaches the router these
    // reads quote.
    return withRetry(async () => {
      const [terminals, contexts, viaRouter] = await Promise.all([
        client.readContract({ address: v6Address('JBDirectory', chainId), abi: routerConversionAbi, functionName: 'terminalsOf', args: [projectId] }),
        getAccountingContexts(client, { chainId, projectId }),
        reachesRouter(client, chainId, projectId, args.terminal),
      ]);
      const tokenOut = contexts.length === 1 ? contexts[0].token : null;
      const multiTerminal = v6Address('JBMultiTerminal', chainId).toLowerCase();
      if (!viaRouter || !tokenOut || terminals.length !== 1 || terminals[0].toLowerCase() !== multiTerminal) return fallback;
      const routed = await quotedRoutePreviewOf(client, { chainId, projectId, tokenIn: token, tokenOut, amount: args.amount, beneficiary: args.beneficiary, metadata });
      if (!routed) return fallback;
      return { metadata, preview: routed.preview, minReturnedTokens: slippageFloor(routed.preview.beneficiaryTokenCount, slippageBps) };
    });
  }
  if (!buyback || buyback.amountToSwapWith === 0n) return fallback;

  return withRetry(async (watched) => {
    const pool = await buybackPoolOf(watched, { chainId, hook: buyback.hook, projectId, token, poolId: buyback.poolId });
    if (!pool) return mintPath();
    let swap = buyback;
    if (pool.terminalToken !== token) {
      // A router converts the payment first, and its preview gave the hook the router's slippage floor. Quote
      // what the hook receives when the conversion returns its quote; a conversion well below it then fails.
      const routed = await routedBuybackSpecOf(watched, {
        chainId,
        projectId,
        tokenIn: token,
        tokenOut: pool.terminalToken,
        amount: args.amount,
        beneficiary: args.beneficiary,
        metadata,
        hook: buyback.hook,
        reservedPercent: buyback.reservedPercent,
        swaps,
      });
      // The floor preview must be this route's: no more than the floor reached the hook.
      if (!routed || routed.floor < buyback.amountToSwapWith || routed.spec.poolId !== buyback.poolId) return mintPath();
      swap = routed.spec;
    }
    let quoted;
    try {
      quoted = await quoteUniswapV4ExactInputSingle(watched, { chainId, poolKey: pool.key, zeroForOne: !swap.projectTokenIs0, amountIn: swap.amountToSwapWith });
    } catch (error) {
      // The hook mints when its pool cannot fill, so the mint minimum holds.
      if (poolCannotFill(error)) return mintPath();
      throw error;
    }
    const minimumSwapAmountOut = slippageFloor(quoted, slippageBps);
    // The pool loses to minting: leave the payment on the mint path.
    if (minimumSwapAmountOut <= swap.tokenCountWithoutHook) return mintPath();
    const quotedMetadata = buildUserPayMetadata({ chainId, tiers, minimumSwapAmountOut, skipSplits, ...(hook ? { hook } : {}) });
    // The hook rejects a minimum it cannot route, such as on a pool with no liquidity in range, and then the
    // payment stays on the mint path.
    let quotedPreview;
    try {
      quotedPreview = await watched.readContract({
        address: args.terminal,
        abi: getABI('JBMultiTerminal', chainId),
        functionName: 'previewPayFor',
        args: [projectId, token, args.amount, args.beneficiary, quotedMetadata],
      });
    } catch (error) {
      if (rejectsMinimum(error)) return mintPath();
      throw error;
    }
    const [, quotedBeneficiaryCount, quotedReservedCount, quotedSpecs] = quotedPreview;
    // It must still swap, and in the quoted pool: a router may pick another route.
    const quotedSpec = quotedSpecs.find((s) => s.hook.toLowerCase() === buyback.hook.toLowerCase());
    if (swaps && quotedSpec && !quotedSpec.noop && !decodeBuybackPaySpec(quotedSpec, buyback.reservedPercent)) throw new PaySwapQuoteFailedError();
    if (!quotedSpec || quotedSpec.noop || decodeBuybackPaySpec(quotedSpec, buyback.reservedPercent)?.poolId !== buyback.poolId) return mintPath();
    // A router folds the hook's estimate into its counts, so only the multi-terminal's own counts are its issuance.
    const issuedByTerminal = isRouter
      ? { beneficiaryTokenCount: 0n, reservedTokenCount: 0n }
      : { beneficiaryTokenCount: quotedBeneficiaryCount, reservedTokenCount: quotedReservedCount };
    const directMint = directMintOf(swap, weight);
    // The swapped tokens skip the split, or are reminted through it with the direct mint. The terminal's own
    // issuance, such as for NFT splits, adds.
    const settle = (swapTokenCount) => {
      const split = swap.skipSplits ? splitOf(directMint, swap.reservedPercent) : splitOf(swapTokenCount + directMint, swap.reservedPercent);
      return {
        beneficiaryTokenCount: (swap.skipSplits ? swapTokenCount : 0n) + split.beneficiaryTokenCount + issuedByTerminal.beneficiaryTokenCount,
        reservedTokenCount: split.reservedTokenCount + issuedByTerminal.reservedTokenCount,
      };
    };
    return { metadata: quotedMetadata, preview: settle(quoted), minReturnedTokens: settle(minimumSwapAmountOut).beneficiaryTokenCount };
  });
}

/**
 * Pay metadata telling a project's JB721 tiers hook to mint tiers: abi.encode(bool allowOverspending,
 * uint16[] tierIdsToMint), keyed to METADATA_ID_TARGET (the shared implementation, not the clone: the clone's
 * id makes the hook ignore the tiers). hookAddress is a deprecated alias.
 */
export function build721PayMetadata({ metadataIdTarget, hookAddress, tierIdsToMint, allowOverspending = DEFAULT_ALLOW_OVERSPENDING }) {
  const target = metadataIdTarget ?? hookAddress;
  if (!target) throw new Error('build721PayMetadata requires metadataIdTarget');
  const tierPayload = encodeAbiParameters([{ type: 'bool' }, { type: 'uint16[]' }], [allowOverspending, tierIdsToMint.map(Number)]);
  return createHookMetadata([hookMetadataId(target, 'pay')], [tierPayload]);
}

/** Buyback hook 1.4.0's three-word pay quote. A nonzero minimum is a settlement guarantee; zero uses the oracle floor. */
export function buildBuybackPayMetadata({ hook, amountToSwapWith, minimumSwapAmountOut, skipSplits = false }) {
  return createHookMetadata([hookMetadataId(hook, 'pay')], [
    encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }], [amountToSwapWith, minimumSwapAmountOut, skipSplits]),
  ]);
}

/**
 * A pay card's metadata: the buyback registry's quote (0, minimumSwapAmountOut, skipSplits), plus the 721 tiers
 * when the payment buys NFTs. hook keys the quote to a buyback hook the ruleset calls directly. Prefer
 * prepareUserPay, which picks the minimum and the hook.
 */
export function buildUserPayMetadata({ chainId, tiers, minimumSwapAmountOut = 0n, skipSplits = true, hook = v6Address('JBBuybackHookRegistry', chainId) }) {
  const ids = [hookMetadataId(hook, 'pay')];
  const data = [encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }], [0n, minimumSwapAmountOut, skipSplits])];
  if (tiers && tiers.tierIdsToMint.length > 0) {
    ids.push(hookMetadataId(tiers.metadataIdTarget, 'pay'));
    data.push(encodeAbiParameters([{ type: 'bool' }, { type: 'uint16[]' }], [tiers.allowOverspending ?? DEFAULT_ALLOW_OVERSPENDING, tiers.tierIdsToMint.map(Number)]));
  }
  return createHookMetadata(ids, data);
}
