// A Sticky recipient in the launch and queue forms: a hook row on the distributor whose address is the Sticky
// token and whose project id is the holders' group.
import { describe, expect, it } from 'vitest';
import { __test, stickyRecipientsProblem } from '../src/create-flow.js';

const { appendRecipientPicker, recipientIssue, splitState } = __test;
const DISTRIBUTOR = '0x489d011dc34983eb2e219a5010806caa418cb46b';
const TOKEN = '0x1111111111111111111111111111111111111111';

function picker(rec, opts) {
  const host = document.createElement('div');
  const draw = () => { host.textContent = ''; appendRecipientPicker(host, rec, draw, Object.assign({ state: { chainIds: [1, 8453], perChain: {}, _pcOpen: {} } }, opts)); };
  draw();
  return host;
}
function choose(select, value) { select.value = value; select.dispatchEvent(new Event('change')); }
function type(input, value) { input.value = value; input.dispatchEvent(new Event('input')); }
const subSelect = (host) => host.querySelector('.create-split-subsel');
const stateWith = (projectType, reserved, payouts) => ({
  projectType, chainIds: [1], stages: [{ reservedRecipients: reserved || [], payoutRecipients: payouts || [], autoIssuances: [] }],
});

describe('Sticky in the recipient picker', () => {
  it('offers Sticky beside Custom for a payout and beside Fund market for reserved tokens', () => {
    expect([...subSelect(picker({ type: 'customhook' }, { isPayout: true })).options].map((o) => o.textContent)).toEqual(['Sticky', 'Custom']);
    expect([...subSelect(picker({ type: 'lphook' }, { allowFundMarket: true, isReserved: true })).options].map((o) => o.textContent)).toEqual(['Fund market', 'Sticky', 'Custom']);
  });

  it('writes the distributor, the token and the group the fields ask for', () => {
    const rec = { type: 'customhook', hookAddress: '0x2222222222222222222222222222222222222222', address: TOKEN, projectId: 9, percent: 10 };
    const host = picker(rec, { isPayout: true });
    choose(subSelect(host), 'sticky');
    // Entering Sticky drops what the row meant as a custom hook.
    expect(rec).toMatchObject({ type: 'customhook', hookAddress: DISTRIBUTOR, address: '', projectId: 0 });
    type(host.querySelector('[aria-label="Sticky token"]'), TOKEN);
    choose(host.querySelector('[aria-label="Sticky holders"]'), 'tenure');
    expect(rec.stickyError).toBe('Enter the minimum weeks');
    type(host.querySelector('[aria-label="Minimum weeks"]'), '4');
    expect(rec).toMatchObject({ projectId: 4000, stickyError: '' });
    const max = host.querySelector('input[type="checkbox"]'); max.checked = true; max.dispatchEvent(new Event('change'));
    type(host.querySelector('[aria-label="Maximum weeks"]'), '2');
    // A refused entry keeps the last group and blocks the launch, never becomes another group.
    expect(rec.projectId).toBe(4000);
    expect(rec.stickyError).toBe('Maximum weeks can\'t be less than minimum weeks.');
    type(host.querySelector('[aria-label="Maximum weeks"]'), '52');
    expect(rec).toMatchObject({ projectId: 4052, stickyError: '' });
    expect(splitState(rec, 100000000, null, 1, null, false)).toMatchObject({ hook: DISTRIBUTOR, beneficiary: TOKEN, projectId: 4052, preferAddToBalance: false });
    // Leaving Sticky starts a clean custom hook.
    choose(subSelect(host), 'custom');
    expect(rec).toMatchObject({ type: 'customhook', hookAddress: '', address: '', projectId: 0 });
  });

  it('refuses a maximum of zero, which would otherwise send no maximum', () => {
    const rec = { type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 4000, percent: 10 };
    const host = picker(rec, { isPayout: true });
    const max = host.querySelector('input[type="checkbox"]'); max.checked = true; max.dispatchEvent(new Event('change'));
    expect(rec.stickyError).toBe('Enter the maximum weeks');
    type(host.querySelector('[aria-label="Maximum weeks"]'), '0');
    expect(rec.stickyError).toBe('Maximum weeks must be at least 1.');
  });

  it('never shows weeks the row no longer holds after its type was switched', () => {
    const rec = { type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 4052, percent: 10 };
    const host = picker(rec, { isPayout: true });
    type(host.querySelector('[aria-label="Minimum weeks"]'), '5');
    expect(rec.projectId).toBe(5052);
    choose(host.querySelector('.create-split-typesel'), 'project');
    expect(rec.stickyWeeks).toBeUndefined();
    // A row whose group changed behind the typed fields opens from the group it holds.
    const stale = { type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 8000, stickyWeeks: { tenure: true, min: '4', max: '52', hasMax: true } };
    const reopened = picker(stale, { isPayout: true });
    expect(reopened.querySelector('[aria-label="Minimum weeks"]').value).toBe('8');
    expect(reopened.querySelector('[aria-label="Maximum weeks"]')).toBe(null);
  });

  it('opens a stored Sticky split as Sticky, with its group', () => {
    const host = picker({ type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 4052, percent: 10 }, { isPayout: true });
    expect(subSelect(host).value).toBe('sticky');
    expect(host.querySelector('[aria-label="Minimum weeks"]').value).toBe('4');
    expect(host.querySelector('[aria-label="Maximum weeks"]').value).toBe('52');
  });
});

describe('Sticky launch checks', () => {
  const sticky = (extra) => Object.assign({ type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 0, percent: 10 }, extra);
  it('blocks reserved tokens to Sticky holders on a new project, which has no ERC-20 at launch', () => {
    expect(recipientIssue(stateWith('project', [sticky()]))).toMatch(/only once this project has an ERC-20/);
    expect(recipientIssue(stateWith('revnet', [sticky()]))).toBe(null);
    expect(recipientIssue(stateWith('project', [], [sticky()]))).toBe(null);
  });
  it('blocks a row with no token or with refused weeks', () => {
    expect(recipientIssue(stateWith('revnet', [sticky({ address: '' })]))).toMatch(/Sticky token/);
    expect(recipientIssue(stateWith('revnet', [sticky({ stickyError: 'Enter whole weeks' })]))).toMatch(/Enter whole weeks/);
  });
  it('reads nothing when no row is Sticky', async () => {
    expect(await stickyRecipientsProblem(stateWith('project', [{ type: 'wallet', address: TOKEN, percent: 10 }]), [1], () => [])).toBe(null);
  });
});
