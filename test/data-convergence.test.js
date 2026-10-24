import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { cashOutDirectRouteWins, rawAccountingBalanceSummary } from '../src/discover.js';
import { NATIVE_TOKEN } from '../src/component-base.js';

const source = readFileSync('src/discover.js', 'utf8');
const custom = '0x1111111111111111111111111111111111111111';
function actual(start, end, dependencies) {
  const context = vm.createContext({ NATIVE_TOKEN, USDC_BY_CHAIN: {}, ...dependencies });
  vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
  return context;
}

describe('chain-qualified accounting identity and read completeness', () => {
  it('never adds unrelated equal-address custom balances across chains', () => {
    const row = { token: custom, decimals: 0, symbol: 'XYZ' };
    expect(rawAccountingBalanceSummary([{ ...row, chainId: 1, balance: 1n }, { ...row, chainId: 10, balance: 2n }])).toBe('1 XYZ + 2 XYZ');
    expect(rawAccountingBalanceSummary([{ ...row, chainId: 1, balance: 1n }, { ...row, chainId: 1, balance: 2n }])).toBe('3 XYZ');
    expect(rawAccountingBalanceSummary([{ ...row, balance: 0n }, { ...row, balance: null }])).toBe('—');
  });

  it('scopes custom funds descriptors and their aggregate reads to the owning chain', async () => {
    const reads = [];
    const ctx = actual('function accountingTokenContextKey(', '// If one held token', {});
    vm.runInContext(source.slice(source.indexOf('function customFundsKind('), source.indexOf('\nfunction fundsKindAuditLabel')), ctx);
    Object.assign(ctx, { getAddress: () => 'terminal', pidOn: () => 1n, storeBalanceAbi: [], read: async (chainId) => { reads.push(chainId); return 5n; } });
    vm.runInContext(source.slice(source.indexOf('function totalBalanceForKind('), source.indexOf('// Reconcile the lightweight tab probe')), ctx);
    const kind = ctx.customFundsKind({ address: custom, symbol: 'XYZ', decimals: 0 }, 1);
    expect(kind.key).toBe('1:' + custom);
    expect(kind.addrForChain(1)).toBe(custom);
    expect(kind.addrForChain(10)).toBeNull();
    expect(await ctx.totalBalanceForKind({ chains: [{ id: 1 }, { id: 10 }] }, kind)).toBe(5n);
    expect(reads).toEqual([1]);
  });

  it('does not mark unread accounting balances complete when the standard terminal is unlisted', async () => {
    const context = actual('function fetchOps(', '\nfunction emptyCard(', {
      pidOn: () => 1n,
      getAddress: (name) => name === 'JBMultiTerminal' ? 'terminal' : null,
      read: async (_chain, _contract, _abi, fn) => fn === 'terminalsOf' ? [] : null,
      controllerOfAbi: [], terminalsOfAbi: [],
      resolveAcctToken: async () => null,
      readChainBalances: async () => ({ verified: true, tokens: [{ token: custom, balance: null, decimals: 18, symbol: 'XYZ' }] }),
      routerTerminalFor: () => null,
      sameAddr: (a, b) => a === b,
    });
    const [row] = await context.fetchOps({ chains: [{ id: 1, name: 'Ethereum' }] });
    expect(row.tokens[0].balance).toBeNull();
    expect(row.tokensVerified).toBe(false);
  });

  it('shows no complete-looking per-chain amount or total when one token read fails', async () => {
    const rows = [{ id: 1, name: 'Ethereum', supply: null, tokensVerified: false, tokens: [{ token: NATIVE_TOKEN, balance: 0n, decimals: 18, symbol: 'ETH' }, { token: custom, balance: null, decimals: 18, symbol: 'XYZ' }] }];
    const rendered = [];
    const context = actual('function accountingTokenContextKey(', '// If one held token', {});
    Object.assign(context, {
      el: () => document.createElement('div'), skelOpsTable: () => document.createElement('div'),
      fetchOps: async () => rows,
      opsRow: (...args) => { rendered.push(args); return document.createElement('div'); },
      toBigInt: BigInt,
    });
    vm.runInContext(source.slice(source.indexOf('function renderAcrossChainsBody('), source.indexOf('// Which bridge infra')), context);
    context.renderAcrossChainsBody({ tokenSymbol: 'XYZ' });
    await vi.waitFor(() => expect(rendered).toHaveLength(3));
    expect(rendered[1][2]).toBe('—');
    expect(rendered[2][2]).toBe('—');
  });

  it('keeps same-symbol accounting contexts in distinct balance table cells', async () => {
    const other = '0x2222222222222222222222222222222222222222';
    const context = actual('function accountingTokenContextKey(', '// If one held token', {});
    const kinds = [custom, other].map((address) => ({ symbol: 'XYZ', decimals: 0, addrForChain: () => address }));
    Object.assign(context, {
      el: (_tag, className) => { const node = document.createElement('div'); node.className = className || ''; return node; },
      chainLogo: () => document.createElement('span'),
      getEffectiveAccount: () => null,
      acctKindsForFunds: async () => kinds,
      fetchBalanceBreakdown: async () => ({ chainVerified: { 1: true }, rows: [
        { chainId: 1, token: custom, decimals: 0, symbol: 'XYZ', balance: 1n, contextKey: '1:' + custom + '@0' },
        { chainId: 1, token: other, decimals: 0, symbol: 'XYZ', balance: 2n, contextKey: '1:' + other + '@0' },
      ] }),
      formatAmount: (amount) => String(amount),
    });
    vm.runInContext(source.slice(source.indexOf('function renderBalanceTables('), source.indexOf('// The protocol fee on payouts/cash outs')), context);
    const table = document.createElement('div');
    context.renderBalanceTables(table, { chains: [{ id: 1, name: 'Ethereum' }] }, 'TOK');
    await vi.waitFor(() => expect([...table.querySelectorAll('.cashout-tbl-num')].map((node) => node.textContent)).toEqual(['1', '2']));
  });

  it('withholds a direct sell when the spendable wallet balance is unknown', () => {
    expect(cashOutDirectRouteWins(200n, 100n, 100, null, 1n)).toBe(false);
    expect(cashOutDirectRouteWins(200n, 100n, 100, 1n, 1n)).toBe(true);
  });
});
