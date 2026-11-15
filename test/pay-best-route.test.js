// The pay route choice: the web clients' rule (SDK prepareBestUserPay with simulateFrom), ported by hand.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseError, ContractFunctionRevertedError, createPublicClient, custom } from 'viem';

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('../src/component-base.js', async (original) => ({ ...await original(), createPublicClientForChain: mocks.client }));

import { bestPayRoute, pickPayRoute } from '../src/pay-preview.js';
import { isExecutionRevert, runUserPay } from '../src/pay-prepare.js';

const NATIVE = '0x000000000000000000000000000000000000EEEe';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PAYER = '0x2222222222222222222222222222222222222222';
const DIRECT = '0x00000000000000000000000000000000000000d1';
const ROUTER = '0x00000000000000000000000000000000000000d2';
const route = (address, received, viaRouter, more) => ({ address, viaRouter, preview: Object.assign({ received, reserved: 0n, minReturnedTokens: received, metadata: '0x' }, more) });
const payment = (more) => Object.assign({ chainId: 8453, projectId: 6, token: NATIVE, amount: 10n ** 18n, beneficiary: PAYER, payer: PAYER }, more);
const reverted = () => new BaseError('call failed', { cause: new ContractFunctionRevertedError({ abi: [], data: '0x', functionName: 'pay' }) });
/** What running each terminal's payment returns; an Error is thrown. */
const runs = (byTerminal) => {
  const simulateContract = vi.fn(async ({ address }) => {
    const run = byTerminal[address];
    if (run instanceof Error) throw run;
    return { result: run };
  });
  mocks.client.mockReturnValue({ simulateContract });
  return simulateContract;
};

beforeEach(() => { vi.clearAllMocks(); });

describe('the route among quoted ones', () => {
  const direct = route(DIRECT, 100n, false), router = route(ROUTER, 120n, true);

  it('follows the previews when nothing was run', () => {
    expect(pickPayRoute([direct, router], null)).toBe(router);
    expect(pickPayRoute([router, route(DIRECT, 120n, false)], null).address).toBe(DIRECT);
  });

  it('follows what each payment delivers when every route left ran', () => {
    expect(pickPayRoute([direct, router], new Map([[direct, 100n], [router, 90n]]))).toBe(direct);
    expect(pickPayRoute([direct, router], new Map([[direct, 100n], [router, 100n]]))).toBe(router); // a tie falls to the previews
  });

  it('drops a reverting route while another is left, and keeps the previews when one could not be run', () => {
    expect(pickPayRoute([direct, router], new Map([[direct, 100n], [router, 'reverted']]))).toBe(direct);
    expect(pickPayRoute([direct, router], new Map([[direct, null], [router, 'reverted']]))).toBe(direct);
    expect(pickPayRoute([direct, router], new Map([[direct, 100n], [router, null]]))).toBe(router);
    expect(pickPayRoute([direct, router], new Map([[direct, 'reverted'], [router, 'reverted']]))).toBe(router);
  });

  it('keeps the first unavailable route, with its reason, when none can be paid', () => {
    const first = { address: DIRECT, preview: { unavailable: true, reason: 'why' } };
    expect(pickPayRoute([first, { address: ROUTER, preview: { unavailable: true } }], null)).toBe(first);
  });
});

describe('running the routes', () => {
  it('runs each payable native-token route as the payer, with the amount lent to the call', async () => {
    const simulate = runs({ [DIRECT]: 100n, [ROUTER]: 90n });
    const direct = route(DIRECT, 100n, false), router = route(ROUTER, 120n, true, { metadata: '0xabcd', minReturnedTokens: 97n });
    expect(await bestPayRoute([direct, router], payment())).toBe(direct);
    expect(mocks.client).toHaveBeenCalledWith(8453);
    expect(simulate.mock.calls[1][0]).toMatchObject({
      address: ROUTER, functionName: 'pay', account: PAYER, value: 10n ** 18n,
      args: [6n, NATIVE, 10n ** 18n, PAYER, 97n, '', '0xabcd'],
      stateOverride: [{ address: PAYER, balance: 3n * 10n ** 18n }],
    });
  });

  it('runs nothing for an ERC-20 payment, without a payer, or with one payable route', async () => {
    const simulate = runs({});
    const direct = route(DIRECT, 100n, false), router = route(ROUTER, 120n, true);
    expect(await bestPayRoute([direct, router], payment({ token: USDC }))).toBe(router);
    expect(await bestPayRoute([direct, router], payment({ payer: undefined }))).toBe(router);
    expect(await bestPayRoute([direct, { address: ROUTER, preview: { unavailable: true } }], payment())).toBe(direct);
    expect(simulate).not.toHaveBeenCalled();
  });

  it('reads the project card’s routes, which carry their terminal on the preview', async () => {
    const simulate = runs({ [DIRECT]: 100n, [ROUTER]: reverted() });
    const direct = { viaRouter: false, preview: { received: 100n, reserved: 0n, minReturnedTokens: 100n, metadata: '0x', terminal: DIRECT } };
    const router = { viaRouter: true, preview: { received: 120n, reserved: 0n, minReturnedTokens: 120n, metadata: '0x', terminal: ROUTER } };
    expect(await bestPayRoute([direct, router], payment())).toBe(direct);
    expect(simulate).toHaveBeenCalledTimes(2);
  });
});

describe('a run’s outcome', () => {
  const args = { chainId: 8453, terminal: DIRECT, projectId: 6n, token: NATIVE, amount: 1n, beneficiary: PAYER };

  it('is the token count, reverted, or unknown', async () => {
    expect(await runUserPay({ simulateContract: async () => ({ result: 5n }) }, args, PAYER)).toBe(5n);
    expect(await runUserPay({ simulateContract: async () => { throw reverted(); } }, args, PAYER)).toBe('reverted');
    expect(await runUserPay({ simulateContract: async () => { throw new Error('no overrides'); } }, args, PAYER)).toBe(null);
    expect(await runUserPay({ simulateContract: async () => ({ result: undefined }) }, args, PAYER)).toBe(null);
  });

  it('reads each node’s way of reporting a revert through viem’s own error handling, and never a node failure', async () => {
    const worded = (rpcError) => createPublicClient({ transport: custom({ request: async () => { throw Object.assign(new Error(rpcError.message), rpcError); } }) })
      .simulateContract({ address: DIRECT, abi: [{ type: 'function', name: 'pay', inputs: [], outputs: [], stateMutability: 'payable' }], functionName: 'pay' })
      .then(() => null, (error) => error);
    for (const rpcError of [{ code: 3, message: 'execution reverted', data: '0x' }, { code: 3, message: 'execution reverted' },
      { code: -32000, message: 'execution reverted', data: '0x' }, { code: -32000, message: 'execution reverted: sold out' }]) {
      expect(isExecutionRevert(await worded(rpcError)), JSON.stringify(rpcError)).toBe(true);
    }
    for (const rpcError of [{ code: -32603, message: 'Internal error' }, { code: -32005, message: 'rate limited' }, { code: -32000, message: 'header not found' }]) {
      expect(isExecutionRevert(await worded(rpcError)), JSON.stringify(rpcError)).toBe(false);
    }
    expect(isExecutionRevert(new Error('plain'))).toBe(false);
  });
});
