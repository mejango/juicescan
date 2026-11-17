// The activity card reloads its feed only when something changed. A poll tick (every 30 s) sends one probe
// request; the feed, its ruleset rows and the pending payments are read again only when the probe's answer moved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'graphql';

const h = vi.hoisted(() => ({ queries: [], reads: [], newest: 'event-1', failProbe: false, failPending: false }));
vi.mock('../src/wallet.js', async (original) => ({ ...await original(),
  // No suckers and no queued rulesets onchain.
  createPublicClientForChain: () => ({ readContract: async (request) => { h.reads.push(request.functionName); return []; } }),
}));
vi.mock('../src/bendystraw-client.js', async (original) => ({ ...await original(),
  bendystrawQuery: async (query) => {
    h.queries.push(query);
    if (h.failPending && query.includes('PendingPayments')) throw new Error('Bendystraw HTTP 503');
    if (query.includes('activityEvents0:')) {
      if (h.failProbe) throw new Error('Bendystraw HTTP 503');
      return { activityEvents0: { items: [{ id: h.newest }], totalCount: 1 }, rulesetQueuedEvents0: { totalCount: 0 }, routerPendingCalls0: { totalCount: 0 } };
    }
    // Every other query finds nothing.
    return new Proxy({}, { get: () => ({ items: [], totalCount: 0 }), has: () => true });
  },
}));

import { activityProbeKey, activityProbeRequest, BENDYSTRAW_ACTIVITY_PROBE_QUERY, renderActivityCard } from '../src/discover.js';

const project = { id: 7, chainId: 1, chains: [{ id: 1, name: 'Ethereum', projectId: 7 }] };
const probes = () => h.queries.filter((query) => query.includes('activityEvents0:')).length;
const others = () => h.queries.length - probes();

describe('activity probe request', () => {
  it('asks every deployment in one valid document, each under its own aliases and variables', () => {
    const request = activityProbeRequest([{ chainId: 1, projectId: 7 }, { chainId: 8453, projectId: 9 }]);
    const document = parse(request.query);
    expect(document.definitions[0].selectionSet.selections.map((field) => field.alias.value)).toEqual([
      'activityEvents0', 'rulesetQueuedEvents0', 'routerPendingCalls0', 'activityEvents1', 'rulesetQueuedEvents1', 'routerPendingCalls1',
    ]);
    expect(request.variables).toEqual({ version: 6, projectId0: 7, chainId0: 1, projectId1: 9, chainId1: 8453 });
    expect(request.query).toContain('sourceProjectId: $projectId1');
    // The schema check validates the one-deployment form; the combined request only renames it.
    const single = parse(BENDYSTRAW_ACTIVITY_PROBE_QUERY).definitions[0].selectionSet.selections.map((field) => field.name.value);
    expect(document.definitions[0].selectionSet.selections.slice(0, 3).map((field) => field.name.value)).toEqual(single);
  });

  it('compares answers whatever order the indexer returns the fields in', () => {
    const a = { activityEvents0: { items: [{ id: 'x' }], totalCount: 3 }, rulesetQueuedEvents0: { totalCount: 1 } };
    const b = { rulesetQueuedEvents0: { totalCount: 1 }, activityEvents0: { totalCount: 3, items: [{ id: 'x' }] } };
    expect(activityProbeKey(a)).toBe(activityProbeKey(b));
    expect(activityProbeKey(a)).not.toBe(activityProbeKey({ ...a, rulesetQueuedEvents0: { totalCount: 2 } }));
    expect(activityProbeKey(a)).not.toBe(activityProbeKey({ ...a, activityEvents0: { items: [{ id: 'y' }], totalCount: 3 } }));
  });
});

describe('activity card polling', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; localStorage.clear(); h.queries = []; h.reads = []; h.newest = 'event-1'; h.failProbe = false; h.failPending = false; });
  afterEach(() => { vi.useRealTimers(); });

  it('sends one probe per 30 s tick and reloads only when the probe changed', async () => {
    document.body.appendChild(renderActivityCard(project));
    await vi.advanceTimersByTimeAsync(1000);
    expect(probes()).toBe(1);
    const loaded = others();
    expect(loaded).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(28000);
    expect(h.queries.length).toBe(loaded + 1);
    await vi.advanceTimersByTimeAsync(36000);
    expect(probes()).toBe(3);
    // The first tick read the pending payments once more (their first read came before any probe); nothing else.
    expect(others()).toBe(loaded + 1);

    h.newest = 'event-2';
    await vi.advanceTimersByTimeAsync(30000);
    expect(probes()).toBe(4);
    expect(others()).toBeGreaterThan(loaded + 2);
    const reloaded = others();
    await vi.advanceTimersByTimeAsync(30000);
    expect(probes()).toBe(5);
    expect(others()).toBe(reloaded);
  });

  it('reads the pending payments on every tick while one is listed', async () => {
    const pendingReads = () => h.queries.filter((query) => query.includes('PendingPayments')).length;
    const card = renderActivityCard({ ...project, id: 8, chains: [{ id: 1, name: 'Ethereum', projectId: 8 }] });
    document.body.appendChild(card);
    await vi.advanceTimersByTimeAsync(1000);
    // The panel's first read came before any probe, so the first tick reads it once more; then it is current.
    await vi.advanceTimersByTimeAsync(60000);
    const atLoad = pendingReads();
    await vi.advanceTimersByTimeAsync(30000);
    expect(pendingReads()).toBe(atLoad);

    // A payment in its retry wait is listed: nothing the probe counts changes when the wait ends.
    const row = document.createElement('form'); row.className = 'pending-payment-row';
    card.querySelector('.pending-payments-rows').appendChild(row);
    await vi.advanceTimersByTimeAsync(30000);
    expect(pendingReads()).toBe(atLoad + 1);
  });

  it('reads the pending payments after the first probe, and again after a failed read', async () => {
    const pendingReads = () => h.queries.filter((query) => query.includes('PendingPayments')).length;
    document.body.appendChild(renderActivityCard({ ...project, id: 10, chains: [{ id: 1, name: 'Ethereum', projectId: 10 }] }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(pendingReads()).toBe(1);
    // The panel was read before the probe: a payment indexed in between is in the probe but not in the panel.
    h.failPending = true;
    await vi.advanceTimersByTimeAsync(30000);
    expect(pendingReads()).toBe(2);
    // That read failed, so the unchanged probe does not count as seen.
    h.failPending = false;
    await vi.advanceTimersByTimeAsync(30000);
    expect(pendingReads()).toBe(3);
    await vi.advanceTimersByTimeAsync(60000);
    expect(pendingReads()).toBe(3);
  });

  it('reads the sucker map again once it is ten minutes old', async () => {
    const mapReads = () => h.reads.filter((name) => name === 'allSuckersOf').length;
    document.body.appendChild(renderActivityCard({ ...project, id: 9, chains: [{ id: 1, name: 'Ethereum', projectId: 9 }] }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(mapReads()).toBe(1);
    h.newest = 'event-2';
    await vi.advanceTimersByTimeAsync(60000);
    expect(mapReads()).toBe(1);
    await vi.advanceTimersByTimeAsync(10 * 60000);
    h.newest = 'event-3';
    await vi.advanceTimersByTimeAsync(60000);
    expect(mapReads()).toBe(2);
  });

  it('slows down while the indexer fails', async () => {
    document.body.appendChild(renderActivityCard(project));
    await vi.advanceTimersByTimeAsync(1000);
    h.failProbe = true;
    const before = h.queries.length;
    await vi.advanceTimersByTimeAsync(5 * 60000);
    // Ticks at 30 s, then 60 s and 120 s later; the next is 240 s after that.
    expect(h.queries.length - before).toBe(3);
  });
});
