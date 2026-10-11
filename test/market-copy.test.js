import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('keeps visible market copy free of middots while preserving protocol math comments', () => {
  for (const file of ['discover.js', 'entries-view.js', 'nft-inventory.js', 'pending-payments-ui.js', 'learn-build.js']) {
    const source = readFileSync('src/' + file, 'utf8');
    expect(source.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n')).not.toContain('·');
  }
});
it('omits the redundant Terms explained glossary link from the project header', () => {
  const source = readFileSync('src/discover.js', 'utf8');
  const header = source.slice(source.indexOf('function renderDetailHeader(project)'), source.indexOf('\nfunction ', source.indexOf('function renderDetailHeader(project)') + 1));
  expect(header).not.toContain('Terms explained');
  expect(header).not.toContain('learn-glossary');
});
