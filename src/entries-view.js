// Optional, read-only native entry history. The Metalog domain owns verification and charts.
import { fetchEntriesPage } from './entries-data.js';
function node(tag, text, className) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; }
function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = node('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function svgNode(tag, attributes) { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attributes)) n.setAttribute(key, String(value)); return n; }
function chartView(chart, manual) {
  const wrap = node('figure', null, 'native-entry-chart');
  wrap.appendChild(node('figcaption', manual ? 'Actual entries | reference curve' : 'Verified curve | actual entries'));
  const svg = svgNode('svg', { viewBox: '0 0 640 220', role: 'img', 'aria-label': manual ? 'Reference density and actual NFT quantities by range' : 'Verified curve density and actual NFT quantities by range' });
  const left = 42, right = 624, top = 12, bottom = 184;
  const peak = (Math.max(chart.peak, ...chart.positions.map(p => p.density || 0)) || 1);
  const x = value => left + (value - chart.low) / (chart.high - chart.low) * (right - left);
  const y = value => bottom - value / peak * (bottom - top);
  for (const position of chart.positions) {
    if (position.density == null) continue;
    const lower = Math.max(chart.low, position.range.lower == null ? chart.low : position.range.lower);
    const upper = Math.min(chart.high, position.range.upper == null ? chart.high : position.range.upper);
    if (upper <= lower) continue;
    const rect = svgNode('rect', { x: x(lower), y: y(position.density), width: Math.max(0, x(upper) - x(lower) - 1), height: bottom - y(position.density), fill: 'var(--c-teal)', opacity: 0.28 });
    rect.appendChild(svgNode('title', {})); rect.firstChild.textContent = position.range.label + ': ' + position.quantity + ' NFTs'; svg.appendChild(rect);
  }
  const path = chart.buckets.map((b, i) => (i ? 'L' : 'M') + x((b.lower + b.upper) / 2) + ',' + y(b.density)).join(' ');
  svg.appendChild(svgNode('path', { d: path, fill: 'none', stroke: 'var(--c-black)', 'stroke-width': 2 }));
  svg.appendChild(svgNode('path', { d: 'M' + left + ',' + top + 'V' + bottom + 'H' + right, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }));
  for (const value of [chart.low, (chart.low + chart.high) / 2, chart.high]) {
    const text = svgNode('text', { x: x(value), y: 204, 'text-anchor': value === chart.low ? 'start' : value === chart.high ? 'end' : 'middle', 'font-size': 12 });
    text.textContent = Number(value.toPrecision(4)) + '%'; svg.appendChild(text);
  }
  wrap.appendChild(svg);
  wrap.appendChild(node('p', 'Line: density. Bars: actual allocation density. Outer overflow ranges are listed below; this preview covers ' + chart.low + '% to ' + chart.high + '%.'));
  return wrap;
}
function entryView(entry, page, context, options) {
  const card = node('article', null, 'native-entry-card');
  const label = { 'verified-curve': 'Verified curve', 'verified-manual': 'Verified manual allocation', unrecognized: 'Unrecognized entry', unsupported: 'Unsupported entry', invalid: 'Invalid entry' }[entry.status];
  card.appendChild(node('h3', label));
  card.appendChild(node('p', new Date(entry.timestamp * 1000).toISOString() + ' | block ' + entry.blockNumber));
  card.appendChild(node('p', 'Account: ' + entry.account));
  card.appendChild(node('p', entry.beneficiary ? 'Beneficiary: ' + entry.beneficiary : 'Multiple recipients'));
  card.appendChild(node('p', entry.stakeWei == null ? 'Stake unavailable' : 'Stake: ' + (options.stakeText ? options.stakeText(entry.stakeWei) : entry.stakeWei + ' wei')));
  const receipt = node('a', 'Receipt'); receipt.href = options.receiptUrl(entry.transactionHash); receipt.target = '_blank'; receipt.rel = 'noopener noreferrer'; card.appendChild(receipt);
  if (entry.reason) card.appendChild(node('p', entry.reason));
  if (entry.chart) card.appendChild(chartView(entry.chart, entry.status === 'verified-manual'));
  else if (entry.chartError) card.appendChild(node('p', 'Chart unavailable: ' + entry.chartError));
  const table = node('table', null, 'native-nft-inventory');
  const caption = node('caption', 'NFT quantities at entry'); table.appendChild(caption);
  const head = node('thead'), header = node('tr');
  for (const value of ['Tier', 'Range', 'NFTs', 'Share']) { const cell = node('th', value); cell.scope = 'col'; header.appendChild(cell); } head.appendChild(header); table.appendChild(head);
  const body = node('tbody');
  page.ranges.forEach((range, index) => { const row = node('tr'); const position = entry.chart?.positions[index]; for (const value of [range.tierId, range.label, entry.quantities[index] == null ? '—' : entry.quantities[index], position ? (position.share * 100).toFixed(2) + '%' : '—']) row.appendChild(node('td', value)); body.appendChild(row); });
  table.appendChild(body); card.appendChild(table);
  const details = node('details'), summary = node('summary', 'Token IDs and coefficients'); details.appendChild(summary);
  details.appendChild(node('p', 'Token IDs: ' + (entry.tokenIds.length ? entry.tokenIds.join(', ') : 'Unavailable')));
  details.appendChild(node('p', 'Coefficients: ' + (entry.coefficients == null ? 'Unavailable' : JSON.stringify(entry.coefficients)))); card.appendChild(details);
  const save = node('button', 'Download entry JSON'); save.type = 'button'; save.addEventListener('click', () => download({ schema: page.schema, chainId: page.chainId, projectId: page.projectId, blockNumber: page.blockNumber, snapshotBlockHash: page.snapshotBlockHash, hook: page.hook, ranges: page.ranges, entry }, 'metalog-entry-' + context.chainId + '-' + context.projectId + '-' + entry.transactionHash + '.json')); card.appendChild(save);
  return card;
}
export function renderEntries(context, options) {
  const wrap = node('section', null, 'native-entries');
  wrap.appendChild(node('h3', 'Entries'));
  wrap.appendChild(node('p', 'Historical entries verified against transaction receipts. These are entry allocations, not current NFT ownership or trading activity.'));
  const status = node('p', 'Loading entries…'); status.setAttribute('role', 'status'); wrap.appendChild(status);
  const list = node('div'); wrap.appendChild(list);
  const controls = node('div', null, 'native-entries-controls'); wrap.appendChild(controls);
  const more = node('button', 'Load earlier entries'); more.type = 'button'; more.hidden = true; controls.appendChild(more);
  const retry = node('button', 'Retry'); retry.type = 'button'; retry.hidden = true; controls.appendChild(retry);
  const restart = node('button', 'Restart history'); restart.type = 'button'; restart.hidden = true; controls.appendChild(restart);
  const save = node('button', 'Download scanned history JSON'); save.type = 'button'; save.hidden = true; controls.appendChild(save);
  const pages = [], seen = new Set(); let cursor, blockNumber, busy = false;
  async function load() {
    if (busy) return; busy = true; let restartRequired = false; more.disabled = true; retry.hidden = true; restart.hidden = true; status.textContent = 'Loading entries…';
    try {
      const page = await fetchEntriesPage(context, { cursor, blockNumber });
      if (!wrap.isConnected) return;
      if (page.nextCursor != null && seen.has(page.nextCursor)) throw new Error('Entry history repeated a continuation cursor.');
      if (pages.length && (page.snapshotBlockHash !== pages[0].snapshotBlockHash || JSON.stringify(page.ranges) !== JSON.stringify(pages[0].ranges))) { restartRequired = true; throw new Error('Entry history snapshot changed. Restart history to read a new snapshot.'); }
      if (page.nextCursor != null) seen.add(page.nextCursor);
      pages.push(page); blockNumber = page.blockNumber; cursor = page.nextCursor;
      page.entries.forEach(entry => list.appendChild(entryView(entry, page, context, options)));
      status.textContent = 'Snapshot block ' + page.blockNumber + '. Scanned ' + (page.scannedFromBlock == null ? 'unavailable' : page.scannedFromBlock + '–' + page.scannedToBlock) + '. ' + (page.complete ? 'History scan complete.' : 'History is incomplete; load earlier entries to continue.') + (page.entries.length ? '' : ' No entries found in this scanned window.');
      more.hidden = cursor == null; save.hidden = false;
    } catch (error) { status.textContent = 'Entries unavailable: ' + error.message; retry.hidden = restartRequired; restart.hidden = !restartRequired; }
    finally { busy = false; more.disabled = false; }
  }
  more.addEventListener('click', load); retry.addEventListener('click', load);
  restart.addEventListener('click', () => { if (busy) return; pages.length = 0; seen.clear(); list.replaceChildren(); cursor = undefined; blockNumber = undefined; more.hidden = true; save.hidden = true; load(); });
  save.addEventListener('click', () => download({ schema: 'metalog.entries.history.v1', chainId: context.chainId, projectId: String(context.projectId), complete: pages.at(-1)?.complete || false, pages }, 'metalog-entries-' + context.chainId + '-' + context.projectId + '.json'));
  // The caller appends this pane synchronously. No network work until the Entries view is selected.
  queueMicrotask(load);
  return wrap;
}
