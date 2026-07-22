import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'src');
const manifestPath = join(root, 'test', 'transaction-sites.json');
const coveragePath = join(root, 'test', 'TX_COVERAGE.md');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== 1) {
  throw new Error(`Unsupported transaction inventory version: ${manifest.version}`);
}

// These patterns deliberately include the central helper definitions as well
// as their callers. Moving, adding, or bypassing any wallet-facing boundary is
// therefore an explicit review event even when the new code happens to reuse a
// familiar function name.
const patterns = {
  executeTransaction: /\bexecuteTransaction\s*\(/g,
  relayrPostBundle: /\brelayrPostBundle\s*\(/g,
  relayrPay: /\brelayrPay\s*\(/g,
  proposeSafeTx: /\bproposeSafeTx\s*\(/g,
  proposeSafeTransactions: /\bproposeSafeTransactions\s*\(/g,
  confirmSafeTx: /\bconfirmSafeTx\s*\(/g,
  executeSafeTx: /\bexecuteSafeTx\s*\(/g,
  approveSafeHashOnChain: /\bapproveSafeHashOnChain\s*\(/g,
  writeContract: /\.writeContract\s*\(/g,
  writeContracts: /\.writeContracts\s*\(/g,
  sendTransaction: /\.sendTransaction\s*\(/g,
  sendTransactions: /\.sendTransactions\s*\(/g,
  sendRawTransaction: /\.sendRawTransaction\s*\(/g,
  sendCalls: /\.sendCalls\s*\(/g,
  signTypedData: /\.signTypedData\s*\(/g,
  signMessage: /\.signMessage\s*\(/g,
  signTransaction: /\.signTransaction\s*\(/g,
  providerRequest: /\.request\s*\(/g,
  rpcSendMethod: /['"]eth_send(?:Raw)?Transaction['"]/g,
};

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return extname(entry.name) === '.js' ? [path] : [];
  });
}

function repositoryPath(path) {
  return relative(root, path).split(sep).join('/');
}

const observed = {};
for (const path of sourceFiles(sourceRoot)) {
  const source = readFileSync(path, 'utf8');
  const counts = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    const count = source.match(pattern)?.length ?? 0;
    if (count) counts[name] = count;
  }
  if (Object.keys(counts).length) observed[repositoryPath(path)] = counts;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)]),
  );
}

const expectedCounts = Object.fromEntries(
  Object.entries(manifest.sites).map(([file, entry]) => [file, entry.counts]),
);
const failures = [];
if (JSON.stringify(stable(expectedCounts)) !== JSON.stringify(stable(observed))) {
  failures.push(
    `Wallet-facing call sites changed.\nExpected: ${JSON.stringify(stable(expectedCounts), null, 2)}\nObserved: ${JSON.stringify(stable(observed), null, 2)}`,
  );
}

const coverage = readFileSync(coveragePath, 'utf8');
for (const [file, entry] of Object.entries(manifest.sites)) {
  if (!Array.isArray(entry.actions) || entry.actions.length === 0) {
    failures.push(`${file} has no transaction-coverage action assigned.`);
    continue;
  }
  for (const action of entry.actions) {
    if (!coverage.includes(`| ${action} |`)) {
      failures.push(`${file} references missing TX_COVERAGE action: ${action}`);
    }
  }
}

if (failures.length) {
  console.error(
    'Transaction inventory check failed. Review every changed wallet boundary, then update test/transaction-sites.json and test/TX_COVERAGE.md together.\n',
  );
  for (const failure of failures) console.error(`${failure}\n`);
  process.exit(1);
}

const total = Object.values(observed).reduce(
  (sum, counts) => sum + Object.values(counts).reduce((inner, count) => inner + count, 0),
  0,
);
console.log(
  `Transaction inventory verified: ${total} wallet-boundary occurrences across ${Object.keys(observed).length} production modules.`,
);
