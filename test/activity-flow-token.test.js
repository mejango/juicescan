// Activity token labels. Pay/cash-out/payout/add-to-balance rows carry their own indexed token, decimals and
// symbol; an unresolved token falls back to the indexed USD value. Swaps index no token, so they are labeled
// only when EVERY chain has a single accounting context and all agree on the same token shape (kind,
// symbol, decimals); a project with 6-dec USDC on one chain and an 18-dec context on another would
// otherwise mislabel remote amounts by 1e12.
import { describe, it, expect } from 'vitest';
import { accountingContextsFromRow, activityRowFromEvent, flowTokenFromContexts, isProjectFeedActivityRow, mergeSameTxActivityRows } from '../src/discover.js';
import { NATIVE_TOKEN } from '../src/component-base.js';

const USDC_BASE = { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainId: 8453, decimals: 6, symbol: 'USDC', currency: 1n };
const USDC_OP = { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', chainId: 10, decimals: 6, symbol: 'USDC', currency: 1n };
const NATIVE = { address: NATIVE_TOKEN, decimals: 18, symbol: 'ETH', currency: 1n };
const CUSTOM_18 = { address: '0x1111111111111111111111111111111111111111', chainId: 8453, decimals: 18, symbol: 'JBX', currency: 5n };

function payEventOn(chainId, token) {
  return {
    chainId: chainId,
    txHash: '0xaa',
    timestamp: 1700000000,
    from: '0xabc0000000000000000000000000000000000abc',
    payEvent: {
      ...token,
      amount: '2500000', // 2.5 USDC in 6-dec raw units; 2.5e-12 in 18-dec units
      amountUsd: '2500000000000000000', // $2.50 (18-dec scaled)
      newlyIssuedTokenCount: '1000000000000000000',
      beneficiary: '0xabc0000000000000000000000000000000000abc',
      timestamp: 1700000000,
      txHash: '0xaa',
    },
  };
}

function buybackEventOn(chainId) {
  return {
    chainId: chainId,
    txHash: '0xbb',
    timestamp: 1700000000,
    from: '0xabc0000000000000000000000000000000000abc',
    swapEvent: {
      terminalTokenAmount: '1859478',
      projectTokenAmount: '4000000000000000000000',
      from: '0xabc0000000000000000000000000000000000abc',
      timestamp: 1700000000,
      txHash: '0xbb',
    },
  };
}

describe('accountingContextsFromRow', () => {
  it('reads a single-token Bendystraw row as one context, symbol filled from known tokens', () => {
    const row = { accountingTokenCount: 1, token: USDC_BASE.address.toLowerCase(), decimals: 6, tokenSymbol: null };
    expect(accountingContextsFromRow({}, 8453, row)).toEqual([{ address: row.token, chainId: 8453, decimals: 6, symbol: 'USDC' }]);
    expect(flowTokenFromContexts([
      accountingContextsFromRow({}, 8453, row),
      accountingContextsFromRow({}, 10, { accountingTokenCount: 1, token: USDC_OP.address.toLowerCase(), decimals: 6, tokenSymbol: 'USDC' }),
    ])).toEqual({ symbol: 'USDC', decimals: 6 });
  });

  it('rejects rows with several or unknown accounting tokens, or missing fields', () => {
    const native = { token: '0x000000000000000000000000000000000000eeee', decimals: 18, tokenSymbol: 'ETH' };
    expect(accountingContextsFromRow({}, 1, { ...native, accountingTokenCount: 2 })).toBeNull();
    expect(accountingContextsFromRow({}, 1, { ...native })).toBeNull();
    expect(accountingContextsFromRow({}, 1, { accountingTokenCount: 1, token: CUSTOM_18.address, decimals: 18, tokenSymbol: null })).toBeNull();
    expect(accountingContextsFromRow({}, 1, null)).toBeNull();
    expect(flowTokenFromContexts([accountingContextsFromRow({}, 1, { ...native, accountingTokenCount: 1 })])).toEqual({ symbol: 'ETH', decimals: 18 });
  });
});

describe('flowTokenFromContexts', () => {
  it('rejects the token label when chains disagree on decimals (6-dec USDC vs 18-dec context)', () => {
    expect(flowTokenFromContexts([[USDC_BASE], [CUSTOM_18]])).toBeNull();
  });

  it('accepts the same token kind across chains even when the per-chain address differs (USDC)', () => {
    expect(flowTokenFromContexts([[USDC_BASE], [USDC_OP]])).toEqual({ symbol: 'USDC', decimals: 6 });
  });

  it('accepts native ETH on every chain', () => {
    expect(flowTokenFromContexts([[NATIVE], [NATIVE]])).toEqual({ symbol: 'ETH', decimals: 18 });
  });

  it('rejects a native context on one chain vs an ERC-20 on another', () => {
    expect(flowTokenFromContexts([[NATIVE], [CUSTOM_18]])).toBeNull();
  });

  it('rejects two different tokens that share a symbol and decimals', () => {
    const lookalike = { ...CUSTOM_18, address: '0x2222222222222222222222222222222222222222', chainId: 10 };
    expect(flowTokenFromContexts([[CUSTOM_18], [lookalike]])).toBeNull();
    expect(flowTokenFromContexts([[CUSTOM_18], [{ ...CUSTOM_18, chainId: 10 }]])).toBeNull();
    expect(flowTokenFromContexts([[CUSTOM_18], [{ ...CUSTOM_18 }]])).toEqual({ symbol: 'JBX', decimals: 18 });
  });

  it('rejects when any chain has multiple contexts, a failed read, or no contexts', () => {
    expect(flowTokenFromContexts([[USDC_BASE, NATIVE], [USDC_OP]])).toBeNull();
    expect(flowTokenFromContexts([[USDC_BASE], null])).toBeNull();
    expect(flowTokenFromContexts([[USDC_BASE], []])).toBeNull();
    expect(flowTokenFromContexts([])).toBeNull();
    expect(flowTokenFromContexts(null)).toBeNull();
  });
});

describe('activity rows across chains with differing contexts', () => {
  it('keeps holder permission grants out of the project feed', () => {
    const project = { chainId: 8453, tokenSymbol: 'ART' };
    const permission = activityRowFromEvent({
      chainId: 8453,
      txHash: '0xpermission',
      timestamp: 1700000000,
      from: '0xabc0000000000000000000000000000000000abc',
      operatorPermissionsSetEvent: {
        account: '0xabc0000000000000000000000000000000000abc',
        operator: '0x1111111111111111111111111111111111111111',
        timestamp: 1700000000,
        txHash: '0xpermission',
      },
    }, project);

    expect(permission.type).toBe('operator_perms');
    expect(isProjectFeedActivityRow(permission)).toBe(false);
    expect(isProjectFeedActivityRow(activityRowFromEvent(payEventOn(8453), project))).toBe(true);
  });

  it('labels each event with its own indexed token, whatever the project accounts in', () => {
    const project = { chainId: 8453, tokenSymbol: 'REV', _flowToken: { symbol: 'ETH', decimals: 18 } };
    const usdc = { token: USDC_BASE.address.toLowerCase(), decimals: 6, tokenSymbol: 'USDC' };
    expect(activityRowFromEvent(payEventOn(8453, usdc), project).baseAmount).toBe('2.50 USDC');
    expect(activityRowFromEvent(payEventOn(10, { token: USDC_OP.address, decimals: 6, tokenSymbol: 'USDC' }), project).baseAmount).toBe('2.50 USDC');
  });

  it('fills a missing symbol from the known token list and otherwise falls back to USD', () => {
    const project = { chainId: 8453, tokenSymbol: 'REV' };
    expect(activityRowFromEvent(payEventOn(8453, { token: USDC_BASE.address, decimals: 6, tokenSymbol: null }), project).baseAmount).toBe('2.50 USDC');
    expect(activityRowFromEvent(payEventOn(8453, { token: CUSTOM_18.address, decimals: 18, tokenSymbol: null }), project).baseAmount).toBe('$2.50');
    expect(activityRowFromEvent(payEventOn(8453, { token: null, decimals: null, tokenSymbol: null }), project).baseAmount).toBe('$2.50');
    expect(activityRowFromEvent(payEventOn(8453), { chainId: 8453, _flowToken: { symbol: 'USDC', decimals: 6 } }).baseAmount).toBe('$2.50');
  });

  it('labels cash outs, payouts and additions with their own token', () => {
    const project = { chainId: 8453, tokenSymbol: 'REV' };
    const eth = { token: NATIVE_TOKEN.toLowerCase(), decimals: 18, tokenSymbol: 'ETH' };
    const base = { chainId: 8453, txHash: '0xcc', timestamp: 1, from: '0xabc0000000000000000000000000000000000abc' };
    const cash = activityRowFromEvent({ ...base, cashOutTokensEvent: { ...eth, cashOutCount: '1', reclaimAmount: '500000000000000000', reclaimAmountUsd: null } }, project);
    const payout = activityRowFromEvent({ ...base, sendPayoutsEvent: { ...eth, amountPaidOut: '2000000000000000000', amountPaidOutUsd: null } }, project);
    const added = activityRowFromEvent({ ...base, addToBalanceEvent: { token: null, decimals: null, tokenSymbol: null, amount: '7', amountUsd: '3000000000000000000' } }, project);
    expect(cash.baseAmount).toBe('0.5 ETH');
    expect(payout.baseAmount).toBe('2 ETH');
    expect(added.baseAmount).toBe('$3.00');
  });

  it('totals a fan-out in its token only when every pay shares it', () => {
    const project = { chainId: 8453, tokenSymbol: 'REV' };
    const usdc = { token: USDC_BASE.address, decimals: 6, tokenSymbol: 'USDC' };
    const eth = { token: NATIVE_TOKEN, decimals: 18, tokenSymbol: 'ETH' };
    const pay = (token, beneficiary) => activityRowFromEvent({ ...payEventOn(8453, token), payEvent: { ...payEventOn(8453, token).payEvent, beneficiary, from: '0xpayer' } }, project);
    expect(mergeSameTxActivityRows([pay(usdc, '0x1'), pay(usdc, '0x2')], project)[0].baseAmount).toBe('5 USDC');
    expect(mergeSameTxActivityRows([pay(usdc, '0x1'), pay(eth, '0x2')], project)[0].baseAmount).toBe('$5.00');
    // Same token, one row without its symbol: the known token fills it, so the total keeps its unit.
    const bare = { token: USDC_BASE.address.toLowerCase(), decimals: 6, tokenSymbol: null };
    const noUsd = (token, beneficiary) => { const row = pay(token, beneficiary); row.rawAmountUsd = null; return row; };
    expect(mergeSameTxActivityRows([noUsd(usdc, '0x1'), noUsd(bare, '0x2')], project)[0].baseAmount).toBe('5 USDC');
  });

  it('shows the terminal-token amount paid for a buyback order', () => {
    const project = { chainId: 8453, tokenSymbol: 'ART', _flowToken: flowTokenFromContexts([[USDC_BASE]]) };
    const row = activityRowFromEvent(buybackEventOn(8453), project);
    expect(row.baseAmount).toBe('1.86 USDC');
    expect(row.tokenAmount).toBe('');
    expect(row.action).toBe('bought 4k ART via the buyback pool');
  });

  it('does not guess the buyback terminal token when accounting contexts are ambiguous', () => {
    const project = { chainId: 8453, tokenSymbol: 'ART', _flowToken: null };
    expect(activityRowFromEvent(buybackEventOn(8453), project).baseAmount).toBe('');
  });
});
