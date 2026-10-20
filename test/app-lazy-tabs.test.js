import { describe, expect, it, vi } from 'vitest';

// Tab panels that load their own chunk: they stay empty until first activation, prefetch on hover or
// focus, show a retry when the chunk fails, and render once.
const lazy = vi.hoisted(() => ({
  directoryLoads: 0,
  failingDirectoryLoads: 2,
  renderDirectory: vi.fn(() => { document.getElementById('tab-directory').textContent = 'contract directory'; }),
  renderCommonActions: vi.fn(),
  releaseGuides: null,
  guide(tab, sectionIds) {
    return vi.fn(() => {
      const panel = document.getElementById('tab-' + tab);
      panel.innerHTML = sectionIds.map(id => `<h2 id="${id}">${id}</h2>`).join('');
    });
  },
  scrolled: [],
}));
lazy.renderLearnTab = lazy.guide('learn', ['learn-pricing', 'learn-splits']);
lazy.renderBuildTab = lazy.guide('build', ['build-api']);
lazy.renderWhyTab = lazy.guide('why', []);
lazy.renderDataTab = vi.fn();

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
// The guides chunk resolves only when the test releases it, to model a slow network.
vi.mock('../src/learn-build.js', async () => {
  await new Promise(resolve => { lazy.releaseGuides = resolve; });
  return { renderLearnTab: lazy.renderLearnTab, renderBuildTab: lazy.renderBuildTab, renderWhyTab: lazy.renderWhyTab };
});
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
vi.mock('../src/data-tab.js', () => ({ renderDataTab: lazy.renderDataTab }));
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
  it('scroll a deep link after its guide renders, and not after the reader moved on', async () => {
    document.body.innerHTML = `
      <button id="connect-btn"></button>
      <nav>${tabs.map(tab => `<button class="tab" data-tab="${tab}"></button>`).join('')}</nav>
      <main>${tabs.map(tab => `<section id="tab-${tab}" class="tab-content"></section>`).join('')}<section id="tab-account" class="tab-content"></section></main>
      <span id="ipfs-cid-meta"></span>`;
    Element.prototype.scrollIntoView = function () { lazy.scrolled.push(this.id); };
    // The page opens on a guide deep link while the guides chunk is still loading.
    history.replaceState(null, '', '/index.html#learn-splits');
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'complete' });
    await import('../src/app.js');

    const learn = document.getElementById('tab-learn');
    expect(learn.classList.contains('active')).toBe(true);
    expect(learn.textContent).toBe('Loading…');

    // The reader moves on before the chunk arrives: the guide still renders, but nothing scrolls.
    await go('#discover');
    await vi.waitFor(() => expect(lazy.releaseGuides).toBeTypeOf('function'));
    lazy.releaseGuides();
    await vi.waitFor(() => expect(lazy.renderLearnTab).toHaveBeenCalledOnce());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(lazy.scrolled).toEqual([]);

    // Following the deep link again scrolls once the (now loaded) guide is in place.
    await go('#learn-splits');
    await vi.waitFor(() => expect(lazy.scrolled).toEqual(['learn-splits']));
    expect(lazy.renderLearnTab).toHaveBeenCalledOnce();
    expect(lazy.renderBuildTab).not.toHaveBeenCalled();
    expect(lazy.renderDataTab).not.toHaveBeenCalled();

    // A guide that shares the loaded chunk renders on its first deep link and scrolls to the section.
    await go('#build-api');
    await vi.waitFor(() => expect(lazy.scrolled).toEqual(['learn-splits', 'build-api']));
    expect(lazy.renderBuildTab).toHaveBeenCalledOnce();
    expect(document.getElementById('tab-build').classList.contains('active')).toBe(true);

    await go('#data');
    await vi.waitFor(() => expect(lazy.renderDataTab).toHaveBeenCalledOnce());
  });

  it('render on first activation, retry a failed chunk, and render once', async () => {
    await go('#discover');

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
