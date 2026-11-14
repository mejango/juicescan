import { afterEach, describe, expect, it } from 'vitest';
import { busyWhile, openPendingReview } from '../src/component-base.js';

afterEach(() => {
  document.querySelectorAll('dialog.modal-dialog').forEach((node) => node.remove());
});

const call = {
  chain: 'Base', chainId: 8453, contract: 'JBMultiTerminal', address: '0x1111111111111111111111111111111111111111',
  function: 'cashOutTokensOf', args: { projectId: 9 }, value: 0n,
  summary: { action: 'Cash out TOK', rows: [['Cashing out', '10 TOK'], ['You receive', '1 ETH']] },
};
const rowsOf = (dialog) => Array.from(dialog.querySelectorAll('.tx-decoded-arg')).map((row) => row.textContent);
const confirmOf = (dialog) => dialog.querySelector('.create-modal-foot .create-btn.primary');
const agreeOf = (dialog) => dialog.querySelector('.tx-confirm-agree input');

describe('confirm dialog opened before its reads land', () => {
  it('shows known rows and Loading… rows, and locks the acknowledgement and Confirm until the exact call is shown', async () => {
    const review = openPendingReview({ action: 'Cash out TOK', chain: 'Base', rows: [['Cashing out', '10 TOK'], ['You receive', null]] }, { title: 'Confirm cash out', confirmText: 'Confirm & cash out' });
    const dialog = document.querySelector('dialog.modal-dialog');
    expect(rowsOf(dialog)).toEqual(['Cashing out: 10 TOK', 'You receive: Loading…']);
    expect(dialog.querySelectorAll('.tx-decoded-argval.pending').length).toBe(1);
    expect(dialog.querySelector('.create-payload')).toBeNull(); // no call to review yet
    expect(confirmOf(dialog).disabled).toBe(true);
    expect(agreeOf(dialog).disabled).toBe(true);
    agreeOf(dialog).click();
    confirmOf(dialog).click();
    expect(confirmOf(dialog).disabled).toBe(true);

    review.setRows([['Cashing out', '10 TOK'], ['You receive', '1 ETH']]);
    expect(rowsOf(dialog)).toEqual(['Cashing out: 10 TOK', 'You receive: 1 ETH']);
    expect(confirmOf(dialog).disabled).toBe(true);

    const confirmed = review.showNext(Object.assign({ erc20Approval: { token: '0x2', spender: '0x3', amount: 1n } }, call), { confirmText: 'Confirm & cash out' });
    expect(document.querySelectorAll('dialog.modal-dialog').length).toBe(1);
    expect(Array.from(dialog.querySelectorAll('.pay-confirm-sequence-step')).map((li) => li.textContent)).toEqual(['1Approve token access if needed', '2Cash out TOK']);
    expect(dialog.querySelector('.pay-confirm-sequence-step.active').textContent).toBe('1Approve token access if needed');
    expect(dialog.querySelector('.create-payload')).not.toBeNull();
    expect(agreeOf(dialog).disabled).toBe(false);
    expect(agreeOf(dialog).checked).toBe(false);
    expect(confirmOf(dialog).disabled).toBe(true); // the acknowledgement is for the exact call, never the pending rows
    agreeOf(dialog).click();
    confirmOf(dialog).click();
    const session = await confirmed;
    expect(session.ok).toBe(true);
    session.close();
  });

  it('ends closable with the reason when the reads fail, and reports a dismissal', async () => {
    const review = openPendingReview({ action: 'Cash out TOK', rows: [['You receive', null]] });
    const dialog = document.querySelector('dialog.modal-dialog');
    review.fail('Could not read the cash out quote.');
    expect(rowsOf(dialog)).toEqual(['You receive: Not loaded']);
    expect(dialog.querySelector('.tx-confirm-status.error').textContent).toBe('Could not read the cash out quote.');
    expect(confirmOf(dialog).disabled).toBe(true);
    expect(agreeOf(dialog).disabled).toBe(true);
    expect(review.closed).toBe(false);
    dialog.querySelector('.create-modal-foot .create-btn.ghost').click();
    expect(review.closed).toBe(true);
    expect(await review.confirm(call, {})).toBe(false);
  });

  it('confirm() resolves true and closes once the exact call is acknowledged', async () => {
    const review = openPendingReview({ action: 'Cash out TOK', rows: [] });
    const result = review.confirm(call, {});
    const dialog = document.querySelector('dialog.modal-dialog');
    agreeOf(dialog).click();
    confirmOf(dialog).click();
    expect(await result).toBe(true);
    expect(document.querySelector('dialog.modal-dialog')).toBeNull();
  });
});

describe('busyWhile', () => {
  it('disables and labels the button until the work settles, and ignores a second click', async () => {
    const button = document.createElement('button'); button.textContent = 'Cash out';
    let release; let runs = 0;
    const first = busyWhile(button, 'Loading…', () => { runs++; return new Promise((resolve) => { release = resolve; }); });
    await Promise.resolve();
    expect([button.disabled, button.getAttribute('aria-busy'), button.textContent]).toEqual([true, 'true', 'Loading…']);
    await busyWhile(button, 'Loading…', () => { runs++; });
    expect(runs).toBe(1);
    release(); await first;
    expect([button.disabled, button.getAttribute('aria-busy'), button.textContent]).toEqual([false, null, 'Cash out']);
  });
});
