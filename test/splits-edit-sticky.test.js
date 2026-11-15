// The split editor's Sticky option: the row sends the chain's distributor as the hook, the Sticky token as the
// beneficiary and the holders' group as the project id, and reopens a stored Sticky split the same way.
import { describe, expect, it } from 'vitest';
import { addSplitRecipientRow, buildSplitsEditPayload } from '../src/discover.js';

const DISTRIBUTOR = '0x489d011dc34983eb2e219a5010806caa418cb46b';
const TOKEN = '0x1111111111111111111111111111111111111111';
const CHAINS = [{ id: 1, name: 'Ethereum' }, { id: 8453, name: 'Base' }];

function editor(extra) {
  const box = document.createElement('div'), rows = [];
  addSplitRecipientRow(box, rows, Object.assign({ sym: 'TKN', projectSymbol: 'TKN', projectId: 7, chainId: 1, chains: CHAINS, allowSticky: true, onChange() {} }, extra));
  return { box, rows };
}
function choose(select, value) { select.value = value; select.dispatchEvent(new Event('change')); }
function type(input, value) { input.value = value; input.dispatchEvent(new Event('input')); }
const hookOf = (hook, chainId) => (typeof hook === 'function' ? hook(chainId) : hook);

describe('Sticky in the split editor', () => {
  it('sends the distributor, the Sticky token and the group', () => {
    const { box, rows } = editor();
    choose(box.querySelector('select'), 'hook');
    const kinds = box.querySelector('.create-split-subsel');
    expect([...kinds.options].map((o) => o.textContent)).toEqual(['Sticky', 'Custom']);
    choose(kinds, 'sticky');
    type(rows[0].pct, '100');
    type(box.querySelector('[aria-label="Sticky token"]'), TOKEN);
    let out = buildSplitsEditPayload(rows);
    expect(out.splits[0]).toMatchObject({ projectId: 0n, beneficiary: TOKEN, preferAddToBalance: false });
    expect(hookOf(out.splits[0].hook, 8453)).toBe(DISTRIBUTOR);

    const group = [...box.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'tenure'));
    choose(group, 'tenure');
    expect(buildSplitsEditPayload(rows).error).toMatch(/Enter the minimum weeks/);
    type(box.querySelector('[aria-label="Minimum weeks"]'), '4');
    expect(buildSplitsEditPayload(rows).splits[0].projectId).toBe(4000n);
    const max = box.querySelector('.splits-edit-lockcheck input'); max.checked = true; max.dispatchEvent(new Event('change'));
    type(box.querySelector('[aria-label="Maximum weeks"]'), '2');
    expect(buildSplitsEditPayload(rows).error).toMatch(/Maximum weeks can't be less/);
    type(box.querySelector('[aria-label="Maximum weeks"]'), '52');
    expect(buildSplitsEditPayload(rows).splits[0].projectId).toBe(4052n);
  });

  it('reopens a stored Sticky split with its token and weeks', () => {
    const orig = { hook: DISTRIBUTOR, beneficiary: TOKEN, projectId: 4052n, percent: 1000000000, preferAddToBalance: false, lockedUntil: 0 };
    const { box, rows } = editor({ prefill: { projectId: orig.projectId, beneficiary: TOKEN, pct: 100, orig } });
    expect(box.querySelector('.create-split-subsel').value).toBe('sticky');
    expect(box.querySelector('[aria-label="Sticky token"]').value).toBe(TOKEN);
    expect(box.querySelector('[aria-label="Minimum weeks"]').value).toBe('4');
    expect(box.querySelector('[aria-label="Maximum weeks"]').value).toBe('52');
    const out = buildSplitsEditPayload(rows);
    expect(out.splits[0]).toMatchObject({ projectId: 4052n, beneficiary: TOKEN });
    expect(hookOf(out.splits[0].hook, 1)).toBe(DISTRIBUTOR);
  });

  it('does not offer Sticky where the editor did not ask for it', () => {
    const { box } = editor({ allowSticky: false });
    choose(box.querySelector('select'), 'hook');
    expect(box.querySelector('.create-split-subsel')).toBe(null);
  });
});
