import { describe, expect, it, vi } from 'vitest';

// Tab panels that load their own chunk: they stay empty until first activation, prefetch on hover or
// focus, show a retry when the chunk fails, and render once.
const lazy = vi.hoisted(() => ({
  directoryLoads: 0,
  failingDirectoryLoads: 2,
  renderDirectory: vi.fn(() => { document.getElementById('tab-directory').textContent = 'contract directory'; }),
  renderCommonActions: vi.fn(),
}));

vi.mock('../src/contracts-directory.js', () => {
  lazy.directoryLoads += 1;
  if (lazy.failingDirectoryLoads > 0) {
    lazy.failingDirectoryLoads -= 1;
    throw new Error('chunk offline');
  }
  return { renderDirectory: lazy.renderDirectory, renderCommonActions: lazy.renderCommonActions };
});
vi.mock('../src/abi-registry.js', () => ({ getAddress: () => null }));
vi.mock('../src/prompts.js', () => ({ getAuditPrompt: () => '' }));
vi.mock('../src/component-base.js', () => ({
  getAccount: () => null,
  getWalletClient: () => null,
  createPublicClientForChain: () => null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  onWalletChange: vi.fn(),
  eagerConnect: vi.fn(),
  truncAddr: value => value,
  getProviders: () => [],
  refreshProviders: vi.fn().mockResolvedValue([]),
  errMessage: error => error.message,
  initSafeApp: vi.fn().mockResolvedValue(false),
}));
vi.mock('../src/learn-build.js', () => ({ renderLearnTab: vi.fn(), renderBuildTab: vi.fn(), renderWhyTab: vi.fn() }));
vi.mock('../src/discover.js', () => ({
  setSafeBatchTrayRenderer: vi.fn(),
  renderDiscoverTab: vi.fn(),
  applyDiscoverRoute: vi.fn(),
  cancelDiscoverRoute: vi.fn(),
  renderAdminTab: vi.fn(),
  activeProjectForWallet: () => null,
  classifyAccountQuery: () => ({ kind: 'text' }),
  ensAddressOf: vi.fn().mockResolvedValue(null),
  verifiedHandleProjectRoute: () => null,
}));
vi.mock('../src/data-tab.js', () => ({ renderDataTab: vi.fn() }));
vi.mock('../src/account-view.js', () => ({ renderAccountView: vi.fn() }));
vi.mock('../src/safe-batch-ui.js', () => ({ renderSafeBatchTray: vi.fn() }));
vi.mock('../src/ens.js', () => ({ reverseEns: vi.fn().mockResolvedValue(null) }));
vi.mock('../src/font-selector.js', () => ({ mountFontSelector: vi.fn(), applySavedFont: vi.fn() }));

const tabs = ['discover', 'common', 'learn', 'build', 'directory', 'data', 'admin', 'why'];

// jsdom fires hashchange asynchronously after a hash assignment, like a browser.
function go(hash) {
  return new Promise(resolve => {
    window.addEventListener('hashchange', resolve, { once: true });
    location.hash = hash;
  });
}

describe('lazy tab panels', () => {
  it('render on first activation, retry a failed chunk, and render once', async () => {
    document.body.innerHTML = `
      <button id="connect-btn"></button>
      <nav>${tabs.map(tab => `<button class="tab" data-tab="${tab}"></button>`).join('')}</nav>
      <main>${tabs.map(tab => `<section id="tab-${tab}" class="tab-content"></section>`).join('')}<section id="tab-account" class="tab-content"></section></main>
      <span id="ipfs-cid-meta"></span>`;
    history.replaceState(null, '', '/index.html#discover');
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'complete' });
    await import('../src/app.js');

    const panel = document.getElementById('tab-directory');
    expect(panel.textContent).toBe('');
    expect(lazy.directoryLoads).toBe(0);

    // Hover prefetches the chunk without rendering the panel.
    document.querySelector('.tab[data-tab="directory"]').dispatchEvent(new Event('pointerenter'));
    await vi.waitFor(() => expect(lazy.directoryLoads).toBe(1));
    expect(panel.textContent).toBe('');

    // A failed prefetch is not cached: activation loads again. That load fails too, so the panel offers a retry.
    await go('#api');
    expect(panel.classList.contains('active')).toBe(true);
    expect(panel.textContent).toBe('Loading…');
    await vi.waitFor(() => expect(panel.textContent).toMatch(/This tab failed to load/));
    expect(lazy.directoryLoads).toBe(2);
    panel.querySelector('button').click();
    await vi.waitFor(() => expect(panel.textContent).toBe('contract directory'));
    expect(lazy.directoryLoads).toBe(3);
    expect(lazy.renderDirectory).toHaveBeenCalledOnce();

    await go('#discover');
    await go('#api');
    await Promise.resolve();
    expect(lazy.renderDirectory).toHaveBeenCalledOnce();
  });
});
