// Views that used to go blank, or wait behind a read, while data that does not gate them loaded.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/bendystraw-client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, bendystrawQuery: vi.fn() };
});

import { renderAccountView } from '../src/account-view.js';
import { bendystrawQuery } from '../src/bendystraw-client.js';
import { handOffProjectDetail, handleRouteMatchesOpenDetail } from '../src/discover.js';

const ADDR = '0x823b92d6A4b2AED4b15675c7917c9f922ea8ADAd';
const OWNER = '0x1111111111111111111111111111111111111111';

afterEach(() => { document.body.innerHTML = ''; });

describe('account page rows draw before project names land', () => {
  beforeEach(() => { bendystrawQuery.mockReset(); });

  it('shows token balances under the project id at once, then fills the name and symbol', async () => {
    let releaseNames;
    bendystrawQuery.mockImplementation((query) => {
      if (query.indexOf('participants(') !== -1) return Promise.resolve({ participants: { totalCount: 1, items: [{ chainId: 1, projectId: 3, version: 6, balance: String(5n * 10n ** 18n), creditBalance: '0', erc20Balance: String(5n * 10n ** 18n) }] } });
      if (query.indexOf('nfts(') !== -1) return Promise.resolve({ nfts: { totalCount: 0, items: [] } });
      if (query.indexOf('projectId_in') !== -1) return new Promise((resolve) => { releaseNames = () => resolve({ projects: { totalCount: 1, items: [{ chainId: 1, projectId: 3, name: 'Bananapus', deployErc20Events: { items: [{ symbol: 'NANA', token: OWNER }] } }] } }); });
      return Promise.reject(new Error('offline'));
    });
    document.body.innerHTML = '<section id="tab-account" class="tab-content"></section>';
    renderAccountView(ADDR + '/holdings');
    const tab = document.getElementById('tab-account');
    await vi.waitFor(() => expect(tab.querySelector('.account-holding-balance')).not.toBeNull());
    expect(tab.querySelector('.account-proj-link').textContent).toBe('Project #3');
    expect(tab.querySelector('.account-holding-balance').textContent).toBe('5 tokens');
    await vi.waitFor(() => expect(releaseNames).toBeTypeOf('function'));
    releaseNames();
    await vi.waitFor(() => expect(tab.querySelector('.account-proj-link').textContent).toBe('Bananapus'));
    expect(tab.querySelector('.account-holding-balance').textContent).toBe('5 NANA');
    expect(tab.querySelectorAll('.account-holding-balance').length).toBe(1);
  });

  it('shows roles under the project id at once instead of an empty card, then fills the name', async () => {
    let releaseNames;
    bendystrawQuery.mockImplementation((query) => {
      if (query.indexOf('permissionHolders(') !== -1) return Promise.resolve({ permissionHolders: { totalCount: 1, items: [{ chainId: 1, projectId: 3, account: OWNER, operator: ADDR.toLowerCase(), permissions: [2], isRevnetOperator: false }] } });
      if (query.indexOf('projectId_in') !== -1) return new Promise((resolve) => { releaseNames = () => resolve({ projects: { totalCount: 1, items: [{ chainId: 1, projectId: 3, name: 'Bananapus' }] } }); });
      return Promise.reject(new Error('offline'));
    });
    document.body.innerHTML = '<section id="tab-account" class="tab-content"></section>';
    renderAccountView(ADDR + '/roles');
    const tab = document.getElementById('tab-account');
    await vi.waitFor(() => expect(tab.querySelector('.powers-row')).not.toBeNull());
    expect(tab.querySelector('.powers-row .account-proj-link').textContent).toBe('Project #3');
    await vi.waitFor(() => expect(releaseNames).toBeTypeOf('function'));
    releaseNames();
    await vi.waitFor(() => expect(tab.querySelector('.powers-row .account-proj-link').textContent).toBe('Bananapus'));
    expect(tab.querySelectorAll('.powers-row').length).toBe(1);
  });
});

describe('a handle URL reuses the page open under it only after the handle verifies to the same project', () => {
  function openDetail(project) {
    const element = document.createElement('div'); document.body.appendChild(element);
    return { key: 'base:7', element, project };
  }
  const resolved = (authority) => ({ route: 'base:7/owner', network: 'mainnet', authority, target: { chainId: 8453, projectId: 7 } });

  it('reuses for the same chain, project, network and owner', () => {
    const open = openDetail({ owner: OWNER });
    expect(handleRouteMatchesOpenDetail(open, open, resolved({ kind: 'owner', address: OWNER }), 'mainnet', null)).toBe(true);
  });
  it('refuses when the verified owner is not the one the open page loaded', () => {
    const open = openDetail({ owner: OWNER });
    expect(handleRouteMatchesOpenDetail(open, open, resolved({ kind: 'owner', address: ADDR }), 'mainnet', null)).toBe(false);
  });
  it('refuses another project, another network, a detached page, or a page that is no longer the active one', () => {
    const open = openDetail({ owner: OWNER });
    const owner = { kind: 'owner', address: OWNER };
    expect(handleRouteMatchesOpenDetail(open, open, Object.assign(resolved(owner), { route: 'base:8' }), 'mainnet', null)).toBe(false);
    expect(handleRouteMatchesOpenDetail(open, open, resolved(owner), 'testnet', null)).toBe(false);
    expect(handleRouteMatchesOpenDetail(open, { key: 'base:7' }, resolved(owner), 'mainnet', null)).toBe(false);
    expect(handleRouteMatchesOpenDetail(null, open, resolved(owner), 'mainnet', null)).toBe(false);
    open.element.remove();
    expect(handleRouteMatchesOpenDetail(open, open, resolved(owner), 'mainnet', null)).toBe(false);
  });
});

describe('the rebuilt page after a confirmed transaction replaces the old one only once it has loaded', () => {
  function pages() {
    const container = document.createElement('section'); document.body.appendChild(container);
    const old = document.createElement('div'); old.className = 'project-detail'; old.textContent = 'balance 1';
    container.appendChild(old);
    const next = document.createElement('div'); next.className = 'project-detail';
    const ghost = document.createElement('div'); ghost.className = 'skel'; next.appendChild(ghost);
    return { container, old, next, ghost };
  }

  it('keeps the old page visible but inert, puts the new page first, and swaps when the last ghost is gone', async () => {
    const { container, old, next, ghost } = pages();
    handOffProjectDetail(container, old, next, 60000);
    expect(old.isConnected).toBe(true);
    expect(old.inert).toBe(true);
    expect(old.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('.project-detail')).toBe(next); // every lookup of the open page finds the new one
    expect(next.style.visibility).toBe('hidden');
    const loaded = document.createElement('div'); loaded.textContent = 'balance 2';
    ghost.replaceWith(loaded);
    await vi.waitFor(() => expect(old.isConnected).toBe(false));
    expect(next.style.visibility).toBe('');
    expect(next.style.position).toBe('');
    expect(container.textContent).toBe('balance 2'); // nothing from before the transaction is left on screen
  });

  it('gives way after the wait even if a card never finishes, and at once when nothing is loading', async () => {
    const stuck = pages();
    handOffProjectDetail(stuck.container, stuck.old, stuck.next, 10);
    await vi.waitFor(() => expect(stuck.old.isConnected).toBe(false));
    expect(stuck.next.style.visibility).toBe('');

    const ready = pages();
    ready.ghost.remove();
    handOffProjectDetail(ready.container, ready.old, ready.next, 60000);
    expect(ready.old.isConnected).toBe(false);
    expect(ready.next.style.visibility).toBe('');
  });

  it('a second handoff ends the first: one old page never outlives two refreshes', () => {
    const first = pages();
    handOffProjectDetail(first.container, first.old, first.next, 60000);
    const again = document.createElement('div'); again.className = 'project-detail';
    const ghost = document.createElement('div'); ghost.className = 'skel'; again.appendChild(ghost);
    handOffProjectDetail(first.container, first.next, again, 60000);
    expect(first.old.isConnected).toBe(false);
    expect(first.container.querySelectorAll('.project-detail').length).toBe(2);
    ghost.remove();
  });
});

describe('a route switches a subtab on the page already open', () => {
  // A reused page (numeric or verified handle route) shows the routed tab, then the routed subtab. The section may
  // come from cache, and the route carries a slug, not the button's label.
  it('gives a cached section its subtab switch back and accepts route slugs', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/discover.js', 'utf8');
    expect(source).toContain('else if (_activeDetail) _activeDetail.showSubTab = subTabSwitch[tabName] || null;');
    expect(source.split('_activeDetail.showSubTab = function (name) { show(order.filter(function (o) { return tabSlug(o) === tabSlug(name); })[0] || name); };').length).toBe(3);
  });
});

describe('state shared across attempts and pages', () => {
  it('a page being handed off cannot switch tabs, and only the latest pay attempt writes to the pay card', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/discover.js', 'utf8');
    const showTab = source.slice(source.indexOf('  function showTab(tabName) {'));
    expect(showTab.indexOf('if (_activeDetail && _activeDetail.element !== wrap) return;')).toBeGreaterThan(-1);
    expect(showTab.indexOf('if (_activeDetail && _activeDetail.element !== wrap) return;')).toBeLessThan(showTab.indexOf('_activeDetail.current = tabName'));
    const gate = source.slice(source.indexOf('var payGate = readProjectPaymentSurface('), source.indexOf('payGate.catch('));
    expect(gate.split('requireLatest();').length).toBe(3);
    expect(gate.indexOf('requireLatest();')).toBeLessThan(gate.indexOf('state.terminalSurface = surface;'));
  });
});
