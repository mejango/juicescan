// A Safe cannot give the forwarder signatures a launch on several chains needs, and launch does not need the owner
// to send it: the refusal says what to do instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('a Safe launching on several chains', () => {
  it('is refused before anything is pinned, with the way through', () => {
    const source = readFileSync('src/create-flow.js', 'utf8');
    const refusal = source.indexOf('if (state.chainIds.length > 1 && isSafeConnected()) {');
    expect(refusal).toBeGreaterThan(-1);
    expect(source.slice(refusal, refusal + 400)).toContain(
      "text: 'A Safe launches one chain at a time. For several chains, connect a wallet and name the Safe as owner.', err: true }); render(); return;");
    expect(refusal).toBeLessThan(source.indexOf('shopMediaUploadIssue(state);', refusal));
  });
});
