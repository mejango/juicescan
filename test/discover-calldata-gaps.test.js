import { describe, expect, it } from 'vitest';
import { decodeFunctionData, encodeFunctionData, parseEther, toFunctionSelector } from 'viem';
import { getABI } from '../src/abi-registry.js';
import { NATIVE_TOKEN } from '../src/component-base.js';
import {
  buildAddToBalanceArgs,
  buildAdjustTiersArgs,
  buildAutoIssueArgs,
} from '../src/discover.js';
import { build721TierConfig } from '../src/nft721-build.js';

const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const TERMINAL = '0x3333333333333333333333333333333333333333';
const ROUTER = '0x4444444444444444444444444444444444444444';
const REV_OWNER = '0x5555555555555555555555555555555555555555';
const HOOK = '0x6666666666666666666666666666666666666666';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

function canonicalRoundTrip(tx, contractName) {
  const canonicalAbi = getABI(contractName);
  const canonicalFunction = canonicalAbi.find((item) =>
    item.type === 'function' && item.name === tx.functionName && item.inputs.length === tx.args.length);
  expect(canonicalFunction).toBeTruthy();
  const data = encodeFunctionData({ abi: tx.abi, functionName: tx.functionName, args: tx.args });
  expect(data.slice(0, 10)).toBe(toFunctionSelector(canonicalFunction));
  return decodeFunctionData({ abi: canonicalAbi, data });
}

describe('add to balance — JBMultiTerminal/JBRouterTerminalRegistry.addToBalanceOf', () => {
  it('pins the active native terminal target, value, amount, held-fee choice, memo, and metadata', () => {
    const amount = parseEther('1.25');
    const tx = buildAddToBalanceArgs({
      chainId: 1,
      terminalAddr: TERMINAL,
      projectId: 42,
      token: NATIVE_TOKEN,
      amount,
      memo: 'top up treasury',
      metadata: '0x1234',
      viaRouter: false,
    });

    expect(tx).toMatchObject({
      chainId: 1,
      address: TERMINAL,
      contractName: 'JBMultiTerminal',
      functionName: 'addToBalanceOf',
      value: amount,
      tokenAddr: null,
      spenderAddr: null,
      approvalAmount: null,
    });
    const decoded = canonicalRoundTrip(tx, 'JBMultiTerminal');
    expect(decoded.functionName).toBe('addToBalanceOf');
    expect(decoded.args[0]).toBe(42n);
    expect(decoded.args[1].toLowerCase()).toBe(NATIVE_TOKEN.toLowerCase());
    expect(decoded.args[2]).toBe(amount);
    expect(decoded.args[3]).toBe(false);
    expect(decoded.args[4]).toBe('top up treasury');
    expect(decoded.args[5]).toBe('0x1234');
  });

  it('pins the identical router selector and keeps routed ERC-20 value/approval semantics explicit', () => {
    const amount = 25_000_000n;
    const tx = buildAddToBalanceArgs({
      chainId: 8453,
      terminalAddr: ROUTER,
      projectId: 7,
      token: USDC,
      amount,
      memo: '',
      metadata: '0xabcd',
      viaRouter: true,
    });

    expect(tx).toMatchObject({
      chainId: 8453,
      address: ROUTER,
      contractName: 'JBRouterTerminalRegistry',
      value: 0n,
      tokenAddr: null,
      spenderAddr: null,
      approvalAmount: null,
    });
    const decoded = canonicalRoundTrip(tx, 'JBRouterTerminalRegistry');
    expect(decoded.args[0]).toBe(7n);
    expect(decoded.args[1].toLowerCase()).toBe(USDC.toLowerCase());
    expect(decoded.args[2]).toBe(amount);
    expect(decoded.args[3]).toBe(false);
    expect(decoded.args[5]).toBe('0xabcd');
  });

  it('keeps a directly accepted ERC-20 approval bounded to the exact terminal and amount', () => {
    const tx = buildAddToBalanceArgs({
      chainId: 1, terminalAddr: TERMINAL, projectId: 3, token: USDC, amount: 9_000_000n,
    });
    expect(tx.value).toBe(0n);
    expect(tx.tokenAddr).toBe(USDC);
    expect(tx.spenderAddr).toBe(TERMINAL);
    expect(tx.approvalAmount).toBe(9_000_000n);
    expect(tx.args.slice(3)).toEqual([false, '', '0x']);
  });
});

describe('auto issuance — REVOwner.autoIssueFor', () => {
  it('pins target, chain, zero value, revnet/stage ids, and beneficiary against the generated ABI', () => {
    const tx = buildAutoIssueArgs({
      chainId: 10,
      revOwnerAddr: REV_OWNER,
      revnetId: 91,
      stageId: 123456789,
      beneficiary: BOB,
    });

    expect(tx).toMatchObject({
      chainId: 10,
      address: REV_OWNER,
      contractName: 'REVOwner',
      functionName: 'autoIssueFor',
      value: 0n,
    });
    const decoded = canonicalRoundTrip(tx, 'REVOwner');
    expect(decoded.args).toEqual([91n, 123456789n, BOB]);
  });
});

describe('shop item adjustment — JB721TiersHook.adjustTiers', () => {
  it('round-trips every added tier field through the generated contract ABI', () => {
    const tier = build721TierConfig({
      price: 123456789n,
      initialSupply: 250,
      votingUnits: 3,
      reserveFrequency: 5,
      reserveBeneficiary: ALICE,
      encodedIpfsUri: '0x' + 'ab'.repeat(32),
      category: 9,
      discountPercent: 20,
      flags: {
        allowOwnerMint: true,
        transfersPausable: true,
        cantBeRemoved: true,
        cantIncreaseDiscountPercent: true,
        cantBuyWithCredits: true,
      },
      splitPercent: 500_000_000,
      splits: [{
        percent: 1_000_000_000,
        projectId: 0n,
        beneficiary: BOB,
        preferAddToBalance: false,
        lockedUntil: 0,
        hook: ALICE,
      }],
    });
    const tx = buildAdjustTiersArgs({
      chainId: 42161, hookAddr: HOOK, tiersToAdd: [tier], tierIdsToRemove: [],
    });

    expect(tx).toMatchObject({
      chainId: 42161,
      address: HOOK,
      contractName: 'JB721TiersHook',
      functionName: 'adjustTiers',
      value: 0n,
    });
    const decoded = canonicalRoundTrip(tx, 'JB721TiersHook');
    const added = decoded.args[0][0];
    expect(decoded.args[1]).toEqual([]);
    expect(added.price).toBe(123456789n);
    expect(added.initialSupply).toBe(250);
    expect(added.votingUnits).toBe(3);
    expect(added.reserveFrequency).toBe(5);
    expect(added.reserveBeneficiary).toBe(ALICE);
    expect(added.encodedIpfsUri).toBe('0x' + 'ab'.repeat(32));
    expect(added.category).toBe(9);
    expect(added.discountPercent).toBe(20);
    expect(added.flags).toEqual(tier.flags);
    expect(added.splitPercent).toBe(500_000_000);
    expect(added.splits[0]).toMatchObject({
      percent: 1_000_000_000,
      projectId: 0n,
      beneficiary: BOB,
      preferAddToBalance: false,
      lockedUntil: 0,
      hook: ALICE,
    });
  });

  it('pins the remove-only overload arguments without inventing an add tier', () => {
    const tx = buildAdjustTiersArgs({
      chainId: 8453, hookAddr: HOOK, tiersToAdd: [], tierIdsToRemove: ['17', 29n],
    });
    const decoded = canonicalRoundTrip(tx, 'JB721TiersHook');
    expect(decoded.args[0]).toEqual([]);
    expect(decoded.args[1]).toEqual([17n, 29n]);
  });
});
