// The pay review reads in plain rows, and shows the project's payment notice before the payer agrees.
import { describe, it, expect } from 'vitest';
import { payReviewRows, payReceiptIsEstimate, payNoticeView, renderPayNoticeNote, PAYMENTS_PAUSED_MESSAGE } from '../src/discover.js';

const base = { amount: '1 ETH', chain: 'Base', minimum: '990 TKN', beneficiary: '0x' + '11'.repeat(20), memo: '' };
describe('pay review rows', () => {
  it('lists Send, On, the minimum and the beneficiary for a payment', () => {
    expect(payReviewRows(base)).toEqual([['Send', '1 ETH'], ['On', 'Base'], ['You get at least', '990 TKN'], ['Beneficiary', base.beneficiary]]);
  });
  it('shows the project notice and the note', () => {
    const rows = payReviewRows({ ...base, memo: ' gm ', notice: ' Refunds are not offered. ' });
    expect(rows).toContainEqual(['Note', 'gm']);
    expect(rows[rows.length - 1]).toEqual(['Project notice', 'Refunds are not offered.']);
  });
  it('repeats a failed market quote in the review', () => {
    expect(payReviewRows({ ...base, quoteFailed: true }).map(r => r[0])).toContain('Quote');
  });
  it('add to balance has no minimum or beneficiary, and keeps the notice', () => {
    const rows = payReviewRows({ ...base, addBalance: true, lands: '≈ 1 USDC after swap', notice: 'Notice' });
    expect(rows.map(r => r[0])).toEqual(['Send', 'On', 'Lands', 'Project notice']);
  });
  it('words a pause the same as juicebox.money', () => {
    expect(PAYMENTS_PAUSED_MESSAGE).toBe('Payments are paused under the current rules.');
  });
});

describe('the payment notice a payer is shown', () => {
  it('is the paid chain’s own, with the chains that read differently listed in display order', () => {
    const notices = { 10: 'Optimism terms', 1: 'Terms', 8453: 'Terms', 42161: '' };
    expect(payNoticeView(8453, notices)).toEqual({
      notice: 'Terms', failed: false,
      others: [{ chainId: 42161, notice: '' }, { chainId: 10, notice: 'Optimism terms' }],
    });
    expect(payNoticeView(10, notices).notice).toBe('Optimism terms');
  });

  it('says a failed read failed, and never lists an unread chain as different', () => {
    expect(payNoticeView(1, { 1: null, 10: 'Terms' })).toEqual({ notice: '', failed: true, others: [] });
    expect(payNoticeView(1, { 10: 'Terms' }).failed).toBe(true);
    expect(payNoticeView(10, { 1: null, 10: 'Terms' })).toEqual({ notice: 'Terms', failed: false, others: [] });
  });

  it('draws a toggle for other versions, and a retry that shows the notice once it loads', async () => {
    const differs = renderPayNoticeNote(payNoticeView(1, { 1: 'Terms', 10: 'Other terms' }), () => Promise.reject());
    expect(differs.querySelector('summary').textContent).toMatch(/^The notice differs on /);
    expect(differs.querySelector('.pay-notice-text').textContent).toBe('Other terms');

    const failed = renderPayNoticeNote(payNoticeView(1, { 1: null }), () => Promise.resolve({ ...payNoticeView(1, { 1: 'Terms' }), retried: true }));
    expect(failed.textContent).toContain('could not be loaded');
    failed.querySelector('button').click();
    await Promise.resolve(); await Promise.resolve();
    expect(failed.textContent).toBe('Project notice: Terms');

    expect(renderPayNoticeNote(payNoticeView(1, { 1: 'Terms', 10: 'Terms' }), () => Promise.reject()).textContent).toBe('');
  });
});

describe('a receipt that a market price can lower', () => {
  it('is an estimate only when a settled quote guarantees less than it previews', () => {
    expect(payReceiptIsEstimate('ready', { received: 900n, minReturnedTokens: 600n })).toBe(true);
    expect(payReceiptIsEstimate('ready', { received: 900n, minReturnedTokens: 900n })).toBe(false);
    expect(payReceiptIsEstimate('previewing', { received: 900n, minReturnedTokens: 600n })).toBe(false);
    expect(payReceiptIsEstimate('ready', { unavailable: true })).toBe(false);
    expect(payReceiptIsEstimate('ready', null)).toBe(false);
  });
});
