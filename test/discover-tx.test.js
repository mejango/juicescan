// Transaction arg-builders extracted from discover.js (loans + cross-chain move). Separate file so the heavy
// discover.js import is isolated. Each builder is round-tripped through its contract ABI + arg-checked.
import { describe, it, expect } from 'vitest';
import { encodeFunctionData, decodeFunctionData, parseEther } from 'viem';
import { NATIVE_TOKEN } from '../src/component-base.js';
import { buildBorrowArgs, buildRepayArgs, buildSuckerPrepareArgs, buildSuckerToRemoteArgs, buildClaimTokensArgs } from '../src/discover.js';
import { buildQueueRulesetsArgs, queueRulesetsAbi } from '../src/queue-ruleset-component.js';

const BOB = '0x2222222222222222222222222222222222222222';
const LOANS = '0x4444444444444444444444444444444444444444';
const SUCKER = '0x5555555555555555555555555555555555555555';
const BEN32 = '0x000000000000000000000000' + '2222222222222222222222222222222222222222'; // bytes32-padded BOB
const META32 = '0x' + '00'.repeat(32);
const roundTrips = (abi, fn, args) => decodeFunctionData({ abi, data: encodeFunctionData({ abi, functionName: fn, args }) }).args.length === args.length;

describe('loan — REVLoans.borrowFrom', () => {
  it('arg order matches the ABI + round-trips', () => {
    const tx = buildBorrowArgs({ chainId: 1, loansAddr: LOANS, revnetId: 3, token: NATIVE_TOKEN, minBorrow: 0n, collateral: parseEther('5'), beneficiary: BOB, prepaidFeePercent: 25, holder: BOB });
    expect(tx.args[0]).toBe(3n);
    expect(tx.args[1]).toBe(NATIVE_TOKEN);
    expect(tx.args[2]).toBe(0n);
    expect(tx.args[3]).toBe(parseEther('5'));
    expect(tx.args[4]).toBe(BOB);
    expect(tx.args[5]).toBe(25n);
    expect(tx.args[6]).toBe(BOB);
    expect(roundTrips(tx.abi, 'borrowFrom', tx.args)).toBe(true);
  });
  it('honors a minBorrow floor when supplied (ready for the audit L-4 slippage wiring)', () => {
    const tx = buildBorrowArgs({ chainId: 1, loansAddr: LOANS, revnetId: 3, token: NATIVE_TOKEN, minBorrow: parseEther('99'), collateral: parseEther('5'), beneficiary: BOB, prepaidFeePercent: 0, holder: BOB });
    expect(tx.args[2]).toBe(parseEther('99'));
  });
});

describe('loan — REVLoans.repayLoan (payable)', () => {
  it('value = maxRepay buffer; empty permit2 tuple; round-trips', () => {
    const v = parseEther('10');
    const tx = buildRepayArgs({ chainId: 1, loansAddr: LOANS, loanId: 42, maxRepay: v, collateralToReturn: parseEther('5'), beneficiary: BOB, value: v });
    expect(tx.value).toBe(v);
    expect(tx.args[0]).toBe(42n);
    expect(tx.args[1]).toBe(v);
    expect(tx.args[2]).toBe(parseEther('5'));
    expect(tx.args[3]).toBe(BOB);
    expect(tx.args[4].amount).toBe(0n); // EMPTY_PERMIT2 (no permit signature)
    expect(roundTrips(tx.abi, 'repayLoan', tx.args)).toBe(true);
  });
});

describe('move between chains — JBSucker.prepare → toRemote', () => {
  it('prepare: bridges the accounting token, approves the sucker, round-trips', () => {
    const tx = buildSuckerPrepareArgs({ chainId: 1, sucker: SUCKER, projectTokenCount: parseEther('100'), beneficiary32: BEN32, minReclaimed: 0n, termToken: NATIVE_TOKEN, metadata: META32, approvalToken: NATIVE_TOKEN, approvalAmount: parseEther('100') });
    expect(tx.args[0]).toBe(parseEther('100'));
    expect(tx.args[1]).toBe(BEN32);
    expect(tx.args[2]).toBe(0n);
    expect(tx.args[3]).toBe(NATIVE_TOKEN);
    expect(tx.spenderAddr).toBe(SUCKER);
    expect(tx.approvalAmount).toBe(parseEther('100'));
    expect(roundTrips(tx.abi, 'prepare', tx.args)).toBe(true);
  });
  it('toRemote: payable value = bridge messaging fee; round-trips', () => {
    const tx = buildSuckerToRemoteArgs({ chainId: 1, sucker: SUCKER, termToken: NATIVE_TOKEN, value: parseEther('0.01') });
    expect(tx.value).toBe(parseEther('0.01'));
    expect(tx.args[0]).toBe(NATIVE_TOKEN);
    expect(roundTrips(tx.abi, 'toRemote', tx.args)).toBe(true);
  });
});

describe('claim credits — JBController.claimTokensFor', () => {
  it('args (holder, projectId, count, beneficiary) + round-trip', () => {
    const tx = buildClaimTokensArgs({ chainId: 1, controllerAddr: LOANS, holder: BOB, projectId: 4, tokenCount: parseEther('50'), beneficiary: BOB });
    expect(tx.args[0]).toBe(BOB);
    expect(tx.args[1]).toBe(4n);
    expect(tx.args[2]).toBe(parseEther('50'));
    expect(tx.args[3]).toBe(BOB);
    expect(roundTrips(tx.abi, 'claimTokensFor', tx.args)).toBe(true);
  });
});

describe('queue rulesets — JBController.queueRulesetsOf', () => {
  it('args (projectId, configs, memo) + round-trip with empty configs', () => {
    const tx = buildQueueRulesetsArgs({ chainId: 1, controllerAddr: LOANS, projectId: 12, rulesetConfigs: [], memo: 'note' });
    expect(tx.args[0]).toBe(12n);
    expect(tx.args[1]).toEqual([]);
    expect(tx.args[2]).toBe('note');
    expect(roundTrips(queueRulesetsAbi, 'queueRulesetsOf', tx.args)).toBe(true);
  });
});
