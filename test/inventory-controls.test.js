import { beforeEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@bananapus/nana-sdk-core/v6', () => ({ getProjectNftInventory: runtime.read }));
vi.mock('../src/component-base.js', async original => ({ ...await original(), createPublicClientForChain: () => ({ readContract: vi.fn(async () => { throw new Error('Unavailable'); }) }) }));
import { renderPayCard, renderShopSection } from '../src/discover.js';
const project = id => ({ id, chainId: 8453, ruleset: { start: 0, weight: 0n }, isRevnet: false });
beforeEach(() => {
  document.body.innerHTML = ''; runtime.read.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 40 }) });
});
it('withholds generic payment and manager controls while identification is pending or failed', async () => {
  let reject; runtime.read.mockReturnValue(new Promise((_, r) => { reject = r; }));
  const p = project(401); document.body.append(renderPayCard(p), renderShopSection(p));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(true);
  expect(document.querySelector('.paybox-top').hidden).toBe(true);
  expect([...document.querySelectorAll('button')].find(x => x.textContent === '+ Add manager').hidden).toBe(true);
  reject(new Error('RPC rate limit'));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Reload to try again'));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(true);
  expect(document.querySelector('.paybox-top').hidden).toBe(true);
});
it('restores ordinary payment controls after verified absence of an NFT hook', async () => {
  runtime.read.mockResolvedValue(null); document.body.append(renderPayCard(project(402)));
  await vi.waitFor(() => expect(document.querySelector('.paybox-amount-row').hidden).toBe(false));
  expect(document.querySelector('.paybox-top').hidden).toBe(false);
});
it('native identification keeps generic controls hidden and links to Metalog', async () => {
  runtime.read.mockResolvedValue({ protocol: 'defifa', hook: '0x123', pricing: { currency: 61166, decimals: 18 }, blockNumber: 1n, phase: 1, tiers: [], nextStartingId: null });
  document.body.append(renderPayCard(project(403)));
  await vi.waitFor(() => expect(document.querySelector('a[href="https://metalog.money/markets/8453/403"]')).not.toBeNull());
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(true);
  expect(document.querySelector('.paybox-top').hidden).toBe(true);
});
it('keeps plain JB721 payment available when optional shop detail reads fail', async () => {
  runtime.read.mockImplementation((client, args) => args.tierLimit === 1 ? Promise.resolve({ protocol: 'jb721' }) : Promise.reject(new Error('Resolver unavailable')));
  document.body.append(renderPayCard(project(404)));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Resolver unavailable'));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(false);
  expect(document.querySelector('.paybox-top').hidden).toBe(false);
});
