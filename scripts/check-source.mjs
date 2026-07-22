import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['build', 'scripts', 'src', 'test'];
const extensions = new Set(['.js', '.mjs']);
const ignored = new Set(['node_modules', 'coverage', 'dist', 'playwright-report', 'test-results']);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = (await Promise.all(roots.map(sourceFiles))).flat().sort();
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}\n${result.stderr || result.stdout}`);
}

if (failures.length) {
  console.error(`JavaScript syntax check failed in ${failures.length} file(s):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
