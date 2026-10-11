import { beforeEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ read: vi.fn(), contractRead: vi.fn() }));
vi.mock('@bananapus/nana-sdk-core/v6', () => ({ getProjectNftInventory: runtime.read }));
vi.mock('../src/component-base.js', async original => ({ ...await original(), createPublicClientForChain: () => ({ readContract: runtime.contractRead }) }));
import { getAddress } from '../src/abi-registry.js';
import { renderPayCard, renderShopSection, renderTokenPanel, inspectProjectContractsOnChain } from '../src/discover.js';
const project = id => ({ id, chainId: 8453, ruleset: { start: 0, weight: 0n }, isRevnet: false });
beforeEach(() => {
  document.body.innerHTML = ''; runtime.read.mockReset(); runtime.contractRead.mockReset().mockRejectedValue(new Error('Unavailable'));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 40 }) });
});
it('withholds generic payment and manager controls while identification is pending or failed', async () => {
  let reject; runtime.read.mockReturnValue(new Promise((_, r) => { reject = r; }));
  const p = project(401); document.body.append(renderPayCard(p), renderShopSection(p));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(true);
  expect(document.querySelector('.paybox-top').hidden).toBe(true);
  expect([...document.querySelectorAll('button')].find(x => x.textContent === '+ Add manager').hidden).toBe(true);
  reject(new Error('RPC rate limit'));
  await vi.waitFor(() => expect(document.body.textContent).toContain('RPC rate limit'));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(true);
  expect(document.querySelector('.paybox-top').hidden).toBe(true);
});
it('restores ordinary payment controls after verified absence of an NFT hook', async () => {
  runtime.read.mockResolvedValue(null); document.body.append(renderPayCard(project(402)));
  await vi.waitFor(() => expect(document.querySelector('.paybox-amount-row').hidden).toBe(false));
  expect(document.querySelector('.paybox-top').hidden).toBe(false);
});
it('native identification keeps generic controls hidden without assigning application identity', async () => {
  runtime.read.mockResolvedValue({ protocol: 'defifa', hook: '0x123', pricing: { currency: 61166, decimals: 18 }, blockNumber: 1n, phase: 1, tiers: [], nextStartingId: null });
  document.body.append(renderPayCard(project(403)));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Defifa NFT transactions are not supported'));
  expect(document.querySelector('a[href*="metalog.money"]')).toBeNull();
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

it('retries identity locally without enabling payment or resending on failure', async () => {
  runtime.read.mockRejectedValueOnce(new Error('Identity unavailable')).mockResolvedValue(null);
  const p = project(405); document.body.append(renderPayCard(p));
  await vi.waitFor(() => expect(p.nftIdentityStatus).toBe('error'));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(true);
  document.querySelector('.paybox-status button').click();
  await vi.waitFor(() => expect(p.nftIdentityStatus).toBe('verified'));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(false);
});
it('initial Tokens verifies flavor, withholds generic advice on failure and retries native NFT copy', async () => {
  runtime.read.mockRejectedValueOnce(new Error('Identity unavailable')).mockResolvedValue({ protocol: 'defifa' });
  const p = project(406); document.body.innerHTML = '<span data-project-flavor="8453:406">CUSTOM</span>';
  document.body.append(renderTokenPanel(p));
  expect(document.body.textContent).not.toContain('Juicebox credits');
  await vi.waitFor(() => expect(p.nftIdentityStatus).toBe('error'));
  expect(document.querySelector('[data-project-flavor]').textContent).toBe('Unverified');
  [...document.querySelectorAll('button')].find(x => x.textContent === 'Retry').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Defifa uses NFTs'));
  expect(document.querySelector('[data-project-flavor]').textContent).toBe('Defifa');
  expect(document.body.textContent).not.toContain('Juicebox credits');
  expect(document.body.textContent).toContain('Deploy ERC-20');
});
it('preserves ordinary and revnet token guidance and admin controls', async () => {
  runtime.read.mockResolvedValue(null);
  document.body.append(renderTokenPanel(project(407)));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Juicebox credits'));
  expect(document.body.textContent).toContain('Deploy ERC-20');
  document.body.innerHTML = ''; runtime.read.mockClear();
  document.body.append(renderTokenPanel({ ...project(408), isRevnet: true }));
  expect(document.body.textContent).toContain('Juicebox credits'); expect(runtime.read).not.toHaveBeenCalled();
});
function auditReads(hook, registry) {
  runtime.contractRead.mockImplementation(async call => {
    if (call.functionName === 'controllerOf') return getAddress('JBController', 8453);
    if (call.functionName === 'currentRulesetOf') return [{ approvalHook: '0x0000000000000000000000000000000000000000' }, { dataHook: hook }];
    if (call.functionName === 'terminalsOf') return [getAddress('JBMultiTerminal', 8453)];
    if (call.functionName === 'deployerOf') return registry();
    throw new Error('Unexpected audit read ' + call.functionName);
  });
}
it('recognizes the exact SDK-verified native hook even with absent registry provenance', async () => {
  const hook = '0x0000000000000000000000000000000000000409';
  runtime.read.mockResolvedValue({ protocol: 'defifa', hook });
  const registry = vi.fn(async () => '0x0000000000000000000000000000000000000000'); auditReads(hook, registry);
  expect(await inspectProjectContractsOnChain(project(409), { id: 8453 })).toMatchObject({ unknown: [] });
  expect(registry).not.toHaveBeenCalled();
});
it('does not recognize a different data hook from the verified native inventory', async () => {
  const hook = '0x0000000000000000000000000000000000000411';
  runtime.read.mockResolvedValue({ protocol: 'defifa', hook: '0x0000000000000000000000000000000000000412' });
  auditReads(hook, async () => '0x0000000000000000000000000000000000000000');
  const audit = await inspectProjectContractsOnChain(project(411), { id: 8453 });
  expect(audit.failed).toBeUndefined();
  expect(audit.unknown).toHaveLength(1);
  expect(audit.unknown[0].address).toBe(hook);
});
it('marks registry failures unverified, evicts them and preserves genuinely unknown hook warnings', async () => {
  const hook = '0x0000000000000000000000000000000000000410';
  runtime.read.mockResolvedValue(null);
  const registry = vi.fn().mockRejectedValueOnce(new Error('Registry unavailable')).mockResolvedValue('0x0000000000000000000000000000000000000000');
  auditReads(hook, registry);
  expect(await inspectProjectContractsOnChain(project(410), { id: 8453 })).toMatchObject({ unknown: [], failed: true });
  const next = await inspectProjectContractsOnChain(project(410), { id: 8453 });
  expect(next.failed).toBeUndefined(); expect(next.unknown).toHaveLength(1); expect(next.unknown[0].address).toBe(hook);
  expect(registry).toHaveBeenCalledTimes(2);
});
