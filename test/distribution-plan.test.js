import { describe, expect, it, vi } from 'vitest';
import { assertPayoutDistributionFresh, preparePayoutDistributions, prepareReservedDistributions } from '../src/distribution-plan.js';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';
const request = (over = {}) => ({ chainId: 8453, chainName: 'Base', projectId: 12n, terminal: A, controller: B,
  token: C, decimals: 6, accountingCurrency: 123n, rulesetId: 77n, cycleNumber: 1n, currency: 123n, amount: 5000000n, ...over });
const live = (row, over = {}) => ({ ...row, limits: [{ currency: row.currency, remaining: row.amount, available: row.amount }], ...over });

describe('selected payout preparation', () => {
  it('keeps different local IDs, tokens, decimal scales, currencies and exact/nonexact output floors', async () => {
    const rows = [request(), request({ chainId: 10, chainName: 'Optimism', projectId: 99n, token: B,
      controller: C, decimals: 18, accountingCurrency: 456n, currency: 2n, amount: 1000000000000000000n })];
    const quote = vi.fn(async row => row.chainId === 8453 ? 5000000n : 2000000000000000000n);
    const result = await preparePayoutDistributions(rows, async cid => live(rows.find(row => row.chainId === cid)), quote);
    expect(result[0].args).toEqual([12n, C, 5000000n, 123n, 5000000n]);
    expect(result[1].args).toEqual([99n, B, 1000000000000000000n, 2n, 1980000000000000000n]);
    expect(rows[0]).not.toHaveProperty('args');
  });

  it.each(['projectId', 'token', 'terminal', 'controller', 'decimals', 'accountingCurrency', 'rulesetId', 'cycleNumber'])('refuses changed %s before quoting', async key => {
    const row = request();
    const changed = typeof row[key] === 'string' ? A : typeof row[key] === 'bigint' ? row[key] + 1n : row[key] + 1;
    const override = { [key]: changed === row[key] ? C : changed };
    const quote = vi.fn();
    await expect(preparePayoutDistributions([row], async () => live(row, override), quote)).rejects.toThrow(/configuration changed/);
    expect(quote).not.toHaveBeenCalled();
  });

  it('rejects insufficient limits/balances and missing selected currencies', () => {
    const row = request();
    expect(() => assertPayoutDistributionFresh(row, live(row, { limits: [] }))).toThrow(/limit/);
    expect(() => assertPayoutDistributionFresh(row, live(row, { limits: [{ currency: 123n, remaining: 1n, available: 5000000n }] }))).toThrow(/limit/);
    expect(() => assertPayoutDistributionFresh(row, live(row, { limits: [{ currency: 123n, remaining: 5000000n, available: 1n }] }))).toThrow(/balance/);
    expect(() => assertPayoutDistributionFresh({ ...row, amount: 0n }, live(row))).toThrow(/positive/);
  });

  it('propagates permission/simulation failures and rejects zero quotes', async () => {
    const row = request();
    await expect(preparePayoutDistributions([row], async () => live(row), async () => { throw new Error('SEND_PAYOUTS permission'); })).rejects.toThrow(/SEND_PAYOUTS/);
    await expect(preparePayoutDistributions([row], async () => live(row), async () => 0n)).rejects.toThrow(/no tokens/);
  });
});

describe('selected reserved-token distributions', () => {
  it('uses each destination’s current controller and project ID', async () => {
    const chains = [{ id: 8453, name: 'Base' }, { id: 10, name: 'Optimism' }];
    const calls = await prepareReservedDistributions(chains, async cid => cid === 8453
      ? { projectId: 12n, controller: A, pending: 1n }
      : { projectId: 99n, controller: B, pending: 50n });
    expect(calls.map(call => [call.chainId, call.controller, call.args, call.pending]))
      .toEqual([[8453, A, [12n], 1n], [10, B, [99n], 50n]]);
  });

  it('refuses empty or failed destination reads instead of treating them as successful distributions', async () => {
    const chains = [{ id: 8453, name: 'Base' }];
    await expect(prepareReservedDistributions(chains, async () => ({ projectId: 12n, controller: A, pending: 0n }))).rejects.toThrow(/Nothing is pending/);
    await expect(prepareReservedDistributions(chains, async () => { throw new Error('RPC unavailable'); })).rejects.toThrow(/RPC unavailable/);
  });
});
