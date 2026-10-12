import {beforeEach,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({wallet:null,client:null}));
vi.mock('../src/wallet.js',async original=>({...await original(),getAccount:()=> '0x1111111111111111111111111111111111111111',getWalletClient:()=>h.wallet,createPublicClientForChain:()=>h.client,isSafeConnected:()=>false,waitForSafeInitialization:async()=>{}}));
import {executeTransaction} from '../src/component-base.js';
const hash='0x'+'a'.repeat(64),receipt={status:'success',blockNumber:10n,transactionHash:hash};
const args={chainId:8453,address:'0x2222222222222222222222222222222222222222',abi:[{type:'function',name:'noop',inputs:[],outputs:[],stateMutability:'nonpayable'}],functionName:'noop',args:[],skipConfirm:true};
beforeEach(()=>{h.wallet={getChainId:vi.fn(async()=>8453),writeContract:vi.fn(async()=>hash)};h.client={simulateContract:vi.fn(async request=>({request})),estimateContractGas:vi.fn(async()=>100n),getTransactionReceipt:vi.fn(async()=>receipt)};});
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
