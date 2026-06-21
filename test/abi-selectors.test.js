// ABI selector regression guards for the two "dead feature" bugs the audit found: a wrong field type or
// tuple-field order silently changes the 4-byte selector, so the contract has no matching function and
// every tx reverts. These lock the fixes (H1 payouts currency type, H2 queue split-tuple order).
import { describe, it, expect } from 'vitest';
import { toFunctionSelector } from 'viem';
import { sendPayoutsAbi } from '../src/payouts-component.js';
import { queueRulesetsAbi } from '../src/queue-ruleset-component.js';
import { launchProjectAbi } from '../src/launch-component.js';

const fnOf = (abi, name) => abi.find((x) => x.type === 'function' && x.name === name);
// Navigate rulesetConfigurations → splitGroups → splits → component field names, in order.
function splitFieldOrder(abi, fnName) {
  const fn = fnOf(abi, fnName);
  const rc = fn.inputs.find((i) => i.name === 'rulesetConfigurations');
  const sg = rc.components.find((c) => c.name === 'splitGroups');
  const sp = sg.components.find((c) => c.name === 'splits');
  return sp.components.map((c) => c.name);
}

describe('sendPayoutsOf — H1: currency must be uint256 (selector 0xcfaf5839)', () => {
  it('the payouts component ABI produces the deployed-terminal selector', () => {
    expect(toFunctionSelector(fnOf(sendPayoutsAbi, 'sendPayoutsOf'))).toBe('0xcfaf5839');
  });
  it('currency input is uint256, not uint32', () => {
    const cur = fnOf(sendPayoutsAbi, 'sendPayoutsOf').inputs.find((i) => i.name === 'currency');
    expect(cur.type).toBe('uint256');
  });
});

describe('queueRulesetsOf — H2: JBSplit field order must match launch (canonical)', () => {
  const canonical = ['percent', 'projectId', 'beneficiary', 'preferAddToBalance', 'lockedUntil', 'hook'];
  it('queue split tuple is in canonical JBSplit order', () => {
    expect(splitFieldOrder(queueRulesetsAbi, 'queueRulesetsOf')).toEqual(canonical);
  });
  it('queue and launch agree on the split tuple order (no drift)', () => {
    expect(splitFieldOrder(queueRulesetsAbi, 'queueRulesetsOf')).toEqual(splitFieldOrder(launchProjectAbi, 'launchProjectFor'));
  });
});
