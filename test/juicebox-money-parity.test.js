// Rules Juicescan shares with juicebox.money. Each must give the same result in both clients.
import { describe, it, expect } from 'vitest';
import { cashOutTaxValue, omnichainTokenSalt } from '../src/encoding.js';
import { keccak256, toHex } from 'viem';
import { chainList } from '../src/chain.js';
import { applyRevnetTaxDefault, createStage, launchOutcomeText, launchStartLead, ownerFieldInvalid, startLeadIssue, shopItemIssue, tickerOk } from '../src/create-flow.js';

describe('cash out tax value', () => {
  it('reads a rate out of 10,000 as the 0 to 1 value', () => {
    expect(cashOutTaxValue(1000)).toBe('0.1');
    expect(cashOutTaxValue(9999)).toBe('0.9999');
    expect(cashOutTaxValue(0)).toBe('0');
    expect(cashOutTaxValue(10000n)).toBe('1');
  });
});

describe('chain order', () => {
  it('lists Ethereum, Base, Arbitrum, Optimism, then their testnets in the same order', () => {
    expect(chainList().map(c => Number(c.id))).toEqual([1, 8453, 42161, 10, 11155111, 84532, 421614, 11155420]);
  });
});

describe('ERC-20 deploy salt', () => {
  it('is keccak256("jb-erc20:<name>:<symbol>") with both trimmed, as juicebox.money derives it', () => {
    expect(omnichainTokenSalt(' My Token ', 'MTK ')).toBe(keccak256(toHex('jb-erc20:My Token:MTK')));
  });
});

describe('revnet default cash out tax', () => {
  it('starts a revnet at 0.1 once, and leaves a later "No tax" choice alone', () => {
    const state = { projectType: 'revnet', stages: [createStage()] };
    applyRevnetTaxDefault(state);
    expect(state.stages[0].cashOutTaxRate).toBe(10); // percent, 0.1
    state.stages[0].cashOutTaxRate = 0;
    applyRevnetTaxDefault(state);
    expect(state.stages[0].cashOutTaxRate).toBe(0);
  });
  it('leaves a custom project at its own default', () => {
    const state = { projectType: 'custom', stages: [createStage()] };
    applyRevnetTaxDefault(state);
    expect(state.stages[0].cashOutTaxRate).toBe(0);
  });
});

describe('reverted versus unread', () => {
  it('only a proven revert counts as the contract refusing', async () => {
    const { contractReverted } = await import('../src/encoding.js');
    const { ContractFunctionRevertedError, ContractFunctionExecutionError, HttpRequestError } = await import('viem');
    const abi = [{ type: 'function', name: 'f', inputs: [], outputs: [], stateMutability: 'view' }];
    const revert = new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi, functionName: 'f' }), { abi, functionName: 'f' });
    const transport = new ContractFunctionExecutionError(new HttpRequestError({ url: 'http://rpc.invalid' }), { abi, functionName: 'f' });
    expect(contractReverted(revert)).toBe(true);
    expect(contractReverted(transport)).toBe(false);
    expect(contractReverted(new Error('timeout'))).toBe(false);
  });
});

describe('.jb drafts from juicebox.money', () => {
  it('names the other site instead of reporting no draft', async () => {
    const { parseCreateDraftJson } = await import('../src/create-flow.js');
    expect(() => parseCreateDraftJson(JSON.stringify({ v: 1, flavor: 'revnet', name: 'X', chains: [1], stages: [{}] })))
      .toThrow('This draft was saved on juicebox.money. Open it there.');
    expect(() => parseCreateDraftJson('{"a":1}')).toThrow('No Juicebox V6 .jb draft was found');
  });
});

describe('shop credit flag', () => {
  it('counts a tier with unread flags as not buyable with credits', async () => {
    const { creditRestrictedTotal } = await import('../src/discover.js');
    const tiers = {
      1: { price: 100n, discountPercent: 0, flags: { cantBuyWithCredits: false } },
      2: { price: 200n, discountPercent: 0, flags: { cantBuyWithCredits: true } },
      3: { price: 400n, discountPercent: 0 },
    };
    expect(creditRestrictedTotal({ 1: 1, 2: 1, 3: 2 }, id => tiers[id])).toBe(1000n);
  });
});

describe('launch owner and operator fields', () => {
  it('accepts an empty field, which means the connected wallet', () => {
    expect(ownerFieldInvalid('', '')).toBe(false);
    expect(ownerFieldInvalid('  ', '')).toBe(false);
  });
  it('blocks typed text that did not resolve to an address', () => {
    expect(ownerFieldInvalid('nobody.eth', 'nobody.eth')).toBe(true);
    expect(ownerFieldInvalid('vitalik.eth', '0x' + '1'.repeat(40))).toBe(false);
  });
});

describe('launch outcome panel', () => {
  it('never calls a Safe proposal live', () => {
    const text = launchOutcomeText({ details: { name: 'Zed' }, deployed: { chainId: 1, txHash: null, proposed: true } }, false, 'Ethereum');
    expect(text.title).toBe('Zed is proposed to your Safe');
    expect(text.sub).toMatch(/Nothing is launched yet/);
  });
  it('says live once a transaction confirmed', () => {
    expect(launchOutcomeText({ details: { name: 'Zed' }, deployed: { chainId: 1, txHash: '0x1' } }, true, 'Ethereum')).toEqual({ title: 'Zed is live', sub: 'Revnet deployed on Ethereum.' });
  });
});

describe('launch form gates shared with juicebox.money', () => {
  it('takes a ticker of 1 to 11 capital letters or digits only', () => {
    expect(tickerOk('JBX')).toBe(true);
    expect(tickerOk('A1B2C3D4E5F')).toBe(true);
    expect(tickerOk('')).toBe(false);
    expect(tickerOk('$JBX')).toBe(false);
    expect(tickerOk('TWELVECHARSX')).toBe(false);
  });
  it('blocks a shop item with no name or no price', () => {
    expect(shopItemIssue({ nfts: [{ name: 'Hat', price: '0.1' }] })).toBe('');
    expect(shopItemIssue({ nfts: [{ name: '', price: '0.1' }] })).toBe('Complete or remove unfinished shop items.');
    expect(shopItemIssue({ nfts: [{ name: 'Hat', price: '0' }] })).toBe('Complete or remove unfinished shop items.');
    expect(shopItemIssue({ shopEnabled: false, nfts: [{ name: '', price: '' }] })).toBe('');
  });
});

describe('launch start timing shared with juicebox.money', () => {
  it('gives several rulesets behind a notice an hour, everything else ten minutes', () => {
    const one = { projectType: 'custom', stages: [{ deadline: '1day', durationSeconds: 86400 }] };
    const two = { projectType: 'custom', stages: [{ deadline: '1day', durationSeconds: 86400 }, { deadline: '1day', durationSeconds: 86400 }] };
    const noNotice = { projectType: 'custom', stages: [{ deadline: 'none', durationSeconds: 86400 }, { deadline: 'none', durationSeconds: 86400 }] };
    expect(launchStartLead(one, 1)).toBe(600);
    expect(launchStartLead(two, 1)).toBe(3600);
    expect(launchStartLead(noNotice, 1)).toBe(600);
    expect(launchStartLead(Object.assign({}, two, { projectType: 'revnet' }), 1)).toBe(600);
  });
  it('blocks a picked start less than an hour out', () => {
    expect(startLeadIssue({ projectType: 'custom', stages: [{ schedule: 1000 + 3599 }] }, 1000)).toBe('Ruleset #1 needs a start at least an hour from now.');
    expect(startLeadIssue({ projectType: 'revnet', stages: [{ schedule: 1000 + 60 }] }, 1000)).toBe('Stage #1 needs a start at least an hour from now.');
    expect(startLeadIssue({ projectType: 'custom', stages: [{ schedule: 1000 + 3600 }] }, 1000)).toBe('');
    expect(startLeadIssue({ projectType: 'custom', stages: [{ schedule: '' }] }, 1000)).toBe('');
  });
});
