import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData } from 'viem';

// The launch and resume reviews open at the click and fill in as their reads land. These cases hold the rule
// that makes that safe: nothing is reviewed or sent before every read and pin has answered, and a failure says so.
const mocks = vi.hoisted(() => ({
  account: '0x1111111111111111111111111111111111111111',
  execute: vi.fn(), simulate: vi.fn(), review: vi.fn(), client: vi.fn(), pending: vi.fn(), pinJson: vi.fn(), pinFile: vi.fn(),
  sessions: [],
}));
vi.mock('../src/component-base.js', async (original) => ({
  ...await original(),
  getAccount: () => mocks.account,
  getWalletClient: () => ({ getChainId: async () => 1 }),
  executeTransaction: mocks.execute,
  simulateTransaction: mocks.simulate,
  confirmTransactionModal: mocks.review,
  openPendingReview: mocks.pending,
  createPublicClientForChain: mocks.client,
}));
vi.mock('../src/wallet.js', async (original) => ({ ...await original(), isSafeConnected: () => false }));
vi.mock('../src/ipfs-pin.js', async (original) => ({ ...await original(), pinJson: mocks.pinJson, pinFile: mocks.pinFile }));

import { __test } from '../src/create-flow.js';

const ALICE = '0x1111111111111111111111111111111111111111';
const TARGET = '0x2222222222222222222222222222222222222222';
const HASH1 = '0x' + 'a'.repeat(64);
const HASH2 = '0x' + 'b'.repeat(64);
const KEY = 'jb-create-direct-launch';
const URI = 'ipfs://QmNLfbof5rLekrACjeuLk9JmGZD2HDBHCU4z16iYKmx5SE';
const abi = [{ type: 'function', name: 'launchProjectFor', stateMutability: 'payable', inputs: [{ name: 'start', type: 'uint48' }], outputs: [] }];

function deferred() { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
function draft(chainIds) {
  const state = Object.assign(__test.initState(), { _push: vi.fn(), chainIds });
  state.projectType = 'custom'; state.details.name = 'Open first'; state.details.owner = ALICE;
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  __test.clearCreateDirectSession({});
  mocks.sessions.length = 0;
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_, options, callback) => callback({ name: KEY })) } });
  mocks.review.mockResolvedValue(true);
  mocks.simulate.mockResolvedValue({});
  mocks.pinJson.mockResolvedValue(URI);
  mocks.client.mockImplementation(() => ({ readContract: vi.fn(async () => 7n) }));
  mocks.pending.mockImplementation((pending, options) => {
    const session = {
      pending, options, closed: false, setRows: vi.fn(), fail: vi.fn(), close: vi.fn(), progress: { showStatus: vi.fn(), close: vi.fn() },
      showNext: async (payload, next) => (await mocks.review(payload, next)) ? Object.assign({ ok: true }, session.progress) : { ok: false },
      confirm: async (payload, next) => !!(await mocks.review(payload, next)),
    };
    mocks.sessions.push(session);
    return session;
  });
});

describe('launch review opens at the click', () => {
  it('shows the form’s rows with the creation fee loading before the feeds, pins and fee have answered', async () => {
    const pin = deferred();
    mocks.pinJson.mockReturnValue(pin.promise);
    const state = draft([11155111, 8453]);
    const deploying = __test.runDeploy(state, ALICE);
    expect(mocks.pending).toHaveBeenCalledTimes(1); // synchronously, before any await
    const [pending, options] = mocks.pending.mock.calls[0];
    expect(pending.rows).toEqual(expect.arrayContaining([['Name', 'Open first'], ['Owner', ALICE], ['Creation fee', null]]));
    expect(options.title).toBe('Review the transactions');
    expect(options.steps).toHaveLength(2);
    await vi.waitFor(() => expect(mocks.pinJson).toHaveBeenCalled());
    expect(mocks.review).not.toHaveBeenCalled(); // no exact call to review until the pin lands
    await vi.waitFor(() => expect(mocks.sessions[0].setRows).toHaveBeenCalled());
    expect(mocks.sessions[0].setRows.mock.calls[0][0]).toEqual(expect.arrayContaining([['Creation fee', '0.000000000000000007 ETH per chain']]));
    mocks.review.mockResolvedValueOnce(false);
    pin.resolve(URI);
    await expect(deploying).resolves.toBe(false);
    const [payload, reviewed] = mocks.review.mock.calls[0];
    expect(payload.transactions.map((call) => call.value)).toEqual(['7 wei (0.000000000000000007 ETH creation fee)', '7 wei (0.000000000000000007 ETH creation fee)']);
    expect(payload.summary.rows).toEqual(expect.arrayContaining([['Creation fee', '0.000000000000000007 ETH per chain']]));
    expect(reviewed.note).toContain('in sequence');
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('fails closed when a creation fee cannot be read: no review, nothing sent, never a fee of 0', async () => {
    mocks.client.mockImplementation((chainId) => ({ readContract: vi.fn(async (call) => { if (chainId === 8453 && call.functionName === 'creationFee') throw new Error('fee RPC down'); return 7n; }) }));
    await expect(__test.runDeploy(draft([11155111, 8453]), ALICE)).rejects.toThrow('fee RPC down');
    expect(mocks.sessions[0].fail).toHaveBeenCalledTimes(1);
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.simulate).not.toHaveBeenCalled();
  });

  it('fails closed when the metadata pin fails', async () => {
    mocks.pinJson.mockRejectedValue(new Error('pin limit'));
    const state = draft([11155111]);
    await expect(__test.runDeploy(state, ALICE)).rejects.toThrow('pin limit');
    expect(mocks.sessions[0].fail).toHaveBeenCalledWith(expect.stringContaining('pin limit'));
    expect(state._push).toHaveBeenCalledWith('Could not pin metadata (pin limit), nothing was sent.', 'err');
    expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('stops when the dialog is dismissed while it prepares: nothing pinned after the feed check, nothing reviewed', async () => {
    mocks.pending.mockImplementationOnce(() => ({ closed: false, setRows: vi.fn(), fail: vi.fn(), close: vi.fn(), showNext: vi.fn(), confirm: vi.fn() }));
    const state = draft([11155111]);
    const deploying = __test.runDeploy(state, ALICE);
    mocks.pending.mock.results[0].value.closed = true;
    await expect(deploying).resolves.toBe(false);
    expect(mocks.pinJson).not.toHaveBeenCalled();
    expect(mocks.pending.mock.results[0].value.showNext).not.toHaveBeenCalled();
    expect(state._push).toHaveBeenCalledWith('Launch cancelled: nothing was simulated or sent.');
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('pins the project and every item together, and reviews only once all of them landed', async () => {
    const pins = [];
    mocks.pinJson.mockImplementation(() => { const pin = deferred(); pins.push(pin); return pin.promise; });
    const state = draft([11155111]);
    state.nfts = [Object.assign(__test.itemDraft(), { name: 'One', price: '1' }), Object.assign(__test.itemDraft(), { name: 'Two', price: '1' })];
    const deploying = __test.runDeploy(state, ALICE);
    await vi.waitFor(() => expect(pins).toHaveLength(3)); // none has answered yet
    pins[0].resolve(URI); pins[1].resolve(URI);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.review).not.toHaveBeenCalled();
    mocks.review.mockResolvedValueOnce(false);
    pins[2].resolve(URI);
    await expect(deploying).resolves.toBe(false);
    expect(state.nfts.map((item) => item.metaUri)).toEqual([URI, URI]);
    expect(mocks.review).toHaveBeenCalledTimes(1);
  });

  it('one chain keeps its progress in the review dialog and closes it when the launch lands', async () => {
    const state = draft([11155111]);
    const sent = [];
    mocks.client.mockImplementation(() => ({
      readContract: vi.fn(async () => 7n),
      getTransactionReceipt: vi.fn(async ({ hash }) => ({ transactionHash: hash, status: 'success', logs: [] })),
      getTransaction: vi.fn(async () => ({ from: ALICE, to: sent[0].address, value: sent[0].value, input: encodeFunctionData({ abi: sent[0].abi, functionName: sent[0].functionName, args: sent[0].args }) })),
    }));
    mocks.execute.mockImplementation(async (opts) => { sent.push(opts); await opts.onSubmitted?.(HASH1); opts.onSuccess('Confirmed', { hash: HASH1, phase: 'done' }); });
    const push = state._push;
    await __test.runDeploy(state, ALICE);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.sessions[0].progress.showStatus).toHaveBeenCalled();
    expect(mocks.sessions[0].progress.close).toHaveBeenCalledTimes(1);
    expect(state._push).toBe(push);
  });
});

describe('resuming a saved launch', () => {
  function plans() {
    return [11155111, 84532, 421614].map((chainId) => ({ chainId, address: TARGET, abi, args: [1999999999n], value: 7n, status: 'ready', hash: null }));
  }
  function savedTx(plan) {
    return { from: ALICE, to: plan.address, chainId: plan.chainId, input: encodeFunctionData({ abi, functionName: 'launchProjectFor', args: plan.args }), value: plan.value };
  }

  it('reads every saved chain together, fills its row as it answers, and sends only the chain not yet launched', async () => {
    const state = draft([11155111, 84532, 421614]);
    const session = { account: ALICE, recipientIds: 'onchain', plans: plans() };
    session.plans[0].hash = HASH1; session.plans[0].status = 'submitted';
    session.plans[1].hash = HASH2; session.plans[1].status = 'submitted';
    const receipts = { 11155111: deferred(), 84532: deferred() };
    const asked = [];
    mocks.client.mockImplementation((chainId) => ({
      getTransactionReceipt: vi.fn(({ hash }) => {
        if (!receipts[chainId] || receipts[chainId].done) return Promise.resolve({ transactionHash: hash, status: 'success', logs: [] });
        asked.push(chainId);
        return receipts[chainId].promise;
      }),
      getTransaction: vi.fn(async () => savedTx(session.plans.find((plan) => plan.chainId === chainId))),
    }));
    mocks.execute.mockImplementation(async (opts) => { await opts.onSubmitted?.('0x' + 'c'.repeat(64)); opts.onSuccess('Confirmed', { hash: '0x' + 'c'.repeat(64), phase: 'done' }); });
    const resuming = __test.runCreateDirectSession(state, session, true);
    await vi.waitFor(() => expect(asked).toEqual([11155111, 84532])); // both asked before either answered
    const dialog = mocks.sessions[0];
    expect(dialog.pending.rows.map((row) => row[1])).toEqual([null, null, 'Not sent yet']);
    expect(mocks.review).not.toHaveBeenCalled();
    receipts[84532].done = true; receipts[84532].resolve({ transactionHash: HASH2, status: 'success', logs: [] });
    await vi.waitFor(() => expect(dialog.setRows).toHaveBeenCalledTimes(1));
    expect(dialog.setRows.mock.calls[0][0].map((row) => row[1])).toEqual([null, 'Confirmed', 'Not sent yet']);
    expect(mocks.review).not.toHaveBeenCalled(); // one chain has not answered: no review yet
    receipts[11155111].done = true; receipts[11155111].resolve({ transactionHash: HASH1, status: 'success', logs: [] });
    await resuming;
    expect(mocks.review.mock.calls[0][0].transactions.map((call) => call.chainId)).toEqual([421614]);
    expect(mocks.execute.mock.calls.map(([opts]) => opts.chainId)).toEqual([421614]); // launched chains are never sent again
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps what the answered chains proved and fails closed when one saved chain cannot be read', async () => {
    const state = draft([11155111, 84532, 421614]);
    const session = { account: ALICE, recipientIds: 'onchain', plans: plans() };
    session.plans[0].hash = HASH1; session.plans[0].status = 'submitted';
    session.plans[1].hash = HASH2; session.plans[1].status = 'submitted';
    mocks.client.mockImplementation((chainId) => ({
      getTransactionReceipt: vi.fn(async ({ hash }) => { if (chainId === 11155111) throw new Error('RPC unavailable'); return { transactionHash: hash, status: 'success', logs: [] }; }),
      getTransaction: vi.fn(async () => savedTx(session.plans.find((plan) => plan.chainId === chainId))),
    }));
    await expect(__test.runCreateDirectSession(state, session, true)).rejects.toThrow('RPC unavailable');
    expect(mocks.sessions[0].fail).toHaveBeenCalledTimes(1);
    expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem(KEY)).plans;
    expect(stored.map((plan) => [plan.status, plan.hash])).toEqual([['submitted', HASH1], ['confirmed', HASH2], ['ready', null]]);
  });
});

describe('picked images preview from the local file', () => {
  it('shows the local file while it pins and after, and hands only the pinned URI to the draft', async () => {
    const created = [], revoked = [];
    URL.createObjectURL = vi.fn((file) => { const url = 'blob:local-' + file.name; created.push(url); return url; });
    URL.revokeObjectURL = vi.fn((url) => { revoked.push(url); });
    const owner = {}; const values = [];
    let uri = 'ipfs://old';
    const pins = [];
    mocks.pinFile.mockImplementation(() => { const pin = deferred(); pins.push(pin); return pin.promise; });
    const onChange = (next) => { uri = next; values.push(next); };
    const pick = (picker, name) => {
      const input = picker.querySelector('input[type=file]');
      Object.defineProperty(input, 'files', { configurable: true, value: [new File([new Uint8Array([1])], name, { type: 'image/png' })] });
      input.dispatchEvent(new Event('change'));
    };
    const src = () => __test.renderImagePicker(uri, false, owner, 'logo', onChange).querySelector('img').getAttribute('src');

    expect(src()).toContain('old');
    pick(__test.renderImagePicker(uri, false, owner, 'logo', onChange), 'a.png');
    expect(src()).toBe('blob:local-a.png'); // at once, before the pin answers
    expect(values).toEqual(['ipfs://old']);
    pins[0].resolve('ipfs://pinned-a');
    await vi.waitFor(() => expect(values).toEqual(['ipfs://old', 'ipfs://pinned-a']));
    expect(src()).toBe('blob:local-a.png');
    expect(values.some((value) => /^blob:/.test(value))).toBe(false); // the preview is never the draft's value

    pick(__test.renderImagePicker(uri, false, owner, 'logo', onChange), 'b.png');
    expect(revoked).toEqual(['blob:local-a.png']);
    pins[1].reject(new Error('pin limit'));
    window.alert = vi.fn();
    await vi.waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(revoked).toEqual(['blob:local-a.png', 'blob:local-b.png']);
    expect(src()).toContain('pinned-a'); // back to the pinned image, from the gateway

    uri = 'ipfs://imported'; // the field moved on without a pick
    expect(src()).toContain('imported');
  });
});
