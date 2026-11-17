// The price chart's live refresh. A project with no pool starts no timer. A project with a pool reads the pool
// once per refresh (key and slot0), asks the indexer one counts request, and pages the swap history again only
// when the counts moved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ reads: [], queries: [], hook: null, swapCount: 2, fee: 10000 }));
const ZERO = '0x0000000000000000000000000000000000000000';
const NATIVE = '0x000000000000000000000000000000000000EEEe';
const TOKEN = '0x7777777777777777777777777777777777777777';
vi.mock('../src/wallet.js', async (original) => ({ ...await original(),
  createPublicClientForChain: () => ({
    readContract: async (request) => {
      h.reads.push(request.functionName);
      if (request.functionName === 'controllerOf') return '0x00000000000000000000000000000000000000c0';
      if (request.functionName === 'currentRulesetOf') return [{ id: 1n }, { dataHook: h.hook || ZERO, useDataHookForPay: true, useDataHookForCashOut: true }];
      if (request.functionName === 'accountingContextsOf') return [{ token: NATIVE, decimals: 18, currency: 61166 }];
      if (request.functionName === 'poolKeyOf') return { currency0: ZERO, currency1: TOKEN, fee: h.fee, tickSpacing: 200, hooks: ZERO };
      if (request.functionName === 'extsload') return '0x' + (1n << 96n).toString(16).padStart(64, '0');
      throw new Error('Unread in this test: ' + request.functionName);
    },
  }),
}));
vi.mock('../src/bendystraw-client.js', async (original) => ({ ...await original(),
  bendystrawQuery: async (query) => {
    h.queries.push(query);
    const count = { items: [], totalCount: 0 };
    if (query.includes('swapEvents')) return { swapEvents: { items: [], totalCount: h.swapCount }, buybackPoolEvents: count, buybackPoolLiquidityEvents: count };
    return new Proxy({}, { get: () => count, has: () => true });
  },
}));

import { BENDYSTRAW_POOL_HISTORY_COUNTS_QUERY, BENDYSTRAW_SWAP_EVENTS_QUERY, renderPriceChart } from '../src/discover.js';
import { getAddress } from '../src/abi-registry.js';

const stages = [{ start: 1700000000, weight: 10n ** 21n }];
const project = (id) => ({ id, chainId: 1, tokenSymbol: 'TKN', chains: [{ id: 1, name: 'Ethereum', projectId: id }], metadata: { baseCurrency: 1 } });
const count = (list, wanted) => list.filter((entry) => entry === wanted).length;

describe('price chart live refresh', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; localStorage.clear(); h.reads = []; h.queries = []; h.swapCount = 2; h.fee = 10000; });
  afterEach(() => { vi.useRealTimers(); });

  it('starts no timer for a project with no pool', async () => {
    h.hook = null;
    document.body.appendChild(renderPriceChart(project(11), stages));
    await vi.advanceTimersByTimeAsync(2000);
    const reads = h.reads.length, queries = h.queries.length;
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(h.reads.length).toBe(reads);
    expect(h.queries.length).toBe(queries);
  });

  it('reads the pool once per refresh and pages the history again only when the indexer has new rows', async () => {
    h.hook = getAddress('JBBuybackHook', 1);
    expect(h.hook).toBeTruthy();
    document.body.appendChild(renderPriceChart(project(12), stages));
    await vi.advanceTimersByTimeAsync(2000);
    const slot0 = count(h.reads, 'extsload'), keys = count(h.reads, 'poolKeyOf');
    const pages = count(h.queries, BENDYSTRAW_SWAP_EVENTS_QUERY);
    expect(pages).toBe(1);
    expect(count(h.queries, BENDYSTRAW_POOL_HISTORY_COUNTS_QUERY)).toBe(0);

    // Nothing new: one pool read and one counts request per refresh, no paging.
    await vi.advanceTimersByTimeAsync(30000);
    expect(count(h.reads, 'extsload')).toBe(slot0 + 1);
    expect(count(h.reads, 'poolKeyOf')).toBe(keys + 1);
    expect(count(h.queries, BENDYSTRAW_POOL_HISTORY_COUNTS_QUERY)).toBe(1);
    expect(count(h.queries, BENDYSTRAW_SWAP_EVENTS_QUERY)).toBe(pages);

    // A new swap is indexed: the history is paged again, once.
    h.swapCount = 3;
    await vi.advanceTimersByTimeAsync(30000);
    expect(count(h.queries, BENDYSTRAW_SWAP_EVENTS_QUERY)).toBe(pages + 1);
    expect(count(h.reads, 'extsload')).toBe(slot0 + 2);
    await vi.advanceTimersByTimeAsync(30000);
    expect(count(h.queries, BENDYSTRAW_SWAP_EVENTS_QUERY)).toBe(pages + 1);
    expect(count(h.queries, BENDYSTRAW_POOL_HISTORY_COUNTS_QUERY)).toBe(3);
  });

  it('pages the history again when the project moved to another pool with the same row counts', async () => {
    h.hook = getAddress('JBBuybackHook', 1);
    document.body.appendChild(renderPriceChart(project(13), stages));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(30000);
    const pages = count(h.queries, BENDYSTRAW_SWAP_EVENTS_QUERY);
    h.fee = 3000;
    await vi.advanceTimersByTimeAsync(30000);
    expect(count(h.queries, BENDYSTRAW_SWAP_EVENTS_QUERY)).toBe(pages + 1);
  });
});
