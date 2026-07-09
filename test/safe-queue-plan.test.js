import { describe, it, expect } from 'vitest';
import { safeQueueExecutionPlan } from '../src/discover.js';

function tx(nonce) {
  return { nonce: String(nonce) };
}

describe('safeQueueExecutionPlan', () => {
  it('allows any ready current-nonce alternative to execute directly', () => {
    const plan = safeQueueExecutionPlan([tx(15), tx(15), tx(16)], [true, true, true]);
    expect(plan.frontNonce).toBe(15);
    expect(plan.directByIndex).toEqual([true, true, false]);
    expect(plan.duplicateNonceByIndex).toEqual([true, true, false]);
    expect(plan.batchByIndex).toEqual([false, false, false]);
  });

  it('batches only contiguous unambiguous ready nonces', () => {
    const plan = safeQueueExecutionPlan([tx(15), tx(16), tx(17)], [true, true, false]);
    expect(plan.directByIndex).toEqual([true, false, false]);
    expect(plan.batchByIndex).toEqual([true, true, false]);
  });

  it('stops the batch before a later same-nonce fork', () => {
    const plan = safeQueueExecutionPlan([tx(15), tx(16), tx(16), tx(17)], [true, true, true, true]);
    expect(plan.directByIndex).toEqual([true, false, false, false]);
    expect(plan.duplicateNonceByIndex).toEqual([false, true, true, false]);
    expect(plan.batchByIndex).toEqual([true, false, false, false]);
  });
});
