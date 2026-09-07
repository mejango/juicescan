import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(), pending: vi.fn(), acknowledge: vi.fn(), read: vi.fn(),
  holder: '0x1111111111111111111111111111111111111111',
}));
vi.mock('../src/action-plan.js', () => ({
  runSavedActionPlan: mocks.run, hasSavedActionPlan: mocks.pending, acknowledgeSavedActionPlan: mocks.acknowledge,
}));
vi.mock('../src/component-base.js', async (original) => ({ ...await original(),
  getAccount: () => mocks.holder, getViewAs: () => null, isSafeConnected: () => false,
  createPublicClientForChain: (cid) => ({ readContract: (request) => mocks.read(cid, request) }),
}));

import { buildClaimModal } from '../src/discover.js';

const CONTROLLER = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const chains = [{ id: 1, name: 'Ethereum' }, { id: 10, name: 'Optimism' }];
const project = { id: 7, chainId: 1, chains, idByChain: { 1: 7, 10: 93 }, tokenSymbol: 'TKN', tokenAddress: TOKEN };
const credits = [{ id: 1, name: 'Ethereum', credit: 999n }, { id: 10, name: 'Optimism', credit: 888n }];

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
  mocks.pending.mockReturnValue(false);
  mocks.read.mockImplementation(async (cid, request) => {
    if (request.functionName === 'controllerOf') return CONTROLLER;
    if (request.functionName === 'tokenOf') return TOKEN;
    if (request.functionName === 'creditBalanceOf') return cid === 1 ? 100n : 250n;
    throw new Error('Unexpected read ' + request.functionName);
  });
});

it('collects selected independent chains into one reviewed round using live IDs and balances', async () => {
  let prepared;
  mocks.run.mockImplementation(async (options) => {
    prepared = await options.prepare();
    return { completed: true, results: [{ relayr: true, session: { expectedCount: prepared.rounds[0].length } }], rounds: 1 };
  });
  const modal = buildClaimModal(project, credits);
  document.body.appendChild(modal);
  expect(mocks.read).not.toHaveBeenCalled();
  modal.querySelector('.claim-selected-btn').click();
  await vi.waitFor(() => expect(prepared?.rounds[0]).toHaveLength(2));
  expect(prepared.rounds[0].map((call) => call.args)).toEqual([
    [mocks.holder, 7n, 100n, mocks.holder], [mocks.holder, 93n, 250n, mocks.holder],
  ]);
  expect(prepared.summary.rows[0]).toEqual(['Holder and beneficiary', mocks.holder]);
  await vi.waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledWith('action:1:7:claim-credits', mocks.holder));
});

it('only prepares checked destinations', async () => {
  let prepared;
  mocks.run.mockImplementation(async (options) => { prepared = await options.prepare(); return { cancelled: true }; });
  const modal = buildClaimModal(project, credits);
  document.body.appendChild(modal);
  const optimism = modal.querySelector('[aria-label="Claim on Optimism"]');
  optimism.checked = false;
  optimism.dispatchEvent(new Event('change'));
  modal.querySelector('.claim-selected-btn').click();
  await vi.waitFor(() => expect(prepared?.rounds[0]).toHaveLength(1));
  expect(prepared.rounds[0][0].chainId).toBe(1);
  expect(mocks.read.mock.calls.every(([cid]) => cid === 1)).toBe(true);
  expect(mocks.acknowledge).not.toHaveBeenCalled();
});

it('resumes a saved action before reading changed balances, including when no positive credits remain', async () => {
  mocks.pending.mockReturnValue(true);
  mocks.run.mockResolvedValue({ completed: true, resumed: true, rounds: 1, results: [{ relayr: true, session: { expectedCount: 2 } }] });
  const modal = buildClaimModal(project, []);
  document.body.appendChild(modal);
  const button = modal.querySelector('.claim-selected-btn');
  expect(button.textContent).toBe('Resume saved credit claims');
  button.click();
  await vi.waitFor(() => expect(mocks.acknowledge).toHaveBeenCalled());
  expect(mocks.read).not.toHaveBeenCalled();
  expect(modal.textContent).toContain('Credit claim transactions confirmed.');
});

it('retains a Safe proposal journal and describes proposal rather than confirmation', async () => {
  mocks.run.mockResolvedValue({ completed: false, safePending: true, queued: 2, executedReady: 0 });
  const modal = buildClaimModal(project, credits);
  document.body.appendChild(modal);
  modal.querySelector('.claim-selected-btn').click();
  await vi.waitFor(() => expect(modal.textContent).toContain('proposed to your Safe'));
  expect(mocks.acknowledge).not.toHaveBeenCalled();
});
