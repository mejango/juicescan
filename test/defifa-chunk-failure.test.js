import { beforeEach, expect, it, vi } from 'vitest';

// The Defifa actions chunk failing to load is not an inventory read failure: Retry would repeat an import the
// browser keeps failed, so the Pay card and Cash out offer a reload instead.
const runtime = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../src/nft-inventory-read.js', async original => ({ ...await original(), getProjectNftInventory: runtime.read }));
vi.mock('../src/component-base.js', async original => ({ ...await original(), getAccount: () => null, getEffectiveAccount: () => null,
  createPublicClientForChain: () => ({ readContract: () => Promise.reject(new Error('Unavailable')), getBalance: async () => 0n }) }));
vi.mock('../src/defifa-nft-actions.js', () => { throw new Error('chunk offline'); });
import { opsActionsRow, renderPayCard } from '../src/discover.js';

const inventory = { protocol: 'defifa', hook: '0x' + '12'.repeat(20), pricing: { currency: 1, decimals: 18 }, blockNumber: 1n, phase: 1, nextStartingId: null,
  capabilities: { genericPay: false, genericCashOut: false, manageTiers: false },
  tiers: [{ id: 1, name: 'Blue Team', price: 1000000000000n, currentSupply: 2n, remainingSupply: 100n }] };
const project = id => ({ id, chainId: 8453, ruleset: { start: 0, weight: 0n }, isRevnet: false });

beforeEach(() => {
  document.body.innerHTML = '';
  runtime.read.mockReset().mockResolvedValue(inventory);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 40 }) });
});

it('Pay card offers a reload, not Retry, when the Defifa chunk fails', async () => {
  document.body.append(renderPayCard(project(501)));
  const status = document.querySelector('.paybox > .paybox-status');
  await vi.waitFor(() => expect(status.textContent).toContain('Reload the page to try again'));
  expect([...status.querySelectorAll('button')].map(button => button.textContent)).toEqual(['[reload]']);
});

it('Cash out offers a reload when the Defifa chunk fails', async () => {
  const row = opsActionsRow(project(502), { noLoans: true }); document.body.append(row);
  [...row.querySelectorAll('button')].find(button => button.textContent === 'Cash out').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Reload the page to try again'));
  expect([...document.querySelectorAll('dialog button')].some(button => button.textContent === '[reload]')).toBe(true);
});
