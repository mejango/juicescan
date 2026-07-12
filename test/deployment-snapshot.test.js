import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { nextGeneratedAt } = require('../build/sync-deployments.js');

describe('deployment snapshot timestamps', () => {
  let originalSourceDateEpoch;

  beforeEach(() => {
    originalSourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
    delete process.env.SOURCE_DATE_EPOCH;
  });

  afterEach(() => {
    if (originalSourceDateEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = originalSourceDateEpoch;
  });

  it('preserves the prior timestamp when deployment inputs are unchanged', () => {
    process.env.SOURCE_DATE_EPOCH = '1700000000';
    const previous = { sourceDigest: 'sha256:same', generatedAt: '2026-01-02T03:04:05.000Z' };

    expect(nextGeneratedAt(previous, 'sha256:same')).toBe(previous.generatedAt);
  });

  it('uses SOURCE_DATE_EPOCH for a changed deterministic snapshot', () => {
    process.env.SOURCE_DATE_EPOCH = '1700000000';

    expect(nextGeneratedAt({ sourceDigest: 'sha256:old' }, 'sha256:new')).toBe('2023-11-14T22:13:20.000Z');
  });

  it.each(['-1', '1.5', 'not-a-number', '9999999999999999'])(
    'rejects invalid SOURCE_DATE_EPOCH value %s',
    (value) => {
      process.env.SOURCE_DATE_EPOCH = value;
      expect(() => nextGeneratedAt({}, 'sha256:new')).toThrow(/non-negative integer seconds/);
    },
  );
});
