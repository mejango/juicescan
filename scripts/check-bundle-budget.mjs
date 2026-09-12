import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const budgets = {
  // Verified ENS-handle routing, the resumable two-transaction editor, indexer-independent authority lookup,
  // strict Safe/queue lifecycle checks, and authenticated Relayr payments add to the monolithic bundle
  // (3fcb1da: 1,209,174 B; handle review: 1,226,879 B; queue-bound handle verifier: 1,239,966 B;
  // persisted exact Relayr/Safe completion proof: 8,667,995 B raw / 1,246,408 B gzip;
  // EIP-7702 authority support + exact pending-Safe-call reuse: 8,684,397 B raw / 1,249,797 B gzip;
  // complete Permissions card — owner row, wildcard-scope grants, per-chain sets: 8,695,219 B raw;
  // amounts-first LP sizing — range solver + mode toggle in the add-liquidity modal: 8,700,528 B raw;
  // later-ruleset start control (N cycles / date) + JBDeadline launch-queue gate: 8,761,482 B raw / 1,266,105 B gzip;
  // queue-editor follow-on rulesets + JB Center read-RPC fallback: 8,564 KB raw / 1,268,292 B gzip;
  // Pay-style stepped confirm for every write — step lists, showNext sessions, friendly rows: 8,799,344 B raw / 1,275,448 B gzip;
  // Relayr funding choice, exact final simulation, and durable sequential recovery: 8,854,367 B raw / 1,290,323 B gzip.
  // Local metadata preservation and destination-safe setters: 8,880,480 B raw / 1,294,346 B gzip (+26,113 / +4,023).
  // Same-dependency/env HEAD checkout: 8,837,216 B raw / 1,280,195 B gzip; total feature delta +43,264 B raw / +14,151 B gzip).
  // Six operational groups + frozen rounds, cross-action nonce guards, and exact external Safe reconciliation:
  // 9,000,252 B raw / 1,322,865 B gzip (+119,772 / +28,519 versus the previous setters build).
  // Total delta versus same-dependency/env HEAD: +163,036 B raw / +42,670 B gzip.
  // Testnet Relayr, same-family funding, and preservation of prior direct journals:
  // 9,004,301 B raw / 1,323,697 B gzip (+4,049 / +832 versus the six-group build).
  // Safe operator batch — per-chain tray, MultiSend codec, operation-1 proposal, preset resolver, batch dialog:
  // 9,055,913 B raw / 1,335,883 B gzip (+51,612 / +12,186 versus the testnet Relayr build); style.css 245,639 B raw.
  // Add-liquidity through the Safe App as one batch: 9,062,911 B raw / 1,337,326 B gzip (+6,998 / +1,443).
  // Learn/Build links, corrected economics and readable prompt: 9,064,085 B raw / 1,340,210 B gzip.
  // Script-free guides are separate, optional page downloads, not added to the app's initial response.
  // Executed testnet gateway/feed, retired router/hook ABI + source history, and exact chain ABI variants:
  // 9,805,853 B raw / 1,421,394 B gzip (+741,768 / +81,184 versus Learn/Build).
  // Executed mainnets restore canonical buyback-hook source and preserve retired mainnet identities:
  // 9,915,280 B raw / 1,457,456 B gzip (+107,306 / +35,494 versus the completed testnet rollout).
  // Pending-payment forms, canonical commitment/receipt verification, and durable direct/Safe retries:
  // 9,950,161 B raw / 1,464,061 B gzip (+34,881 / +6,605 versus the production rollout above).
  // Live fee-buyback execution receipts and wait/ready review controls:
  // 9,963,295 B raw / 1,468,745 B gzip (+13,134 / +4,684 versus the pending-payment build).
  'dist/app.js': { raw: 9_967_000, gzip: 1_470_000 },
  'dist/style.css': { raw: 247_000, gzip: 50_000 },
  'dist/learn.html': { raw: 42_000, gzip: 12_200 },
  'dist/build.html': { raw: 53_000, gzip: 14_200 },
  'dist/index.html': { raw: 20_000, gzip: 5_000 },
  'dist/pdf.min.mjs': { raw: 470_000, gzip: 140_000 },
  'dist/pdf.worker.min.mjs': { raw: 1_350_000, gzip: 400_000 },
  'dist/jblogo.gif': { raw: 220_000, gzip: 205_000 },
};

const failures = [];
for (const [file, budget] of Object.entries(budgets)) {
  const raw = (await stat(file)).size;
  const gzip = gzipSync(await readFile(file), { level: 9 }).byteLength;
  console.log(`${file}: ${raw.toLocaleString()} B raw, ${gzip.toLocaleString()} B gzip`);
  if (raw > budget.raw) failures.push(`${file} raw ${raw} > ${budget.raw}`);
  if (gzip > budget.gzip) failures.push(`${file} gzip ${gzip} > ${budget.gzip}`);
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return nested.flat();
}

const distributionFiles = await filesBelow('dist');
const totalGzip = (await Promise.all(distributionFiles.map(async file =>
  gzipSync(await readFile(file), { level: 9 }).byteLength
))).reduce((sum, size) => sum + size, 0);
// Live fee-buyback reviews: measured 2,238,685 B gzip.
const totalGzipBudget = 2_241_000;
if (totalGzip > totalGzipBudget) failures.push(`total distribution gzip ${totalGzip} > ${totalGzipBudget}`);
if (failures.length) {
  console.error(`Bundle budget exceeded:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Total distribution: ${totalGzip.toLocaleString()} B gzip (budget ${totalGzipBudget.toLocaleString()} B).`);
