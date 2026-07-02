// Transaction arg-builders extracted from discover.js (loans + cross-chain move). Separate file so the heavy
// discover.js import is isolated. Each builder is round-tripped through its contract ABI + arg-checked.
import { describe, it, expect } from 'vitest';
import { encodeFunctionData, decodeFunctionData, parseEther } from 'viem';
import { NATIVE_TOKEN } from '../src/component-base.js';
import { borrowCurrencyForAccountContext, borrowLoanTokenForAccountContext, borrowMinAmountFromPreview, buildBorrowArgs, buildRepayArgs, buildSuckerPrepareArgs, buildSuckerToRemoteArgs, buildClaimTokensArgs, tokenCurrencyIdForAccounting } from '../src/discover.js';
import { buildQueueRulesetsArgs, queueRulesetsAbi } from '../src/queue-ruleset-component.js';
import { buildFundAccessLimitGroups, buildRulesetConfigs, buildSplitGroups, createDefaultFundAccessLimitGroup, createDefaultRuleset, parseRulesetWeight } from '../src/launch-component.js';

const BOB = '0x2222222222222222222222222222222222222222';
const LOANS = '0x4444444444444444444444444444444444444444';
const SUCKER = '0x5555555555555555555555555555555555555555';
const ZERO = '0x0000000000000000000000000000000000000000';
const UINT112_MAX = (1n << 112n) - 1n;
const BEN32 = '0x000000000000000000000000' + '2222222222222222222222222222222222222222'; // bytes32-padded BOB
const META32 = '0x' + '00'.repeat(32);
const roundTrips = (abi, fn, args) => decodeFunctionData({ abi, data: encodeFunctionData({ abi, functionName: fn, args }) }).args.length === args.length;
const defaultRulesetMetadata = {
  reservedPercent: 0,
  cashOutTaxRate: 0,
  baseCurrency: 1,
  pausePay: false,
  pauseCreditTransfers: false,
  allowOwnerMinting: false,
  allowSetCustomToken: true,
  allowTerminalMigration: false,
  allowSetTerminals: true,
  allowSetController: true,
  allowAddAccountingContext: true,
  allowAddPriceFeed: false,
  ownerMustSendPayouts: false,
  holdFees: false,
  useTotalSurplusForCashOuts: false,
  useDataHookForPay: false,
  useDataHookForCashOut: false,
  dataHook: ZERO,
  metadata: 0,
};
function minimalRuleset(overrides = {}) {
  const { metadata, ...rest } = overrides;
  return {
    mustStartAtOrAfter: 0n,
    duration: 0,
    weight: 0n,
    weightCutPercent: 0,
    approvalHook: ZERO,
    metadata: { ...defaultRulesetMetadata, ...(metadata || {}) },
    splitGroups: [],
    fundAccessLimitGroups: [],
    ...rest,
  };
}

describe('loan — REVLoans.borrowFrom', () => {
  it('requires a resolved accounting token before building the borrow token arg', () => {
    const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    expect(borrowLoanTokenForAccountContext(null, true)).toBe(null);
    expect(borrowLoanTokenForAccountContext(null, false)).toBe(null);
    expect(borrowLoanTokenForAccountContext({ address: NATIVE_TOKEN }, false)).toBe(NATIVE_TOKEN);
    expect(borrowLoanTokenForAccountContext({ address: usdc }, false)).toBe(usdc);
  });
  it('derives minBorrow from the source token accounting context, not the base-currency preview', () => {
    const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    expect(tokenCurrencyIdForAccounting(NATIVE_TOKEN)).toBe(BigInt(NATIVE_TOKEN) & 0xffffffffn);
    expect(borrowCurrencyForAccountContext({ address: usdc, currency: 12345 })).toBe(12345n);
    expect(borrowCurrencyForAccountContext({ address: usdc })).toBe(BigInt(usdc) & 0xffffffffn);
    expect(borrowMinAmountFromPreview(1000000n)).toBe(990000n);
    expect(borrowMinAmountFromPreview(0n)).toBe(0n);
    expect(borrowMinAmountFromPreview('bad')).toBe(0n);
  });
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

  it('new fund-access rows default to ETH currency, not invalid 0', () => {
    const group = createDefaultFundAccessLimitGroup();
    group.terminal = LOANS;
    group.payoutLimits[0].amount = '100';
    group.surplusAllowances[0].amount = '50';
    const fundAccessLimitGroups = buildFundAccessLimitGroups([group]);
    expect(fundAccessLimitGroups[0].payoutLimits[0].currency).toBe(1);
    expect(fundAccessLimitGroups[0].surplusAllowances[0].currency).toBe(1);

    const tx = buildQueueRulesetsArgs({
      chainId: 1,
      controllerAddr: LOANS,
      projectId: 12,
      rulesetConfigs: [minimalRuleset({ fundAccessLimitGroups })],
      memo: 'fund access',
    });
    const back = decodeFunctionData({ abi: queueRulesetsAbi, data: encodeFunctionData({ abi: queueRulesetsAbi, functionName: 'queueRulesetsOf', args: tx.args }) });
    const decodedGroup = back.args[1][0].fundAccessLimitGroups[0];
    expect(decodedGroup.payoutLimits[0].currency).toBe(1);
    expect(decodedGroup.surplusAllowances[0].currency).toBe(1);
  });

  it('drops zero-percent split rows before encoding', () => {
    const splitGroups = buildSplitGroups([{
      groupId: '1',
      splits: [
        { percent: 0, projectId: '', beneficiary: BOB, preferAddToBalance: false, lockedUntil: '', hook: '' },
        { percent: '', projectId: '99', beneficiary: ZERO, preferAddToBalance: false, lockedUntil: '', hook: '' },
        { percent: 500000000, projectId: '', beneficiary: BOB, preferAddToBalance: false, lockedUntil: '', hook: '' },
      ],
    }]);
    expect(splitGroups).toHaveLength(1);
    expect(splitGroups[0].splits).toHaveLength(1);
    expect(splitGroups[0].splits[0].percent).toBe(500000000);

    const tx = buildQueueRulesetsArgs({
      chainId: 1,
      controllerAddr: LOANS,
      projectId: 12,
      rulesetConfigs: [minimalRuleset({ splitGroups })],
      memo: 'splits',
    });
    const back = decodeFunctionData({ abi: queueRulesetsAbi, data: encodeFunctionData({ abi: queueRulesetsAbi, functionName: 'queueRulesetsOf', args: tx.args }) });
    expect(back.args[1][0].splitGroups[0].splits).toHaveLength(1);
    expect(back.args[1][0].splitGroups[0].splits[0].percent).toBe(500000000);
  });

  it('clamps ruleset weight to uint112 before ABI encoding', () => {
    const hugeWeight = '999999999999999999999999999999999999';
    expect(parseRulesetWeight(hugeWeight)).toBe(UINT112_MAX);
    expect(parseRulesetWeight('-1')).toBe(0n);

    const rs = createDefaultRuleset();
    rs.weight = hugeWeight;
    const rulesetConfigs = buildRulesetConfigs([rs]);
    expect(rulesetConfigs[0].weight).toBe(UINT112_MAX);

    const tx = buildQueueRulesetsArgs({
      chainId: 1,
      controllerAddr: LOANS,
      projectId: 12,
      rulesetConfigs,
      memo: 'weight clamp',
    });
    const back = decodeFunctionData({ abi: queueRulesetsAbi, data: encodeFunctionData({ abi: queueRulesetsAbi, functionName: 'queueRulesetsOf', args: tx.args }) });
    expect(back.args[1][0].weight).toBe(UINT112_MAX);
  });
});
