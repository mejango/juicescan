// Version scoping: this is a V6 explorer, so every bendystraw selection that CAN be version-filtered must
// be, and the one entity that can't (wallet — no version field in the schema) must say so honestly in its
// DATA-tab copy instead of presenting lifetime cross-version totals as V6 numbers.
import { describe, it, expect } from 'vitest';
import queriesJson from '../data/bendystraw-queries.json';

describe('wallet-portfolio DATA-tab honesty', () => {
  const query = queriesJson.sections
    .flatMap((section) => section.queries || [])
    .find((entry) => entry.id === 'wallet-portfolio');

  it('labels the un-scopeable wallet entity as spanning all versions', () => {
    expect(query).toBeTruthy();
    expect(query.hint).toMatch(/all .*versions/i);
    const volume = query.columns.find((column) => column.key === 'volume');
    const volumeUsd = query.columns.find((column) => column.key === 'volumeUsd');
    expect(volume.label).toMatch(/all versions/i);
    expect(volumeUsd.label).toMatch(/all versions/i);
  });
});
