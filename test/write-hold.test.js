// A direct write the wallet may have sent stays held: only an explicit wallet rejection (4001) frees the action.
import {beforeEach,expect,it,vi} from 'vitest';
import {webLocks} from './web-locks.js';
const h=vi.hoisted(()=>({wallet:null,client:null,account:'0x1111111111111111111111111111111111111111'}));
vi.mock('../src/wallet.js',async original=>({...await original(),getAccount:()=>h.account,getWalletClient:()=>h.wallet,createPublicClientForChain:()=>h.client,isSafeConnected:()=>false,waitForSafeInitialization:async()=>{}}));
import {executeTransaction} from '../src/component-base.js';
const hash='0x'+'a'.repeat(64),receipt={status:'success',blockNumber:10n,transactionHash:hash};
const abi=[{type:'function',name:'pay',inputs:[{name:'amount',type:'uint256'}],outputs:[],stateMutability:'payable'}];
const args={chainId:8453,address:'0x2222222222222222222222222222222222222222',abi,functionName:'pay',args:[1n],value:1n,skipConfirm:true};
function run(extra){return new Promise(resolve=>executeTransaction({...args,...extra,onSuccess:(m,meta)=>resolve({ok:m,meta}),onError:(m,meta)=>resolve({error:m,meta}),onStatus:(m,k,meta)=>{if(meta&&meta.trackingError)resolve({pending:m,meta});}}));}
function closeDialogs(){document.querySelectorAll('dialog').forEach(d=>d.remove());}
beforeEach(()=>{localStorage.clear();closeDialogs();
 h.wallet={getChainId:vi.fn(async()=>8453),writeContract:vi.fn(async()=>hash)};
 h.client={simulateContract:vi.fn(async request=>({request})),estimateContractGas:vi.fn(async()=>100n),getTransactionReceipt:vi.fn(async()=>receipt),
  getBlockNumber:vi.fn(async()=>100n),getTransactionCount:vi.fn(async()=>7),getChainId:vi.fn(async()=>8453),getTransaction:vi.fn(async()=>{throw Object.assign(new Error('nf'),{name:'TransactionNotFoundError'});}),getBlock:vi.fn(async()=>({number:0n,hash:'0x'+'0'.repeat(64),transactions:[]}))};
});

it('holds an action after an ambiguous wallet error and never opens the wallet for it again',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(new Error('Wallet connection disappeared'));
 const first=await run();expect(first.error).toMatch(/stays pending/i);
 // A retry with a fresh quote (different calldata) is still the same action.
 const second=await run({args:[2n]});
 expect(second.error).toMatch(/earlier/i);
 expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
 expect(document.querySelector('dialog[open]')).not.toBeNull();
});
it('keeps the hold across a reload',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(new Error('Request timed out'));
 await run();
 vi.resetModules();
 const fresh=await import('../src/component-base.js');
 const second=await new Promise(resolve=>fresh.executeTransaction({...args,onSuccess:()=>resolve('sent'),onError:resolve}));
 expect(second).toMatch(/earlier/i);expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
});
it('frees the action after an explicit wallet rejection',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(Object.assign(new Error('User rejected'),{code:4001}));
 await run();
 const second=await run();
 expect(second.ok).toBeTruthy();expect(h.wallet.writeContract).toHaveBeenCalledTimes(2);
});
it('frees the action after a confirmed receipt so a follow-on send works',async()=>{
 expect((await run()).ok).toBeTruthy();expect((await run()).ok).toBeTruthy();
 expect(h.wallet.writeContract).toHaveBeenCalledTimes(2);
});
it('frees the action when nothing reached the wallet',async()=>{
 h.client.simulateContract.mockRejectedValueOnce(new Error('execution reverted'));
 await run();
 expect((await run()).ok).toBeTruthy();expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
});
it('settles a held hash from the chain on the next attempt, with no extra click when it can',async()=>{
 const first=await run({verifyReceipt:async()=>{throw new Error('Receipt binding unavailable');}});
 expect(first.pending).toBeTruthy();
 // Still in the mempool: held, no wallet, no dialog to click.
 h.client.getTransaction.mockResolvedValue({hash,from:h.account,nonce:7,blockNumber:null});
 expect((await run()).error).toMatch(/still pending/i);
 expect(document.querySelector('dialog[open]')).toBeNull();
 // Mined and successful: the hold settles itself and says so; nothing is sent again.
 h.client.getTransaction.mockResolvedValue({hash,from:h.account,nonce:7,blockNumber:10n});
 const recovered=await run();
 expect(recovered.ok).toMatch(/went through in block 10/i);expect(recovered.meta).toMatchObject({phase:'confirmed',hash,recovered:true});
 expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
 // Settled: the next attempt sends normally.
 expect((await run()).ok).toBeTruthy();expect(h.wallet.writeContract).toHaveBeenCalledTimes(2);
});
it('a held hash that failed onchain settles and the same click sends again',async()=>{
 await run({verifyReceipt:async()=>{throw new Error('Receipt binding unavailable');}});
 h.client.getTransaction.mockResolvedValue({hash,from:h.account,nonce:7,blockNumber:10n});
 h.client.getTransactionReceipt.mockResolvedValueOnce({...receipt,status:'reverted'});
 expect((await run()).ok).toBeTruthy();expect(h.wallet.writeContract).toHaveBeenCalledTimes(2);
});
it('offers one release action only when the chain cannot settle the hold',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(new Error('Wallet connection disappeared'));
 await run();expect((await run()).error).toMatch(/release it/i);
 const buttons=[...document.querySelectorAll('dialog[open] button')].filter(b=>!b.classList.contains('modal-close'));
 expect(buttons).toHaveLength(1);
 buttons[0].click();
 await vi.waitFor(()=>expect(document.querySelector('dialog[open]')).toBeNull());
 expect((await run()).ok).toBeTruthy();expect(h.wallet.writeContract).toHaveBeenCalledTimes(2);
});
it('keeps one in-app confirmation on the normal send path',async()=>{
 const showModal=vi.spyOn(HTMLDialogElement.prototype,'showModal');
 const setAbi=[{type:'function',name:'setThing',inputs:[],outputs:[],stateMutability:'nonpayable'}];
 const done=new Promise(resolve=>executeTransaction({chainId:8453,address:args.address,abi:setAbi,functionName:'setThing',args:[],onSuccess:resolve,onError:resolve}));
 await vi.waitFor(()=>expect(document.querySelector('dialog[open] .create-btn.primary')).not.toBeNull());
 document.querySelector('dialog[open] .create-btn.primary').click();
 await done;
 expect(showModal).toHaveBeenCalledTimes(1);expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
 showModal.mockRestore();
});
it('leaves holds to a caller that keeps its own journal',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(new Error('Wallet connection disappeared'));
 await run({onSending:async()=>{},onWriteRejected:()=>{}});
 expect((await run({onSending:async()=>{},onWriteRejected:()=>{}})).ok).toBeTruthy();
});

import {writeHold} from '../src/write-hold.js';
const call={to:args.address,functionName:'pay',data:'0xabcd',value:1n};
it('refuses to open the wallet when browser storage cannot keep the hold',async()=>{
 const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
 try{expect((await run()).error).toMatch(/browser storage/i);}finally{set.mockRestore();}
 expect(h.wallet.writeContract).not.toHaveBeenCalled();
});
it('holds on a non-4001 rejection code',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(Object.assign(new Error('rejected'),{code:'ACTION_REJECTED'}));
 await run();expect((await run()).error).toMatch(/earlier/i);expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
});
it('does not open the wallet when another window took the slot before the wallet opened',async()=>{
 const key=Object.keys(localStorage);expect(key).toHaveLength(0);
 const takeOver=()=>{const k=Object.keys(localStorage)[0];if(k)localStorage.setItem(k,JSON.stringify({id:'other',account:h.account}));};
 const first=await run({assertWriteState:takeOver});
 expect(first.error).toMatch(/another window/i);expect(h.wallet.writeContract).not.toHaveBeenCalled();
 expect(JSON.parse(localStorage.getItem(Object.keys(localStorage)[0])).id).toBe('other');
});
it('a stale dialog never releases a newer attempt',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(new Error('Wallet connection disappeared'));
 await run();await run();
 const k=Object.keys(localStorage)[0];localStorage.setItem(k,JSON.stringify({id:'newer',account:h.account}));
 [...document.querySelectorAll('dialog[open] .create-btn.primary')][0].click();
 expect(JSON.parse(localStorage.getItem(k)).id).toBe('newer');
});
it('sends nothing where the browser has no Web Locks to keep the send to one window',async()=>{
 Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});
 try{expect((await run()).error).toMatch(/one window/i);}finally{Object.defineProperty(navigator,'locks',{configurable:true,value:webLocks});}
 expect(h.wallet.writeContract).not.toHaveBeenCalled();
});
it('a hash kept in memory never lets an old attempt release a newer stored one',async()=>{
 const hold=writeHold(8453,h.account,call);
 const a=await hold.withLock(async()=>hold.reserve());
 const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
 let withHash;try{withHash=hold.submitted(a,'0x'+'c'.repeat(64));}finally{set.mockRestore();}
 expect(hold.read().hash).toBe('0x'+'c'.repeat(64));
 const k=Object.keys(localStorage)[0];localStorage.setItem(k,JSON.stringify({id:'b',account:h.account,hash:null}));
 hold.release(withHash);
 expect(hold.read().id).toBe('b');
});
it('a release waits for the action lock, so it cannot interleave with another window swapping attempts',async()=>{
 const hold=writeHold(8453,h.account,call);const tick=()=>new Promise(r=>setTimeout(r));
 const x=await hold.withLock(async()=>hold.reserve());await tick();
 let finishB;const b=hold.withLock(()=>new Promise(resolve=>{finishB=resolve;}));await tick();
 const remove=vi.spyOn(Storage.prototype,'removeItem');
 try{
  const staleRelease=hold.release(x);await tick();
  expect(remove).not.toHaveBeenCalled();
  // Another window, holding the lock, settles x and reserves y.
  hold.releaseLocked(x);remove.mockClear();const y=hold.reserve();finishB();await b;await staleRelease;
  expect(remove).not.toHaveBeenCalled();expect(hold.read().id).toBe(y.id);
 }finally{remove.mockRestore();}
});
