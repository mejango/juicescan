import {beforeEach,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({wallet:null,client:null,safe:false,account:'0x1111111111111111111111111111111111111111',propose:vi.fn()}));
vi.mock('../src/wallet.js',async original=>({...await original(),getAccount:()=>h.account,getWalletClient:()=>h.wallet,createPublicClientForChain:()=>h.client,isSafeConnected:()=>h.safe,proposeSafeTransactions:(txs)=>h.propose(txs),waitForSafeInitialization:async()=>{}}));
import {setViewAs,clearViewAs} from '../src/view-as.js';
import {executeTransaction} from '../src/component-base.js';
const hash='0x'+'a'.repeat(64),receipt={status:'success',blockNumber:10n,transactionHash:hash};
const args={chainId:8453,address:'0x2222222222222222222222222222222222222222',abi:[{type:'function',name:'noop',inputs:[],outputs:[],stateMutability:'nonpayable'}],functionName:'noop',args:[],skipConfirm:true};
beforeEach(()=>{clearViewAs();h.account='0x1111111111111111111111111111111111111111';h.safe=false;h.propose=vi.fn(async()=>hash);h.wallet={getChainId:vi.fn(async()=>8453),writeContract:vi.fn(async()=>hash)};h.client={simulateContract:vi.fn(async request=>({request})),estimateContractGas:vi.fn(async()=>100n),getTransactionReceipt:vi.fn(async()=>receipt)};});
it('awaits optional effect verification before reporting success',async()=>{
 let finish;const verifyReceipt=vi.fn(()=>new Promise(resolve=>finish=resolve)),onSuccess=vi.fn();
 executeTransaction({...args,verifyReceipt,onSuccess});
 await vi.waitFor(()=>expect(verifyReceipt).toHaveBeenCalledWith(receipt));
 expect(onSuccess).not.toHaveBeenCalled();finish();
 await vi.waitFor(()=>expect(onSuccess).toHaveBeenCalledTimes(1));
 expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
});
it('keeps a submitted action pending if receipt effects cannot be verified, without another send',async()=>{
 const onSuccess=vi.fn(),onError=vi.fn(),onStatus=vi.fn();
 executeTransaction({...args,verifyReceipt:async()=>{throw new Error('Receipt binding unavailable')},onSuccess,onError,onStatus});
 await vi.waitFor(()=>expect(onStatus).toHaveBeenCalledWith(expect.any(String),'pending',expect.objectContaining({hash,trackingError:true})));
 expect(onSuccess).not.toHaveBeenCalled();expect(onError).not.toHaveBeenCalled();expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
});
it('preserves ordinary execution when no receipt verifier is supplied',async()=>{
 const onSuccess=vi.fn();executeTransaction({...args,onSuccess});
 await vi.waitFor(()=>expect(onSuccess).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({phase:'confirmed',hash})));
 expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
});

it('awaits durable reservation after simulation before the main wallet send',async()=>{
 let reserve;const onSending=vi.fn(()=>new Promise(resolve=>reserve=resolve)),onSuccess=vi.fn();
 executeTransaction({...args,onSending,onSuccess});
 await vi.waitFor(()=>expect(onSending).toHaveBeenCalledTimes(1));
 expect(h.client.simulateContract).toHaveBeenCalledTimes(1);expect(h.wallet.writeContract).not.toHaveBeenCalled();
 reserve();await vi.waitFor(()=>expect(onSuccess).toHaveBeenCalledTimes(1));
 expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
});
it('does not send when durable reservation refuses the reviewed attempt',async()=>{
 const onError=vi.fn();executeTransaction({...args,onSending:async()=>{throw new Error('Recovery storage unavailable')},onError});
 await vi.waitFor(()=>expect(onError).toHaveBeenCalledWith('Recovery storage unavailable',expect.any(Object)));
 expect(h.wallet.writeContract).not.toHaveBeenCalled();
});
it('awaits durable reservation before a Safe proposal and preserves proposal status',async()=>{
 h.safe=true;let reserve;const onSending=vi.fn(()=>new Promise(resolve=>reserve=resolve)),onSuccess=vi.fn();
 executeTransaction({...args,onSending,onSuccess});
 await vi.waitFor(()=>expect(onSending).toHaveBeenCalledTimes(1));expect(h.propose).not.toHaveBeenCalled();
 reserve();await vi.waitFor(()=>expect(onSuccess).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({phase:'safe-proposed',safeTxHash:hash})));
 expect(h.propose).toHaveBeenCalledTimes(1);expect(h.wallet.writeContract).not.toHaveBeenCalled();
});
it('does not propose to a Safe when durable reservation fails',async()=>{
 h.safe=true;const onError=vi.fn();executeTransaction({...args,onSending:async()=>{throw new Error('Recovery storage unavailable')},onError});
 await vi.waitFor(()=>expect(onError).toHaveBeenCalledWith('Recovery storage unavailable',expect.any(Object)));expect(h.propose).not.toHaveBeenCalled();
});
it('reports a known pre-wallet abort after reservation when the network changed',async()=>{
 h.wallet.getChainId.mockResolvedValueOnce(8453).mockResolvedValueOnce(1);
 const onBeforeWriteAborted=vi.fn(),onError=vi.fn();executeTransaction({...args,onSending:async()=>{},onBeforeWriteAborted,onError});
 await vi.waitFor(()=>expect(onBeforeWriteAborted).toHaveBeenCalledWith(expect.objectContaining({chainId:8453,account:expect.any(String)})));
 expect(h.wallet.writeContract).not.toHaveBeenCalled();expect(onError).toHaveBeenCalled();
});
it('releases only explicit wallet refusal and retains an ambiguous wallet answer',async()=>{
 const onWriteRejected=vi.fn(),onError=vi.fn();h.wallet.writeContract.mockRejectedValueOnce(Object.assign(new Error('Rejected'),{code:4001}));
 executeTransaction({...args,onSending:async()=>{},onWriteRejected,onError});
 await vi.waitFor(()=>expect(onWriteRejected).toHaveBeenCalledTimes(1));
 h.wallet.writeContract.mockRejectedValueOnce(new Error('Wallet connection disappeared'));
 executeTransaction({...args,onSending:async()=>{},onWriteRejected,onError});
 await vi.waitFor(()=>expect(onError).toHaveBeenCalledTimes(2));expect(onWriteRejected).toHaveBeenCalledTimes(1);
});
it.each(['account','view','route'])('refuses %s changes while the final network read is pending',async(kind)=>{
 let finish;h.wallet.getChainId.mockResolvedValueOnce(8453).mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));
 const onBeforeWriteAborted=vi.fn(),onError=vi.fn();executeTransaction({...args,onSending:async()=>{},onBeforeWriteAborted,onError});
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 if(kind==='account')h.account=args.address;else if(kind==='view')setViewAs(args.address);else h.safe=true;
 finish(8453);await vi.waitFor(()=>expect(onBeforeWriteAborted).toHaveBeenCalledTimes(1));expect(h.wallet.writeContract).not.toHaveBeenCalled();expect(h.propose).not.toHaveBeenCalled();
});
it('does not propose a prepared call on a different Safe chain',async()=>{
 h.safe=true;h.wallet.getChainId.mockResolvedValue(1);const onBeforeWriteAborted=vi.fn(),onError=vi.fn();
 executeTransaction({...args,onSending:async()=>{},onBeforeWriteAborted,onError});
 await vi.waitFor(()=>expect(onBeforeWriteAborted).toHaveBeenCalledTimes(1));expect(h.propose).not.toHaveBeenCalled();expect(h.wallet.writeContract).not.toHaveBeenCalled();
});
it.each(['account','view','route'])('refuses Safe %s changes while the final network read is pending',async(kind)=>{
 h.safe=true;let finish;h.wallet.getChainId.mockImplementation(()=>new Promise(resolve=>finish=resolve));const onBeforeWriteAborted=vi.fn();
 executeTransaction({...args,onSending:async()=>{},onBeforeWriteAborted});await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 if(kind==='account')h.account=args.address;else if(kind==='view')setViewAs(args.address);else h.safe=false;
 finish(8453);await vi.waitFor(()=>expect(onBeforeWriteAborted).toHaveBeenCalledTimes(1));expect(h.propose).not.toHaveBeenCalled();expect(h.wallet.writeContract).not.toHaveBeenCalled();
});

it('rechecks reviewed context after a confirmed approval and refuses the NFT send if it changed',async()=>{
 h.client.readContract=vi.fn(async call=>call.blockNumber==null?0n:10n);
 const reverify=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Reviewed voting recipient changed'));
 const onError=vi.fn();
 executeTransaction({...args,tokenAddr:args.address,spenderAddr:args.address,approvalAmount:10n,reverify,onError});
 await vi.waitFor(()=>expect(onError).toHaveBeenCalledWith('Reviewed voting recipient changed',expect.any(Object)));
 expect(reverify).toHaveBeenCalledTimes(2);expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
 expect(h.wallet.writeContract.mock.calls[0][0].functionName).toBe('approve');
});
it('simulates at the newer verified snapshot after an approval instead of anchoring to older approval state',async()=>{
 h.client.readContract=vi.fn(async call=>call.blockNumber==null?0n:10n);
 const reverify=vi.fn().mockResolvedValueOnce({simulationBlockNumber:9n}).mockResolvedValueOnce({simulationBlockNumber:22n}),onSuccess=vi.fn();
 executeTransaction({...args,tokenAddr:args.address,spenderAddr:args.address,approvalAmount:10n,reverify,onSuccess});
 await vi.waitFor(()=>expect(onSuccess).toHaveBeenCalledTimes(1));
 expect(h.client.simulateContract.mock.calls.find(([call])=>call.functionName==='noop')[0].blockNumber).toBe(22n);
});
