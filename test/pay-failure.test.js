// The lean pay-failure decoder must answer exactly as nana-sdk-core 3.4.1 did, input for input.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePayFailure, payRetrySlippageBps, PAY_MAX_SLIPPAGE_BPS } from '../src/pay-failure.js';
import { PAY_DEFAULT_SLIPPAGE_BPS } from '../src/slippage.js';

const revive = (_, v) => (v && typeof v === 'object' && '$bigint' in v ? BigInt(v.$bigint) : v);
const golden = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/sdk-3.4.1/pay-failure.json'), 'utf8'), revive);

describe('pay failure decoding', () => {
  it('matches SDK 3.4.1 golden vectors', () => {
    expect(golden.sdkVersion).toBe('3.4.1');
    expect(golden.cases.length).toBeGreaterThan(500);
    for (const c of golden.cases) {
      const actual = c.fn === 'decodePayFailure'
        ? decodePayFailure(c.undefinedInput ? undefined : c.input)
        : payRetrySlippageBps(c.input.failure, c.input.currentBps);
      expect(actual, c.name).toEqual(c.output);
    }
  });

  it('keeps the SDK slippage constants', () => {
    expect(PAY_MAX_SLIPPAGE_BPS).toBe(golden.constants.PAY_MAX_SLIPPAGE_BPS);
    expect(PAY_DEFAULT_SLIPPAGE_BPS).toBe(golden.constants.PAY_DEFAULT_SLIPPAGE_BPS);
  });

  it('survives a cyclic error chain', () => {
    const error = { message: 'x' };
    error.cause = error;
    expect(decodePayFailure(error)).toBeNull();
  });
});
