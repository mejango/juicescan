// The Simple project flavor: one preset ruleset, the same one juicebox.money launches (createSimpleProjectStage).
import { describe, it, expect } from 'vitest';
import { __test, setProjectFlavor, createSimpleStage } from '../src/create-flow.js';

const { initState, buildLaunchArgs, stepsFor, mergeDraft } = __test;
const ALICE = '0x1111111111111111111111111111111111111111';
const ZERO = '0x0000000000000000000000000000000000000000';
const UINT224_MAX = (1n << 224n) - 1n;

function simpleState() {
  const s = initState();
  s.network = 'mainnet'; s.accepts = ['eth']; s.chainIds = [1];
  s.details = Object.assign(s.details, { name: 'Simple', owner: ALICE });
  s.stages[0].weight = '7'; // a Custom rule that must stay aside
  return setProjectFlavor(s, 'simple');
}

describe('Simple project flavor', () => {
  it('skips the Rulesets step', () => {
    expect(stepsFor(simpleState())).toEqual(['Flavor', 'Basics', 'Shop', 'Deploy']);
  });

  it('launches the preset: open-ended, no approval wait, unlimited surplus allowance, every owner power on', () => {
    const a = buildLaunchArgs(simpleState(), 1, ALICE, 'ipfs://u', '0x' + '12'.repeat(32), 0);
    expect(a.args[3]).toHaveLength(1);
    const rs = a.args[3][0];
    expect(Number(rs.duration)).toBe(0);
    expect(String(rs.approvalHook).toLowerCase()).toBe(ZERO);
    expect(BigInt(rs.weight)).toBe(10000n * 10n ** 18n);
    const m = rs.metadata;
    ['allowOwnerMinting', 'allowSetTerminals', 'allowSetController', 'allowTerminalMigration', 'allowSetCustomToken',
      'allowAddAccountingContext', 'allowAddPriceFeed'].forEach((flag) => expect(m[flag], flag).toBe(true));
    expect(m.pausePay).toBe(false);
    expect(rs.fundAccessLimitGroups).toHaveLength(1);
    expect(rs.fundAccessLimitGroups[0].payoutLimits).toEqual([]);
    expect(rs.fundAccessLimitGroups[0].surplusAllowances.map((x) => BigInt(x.amount))).toEqual([UINT224_MAX]);
  });

  it('keeps the Custom rules aside and restores them', () => {
    const s = simpleState();
    expect(s.stages[0].weight).toBe('10000');
    setProjectFlavor(s, 'custom');
    expect(s.stages[0].weight).toBe('7');
    expect(s.savedStages).toBeUndefined();
  });

  it('a saved Simple draft reloads today’s preset, not the stored ruleset, and keeps the Custom rules', () => {
    const saved = JSON.parse(JSON.stringify(simpleState()));
    saved.stages[0].allowOwnerMinting = false; saved.stages[0].weight = '1';
    const s = mergeDraft(saved);
    expect(s.projectType).toBe('simple');
    expect(s.stages).toHaveLength(1);
    expect(s.stages[0]).toMatchObject({ weight: createSimpleStage().weight, allowOwnerMinting: true });
    expect(s.savedStages[0].weight).toBe('7');
  });
});
