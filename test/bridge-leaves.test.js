// Bridge outbox leaves never change, so a page load reuses the ones a previous load found instead of scanning
// the chain's logs again. Only leaves over an hour old outlive the page.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = '8453:0xsucker:0xtoken';
const now = Math.floor(Date.now() / 1000);
const leaf = (index) => ({ index: BigInt(index), hashed: '0x' + String(index).padStart(64, '0'), root: '0x' + 'ab'.repeat(32), projectTokenCount: 10n ** 18n });
const entry = () => ({
  count: 3,
  byIndex: { 0: leaf(0), 1: leaf(1), 2: leaf(2) },
  blockOf: { 0: 100n, 1: 200n, 2: 300n },
  ts: { 0: now - 86400, 1: now - 7200, 2: now - 60 },
});
// A fresh module is a fresh page: nothing in memory, only what browser storage kept.
async function freshPage() { vi.resetModules(); return import('../src/bridge-leaves.js'); }

describe('bridge leaf cache', () => {
  beforeEach(() => localStorage.clear());

  it('keeps every leaf for the page and only settled leaves across a reload', async () => {
    const page = await freshPage();
    page.keepBridgeLeaves(KEY, entry());
    expect(Object.keys(page.bridgeLeavesFor(KEY, 3).byIndex)).toEqual(['0', '1', '2']);

    const reloaded = await freshPage();
    const kept = reloaded.bridgeLeavesFor(KEY, 4);
    expect(Object.keys(kept.byIndex)).toEqual(['0', '1']);
    expect(kept.byIndex[1]).toEqual(leaf(1));
    expect(kept.blockOf[1]).toBe(200n);
    expect(kept.ts[0]).toBe(now - 86400);
  });

  it('is not used once the outbox holds fewer leaves than it did, or after a drop', async () => {
    const page = await freshPage();
    page.keepBridgeLeaves(KEY, entry());
    expect(page.bridgeLeavesFor(KEY, 2)).toBeNull();
    page.dropBridgeLeaves(KEY);
    expect(page.bridgeLeavesFor(KEY, 3)).toBeNull();
    expect((await freshPage()).bridgeLeavesFor(KEY, 3)).toBeNull();
  });
});
