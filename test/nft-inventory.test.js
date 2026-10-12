import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@bananapus/nana-sdk-core/v6', () => ({ getProjectNftInventory: vi.fn() }));
import { getProjectNftInventory } from '@bananapus/nana-sdk-core/v6';
import { readProjectNftIdentity, clearProjectNftIdentity, readProjectNftInventory, requireGenericInventory, renderNativeInventory, isNativeInventory, nativeActionUnavailable } from '../src/nft-inventory.js';
const args = { chainId: 8453, projectId: 27n };
const native = { protocol: 'defifa', hook: '0x123', blockNumber: 123n, phase: 1, pricing: { currency: 61166, decimals: 18 }, tiers: [{ id: 1, name: 'Rekt', price: 1000000000000n, currentSupply: 3n }], capabilities: { genericPay: false, genericCashOut: false, manageTiers: false }, nextStartingId: null };
beforeEach(() => { getProjectNftInventory.mockReset(); clearProjectNftIdentity(); });
describe('shared protocol inventory adoption', () => {
  it('returns absent inventory without pretending transport failures mean absence', async () => {
    getProjectNftInventory.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('RPC unavailable'));
    expect(await readProjectNftInventory({}, args)).toBeNull();
    await expect(readProjectNftInventory({}, args)).rejects.toThrow('RPC unavailable');
  });
  it('retains native names, exact supply/pricing and fixed-block nonnumeric store cursors', async () => {
    getProjectNftInventory.mockResolvedValueOnce({ ...native, nextStartingId: 5n }).mockResolvedValueOnce({ ...native, tiers: [{ id: 5, name: 'Moon', currentSupply: 97n }], nextStartingId: 2n }).mockResolvedValueOnce({ ...native, tiers: [{ id: 2, name: 'FUD' }] });
    const inventory = await readProjectNftInventory({}, args);
    expect(inventory.tiers.map(t => t.id)).toEqual([1, 5, 2]);
    expect(getProjectNftInventory.mock.calls[2][1]).toEqual({ ...args, startingId: 2n, blockNumber: 123n });
    expect(inventory.pricing.decimals).toBe(18);
  });
  it('rejects a changed family, duplicate tier or cyclic store page', async () => {
    for (const page of [{ ...native, protocol: 'jb721' }, native, { ...native, tiers: [], nextStartingId: 5n }]) {
      getProjectNftInventory.mockResolvedValueOnce({ ...native, nextStartingId: 5n }).mockResolvedValueOnce(page);
      await expect(readProjectNftInventory({}, args)).rejects.toThrow(/identity|duplicate|cursor/);
    }
  });
  it.each(['genericPay', 'genericCashOut', 'manageTiers'])('blocks native %s before writer execution', async capability => {
    getProjectNftInventory.mockResolvedValueOnce(native);
    await expect(requireGenericInventory({}, args, capability)).rejects.toThrow(nativeActionUnavailable);
  });
  it('retains ordinary JB721 transaction context and allows its compatible calldata', async () => {
    const shop = { ...native, protocol: 'jb721', metadataIdTarget: '0xabc', capabilities: { genericPay: true, genericCashOut: true, manageTiers: true } };
    getProjectNftInventory.mockResolvedValue(shop);
    expect(await readProjectNftInventory({}, args)).toEqual(shop);
    expect(await requireGenericInventory({}, args, 'genericPay')).toEqual(shop);
    expect(isNativeInventory(shop)).toBe(false);
  });
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///tmp/metadata'])('rejects unsafe native metadata URL %s', metadataUrl => {
    const output = renderNativeInventory(native, 8453, 27n, () => '0.000001 ETH', metadataUrl);
    expect(output.querySelectorAll('a')).toHaveLength(0);
  });
  it('keeps explicit revnet-only writer paths unchanged', async () => {
    expect(await requireGenericInventory({}, { ...args, isRevnet: true }, 'genericPay')).toBeNull();
    expect(getProjectNftInventory).not.toHaveBeenCalled();
  });
  it('renders onchain names/supplies as read-only generic Defifa tiers without an application link', () => {
    const output = renderNativeInventory({ ...native, tiers: [{ ...native.tiers[0], name: '<img onerror=alert(1)>' }] }, 8453, 27n, () => '0.000001 ETH');
    expect(output.querySelector('a')).toBeNull();
    expect(output.textContent).not.toContain('Metalog');
    expect(output.dataset.inventoryBlock).toBe('123');
    expect(output.querySelector('caption').textContent).toBe('Onchain NFT tiers');
    expect(output.querySelector('caption').textContent).not.toContain('block');
    expect(output.textContent).not.toContain('·');
    expect(output.textContent).toContain('Current NFTs');
    expect(output.textContent).toContain('0.000001 ETH');
    expect(output.textContent).toContain('<img onerror=alert(1)>');
    expect(output.querySelector('img,button,input')).toBeNull();
    expect(output.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});

it('caches bounded identity per client and invalidates exact project reads after a refresh', async () => {
  getProjectNftInventory.mockResolvedValue(native);
  const client = {}, otherClient = {};
  await readProjectNftIdentity(client, args);
  await readProjectNftIdentity(client, args);
  expect(getProjectNftInventory).toHaveBeenCalledTimes(1);
  expect(getProjectNftInventory).toHaveBeenCalledWith(client, { ...args, tierLimit: 1 });
  await readProjectNftIdentity(otherClient, args);
  expect(getProjectNftInventory).toHaveBeenCalledTimes(2);
  clearProjectNftIdentity(args);
  await readProjectNftIdentity(client, args);
  expect(getProjectNftInventory).toHaveBeenCalledTimes(3);
});

it('labels only SDK-verified native protocol as Defifa and updates matching visible flavor nodes', async () => {
  const { projectFlavor, rememberProjectInventory } = await import('../src/nft-inventory.js');
  const native = { id: 27, chainId: 8453, isRevnet: false };
  const ordinary = { id: 28, chainId: 8453, isRevnet: false };
  document.body.innerHTML = '<span data-project-flavor="8453:27">CUSTOM</span><span data-project-flavor="8453:28">CUSTOM</span>';
  expect(projectFlavor(native)).toBe('CUSTOM');
  rememberProjectInventory(native, { protocol: 'defifa' });
  expect(projectFlavor(native)).toBe('Defifa');
  expect(document.querySelector('[data-project-flavor="8453:27"]').textContent).toBe('Defifa');
  expect(document.querySelector('[data-project-flavor="8453:28"]').textContent).toBe('CUSTOM');
  rememberProjectInventory(ordinary, { protocol: 'jb721' });
  expect(projectFlavor(ordinary)).toBe('CUSTOM');
  expect(projectFlavor({ isRevnet: true })).toBe('REVNET');
});

it('renders nonnumeric Defifa names and mixed tier prices without numeric range or application assumptions', () => {
  const inventory={...native,phase:3,tiers:[{id:1,name:'Blue Team',price:7n,currentSupply:2n},{id:2,name:'Orange Team',price:19n,currentSupply:5n}]};
  const output=renderNativeInventory(inventory,8453,27n,p=>String(p)+' wei');
  expect([...output.querySelectorAll('tbody tr')].map(r=>r.textContent)).toEqual(['1Blue Team7 wei2','2Orange Team19 wei5']);
  expect([...output.querySelectorAll('th')].map(n=>n.textContent)).toEqual(['Tier','Name','Price per NFT','Current NFTs']);
  expect(output.textContent).toContain('Scoring');expect(output.textContent).not.toContain('Range');expect(output.textContent).not.toContain('Metalog');expect(output.querySelector('a')).toBeNull();
});

it('keeps requested identity failure distinct from absence and ignores an older rejected request after retry', async () => {
  const { projectFlavor } = await import('../src/nft-inventory.js');
  const project = { id: 27, chainId: 8453 };
  let reject;
  getProjectNftInventory.mockReturnValueOnce(new Promise((_, failure) => { reject = failure; })).mockResolvedValueOnce(native);
  const first = readProjectNftIdentity({}, args, project);
  expect(projectFlavor(project)).toBe('Checking');
  clearProjectNftIdentity(args);
  await readProjectNftIdentity({}, args, project);
  expect(projectFlavor(project)).toBe('Defifa');
  reject(new Error('Older request failed'));
  await expect(first).rejects.toThrow('Older request failed');
  expect(projectFlavor(project)).toBe('Defifa');
});

it.each([false, true])('does not let an older page overwrite verified flavor after a fresh read (clear all: %s)', async clearAll => {
  document.body.innerHTML = '<span data-project-flavor="8453:27">CUSTOM</span>';
  const client = {}, oldProject = { id: 27, chainId: 8453 }, currentProject = { ...oldProject };
  let reject;
  getProjectNftInventory.mockReturnValueOnce(new Promise((_, failure) => { reject = failure; })).mockResolvedValueOnce(native);
  const first = readProjectNftIdentity(client, args, oldProject);
  clearProjectNftIdentity(clearAll ? undefined : args);
  await readProjectNftIdentity(client, args, currentProject);
  expect(document.querySelector('[data-project-flavor]').textContent).toBe('Defifa');
  reject(new Error('Older page failed'));
  await expect(first).rejects.toThrow('Older page failed');
  expect(document.querySelector('[data-project-flavor]').textContent).toBe('Defifa');
});


it('uses native NFT participation labels without hiding independently existing ERC20 details', async () => {
 const {projectTokenType,rememberProjectInventory}=await import('../src/nft-inventory.js');
 const project={id:27,chainId:8453};
 document.body.innerHTML='<span data-project-token-type="8453:27">Credits</span>';
 rememberProjectInventory(project,native);
 expect(projectTokenType(project)).toBe('NFTs');
 expect(document.querySelector('[data-project-token-type]').textContent).toBe('NFTs');
 expect(projectTokenType({...project,tokenAddress:'0x123'})).toBe('ERC-20');
 expect(projectTokenType({id:28,chainId:8453})).toBe('Credits');
});
