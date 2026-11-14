// The Data tab never leaves an earlier query's rows reading as the result of the query now running.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/bendystraw-client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, bendystrawQuery: vi.fn() };
});

import { renderDataTab } from '../src/data-tab.js';
import { bendystrawQuery, setBendystrawNetwork } from '../src/bendystraw-client.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="tab-data"></div>';
  setBendystrawNetwork('testnet');
  bendystrawQuery.mockReset();
});
afterEach(() => { setBendystrawNetwork('mainnet'); });

describe('Data tab results while a new query runs', () => {
  it('marks the rows on screen stale while querying, and clears them when the new query fails', async () => {
    renderDataTab();
    const preview = Array.from(document.querySelectorAll('.data-row .fn-name-preview')).find((node) => node.textContent === 'Pending sucker transactions');
    const row = preview.closest('.data-row');
    row.querySelector('.fn-summary').click();
    const run = row.querySelector('.data-run-btn');
    const panel = row.querySelector('.data-card-result');

    bendystrawQuery.mockResolvedValueOnce({ suckerTransactions: { totalCount: 1, items: [{ id: 'a' }] } });
    run.click();
    expect(panel.getAttribute('aria-busy')).toBe('true');
    await vi.waitFor(() => expect(panel.querySelector('table.data-result-table')).not.toBeNull());
    expect(panel.hasAttribute('aria-busy')).toBe(false);

    let fail;
    bendystrawQuery.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    run.click();
    expect(panel.getAttribute('aria-busy')).toBe('true'); // the first query's rows are still there, marked stale
    expect(panel.querySelector('table.data-result-table')).not.toBeNull();
    fail(new Error('indexer offline'));
    await vi.waitFor(() => expect(row.textContent).toContain('error: indexer offline'));
    expect(panel.querySelector('table.data-result-table')).toBeNull(); // no earlier result sits beside the error
    expect(panel.hasAttribute('aria-busy')).toBe(false);
    expect(run.disabled).toBe(false);
  });
});
