import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decodeFunctionData, encodeFunctionResult, parseAbi } from 'viem';
import { __test } from '../src/create-flow.js';
import { resolveEns, reverseEns } from '../src/ens.js';
import { setCustomRpc } from '../src/chain.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const UNIVERSAL = parseAbi([
  'function resolveWithGateways(bytes name,bytes data,string[] gateways) view returns(bytes result,address resolver)',
  'function reverseWithGateways(bytes reverseName,uint256 coinType,string[] gateways) view returns(string resolvedName,address resolver,address reverseResolver)',
]);
const ADDRESS = parseAbi(['function addr(bytes32 node) view returns(address)']);
const MULTICALL = parseAbi(['function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns((bool success,bytes returnData)[] results)']);
let requests;
function resultFor(data) {
  try {
    const call = decodeFunctionData({abi:MULTICALL,data});
    return encodeFunctionResult({abi:MULTICALL,functionName:'aggregate3',result:call.args[0].map(item=>({success:true,returnData:resultFor(item.callData)}))});
  } catch (_) { /* A direct ENS call uses the same real viem decoder below. */ }
  const call = decodeFunctionData({abi:UNIVERSAL,data});
  return encodeFunctionResult({abi:UNIVERSAL,functionName:call.functionName,result:call.functionName==='resolveWithGateways'
    ? [encodeFunctionResult({abi:ADDRESS,functionName:'addr',result:OWNER}),OWNER]
    : ['reverse-reader.eth',OWNER,OWNER]});
}
beforeEach(()=>{
  localStorage.clear();requests=[];
  vi.stubGlobal('fetch',vi.fn(async(url,options)=>{
    const body=JSON.parse(options.body);requests.push({url:String(url),body});
    const response=Array.isArray(body)?body.map(answer):answer(body);
    return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}});
  }));
});
function answer(body){expect(body.method).toBe('eth_call');return {jsonrpc:'2.0',id:body.id,result:resultFor(body.params[0].data)};}
afterEach(()=>vi.unstubAllGlobals());
it('routes real normalized forward and reverse UniversalResolver HTTP reads through Center',async()=>{
  await expect(resolveEns('  Center-Reader.ETH ')).resolves.toBe(OWNER);
  await expect(reverseEns(OWNER)).resolves.toBe('reverse-reader.eth');
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(request=>request.url==='https://juicebox.center/v1/rpc/1')).toBe(true);
  const count=requests.length;
  await expect(resolveEns('center-reader.eth')).resolves.toBe(OWNER);
  await expect(reverseEns(OWNER)).resolves.toBe('reverse-reader.eth');
  expect(requests).toHaveLength(count);
});
it('preserves explicit custom RPC transport without adding a provider fallback',async()=>{
  setCustomRpc(1,'https://user-rpc.example/ethereum');
  await expect(resolveEns('custom-reader.eth')).resolves.toBe(OWNER);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(request=>request.url==='https://user-rpc.example/ethereum')).toBe(true);
});
it('preserves resolved recipient aliases and sends no request for invalid names',async()=>{
  await expect(resolveEns('invalid_.eth')).resolves.toBeNull();expect(requests).toHaveLength(0);
  const input=document.createElement('input');input.value='alias-reader.eth';const store=vi.fn();
  const hint=__test.attachEns(input,store,{chainId:8453});
  await vi.waitFor(()=>expect(store).toHaveBeenCalledWith('alias-reader.eth',OWNER));
  expect(hint.textContent).toBe(OWNER);
  expect(requests.every(request=>request.url==='https://juicebox.center/v1/rpc/1')).toBe(true);
});
