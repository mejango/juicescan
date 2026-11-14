// @vitest-environment jsdom
// The held-writes list reads every hold this browser keeps for an account, whichever form opened it.
import { describe, it, expect, beforeEach } from 'vitest';
import { writeHold, heldWritesOf } from '../src/write-hold.js';

const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const TERMINAL = '0x3333333333333333333333333333333333333333';

describe('heldWritesOf', () => {
  beforeEach(() => localStorage.clear());

  it('lists only this account’s holds, with what each was opened with', () => {
    writeHold(8453, ALICE, { to: TERMINAL, functionName: 'pay' }).reserve();
    writeHold(1, ALICE, { to: 'project-7', functionName: 'liquidity mint' }).reserve();
    writeHold(1, BOB, { to: TERMINAL, functionName: 'pay' }).reserve();
    localStorage.setItem('unrelated', 'x');
    expect(heldWritesOf(ALICE.toUpperCase().replace('0X', '0x')).sort((a, b) => a.chainId - b.chainId)).toEqual([
      { chainId: 1, to: 'project-7', functionName: 'liquidity mint' },
      { chainId: 8453, to: TERMINAL, functionName: 'pay' },
    ]);
    // Reopened from the listing, each is the same hold.
    const [first] = heldWritesOf(ALICE);
    expect(writeHold(first.chainId, ALICE, first).read()).toBeTruthy();
  });

  it('is empty when nothing is held', () => {
    expect(heldWritesOf(ALICE)).toEqual([]);
  });
});
