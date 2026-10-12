import { beforeEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ read: vi.fn(), contractRead: vi.fn(), account: null }));
vi.mock('@bananapus/nana-sdk-core/v6', async original => ({ ...await original(), getProjectNftInventory: runtime.read }));
vi.mock('../src/component-base.js', async original => ({ ...await original(), getAccount:()=>runtime.account, getEffectiveAccount:()=>runtime.account, createPublicClientForChain: chainId => ({ readContract: call => runtime.contractRead({ ...call, fixtureChainId: Number(chainId) }), getBalance:async()=>10n**18n }) }));
import { getAddress } from '../src/abi-registry.js';
import { renderPayCard, renderShopSection, renderTokenPanel, inspectProjectContractsOnChain, makeNftCart } from '../src/discover.js';
const project = id => ({ id, chainId: 8453, ruleset: { start: 0, weight: 0n }, isRevnet: false });
beforeEach(() => {
  document.body.innerHTML = ''; runtime.account=null; runtime.read.mockReset(); runtime.contractRead.mockReset().mockRejectedValue(new Error('Unavailable'));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 40 }) });
});
it('withholds mint controls while identification is pending and permits only funding after failure', async () => {
  let reject; runtime.read.mockReturnValue(new Promise((_, r) => { reject = r; }));
  const p = project(401); document.body.append(renderPayCard(p), renderShopSection(p));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(true);
  expect(document.querySelector('.paybox-top').hidden).toBe(true);
  expect(document.querySelector('.paybox-memo').hidden).toBe(true);
  expect(document.querySelector('.paybox-feedback').hidden).toBe(true);
  expect([...document.querySelectorAll('button')].find(x => x.textContent === '+ Add manager').hidden).toBe(true);
  reject(new Error('RPC rate limit'));
  await vi.waitFor(() => expect(document.body.textContent).toContain('RPC rate limit'));
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(false);
  expect(document.querySelector('.paybox-top').hidden).toBe(false);
  expect(document.querySelector('.paybox-memo').hidden).toBe(false);
  expect(document.querySelector('.paybox-feedback').hidden).toBe(false);
});
it('restores ordinary payment controls after verified absence of an NFT hook', async () => {
  runtime.read.mockResolvedValue(null); document.body.append(renderPayCard(project(402)));
  await vi.waitFor(() => expect(document.querySelector('.paybox-amount-row').hidden).toBe(false));
  expect(document.querySelector('.paybox-top').hidden).toBe(false);
});
// Synthetic cart fixture, not a live supply assertion.
function nativeInventory(phase = 1) {
  return { protocol: 'defifa', hook: '0x' + '12'.repeat(20), pricing: { currency: 1, decimals: 18 }, blockNumber: 1n, phase, nextStartingId: null,
    capabilities: { genericPay: false, genericCashOut: false, manageTiers: false },
    tiers: [{ id: 1, name: 'Blue Team', price: 1000000000000n, currentSupply: 2n, remainingSupply: 100n },
      { id: 7, name: 'Orange Team', price: 3000000000000n, currentSupply: 5n, remainingSupply: 100n }] };
}
it('native checkout shares Shop and preview selection with exact mixed-price totals and preserves balance funding', async () => {
  const inventory = nativeInventory();
  runtime.read.mockImplementation(async (client, args) => args.tierLimit === 1 ? { ...inventory, tiers: inventory.tiers.slice(0, 1) } : inventory);
  const p = project(403), cart = makeNftCart(); document.body.append(renderPayCard(p, cart), renderShopSection(p, undefined, cart));
  await vi.waitFor(() => expect(document.querySelector('input[aria-label="Selected NFT amount"]')).not.toBeNull());
  expect([...document.querySelectorAll('.paybox-mode option')].map(x => x.value)).toEqual(['pay', 'addbalance']);
  expect(document.querySelector('.paybox > .paybox-amount-row').hidden).toBe(true);
  expect(document.querySelectorAll('.shop-grid .shop-tier')).toHaveLength(2);
  const orange = document.querySelector('.shop-tier[data-tier-id="7"]');
  orange.querySelectorAll('button')[1].click(); orange.querySelectorAll('button')[1].click();
  expect(document.querySelector('input[aria-label="Selected NFT amount"]').value).toBe('0.0000060 ETH');
  expect(document.querySelector('.defifa-nft-actions .paybox-feedback').textContent).toContain('Orange Team ×2');
  expect(document.querySelectorAll('.paybox-shop-item')[1].querySelector('.paybox-shop-qty').textContent).toBe('2');
  document.querySelector('.paybox-shop-thumb').click();
  expect(document.querySelector('.shop-tier[data-tier-id="1"] .shop-tier-qty').textContent).toBe('1');
  expect(document.querySelector('input[aria-label="Selected NFT amount"]').value).toBe('0.0000070 ETH');
  expect(runtime.read.mock.calls.some(([, args]) => args.tierLimit === undefined)).toBe(true);
  runtime.contractRead.mockClear();
  document.querySelector('.paybox > .paybox-amount-row .paybox-btn').click();
  expect(document.querySelector('.paybox > .paybox-status').textContent).toContain('Defifa NFT purchases require native payment instructions');
  expect(runtime.contractRead).not.toHaveBeenCalled();
  const mode = document.querySelector('.paybox-mode'); mode.value = 'addbalance'; mode.dispatchEvent(new Event('change'));
  expect(document.querySelector('.paybox > .paybox-amount-row').hidden).toBe(false);
  expect(document.querySelector('.paybox > .paybox-amount-row .paybox-btn').textContent).toBe('Add');
  expect(document.querySelector('.defifa-nft-actions').parentNode.hidden).toBe(true);
  expect(document.querySelector('a[href*="metalog.money"]')).toBeNull();
});
it('closed native entry disables tier selection while keeping intentional balance funding', async () => {
  runtime.read.mockResolvedValue(nativeInventory(3));
  const p = project(416); document.body.append(renderPayCard(p), renderShopSection(p));
  await vi.waitFor(() => expect(document.body.textContent).toContain('NFT minting is not open.'));
  expect([...document.querySelectorAll('.shop-tier-stepbtn')].every(button => button.disabled)).toBe(true);
  const mode = document.querySelector('.paybox-mode'); mode.value = 'addbalance'; mode.dispatchEvent(new Event('change'));
  expect(document.querySelector('.paybox > .paybox-amount-row').hidden).toBe(false);
  expect(document.querySelector('.paybox > .paybox-amount-row .paybox-btn').textContent).toBe('Add');
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
  expect(document.querySelector('.paybox-amount-row').hidden).toBe(false);
  expect(document.querySelector('.paybox-mode').value).toBe('addbalance');
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

it.each(['', 'unknown'])('rejects an invalid payment mode %s before preparing any transaction', async value => {
  runtime.read.mockResolvedValue({ protocol:'defifa',hook:'0x123',pricing:{currency:61166,decimals:18},blockNumber:1n,phase:1,tiers:[],nextStartingId:null });
  document.body.append(renderPayCard(project(value ? 414 : 413)));
  await vi.waitFor(()=>expect(document.querySelector('.paybox-mode').value).toBe('pay'));
  const mode=document.querySelector('.paybox-mode'),invalid=document.createElement('option');invalid.value=value;mode.appendChild(invalid);mode.value=value;mode.dispatchEvent(new Event('change'));
  runtime.read.mockClear();document.querySelector('.paybox-btn').click();
  await vi.waitFor(()=>expect(document.querySelector('.paybox-status').textContent).toBe('Choose Pay or Add to balance.'));
  expect(runtime.read).not.toHaveBeenCalled();
});


it('allows a hook-free funding review after failed NFT identity with independently verified terminal and accounting', async()=> {
 runtime.account='0x1111111111111111111111111111111111111111';
 runtime.read.mockRejectedValue(new Error('NFT identity unavailable'));
 runtime.contractRead.mockImplementation(async call=>{
  if(call.functionName==='accountingContextsOf')return[{token:'0x000000000000000000000000000000000000EEEe',decimals:18,currency:1}];
  if(call.functionName==='terminalsOf')return[getAddress('JBMultiTerminal',8453)];
  if(call.functionName==='controllerOf')return getAddress('JBController',8453);
  if(call.functionName==='currentRulesetOf')return[{start:0,weight:0n},{dataHook:'0x0000000000000000000000000000000000000000'}];
  return 0n;
 });
 document.body.append(renderPayCard(project(415)));
 await vi.waitFor(()=>expect(document.querySelector('.paybox-mode').value).toBe('addbalance'));
 await new Promise(resolve=>setTimeout(resolve,20));
 const amount=document.querySelector('.paybox-amount');amount.value='0.01';amount.dispatchEvent(new Event('input'));
 document.querySelector('.paybox-btn').click();
 await vi.waitFor(()=>expect(document.body.textContent).toContain('Confirm add to balance'));
 expect(document.body.textContent).toContain('addToBalanceOf');
 expect(document.body.textContent).not.toContain('NFT protocol identification is unavailable');
});

it('native Pay preserves the selected funding chain and restores its actual balance-review context', async () => {
  runtime.account = '0x1111111111111111111111111111111111111111';
  runtime.read.mockResolvedValue(nativeInventory());
  runtime.contractRead.mockImplementation(async call => {
    if (call.functionName === 'accountingContextsOf') return [{ token: '0x000000000000000000000000000000000000EEEe', decimals: 18, currency: 1 }];
    if (call.functionName === 'terminalsOf') return [getAddress('JBMultiTerminal', call.fixtureChainId)];
    if (call.functionName === 'controllerOf') return getAddress('JBController', call.fixtureChainId);
    if (call.functionName === 'currentRulesetOf') return [{ start: 0, weight: 0n }, { dataHook: '0x0000000000000000000000000000000000000000' }];
    return 0n;
  });
  const p = { ...project(417), chains: [{ id: 8453, name: 'Base' }, { id: 84532, name: 'Base Sepolia' }], idByChain: { 8453: 417, 84532: 46 } };
  document.body.append(renderPayCard(p));
  await vi.waitFor(() => expect(document.querySelector('input[aria-label="Selected NFT amount"]')).not.toBeNull());
  const mode = document.querySelector('.paybox-mode'), chain = document.querySelector('.paybox-payon select:not(.paybox-mode)');
  mode.value = 'addbalance'; mode.dispatchEvent(new Event('change'));
  chain.value = '84532'; chain.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(runtime.contractRead.mock.calls.some(([call]) => call.fixtureChainId === 84532 && call.functionName === 'accountingContextsOf')).toBe(true));
  mode.value = 'pay'; mode.dispatchEvent(new Event('change'));
  expect(chain.hidden).toBe(true);
  expect([...document.querySelectorAll('.paybox-chain-static')].filter(node => !node.hidden).map(node => node.textContent)).toEqual(['Base']);
  mode.value = 'addbalance'; mode.dispatchEvent(new Event('change'));
  expect(chain.hidden).toBe(false); expect(chain.value).toBe('84532');
  await new Promise(resolve => setTimeout(resolve, 20));
  runtime.contractRead.mockClear();
  const amount = document.querySelector('.paybox > .paybox-amount-row .paybox-amount'); amount.value = '0.01'; amount.dispatchEvent(new Event('input'));
  document.querySelector('.paybox > .paybox-amount-row .paybox-btn').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Confirm add to balance'));
  expect(document.body.textContent).toContain('Base Sepolia'); expect(document.body.textContent).toContain('addToBalanceOf');
  expect(runtime.contractRead.mock.calls.some(([call]) => call.functionName === 'terminalsOf' && call.fixtureChainId === 84532 && call.args[0] === 46n)).toBe(true);
  expect(runtime.contractRead.mock.calls.some(([call]) => call.functionName === 'terminalsOf' && call.fixtureChainId === 8453)).toBe(false);
});
