import { beforeEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ read: vi.fn(), contract: vi.fn() }));
vi.mock('@bananapus/nana-sdk-core/v6', async original => ({ ...await original(), getProjectNftInventory: runtime.read }));
vi.mock('../src/component-base.js', async original => ({ ...await original(), getAccount: () => null, getEffectiveAccount: () => null, createPublicClientForChain: () => ({ readContract: runtime.contract }) }));
import { makeNftCart, renderShopSection } from '../src/discover.js';
const native = () => ({ protocol: 'defifa', chainId: 8453, hook: '0x1111111111111111111111111111111111111111', store: '0x2222222222222222222222222222222222222222', blockNumber: 65n, phase: 1, pricing: { currency: 1, decimals: 18, token: '0x000000000000000000000000000000000000EEEe', symbol: 'ETH' }, nextStartingId: null, tiers: [1,2].map(id => ({ id, name: id === 1 ? 'Blue Team' : 'Orange Team', price: BigInt(id) * 1000000000000n, currentSupply: BigInt(id), remainingSupply: 100, initialSupply: 100, discountPercent: 0 })) });
beforeEach(() => { document.body.replaceChildren(); runtime.read.mockReset(); runtime.contract.mockReset(); vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({ fillRect(){},clearRect(){},drawImage(){},fillText(){},measureText(){return {width:0};} }); });
it('loads one pinned resolved URI per visible tier, serially, without making names depend on images', async () => {
 const inventory=native(),cart=makeNftCart();runtime.read.mockResolvedValue(inventory);let release;const image='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg"/>');
 runtime.contract.mockImplementation(call => new Promise(resolve => { release=()=>resolve([{ id: Number(call.args[3]), resolvedUri:'data:application/json;base64,'+btoa(JSON.stringify({name:'Untrusted cosmetic name',image})) }]); }));
 document.body.append(renderShopSection({id:440,chainId:8453,isRevnet:false},inventory,cart));
 await vi.waitFor(()=>expect(document.querySelectorAll('.shop-tier')).toHaveLength(2));
 expect([...document.querySelectorAll('.shop-tier-name')].map(x=>x.textContent)).toEqual(['Blue Team','Orange Team']);expect(cart.name(1)).toBe('Blue Team');
 await vi.waitFor(()=>expect(runtime.contract).toHaveBeenCalledTimes(1));release();
 await vi.waitFor(()=>expect(runtime.contract).toHaveBeenCalledTimes(2));release();
 await vi.waitFor(()=>expect(document.querySelectorAll('.shop-tier-img img')).toHaveLength(2));
 runtime.contract.mock.calls.forEach(([call])=>expect(call).toMatchObject({address:inventory.store,functionName:'tiersOf',args:[inventory.hook,[],true,expect.any(BigInt),1n],blockNumber:65n}));
 expect([...document.querySelectorAll('.shop-tier-name')].map(x=>x.textContent)).toEqual(['Blue Team','Orange Team']);
});
it('retains named, selectable cards when optional metadata fails', async () => {
 const inventory=native(),cart=makeNftCart();runtime.read.mockResolvedValue(inventory);runtime.contract.mockRejectedValue(new Error('Optional URI unavailable'));
 document.body.append(renderShopSection({id:441,chainId:8453,isRevnet:false},inventory,cart));
 await vi.waitFor(()=>expect(runtime.contract).toHaveBeenCalledTimes(2));
 expect(document.querySelector('.shop-tier-name').textContent).toBe('Blue Team');document.querySelector('.shop-tier-step button:last-child').click();expect(cart.get(1)).toBe(1);
 expect(document.querySelectorAll('.shop-tier-img img')).toHaveLength(0);expect(document.body.textContent).not.toContain('Could not verify NFT inventory');
});
