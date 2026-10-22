// The lean hook metadata helpers must answer exactly as nana-sdk-core 3.4.1 did, input for input.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHookMetadata, describeJBHookMetadata, hookMetadataId } from '../src/hook-metadata.js';

const golden = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/sdk-3.4.1/hook-metadata.json'), 'utf8'));
const local = {
  hookMetadataId: ({ target, purpose }) => hookMetadataId(target, purpose),
  createHookMetadata: ({ ids, metadatas }) => createHookMetadata(ids, metadatas),
  describeJBHookMetadata: ({ context, value }) => describeJBHookMetadata(context, value),
};

describe('hook metadata', () => {
  it('matches SDK 3.4.1 golden vectors', () => {
    expect(golden.sdkVersion).toBe('3.4.1');
    expect(golden.cases.length).toBeGreaterThan(150);
    for (const c of golden.cases) {
      let actual;
      try { actual = local[c.fn](c.input); } catch (e) { actual = { $error: e.message }; }
      expect(actual, c.name).toEqual(c.output);
    }
  });
});
