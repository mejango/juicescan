// The activity card reloads its feed only when something changed. A poll tick (every 30 s) sends one probe
// request; the feed, its ruleset rows and the pending payments are read again only when the probe's answer moved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'graphql';

const h = vi.hoisted(() => ({ queries: [], newest: 'event-1', failProbe: false }));
vi.mock('../src/wallet.js', async (original) => ({ ...await original(),
  // No suckers and no queued rulesets onchain.
  createPublicClientForChain: () => ({ readContract: async () => [] }),
}));
vi.mock('../src/bendystraw-client.js', async (original) => ({ ...await original(),
  bendystrawQuery: async (query) => {
    h.queries.push(query);
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
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; localStorage.clear(); h.queries = []; h.newest = 'event-1'; h.failProbe = false; });
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
    expect(others()).toBe(loaded);

    h.newest = 'event-2';
    await vi.advanceTimersByTimeAsync(30000);
    expect(probes()).toBe(4);
    expect(others()).toBeGreaterThan(loaded);
    const reloaded = others();
    await vi.advanceTimersByTimeAsync(30000);
    expect(probes()).toBe(5);
    expect(others()).toBe(reloaded);
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
