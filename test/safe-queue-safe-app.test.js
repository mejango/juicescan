import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/discover.js'), 'utf8');

// Opened as a Safe App, the connected account is the Safe itself: it cannot sign for itself, and
// executing or paying Relayr from it would take the nonce the queued transaction needs.
describe('Safe queue card opened as a Safe App', () => {
  it('offers no Sign, Execute or Execute all, and points owners to Safe{Wallet}', () => {
    expect(source).toContain('var viaSafeApp = isSafeConnected();');
    expect(source).toContain('if (isSigner && !signed && nconf < need && !viaSafeApp) {');
    expect(source).toContain('if (nconf >= need && !viaSafeApp) {');
    expect(source).toMatch(/if \(isSafeConnected\(\)\) \{\s+var viaSafe = el\('span', 'backoffice-batch-note'\);[\s\S]{0,300}?return;/);
  });
});
