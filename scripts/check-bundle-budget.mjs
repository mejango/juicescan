import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Startup is what the browser fetches before the app runs: index.html, its stylesheet, the module entry
// and every chunk the entry reaches through static imports. Lazy chunks (import()) count only in the total.
// Monolithic IIFE baseline (bd900bb): app.js 10,649,557 B raw / 1,545,664 B gzip, startup 1,597,189 B gzip.
const startupBudget = { raw: 10_650_000, gzip: 1_598_000 };

const budgets = {
  'dist/style.css': { raw: 248_000, gzip: 50_000 },
  'dist/learn.html': { raw: 42_000, gzip: 12_200 },
  'dist/build.html': { raw: 53_000, gzip: 14_200 },
  'dist/index.html': { raw: 20_000, gzip: 5_000 },
  'dist/pdf.min.mjs': { raw: 470_000, gzip: 140_000 },
  'dist/pdf.worker.min.mjs': { raw: 1_350_000, gzip: 400_000 },
  'dist/jblogo.gif': { raw: 220_000, gzip: 205_000 },
};

const failures = [];
const gzipOf = async file => gzipSync(await readFile(file), { level: 9 }).byteLength;
for (const [file, budget] of Object.entries(budgets)) {
  const raw = (await stat(file)).size;
  const gzip = await gzipOf(file);
  console.log(`${file}: ${raw.toLocaleString()} B raw, ${gzip.toLocaleString()} B gzip`);
  if (raw > budget.raw) failures.push(`${file} raw ${raw} > ${budget.raw}`);
  if (gzip > budget.gzip) failures.push(`${file} gzip ${gzip} > ${budget.gzip}`);
}

// esbuild hoists every static import to the top of a module, so reading the leading import statements
// gives a module's static dependencies exactly.
function leadingImports(code) {
  const specifiers = [];
  const statement = /^\s*import\s*(?:[^;"']*?from\s*)?["']([^"']+)["'];?/;
  let rest = code;
  for (let match = statement.exec(rest); match; match = statement.exec(rest)) {
    specifiers.push(match[1]);
    rest = rest.slice(match[0].length);
  }
  return specifiers;
}

const html = await readFile('dist/index.html', 'utf8');
const attribute = (pattern) => [...html.matchAll(pattern)].map(match => join('dist', match[1].split('?')[0]));
const entries = attribute(/<script[^>]*type="module"[^>]*src="([^"]+)"/g);
const preloads = attribute(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g);
const stylesheets = attribute(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g);
if (entries.length !== 1) failures.push(`index.html must load exactly one module entry, found ${entries.length}`);
if (entries.some(file => !/^dist\/app-[A-Z0-9]+\.js$/.test(file))) failures.push(`index.html must load the app entry (dist/app-<hash>.js), found ${entries.join(', ')}`);
if (/<script(?![^>]*type="module")[^>]*src=/.test(html)) failures.push('index.html loads a classic script; the app ships as one ESM entry');

const closure = [];
async function walk(file) {
  if (closure.includes(file)) return;
  closure.push(file);
  for (const specifier of leadingImports(await readFile(file, 'utf8'))) {
    if (!specifier.startsWith('.')) failures.push(`${file} statically imports a non-relative module ${specifier}`);
    else await walk(join(dirname(file), specifier));
  }
}
for (const entry of entries) await walk(entry);
const unpreloaded = closure.slice(1).filter(file => !preloads.includes(file));
const unneeded = preloads.filter(file => !closure.includes(file));
if (unpreloaded.length) failures.push(`startup chunks without modulepreload: ${unpreloaded.join(', ')}`);
if (unneeded.length) failures.push(`modulepreload of chunks the entry does not import: ${unneeded.join(', ')}`);

const startupFiles = ['dist/index.html', ...stylesheets, ...closure];
let startupRaw = 0;
let startupGzip = 0;
for (const file of startupFiles) {
  startupRaw += (await stat(file)).size;
  startupGzip += await gzipOf(file);
}
console.log(`Startup (${startupFiles.length} files, ${closure.length} JS modules): ${startupRaw.toLocaleString()} B raw, ${startupGzip.toLocaleString()} B gzip (budget ${startupBudget.gzip.toLocaleString()} B).`);
if (startupRaw > startupBudget.raw) failures.push(`startup raw ${startupRaw} > ${startupBudget.raw}`);
if (startupGzip > startupBudget.gzip) failures.push(`startup gzip ${startupGzip} > ${startupBudget.gzip}`);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return nested.flat();
}

const distributionFiles = await filesBelow('dist');
const totalGzip = (await Promise.all(distributionFiles.map(gzipOf))).reduce((sum, size) => sum + size, 0);
// Live fee-buyback reviews: measured 2,238,685 B gzip.
// Revnet transfer copy + project 7 fixed TWAP window in the batch preset: measured 2,241,951 B gzip.
// Pinned Node 22.23.1 duration release: 2,244,789 B gzip; shared endpoints + official testnet origin:
// 2,244,915 B gzip (+126 B), app.js 9,983,374 B raw / 1,472,846 B gzip. Round total limit to the next 1 KB.
// SDK/native inventory measured total: 2,278,700 B gzip.
// Verification feedback measured total: 2,280,560 B gzip; round to the next 1 KB.
// Official SDK2.29/native actions measured total2,309,541 B gzip, +28,981 B versus the same-env baseline.
// Shared checkout measured2,312,787 B gzip, +3,317 B versus222c5f same-env distribution.
// SDK3.0.0 with the direct buy route removed: 2,313,459 B gzip.
const totalGzipBudget = 2_314_000;
if (totalGzip > totalGzipBudget) failures.push(`total distribution gzip ${totalGzip} > ${totalGzipBudget}`);
if (failures.length) {
  console.error(`Bundle budget exceeded:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Total distribution: ${totalGzip.toLocaleString()} B gzip (budget ${totalGzipBudget.toLocaleString()} B).`);
