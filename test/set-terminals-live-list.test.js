// setTerminalsOf replaces the whole list. The form must start from the live list and never fall back to a
// one-terminal default, which would drop the router terminal.
import { describe, it, expect, vi } from 'vitest';
const calls = vi.hoisted(() => []);
vi.mock('../src/component-base.js', async original => ({ ...await original(),
  createPublicClientForChain: () => ({ readContract: async (req) => { calls.push(req); return ['0x' + '11'.repeat(20), '0x' + '22'.repeat(20)]; } }) }));
import { POWER_SET_TERMINALS } from '../src/discover.js';

describe('Set payment terminals', () => {
  const field = POWER_SET_TERMINALS.fields[0];
  it('has no infra default and reads the live list for the field', async () => {
    expect(field.infra).toBeUndefined();
    const list = await field.listRead({ id: '5', chainId: 1, idByChain: { 1: 5 } }, 1);
    expect(list).toHaveLength(2);
    expect(calls[0].functionName).toBe('terminalsOf');
    expect(calls[0].args).toEqual([5n]);
  });
  it('refuses a blank list instead of sending one default terminal', () => {
    expect(() => POWER_SET_TERMINALS.buildArgs({ terminals: [] }, 1, 5n)).toThrow(/full terminal list/);
    expect(() => POWER_SET_TERMINALS.buildArgs({}, 1, 5n)).toThrow(/full terminal list/);
  });
  it('sends an empty list only behind the acknowledgement', () => {
    expect(POWER_SET_TERMINALS.fields[1]).toMatchObject({ name: 'allowEmpty', kind: 'bool', help: 'An empty list stops payments and cash outs.' });
    expect(() => POWER_SET_TERMINALS.buildArgs({ terminals: [], allowEmpty: false }, 1, 5n)).toThrow(/full terminal list/);
    expect(POWER_SET_TERMINALS.buildArgs({ terminals: [], allowEmpty: true }, 1, 5n)).toEqual([5n, []]);
  });
  it('sends exactly the reviewed list', () => {
    const list = ['0x' + '11'.repeat(20), '0x' + '22'.repeat(20)];
    expect(POWER_SET_TERMINALS.buildArgs({ terminals: list }, 1, 5n)).toEqual([5n, list]);
  });
  it('warns that the call replaces the entire list', () => {
    expect(POWER_SET_TERMINALS.danger).toMatch(/replaces the entire terminal list/);
  });
});
