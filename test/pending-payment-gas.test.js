import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData } from 'viem';
import deployment from '../data/abis/JBRouterTerminalGateway.json';
import * as deployments from '../src/abi-registry.js';
import { isPendingPaymentTransaction, pendingPaymentTransactionGasCap } from '../src/pending-payment-gas.js';

const GATEWAY = deployments.getAddress('JBRouterTerminalGateway', 1);
const OTHER = '0x1111111111111111111111111111111111111111';
const ORIGINAL = { amount: 100n, preferAddToBalance: false, shouldReturnHeldFees: false, beneficiary: OTHER,
  projectId: 1n, refundTo: OTHER, sourceProjectId: 7n, token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' };
const ID = '0x' + '1'.padStart(64, '0');
const METADATA = '0x' + '7'.padStart(64, '0');
function transaction(functionName = 'processPendingCall', changes = {}) {
  const args = [ID, ORIGINAL, 'Original memo', METADATA];
  return { to: GATEWAY, operation: 0, value: '0', data: encodeFunctionData({ abi: deployment.abi, functionName, args }), ...changes };
}
function encode(args) { return encodeFunctionData({ abi: deployment.abi, functionName: 'processPendingCall', args }); }
afterEach(() => vi.restoreAllMocks());

describe('narrow pending payment gas exception', () => {
  it.each(['processPendingCall', 'finalizePendingCall'])('recognizes the deployed %s selector and canonical original payload', name => {
    expect(isPendingPaymentTransaction(1, transaction(name))).toBe(true);
  });

  it('recognizes historical gateway records on their own chain', () => {
    const original = deployments.getAddress;
    vi.spyOn(deployments, 'getAddress').mockImplementation((name, chainId) => name === 'JBRouterTerminalGateway_deprecated' && Number(chainId) === 1 ? OTHER : original(name, chainId));
    expect(isPendingPaymentTransaction(1, transaction('processPendingCall', { to: OTHER }))).toBe(true);
    expect(isPendingPaymentTransaction(10, transaction('processPendingCall', { to: OTHER }))).toBe(false);
  });

  it.each([
    { to: OTHER }, { value: '1' }, { value: '-1' }, { operation: 1 }, { operation: 'invalid' },
    { data: '0x1234' }, { data: '0xxyz' }, { data: '0x' + '00'.repeat(6000) },
  ])('retains the ordinary gas boundary for an unrelated or malformed transaction', changes => {
    expect(isPendingPaymentTransaction(1, transaction('processPendingCall', changes))).toBe(false);
  });

  it('rejects an unknown chain, a different gateway method and trailing calldata', () => {
    expect(isPendingPaymentTransaction(12345, transaction())).toBe(false);
    expect(isPendingPaymentTransaction(1, transaction('processPendingCall', { data: encodeFunctionData({ abi: deployment.abi, functionName: 'pendingCallCommitmentOf', args: [ID] }) }))).toBe(false);
    expect(isPendingPaymentTransaction(1, { ...transaction(), data: transaction().data + '00' })).toBe(false);
  });

  it.each([
    ['zero identifier', ['0x' + '0'.repeat(64), ORIGINAL, '', METADATA]],
    ['zero amount', [ID, { ...ORIGINAL, amount: 0n }, '', METADATA]],
    ['missing source', [ID, { ...ORIGINAL, sourceProjectId: 0n }, '', METADATA]],
    ['different metadata source', [ID, ORIGINAL, '', '0x' + '8'.padStart(64, '0')]],
    ['short metadata', [ID, ORIGINAL, '', '0x1234']],
    ['memo beyond retention bound', [ID, ORIGINAL, 'x'.repeat(4097), METADATA]],
    ['oversized project identifier', [ID, { ...ORIGINAL, sourceProjectId: 1n << 64n }, '', '0x' + (1n << 64n).toString(16).padStart(64, '0')]],
  ])('rejects %s', (_label, args) => {
    expect(isPendingPaymentTransaction(1, transaction('processPendingCall', { data: encode(args) }))).toBe(false);
  });

  it('permits the maximum retained memo and original add-to-balance flags', () => {
    const args = [ID, { ...ORIGINAL, preferAddToBalance: true, shouldReturnHeldFees: true }, 'x'.repeat(4096), METADATA];
    expect(isPendingPaymentTransaction(1, transaction('processPendingCall', { data: encode(args) }))).toBe(true);
  });

  it('does not query an RPC for ordinary calls', async () => {
    const client = { getBlock: vi.fn() };
    await expect(pendingPaymentTransactionGasCap(1, transaction('processPendingCall', { to: OTHER }), client)).resolves.toBeNull();
    expect(client.getBlock).not.toHaveBeenCalled();
  });

  it.each([[60000000n, 16777216n], [12000000n, 12000000n]])('bounds a live block limit of %s at %s', async (gasLimit, expected) => {
    const client = { chain: { id: 1 }, getBlock: vi.fn(async () => ({ gasLimit })) };
    await expect(pendingPaymentTransactionGasCap(1, transaction(), client)).resolves.toBe(expected);
    expect(client.getBlock).toHaveBeenCalledWith({ blockTag: 'latest' });
  });

  it.each([undefined, null, '', -1n, 1500000n, 1.5, 'broken'])('fails closed on an unusable live gas limit %s', async gasLimit => {
    await expect(pendingPaymentTransactionGasCap(1, transaction(), { getBlock: async () => ({ gasLimit }) })).rejects.toThrow();
  });

  it('refuses a client on another chain', async () => {
    await expect(pendingPaymentTransactionGasCap(1, transaction(), { chain: { id: 10 }, getBlock: vi.fn() })).rejects.toThrow('wrong chain');
  });
});
