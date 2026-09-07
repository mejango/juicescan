import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData } from 'viem';
import { prepareCreditClaims, verifyCreditClaims, verifySavedCreditClaims } from '../src/credit-claims.js';

const HOLDER = '0x1111111111111111111111111111111111111111';
const CONTROLLER = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const OTHER = '0x4444444444444444444444444444444444444444';
const ZERO = '0x0000000000000000000000000000000000000000';
const CHAINS = [{ id: 1, name: 'Ethereum' }, { id: 10, name: 'Optimism' }];
const live = (cid) => ({ controller: CONTROLLER, token: TOKEN, projectId: cid === 1 ? 7n : 93n, credit: cid === 1 ? 100n : 250n });

describe('selected-chain credit claim plans', () => {
  it('encodes every independent destination with its own live project ID and credit amount', async () => {
    const reader = vi.fn(async (cid) => live(cid));
    const plans = await prepareCreditClaims(CHAINS, HOLDER, reader);
    expect(reader.mock.calls).toEqual([[1, HOLDER], [10, HOLDER]]);
    expect(plans.map((plan) => plan.chainId)).toEqual([1, 10]);
    for (const plan of plans) {
      const decoded = decodeFunctionData({ abi: plan.abi, data: plan.data });
      expect(decoded.functionName).toBe('claimTokensFor');
      expect(decoded.args).toEqual([HOLDER, live(plan.chainId).projectId, live(plan.chainId).credit, HOLDER]);
      expect(plan.to).toBe(CONTROLLER);
      expect(plan.expectedState.token).toBe(TOKEN);
    }
  });

  it('reads and prepares only the explicitly selected chain', async () => {
    const reader = vi.fn(async (cid) => live(cid));
    const plans = await prepareCreditClaims([CHAINS[1]], HOLDER, reader);
    expect(reader.mock.calls).toEqual([[10, HOLDER]]);
    expect(plans).toHaveLength(1);
  });

  it('rejects duplicate or empty selections before reading chain state', async () => {
    const reader = vi.fn();
    await expect(prepareCreditClaims([], HOLDER, reader)).rejects.toThrow(/Select at least one chain/);
    await expect(prepareCreditClaims([CHAINS[0], CHAINS[0]], HOLDER, reader)).rejects.toThrow(/only once/);
    expect(reader).not.toHaveBeenCalled();
  });

  it.each([
    [{ token: ZERO }, /ERC-20 is not deployed/],
    [{ controller: ZERO }, /project controller/],
    [{ credit: null }, /Could not verify/],
    [{ credit: 0n }, /No unclaimed credits remain/],
    [{ credit: -1n }, /Invalid project ID/],
  ])('fails the whole requested selection instead of dropping an unavailable destination (case %#)', async (change, message) => {
    await expect(prepareCreditClaims(CHAINS, HOLDER, async (cid) => ({ ...live(cid), ...(cid === 10 ? change : {}) }))).rejects.toThrow(message);
  });

  it('does not convert an RPC error into a zero balance or reduced chain set', async () => {
    await expect(prepareCreditClaims(CHAINS, HOLDER, async (cid) => {
      if (cid === 10) throw new Error('RPC unavailable');
      return live(cid);
    })).rejects.toThrow(/RPC unavailable/);
  });
});

describe('credit claim freshness and saved-call recovery', () => {
  it('keeps the exact reviewed amount when credits increase', async () => {
    const plans = await prepareCreditClaims(CHAINS, HOLDER, async (cid) => live(cid));
    const calldata = plans.map((plan) => plan.data);
    await verifyCreditClaims(plans, async (cid) => ({ ...live(cid), credit: 500n }));
    expect(plans.map((plan) => plan.data)).toEqual(calldata);
    expect(plans.map((plan) => plan.tokenCount)).toEqual([100n, 250n]);
  });

  it.each([
    [{ controller: OTHER }, /controller, or token changed/],
    [{ token: OTHER }, /controller, or token changed/],
    [{ projectId: 999n }, /controller, or token changed/],
    [{ credit: 1n }, /unclaimed balance decreased/],
  ])('blocks changed destination state before a new send (case %#)', async (change, message) => {
    const plans = await prepareCreditClaims(CHAINS, HOLDER, async (cid) => live(cid));
    await expect(verifyCreditClaims(plans, async (cid) => ({ ...live(cid), ...(cid === 10 ? change : {}) }))).rejects.toThrow(message);
  });

  it('rechecks only the next destination during sequential execution after an earlier claim consumed its credits', async () => {
    const plans = await prepareCreditClaims(CHAINS, HOLDER, async (cid) => live(cid));
    const reader = vi.fn(async (cid) => ({ ...live(cid), credit: cid === 1 ? 0n : 250n }));
    await verifyCreditClaims(plans, reader, 10);
    expect(reader.mock.calls).toEqual([[10, HOLDER]]);
    await expect(verifyCreditClaims(plans, reader)).rejects.toThrow(/balance decreased on Ethereum/);
  });

  it('reconstructs the original checks after a reload from saved calldata and token metadata', async () => {
    const plans = await prepareCreditClaims(CHAINS, HOLDER, async (cid) => live(cid));
    const savedCalls = plans.map(({ chainId, name, to, data, args, expectedState }) => ({ chainId, name, to, data, args, expectedState }));
    await verifySavedCreditClaims(savedCalls, async (cid) => live(cid));
    await expect(verifySavedCreditClaims(savedCalls, async (cid) => ({ ...live(cid), token: OTHER }))).rejects.toThrow(/token changed/);
  });

  it('blocks legacy/unbound saved token metadata or arguments that disagree with the saved calldata', async () => {
    const plans = await prepareCreditClaims(CHAINS, HOLDER, async (cid) => live(cid));
    await expect(verifySavedCreditClaims([{ ...plans[0], expectedState: {} }], async (cid) => live(cid))).rejects.toThrow(/original holder, beneficiary, or token snapshot/);
    await expect(verifySavedCreditClaims([{ ...plans[0], args: [HOLDER, 7n, 1n, HOLDER] }], async (cid) => live(cid))).rejects.toThrow(/calldata does not match/);
  });
});
