import { beforeEach, describe, expect, it } from 'vitest';
import { decodeFunctionData, encodeFunctionData } from 'viem';
import {
  __test, buildQueueRulesetConfigs, createDraftObject, createStage, parseCreateDraftJson, renderStages,
} from '../src/create-flow.js';

const { initState, recomputeCustomDuration, durationIssue, buildLaunchArgs, renderDeploy } = __test;
const OWNER = '0x1111111111111111111111111111111111111111';

function customDuration(value = '', unit = 'hours') {
  const state = initState();
  state.chainIds = [1];
  state.details.name = 'Decimal duration';
  state.details.owner = OWNER;
  state.afterMode = 'cycle';
  Object.assign(state.stages[0], { expanded: true, durationCustom: true, customDurVal: value, customDurUnit: unit });
  recomputeCustomDuration(state.stages[0]);
  return state;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('custom duration conversion and draft/transaction behavior', () => {
  it.each([
    ['4.5', 'hours', 16200], ['.5', 'days', 43200], ['1.25', 'weeks', 756000],
    ['0.5', 'years', 15768000], ['4.', 'hours', 14400], ['0.0005', 'hours', 2],
  ])('converts %s %s to %s whole seconds', (value, unit, seconds) => {
    const state = customDuration(value, unit);
    expect(state.stages[0].durationSeconds).toBe(seconds);
    expect(durationIssue(state)).toBeNull();
    expect(buildQueueRulesetConfigs(state, 1, 0)[0].duration).toBe(seconds);
  });

  it.each(['', '.', '0', '-1', '4.5junk', '1e3', 'Infinity', '4,5', '0.0001', '2000000'])
    ('blocks invalid custom duration %j in launch and queue builders', value => {
      const state = customDuration(value);
      expect(durationIssue(state)).toMatch(/Ruleset #1/);
      expect(() => buildQueueRulesetConfigs(state, 1, 0)).toThrow(/duration/);
      expect(() => buildLaunchArgs(state, 1, OWNER, '', '0x' + '00'.repeat(32), 0)).toThrow(/duration/);
      state.tos = true;
      const deployment = renderDeploy(state, () => {});
      expect([...deployment.querySelectorAll('button')].find(button => button.textContent === 'Launch project').disabled).toBe(true);
      expect(deployment.textContent).toContain('Ruleset #1:');
    });

  it('recomputes imported custom seconds from the raw decimal and preserves its text/unit', () => {
    const state = customDuration('4.50');
    const draft = createDraftObject(state);
    draft.stages[0].durationSeconds = 0;
    const imported = parseCreateDraftJson(JSON.stringify(draft));
    expect(imported.stages[0]).toMatchObject({ customDurVal: '4.50', customDurUnit: 'hours', durationSeconds: 16200 });
    expect(buildQueueRulesetConfigs(imported, 1, 0)[0].duration).toBe(16200);
  });

  it('encodes decimal units as exact integer seconds in the deployed contract call', () => {
    const state = customDuration('4.5');
    const call = buildLaunchArgs(state, 1, OWNER, '', '0x' + '00'.repeat(32), 0);
    const data = encodeFunctionData({ abi: call.abi, functionName: 'launchProjectFor', args: call.args });
    const decoded = decodeFunctionData({ abi: call.abi, data });
    expect(decoded.args[2].rulesetConfigurations[0].duration).toBe(16200);
  });

  it('uses decimal duration for the next ruleset cycle boundary', () => {
    const state = customDuration('4.5');
    state.stages.push(Object.assign(createStage(), { startCycles: '2' }));
    state.stages[0].schedule = '2000000000';
    const configs = buildQueueRulesetConfigs(state, 1, 0);
    expect(configs[1].mustStartAtOrAfter).toBe(2000032400n);
  });

  it('keeps Flexible and Forever valid while rejecting imported fractional/overflow seconds', () => {
    const state = initState();
    expect(durationIssue(state)).toBeNull();
    state.stages[0].durationSeconds = __test.FOREVER_SECONDS;
    expect(durationIssue(state)).toBeNull();
    for (const seconds of [1.5, -1, __test.FOREVER_SECONDS + 1]) {
      state.stages[0].durationSeconds = seconds;
      expect(durationIssue(state)).toMatch(/whole number of seconds/);
    }
  });

  it('accepts the maximum rounded duration and rejects unsupported units', () => {
    expect(customDuration(String(__test.FOREVER_SECONDS / 3600)).stages[0].durationSeconds).toBe(__test.FOREVER_SECONDS);
    expect(durationIssue(customDuration('1', 'minutes'))).toMatch(/Choose hours/);
    expect(durationIssue(customDuration('1', 'constructor'))).toMatch(/Choose hours/);
  });
});

describe('custom duration editor', () => {
  it('retains focus/caret and refreshes duration-dependent controls across intermediate decimal text', () => {
    const state = customDuration();
    state.stages[0].reservedRecipients = [{ type: 'wallet', address: OWNER, percent: 10, lockedUntil: 0 }];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const render = () => host.replaceChildren(renderStages(state, render));
    render();
    expect(host.querySelector('.create-split-lock')).toBeNull();
    for (const value of ['4', '4.', '4.5']) {
      const input = host.querySelector('[aria-label="Custom duration"]');
      expect(input.inputMode).toBe('decimal');
      input.focus();
      input.value = value;
      input.setSelectionRange(value.length, value.length);
      input.dispatchEvent(new Event('input'));
      const replacement = host.querySelector('[aria-label="Custom duration"]');
      expect(document.activeElement).toBe(replacement);
      expect(replacement.value).toBe(value);
      expect(replacement.selectionStart).toBe(value.length);
    }
    expect(host.querySelector('.create-stage-sum').textContent).toContain('Lasts 16200s');
    expect(host.querySelector('.create-after-select')).not.toBeNull();
    expect(host.querySelector('.create-split-lock')).not.toBeNull();
  });

  it('preserves existing split locks while custom text is incomplete, and clears them for Flexible', () => {
    const state = customDuration('4.5');
    const recipient = { type: 'wallet', address: OWNER, percent: 10, lockedUntil: 2000000000 };
    state.stages[0].reservedRecipients = [recipient];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const render = () => host.replaceChildren(renderStages(state, render));
    render();
    for (const value of ['', '.', '.5']) {
      const input = host.querySelector('[aria-label="Custom duration"]');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      expect(recipient.lockedUntil).toBe(2000000000);
    }
    const durationSelect = [...host.querySelectorAll('select')].find(select => [...select.options].some(option => option.textContent === 'Flexible'));
    durationSelect.value = '0';
    durationSelect.dispatchEvent(new Event('change'));
    expect(recipient.lockedUntil).toBe(0);
  });
});
