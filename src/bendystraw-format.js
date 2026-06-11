// src/bendystraw-format.js
// Type-aware cell formatters for Bendystraw query results.
// Each formatter returns a DOM node so callers can append directly.

import { CHAINS } from './chain.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function explorerUrl(chainId) {
  const chain = CHAINS[chainId];
  return (chain && chain.blockExplorers && chain.blockExplorers.default && chain.blockExplorers.default.url) || null;
}

function shorten(s, head, tail) {
  if (!s) return '';
  const str = String(s);
  if (str.length <= head + tail + 2) return str;
  return str.slice(0, head) + '…' + str.slice(-tail);
}

export function text(value) {
  const span = document.createElement('span');
  span.textContent = value == null ? '—' : String(value);
  return span;
}

export function number(value) {
  const span = document.createElement('span');
  if (value == null || value === '') { span.textContent = '—'; return span; }
  const n = typeof value === 'string' ? Number(value) : value;
  span.textContent = Number.isFinite(n) ? n.toLocaleString() : String(value);
  return span;
}

export function address(value, row) {
  const span = document.createElement('span');
  if (!value || value === ZERO_ADDRESS) {
    span.className = 'data-cell-address muted';
    span.textContent = '0x0…0';
    span.title = ZERO_ADDRESS;
    return span;
  }
  const chainId = row && row.chainId;
  const url = chainId && explorerUrl(chainId);
  if (url) {
    const a = document.createElement('a');
    a.href = url + '/address/' + value;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'data-cell-address';
    a.textContent = shorten(value, 6, 4);
    a.title = value;
    return a;
  }
  span.className = 'data-cell-address';
  span.textContent = shorten(value, 6, 4);
  span.title = value;
  return span;
}

export function txHash(value, row) {
  const span = document.createElement('span');
  if (!value) { span.textContent = '—'; return span; }
  const chainId = row && row.chainId;
  const url = chainId && explorerUrl(chainId);
  if (url) {
    const a = document.createElement('a');
    a.href = url + '/tx/' + value;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'data-cell-txhash';
    a.textContent = shorten(value, 8, 6);
    a.title = value;
    return a;
  }
  span.className = 'data-cell-txhash';
  span.textContent = shorten(value, 8, 6);
  span.title = value;
  return span;
}

export function timestamp(value) {
  const span = document.createElement('span');
  if (!value) { span.textContent = '—'; return span; }
  const sec = typeof value === 'string' ? parseInt(value, 10) : value;
  if (!Number.isFinite(sec)) { span.textContent = String(value); return span; }
  const date = new Date(sec * 1000);
  const now = Date.now();
  const diffSec = (now - date.getTime()) / 1000;
  let rel;
  if (diffSec < 60) rel = Math.floor(diffSec) + 's ago';
  else if (diffSec < 3600) rel = Math.floor(diffSec / 60) + 'm ago';
  else if (diffSec < 86400) rel = Math.floor(diffSec / 3600) + 'h ago';
  else if (diffSec < 86400 * 30) rel = Math.floor(diffSec / 86400) + 'd ago';
  else rel = date.toISOString().slice(0, 10);
  span.textContent = rel;
  span.title = date.toISOString();
  span.className = 'data-cell-time';
  return span;
}

// Format a wei amount given a known decimals + currency code (1 = ETH-like, 2 = USDC-like).
// Bendystraw returns chain-native amounts in this shape.
export function amount(value, row, opts) {
  const span = document.createElement('span');
  if (value == null || value === '') { span.textContent = '—'; return span; }
  const decimals = (opts && opts.decimals) || (row && row.decimals) || 18;
  const currency = (opts && opts.currency) || (row && row.currency) || 1;
  const symbol = currency === 2 ? 'USDC' : 'ETH';
  const precision = currency === 2 ? 2 : 4;
  try {
    const raw = BigInt(String(value).split('.')[0]);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    // Build fractional with full precision then trim
    const fracStr = (frac.toString().padStart(decimals, '0')).slice(0, precision);
    span.textContent = whole.toString() + (precision > 0 ? '.' + fracStr : '') + ' ' + symbol;
  } catch (e) {
    span.textContent = String(value);
  }
  return span;
}

// volumeUsd / amountUsd are 18-decimal scaled USD. Use BigInt to avoid Number precision loss.
export function volumeUsd(value) {
  const span = document.createElement('span');
  if (value == null || value === '' || value === '0') { span.textContent = '—'; return span; }
  try {
    const raw = BigInt(String(value).split('.')[0]);
    const usd = Number(raw / BigInt(1e12)) / 1e6;
    let str;
    if (usd >= 1_000_000) str = '$' + (usd / 1_000_000).toFixed(2) + 'M';
    else if (usd >= 1_000) str = '$' + (usd / 1_000).toFixed(2) + 'k';
    else if (usd >= 1) str = '$' + usd.toFixed(2);
    else str = '$' + usd.toFixed(4);
    span.textContent = str;
  } catch (e) { span.textContent = String(value); }
  return span;
}

export function bigint(value) {
  const span = document.createElement('span');
  if (value == null || value === '') { span.textContent = '—'; return span; }
  try {
    const n = BigInt(String(value).split('.')[0]);
    span.textContent = n.toLocaleString();
  } catch (e) { span.textContent = String(value); }
  span.className = 'data-cell-bigint';
  return span;
}

export function bool(value) {
  const span = document.createElement('span');
  span.textContent = value === true ? '✓' : value === false ? '·' : '—';
  span.className = 'data-cell-bool';
  return span;
}

export function chainName(value) {
  const span = document.createElement('span');
  const chain = value && CHAINS[Number(value)];
  if (chain) {
    span.textContent = chain.name;
    span.title = 'Chain ID ' + value;
  } else {
    span.textContent = value == null ? '—' : String(value);
  }
  span.className = 'data-cell-chain';
  return span;
}

export function uri(value) {
  if (!value) { const s = document.createElement('span'); s.textContent = '—'; return s; }
  const a = document.createElement('a');
  let href = String(value);
  if (href.startsWith('ipfs://')) href = 'https://ipfs.io/ipfs/' + href.slice('ipfs://'.length);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = shorten(value, 12, 12);
  a.title = String(value);
  a.className = 'data-cell-uri';
  return a;
}

export function json(value) {
  const wrap = document.createElement('details');
  wrap.className = 'data-cell-json';
  const summary = document.createElement('summary');
  if (value == null) { summary.textContent = '—'; wrap.appendChild(summary); return wrap; }
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch (e) { /* leave as string */ }
  }
  const preview = typeof parsed === 'object'
    ? JSON.stringify(parsed).slice(0, 40) + (JSON.stringify(parsed).length > 40 ? '…' : '')
    : String(parsed).slice(0, 40);
  summary.textContent = preview;
  wrap.appendChild(summary);
  const pre = document.createElement('pre');
  pre.textContent = typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : String(parsed);
  wrap.appendChild(pre);
  return wrap;
}

export function svg(value) {
  if (!value) { const s = document.createElement('span'); s.textContent = '—'; return s; }
  const wrap = document.createElement('div');
  wrap.className = 'data-cell-svg';
  // Sanitize: only render if it starts with <svg
  const trimmed = String(value).trim();
  if (trimmed.toLowerCase().startsWith('<svg')) {
    wrap.innerHTML = trimmed;
  } else {
    wrap.textContent = shorten(value, 20, 8);
  }
  return wrap;
}

// Permissions are an array of permission IDs. Render compactly.
export function permissionList(value) {
  const span = document.createElement('span');
  if (!Array.isArray(value) || value.length === 0) { span.textContent = '—'; return span; }
  span.textContent = '[' + value.join(', ') + ']';
  span.title = value.length + ' permission(s)';
  return span;
}

// Generic dispatch — used by data-tab when rendering a column.
export const FORMATTERS = {
  text, number, address, txHash, timestamp, amount, volumeUsd,
  bigint, bool, chainName, uri, json, svg, permissionList,
};
