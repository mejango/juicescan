import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData } from 'viem';

const mocks = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn() }));
vi.mock('../src/component-base.js', async (original) => ({ ...await original(),
  createPublicClientForChain: mocks.client, getAccount: () => null, getEffectiveAccount: () => null,
  getWalletClient: () => ({ sendTransaction: mocks.send, signTypedData: mocks.send }),
}));

import { verifyTokenEditDeployment, submitTokenEdit, prepareAccountingContextCalls, openAddAccountingContextModal } from '../src/discover.js';

const ALICE = '0x1111111111111111111111111111111111111111';
const TOKEN_A = '0x2222222222222222222222222222222222222222';
const TOKEN_B = '0x3333333333333333333333333333333333333333';
const ZERO = '0x0000000000000000000000000000000000000000';
const NATIVE = '0x000000000000000000000000000000000000EEEe';
const chains = [{ id: 1, name: 'Ethereum' }, { id: 10, name: 'Optimism' }];
const project = { id: 7, chainId: 1, idByChain: { 1: 7, 10: 93 }, chains, owner: ALICE };

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('token deployment state before multichain edits', () => {
  it('reads each destination’s project ID and accepts uniform deployed or credits-only states', async () => {
    const reader = vi.fn(async (cid) => cid === 1 ? TOKEN_A : TOKEN_B);
    const rows = await verifyTokenEditDeployment(project, chains, true, reader);
    expect(reader.mock.calls).toEqual([[1, 7n], [10, 93n]]);
    expect(rows.map((row) => row.token)).toEqual([TOKEN_A, TOKEN_B]);
    await expect(verifyTokenEditDeployment(project, chains, false, async () => ZERO)).resolves.toHaveLength(2);
  });

  it.each([true, false])('rejects mixed deployment state when the primary UI says deployed=%s', async (deployed) => {
    await expect(verifyTokenEditDeployment(project, chains, deployed, async (cid) => cid === 1 ? TOKEN_A : ZERO))
      .rejects.toThrow(/deployment differs.*Ethereum: ERC-20 deployed.*Optimism: credits only/);
  });

  it('rejects a stale uniform state instead of switching the reviewed action', async () => {
    await expect(verifyTokenEditDeployment(project, chains, false, async () => TOKEN_A)).rejects.toThrow(/deployment changed/);
    await expect(verifyTokenEditDeployment(project, chains, true, async () => ZERO)).rejects.toThrow(/deployment changed/);
  });

  it('does not interpret missing responses or RPC failures as an undeployed token', async () => {
    await expect(verifyTokenEditDeployment(project, chains, false, async () => null)).rejects.toThrow(/Invalid project token response/);
    await expect(verifyTokenEditDeployment(project, chains, false, async () => { throw new Error('RPC unavailable'); }))
      .rejects.toThrow(/Could not verify the project token/);
  });

  it('blocks the actual submit flow before controller or wallet calls on mixed state', async () => {
    const requests = [];
    mocks.client.mockImplementation((cid) => ({ readContract: async (request) => {
      requests.push({ cid, request });
      if (request.functionName !== 'tokenOf') throw new Error('Unexpected read after deployment guard');
      return cid === 1 ? TOKEN_A : ZERO;
    } }));
    await expect(submitTokenEdit(project, chains, ALICE, true, 'Token', 'TKN', vi.fn(), { close: vi.fn() }))
      .rejects.toThrow(/deployment differs/);
    expect(requests.map(({ request }) => request.functionName)).toEqual(['tokenOf', 'tokenOf']);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('accounting token decimals and destination encoding', () => {
  it('preserves each destination token address, local currency, and project ID in the reviewed calldata', async () => {
    const reader = vi.fn(async () => 6);
    const calls = await prepareAccountingContextCalls(project, chains, { 1: TOKEN_A, 10: TOKEN_B }, 6, reader);
    expect(reader.mock.calls).toEqual([[1, TOKEN_A], [10, TOKEN_B]]);
    for (const cid of [1, 10]) {
      const call = calls[cid];
      const decoded = decodeFunctionData({ abi: call.abi, data: call.data });
      const token = cid === 1 ? TOKEN_A : TOKEN_B;
      expect(decoded.functionName).toBe('addAccountingContextsFor');
      expect(decoded.args[0]).toBe(cid === 1 ? 7n : 93n);
      expect(decoded.args[1]).toEqual([{ token, decimals: 6, currency: Number(BigInt(token) & 0xffffffffn) }]);
    }
  });

  it('rejects a mixed-decimal selection before producing any calls', async () => {
    await expect(prepareAccountingContextCalls(project, chains, { 1: TOKEN_A, 10: TOKEN_B }, 6,
      async (cid) => cid === 1 ? 6 : 18)).rejects.toThrow(/Optimism uses 18 decimals.*specifies 6/);
  });

  it.each([NaN, 6.5, -1, 37])('rejects invalid submitted decimals %s before making reads', async (decimals) => {
    const reader = vi.fn();
    await expect(prepareAccountingContextCalls(project, chains, { 1: TOKEN_A, 10: TOKEN_B }, decimals, reader)).rejects.toThrow(/integer number of decimals/);
    expect(reader).not.toHaveBeenCalled();
  });

  it('does not substitute zero decimals on a malformed read or accept a failed read', async () => {
    await expect(prepareAccountingContextCalls(project, chains, { 1: TOKEN_A, 10: TOKEN_B }, 0, async () => null)).rejects.toThrow(/Could not verify token decimals/);
    await expect(prepareAccountingContextCalls(project, chains, { 1: TOKEN_A, 10: TOKEN_B }, 6, async () => { throw new Error('RPC unavailable'); })).rejects.toThrow(/Could not verify token decimals/);
  });

  it('enforces native ETH’s fixed decimals without probing an ERC-20 contract', async () => {
    const reader = vi.fn();
    const calls = await prepareAccountingContextCalls(project, chains, { 1: NATIVE, 10: NATIVE }, 18, reader);
    expect(calls[1].args[1][0].currency).toBe(61166);
    expect(reader).not.toHaveBeenCalled();
    await expect(prepareAccountingContextCalls(project, chains, { 1: NATIVE, 10: NATIVE }, 6, reader)).rejects.toThrow(/uses 18 decimals/);
  });

  it('keeps the reviewed addresses stable when the original input mapping changes during reads', async () => {
    const tokens = { 1: TOKEN_A, 10: TOKEN_B };
    const readers = [];
    const pending = prepareAccountingContextCalls(project, chains, tokens, 6, () => new Promise((resolve) => readers.push(resolve)));
    tokens[1] = TOKEN_B;
    readers.forEach((resolve) => resolve(6));
    const calls = await pending;
    expect(calls[1].args[1][0].token).toBe(TOKEN_A);
  });

  it('shows independent live decimals without letting the last chain response overwrite the shared input', async () => {
    const resolveDecimals = {};
    mocks.client.mockImplementation((cid) => ({ readContract: async (request) => {
      if (request.functionName === 'accountingContextsOf') return [];
      if (request.functionName === 'decimals') return new Promise((resolve) => { resolveDecimals[cid] = resolve; });
      throw new Error('Unexpected read: ' + request.functionName);
    } }));
    openAddAccountingContextModal(project);
    const inputs = [...document.querySelectorAll('.operator-chain-address-input')];
    const decimals = document.querySelector('input[type="number"]');
    inputs[0].value = TOKEN_A;
    inputs[1].value = TOKEN_B;
    inputs.forEach((input) => input.dispatchEvent(new Event('change')));
    resolveDecimals[10](18);
    resolveDecimals[1](6);
    await vi.waitFor(() => expect(document.body.textContent).toContain('Token decimals: 6'));
    expect(document.body.textContent).toContain('Token decimals: 18');
    expect(decimals.value).toBe('18');
  });
});
