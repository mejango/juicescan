// The queue review says what changes: each ruleset against the rules it follows, old line and new line.
import { describe, it, expect } from 'vitest';
import { createStage, queueChangeRows } from '../src/create-flow.js';

function state(baseline, stages) {
  return { projectType: 'custom', queueEditor: true, accepts: ['eth'], perChain: {}, details: {}, queueBaseline: baseline, stages: stages };
}

describe('queueChangeRows', () => {
  it('says Unchanged when the first ruleset copies its source', () => {
    expect(queueChangeRows(state(createStage(), [createStage()]))).toEqual([['Ruleset #1', 'Unchanged']]);
  });

  it('gives the old line and the new line of each change, and compares later rulesets with the one before', () => {
    const base = createStage();
    const first = Object.assign(createStage(), { weight: '5000' });
    const second = Object.assign(createStage(), { weight: '5000' });
    const rows = queueChangeRows(state(base, [first, second]));
    expect(rows).toContainEqual(['Ruleset #1 was', expect.stringContaining('10000 tokens')]);
    expect(rows).toContainEqual(['Ruleset #1 now', expect.stringContaining('5000 tokens')]);
    expect(rows).toContainEqual(['Ruleset #2', 'Same as Ruleset #1']);
  });

  it('never calls a ruleset unchanged when a setting the summary does not list differs', () => {
    const edited = createStage();
    edited.payoutByKind = { usdc: { mode: 'limited', recipients: [{ type: 'wallet', address: '0x1', amountEth: '5' }] } };
    expect(queueChangeRows(state(createStage(), [edited]))).toEqual([
      ['Ruleset #1', 'Settings changed that this summary does not list. Check the call below.'],
    ]);
    // Open panels and when a later ruleset starts are not settings.
    const later = Object.assign(createStage(), { expanded: true, tokenOpen: false, startMode: 'date', startDate: '99' });
    expect(queueChangeRows(state(createStage(), [createStage(), later]))[1]).toEqual(['Ruleset #2', 'Same as Ruleset #1']);
  });

  it('adds nothing when the source was never read', () => {
    expect(queueChangeRows(state(null, [createStage()]))).toEqual([]);
  });
});
