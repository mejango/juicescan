import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData } from 'viem';

const mocks = vi.hoisted(() => ({
  account: '0x1111111111111111111111111111111111111111',
  execute: vi.fn(), simulate: vi.fn(), review: vi.fn(), client: vi.fn(), safe: vi.fn(),
  resumeQuote: vi.fn(), paymentOptions: vi.fn(), postBundle: vi.fn(),
  forward: vi.fn(),
}));
vi.mock('../src/component-base.js', async (original) => ({
  ...await original(),
  getAccount: () => mocks.account,
  executeTransaction: mocks.execute,
  simulateTransaction: mocks.simulate,
  confirmTransactionModal: mocks.review,
  createPublicClientForChain: mocks.client,
}));
vi.mock('../src/wallet.js', async (original) => ({ ...await original(), isSafeConnected: mocks.safe }));
vi.mock('../src/ipfs-pin.js', async (original) => ({ ...await original(), hasPinata: () => false }));
vi.mock('../src/relayr.js', async (original) => ({ ...await original(),
  relayrResumeQuotedBundle: mocks.resumeQuote, relayrPaymentOptions: mocks.paymentOptions, relayrPostBundle: mocks.postBundle,
  buildForwardedTx: mocks.forward,
}));

import { __test } from '../src/create-flow.js';

const ALICE = '0x1111111111111111111111111111111111111111';
const TARGET = '0x2222222222222222222222222222222222222222';
const HASH1 = '0x' + 'a'.repeat(64);
const HASH2 = '0x' + 'b'.repeat(64);
const KEY = 'jb-create-direct-launch';
const abi = [{ type: 'function', name: 'launchProjectFor', stateMutability: 'payable',
  inputs: [{ name: 'start', type: 'uint48' }], outputs: [] }];

function plans() {
  return [11155111, 84532].map((chainId) => ({
    chainId, address: TARGET, abi, args: [1999999999n], value: 7n, status: 'ready', hash: null,
  }));
}
function state() {
  return Object.assign(__test.initState(), { _push: vi.fn(), chainIds: [11155111, 84532] });
}
function clientFor(session, overrides = {}) {
  return (chainId) => {
    const plan = session.plans.find((p) => p.chainId === chainId);
    return {
      getTransactionReceipt: vi.fn(async ({ hash }) => ({ transactionHash: hash, status: 'success', logs: [] })),
      getTransaction: vi.fn(async () => ({
        from: ALICE, to: plan.address, chainId, input: encodeFunctionData({ abi: plan.abi, functionName: 'launchProjectFor', args: plan.args }), value: plan.value,
      })),
      ...overrides,
    };
  };
}
function confirmSend(opts, hash) {
  opts.onStatus('Submitted', 'pending', { hash, phase: 'submitted', chainId: opts.chainId });
  opts.onSuccess('Confirmed', { hash, phase: 'confirmed' });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  __test.clearCreateDirectSession({});
  mocks.account = ALICE;
  mocks.safe.mockReturnValue(false);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_, options, callback) => callback({ name: KEY })) } });
  mocks.review.mockResolvedValue(true);
  mocks.simulate.mockResolvedValue({});
  mocks.resumeQuote.mockReturnValue(null);
  mocks.paymentOptions.mockImplementation((quote) => quote.payment_info);
  mocks.forward.mockImplementation(async (chain, from, target, data, gas, value) => ({ chain, target, data, value: String(value) }));
});

describe('direct multichain creation recovery', () => {
  it('keeps mixed-network creation direct and preserves the shared launch start', async () => {
    const draft = state();
    draft.chainIds = [11155111, 8453];
    draft.projectType = 'custom';
    draft.details.name = 'Testnet launch';
    draft.details.owner = ALICE;
    const sent = new Map();
    mocks.client.mockImplementation((chainId) => ({
      readContract: vi.fn(async () => 7n),
      getTransactionReceipt: vi.fn(async ({ hash }) => ({ transactionHash: hash, status: 'success', logs: [] })),
      getTransaction: vi.fn(async () => {
        const opts = sent.get(chainId);
        return { from: ALICE, to: opts.address, value: opts.value, input: encodeFunctionData({ abi: opts.abi, functionName: opts.functionName, args: opts.args }) };
      }),
    }));
    mocks.execute.mockImplementation((opts) => { sent.set(opts.chainId, opts); confirmSend(opts, opts.chainId === 11155111 ? HASH1 : HASH2); });
    await __test.runDeploy(draft, ALICE);
    expect(mocks.execute.mock.calls.map(([opts]) => opts.chainId)).toEqual([11155111, 8453]);
    expect(mocks.review.mock.calls[0][1].title).toBe('Review the transactions');
    expect(mocks.review.mock.calls[0][1].note).toContain('in sequence');
    const [first, second] = mocks.execute.mock.calls.map(([opts]) => opts);
    expect(first.args[3][0].mustStartAtOrAfter).toBe(second.args[3][0].mustStartAtOrAfter);
    expect(mocks.forward).not.toHaveBeenCalled();
    expect(mocks.postBundle).not.toHaveBeenCalled();
  });

  it('restores an old direct testnet launch before expanded Relayr eligibility or changed form values', async () => {
    const original = state(), session = { account: ALICE, plans: plans() };
    session.plans[0].hash = HASH1; session.plans[0].status = 'confirmed';
    __test.saveCreateDirectSession(original, session);
    const stored = localStorage.getItem(KEY);
    __test.clearCreateDirectSession(original);
    localStorage.setItem(KEY, stored);
    const fresh = state(); fresh.chainIds = [1, 10]; fresh.details.name = 'Changed form';
    mocks.client.mockImplementation(clientFor(session));
    mocks.execute.mockImplementationOnce(opts => confirmSend(opts, HASH2));

    await __test.runDeploy(fresh, TARGET);

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0]).toMatchObject({ chainId: 84532, address: TARGET, args: [1999999999n], value: 7n });
    expect(mocks.review.mock.calls[0][1].title).toBe('Review remaining launch transactions');
    expect(fresh._deployedChains).toEqual([11155111, 84532]);
    expect(mocks.forward).not.toHaveBeenCalled(); expect(mocks.postBundle).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps an old direct testnet request with an unknown wallet result blocked instead of switching to Relayr', async () => {
    const original = state(), session = { account: ALICE, plans: plans() };
    session.plans[0].status = 'awaiting-wallet';
    __test.saveCreateDirectSession(original, session);
    await expect(__test.runDeploy(state(), ALICE)).rejects.toThrow(/interrupted before its transaction hash/);
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.forward).not.toHaveBeenCalled(); expect(mocks.postBundle).not.toHaveBeenCalled();
  });

  it('resumes only the rejected remaining leg using the original shared start and exact calldata', async () => {
    const draft = state();
    const session = { account: ALICE, plans: plans() };
    mocks.client.mockImplementation(clientFor(session));
    mocks.execute.mockImplementationOnce((opts) => confirmSend(opts, HASH1));
    mocks.execute.mockImplementationOnce((opts) => opts.onError('Transaction rejected by wallet', { userRejected: true, submittedHash: null }));
    __test.saveCreateDirectSession(draft, session);
    await expect(__test.runCreateDirectSession(draft, session, false)).rejects.toThrow(/rejected/);
    expect(session.plans.map((p) => p.status)).toEqual(['confirmed', 'ready']);

    const saved = localStorage.getItem(KEY);
    __test.clearCreateDirectSession(draft);
    localStorage.setItem(KEY, saved);
    const restored = __test.loadCreateDirectSession();
    expect(restored.plans[1].args).toEqual([1999999999n]);
    mocks.execute.mockImplementationOnce((opts) => confirmSend(opts, HASH2));
    await __test.runCreateDirectSession(draft, restored, true);

    expect(mocks.execute.mock.calls.map(([opts]) => opts.chainId)).toEqual([11155111, 84532, 84532]);
    expect(mocks.review.mock.calls[0][0].transactions).toHaveLength(1);
    expect(mocks.execute.mock.calls[2][0].args).toEqual(mocks.execute.mock.calls[1][0].args);
    expect(draft._deployedChains).toEqual([11155111, 84532]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('persists a broadcast hash and checks it without resending after receipt tracking fails', async () => {
    const draft = state();
    const session = { account: ALICE, plans: plans() };
    mocks.client.mockImplementation(clientFor(session));
    mocks.execute.mockImplementationOnce((opts) => opts.onStatus('Tracking unavailable', 'pending', { hash: HASH1, trackingError: true }));
    await expect(__test.runCreateDirectSession(draft, session, false)).rejects.toThrow(/confirmation is unavailable/);
    expect(JSON.parse(localStorage.getItem(KEY)).plans[0].hash).toBe(HASH1);
    mocks.execute.mockImplementationOnce((opts) => confirmSend(opts, HASH2));
    await __test.runCreateDirectSession(draft, session, true);
    expect(mocks.execute.mock.calls.map(([opts]) => opts.chainId)).toEqual([11155111, 84532]);
  });

  it.each(['wrong sender', 'wrong calldata', 'RPC unavailable'])('blocks further sends when a saved transaction has %s', async (failure) => {
    const draft = state();
    const session = { account: ALICE, plans: plans() };
    session.plans[0].hash = HASH1;
    session.plans[0].status = 'confirmed';
    const factory = clientFor(session);
    mocks.client.mockImplementation((chainId) => {
      const pub = factory(chainId);
      if (failure === 'RPC unavailable') pub.getTransactionReceipt.mockRejectedValue(new Error('RPC unavailable'));
      else pub.getTransaction.mockResolvedValue({
        from: failure === 'wrong sender' ? TARGET : ALICE, to: TARGET, value: 7n,
        input: failure === 'wrong calldata' ? '0x1234' : encodeFunctionData({ abi, functionName: 'launchProjectFor', args: session.plans[0].args }),
      });
      return pub;
    });
    await expect(__test.runCreateDirectSession(draft, session, true)).rejects.toThrow();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it('does not repeat a wallet request whose hash was never captured', async () => {
    const session = { account: ALICE, plans: plans() };
    session.plans[0].status = 'awaiting-wallet';
    await expect(__test.runCreateDirectSession(state(), session, true)).rejects.toThrow(/interrupted before its transaction hash/);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('does not infer user cancellation from ambiguous rejection wording', async () => {
    const session = { account: ALICE, plans: plans() };
    mocks.execute.mockImplementationOnce((opts) => opts.onError('RPC rejected the broadcast response'));
    await expect(__test.runCreateDirectSession(state(), session, false)).rejects.toThrow(/rejected/);
    expect(session.plans[0].status).toBe('awaiting-wallet');
    await expect(__test.runCreateDirectSession(state(), session, true)).rejects.toThrow(/interrupted/);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('cannot send when another window owns the launch lock', async () => {
    navigator.locks.request.mockImplementationOnce(async (_, options, callback) => callback(null));
    await expect(__test.runCreateDirectSession(state(), { account: ALICE, plans: plans() }, false)).rejects.toThrow(/another window/);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('cannot revive a session another window already cleared', async () => {
    const draft = state();
    const session = { account: ALICE, plans: plans() };
    __test.saveCreateDirectSession(draft, session);
    localStorage.removeItem(KEY);
    await expect(__test.runCreateDirectSession(draft, session, true)).rejects.toThrow(/cleared in another window/);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('reloads a newer journal from another window before considering any remaining send', async () => {
    const draft = state();
    const session = { account: ALICE, plans: plans() };
    __test.saveCreateDirectSession(draft, session);
    const newer = JSON.parse(localStorage.getItem(KEY));
    newer.revision += 1;
    newer.plans[0].hash = HASH1;
    newer.plans[0].status = 'submitted';
    localStorage.setItem(KEY, JSON.stringify(newer));
    mocks.client.mockImplementation(clientFor(session));
    mocks.execute.mockImplementationOnce((opts) => confirmSend(opts, HASH2));
    await __test.runCreateDirectSession(draft, session, true);
    expect(mocks.execute.mock.calls.map(([opts]) => opts.chainId)).toEqual([84532]);
  });

  it('requires a durable journal before making a wallet request', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
    try {
      await expect(__test.runCreateDirectSession(state(), { account: ALICE, plans: plans() }, false)).rejects.toThrow(/could not be saved/);
      expect(mocks.execute).not.toHaveBeenCalled();
    } finally { setItem.mockRestore(); }
  });

  it('retains a broadcast hash in memory and rejects cleanly when saving it fails', async () => {
    const draft = state();
    let setItem;
    mocks.execute.mockImplementationOnce((opts) => {
      setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
      confirmSend(opts, HASH1);
    });
    try {
      await expect(__test.runCreateDirectSession(draft, { account: ALICE, plans: plans() }, false)).rejects.toThrow(/could not be saved/);
      expect(draft._directPending.plans[0].hash).toBe(HASH1);
      expect(mocks.execute).toHaveBeenCalledTimes(1);
    } finally { if (setItem) setItem.mockRestore(); }
  });

  it('checks completed calls but requires the original wallet before signing the remainder', async () => {
    const session = { account: ALICE, plans: plans() };
    session.plans[0].hash = HASH1;
    mocks.account = TARGET;
    mocks.client.mockImplementation(clientFor(session));
    await expect(__test.runCreateDirectSession(state(), session, true)).rejects.toThrow(/Connect 0x1111/);
    expect(session.plans[0].status).toBe('confirmed');
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('simulates all remaining calls before sending any and stops on an invalid destination', async () => {
    const session = { account: ALICE, plans: plans() };
    mocks.simulate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Invalid creation fee'));
    await expect(__test.runCreateDirectSession(state(), session, false)).rejects.toThrow(/Invalid creation fee/);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('retries a transaction only after verifying that its exact saved call reverted', async () => {
    const draft = state();
    const session = { account: ALICE, plans: plans() };
    session.plans[0].hash = HASH1;
    mocks.client.mockImplementation(clientFor(session, {
      getTransactionReceipt: vi.fn(async ({ hash }) => ({ transactionHash: hash, status: hash === HASH1 ? 'reverted' : 'success', logs: [] })),
    }));
    mocks.execute.mockImplementation((opts) => confirmSend(opts, HASH2));
    await __test.runCreateDirectSession(draft, session, true);
    expect(session.plans[0].failedHashes).toEqual([HASH1]);
    expect(mocks.review.mock.calls[0][0].transactions).toHaveLength(2);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
});

describe('new creation network routing', () => {
  it.each([
    ['mainnet', [1, 10, 8453, 42161]],
    ['testnet', [11155111, 11155420, 84532, 421614]],
  ])('bundles all four %s launches through Relayr with one shared start and explicit funding choice', async (network, chainIds) => {
    const draft = state();
    draft.projectType = 'custom'; draft.chainIds = chainIds; draft.network = network;
    draft.details.name = 'Multichain launch'; draft.details.owner = ALICE;
    mocks.client.mockImplementation(() => ({ readContract: vi.fn(async () => 7n), estimateContractGas: vi.fn(async () => 2500000n) }));
    const quote = { bundle_uuid: 'test-' + network, payment_info: [{ chain: chainIds[0], amount: '1' }] };
    mocks.postBundle.mockResolvedValue(quote);

    const deploying = __test.runDeploy(draft, ALICE);
    await vi.waitFor(() => expect(draft.quoteChoice).toBeTruthy());

    expect(mocks.forward.mock.calls.map(args => args[0])).toEqual(chainIds);
    expect(mocks.postBundle).toHaveBeenCalledTimes(1);
    expect(mocks.postBundle.mock.calls[0][1]).toMatchObject({ scope: 'create-project', account: ALICE,
      chains: chainIds.map(id => ({ id, name: expect.any(String) })) });
    const [review, options] = mocks.review.mock.calls[0];
    expect(options.title).toBe('Review the raw data sent to Relayr');
    expect(options.steps).toHaveLength(5);
    expect(options.steps[4]).toBe('Pay the relay fee once');
    expect(new Set(review.transactions.map(call => String(call.args[3][0].mustStartAtOrAfter))).size).toBe(1);
    review.transactions.forEach((call, index) => {
      expect(mocks.forward.mock.calls[index]).toEqual([call.chainId, ALICE, call.address, call.calldata, 5000000n, 7n]);
    });
    expect(draft.quoteChoice.options[0]).toMatchObject({ eth: '0.000000000000000001', opt: quote.payment_info[0] });
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.simulate).not.toHaveBeenCalled();
    draft.quoteChoice.resolve(null);
    await expect(deploying).resolves.toBe(false);
  });

  it('keeps single-chain testnet creation as one direct wallet launch', async () => {
    const draft = state();
    draft.projectType = 'custom'; draft.chainIds = [84532]; draft.details.name = 'One testnet'; draft.details.owner = ALICE;
    mocks.client.mockImplementation(() => ({ readContract: vi.fn(async () => 7n),
      getTransactionReceipt: vi.fn(async () => ({ transactionHash: HASH1, status: 'success', logs: [] })) }));
    mocks.execute.mockImplementationOnce(opts => confirmSend(opts, HASH1));
    await __test.runDeploy(draft, ALICE);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0].chainId).toBe(84532);
    expect(mocks.forward).not.toHaveBeenCalled(); expect(mocks.postBundle).not.toHaveBeenCalled();
  });

  it('does not sign or publish a testnet bundle when its exact launch review is cancelled', async () => {
    const draft = state();
    draft.projectType = 'custom'; draft.details.name = 'Cancelled'; draft.details.owner = ALICE;
    mocks.client.mockImplementation(() => ({ readContract: vi.fn(async () => 7n) }));
    mocks.review.mockResolvedValueOnce(false);
    await expect(__test.runDeploy(draft, ALICE)).resolves.toBe(false);
    expect(mocks.forward).not.toHaveBeenCalled(); expect(mocks.postBundle).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe('creation funding selection', () => {
  it('resumes a cancelled funding choice with the same quote and no new signatures or publication', async () => {
    const draft = state();
    const quote = { bundle_uuid: 'saved-quote', payment_info: [{ chain: 1, amount: '1' }] };
    draft._relayrPending = { paymentState: 'quoted', account: ALICE, chains: [{ id: 1 }, { id: 10 }] };
    mocks.resumeQuote.mockReturnValue(quote);
    const first = __test.runDeploy(draft, ALICE);
    const firstOptions = draft.quoteChoice.options;
    draft.quoteChoice.resolve(null);
    await expect(first).resolves.toBe(false);
    const resumed = __test.runDeploy(draft, ALICE);
    expect(draft.quoteChoice.options).toEqual(firstOptions);
    expect(mocks.postBundle).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    draft.quoteChoice.resolve(null);
    await expect(resumed).resolves.toBe(false);
  });

  it('blocks a restored known quote whose authenticated funding options were lost', async () => {
    const draft = state();
    draft._relayrPending = { paymentState: 'quoted', account: ALICE, chains: [{ id: 1 }, { id: 10 }] };
    await expect(__test.runDeploy(draft, ALICE)).rejects.toThrow(/unavailable after this reload/);
    expect(mocks.postBundle).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('requires an explicit choice even with one quote and preserves the full ETH amount', () => {
    const draft = state();
    const opt = { chain: 1, amount: '1' };
    draft.quoteChoice = { options: [{ chain: 'Ethereum', eth: '0.000000000000000001', opt }], resolve: vi.fn() };
    const view = __test.renderDeploy(draft, vi.fn());
    const select = view.querySelector('[aria-label="Funding chain"]');
    const pay = [...view.querySelectorAll('button')].find((button) => button.textContent === 'Pay & deploy');
    expect(select.value).toBe('');
    expect(pay.disabled).toBe(true);
    expect(select.textContent).toContain('0.000000000000000001 ETH');
    select.value = '0';
    select.dispatchEvent(new Event('change'));
    expect(pay.disabled).toBe(false);
    pay.click();
    expect(draft.quoteChoice.resolve).toHaveBeenCalledWith(opt);
  });
});
