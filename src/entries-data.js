// Read-only Metalog evidence. Native identity must come from the SDK, never this API.
const MAX_BYTES = 2 * 1024 * 1024;
const UINT = /^(?:0|[1-9]\d{0,77})$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const STATUSES = ['verified-curve', 'verified-manual', 'unrecognized', 'unsupported', 'invalid'];
function requireValue(ok) { if (!ok) throw new Error('Metalog returned invalid entry evidence.'); }
function object(value) { requireValue(value !== null && typeof value === 'object' && !Array.isArray(value)); }
function uint(value) { requireValue(typeof value === 'string' && UINT.test(value) && BigInt(value) < 2n ** 256n); }
function integer(value, maximum = Number.MAX_SAFE_INTEGER) { requireValue(Number.isSafeInteger(value) && value >= 0 && value <= maximum); }
function finite(value) { requireValue(typeof value === 'number' && Number.isFinite(value)); }
function text(value, maximum) { requireValue(typeof value === 'string' && value.length <= maximum); }
function list(value, maximum) { requireValue(Array.isArray(value) && value.length <= maximum); }
function cursorValue(value) {
  requireValue(typeof value === 'string' && /^\d{1,78}:\d{1,10}$/.test(value));
  const [block, index] = value.split(':');
  // Cursor block syntax is decimal, while public evidence uses canonical decimals.
  requireValue(BigInt(block) < 2n ** 256n); integer(Number(index), 2147483647);
}
function identity(context) {
  object(context); integer(context.chainId); requireValue(context.chainId > 0);
  const project = String(context.projectId); uint(project); requireValue(BigInt(project) > 0n);
  requireValue(ADDRESS.test(context.hook));
  if (context.snapshotBlockHash !== undefined) requireValue(HASH.test(context.snapshotBlockHash));
  return project;
}
function range(value) {
  object(value); integer(value.tierId, 65535); requireValue(value.tierId > 0); text(value.label, 512);
  if (value.lower !== null) finite(value.lower);
  if (value.upper !== null) finite(value.upper);
  requireValue(value.lower === null || value.upper === null || value.lower < value.upper);
}
function sameRange(left, right) {
  return left.tierId === right.tierId && left.label === right.label && left.lower === right.lower && left.upper === right.upper;
}
export function validateEntriesPage(payload, context) {
  const project = identity(context);
  object(payload);
  requireValue(payload.schema === 'metalog.entries.v1');
  requireValue(payload.chainId === context.chainId && payload.projectId === project);
  requireValue(ADDRESS.test(payload.hook) && payload.hook.toLowerCase() === context.hook.toLowerCase());
  uint(payload.blockNumber); requireValue(HASH.test(payload.snapshotBlockHash));
  if (context.snapshotBlockHash !== undefined) requireValue(payload.snapshotBlockHash.toLowerCase() === context.snapshotBlockHash.toLowerCase());
  list(payload.ranges, 61); requireValue(payload.ranges.length >= 3);
  const ids = new Set();
  payload.ranges.forEach((item, index) => {
    range(item); requireValue(!ids.has(item.tierId)); ids.add(item.tierId);
    requireValue((item.lower === null) === (index === 0) && (item.upper === null) === (index === payload.ranges.length - 1));
    if (index) requireValue(item.lower === payload.ranges[index - 1].upper);
  });
  list(payload.entries, 8);
  const hashes = new Set();
  payload.entries.forEach(entry => {
    object(entry); requireValue(STATUSES.includes(entry.status));
    requireValue(HASH.test(entry.transactionHash) && !hashes.has(entry.transactionHash.toLowerCase())); hashes.add(entry.transactionHash.toLowerCase());
    uint(entry.blockNumber); requireValue(BigInt(entry.blockNumber) <= BigInt(payload.blockNumber));
    integer(entry.timestamp, 8640000000000); requireValue(ADDRESS.test(entry.account));
    requireValue(entry.beneficiary === null || ADDRESS.test(entry.beneficiary));
    if (entry.stakeWei !== null) uint(entry.stakeWei);
    list(entry.tokenIds, 2000); entry.tokenIds.forEach(uint); requireValue(new Set(entry.tokenIds).size === entry.tokenIds.length);
    list(entry.quantities, 61); requireValue(entry.quantities.length === payload.ranges.length); entry.quantities.forEach(value => integer(value, 2000));
    requireValue(entry.quantities.reduce((sum, value) => sum + value, 0) === entry.tokenIds.length);
    if (entry.reason !== undefined) text(entry.reason, 1024);
    if (entry.chartError !== undefined) { text(entry.chartError, 1024); requireValue(entry.chartError.length > 0); }
    if (entry.coefficients !== null) {
      list(entry.coefficients, 6); requireValue(entry.coefficients.length >= 2); entry.coefficients.forEach(finite);
    }
    const verified = entry.status === 'verified-curve' || entry.status === 'verified-manual';
    requireValue(verified || (entry.coefficients === null && entry.chart === null));
    if (verified) requireValue(entry.coefficients !== null && entry.stakeWei !== null && entry.beneficiary !== null && entry.tokenIds.length >= 1 && entry.tokenIds.length <= 200 && (entry.chart !== null || entry.chartError !== undefined));
    if (entry.chart !== null) {
      requireValue(verified && entry.coefficients !== null); const chart = entry.chart; object(chart);
      finite(chart.low); finite(chart.high); requireValue(chart.high > chart.low); finite(chart.peak); requireValue(chart.peak >= 0);
      list(chart.buckets, 1024); requireValue(chart.buckets.length >= 2);
      chart.buckets.forEach((bucket, index) => {
        object(bucket); finite(bucket.lower); finite(bucket.upper); finite(bucket.density);
        requireValue(bucket.lower < bucket.upper && bucket.density >= 0 && bucket.density <= chart.peak);
        requireValue(bucket.lower === (index ? chart.buckets[index - 1].upper : chart.low));
        if (index === chart.buckets.length - 1) requireValue(bucket.upper === chart.high);
        if (bucket.mass !== undefined) { finite(bucket.mass); requireValue(bucket.mass >= 0 && bucket.mass <= 1); }
      });
      if (chart.visibleMass !== undefined) { finite(chart.visibleMass); requireValue(chart.visibleMass >= 0 && chart.visibleMass <= 1); }
      list(chart.positions, 61); requireValue(chart.positions.length === payload.ranges.length);
      chart.positions.forEach((position, index) => {
        object(position); range(position.range); requireValue(sameRange(position.range, payload.ranges[index]));
        integer(position.quantity, 2000); requireValue(position.quantity === entry.quantities[index]);
        finite(position.share); requireValue(position.share >= 0 && position.share <= 1);
        if (position.density !== null) { finite(position.density); requireValue(position.density >= 0); }
        requireValue((position.density === null) === (position.range.lower === null || position.range.upper === null));
      });
    }
  });
  requireValue(typeof payload.complete === 'boolean');
  requireValue((payload.scannedFromBlock === null) === (payload.scannedToBlock === null));
  if (payload.scannedFromBlock !== null) {
    uint(payload.scannedFromBlock); uint(payload.scannedToBlock);
    requireValue(BigInt(payload.scannedFromBlock) <= BigInt(payload.scannedToBlock) && BigInt(payload.scannedToBlock) <= BigInt(payload.blockNumber));
  }
  requireValue(payload.complete === (payload.nextCursor === null));
  if (payload.nextCursor !== null) { cursorValue(payload.nextCursor); requireValue(BigInt(payload.nextCursor.split(':')[0]) <= BigInt(payload.blockNumber)); }
  return payload;
}
async function cancelBody(body) {
  try { await body?.cancel(); } catch (_) { /* Discard error bodies without exposing transport diagnostics. */ }
}
async function readJson(response) {
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) > MAX_BYTES) { await cancelBody(response.body); throw new Error('Metalog entry evidence exceeds the size limit.'); }
  if (!/\bapplication\/json\b/i.test(response.headers.get('content-type') || '')) throw new Error('Metalog returned invalid entry evidence.');
  requireValue(response.body && typeof response.body.getReader === 'function');
  const reader = response.body.getReader(), chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Metalog entry evidence exceeds the size limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Metalog returned invalid entry evidence.'); }
}
export async function fetchEntriesPage(context, { cursor, blockNumber, signal } = {}) {
  const project = identity(context);
  const url = new URL(`https://metalog.money/api/markets/${context.chainId}/${project}/entries`);
  if (blockNumber !== undefined) { uint(String(blockNumber)); url.searchParams.set('blockNumber', String(blockNumber)); }
  if (cursor !== undefined) {
    cursorValue(cursor); requireValue(blockNumber !== undefined); url.searchParams.set('cursor', cursor);
  }
  let response;
  try {
    const timeout = AbortSignal.timeout(20000);
    response = await fetch(url, { method: 'GET', credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' }, cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Metalog entry history is unavailable. Try again.');
  }
  if (!response.ok) { await cancelBody(response.body); throw new Error(response.status === 429 ? 'Metalog entry history is busy. Try again later.' : 'Metalog entry history is unavailable. Try again.'); }
  try {
    const payload = validateEntriesPage(await readJson(response), context);
    if (blockNumber !== undefined) requireValue(payload.blockNumber === String(blockNumber));
    return payload;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error.message === 'Metalog entry evidence exceeds the size limit.') throw error;
    throw new Error('Metalog returned invalid entry evidence.');
  }
}
