import { describe, expect, it, vi } from 'vitest';
import { encodeEventTopics, encodeAbiParameters, encodeFunctionData } from 'viem';
import { orderedRulesetSchedule, deriveStartFrom, assertScheduleFresh, assertOrderedRulesetReceipt } from '../src/ruleset-schedule.js';
import { __test, createStage, buildQueueRulesetConfigs } from '../src/create-flow.js';
import { getAddress } from '../src/component-base.js';
const day = 86400;
const now = 2000000000;
const OWNER = '0x1111111111111111111111111111111111111111';

// The deployed core chooses a pending parent's ancestor when the incoming minimum
// precedes that parent's end. Keep this separate from the client schedule compiler.
function contractQueue(configs, timestamp, notices) {
  const result = [];
  for (let i = 0; i < configs.length; i++) {
    const id = timestamp + i;
    const must = Number(configs[i].mustStartAtOrAfter) || timestamp;
    let parent = result.at(-1);
    if (parent && parent.start > timestamp && must < parent.start + parent.duration) parent = result.find(row => row.id === parent.basedOnId);
    const delay = parent ? notices[parent.index] : 0;
    const start = parent ? deriveStartFrom(parent.start, parent.duration, Math.max(must, parent.start, delay ? id + delay : 0)) : must;
    result.push({ id, basedOnId: parent?.id || 0, start, duration: Number(configs[i].duration), index: i });
  }
  return result;
}
function state(count = 2) {
  const s = __test.initState(); s.projectType = 'custom'; s.chainIds = [1]; s.afterMode = 'terminal'; s.details.owner = OWNER;
  s.stages = Array.from({ length: count }, () => Object.assign(createStage(), { durationSeconds: 3 * day, deadline: '1day' }));
  s._schedulePreparedAt = now;
  return s;
}

describe('explicit sequential ruleset schedules', () => {
  it.each(['wait', 'terminal'])('preserves the intermediate stage and %s after a one-second mining delay', after => {
    const s = state(); s.afterMode = after;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    try {
      const call = __test.buildLaunchArgs(s, 1, OWNER, '', '0x' + '00'.repeat(32), now + 600);
      const configs = call.args[2].rulesetConfigurations;
      const actual = contractQueue(configs, now + 1, [day, day, 0]);
      expect(configs.map(row => Number(row.mustStartAtOrAfter))).toEqual([now + 600, now + 600 + 3 * day, now + 600 + 6 * day]);
      expect(actual[1].basedOnId).toBe(actual[0].id);
      expect(actual[2].basedOnId).toBe(actual[1].id);
      expect(actual.map(row => row.start)).toEqual(configs.map(row => Number(row.mustStartAtOrAfter)));
      expect(call.scheduleValidUntil).toBe(now + 600 + 2 * day - 1);
    } finally { vi.restoreAllMocks(); }
  });
  it('fails with the old zero-start arrays against the independent core fixture', () => {
    const old = [{ duration: 3 * day, mustStartAtOrAfter: now }, { duration: 3 * day, mustStartAtOrAfter: 0 }, { duration: 2 ** 32 - 1, mustStartAtOrAfter: 0 }];
    const actual = contractQueue(old, now, [day, day, 0]);
    expect(actual[2].basedOnId).toBe(actual[0].id);
  });
  it('models a notice longer than the cycle before materializing downstream floors', () => {
    const stages = [{ duration: day, noticeSeconds: 7 * day }, { duration: day, noticeSeconds: day }, { duration: 0, noticeSeconds: 0 }];
    const plan = orderedRulesetSchedule(stages, now + 600, now);
    expect(plan.starts).toEqual([now + 600, now + 600 + 7 * day, now + 600 + 8 * day]);
    expect(contractQueue(plan.starts.map((start, i) => ({ duration: stages[i].duration, mustStartAtOrAfter: start })), plan.validUntil, stages.map(stage => stage.noticeSeconds)).map(row => row.start)).toEqual(plan.starts);
    expect(plan.validUntil).toBe(now + 599);
    expect(() => assertScheduleFresh(plan.validUntil, plan.validUntil)).toThrow(/expired/);
  });
  it('retains a pinned no-hook sequence after arbitrary inclusion delay', () => {
    const stages = [{ duration: day, noticeSeconds: 0 }, { duration: day, noticeSeconds: 0 }, { duration: 0, noticeSeconds: 0 }];
    const plan = orderedRulesetSchedule(stages, now + 600, now);
    expect(plan.validUntil).toBeNull();
    const actual = contractQueue(plan.starts.map((start, i) => ({ duration: stages[i].duration, mustStartAtOrAfter: start })), now + 10 * day, [0, 0, 0]);
    expect(actual.map(row => row.start)).toEqual(plan.starts);
    expect(actual[2].basedOnId).toBe(actual[1].id);
  });
  it('uses live parent start, notice and monotonic latest ID for queue followers', () => {
    const stages = [{ duration: day, noticeSeconds: day }, { duration: 0, noticeSeconds: 0 }];
    const parent = { start: now - 10 * day, duration: 2 * day, noticeSeconds: day, latestId: now + 700 };
    const plan = orderedRulesetSchedule(stages, 0, now, parent);
    expect(plan.starts[0]).toBe(now + 2 * day);
    expect(plan.starts[1]).toBe(now + 3 * day);
    expect(plan.musts).toEqual(plan.starts);
  });
  it('preserves explicit later dates and rejects unprovable custom conditions', () => {
    expect(orderedRulesetSchedule([{ duration: day, noticeSeconds: 0 }, { duration: 0, noticeSeconds: 0, date: now + 10 * day }], now, now).starts[1]).toBe(now + 10 * day);
    expect(() => orderedRulesetSchedule([{ duration: day, noticeSeconds: null }, { duration: 0, noticeSeconds: 0 }], now, now)).toThrow(/known approval/);
  });
  it('uses exact fractional-day Revnet cycles rather than rounding to whole days', () => {
    const s = state(); s.projectType = 'revnet';
    Object.assign(s.stages[0], { issuanceCutOn: true, cutFreqDays: '1.5' });
    Object.assign(s.stages[1], { startDaysAfter: '2', issuanceCutOn: true, cutFreqDays: '0.25' });
    s.stages.push(Object.assign(createStage(), { startDaysAfter: '1' }));
    const call = __test.buildRevnetArgs(s, 1, OWNER, '', '0x' + '00'.repeat(32), now + 600);
    expect(call.args[1].stageConfigurations.map(stage => Number(stage.startsAtOrAfter))).toEqual([now + 600, now + 600 + 3 * day, now + 600 + 4 * day]);
  });
});

const RULESETS = '0x2222222222222222222222222222222222222222';
const initializedEvent = [{ type: 'event', name: 'RulesetInitialized', inputs: [
  { name: 'rulesetId', type: 'uint256', indexed: true }, { name: 'projectId', type: 'uint256', indexed: true },
  { name: 'basedOnId', type: 'uint256', indexed: true }, { name: 'caller', type: 'address', indexed: false },
] }];
function initialized(id, parent, projectId = 9n) {
  return { address: RULESETS, topics: encodeEventTopics({ abi: initializedEvent, eventName: 'RulesetInitialized', args: { rulesetId: BigInt(id), projectId, basedOnId: BigInt(parent) } }), data: encodeAbiParameters([{ type: 'address' }], [OWNER]) };
}
describe('actual receipt ancestry', () => {
  it('accepts each stage based on the actual preceding emitted ID', () => {
    expect(() => assertOrderedRulesetReceipt({ logs: [initialized(1, 0), initialized(2, 1), initialized(3, 2)] }, RULESETS, 9n, 3)).not.toThrow();
  });
  it('refuses skipped stages even when the outer transaction was successful', () => {
    expect(() => assertOrderedRulesetReceipt({ status: 'success', logs: [initialized(1, 0), initialized(2, 1), initialized(3, 1)] }, RULESETS, 9n, 3)).toThrow(/intermediate ruleset was skipped/);
  });
  it('refuses missing or foreign-contract events for a multi-stage call', () => {
    expect(() => assertOrderedRulesetReceipt({ logs: [initialized(1, 0), { ...initialized(2, 1), address: OWNER }] }, RULESETS, 9n, 2)).toThrow(/complete ruleset sequence/);
  });
});

it('preserves replacement rather than appending when its approval window is shorter than preparation', () => {
  const sourceStart = now + day + 300;
  const parent = { start: sourceStart - 3 * day, duration: 3 * day, noticeSeconds: day, latestId: now - 1, validUntil: now + 299 };
  const plan = orderedRulesetSchedule([{ duration: 3 * day, noticeSeconds: day }, { duration: 0, noticeSeconds: 0 }], sourceStart, now, parent);
  expect(plan.musts[0]).toBe(sourceStart);
  expect(plan.validUntil).toBe(now + 299);
  expect(() => assertScheduleFresh(plan.validUntil, now)).not.toThrow();
  expect(() => orderedRulesetSchedule([{ duration: day, noticeSeconds: 0 }, { duration: 0, noticeSeconds: 0 }], sourceStart, now, { ...parent, latestId: now + 400 })).toThrow(/replacement window expired/);
});

it('verifies the first queued parent as well as the follower chain', () => {
  expect(() => assertOrderedRulesetReceipt({ logs: [initialized(10, 4), initialized(11, 10)] }, RULESETS, 9n, 2, 3)).toThrow(/different parent/);
});

it('encodes fractional Revnet day intervals with no cut as whole seconds', () => {
  const s = state(); s.projectType = 'revnet';
  Object.assign(s.stages[0], { issuanceCutOn: false });
  Object.assign(s.stages[1], { startDaysAfter: '1.234567' });
  const call = __test.buildRevnetArgs(s, 1, OWNER, '', '0x' + '00'.repeat(32), now + 600);
  expect(call.args[1].stageConfigurations[1].startsAtOrAfter).toBe(now + 600 + Math.round(1.234567 * day));
  expect(() => encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args })).not.toThrow();
});

it('does not postpone an explicit boundary to accommodate a hypothetical later preparation horizon', () => {
  const parent = { start: now - day, duration: day, noticeSeconds: day, latestId: now - 1 };
  const first = now + day;
  const plan = orderedRulesetSchedule([{ duration: day, noticeSeconds: 0 }, { duration: 0, noticeSeconds: 0 }], first, now, parent);
  expect(plan.musts[0]).toBe(first);
  expect(plan.validUntil).toBe(now);
});
it('gives automatic append a usable window when a flexible parent notice would otherwise expire immediately', () => {
  const parent = { start: now - day, duration: 0, noticeSeconds: day, latestId: now - 1, automaticStart: true };
  const plan = orderedRulesetSchedule([{ duration: day, noticeSeconds: 0 }, { duration: 0, noticeSeconds: 0 }], 0, now, parent);
  expect(plan.musts[0]).toBe(now + day + 600);
  expect(plan.validUntil).toBe(now + 600);
});

it('shows an actionable admission error when tiny cycles leave no usable notice window', () => {
  const s = state(); s.stages[0].durationSeconds = 1; s.stages[0].deadline = '7days';
  const clock=vi.spyOn(Date,'now').mockReturnValue(now*1000);
  try { expect(__test.noticeClashIssue(s)).toMatch(/no usable execution window/); }
  finally {clock.mockRestore();}
});
