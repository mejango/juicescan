// Per-component transaction arg-builder tests. Each component's inline executeTransaction({...}) arg-building
// was extracted into a pure buildXArgs() so the money path is pinned by a round-trip-through-the-ABI test
// plus value/decimals/recipient/slippage assertions. Grows as each transaction is covered.
import { describe, it, expect } from 'vitest';
import { encodeFunctionData, decodeFunctionData, parseEther, parseUnits } from 'viem';
import { NATIVE_TOKEN } from '../src/component-base.js';
import { buildPayArgs, payAbi } from '../src/pay-component.js';
import { buildCashOutArgs, cashOutMinReclaimed, cashOutAbi } from '../src/cashout-component.js';
import { buildMintArgs, mintTokensAbi } from '../src/mint-component.js';
import { buildBurnArgs, burnTokensAbi } from '../src/burn-component.js';
import { buildDeployErc20Args, deployERC20Abi } from '../src/deploy-erc20-component.js';
import { buildSendReservedArgs, sendReservedAbi } from '../src/reserved-component.js';
import { buildSetPermissionsArgs, setPermissionsAbi } from '../src/permissions-component.js';
import { buildSendPayoutsArgs, sendPayoutsAbi } from '../src/payouts-component.js';
import { safeExecArgs, SAFE_EXEC_ABI } from '../src/safe.js';

const CTRL = '0x4444444444444444444444444444444444444444';
const PERM = '0x5555555555555555555555555555555555555555';
const SALT32 = '0x' + '00'.repeat(32);

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const BOB = '0x2222222222222222222222222222222222222222';
const TERMINAL = '0x3333333333333333333333333333333333333333';
const okRoute = (received) => ({ address: TERMINAL, contractName: 'JBMultiTerminal', preview: received != null ? { received, unavailable: false } : null });
const roundTrips = (abi, fn, args) => decodeFunctionData({ abi, data: encodeFunctionData({ abi, functionName: fn, args }) }).args.length === args.length;

describe('pay — JBMultiTerminal.pay', () => {
  it('native: value = amount, no approval, args round-trip the ABI', () => {
    const tx = buildPayArgs({ chainId: 1, projectId: 5, token: NATIVE_TOKEN, amount: parseEther('1'), beneficiary: BOB, memo: 'hi', route: okRoute(parseEther('100')) });
    expect(tx.value).toBe(parseEther('1'));
    expect(tx.tokenAddr).toBeNull();
    expect(tx.args[0]).toBe(5n);
    expect(tx.args[1]).toBe(NATIVE_TOKEN);
    expect(tx.args[2]).toBe(parseEther('1'));
    expect(tx.args[3]).toBe(BOB);
    expect(roundTrips(payAbi, 'pay', tx.args)).toBe(true);
  });
  it('slippage floor = 99% of previewed received (regression — was 0n via missing state.preview.received)', () => {
    const tx = buildPayArgs({ chainId: 1, projectId: 5, token: NATIVE_TOKEN, amount: parseEther('1'), beneficiary: BOB, memo: '', route: okRoute(parseEther('100')) });
    expect(tx.args[4]).toBe((parseEther('100') * 99n) / 100n);
    expect(tx.args[4]).toBeGreaterThan(0n);
  });
  it('no preview → minReturned 0 (the unpriced path the user accepted)', () => {
    const tx = buildPayArgs({ chainId: 1, projectId: 5, token: NATIVE_TOKEN, amount: parseEther('1'), beneficiary: BOB, memo: '', route: okRoute(null) });
    expect(tx.args[4]).toBe(0n);
  });
  it('ERC20 (6-dec USDC): value 0, approves the terminal for the exact amount', () => {
    const tx = buildPayArgs({ chainId: 1, projectId: 5, token: USDC, amount: parseUnits('250', 6), beneficiary: BOB, memo: '', route: okRoute(parseEther('100')) });
    expect(tx.value).toBe(0n);
    expect(tx.tokenAddr).toBe(USDC);
    expect(tx.spenderAddr).toBe(TERMINAL);
    expect(tx.approvalAmount).toBe(250000000n);
  });
});

describe('cashout — JBMultiTerminal.cashOutTokensOf', () => {
  it('minReclaimed = 95% of the previewed reclaim', () => {
    expect(cashOutMinReclaimed(parseEther('100'))).toBe((parseEther('100') * 95n) / 100n);
  });
  it('minReclaimed 0 when reclaim is unknown or zero (preview failed / delay active)', () => {
    expect(cashOutMinReclaimed(null)).toBe(0n);
    expect(cashOutMinReclaimed(0n)).toBe(0n);
    expect(cashOutMinReclaimed(undefined)).toBe(0n);
  });
  it('args carry the floor + count + token, and round-trip the ABI', () => {
    const tx = buildCashOutArgs({ chainId: 1, terminalAddr: TERMINAL, holder: BOB, projectId: 7, cashOutCount: parseEther('10'), tokenToReclaim: NATIVE_TOKEN, beneficiary: BOB, minReclaimed: cashOutMinReclaimed(parseEther('100')) });
    expect(tx.args[1]).toBe(7n);
    expect(tx.args[2]).toBe(parseEther('10'));
    expect(tx.args[3]).toBe(NATIVE_TOKEN);
    expect(tx.args[4]).toBe((parseEther('100') * 95n) / 100n);
    expect(tx.args[5]).toBe(BOB);
    expect(roundTrips(cashOutAbi, 'cashOutTokensOf', tx.args)).toBe(true);
  });
});

describe('mint — JBController.mintTokensOf', () => {
  it('args (count, beneficiary, useReservedPercent) + round-trip', () => {
    const tx = buildMintArgs({ chainId: 1, controllerAddr: CTRL, projectId: 5, tokenCount: parseEther('100'), beneficiary: BOB, memo: '', useReservedPercent: true });
    expect(tx.args[0]).toBe(5n);
    expect(tx.args[1]).toBe(parseEther('100'));
    expect(tx.args[2]).toBe(BOB);
    expect(tx.args[4]).toBe(true);
    expect(roundTrips(mintTokensAbi, 'mintTokensOf', tx.args)).toBe(true);
  });
});

describe('burn — JBController.burnTokensOf', () => {
  it('args (holder, projectId, count) + round-trip', () => {
    const tx = buildBurnArgs({ chainId: 1, controllerAddr: CTRL, holder: BOB, projectId: 5, tokenCount: parseEther('10'), memo: 'bye' });
    expect(tx.args[0]).toBe(BOB);
    expect(tx.args[1]).toBe(5n);
    expect(tx.args[2]).toBe(parseEther('10'));
    expect(roundTrips(burnTokensAbi, 'burnTokensOf', tx.args)).toBe(true);
  });
});

describe('deploy ERC-20 — JBController.deployERC20For', () => {
  it('args (name, symbol, salt) + round-trip', () => {
    const tx = buildDeployErc20Args({ chainId: 1, controllerAddr: CTRL, projectId: 5, name: 'Token', symbol: 'TKN', salt: SALT32 });
    expect(tx.args[0]).toBe(5n);
    expect(tx.args[1]).toBe('Token');
    expect(tx.args[2]).toBe('TKN');
    expect(tx.args[3]).toBe(SALT32);
    expect(roundTrips(deployERC20Abi, 'deployERC20For', tx.args)).toBe(true);
  });
});

describe('send reserved — JBController.sendReservedTokensToSplitsOf', () => {
  it('single projectId arg + round-trip', () => {
    const tx = buildSendReservedArgs({ chainId: 1, controllerAddr: CTRL, projectId: 9 });
    expect(tx.args[0]).toBe(9n);
    expect(roundTrips(sendReservedAbi, 'sendReservedTokensToSplitsOf', tx.args)).toBe(true);
  });
});

describe('permissions — JBPermissions.setPermissionsFor', () => {
  it('packs operator + projectId + permissionIds tuple; round-trips', () => {
    const tx = buildSetPermissionsArgs({ chainId: 1, permissionsAddr: PERM, account: BOB, operator: BOB, projectId: 7, permissionIds: [1, 34, 35] });
    expect(tx.args[0]).toBe(BOB);
    expect(tx.args[1].operator).toBe(BOB);
    expect(tx.args[1].projectId).toBe(7);
    expect(tx.args[1].permissionIds).toEqual([1, 34, 35]);
    expect(roundTrips(setPermissionsAbi, 'setPermissionsFor', tx.args)).toBe(true);
  });
});

describe('send payouts — JBMultiTerminal.sendPayoutsOf', () => {
  it('currency encodes as uint256 (H1 selector fix); args round-trip', () => {
    const cur = Number(BigInt(USDC) & 0xffffffffn);
    const tx = buildSendPayoutsArgs({ chainId: 1, terminalAddr: TERMINAL, projectId: 5, token: USDC, amount: parseUnits('100', 6), currency: cur, minPaidOut: 0n });
    expect(tx.args[0]).toBe(5n);
    expect(tx.args[1]).toBe(USDC);
    expect(tx.args[2]).toBe(100000000n);
    expect(tx.args[3]).toBe(BigInt(cur));
    expect(roundTrips(sendPayoutsAbi, 'sendPayoutsOf', tx.args)).toBe(true);
  });
});

describe('Safe — GnosisSafe.execTransaction', () => {
  it('builds the exec tuple (to/value/data/operation + gas defaults + signatures); round-trips', () => {
    const tx = { to: TERMINAL, value: '1000000000000000000', data: '0xabcdef', operation: 0 };
    const sigs = '0x' + '11'.repeat(65);
    const args = safeExecArgs(tx, sigs);
    expect(args[0].toLowerCase()).toBe(TERMINAL.toLowerCase());
    expect(args[1]).toBe(10n ** 18n);
    expect(args[2]).toBe('0xabcdef');
    expect(args[3]).toBe(0);
    expect(args[4]).toBe(0n); // safeTxGas defaults
    expect(args[9]).toBe(sigs);
    expect(roundTrips(SAFE_EXEC_ABI, 'execTransaction', args)).toBe(true);
  });
});
