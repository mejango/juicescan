import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAbi, encodeFunctionData } from 'viem';
import { runSavedActionPlan, discardUnsubmittedActionPlan, hasSavedActionPlan } from '../src/action-plan.js';
import { offerRefusedActionDiscard } from '../src/discover.js';
import { makeStatusSetter } from '../src/component-base.js';
import { relayrPendingRecordExists } from '../src/relayr.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const TARGET = '0x2222222222222222222222222222222222222222';
const ABI = parseAbi(['function claimTokensFor(address holder, uint256 projectId, uint256 tokenCount, address beneficiary)']);
const SCOPE = 'action:8453:11:add-shop-items';
const KEY = 'jb-selected-action-v1:' + ACCOUNT + ':' + SCOPE;
const PREFIX_RELAYR = 'jb-relayr-pending-v1:';
function call(chainId) {
  const args = [ACCOUNT, BigInt(chainId), 1n, ACCOUNT];
  return { chainId, to: TARGET, abi: ABI, functionName: 'claimTokensFor', args, data: encodeFunctionData({ abi: ABI, functionName: 'claimTokensFor', args }) };
}
async function savedRefusedPlan(executeRound) {
  await expect(runSavedActionPlan({ scope: SCOPE, account: ACCOUNT,
    prepare: async () => ({ rounds: [[call(8453), call(10)]] }),
    executeRound: executeRound || (async () => { throw new Error('A selected shop changed.'); }) })).rejects.toThrow();
  return JSON.parse(localStorage.getItem(KEY));
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
});

describe('discarding a refused saved action', () => {
  it('drops a plan that never reached a wallet, Safe or Relayr', async () => {
    const plan = await savedRefusedPlan();
    const journalsClear = vi.fn(async () => true);
    await expect(discardUnsubmittedActionPlan(SCOPE, ACCOUNT, plan.id, journalsClear)).resolves.toBe(true);
    expect(journalsClear).toHaveBeenCalledWith(expect.objectContaining({ id: plan.id }));
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(false);
  });

  it('keeps a plan whose round journals show a possible submission', async () => {
    const plan = await savedRefusedPlan();
    await expect(discardUnsubmittedActionPlan(SCOPE, ACCOUNT, plan.id, async () => false)).resolves.toBe(false);
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
  });

  it('keeps a plan with Safe progress or a checkpointed round', async () => {
    const plan = await savedRefusedPlan(async (_calls, _index, _plan, control) => {
      control.beforeSafe({ chainId: 8453 });
      throw new Error('A selected shop changed.');
    });
    await expect(discardUnsubmittedActionPlan(SCOPE, ACCOUNT, plan.id, async () => true)).resolves.toBe(false);
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
  });

  it('keeps a different plan saved under the same scope', async () => {
    await savedRefusedPlan();
    await expect(discardUnsubmittedActionPlan(SCOPE, ACCOUNT, 'another-plan', async () => true)).resolves.toBe(false);
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
  });
});

describe('the refused-state Discard control', () => {
  function statusInModal() {
    const box = document.createElement('div');
    const status = document.createElement('div');
    box.appendChild(status);
    return { box, setStatus: makeStatusSetter(status) };
  }

  it('shows one inline Discard beside the refusal and reports the result', async () => {
    const { box, setStatus } = statusInModal();
    const discard = vi.fn(async () => true);
    offerRefusedActionDiscard(setStatus, discard);
    offerRefusedActionDiscard(setStatus, discard);
    setStatus('A selected shop changed.', 'error');
    const buttons = box.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Discard');
    buttons[0].click();
    await vi.waitFor(() => expect(box.querySelector('button')).toBeNull());
    expect(discard).toHaveBeenCalledTimes(1);
    expect(setStatus.element.textContent).toMatch(/Discarded the saved action/);
  });

  it('keeps the action when it cannot be proven unsent', async () => {
    const { box, setStatus } = statusInModal();
    offerRefusedActionDiscard(setStatus, async () => false);
    box.querySelector('button').click();
    await vi.waitFor(() => expect(box.querySelector('button')).toBeNull());
    expect(setStatus.element.textContent).toMatch(/may have been sent/);
  });
});

describe('Relayr evidence for a discard', () => {
  it('reads the captured account’s record without repairing it, and counts an unreadable one', () => {
    const scope = SCOPE + ':plan:round:0';
    const key = PREFIX_RELAYR + ACCOUNT + ':' + scope;
    expect(relayrPendingRecordExists(scope, ACCOUNT)).toBe(false);
    localStorage.setItem(key, '{not json');
    expect(relayrPendingRecordExists(scope, ACCOUNT)).toBe(true);
    expect(localStorage.getItem(key)).toBe('{not json');
    expect(relayrPendingRecordExists(scope, '0x3333333333333333333333333333333333333333')).toBe(false);
    localStorage.clear();
    localStorage.setItem(PREFIX_RELAYR + scope, '{}');
    expect(relayrPendingRecordExists(scope, ACCOUNT)).toBe(true);
  });
});
