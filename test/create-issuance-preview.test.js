// The create wizard's issuance price preview reads the schedule the draft would launch.
import { describe, expect, it } from 'vitest';
import { createStage, issuancePreviewStages, newCreateDraftState, renderStages, setProjectFlavor } from '../src/create-flow.js';

const NOW = 1_800_000_000;
const DAY = 86400;

describe('issuance preview schedule', () => {
  it('a custom ruleset starts about ten minutes after launch at its typed rate', () => {
    const state = newCreateDraftState();
    setProjectFlavor(state, 'custom');
    Object.assign(state.stages[0], { tokenMode: 'custom', weight: '1000', durationSeconds: 7 * DAY, issuanceCutOn: true, weightCutPercent: 10 });
    state.afterMode = 'cycle';
    const stages = issuancePreviewStages(state, NOW);
    expect(stages[0]).toEqual({ start: NOW + 600, weight: 1000e18, weightCutPercent: 100000000, duration: 7 * DAY });
  });

  it('shows nothing when no ruleset issues tokens', () => {
    const state = newCreateDraftState();
    setProjectFlavor(state, 'custom');
    Object.assign(state.stages[0], { tokenMode: 'none', weight: '' });
    expect(issuancePreviewStages(state, NOW)).toEqual([]);
  });

  it('a revnet stage left blank keeps the previous stage\'s issuance as cut by its start', () => {
    const state = newCreateDraftState();
    setProjectFlavor(state, 'revnet');
    Object.assign(state.stages[0], { weight: '1000', issuanceCutOn: true, weightCutPercent: 50, cutFreqDays: 30 });
    const later = createStage();
    Object.assign(later, { weight: '', issuanceCutOn: false, startDaysAfter: 60 });
    state.stages.push(later);
    const stages = issuancePreviewStages(state, NOW);
    expect(stages.length).toBe(2);
    expect(stages[0]).toEqual({ start: NOW + 600, weight: 1000e18, weightCutPercent: 500000000, duration: 30 * DAY });
    // Two 30-day cycles at 50% each: a quarter of the first stage's rate.
    expect(stages[1]).toEqual({ start: NOW + 600 + 60 * DAY, weight: 250e18, weightCutPercent: 0, duration: 0 });
  });

  it('a cut with no cycle length applies once to the stage that inherits', () => {
    const state = newCreateDraftState();
    setProjectFlavor(state, 'revnet');
    Object.assign(state.stages[0], { weight: '1000', issuanceCutOn: true, weightCutPercent: 50, cutFreqDays: '' });
    const later = createStage();
    Object.assign(later, { weight: '', issuanceCutOn: false, startDaysAfter: 30 });
    state.stages.push(later);
    const stages = issuancePreviewStages(state, NOW);
    expect(stages[0]).toEqual({ start: NOW + 600, weight: 1000e18, weightCutPercent: 0, duration: 0 });
    expect(stages[1].weight).toBe(500e18);
  });

  it('several rulesets behind a notice start an hour out, as the launch does', () => {
    const state = newCreateDraftState();
    setProjectFlavor(state, 'custom');
    Object.assign(state.stages[0], { tokenMode: 'custom', weight: '1000', durationSeconds: 7 * DAY, deadline: '1day' });
    const next = createStage();
    Object.assign(next, { tokenMode: 'custom', weight: '500', durationSeconds: 7 * DAY, deadline: '1day' });
    state.stages.push(next);
    expect(issuancePreviewStages(state, NOW)[0].start).toBe(NOW + 3600);
  });

  it('draws under the rules in create, and never in the queue editor', () => {
    const state = newCreateDraftState();
    setProjectFlavor(state, 'custom');
    Object.assign(state.stages[0], { tokenMode: 'custom', weight: '1000' });
    const step = renderStages(state, () => {});
    expect(step.textContent).toContain('Preview token issuance price over time with the above rules:');
    expect(step.querySelector('.issuance-chart svg')).not.toBeNull();
    state.queueEditor = true;
    expect(renderStages(state, () => {}).textContent).not.toContain('Preview token issuance price');
  });
});
