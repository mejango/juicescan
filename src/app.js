// src/app.js
// Entry point: tabs, wallet, directory rendering
// Chain selection is per-function-form, not global.

import { erc20Abi, formatUnits } from 'viem';
import { getAddress } from './abi-registry.js';
import { getAuditPrompt } from './prompts.js';
import { getAccount, getWalletClient, createPublicClientForChain, connect, disconnect, onWalletChange, eagerConnect, truncAddr, getProviders, refreshProviders, errMessage, initSafeApp } from './component-base.js';
import { renderDiscoverTab, applyDiscoverRoute, cancelDiscoverRoute, renderAdminTab, classifyAccountQuery, ensAddressOf, activeProjectForWallet, verifiedHandleProjectRoute } from './discover.js';

import { getViewAs, setViewAs, clearViewAs, onViewAsChange } from './view-as.js';
import { mountFontSelector, applySavedFont } from './font-selector.js';
import { isMobileDevice, mobileWalletLinks, walletDappUrl } from './wallet-links.js';
import { reverseEns } from './ens.js';
import { CHAINS, getChainTokens } from './chain.js';


function redirectBlockingPathGateway() {
  if (location.hostname !== 'gateway.pinata.cloud') return false;
  var match = /^\/ipfs\/([^/?#]+)(\/.*)?$/.exec(location.pathname);
  if (!match) return false;
  var cid = match[1];
  var rest = match[2] || '/';
  location.replace('https://ipfs.io/ipfs/' + cid + rest + location.search + location.hash);
  return true;
}

var REDIRECTING_FROM_BLOCKING_GATEWAY = redirectBlockingPathGateway();

// Hash fragments never reach link-preview crawlers. Mirror a project route in
// the query string so a copied URL remains static-IPFS compatible in browsers
// while an HTTP host can render project-specific Open Graph metadata.
function projectRouteFromHash() {
  var raw = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  if (/^([a-z]+|\d+):[1-9]\d*$/i.test(raw)) return raw;
  if (!/^@[^/?#]+$/u.test(raw)) return null;
  // A crawler cannot resolve a handle: it has no ENS, no chain, and no JS. Mirror the numeric
  // route once this session has verified it, so a copied @handle link previews the same project
  // the page shows. Before that, the handle keeps the URL shareable.
  var handle = '';
  try { handle = decodeURIComponent(raw.slice(1)); } catch (_) { handle = raw.slice(1); }
  return verifiedHandleProjectRoute(handle) || raw;
}

function restoreProjectHashFromQuery() {
  if (location.hash) return;
  try {
    var route = new URL(location.href).searchParams.get('project');
    if (!(/^([a-z]+|\d+):[1-9]\d*$/i.test(route || '') || /^@[^/?#]+$/u.test(route || ''))) return;
    history.replaceState(null, '', location.pathname + location.search + '#' + route);
  } catch (_) {}
}

function syncProjectPreviewQuery() {
  try {
    var url = new URL(location.href);
    // Only an HTTP host renders the per-project preview, so mirroring the route there is what the
    // query is for. Content-addressed gateways have no such server: keep those URLs short instead.
    var route = currentIpfsCid() ? null : projectRouteFromHash();
    if (route) url.searchParams.set('project', route);
    else url.searchParams.delete('project');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch (_) {}
}

function currentIpfsCid() {
  var pathMatch = /^\/ipfs\/([^/?#]+)/.exec(location.pathname);
  if (pathMatch) return pathMatch[1];

  var labels = location.hostname.split('.');
  var ipfsIndex = labels.indexOf('ipfs');
  if (ipfsIndex > 0) return labels.slice(0, ipfsIndex).join('.');

  // eth.sucks / eth.limo serve a CIDv1 subdomain without an `ipfs` label.
  if (/^ba[a-z2-7]{20,}$/.test(labels[0] || '')) return labels[0];

  return '';
}

function updateFooterIpfsCid() {
  var el = document.getElementById('ipfs-cid-meta');
  var cid = currentIpfsCid();
  if (el && cid) el.textContent = 'ipfs: ' + cid;
}

// --- Tab switching ---

// URL nav-name <-> data-tab id mapping (the hash uses friendly names).
var NAV_TO_TAB = { discover: 'discover', actions: 'common', learn: 'learn', build: 'build', api: 'directory', data: 'data', admin: 'admin', why: 'why', account: 'account' };
var TAB_TO_NAV = { discover: 'discover', common: 'actions', learn: 'learn', build: 'build', directory: 'api', data: 'data', admin: 'admin', why: 'why' };

function activateNavTab(dataTab) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
  var btn = document.querySelector('.tab[data-tab="' + dataTab + '"]');
  if (btn) btn.classList.add('active');
  var content = document.getElementById('tab-' + dataTab);
  if (content) content.classList.add('active');
}

// Panels that render on first activation. `load` fetches the panel's chunk (also used to prefetch on hover
// or focus); `render` fills the panel from the loaded module.
function learnBuild() { return import('./learn-build.js'); }
var LAZY_TABS = {
  learn: { load: learnBuild, render: function (mod) { mod.renderLearnTab(); } },
  build: { load: learnBuild, render: function (mod) { mod.renderBuildTab(); } },
  why: { load: learnBuild, render: function (mod) { mod.renderWhyTab(); } },
  data: { load: function () { return import('./data-tab.js'); }, render: function (mod) { mod.renderDataTab(); } },
  common: { load: function () { return import('./contracts-directory.js'); }, render: function (mod) { mod.renderCommonActions(); } },
  directory: { load: function () { return import('./contracts-directory.js'); }, render: function (mod) { mod.renderDirectory(); } },
};
var tabRenders = {};

// Resolves once the tab's panel is rendered. A failed load shows a retry in the panel and is not cached.
function renderTabOnce(dataTab) {
  var lazy = LAZY_TABS[dataTab];
  if (!lazy) return Promise.resolve();
  if (tabRenders[dataTab]) return tabRenders[dataTab];
  var panel = document.getElementById('tab-' + dataTab);
  panel.innerHTML = '<div class="error-box muted">Loading…</div>';
  tabRenders[dataTab] = lazy.load().then(lazy.render, function (error) {
    delete tabRenders[dataTab];
    panel.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'error-box error';
    box.textContent = 'This tab failed to load. ';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'style-toggle-btn';
    retry.textContent = '[retry]';
    retry.addEventListener('click', function () { renderTabOnce(dataTab).catch(function () {}); });
    box.appendChild(retry);
    panel.appendChild(box);
    throw error;
  });
  return tabRenders[dataTab];
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      // Update the hash; the hashchange handler applies the route (keeps URL and UI in sync).
      location.hash = '#' + (TAB_TO_NAV[btn.dataset.tab] || btn.dataset.tab);
    });
    var lazy = LAZY_TABS[btn.dataset.tab];
    if (lazy) {
      var prefetch = function () { lazy.load().catch(function () {}); };
      btn.addEventListener('pointerenter', prefetch, { once: true });
      btn.addEventListener('focus', prefetch, { once: true });
    }
  });
  // The Create button now lives inside the Discover tab (rendered by renderDiscoverTab), wired there.

  var connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    var connecting = false;
    var updateConnect = function() {
      var acc = getAccount();
      var viewed = getViewAs();
      var display = viewed || acc;
      connectBtn.textContent = viewed
        ? 'Viewing as ' + truncAddr(viewed)
        : acc
          ? truncAddr(acc)
          : (connecting ? 'Connecting…' : 'Connect wallet');
      connectBtn.classList.toggle('connected', !!acc && !viewed);
      connectBtn.classList.toggle('viewing-as', !!viewed);
      connectBtn.title = display || 'Connect a wallet or view as another account';
      // Show the primary ENS name when the displayed account has one.
      if (display) {
        reverseEns(display).then(function (name) {
          var currentViewed = getViewAs();
          var currentDisplay = currentViewed || getAccount();
          if (name && currentDisplay === display) {
            connectBtn.textContent = currentViewed ? 'Viewing as ' + name : name;
          }
        });
      }
    };
    updateConnect();
    onWalletChange(updateConnect);
    onViewAsChange(updateConnect);

    // The same trigger owns wallet connection and view-as state.
    var walletMenu = null;
    function closeWalletMenu() { if (walletMenu) { walletMenu.remove(); walletMenu = null; document.removeEventListener('click', onDocClick, true); } }
    function onDocClick(e) { if (walletMenu && e.target !== connectBtn && !walletMenu.contains(e.target)) closeWalletMenu(); }
    function positionWalletMenu(anchor) {
      var r = (anchor || connectBtn).getBoundingClientRect();
      walletMenu.style.top = (r.bottom + 6) + 'px';
      walletMenu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    }
    function openWalletNotice(message, kind) {
      closeWalletMenu();
      walletMenu = document.createElement('div');
      walletMenu.className = 'wallet-menu';
      positionWalletMenu();
      var note = document.createElement('div');
      note.className = 'wallet-menu-note' + (kind ? ' ' + kind : '');
      note.textContent = message;
      walletMenu.appendChild(note);
      if (!getProviders().length) {
        mobileWalletLinks(location.href).forEach(function (l) {
          var a = document.createElement('a');
          a.className = 'wallet-menu-item wallet-menu-link';
          a.href = l.href;
          a.textContent = l.name;
          walletMenu.appendChild(a);
        });
        // iOS wallet apps can register an "Open in…" share action. This reaches Rainbow and other installed
        // wallets without adding a connection SDK or depending on undocumented app-specific URL schemes.
        if (typeof navigator.share === 'function') {
          var share = document.createElement('button');
          share.type = 'button';
          share.className = 'wallet-menu-item';
          share.textContent = 'Open another wallet…';
          share.addEventListener('click', function () {
            try {
              navigator.share({ title: document.title, url: walletDappUrl(location.href) }).catch(function (err) {
                if (!err || err.name !== 'AbortError') openWalletNotice(errMessage(err, 'Could not open wallet apps.'), 'wallet-menu-error');
              });
            } catch (err) {
              openWalletNotice(errMessage(err, 'Could not open wallet apps.'), 'wallet-menu-error');
            }
          });
          walletMenu.appendChild(share);
        }
      }
      appendViewAsItem(walletMenu);
      document.body.appendChild(walletMenu);
      setTimeout(function () { document.addEventListener('click', onDocClick, true); }, 0);
    }
    function connectToProvider(provider) {
      closeWalletMenu();
      connecting = true;
      connectBtn.disabled = true;
      updateConnect();
      connect(provider).then(function () {
        closeWalletMenu();
      }).catch(function (err) {
        openWalletNotice(errMessage(err, 'Could not connect wallet.'), 'wallet-menu-error');
      }).finally(function () {
        connecting = false;
        connectBtn.disabled = false;
        updateConnect();
      });
    }
    // Inline "View as" prompt (address or ENS) appended inside a wallet-menu dropdown.
    function appendViewAsPrompt(menu) {
      var wrap = document.createElement('div');
      wrap.className = 'viewas-prompt';
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'viewas-input';
      input.placeholder = 'Wallet address or name.eth';
      var go = document.createElement('button'); go.type = 'button'; go.className = 'viewas-go'; go.textContent = 'View';
      var err = document.createElement('div'); err.className = 'viewas-err';
      function submit() {
        var q = classifyAccountQuery(input.value);
        if (q.kind === 'address') { setViewAs(q.address); closeWalletMenu(); return; }
        if (q.kind === 'ens') {
          go.disabled = true;
          err.textContent = 'Resolving ' + q.name + '…';
          ensAddressOf(q.name).then(function (resolved) {
            go.disabled = false;
            if (!resolved) { err.textContent = 'Could not resolve ' + q.name + '.'; return; }
            setViewAs(resolved);
            closeWalletMenu();
          });
          return;
        }
        err.textContent = 'Enter a wallet address or name such as name.eth.';
      }
      go.addEventListener('click', submit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      wrap.appendChild(input); wrap.appendChild(go); wrap.appendChild(err);
      menu.appendChild(wrap);
      return input;
    }
    // "View as…" menu item that expands the inline prompt in place (one per menu).
    function appendViewAsItem(menu) {
      var separator = document.createElement('div');
      separator.className = 'wallet-menu-separator';
      separator.setAttribute('aria-hidden', 'true');
      menu.appendChild(separator);
      var item = document.createElement('button');
      item.className = 'wallet-menu-item';
      item.textContent = getViewAs() ? 'View as another account…' : 'View as…';
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menu.querySelector('.viewas-prompt')) return;
        var input = appendViewAsPrompt(menu);
        input.focus();
      });
      menu.appendChild(item);
    }
    function formatMenuBalance(value, decimals, symbol) {
      var amount = Number(formatUnits(BigInt(value || 0n), Number(decimals)));
      return amount.toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' ' + symbol;
    }
    var totalBalanceOfAbi = [{
      type: 'function', name: 'totalBalanceOf', stateMutability: 'view',
      inputs: [{ name: 'holder', type: 'address' }, { name: 'projectId', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }],
    }];
    function appendWalletBalances(menu, account) {
      var panel = document.createElement('div');
      panel.className = 'wallet-menu-balances';
      panel.textContent = 'Loading balances…';
      menu.appendChild(panel);

      var activeProject = activeProjectForWallet();
      var chainPromise = activeProject
        ? Promise.resolve(activeProject.chains)
        : Promise.resolve(getWalletClient()).then(function (wallet) {
          return wallet && wallet.getChainId ? wallet.getChainId().then(function (chainId) { return [{ chainId: chainId, projectId: null }]; }) : [];
        });
      chainPromise.then(function (projectChains) {
        if (!panel.isConnected) return;
        // Returning here without touching the panel left "Loading balances…" spinning forever
        // — the state View-as lands in when no wallet is connected outside a project page.
        if (!projectChains || !projectChains.length) {
          panel.textContent = 'No chains to read balances on.';
          return;
        }
        return Promise.all(projectChains.map(function (projectChain) {
          var chainId = Number(projectChain.chainId);
          if (!CHAINS[chainId]) throw new Error('Unsupported chain ' + chainId);
          var client = createPublicClientForChain(chainId);
          var nativeSymbol = CHAINS[chainId].nativeCurrency && CHAINS[chainId].nativeCurrency.symbol || 'ETH';
          var usdc = getChainTokens(chainId).find(function (token) { return String(token.symbol || '').toUpperCase() === 'USDC'; });
          var nativeRead = client.getBalance({ address: account })
            .then(function (value) { return { ok: true, value: value, symbol: nativeSymbol }; })
            .catch(function () { return { ok: false, value: 0n, symbol: nativeSymbol }; });
          var usdcRead = usdc
            ? client.readContract({ address: usdc.address, abi: erc20Abi, functionName: 'balanceOf', args: [account] })
              .then(function (value) { return { ok: true, value: value, decimals: usdc.decimals }; })
              .catch(function () { return { ok: false, value: 0n, decimals: usdc.decimals }; })
            : Promise.resolve({ ok: false, value: 0n, decimals: 6 });
          var projectRead = activeProject
            ? client.readContract({
              address: getAddress('JBTokens', chainId),
              abi: totalBalanceOfAbi,
              functionName: 'totalBalanceOf',
              args: [account, BigInt(projectChain.projectId)],
            }).then(function (value) { return { ok: true, value: value }; })
              .catch(function () { return { ok: false, value: 0n }; })
            : Promise.resolve(null);
          return Promise.all([nativeRead, usdcRead, projectRead]);
        })).then(function (chainRows) {
          if (!panel.isConnected) return;
          panel.innerHTML = '';
          var chain = document.createElement('div');
          chain.className = 'wallet-menu-balance-chain';
          chain.textContent = activeProject
            ? 'Across ' + projectChains.length + ' project chains'
            : (CHAINS[projectChains[0].chainId].name || ('Chain ' + projectChains[0].chainId));
          panel.appendChild(chain);
          var native = chainRows.map(function (row) { return row[0]; });
          var usdcs = chainRows.map(function (row) { return row[1]; });
          var projects = chainRows.map(function (row) { return row[2]; }).filter(Boolean);
          var nativeSymbol = native[0] && native[0].symbol || 'ETH';
          var rows = [
            {
              label: nativeSymbol,
              value: native.every(function (row) { return row.ok; })
                ? formatMenuBalance(native.reduce(function (sum, row) { return sum + row.value; }, 0n), 18, nativeSymbol)
                : 'Unavailable',
            },
            {
              label: 'USDC',
              value: usdcs.every(function (row) { return row.ok; })
                ? formatMenuBalance(usdcs.reduce(function (sum, row) { return sum + row.value; }, 0n), 6, 'USDC')
                : 'Unavailable',
            },
          ];
          if (activeProject) {
            var projectSymbol = activeProject.tokenSymbol || 'Project token';
            rows.push({
              label: projectSymbol,
              value: projects.length === projectChains.length && projects.every(function (row) { return row.ok; })
                ? formatMenuBalance(projects.reduce(function (sum, row) { return sum + row.value; }, 0n), 18, projectSymbol)
                : 'Unavailable',
            });
          }
          rows.forEach(function (row) {
            var line = document.createElement('div');
            line.className = 'wallet-menu-balance-row';
            var label = document.createElement('span'); label.textContent = row.label;
            var value = document.createElement('strong'); value.textContent = row.value;
            line.appendChild(label); line.appendChild(value); panel.appendChild(line);
          });
        });
      }).catch(function () { if (panel.isConnected) panel.textContent = 'Balances unavailable'; });
    }
    function openWalletMenu() {
      closeWalletMenu();
      var acc = getAccount();
      var viewed = getViewAs();
      walletMenu = document.createElement('div');
      walletMenu.className = 'wallet-menu';
      positionWalletMenu();
      if (viewed || acc) appendWalletBalances(walletMenu, viewed || acc);
      var acctItem = document.createElement('button'); acctItem.className = 'wallet-menu-item'; acctItem.textContent = 'Account';
      // While "View as" is active the Account item targets the impersonated address.
      acctItem.addEventListener('click', function () { closeWalletMenu(); location.hash = '#account/' + (getViewAs() || acc); });
      walletMenu.appendChild(acctItem);
      if (viewed) {
        var normal = document.createElement('button');
        normal.className = 'wallet-menu-item';
        normal.textContent = acc ? 'View as connected wallet' : 'Exit View as';
        normal.addEventListener('click', function () { closeWalletMenu(); clearViewAs(); });
        walletMenu.appendChild(normal);
        appendViewAsItem(walletMenu);
        document.body.appendChild(walletMenu);
        setTimeout(function () { document.addEventListener('click', onDocClick, true); }, 0);
        return;
      }
      var copy = document.createElement('button'); copy.className = 'wallet-menu-item'; copy.textContent = 'Copy address';
      copy.addEventListener('click', function () { try { navigator.clipboard.writeText(acc); } catch (_) {} closeWalletMenu(); });
      var disc = document.createElement('button'); disc.className = 'wallet-menu-item wallet-menu-danger'; disc.textContent = 'Disconnect';
      disc.addEventListener('click', function () { closeWalletMenu(); disconnect().catch(function () {}); });
      walletMenu.appendChild(copy);
      walletMenu.appendChild(disc);
      appendViewAsItem(walletMenu);
      document.body.appendChild(walletMenu);
      setTimeout(function () { document.addEventListener('click', onDocClick, true); }, 0);
    }
    // When not connected, show detected wallets and View as… in one dropdown.
    function openWalletPicker() {
      closeWalletMenu();
      var providers = getProviders();
      if (!providers.length) {
        var mobile = isMobileDevice(typeof navigator !== 'undefined' ? navigator : null);
        openWalletNotice(mobile ? 'Checking this browser for wallet access…' : 'Looking for wallet…', '');
        // MetaMask Mobile may not inject `window.ethereum` until after the
        // page lifecycle has started. Its documented initialization window is
        // up to three seconds; refreshProviders also resolves early when the
        // provider event arrives.
        refreshProviders(mobile ? 3000 : 500).then(function (fresh) {
          if (getAccount() || !walletMenu) return;
          if (fresh.length) { openWalletPicker(); return; }
          if (mobile) openWalletNotice('Choose a wallet app to continue. This page will reopen there.', '');
          else openWalletNotice('No wallet detected in this browser. Open this site in a wallet app browser, or install a browser wallet.', 'wallet-menu-error');
        });
        return;
      }
      walletMenu = document.createElement('div');
      walletMenu.className = 'wallet-menu';
      positionWalletMenu();
      providers.forEach(function (p) {
        var item = document.createElement('button'); item.className = 'wallet-menu-item wallet-pick';
        if (p.info && p.info.icon) {
          var img = document.createElement('img'); img.className = 'wallet-pick-icon'; img.src = p.info.icon; img.alt = ''; item.appendChild(img);
        }
        var nm = document.createElement('span'); nm.textContent = (p.info && p.info.name) || 'Wallet'; item.appendChild(nm);
        item.addEventListener('click', function () { connectToProvider(p); });
        walletMenu.appendChild(item);
      });
      appendViewAsItem(walletMenu);
      document.body.appendChild(walletMenu);
      setTimeout(function () { document.addEventListener('click', onDocClick, true); }, 0);
    }
    connectBtn.addEventListener('click', function () {
      if (walletMenu) { closeWalletMenu(); return; }
      if (getViewAs() || getAccount()) { openWalletMenu(); return; }
      openWalletPicker();
    });
  }
  // If the site is opened as a Safe App (inside Safe{Wallet}), auto-connect the Safe; otherwise restore a
  // prior wallet connection silently so a refresh keeps the user connected.
  initSafeApp().then(function (safe) { if (!safe) eagerConnect(); });
}

// The account view loads with its own chunk. Only the latest account route renders once it arrives.
var accountRouteSeq = 0;
function renderAccountRoute(route) {
  var seq = ++accountRouteSeq;
  import('./account-view.js').then(function (mod) {
    if (seq === accountRouteSeq && document.getElementById('tab-account').classList.contains('active')) mod.renderAccountView(route);
  }, function (error) {
    var panel = document.getElementById('tab-account');
    panel.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'error-box error';
    box.textContent = errMessage(error) + ' Reload to try again.';
    panel.appendChild(box);
  });
}

// Parse the hash and apply it: pick the nav tab, and (for discover) open the project route.
function applyHash() {
  var raw = (location.hash || '').replace(/^#\/?/, '');
  var nav, projectRoute = null, sectionId = null, accountRoute = null;
  if (raw === '' || raw === 'discover') { nav = 'discover'; }
  else if (/^@/.test(raw)) { nav = 'discover'; projectRoute = raw; } // @<verified-handle>[/tab]
  else if (raw.indexOf(':') !== -1) { nav = 'discover'; projectRoute = raw; } // <slug>:<id>[/tab]
  else if (/^account\//.test(raw)) { nav = 'account'; accountRoute = raw.slice('account/'.length); } // #account/<address-or-ens>[/tab]
  else if (/^(learn|build|why)-/.test(raw)) { nav = raw.split('-')[0]; sectionId = raw; } // guide section deep link
  else { nav = raw.split('/')[0]; }
  var activeTab = NAV_TO_TAB[nav] || 'discover';
  if (activeTab !== 'discover') cancelDiscoverRoute();
  activateNavTab(activeTab);
  if (accountRoute != null) renderAccountRoute(accountRoute);
  else if (activeTab === 'discover') applyDiscoverRoute(projectRoute);
  renderTabOnce(activeTab).then(function () {
    // Scroll to a deep-linked guide section once the tab's content has rendered (copy-link buttons emit
    // these), unless the reader navigated elsewhere while the tab's chunk loaded.
    if (!sectionId || (location.hash || '').replace(/^#\/?/, '') !== raw) return;
    var target = document.getElementById(sectionId);
    if (target) target.scrollIntoView({ block: 'start' });
  }, function () {});
}

function onHashChange() {
  syncProjectPreviewQuery();
  // Programmatic hash updates (card open, detail tab, back-to-grid) set this flag so we don't re-render.
  if (window.__suppressHash) { window.__suppressHash = false; return; }
  applyHash();
}

function onPageShow(event) {
  // A BFCache restore can repaint an old verified alias without firing hashchange. Re-run the full mutable-handle
  // route on persisted restores so ENS, live authority, and JBProjectHandles are checked before that detail stays.
  var raw = (location.hash || '').replace(/^#\/?/, '');
  if (!event || !event.persisted || raw.charAt(0) !== '@') return;
  window.__suppressHash = false;
  syncProjectPreviewQuery();
  applyHash();
}

function initAuditPrompt() {
  var links = document.querySelectorAll('[data-audit-prompt-link], #audit-prompt-link');
  links.forEach(function(link) {
    var defaultLabel = link.textContent;
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var prompt = getAuditPrompt();
      navigator.clipboard.writeText(prompt).then(function() {
        link.textContent = 'COPIED TO CLIPBOARD';
        setTimeout(function() { link.textContent = defaultLabel; }, 2000);
      });
    });
  });
}

// --- Init ---

function init() {
  restoreProjectHashFromQuery();
  syncProjectPreviewQuery();
  // Handle resolution finishes after the hash change that started it.
  document.addEventListener('jbscan:handle-resolved', syncProjectPreviewQuery);
  applySavedFont(); // apply the saved monospace font before first paint to avoid a flash
  updateFooterIpfsCid();
  mountFontSelector();
  initTabs();
  initAuditPrompt();
  renderDiscoverTab();
  renderAdminTab();
  onViewAsChange(function () {
    applyHash(); // re-render the active route so every "your …" read reflects the new effective account
  });
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('pageshow', onPageShow);
  applyHash(); // restore the nav tab / deep-linked project from the URL on load
}

if (REDIRECTING_FROM_BLOCKING_GATEWAY) {
  // Let the browser complete location.replace before doing any RPC-backed initialization.
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
