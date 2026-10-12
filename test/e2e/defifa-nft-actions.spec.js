import * as esbuild from 'esbuild';
import {test,expect} from '@playwright/test';
let harness;
async function source(){
 if(!harness)harness=esbuild.build({stdin:{contents:"import {renderDefifaNftActions} from './src/defifa-nft-actions.js';window.showNativeActions=()=>document.querySelector('main').replaceChildren(renderDefifaNftActions(window.native.inventory,8453,27,(value)=>String(value)+' base units'));",resolveDir:process.cwd(),loader:'js'},bundle:true,format:'esm',write:false,plugins:[{name:'controlled-native-ui',setup(build){
  build.onResolve({filter:/^@bananapus\/nana-sdk-core\/v6$/},()=>({path:'sdk',namespace:'native-ui'}));
  build.onResolve({filter:/^\//,namespace:'native-ui'},args=>({path:args.path,namespace:'file'}));
  build.onResolve({filter:/component-base\.js$/},()=>({path:'components',namespace:'native-ui'}));
  build.onResolve({filter:/safe-app\.js$/},()=>({path:'safe',namespace:'native-ui'}));
  build.onLoad({filter:/.*/,namespace:'native-ui'},args=>({loader:'js',contents:args.path==='sdk'?`export * from ${JSON.stringify(process.cwd()+'/node_modules/@bananapus/nana-sdk-core/dist/esm/v6/index.js')};
export async function getProjectNftInventory(){return window.native.inventory}
export async function getDefifaHoldings(){return window.native.holdings}
export async function prepareDefifaPay(client,args){window.native.preparations++;const counts=new Map();for(const id of args.tierIdsToMint)counts.set(id,(counts.get(id)||0n)+1n);const selectedTiers=[...counts].map(([tierId,count])=>({tierId,count,unitPrice:window.native.inventory.tiers.find(t=>BigInt(t.id)===tierId).price}));return {...window.native.prepared,selectedTiers,amount:selectedTiers.reduce((sum,t)=>sum+t.unitPrice*t.count,0n),effectiveAttestationDelegate:args.account}}
export async function prepareDefifaCashOut(){window.native.preparations++;return {...window.native.prepared,reclaimAmount:0n,protocolRewards:{defifaAmount:2n,baseProtocolAmount:0n,defifaToken:window.native.inventory.hook,baseProtocolToken:window.native.inventory.hook,defifaDecimals:18,baseProtocolDecimals:18}}}
export async function prepareDefifaTransfer(){window.native.preparations++;return window.native.prepared}
export async function verifyDefifaNftTransaction(){window.native.verifications++;if(window.native.verificationFails)throw Error('Canonical receipt unavailable')}
export async function restoreDefifaNftReceiptContext(){return {}}
`:args.path==='safe'?`export async function txHashForSafeTx(){return null}`:`export const ZERO_ADDRESS='0x'+'0'.repeat(40),NATIVE_TOKEN='0x000000000000000000000000000000000000EEEe';
export const getAccount=()=>window.native.account,getViewAs=()=>null,createPublicClientForChain=()=>({});
export async function connect(){};export const isAddr=value=>/^0x[0-9a-fA-F]{40}$/.test(value);
export const isSafeConnected=()=>false;export const formatAmount=(value,decimals)=>String(value)+' / 10^'+decimals;
export const erc20ApproveAbi=[{type:'function',name:'approve',stateMutability:'nonpayable',inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]}];
export const readErc20Allowance=async()=>0n;
export async function executeTransaction(options){window.native.execution=options;await options.onSending?.();window.native.executions++}
export async function waitForTrackedTransactionReceipt(){return {status:'success'}}
export function onEffectiveAccountChange(){return ()=>{}}
`}));
 }}]}).then(result=>result.outputFiles[0].text);return harness;
}
async function open(page,phase=1){
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route('**/native-actions-harness.js',async route=>route.fulfill({contentType:'text/javascript',body:await source()}));
 await page.goto('/index.html#learn');await page.addScriptTag({url:'/native-actions-harness.js',type:'module'});
 await page.evaluate(phase=>{const hook='0x2222222222222222222222222222222222222222',account='0x1111111111111111111111111111111111111111',inventory={protocol:'defifa',hook,implementation:hook,blockNumber:1n,phase,pricing:{currency:1,decimals:18,token:'0x000000000000000000000000000000000000EEEe'},tiers:[{id:1,name:'Blue Team',price:3n},{id:2,name:'Orange Team',price:5n}]};window.native={inventory,account,holdings:{hook,blockNumber:1n,totalOwned:1n,tokens:[{tokenId:901n,tierId:1}],complete:true,nextCursor:null},prepared:{inventory,transaction:{chainId:8453,address:hook,abi:[{type:'function',name:'pay',inputs:[],outputs:[],stateMutability:'payable'}],functionName:'pay',args:[],value:3n}},preparations:0,executions:0,verifications:0};window.showNativeActions()},phase);
}
test('native mint review exposes names, exact quantities and broader voting delegation before execution',async({page})=>{
 await open(page);await page.getByLabel(/Tier 1: Blue Team/).fill('1');await page.getByRole('button',{name:'Review NFT mint',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.native.executions)).toBe(1);
 expect(await page.evaluate(()=>window.native.execution.confirmNote)).toContain('ALL existing NFTs');
 expect(await page.evaluate(()=>window.native.execution.confirmSummary.rows)).toContainEqual(['Voting power recipient','0x1111111111111111111111111111111111111111']);
 await expect(page.locator('a[href*="metalog.money"]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.querySelector('.defifa-nft-actions').getBoundingClientRect().right<=innerWidth+1)).toBe(true);
});
test('zero-reclaim reward cashout keeps submitted verification recovery read-only',async({page})=>{
 await open(page,4);await page.getByLabel(/NFT 901/).check();await page.getByRole('button',{name:'Review NFT cash out',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.native.executions)).toBe(1);
 await page.evaluate(()=>{window.native.execution.onStatus('Submitted','pending',{hash:'0x'+'a'.repeat(64),trackingError:true})});
 await page.evaluate(()=>window.showNativeActions());
 await expect(page.getByRole('button',{name:'Check original transaction',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Review NFT cash out',exact:true})).toHaveCount(0);
 const before=await page.evaluate(()=>window.native.preparations);await page.getByRole('button',{name:'Check original transaction',exact:true}).click();
 await expect(page.getByText(/^Original NFT transaction 0x[a-f0-9]+ verified onchain\.$/)).toBeVisible();
 expect(await page.evaluate(()=>window.native.executions)).toBe(1);expect(await page.evaluate(()=>window.native.preparations)).toBe(before);
});
test('a hashless wallet outcome survives reload without offering another mint',async({page})=>{
 await open(page);await page.getByLabel(/Tier 1: Blue Team/).fill('1');await page.getByRole('button',{name:'Review NFT mint',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.native.executions)).toBe(1);
 await page.evaluate(()=>window.native.execution.onError('Wallet connection disappeared'));
 await expect(page.getByText(/Wallet submission outcome unknown/)).toBeVisible();
 await open(page);
 await expect(page.getByText(/Wallet submission outcome unknown/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Review NFT mint',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>window.native.executions)).toBe(0);expect(await page.evaluate(()=>window.native.preparations)).toBe(0);
 await expect(page.getByRole('button',{name:'Review NFT transfer',exact:true})).toBeVisible();
});
