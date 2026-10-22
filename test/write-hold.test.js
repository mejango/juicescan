// A direct write the wallet may have sent stays held: only an explicit wallet rejection (4001) frees the action.
import {beforeEach,expect,it,vi} from 'vitest';
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
 const first=await run();expect(first.error).toMatch(/check your wallet/i);
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
it('holds a sent hash whose confirmation could not be read until its receipt settles it',async()=>{
 const first=await run({verifyReceipt:async()=>{throw new Error('Receipt binding unavailable');}});
 expect(first.pending).toBeTruthy();
 const second=await run();expect(second.error).toMatch(/earlier/i);expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
 // Check onchain: the receipt now reads, the hold ends and the next send goes through.
 h.client.getTransaction.mockResolvedValue({hash,from:h.account,nonce:7,blockNumber:10n,chainId:8453});
 const check=[...document.querySelectorAll('dialog[open] button')].find(b=>/check onchain/i.test(b.textContent));
 check.click();
 await vi.waitFor(()=>expect(document.querySelector('dialog[open]').textContent).toMatch(/confirmed in block/i));
 closeDialogs();
 expect((await run()).ok).toBeTruthy();expect(h.wallet.writeContract).toHaveBeenCalledTimes(2);
});
it('lets the user release a no-hash hold after checking their wallet',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(new Error('Wallet connection disappeared'));
 await run();await run();
 const release=[...document.querySelectorAll('dialog[open] button')].find(b=>/checked my wallet/i.test(b.textContent));
 release.click();closeDialogs();
 expect((await run()).ok).toBeTruthy();expect(h.wallet.writeContract).toHaveBeenCalledTimes(2);
});
it('leaves holds to a caller that keeps its own journal',async()=>{
 h.wallet.writeContract.mockRejectedValueOnce(new Error('Wallet connection disappeared'));
 await run({onSending:async()=>{},onWriteRejected:()=>{}});
 expect((await run({onSending:async()=>{},onWriteRejected:()=>{}})).ok).toBeTruthy();
});

import {writeHold,findHeldWrite} from '../src/write-hold.js';
const call={to:args.address,functionName:'pay',data:'0xabcd',value:1n};
function chainAt(usedAt,tx){return {getBlockNumber:async()=>200n,getTransactionCount:async({blockNumber})=>blockNumber>=usedAt?8:7,getBlock:async({blockNumber})=>({number:blockNumber,transactions:blockNumber===usedAt?[tx]:[]})};}
it('finds a no-hash write at its saved nonce and settles it only when the exact call is there',async()=>{
 const hold=writeHold(8453,h.account,call);const record=await hold.withLock(async()=>hold.reserve({nonce:7n,blockNumber:100n}));
 const same={hash:'0x'+'b'.repeat(64),from:h.account,nonce:7,to:args.address,input:'0xabcd',value:1n};
 expect(await findHeldWrite(chainAt(150n,same),record)).toEqual({status:'sent',hash:same.hash});
 expect(await findHeldWrite(chainAt(150n,{...same,input:'0x1234'}),record)).toEqual({status:'pending',usedBy:same.hash});
 expect(await findHeldWrite(chainAt(500n,same),record)).toEqual({status:'pending'});
});
it('holds in tab memory when browser storage refuses writes',async()=>{
 const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
 try{
  h.wallet.writeContract.mockRejectedValueOnce(new Error('Wallet connection disappeared'));
  await run();expect((await run()).error).toMatch(/earlier/i);expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
 }finally{set.mockRestore();}
 writeHold(8453,h.account,call).abandon();
});
