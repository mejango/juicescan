import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkJbDraft } from '../src/jb-draft-format.js';

// The SDK's own cases, copied by build/port-jb-draft-format.mjs. The port reads and refuses
// exactly what the SDK does, so a file means the same thing on every site.
describe('the ported .jb draft format', () => {
  const vectors = JSON.parse(readFileSync('test/fixtures/jb-draft-vectors.json', 'utf8'));
  it.each(vectors)('$name', (vector) => {
    let result;
    try { result = { reads: checkJbDraft(structuredClone(vector.file)) }; }
    catch (error) { result = { refuses: error.message }; }
    expect({ name: vector.name, file: vector.file, ...result }).toEqual(vector);
  });
});
