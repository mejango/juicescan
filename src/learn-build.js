// src/learn-build.js
// Learn & Build tab content — engaging walkthrough of the Juicebox protocol

import { LEARN_SECTIONS } from './learn-sections.js';
import { BUILD_SECTIONS } from './build-sections.js';

export function renderLearnTab() {
  var container = document.getElementById('tab-learn');
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap';
  wrap.appendChild(guideJourneyLinks('learn'));

  appendGuideSections(wrap, LEARN_SECTIONS);

  container.appendChild(wrap);
  initSmoothScroll(container);
}

// Table of contents, then every section in order, grouped by part. Learn and Build share it, as they share
// one section shape with juicebox.money.
function appendGuideSections(wrap, sections) {
  var toc = document.createElement('nav');
  toc.className = 'guide-toc';
  toc.innerHTML = '<div class="guide-toc-title">TABLE OF CONTENTS</div>';
  var lastPart = '';
  sections.forEach(function (section, i) {
    if (section.part !== lastPart) {
      var label = document.createElement('div');
      label.className = 'guide-toc-group-label';
      if (lastPart) label.style.marginTop = '8px';
      label.textContent = section.part;
      toc.appendChild(label);
    }
    var link = document.createElement('a');
    link.className = 'guide-toc-link';
    link.href = '#' + section.id;
    link.textContent = (i + 1) + '. ' + section.title;
    toc.appendChild(link);
    lastPart = section.part;
  });
  wrap.appendChild(toc);

  lastPart = '';
  sections.forEach(function (section, i) {
    if (section.part !== lastPart) {
      var header = document.createElement('div');
      header.className = 'guide-part-header';
      header.textContent = section.part.toUpperCase();
      wrap.appendChild(header);
      lastPart = section.part;
    }
    var extras = (section.aliases || []).map(function (alias) {
      var anchor = document.createElement('span');
      anchor.id = alias;
      return anchor;
    });
    (section.blocks || []).forEach(function (block) {
      extras.push.apply(extras, learnBlock(block));
    });
    wrap.appendChild(guideSection(section.id, (i + 1) + '. ' + section.title.toUpperCase(), section.paragraphs || [], extras));
  });
}

// Learn and Build link to each other inside this bundle; other jbm-relative links point back to juicebox.money.
function learnHref(href) {
  var guide = /^\/(learn|build)(#.*)?$/.exec(href);
  if (guide) return guide[1] + '.html' + (guide[2] || '');
  return href.charAt(0) === '/' ? 'https://juicebox.money' + href : href;
}

// Guide prose may link a word with `[label](href)`; everything else renders as text.
var INLINE_LINK = /\[([^\]]+)\]\(((?:#|\/|https?:)[^)\s]*)\)/g;
function inline(node, text) {
  var last = 0;
  text.replace(INLINE_LINK, function (match, label, href, index) {
    node.appendChild(document.createTextNode(text.slice(last, index)));
    var a = document.createElement('a');
    a.href = learnHref(href);
    a.textContent = label;
    node.appendChild(a);
    last = index + match.length;
  });
  node.appendChild(document.createTextNode(text.slice(last)));
  return node;
}

// Same rule as juicebox.money's guideRowId, so `#term-cash-out-tax` works on both sites.
function rowId(prefix, name) {
  return prefix + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function compareTable(label, columns, rows) {
  var wrap = document.createElement('div');
  wrap.className = 'guide-prop-table';
  var table = document.createElement('table');
  table.className = 'guide-compare-table';
  var caption = document.createElement('caption');
  caption.className = 'guide-prop-title';
  caption.textContent = label;
  table.appendChild(caption);
  [columns].concat(rows).forEach(function (cells, i) {
    var tr = document.createElement('tr');
    cells.forEach(function (cell) {
      var td = document.createElement(i ? 'td' : 'th');
      if (!i) td.scope = 'col';
      td.textContent = cell;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  return wrap;
}

function learnBlock(block) {
  if (block.type === 'diagram') return [diagram(block.label, block.lines)];
  if (block.type === 'table') return [block.rowIdPrefix ? glossaryList(block.rows, block.rowIdPrefix) : propertyTable(block.label, block.rows, block.plainKeys)];
  if (block.type === 'compare') return [compareTable(block.label, block.columns, block.rows)];
  if (block.type === 'points') return block.items.map(function (item) {
    var p = document.createElement('p');
    p.className = 'guide-text';
    var key = document.createElement('strong');
    key.textContent = item.key + ':';
    p.appendChild(key);
    return inline(p, ' ' + item.text);
  });
  if (block.type === 'steps') return [stepList(block.items)];
  if (block.type === 'info') return [infoBox(block.text)];
  if (block.type === 'text') return [textBlock(block.text)];
  if (block.type === 'code') return [codeBlock(block.label, block.code)];
  if (block.type === 'links') return block.items.map(function (item) { return guideReference(learnHref(item.href), item.label); });
  return [];
}

export function renderBuildTab() {
  var container = document.getElementById('tab-build');
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap';
  wrap.appendChild(guideJourneyLinks('build'));

  var agentPrompt = document.createElement('p');
  agentPrompt.className = 'guide-agent-prompt';
  agentPrompt.appendChild(document.createTextNode('Building with an agent? '));
  var agentPromptButton = document.createElement('button');
  agentPromptButton.type = 'button';
  agentPromptButton.textContent = 'Copy the Juicebox build prompt';
  var prompt = [
      'I want to build a product or platform on Juicebox V6.',
      '',
      'My product: [describe the users, the value they exchange, and the experience I want].',
      '',
      'Act as my protocol engineer and product architect. Start by reading the Learn and Build sections in this Juicescan bundle, then inspect https://github.com/Bananapus/version-6 and https://github.com/mejango/juicescan. Use only current V6 repositories; do not substitute older Juicebox versions.',
      '',
      'Design the smallest safe architecture that gives my users a native product experience while Juicebox handles the money layer. Decide whether I need a flexible Juicebox project, a revnet with committed economics, or both. Map every user action to exact V6 reads and transactions, including payments, token issuance, cash outs, payouts, shops, hooks, permissions, and multichain settlement where relevant.',
      '',
      'For each transaction, identify the contract, function, arguments, units, permissions, fees, approvals, slippage or minimum-output protection, and the state that must be re-read immediately before signing. Use pure transaction builders which round-trip through the ABI. Show and decode every transaction before asking for a signature.',
      '',
      'Deliver: (1) a plain-language product flow, (2) the onchain architecture, (3) a threat model and trust assumptions, (4) an incremental implementation plan, (5) test cases and invariants, and (6) the first working vertical slice. Keep the interface branded as my product; treat Juicebox as open infrastructure, not a hosted dependency.'
    ].join('\n');
  agentPromptButton.addEventListener('click', function () {
    var copied = function () {
      agentPromptButton.textContent = 'Build prompt copied';
      setTimeout(function () { agentPromptButton.textContent = 'Copy the Juicebox build prompt'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).then(copied, copied);
    else {
      try {
        var textarea = document.createElement('textarea');
        textarea.value = prompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (_) {}
      copied();
    }
  });
  agentPrompt.appendChild(agentPromptButton);
  agentPrompt.appendChild(document.createTextNode('.'));
  wrap.appendChild(agentPrompt);
  var promptDetails = document.createElement('details');
  var promptSummary = document.createElement('summary');
  promptSummary.textContent = 'Read or copy the build prompt';
  promptDetails.appendChild(promptSummary);
  promptDetails.appendChild(codeBlock('Juicebox V6 build prompt', prompt));
  wrap.appendChild(promptDetails);

  appendGuideSections(wrap, BUILD_SECTIONS);

  container.appendChild(wrap);
  initSmoothScroll(container);
}

export function renderWhyTab() {
  var container = document.getElementById('tab-why');
  if (!container) return;
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap why-wrap why-wants';

  var hero = document.createElement('div');
  hero.className = 'why-hero';

  var kicker = document.createElement('div');
  kicker.className = 'why-kicker';
  kicker.textContent = 'WHY JUICEBOX?';
  hero.appendChild(kicker);

  var title = document.createElement('div');
  title.className = 'why-title';
  title.textContent = 'What projects get with Juicebox';
  hero.appendChild(title);

  wrap.appendChild(hero);

  var wants = [
    "Payments from any app or chain",
    "Tokens for supporters",
    "Rules anyone can check",
    "Flexible rules or a committed schedule",
    "Your own site and tools",
    "Open code"
  ];

  var list = document.createElement('div');
  list.className = 'why-wants-list';
  for (var i = 0; i < wants.length; i++) {
    var w = document.createElement('p');
    w.className = 'why-want';
    w.textContent = wants[i];
    list.appendChild(w);
  }
  wrap.appendChild(list);

  container.appendChild(wrap);
}

// --- Helper builders ---

function guideJourneyLinks(guide) {
  var nav = document.createElement('nav');
  nav.className = 'guide-text';
  nav.setAttribute('aria-label', 'Learn, build, and inspect a payment');
  [
    ['https://juicebox.money/learn#learn-before-you-pay', 'Understand a payment'],
    ['https://juicebox.money/build/first-payment', 'Read, pay on testnet, and verify'],
    ['https://revnet.money/learn#three-prices', 'Understand revnet prices'],
    [guide === 'learn' ? '#learn-glossary' : 'learn.html#learn-glossary', 'Glossary'],
    [guide + '.html', 'Read this guide without JavaScript'],
  ].forEach(function (item) {
    var p = document.createElement('p');
    var a = document.createElement('a');
    a.href = item[0];
    a.textContent = item[1];
    p.appendChild(a);
    nav.appendChild(p);
  });
  return nav;
}

function guideReference(href, label, id) {
  var p = document.createElement('p');
  p.className = 'guide-text';
  if (id) p.id = id;
  var link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  p.appendChild(link);
  return p;
}

function glossaryList(rows, idPrefix) {
  var list = document.createElement('dl');
  list.className = 'guide-glossary';
  rows.forEach(function (row) {
    var term = document.createElement('dt');
    term.id = rowId(idPrefix, row[0]);
    term.textContent = row[0];
    var meaning = document.createElement('dd');
    meaning.textContent = row[1];
    list.appendChild(term);
    list.appendChild(meaning);
  });
  return list;
}

// A small link icon next to a section header that copies a deep link to that section (paste to an LLM).
function sectionLinkButton(id) {
  var btn = document.createElement('button');
  btn.className = 'guide-copy-link';
  btn.type = 'button';
  btn.title = 'Copy a link to this section';
  btn.setAttribute('aria-label', 'Copy link to this section');
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  btn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    var url = location.origin + location.pathname + location.search + '#' + id;
    var ok = function () { btn.classList.add('guide-copy-link--ok'); btn.title = 'Copied'; setTimeout(function () { btn.classList.remove('guide-copy-link--ok'); btn.title = 'Copy a link to this section'; }, 1300); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, ok);
    else { try { var ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (_) {} ok(); }
  });
  return btn;
}

function guideSection(id, title, paragraphs, extras) {
  var section = document.createElement('div');
  section.className = 'guide-section';
  section.id = id;

  var h = document.createElement('h2');
  h.className = 'guide-section-title';
  var titleSpan = document.createElement('span');
  titleSpan.textContent = title;
  h.appendChild(titleSpan);
  // Copy a deep link to this section — paste it to an LLM ("recreate this feature against the V6 contracts")
  // or share it. The link routes back to this tab + scrolls here (see applyHash in app.js).
  h.appendChild(sectionLinkButton(id));
  section.appendChild(h);

  for (var i = 0; i < paragraphs.length; i++) {
    var p = document.createElement('p');
    p.className = 'guide-text';
    section.appendChild(inline(p, paragraphs[i]));
  }

  if (extras) {
    for (var j = 0; j < extras.length; j++) {
      section.appendChild(extras[j]);
    }
  }

  return section;
}

function diagram(label, lines) {
  var el = document.createElement('div');
  el.className = 'guide-diagram';
  // Diagrams scroll horizontally on narrow screens. Make that viewport
  // keyboard-reachable instead of trapping the content behind touch input.
  el.tabIndex = 0;
  var title = document.createElement('div');
  title.className = 'guide-diagram-title';
  title.textContent = label;
  el.appendChild(title);
  var pre = document.createElement('pre');
  pre.className = 'guide-diagram-pre';
  pre.textContent = lines.join('\n');
  el.appendChild(pre);
  return el;
}

function propertyTable(label, rows, plainKeys) {
  var el = document.createElement('div');
  el.className = 'guide-prop-table';
  if (label) {
    var title = document.createElement('div');
    title.className = 'guide-prop-title';
    title.textContent = label;
    el.appendChild(title);
  }
  for (var i = 0; i < rows.length; i++) {
    var row = document.createElement('div');
    row.className = 'guide-prop-row';
    var name = document.createElement('code');
    name.className = plainKeys ? 'guide-prop-name guide-prop-name-plain' : 'guide-prop-name';
    name.textContent = rows[i][0];
    var desc = document.createElement('span');
    desc.className = 'guide-prop-desc';
    desc.textContent = rows[i][1];
    row.appendChild(name);
    row.appendChild(desc);
    el.appendChild(row);
  }
  return el;
}

function codeBlock(label, code) {
  var el = document.createElement('div');
  el.className = 'guide-code';
  // Long examples scroll horizontally at phone widths; expose that scroll
  // region to keyboard and assistive-technology users as well.
  el.tabIndex = 0;
  if (label) {
    var title = document.createElement('div');
    title.className = 'guide-code-title';
    title.textContent = label;
    el.appendChild(title);
  }
  var pre = document.createElement('pre');
  pre.className = 'guide-code-pre';
  pre.textContent = code;
  el.appendChild(pre);
  return el;
}

function infoBox(text) {
  var el = document.createElement('div');
  el.className = 'guide-info';
  return inline(el, text);
}

function textBlock(text) {
  var p = document.createElement('p');
  p.className = 'guide-text';
  return inline(p, text);
}

function stepList(items) {
  var el = document.createElement('div');
  el.className = 'guide-steps';
  for (var i = 0; i < items.length; i++) {
    var step = document.createElement('div');
    step.className = 'guide-step';
    var num = document.createElement('span');
    num.className = 'guide-step-num';
    num.textContent = (i + 1);
    var text = document.createElement('span');
    text.className = 'guide-step-text';
    inline(text, items[i]);
    step.appendChild(num);
    step.appendChild(text);
    el.appendChild(step);
  }
  return el;
}

function initSmoothScroll(container) {
  container.querySelectorAll('.guide-toc-link').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var targetId = link.getAttribute('href').slice(1);
      var target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}
