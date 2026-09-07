import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData } from 'viem';

const state = vi.hoisted(() => ({ wallet: null, client: null,
  account: '0x1111111111111111111111111111111111111111',
  forwarder: '0x2222222222222222222222222222222222222222' }));
vi.mock('../src/component-base.js', () => ({
  getWalletClient: () => state.wallet, getAccount: () => state.account,
  createPublicClientForChain: () => state.client, getAddress: () => state.forwarder,
  switchChain: vi.fn(), getViewAs: () => null, VIEW_AS_TX_ERROR: 'View as is read-only.',
  waitForTrackedTransactionReceipt: vi.fn(), confirmTransactionModal: vi.fn(),
}));
import { buildForwardedTx, relayrSupportsForwarding } from '../src/relayr.js';

const TARGET = '0x3333333333333333333333333333333333333333';
const DATA = '0x12345678';
let trusted, domain;

describe('Relayr preserves the original wallet identity', () => {
  beforeEach(() => {
    trusted = true;
    domain = ['0x0f', 'ERC2771Forwarder', '1', 8453n, state.forwarder, '0x' + '00'.repeat(32), []];
    state.wallet = { getChainId: vi.fn(async () => 8453), signTypedData: vi.fn(async () => '0x' + 'ab'.repeat(65)) };
    state.client = { readContract: vi.fn(async ({ functionName }) => {
      if (functionName === 'isTrustedForwarder') return trusted;
      if (functionName === 'eip712Domain') return domain;
      if (functionName === 'nonces') return 7n;
      throw new Error('Unexpected read');
    }), estimateGas: vi.fn(async () => 350000n) };
  });

  it('estimates the exact forwarded identity and signs the live nonce, chain, calldata, and value', async () => {
    const tx = await buildForwardedTx(8453, state.account, TARGET, DATA, 400000n, 123n);
    expect(state.client.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: TARGET, functionName: 'isTrustedForwarder', args: [state.forwarder],
    }));
    expect(state.client.estimateGas).toHaveBeenCalledWith({
      account: state.forwarder, to: TARGET, data: DATA + state.account.slice(2), value: 123n,
    });
    expect(state.wallet.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      domain: { name: 'ERC2771Forwarder', version: '1', chainId: 8453n, verifyingContract: state.forwarder },
      message: expect.objectContaining({ from: state.account, to: TARGET, nonce: 7n, data: DATA, gas: 700000n, value: 123n }),
    }));
    expect(tx).toMatchObject({ chain: 8453, target: state.forwarder, value: '123' });
    const abi = state.client.readContract.mock.calls.find(([request]) => request.functionName === 'nonces')[0].abi;
    const decoded = decodeFunctionData({ abi, data: tx.data });
    expect(decoded.functionName).toBe('execute');
    expect(decoded.args[0]).toMatchObject({ from: state.account, to: TARGET, data: DATA, value: 123n, gas: 700000n });
  });

  it.each([false, undefined, 'true'])('does not sign for a recipient returning %s instead of trusted=true', async value => {
    trusted = value;
    await expect(buildForwardedTx(8453, state.account, TARGET, DATA)).rejects.toThrow(/does not support the trusted forwarder/);
    expect(state.wallet.signTypedData).not.toHaveBeenCalled();
    expect(state.wallet.getChainId).not.toHaveBeenCalled();
  });

  it('does not sign when the recipient trust read fails', async () => {
    state.client.readContract.mockRejectedValue(new Error('No such function'));
    await expect(buildForwardedTx(8453, state.account, TARGET, DATA)).rejects.toThrow(/direct wallet transaction/);
    expect(state.wallet.signTypedData).not.toHaveBeenCalled();
  });

  it('routes only supported recipients that affirm the deployed forwarder', async () => {
    await expect(relayrSupportsForwarding(8453, TARGET)).resolves.toBe(true);
    trusted = false;
    await expect(relayrSupportsForwarding(8453, TARGET)).resolves.toBe(false);
    state.client.readContract.mockRejectedValue(new Error('Unavailable'));
    await expect(relayrSupportsForwarding(8453, TARGET)).resolves.toBe(false);
    state.client.readContract.mockClear();
    await expect(relayrSupportsForwarding(137, TARGET)).resolves.toBe(false);
    expect(state.client.readContract).not.toHaveBeenCalled();
  });

  it.each([11155111, 11155420, 84532, 421614])('signs a supported testnet %s using its exact live domain and trusted forwarder', async chainId => {
    domain[3] = BigInt(chainId);
    state.wallet.getChainId.mockResolvedValue(chainId);
    await expect(relayrSupportsForwarding(chainId, TARGET)).resolves.toBe(true);
    const tx = await buildForwardedTx(chainId, state.account, TARGET, DATA, 400000n, 123n);
    expect(tx).toMatchObject({ chain: chainId, target: state.forwarder, value: '123' });
    expect(state.wallet.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      domain: expect.objectContaining({ chainId: BigInt(chainId), verifyingContract: state.forwarder }),
      message: expect.objectContaining({ from: state.account, to: TARGET, nonce: 7n, data: DATA, value: 123n }),
    }));
    domain[3] = 1n;
    await expect(buildForwardedTx(chainId, state.account, TARGET, DATA)).rejects.toThrow(/domain does not match/);
    expect(state.wallet.signTypedData).toHaveBeenCalledTimes(1);
  });

  it.each([137, 0, NaN, 8453.5])('rejects unsupported destination %s before any wallet or RPC request', async chainId => {
    await expect(buildForwardedTx(chainId, state.account, TARGET, DATA)).rejects.toThrow(/does not support this destination/);
    expect(state.client.readContract).not.toHaveBeenCalled();
    expect(state.wallet.signTypedData).not.toHaveBeenCalled();
    expect(state.wallet.getChainId).not.toHaveBeenCalled();
  });

  it.each([
    [0, '0x1f'], [3, 10n], [4, TARGET], [6, [1n]],
  ])('rejects an unsupported or mismatched domain field %s', async (field, value) => {
    domain[field] = value;
    await expect(buildForwardedTx(8453, state.account, TARGET, DATA)).rejects.toThrow(/domain does not match/);
    expect(state.wallet.signTypedData).not.toHaveBeenCalled();
  });
});
