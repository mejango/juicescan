// Transaction-encoding tests: verify the create-flow build functions produce args that round-trip through
// the contract ABIs (no type/arity mismatch, no silent truncation) and encode the right currency/decimals/
// recipient. These guard the money path — a wrong currency id or decimals here mis-prices/mis-routes funds.
import { describe, it, expect } from 'vitest';
import { encodeFunctionData, decodeFunctionData, parseEther, parseUnits } from 'viem';
import { __test } from '../src/create-flow.js';

const {
  initState, buildLaunchArgs, buildRevnetArgs, buildTerminalConfigs, revnetAccept, acctTokenFor,
  assembleRuleset, splitState, fillSplits, customCurrencyId, customAcctDecimals, customAccounting,
  applyAccountingDefaults, uint256FromAddress, deploySalt, priceUnits, fundAccessAmountDecimals, fundAccessUnits,
} = __test;

const NATIVE = '0x000000000000000000000000000000000000EEEe';
const NATIVE_CUR = Number(BigInt(NATIVE) % (1n << 32n)); // 61166
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const HOOK = '0x3333333333333333333333333333333333333333';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // 18-dec
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // 6-dec
const cur32 = (a) => Number(BigInt(a) % (1n << 32n));

// A minimal custom-flow state on Ethereum mainnet with one stage.
function baseState(over = {}) {
  const s = initState();
  s.projectType = 'custom';
  s.network = 'mainnet';
  s.chainIds = [1];
  s.accepts = ['eth'];
  s.details = Object.assign(s.details, { name: 'Test', owner: ALICE });
  return Object.assign(s, over);
}

describe('currency id helpers', () => {
  it('custom currency id == uint32(uint160(token)) and equals the per-token payout currency', () => {
    const s = baseState({ accepts: ['custom'] });
    s.customToken = { address: DAI, name: 'Dai', symbol: 'DAI', decimals: 18, status: 'ok', error: '' };
    // currency id via the helper, via the build's `& 0xffffffff`, and via `% 2^32` must all agree.
    expect(customCurrencyId(s)).toBe(cur32(DAI));
    expect(Number(BigInt(DAI) & 0xffffffffn)).toBe(cur32(DAI));
    expect(customAcctDecimals(s)).toBe(18);
    expect(customAccounting(s)).toBe(true);
  });
  it('uint256FromAddress is the full 160-bit address as a decimal string (split groupId)', () => {
    expect(uint256FromAddress(DAI)).toBe(BigInt(DAI).toString());
  });
});

describe('splitState — JBSplit encoding per recipient type', () => {
  it('wallet → projectId 0, beneficiary = address, hook ZERO', () => {
    const sp = splitState({ type: 'wallet', address: BOB }, 500000000, BOB, 1);
    expect(sp.projectId).toBe(0);
    expect(sp.beneficiary.toLowerCase()).toBe(BOB.toLowerCase());
    expect(BigInt(sp.hook)).toBe(0n);
    expect(sp.percent).toBe(500000000);
  });
  it('project → projectId + beneficiary, hook ZERO; per-chain projectId override honored', () => {
    const sp = splitState({ type: 'project', projectId: 5, address: BOB }, 1, BOB, 1, 7);
    expect(sp.projectId).toBe(7); // override wins
    expect(sp.beneficiary.toLowerCase()).toBe(BOB.toLowerCase());
    expect(BigInt(sp.hook)).toBe(0n);
  });
  it('customhook (valid addr) → hook = address, projectId/beneficiary pass through', () => {
    const sp = splitState({ type: 'customhook', hookAddress: HOOK, projectId: 3, address: BOB }, 1, BOB, 1, 3);
    expect(sp.hook.toLowerCase()).toBe(HOOK.toLowerCase());
    expect(sp.projectId).toBe(3);
  });
  it('customhook (invalid addr) → degrades safely to hook ZERO (no funds to garbage)', () => {
    const sp = splitState({ type: 'customhook', hookAddress: 'not-an-address' }, 1, null, 1);
    expect(BigInt(sp.hook)).toBe(0n);
  });
  it('blank wallet recipient → beneficiary ZERO (caught by the deploy preflight, never silently OK here)', () => {
    const sp = splitState({ type: 'wallet', address: '' }, 1, '', 1);
    expect(BigInt(sp.beneficiary)).toBe(0n);
  });
});

describe('fillSplits — group always sums to a single SPLITS_TOTAL', () => {
  it('two equal shares sum to the same total as three shares', () => {
    const a = fillSplits([1, 1]).reduce((s, x) => s + x, 0);
    const b = fillSplits([1, 1, 1]).reduce((s, x) => s + x, 0);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});

describe('accounting contexts — terminal + revnet', () => {
  it('ETH-only terminal context: native token, 18 dec, native currency', () => {
    const ctx = buildTerminalConfigs(1, baseState({ accepts: ['eth'] }), false)[0].accountingContextsToAccept;
    expect(ctx).toHaveLength(1);
    expect(ctx[0].token.toLowerCase()).toBe(NATIVE.toLowerCase());
    expect(ctx[0].decimals).toBe(18);
    expect(ctx[0].currency).toBe(NATIVE_CUR);
  });
  it('custom-token terminal context: token addr, its decimals, its uint32 currency — and ONLY that token', () => {
    const s = baseState({ accepts: ['custom'] });
    s.customToken = { address: DAI, symbol: 'DAI', decimals: 18, status: 'ok' };
    const ctx = buildTerminalConfigs(1, s, false)[0].accountingContextsToAccept;
    expect(ctx).toHaveLength(1); // custom is exclusive — no native fallback added
    expect(ctx[0].token.toLowerCase()).toBe(DAI.toLowerCase());
    expect(ctx[0].decimals).toBe(18);
    expect(ctx[0].currency).toBe(cur32(DAI));
  });
  it('revnet ETH+USDC accepts TWO accounting contexts (the new multi-token revnet)', () => {
    const s = baseState({ projectType: 'revnet', accepts: ['eth', 'usdc'] });
    const ctx = revnetAccept(s, 1);
    expect(ctx.length).toBe(2);
    expect(ctx.some((c) => c.token.toLowerCase() === NATIVE.toLowerCase() && c.decimals === 18)).toBe(true);
    expect(ctx.some((c) => c.decimals === 6)).toBe(true); // USDC leg
  });
  it('revnet custom token → single custom context, currency = uint32(uint160)', () => {
    const s = baseState({ projectType: 'revnet', accepts: ['custom'] });
    s.customToken = { address: DAI, symbol: 'DAI', decimals: 18, status: 'ok' };
    const ctx = revnetAccept(s, 1);
    expect(ctx).toHaveLength(1);
    expect(ctx[0].currency).toBe(cur32(DAI));
  });
});

describe('launch tx — args round-trip through the JBController ABI', () => {
  it('buildLaunchArgs encodes + decodes without loss (ABI arity/types match)', () => {
    const s = baseState();
    s.stages = [Object.assign(s.stages[0], { weight: '1000', baseCurrency: 1, payoutMode: 'none' })];
    const tx = buildLaunchArgs(s, 1, ALICE, 'ipfs://x', '0x' + '00'.repeat(32), 0);
    expect(tx).toBeTruthy();
    expect(tx.abi).toBeTruthy();
    const fnName = tx.functionName || tx.abi.find((x) => x.type === 'function').name;
    const data = encodeFunctionData({ abi: tx.abi, functionName: fnName, args: tx.args });
    expect(typeof data).toBe('string');
    const back = decodeFunctionData({ abi: tx.abi, data });
    expect(back.functionName).toBe(fnName);
    expect(back.args.length).toBe(tx.args.length);
  });
});

describe('ruleset currency/decimals — the money-pricing path', () => {
  it('custom-token baseCurrency == the custom currency id (no ETH/USD feed needed)', () => {
    const s = baseState({ accepts: ['custom'] });
    s.customToken = { address: DAI, symbol: 'DAI', decimals: 18, status: 'ok' };
    applyAccountingDefaults(s);
    s.stages[0].weight = '1000';
    const rs = assembleRuleset(s, s.stages[0], 0, 1, true, false, 0);
    expect(rs.baseCurrency).toBe(cur32(DAI));
  });
  it('custom-token limited payout: limit amount uses the TOKEN decimals (6-dec token → parseUnits(amt,6))', () => {
    const SIXDEC = '0x000000000000000000000000000000000000d00D';
    const s = baseState({ accepts: ['custom'] });
    s.customToken = { address: SIXDEC, symbol: 'SIX', decimals: 6, status: 'ok' };
    applyAccountingDefaults(s);
    const st = s.stages[0];
    st.weight = '1000';
    st.payoutByKind = { custom: { mode: 'limited', recipients: [{ type: 'wallet', address: BOB, amountEth: '1.5' }] } };
    const rs = assembleRuleset(s, st, 0, 1, true, false, 0);
    const fal = rs.fundAccessLimitGroups || [];
    const lim = fal.flatMap((g) => g.payoutLimits || []).find((l) => l.amount > 0n);
    expect(lim).toBeTruthy();
    expect(lim.amount).toBe(priceUnits('1.5', 6)); // 1500000 — NOT 1.5e18
    expect(lim.currency).toBe(cur32(SIXDEC));
  });
  it('single-token fund access uses token decimals only when the limit currency is token-keyed', () => {
    const s = baseState({ accepts: ['usdc'] });
    const acct = acctTokenFor(s, 1);
    expect(acct.token.toLowerCase()).toBe(USDC.toLowerCase());
    expect(fundAccessAmountDecimals(cur32(USDC), acct)).toBe(6);
    expect(fundAccessAmountDecimals(2, acct)).toBe(18);
    expect(fundAccessUnits('1.5', cur32(USDC), acct)).toBe(parseUnits('1.5', 6));
    expect(fundAccessUnits('1.5', 2, acct)).toBe(parseUnits('1.5', 18));
  });
  it('single-token USDC payout limits round-trip token-keyed and USD currencies at different scales', () => {
    const s = baseState({ accepts: ['usdc'] });
    const st = s.stages[0];
    st.tokenMode = 'none';
    st.payoutMode = 'limited';
    st.payoutRecipients = [{ type: 'wallet', address: BOB, amountEth: '1.5' }];

    st.payoutCurrency = cur32(USDC);
    let rs = assembleRuleset(s, st, 0, 1, true, false, 0);
    let lim = (rs.fundAccessLimitGroups || []).flatMap((g) => g.payoutLimits || [])[0];
    expect(lim.currency).toBe(cur32(USDC));
    expect(lim.amount).toBe(parseUnits('1.5', 6));

    st.payoutCurrency = 2;
    rs = assembleRuleset(s, st, 0, 1, true, false, 0);
    lim = (rs.fundAccessLimitGroups || []).flatMap((g) => g.payoutLimits || [])[0];
    expect(lim.currency).toBe(2);
    expect(lim.amount).toBe(parseUnits('1.5', 18));
  });
  it('single-token USDC surplus allowances use the allowance currency decimals', () => {
    const s = baseState({ accepts: ['usdc'] });
    const st = s.stages[0];
    st.tokenMode = 'none';
    st.payoutMode = 'none';
    st.surplusAllowanceOn = true;
    st.surplusAllowanceUnlimited = false;
    st.surplusAllowanceAmount = '2.25';
    st.surplusAllowanceCurrency = cur32(USDC);
    const rs = assembleRuleset(s, st, 0, 1, true, false, 0);
    const allowance = (rs.fundAccessLimitGroups || []).flatMap((g) => g.surplusAllowances || [])[0];
    expect(allowance.currency).toBe(cur32(USDC));
    expect(allowance.amount).toBe(parseUnits('2.25', 6));
  });
});

describe('deploy salt — deterministic + omnichain-consistent', () => {
  it('same name + owner → same salt; different name → different salt', () => {
    const s = baseState();
    const a = deploySalt(s, ALICE);
    const b = deploySalt(s, ALICE);
    expect(a).toBe(b); // deterministic so omnichain addresses match across chains
    s.details.name = 'Other';
    expect(deploySalt(s, ALICE)).not.toBe(a);
  });
});

describe('revnet tx — args round-trip through REVDeployer.deployFor', () => {
  it('buildRevnetArgs (ETH+USDC) encodes + decodes without loss', () => {
    const s = baseState({ projectType: 'revnet', accepts: ['eth', 'usdc'] });
    s.revBaseCurrency = 1;
    s.details = Object.assign(s.details, { ticker: 'TST' });
    const tx = buildRevnetArgs(s, 1, ALICE, 'ipfs://x', '0x' + '00'.repeat(32), 0);
    expect(tx).toBeTruthy();
    const fnName = tx.functionName || tx.abi.find((x) => x.type === 'function').name;
    const data = encodeFunctionData({ abi: tx.abi, functionName: fnName, args: tx.args });
    const back = decodeFunctionData({ abi: tx.abi, data });
    expect(back.functionName).toBe(fnName);
  });
});
