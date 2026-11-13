// The pay review reads in plain rows, and shows the project's payment notice before the payer agrees.
import { describe, it, expect } from 'vitest';
import { payReviewRows, PAYMENTS_PAUSED_MESSAGE } from '../src/discover.js';

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
