// Bridge and LP reviews open at the click. The bridge fee is the transaction's value: its row loads in the open
// dialog and nothing can be agreed to until it is read; a fee that cannot be read fails closed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ account: '0x3333333333333333333333333333333333333333', client: null }));
vi.mock('../src/wallet.js', async (original) => ({ ...await original(),
  getAccount: () => h.account, getWalletClient: () => ({}), createPublicClientForChain: () => h.client,
  isSafeConnected: () => false, waitForSafeInitialization: async () => {} }));
vi.mock('../src/fee-buyback-review.js', () => ({
  mountFeeBuybackReview: (_host, _call, changed) => { changed({ busy: false, label: null }); return { stop() {}, confirm: async () => true }; },
}));

import { openEditSplitsModal, openLpClaimConfirm, renderBridgeTransactionsTable, smallestPassing } from '../src/discover.js';

const SUCKER = '0x5555555555555555555555555555555555555555';
const PEER = '0x6666666666666666666666666666666666666666';
const TOKEN = '0x000000000000000000000000000000000000EEEe';
const BEN32 = '0x000000000000000000000000' + '2222222222222222222222222222222222222222';
const project = { id: 7, chainId: 1, tokenSymbol: 'TKN' };
const movement = (over) => Object.assign({ chainId: 1, peerChainId: 8453, sourceSucker: SUCKER, peerSucker: PEER, token: TOKEN, tokenSymbol: 'ETH', tokenDecimals: 18,
  beneficiary: '0x2222222222222222222222222222222222222222', beneficiary32: BEN32, projectTokenCount: '1000000000000000000', terminalTokenAmount: '1000000000000000',
  index: 0, metadata: '0x' + '00'.repeat(32), proof: Array(32).fill('0x' + '00'.repeat(32)), createdAt: 1 }, over);

const dialog = () => document.querySelector('dialog.modal-dialog[open]:not([data-covered])');
const rows = () => Array.from(dialog().querySelectorAll('.tx-decoded-arg')).map((row) => row.textContent);
const confirm = () => dialog().querySelector('.create-modal-foot .create-btn.primary');

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('smallestPassing', () => {
  it('returns the smallest value whose probe passes, as trying them in order would', async () => {
    const tried = [];
    expect(await smallestPassing([1n, 5n, 20n, 50n], (value) => { tried.push(value); if (value < 20n) throw new Error('too low'); })).toBe(20n);
    expect(tried).toEqual([1n, 5n, 20n]); // in order, stopping at the first that passes
    expect(await smallestPassing([1n, 5n], async () => { throw new Error('no'); })).toBeNull();
  });
});

describe('Bridge Execute', () => {
  function mount(callPasses) {
    h.client = {
      readContract: async (request) => {
        if (request.functionName === 'toRemoteFee') return 7n;
        if (request.functionName === 'CCIP_ROUTER') return '0x7777777777777777777777777777777777777777';
        throw new Error('Unexpected read ' + request.functionName);
      },
      call: async (request) => { if (!callPasses(request.value)) throw new Error('insufficient fee'); return {}; },
    };
    const table = renderBridgeTransactionsTable([movement({ status: 'pending', canExecute: true })], project);
    document.body.appendChild(table);
    return table;
  }

  it('opens the review at the click with the fee loading and Confirm locked, then shows the exact call', async () => {
    const table = mount((value) => value >= 7n + 5000000000000000n);
    const execute = Array.from(table.querySelectorAll('button')).find((b) => b.textContent === 'Execute');
    execute.click();
    expect(dialog()).not.toBeNull(); // no read has landed yet
    expect(rows()).toContain('Bridge fee: Loading…');
    expect(confirm().disabled).toBe(true);
    expect(dialog().querySelector('.tx-confirm-agree input').disabled).toBe(true);
    expect(dialog().querySelector('.create-payload')).toBeNull();

    await vi.waitFor(() => expect(dialog().querySelector('.create-payload')).not.toBeNull());
    expect(rows().some((row) => row.startsWith('Bridge fee: ') && !row.includes('Loading'))).toBe(true);
    // The value is the registry fee plus the smallest CCIP budget that simulates.
    expect(dialog().querySelector('.create-payload').textContent).toContain(String(7n + 5000000000000000n));
    expect(confirm().disabled).toBe(true); // still needs the acknowledgement of this exact call
    expect(dialog().querySelector('.tx-confirm-agree input').disabled).toBe(false);
    expect(document.querySelectorAll('dialog.modal-dialog').length).toBe(1);
  });

  it('fails closed when the fee cannot be determined', async () => {
    const table = mount(() => false);
    const execute = Array.from(table.querySelectorAll('button')).find((b) => b.textContent === 'Execute');
    execute.click();
    await vi.waitFor(() => expect(dialog().querySelector('.tx-confirm-status.error')).not.toBeNull());
    expect(dialog().querySelector('.tx-confirm-status.error').textContent).toBe('Could not determine the bridge fee, try again shortly.');
    expect(rows()).toContain('Bridge fee: Not loaded');
    expect(confirm().disabled).toBe(true);
    expect(dialog().querySelector('.create-payload')).toBeNull();
    expect(execute.disabled).toBe(false);
  });
});

describe('Bridge Claim', () => {
  it('opens the review at the click and adds the low-gas note when the balance lands', async () => {
    let land;
    h.client = { getBalance: () => new Promise((resolve) => { land = resolve; }) };
    const table = renderBridgeTransactionsTable([movement({ status: 'claimable' })], project);
    document.body.appendChild(table);
    Array.from(table.querySelectorAll('button')).find((b) => b.textContent === 'Claim').click();
    expect(dialog()).not.toBeNull();
    expect(dialog().querySelector('.create-payload')).not.toBeNull(); // the exact call is known without the read
    const note = dialog().querySelector('.tx-confirm-note');
    expect(note.textContent).not.toContain('Heads up');
    land(1n);
    await vi.waitFor(() => expect(note.textContent).toContain('your wallet looks low on Base ETH for gas'));
  });
});

describe('LP claim fees', () => {
  const pos = { tokenId: 9n, hookIsCurrent: true, pair: { symbol: 'USDC', decimals: 6 },
    key: { currency0: '0x1111111111111111111111111111111111111111', currency1: '0x2222222222222222222222222222222222222222' } };
  const claimable = { tokFees: 10n ** 18n, pairFees: 2000000n };

  it('opens at the click with the deadline loading, then shows the exact call once the wallet type is read', async () => {
    let land;
    h.client = { getCode: () => new Promise((resolve) => { land = resolve; }) };
    const opened = openLpClaimConfirm(project, 8453, pos, h.account, claimable, () => {});
    expect(rows()).toContain('Deadline: Loading…');
    expect(rows()).toContain('Position: #9 (current pool)');
    expect(confirm().disabled).toBe(true);
    expect(dialog().querySelector('.create-payload')).toBeNull();
    land('0x');
    await opened;
    await vi.waitFor(() => expect(dialog().querySelector('.create-payload')).not.toBeNull());
    expect(rows()).toContain('Deadline: ~20 minutes');
    expect(document.querySelectorAll('dialog.modal-dialog').length).toBe(1);
  });

  it('fails closed when the wallet type cannot be read', async () => {
    h.client = { getCode: async () => { throw new Error('rpc down'); } };
    await expect(openLpClaimConfirm(project, 8453, pos, h.account, claimable, () => {})).rejects.toThrow('Could not check whether this wallet is a multisig');
    expect(dialog().querySelector('.tx-confirm-status.error').textContent).toBe('Could not check whether this wallet is a multisig. Try again.');
    expect(rows()).toContain('Deadline: Not loaded');
    expect(confirm().disabled).toBe(true);
  });
});

describe('Edit splits', () => {
  it('verifies and edits in one dialog', async () => {
    let land;
    const gate = new Promise((resolve) => { land = resolve; });
    h.client = { readContract: async (request) => {
      await gate;
      if (request.functionName === 'controllerOf') return '0x8888888888888888888888888888888888888888';
      if (request.functionName === 'currentRulesetOf') return [{ id: 5n, cycleNumber: 1n, duration: 0n }, { reservedPercent: 2000 }];
      if (request.functionName === 'splitsOf') return [];
      throw new Error('Unexpected read ' + request.functionName);
    } };
    openEditSplitsModal({ id: 7, chainId: 1, chains: [{ id: 1, name: 'Ethereum' }], idByChain: { 1: 7 }, tokenSymbol: 'TKN', owner: h.account }, {});
    const first = dialog();
    expect(first.textContent).toContain('Verifying the current splits…');
    land();
    await vi.waitFor(() => expect(first.querySelector('.operator-edit')).not.toBeNull());
    expect(first.textContent).not.toContain('Verifying the current splits…');
    expect(document.querySelectorAll('dialog.modal-dialog').length).toBe(1); // the same dialog, never a second one
    expect(dialog()).toBe(first);
  });
});
