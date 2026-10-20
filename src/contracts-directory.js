// src/contracts-directory.js
// The API tab's contract directory and the Actions tab: collapsible function rows with their natspec,
// source and transaction forms.

import { natspec } from './abi-natspec.js';
import { contracts, meta, categories, chains, commonActions, getFunctions, getAddress, getFunctionSource, loadFunctionSourceBody, getGithubUrl } from './abi-registry.js';
import { renderFunctionForm } from './form.js';
import { getComponentAuditPrompt } from './prompts.js';
import { renderStyleEditor } from './components.js';
import { buildEmbedUrl } from './component-base.js';
import { CHUNK_FAILED_TEXT, chunkReloadButton } from './chunk-failure.js';


// Map contract.function to a loader for its pretty component renderer; each widget loads with its own chunk.
var PRETTY_COMPONENTS = {
  'JBMultiTerminal.pay': function () { return import('./pay-component.js').then(function (m) { return m.renderPayComponent; }); },
  'JBMultiTerminal.cashOutTokensOf': function () { return import('./cashout-component.js').then(function (m) { return m.renderCashOutComponent; }); },
  'JBMultiTerminal.sendPayoutsOf': function () { return import('./payouts-component.js').then(function (m) { return m.renderPayoutsComponent; }); },
  'JBController.mintTokensOf': function () { return import('./mint-component.js').then(function (m) { return m.renderMintComponent; }); },
  'JBController.sendReservedTokensToSplitsOf': function () { return import('./reserved-component.js').then(function (m) { return m.renderReservedComponent; }); },
  'JBController.deployERC20For': function () { return import('./deploy-erc20-component.js').then(function (m) { return m.renderDeployERC20Component; }); },
  'JBController.burnTokensOf': function () { return import('./burn-component.js').then(function (m) { return m.renderBurnComponent; }); },
  'JBController.launchProjectFor': function () { return import('./launch-component.js').then(function (m) { return m.renderLaunchComponent; }); },
  'JBController.queueRulesetsOf': function () { return import('./queue-ruleset-component.js').then(function (m) { return m.renderQueueRulesetComponent; }); },
  'JBOmnichainDeployer.launchProjectFor': function () { return import('./launch-component.js').then(function (m) { return m.renderLaunchComponent; }); },
  'JBPermissions.setPermissionsFor': function () { return import('./permissions-component.js').then(function (m) { return m.renderPermissionsComponent; }); },
};

// --- Common Actions tab ---

export function renderCommonActions() {
  var container = document.getElementById('tab-common');
  container.innerHTML = '';

  var wipBanner = document.createElement('div');
  wipBanner.className = 'discover-header';
  wipBanner.textContent = 'Work in progress';
  container.appendChild(wipBanner);

  for (var i = 0; i < commonActions.length; i++) {
    var section = commonActions[i];
    renderActionSection(container, section.title, section.className, section.entries);
  }
}

function renderActionSection(container, title, className, actions) {
  var header = document.createElement('div');
  header.className = 'section-header ' + className;
  header.textContent = title;
  container.appendChild(header);

  var extraRows = [];
  var moreRows = [];
  for (var i = 0; i < actions.length; i++) {
    var entry = actions[i];
    var fns = getFunctions(entry.contract);
    var fn = findFunction(fns, entry.function);
    if (!fn) continue;
    var getAddr = makeAddrGetter(entry.contract);
    var abi = contracts[entry.contract] || [];
    var prettyKey = entry.contract + '.' + entry.function;
    var prettyRenderer = PRETTY_COMPONENTS[prettyKey] || null;
    var row = renderFunctionRow(fn, entry.contract, getAddr, abi, entry.label, entry.hint, prettyRenderer);
    if (entry.more) {
      row.style.display = 'none';
      moreRows.push(row);
    } else if (entry.extra) {
      row.style.display = 'none';
      extraRows.push(row);
    }
    container.appendChild(row);
  }

  // First toggle: show extra actions
  if (extraRows.length > 0) {
    var toggleRow = document.createElement('div');
    toggleRow.className = 'toggle-row';
    container.appendChild(toggleRow);

    var extraToggle = document.createElement('div');
    extraToggle.className = 'show-more-toggle';
    extraToggle.textContent = '[show ' + extraRows.length + ' more]';
    var extraShown = false;
    toggleRow.appendChild(extraToggle);

    // Second toggle: show even more actions (hidden until extras are shown)
    var moreToggle = null;
    var moreShown = false;
    if (moreRows.length > 0) {
      moreToggle = document.createElement('div');
      moreToggle.className = 'show-more-toggle';
      moreToggle.textContent = '[show ' + moreRows.length + ' more]';
      moreToggle.style.display = 'none';
      toggleRow.appendChild(moreToggle);

      moreToggle.addEventListener('click', function() {
        moreShown = !moreShown;
        for (var m = 0; m < moreRows.length; m++) {
          moreRows[m].style.display = moreShown ? '' : 'none';
        }
        if (moreShown) {
          moreToggle.textContent = '[show fewer]';
          extraToggle.style.display = 'none';
        } else {
          // Collapse everything — extras too
          extraShown = false;
          for (var k = 0; k < extraRows.length; k++) {
            extraRows[k].style.display = 'none';
          }
          moreToggle.style.display = 'none';
          moreToggle.textContent = '[show ' + moreRows.length + ' more]';
          extraToggle.style.display = '';
          extraToggle.textContent = '[show ' + extraRows.length + ' more]';
        }
      });
    }

    extraToggle.addEventListener('click', function() {
      extraShown = !extraShown;
      for (var k = 0; k < extraRows.length; k++) {
        extraRows[k].style.display = extraShown ? '' : 'none';
      }
      if (!extraShown) {
        // Collapse more rows too when hiding extras
        moreShown = false;
        for (var m = 0; m < moreRows.length; m++) {
          moreRows[m].style.display = 'none';
        }
        if (moreToggle) {
          moreToggle.style.display = 'none';
          moreToggle.textContent = '[show ' + moreRows.length + ' more]';
        }
      }
      extraToggle.textContent = extraShown ? '[show fewer]' : '[show ' + extraRows.length + ' more]';
      if (moreToggle) moreToggle.style.display = extraShown ? '' : 'none';
    });
  } else if (moreRows.length > 0) {
    // No extras, but has more rows — single toggle
    var toggle = document.createElement('div');
    toggle.className = 'show-more-toggle';
    toggle.textContent = '[show ' + moreRows.length + ' more]';
    var shown = false;
    toggle.addEventListener('click', function() {
      shown = !shown;
      for (var m = 0; m < moreRows.length; m++) {
        moreRows[m].style.display = shown ? '' : 'none';
      }
      toggle.textContent = shown ? '[show fewer]' : '[show ' + moreRows.length + ' more]';
    });
    container.appendChild(toggle);
  }
}

function makeAddrGetter(contractName) {
  return function(chainId) { return getAddress(contractName, chainId); };
}

function findFunction(fns, name) {
  for (var i = 0; i < fns.length; i++) {
    if (fns[i].name === name) return fns[i];
  }
  return null;
}

// --- Full Directory tab ---

export function renderDirectory() {
  var container = document.getElementById('tab-directory');
  container.innerHTML = '';

  var categoryNames = Object.keys(categories);
  for (var c = 0; c < categoryNames.length; c++) {
    var category = categoryNames[c];
    var contractNames = categories[category];
    if (!contractNames || contractNames.length === 0) continue;

    // Category header
    var catHeader = document.createElement('div');
    catHeader.className = 'category-header';
    catHeader.textContent = category.toUpperCase();
    container.appendChild(catHeader);

    // Contract rows
    for (var n = 0; n < contractNames.length; n++) {
      var contractName = contractNames[n];
      var contractSection = renderContractSection(contractName);
      container.appendChild(contractSection);
    }
  }
}

function sortedDeploymentAddresses(addresses) {
  return Object.keys(addresses || {}).sort(function(a, b) {
    return Number(a) - Number(b);
  }).map(function(chainId) {
    return {
      chainId: chainId,
      chainName: (chains[chainId] && chains[chainId].name) || ('Chain ' + chainId),
      address: addresses[chainId],
    };
  }).filter(function(deployment) {
    return !!deployment.address;
  });
}

function makeCopyAddressButton(address, label, title) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'contract-address';
  button.textContent = address;
  button.setAttribute('aria-label', 'Copy ' + label + ' address');
  button.title = title || 'Copy address';
  button.addEventListener('click', function(e) {
    e.stopPropagation();
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    navigator.clipboard.writeText(address).then(function() {
      var previousTitle = button.title;
      button.title = 'Copied';
      button.classList.add('copied');
      window.setTimeout(function() {
        button.title = previousTitle;
        button.classList.remove('copied');
      }, 1200);
    }).catch(function() {});
  });
  return button;
}

function renderContractAddresses(contractName, addresses) {
  var deployments = sortedDeploymentAddresses(addresses);
  if (deployments.length === 0) return null;

  var uniqueAddresses = [];
  deployments.forEach(function(deployment) {
    var normalized = deployment.address.toLowerCase();
    if (!uniqueAddresses.some(function(address) { return address.toLowerCase() === normalized; })) {
      uniqueAddresses.push(deployment.address);
    }
  });

  // CREATE2 deployments commonly share one address across every supported chain.
  if (uniqueAddresses.length === 1) {
    return makeCopyAddressButton(
      uniqueAddresses[0],
      contractName,
      'Copy address — ' + deployments.map(function(deployment) { return deployment.chainName; }).join(', ')
    );
  }

  var details = document.createElement('details');
  details.className = 'contract-addresses';
  details.addEventListener('click', function(e) { e.stopPropagation(); });

  var toggle = document.createElement('summary');
  toggle.textContent = '[' + deployments.length + ' chain addresses]';
  toggle.title = 'Show deployed addresses';
  details.appendChild(toggle);

  var list = document.createElement('div');
  list.className = 'contract-address-list';
  deployments.forEach(function(deployment) {
    var row = document.createElement('div');
    row.className = 'contract-address-row';
    var chainLabel = document.createElement('span');
    chainLabel.className = 'contract-address-chain';
    chainLabel.textContent = deployment.chainName;
    row.appendChild(chainLabel);
    row.appendChild(makeCopyAddressButton(
      deployment.address,
      contractName + ' on ' + deployment.chainName,
      'Copy ' + deployment.chainName + ' address'
    ));
    list.appendChild(row);
  });
  details.appendChild(list);
  return details;
}

function renderContractSection(contractName) {
  var section = document.createElement('div');
  section.className = 'contract-section';

  var fns = getFunctions(contractName);
  var contractMeta = meta[contractName];
  var isSingleton = contractMeta ? contractMeta.singleton : true;

  // Contract summary row (collapsed)
  var summary = document.createElement('div');
  summary.className = 'contract-summary';
  var arrow = document.createElement('span');
  arrow.className = 'fn-arrow';
  arrow.textContent = '\u25B8'; // ▸
  var nameSpan = document.createElement('span');
  nameSpan.className = 'contract-name';
  nameSpan.textContent = contractName + (contractMeta && contractMeta.generation !== 'current' ? ' [' + contractMeta.generation + ' — retired]' : '');
  var countSpan = document.createElement('span');
  countSpan.className = 'contract-fn-count';
  countSpan.textContent = '(' + fns.length + ' functions)';
  if (!isSingleton) {
    var perProject = document.createElement('span');
    perProject.className = 'per-project-hint';
    perProject.textContent = ' [per-project]';
    countSpan.appendChild(perProject);
  }
  summary.appendChild(arrow);
  summary.appendChild(nameSpan);
  summary.appendChild(countSpan);

  var addressDisplay = renderContractAddresses(contractName, contractMeta && contractMeta.addresses);
  if (addressDisplay) summary.appendChild(addressDisplay);

  // GitHub source link (contract-level)
  var ghUrl = getGithubUrl(contractName);
  if (ghUrl) {
    var ghLink = document.createElement('a');
    ghLink.className = 'contract-source-link';
    ghLink.href = ghUrl;
    ghLink.target = '_blank';
    ghLink.rel = 'noopener';
    ghLink.textContent = '[source ↗]';
    ghLink.addEventListener('click', function(e) { e.stopPropagation(); });
    summary.appendChild(ghLink);
  }

  var expanded = false;
  var contentEl = null;

  // Show contract-level natspec notice below the summary row
  var noticeRow = null;
  if (contractMeta && contractMeta.notice) {
    noticeRow = document.createElement('div');
    noticeRow.className = 'contract-notice';
    noticeRow.textContent = contractMeta.notice;
  }

  summary.addEventListener('click', function() {
    expanded = !expanded;
    arrow.textContent = expanded ? '\u25BE' : '\u25B8'; // ▾ or ▸
    if (expanded && !contentEl) {
      contentEl = document.createElement('div');
      contentEl.className = 'contract-content';

      // Per-project address input
      var addressOverride = null;
      if (!isSingleton) {
        var addrGroup = document.createElement('div');
        addrGroup.className = 'address-override';
        var addrLabel = document.createElement('label');
        addrLabel.className = 'input-label';
        addrLabel.innerHTML = 'contract address <span class="type-hint">required — this contract is deployed per-project</span>';
        addrGroup.appendChild(addrLabel);
        var addrInput = document.createElement('input');
        addrInput.type = 'text';
        addrInput.className = 'field';
        addrInput.placeholder = '0x... paste your deployment address';
        addrGroup.appendChild(addrInput);
        contentEl.appendChild(addrGroup);
        addressOverride = addrInput;
      }

      var abi = contracts[contractName] || [];

      // Function rows
      for (var i = 0; i < fns.length; i++) {
        (function(fn) {
          var getAddr = function(chainId) {
            if (addressOverride && addressOverride.value.trim()) return addressOverride.value.trim();
            return getAddress(contractName, chainId);
          };
          var row = renderFunctionRowLazy(fn, contractName, getAddr, abi);
          contentEl.appendChild(row);
        })(fns[i]);
      }

      section.appendChild(contentEl);
    } else if (contentEl) {
      contentEl.style.display = expanded ? '' : 'none';
    }
  });

  section.appendChild(summary);
  if (noticeRow) section.appendChild(noticeRow);
  return section;
}

// --- Shared: collapsible function row ---

function renderFunctionRow(fn, contractName, getContractAddr, abi, label, hint, loadPretty) {
  var row = document.createElement('div');
  row.className = 'fn-row';

  var isRead = fn.stateMutability === 'view' || fn.stateMutability === 'pure';
  var isPayable = fn.stateMutability === 'payable';

  // Collapsed header
  var summary = document.createElement('div');
  summary.className = 'fn-summary';
  var arrowEl = document.createElement('span');
  arrowEl.className = 'fn-arrow';
  arrowEl.textContent = '\u25B8';
  var nameEl = document.createElement('span');
  nameEl.className = 'fn-name-preview ' + (isRead ? 'read' : 'write');
  nameEl.textContent = label || fn.name;
  var contractHint = document.createElement('span');
  contractHint.className = 'fn-contract-hint';
  contractHint.textContent = contractName;

  summary.appendChild(arrowEl);
  summary.appendChild(nameEl);
  if (isPayable) {
    var payBadge = document.createElement('span');
    payBadge.className = 'badge payable';
    payBadge.textContent = 'PAYABLE';
    summary.appendChild(payBadge);
  }
  summary.appendChild(contractHint);
  if (hint) {
    var hintEl = document.createElement('span');
    hintEl.className = 'fn-hint';
    hintEl.textContent = hint;
    summary.appendChild(hintEl);
  }

  var expanded = false;
  var contentEl = null;

  var failedEl = null;
  summary.addEventListener('click', function() {
    if (failedEl) { failedEl.remove(); failedEl = null; }
    expanded = !expanded;
    arrowEl.textContent = expanded ? '\u25BE' : '\u25B8';
    if (expanded && !contentEl) {
      contentEl = document.createElement('div');
      contentEl.style.padding = '0 12px 12px';

      if (loadPretty) {
        contentEl.textContent = 'Loading…';
        loadPretty().then(function(prettyRenderer) {
          contentEl.textContent = '';
          // Toolbar: pretty/raw + [style] + [embed] + [ask your assistant]
          var selectorWrap = document.createElement('div');
          selectorWrap.className = 'fn-view-selector';

          var componentEl = prettyRenderer();
          var compPrefix = componentEl._compPrefix || '';
          var compGetEmbedParams = componentEl._compGetEmbedParams || null;

          var viewSelect = document.createElement('select');
          viewSelect.className = 'fn-view-dropdown';
          var prettyOpt = document.createElement('option');
          prettyOpt.value = 'pretty';
          prettyOpt.textContent = 'pretty';
          viewSelect.appendChild(prettyOpt);
          var rawOpt = document.createElement('option');
          rawOpt.value = 'raw';
          rawOpt.textContent = 'raw';
          viewSelect.appendChild(rawOpt);
          selectorWrap.appendChild(viewSelect);

          // Style toggle next to pretty/raw dropdown
          var styleToggle = document.createElement('button');
          styleToggle.type = 'button';
          styleToggle.className = 'style-toggle-btn';
          styleToggle.textContent = '[style]';
          selectorWrap.appendChild(styleToggle);

          if (compGetEmbedParams) {
            var copyEmbedBtn = document.createElement('button');
            copyEmbedBtn.type = 'button';
            copyEmbedBtn.className = 'style-toggle-btn';
            copyEmbedBtn.textContent = '[embed]';
            copyEmbedBtn.addEventListener('click', function(e) {
              e.preventDefault();
              var src = buildEmbedUrl(compPrefix, compGetEmbedParams());
              var snippet = '<iframe src="' + src + '" width="540" height="600" frameborder="0"></iframe>';
              navigator.clipboard.writeText(snippet).then(function() {
                copyEmbedBtn.textContent = '[copied]';
                setTimeout(function() { copyEmbedBtn.textContent = '[embed]'; }, 1500);
              });
            });
            selectorWrap.appendChild(copyEmbedBtn);
          }

          var copyPromptLink = document.createElement('button');
          copyPromptLink.type = 'button';
          copyPromptLink.className = 'fn-copy-prompt';
          copyPromptLink.textContent = '[ask your assistant]';
          copyPromptLink.addEventListener('click', function(e) {
            e.preventDefault();
            var fnNs = natspec[contractName] ? natspec[contractName][fn.name] : null;
            var prompt = getComponentAuditPrompt(fn, contractName, fnNs, componentEl);
            navigator.clipboard.writeText(prompt).then(function() {
              copyPromptLink.textContent = '[copied]';
              setTimeout(function() { copyPromptLink.textContent = '[ask your assistant]'; }, 2000);
            });
          });
          selectorWrap.appendChild(copyPromptLink);

          contentEl.appendChild(selectorWrap);

          // Inline style editor panel (above component, hidden by default)
          var stylePanel = null;
          var styleVisible = false;
          var styleInlineWrap = document.createElement('div');
          styleInlineWrap.className = 'style-inline-wrap';
          styleInlineWrap.style.display = 'none';
          contentEl.appendChild(styleInlineWrap);

          var prettyContent = document.createElement('div');
          prettyContent.className = 'pretty-content-wrap';
          prettyContent.appendChild(componentEl);
          contentEl.appendChild(prettyContent);

          styleToggle.addEventListener('click', function(e) {
            e.preventDefault();
            styleVisible = !styleVisible;
            if (styleVisible && !stylePanel) {
              stylePanel = renderStyleEditor(prettyContent, function() {
                styleVisible = false;
                styleInlineWrap.style.display = 'none';
                styleToggle.textContent = '[style]';
              });
              stylePanel.className = 'style-editor-inline';
              styleInlineWrap.appendChild(stylePanel);
            }
            styleInlineWrap.style.display = styleVisible ? '' : 'none';
            styleToggle.textContent = styleVisible ? '[hide style]' : '[style]';
          });

          var rawContent = document.createElement('div');
          rawContent.style.display = 'none';
          var rawForm = null;
          contentEl.appendChild(rawContent);

          viewSelect.addEventListener('change', function() {
            if (viewSelect.value === 'pretty') {
              prettyContent.style.display = '';
              rawContent.style.display = 'none';
              styleToggle.style.display = '';
              if (styleVisible) styleInlineWrap.style.display = '';
            } else {
              prettyContent.style.display = 'none';
              rawContent.style.display = '';
              styleToggle.style.display = 'none';
              styleInlineWrap.style.display = 'none';
              if (!rawForm) {
                var fnNatspec = natspec[contractName] ? natspec[contractName][fn.name] : null;
                rawForm = renderFunctionForm(fn, contractName, getContractAddr, abi, fnNatspec);
                rawContent.appendChild(rawForm);
              }
            }
          });
        }, function(error) {
          // Keep the message visible until the next click on the row collapses it.
          contentEl.textContent = CHUNK_FAILED_TEXT + ' ';
          contentEl.appendChild(chunkReloadButton());
          failedEl = contentEl;
          contentEl = null;
          expanded = false;
          arrowEl.textContent = '\u25B8';
        });
      } else {
        // No component — just render raw form directly
        var fnNatspec = natspec[contractName] ? natspec[contractName][fn.name] : null;
        var formEl = renderFunctionForm(fn, contractName, getContractAddr, abi, fnNatspec);
        contentEl.appendChild(formEl);
      }

      row.appendChild(contentEl);
    } else if (contentEl) {
      contentEl.style.display = expanded ? '' : 'none';
    }
  });

  row.appendChild(summary);
  return row;
}

function renderFunctionRowLazy(fn, contractName, getContractAddr, abi) {
  var row = document.createElement('div');
  row.className = 'fn-row';

  var isRead = fn.stateMutability === 'view' || fn.stateMutability === 'pure';
  var isPayable = fn.stateMutability === 'payable';

  var summary = document.createElement('div');
  summary.className = 'fn-summary';
  var arrowEl = document.createElement('span');
  arrowEl.className = 'fn-arrow';
  arrowEl.textContent = '\u25B8';
  var nameEl = document.createElement('span');
  nameEl.className = 'fn-name-preview ' + (isRead ? 'read' : 'write');
  nameEl.textContent = fn.name;
  var contractHint = document.createElement('span');
  contractHint.className = 'fn-contract-hint';
  contractHint.textContent = contractName;

  summary.appendChild(arrowEl);
  summary.appendChild(nameEl);
  if (isPayable) {
    var payBadge = document.createElement('span');
    payBadge.className = 'badge payable';
    payBadge.textContent = 'PAYABLE';
    summary.appendChild(payBadge);
  }

  // Source link (per-function) \u2014 kept inline with the function name.
  var fnGhUrl = getGithubUrl(contractName, fn);
  if (fnGhUrl) {
    var fnGhLink = document.createElement('a');
    fnGhLink.className = 'fn-source-link';
    fnGhLink.href = fnGhUrl;
    fnGhLink.target = '_blank';
    fnGhLink.rel = 'noopener';
    fnGhLink.textContent = '[source \u2197]';
    fnGhLink.addEventListener('click', function(e) { e.stopPropagation(); });
    summary.appendChild(fnGhLink);
  }

  summary.appendChild(contractHint);

  // Show natspec notice as a hint below the function name
  var fnNs = natspec[contractName] ? natspec[contractName][fn.name] : null;
  if (fnNs && fnNs.notice) {
    var hintEl = document.createElement('span');
    hintEl.className = 'fn-hint';
    hintEl.textContent = fnNs.notice;
    summary.appendChild(hintEl);
  }

  var expanded = false;
  var expandedContent = null;

  summary.addEventListener('click', function() {
    expanded = !expanded;
    arrowEl.textContent = expanded ? '\u25BE' : '\u25B8';
    if (expanded && !expandedContent) {
      expandedContent = document.createElement('div');
      expandedContent.className = 'fn-expanded';

      var fnNatspec = natspec[contractName] ? natspec[contractName][fn.name] : null;
      var srcInfo = getFunctionSource(contractName, fn);

      // 1. OVERVIEW \u2014 signature + natspec
      expandedContent.appendChild(buildOverviewSection(fn, fnNatspec));

      // 2. SOURCE \u2014 function body
      if (srcInfo) {
        expandedContent.appendChild(buildSourceSection(contractName, fn, srcInfo));
      }

      // 3. TRANSACTION \u2014 actionable form (lazy: only render on first open)
      expandedContent.appendChild(buildTransactionSection(function() {
        var formEl = renderFunctionForm(fn, contractName, getContractAddr, abi, fnNatspec);
        formEl.classList.add('fn-form-compact');
        // Remove the natspec block from inside the form \u2014 it now lives in OVERVIEW.
        var dupNatspec = formEl.querySelector('.fn-natspec');
        if (dupNatspec) dupNatspec.remove();
        return formEl;
      }));

      row.appendChild(expandedContent);
    } else if (expandedContent) {
      expandedContent.style.display = expanded ? '' : 'none';
    }
  });

  row.appendChild(summary);
  return row;
}

// --- Collapsible section builders for the expanded function view ---

// Generic collapsible: header (clickable) + body. `getBody` may be a function
// that returns a DOM node (lazy build), or a DOM node directly.
function buildFnSection(label, getBody, opts) {
  opts = opts || {};
  var meta = opts.meta || '';
  var defaultOpen = !!opts.defaultOpen;
  var bodyClass = opts.bodyClass || 'fn-section-body';

  var wrap = document.createElement('div');
  wrap.className = 'fn-section ' + (opts.extraClass || '');

  var header = document.createElement('div');
  header.className = 'fn-section-header';
  var arrow = document.createElement('span');
  arrow.className = 'fn-section-arrow';
  arrow.textContent = defaultOpen ? '▾' : '▸';
  var labelEl = document.createElement('span');
  labelEl.className = 'fn-section-label';
  labelEl.textContent = label;
  header.appendChild(arrow);
  header.appendChild(labelEl);
  if (meta) {
    var metaEl = document.createElement('span');
    metaEl.className = 'fn-section-meta';
    metaEl.textContent = meta;
    header.appendChild(metaEl);
  }
  wrap.appendChild(header);

  var body = document.createElement('div');
  body.className = bodyClass;
  body.style.display = defaultOpen ? '' : 'none';
  wrap.appendChild(body);

  var built = false;
  var open = defaultOpen;
  function ensureBuilt() {
    if (built) return;
    var node = typeof getBody === 'function' ? getBody() : getBody;
    if (node) body.appendChild(node);
    built = true;
  }
  if (defaultOpen) ensureBuilt();

  header.addEventListener('click', function() {
    open = !open;
    arrow.textContent = open ? '▾' : '▸';
    if (open) ensureBuilt();
    body.style.display = open ? '' : 'none';
  });

  return wrap;
}

// Format a Solidity function signature from an ABI entry.
function formatFunctionSignature(fn) {
  function paramStr(p) {
    var t = p.internalType || p.type;
    t = t.replace(/^struct\s+/, '').replace(/^contract\s+/, '').replace(/^enum\s+/, '');
    return p.name ? (t + ' ' + p.name) : t;
  }
  var inputs = (fn.inputs || []).map(paramStr).join(', ');
  var outputs = (fn.outputs || []).map(paramStr).join(', ');
  var mut = fn.stateMutability && fn.stateMutability !== 'nonpayable' ? ' ' + fn.stateMutability : '';
  var ret = outputs ? ' returns (' + outputs + ')' : '';
  return 'function ' + fn.name + '(' + inputs + ') external' + mut + ret;
}

function buildOverviewSection(fn, fnNatspec) {
  return buildFnSection('overview', function() {
    var wrap = document.createElement('div');
    wrap.className = 'fn-overview';

    var sig = document.createElement('pre');
    sig.className = 'fn-overview-sig';
    var code = document.createElement('code');
    code.textContent = formatFunctionSignature(fn);
    sig.appendChild(code);
    wrap.appendChild(sig);

    if (fnNatspec && fnNatspec.notice) {
      var n = document.createElement('div');
      n.className = 'fn-overview-notice';
      n.textContent = fnNatspec.notice;
      wrap.appendChild(n);
    }
    if (fnNatspec && fnNatspec.details) {
      var d = document.createElement('div');
      d.className = 'fn-overview-details';
      d.textContent = fnNatspec.details;
      wrap.appendChild(d);
    }
    if (fnNatspec && fnNatspec.params && fn.inputs && fn.inputs.length) {
      var paramKeys = Object.keys(fnNatspec.params);
      if (paramKeys.length) {
        var list = document.createElement('dl');
        list.className = 'fn-overview-params';
        for (var i = 0; i < fn.inputs.length; i++) {
          var pname = fn.inputs[i].name;
          if (!pname) continue;
          var key = fnNatspec.params[pname] ? pname : pname.replace(/^_/, '');
          var desc = fnNatspec.params[key];
          if (!desc) continue;
          var dt = document.createElement('dt');
          dt.textContent = pname;
          var dd = document.createElement('dd');
          dd.textContent = desc;
          list.appendChild(dt);
          list.appendChild(dd);
        }
        if (list.childNodes.length) wrap.appendChild(list);
      }
    }
    return wrap;
  }, { defaultOpen: true });
}

// The body comes from the lazy abi-sources chunk the first time the section opens.
function buildSourceSection(contractName, fn, srcInfo) {
  return buildFnSection('source', function() {
    var pre = document.createElement('pre');
    pre.className = 'fn-source-code';
    var code = document.createElement('code');
    pre.appendChild(code);
    function load() {
      code.textContent = 'Loading source…';
      loadFunctionSourceBody(contractName, fn).then(function(body) {
        code.textContent = body || 'Source unavailable.';
      }, function() {
        code.textContent = CHUNK_FAILED_TEXT + ' ';
        code.appendChild(chunkReloadButton());
      });
    }
    load();
    return pre;
  }, {
    meta: 'L' + srcInfo.startLine + '–L' + srcInfo.endLine,
    defaultOpen: false,
    bodyClass: 'fn-section-body fn-source-body',
  });
}

function buildTransactionSection(getForm) {
  return buildFnSection('use', getForm, { defaultOpen: false });
}

