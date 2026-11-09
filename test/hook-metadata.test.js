// The lean hook metadata helpers must answer exactly as nana-sdk-core 3.4.1 did, input for input.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeAbiParameters } from 'viem';
import { getAddress } from '../src/abi-registry.js';
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

  it('reads a Defifa pay payload keyed to either Defifa 721 generation, and not one keyed to the 1155 hook', () => {
    const payload = encodeAbiParameters([{ type: 'address' }, { type: 'uint16[]' }], ['0x1111111111111111111111111111111111111111', [1, 2]]);
    const title = (name) => describeJBHookMetadata('pay', createHookMetadata([hookMetadataId(getAddress(name, 8453), 'pay')], [payload]))[0].title;
    expect(title('DefifaHook')).toBe('Defifa mint instructions');
    expect(title('DefifaHook_deprecated')).toBe('Defifa mint instructions');
    expect(title('Defifa1155Hook')).not.toBe('Defifa mint instructions');
  });
});
