// The batch surfaces in jsdom: tray chips come from storage and follow the tray-updated event, the batch dialog
// lists steps with working ↑ ↓ ✕ controls and holds the primary while a dependency is out of order, "Add to batch"
// in the power modal upserts the exact reviewed call, and mirroring reports what it skipped.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData } from 'viem';

const runtime = vi.hoisted(() => ({ account: '0x1111111111111111111111111111111111111111', safeInfo: null }));
// Every RPC read fails closed: the surfaces under test never depend on a live chain.
const offlineClient = new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : () => Promise.reject(new Error('offline'))) });
vi.mock('../src/component-base.js', async importOriginal => ({
  ...await importOriginal(), getAccount: () => runtime.account, getEffectiveAccount: () => runtime.account, connect: vi.fn(async () => {}),
  isSafeConnected: () => false, getWalletClient: () => null, createPublicClientForChain: () => offlineClient,
}));
vi.mock('../src/discover.js', async importOriginal => ({ ...await importOriginal(), safeInfoForAuthority: vi.fn(async () => runtime.safeInfo) }));

import { renderBuybackRouterCard } from '../src/discover.js';
import { buildStep, loadTray, saveTray, NATIVE_TOKEN } from '../src/safe-batch.js';
import { mirrorAcrossChains, renderSafeBatchTray } from '../src/safe-batch-ui.js';

const OWNER = runtime.account, OTHER = '0x3333333333333333333333333333333333333333';
const HOOK = '0xB222Da5A71e8FB89a5A38b7c920EaB5DfbC74B91', REGISTRY = '0x72F55a54CD53410a5Ff175508a5A384227081788';
const project = () => ({ id: '6', chainId: 8453, _urlChainId: 8453, idByChain: { 8453: 6, 10: 7 }, owner: OWNER, isRevnet: false, tokenSymbol: 'TEST',
  chains: [{ id: 8453, name: 'Base', projectId: 6 }, { id: 10, name: 'Optimism', projectId: 7 }] });
const hook = () => buildStep('setHookFor', { chainId: 8453, projectId: 6, values: { hook: HOOK } });
const pool = () => buildStep('setPoolFor', { chainId: 8453, projectId: 6, values: { fee: 10000, tickSpacing: 200, twapWindow: 1800, terminalToken: NATIVE_TOKEN } });
const dialog = () => document.querySelector('dialog.modal-dialog');
const chips = node => Array.from(node.querySelectorAll('.safe-batch-chip')).map(b => b.textContent);
const buttons = node => Array.from(node.querySelectorAll('button')).map(b => b.textContent);

beforeEach(() => { localStorage.clear(); runtime.account = OWNER; runtime.safeInfo = null; });
afterEach(() => { document.querySelectorAll('dialog').forEach(node => { if (node.open) node.close(); node.remove(); }); document.body.innerHTML = ''; });

describe('tray', () => {
  it('shows one chip per queued chain from storage, keeps Presets when empty, and repaints on the update event', () => {
    saveTray(8453, 6, [hook(), pool()]);
    const tray = renderSafeBatchTray(project());
    document.body.appendChild(tray);
    expect(tray.hidden).toBe(false);
    expect(chips(tray)).toEqual(['2 queued · Base']);
    expect(buttons(tray)).toEqual(['2 queued · Base', 'Presets', 'Same on every chain', 'Clear']);
    saveTray(10, 7, [buildStep('setHookFor', { chainId: 10, projectId: 7, values: { hook: HOOK } })]);
    expect(chips(tray)).toEqual(['2 queued · Base', '1 queued · Optimism']);
    tray.querySelector('.safe-batch-clear').click();
    expect(loadTray(8453, 6)).toEqual([]); expect(loadTray(10, 7)).toEqual([]);
    expect(chips(tray)).toEqual([]);
    expect(buttons(tray)).toEqual(['Presets']);
    expect(tray.querySelector('.safe-batch-tray-empty').textContent).toMatch(/Nothing queued/);
    expect(tray.querySelector('.safe-batch-tray-status').textContent).toBe('Cleared the batch.');
  });
});

describe('batch dialog', () => {
  it('lists the steps with decoded calls, moves and removes them, and holds the primary while the order is wrong', async () => {
    saveTray(8453, 6, [pool(), hook()]);
    const tray = renderSafeBatchTray(project());
    document.body.appendChild(tray);
    tray.querySelector('.safe-batch-chip').click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    const dlg = dialog();
    expect(dlg.querySelector('.modal-title').textContent).toBe('Batch on Base');
    expect(Array.from(dlg.querySelectorAll('.tx-decoded-argname')).map(n => n.textContent)).toContain('Route: ');
    expect(Array.from(dlg.querySelectorAll('.tx-decoded-argval')).map(n => n.textContent)).toContain('0x1111...1111 (EOA)');
    let steps = dlg.querySelectorAll('.safe-batch-step');
    expect(steps).toHaveLength(2);
    expect(Array.from(steps).map(s => s.querySelector('.safe-batch-step-label').textContent)).toEqual(['Register buyback pool', 'Set buyback hook']);
    expect(steps[0].querySelector('.tx-decoded-fn').textContent).toBe('setPoolFor');
    expect(steps[0].querySelector('.safe-batch-problem').textContent).toMatch(/Set the buyback hook before registering its pool/);
    const confirm = dlg.querySelector('.create-modal-foot .create-btn.primary');
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe('Send 2 transactions');
    expect(steps[0].querySelector('[aria-label="Move up"]').disabled).toBe(true);
    steps[0].querySelector('[aria-label="Move down"]').click();
    steps = dlg.querySelectorAll('.safe-batch-step');
    expect(Array.from(steps).map(s => s.querySelector('.safe-batch-step-label').textContent)).toEqual(['Set buyback hook', 'Register buyback pool']);
    expect(dlg.querySelector('.safe-batch-problem')).toBeNull();
    expect(confirm.disabled).toBe(false);
    expect(loadTray(8453, 6).map(s => s.kind)).toEqual(['setHookFor', 'setPoolFor']);
    steps[1].querySelector('[aria-label="Remove"]').click();
    expect(dlg.querySelectorAll('.safe-batch-step')).toHaveLength(1);
    expect(confirm.textContent).toBe('Send 1 transaction');
    expect(loadTray(8453, 6).map(s => s.kind)).toEqual(['setHookFor']);
    dlg.querySelector('.create-modal-foot .create-btn.ghost').click();
    await vi.waitFor(() => expect(dialog()).toBeNull());
  });

  it('disables the primary with the refusal copy when the connected wallet is not the authority', async () => {
    saveTray(8453, 6, [hook()]);
    runtime.account = OTHER;
    const tray = renderSafeBatchTray(project());
    document.body.appendChild(tray);
    tray.querySelector('.safe-batch-chip').click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog().querySelector('.safe-batch-refusal').textContent).toBe('Connected wallet is not the owner. Switch to 0x1111...1111.');
    expect(dialog().querySelector('.create-modal-foot .create-btn.primary').disabled).toBe(true);
  });
});

describe('Add to batch', () => {
  it('upserts the exact reviewed call from the power modal into the selected chain’s tray and closes without sending', async () => {
    const one = Object.assign(project(), { chains: [{ id: 8453, name: 'Base', projectId: 6 }] });
    const card = renderBuybackRouterCard(one);
    document.body.appendChild(card);
    Array.from(card.querySelectorAll('.powers-act')).find(b => b.textContent === 'Set buyback hook').click();
    const dlg = dialog();
    expect(dlg).not.toBeNull();
    const input = dlg.querySelector('input.operator-edit-jwt');
    input.value = HOOK; input.dispatchEvent(new Event('input'));
    const gate = dlg.querySelector('.danger-confirm input'); gate.checked = true; gate.dispatchEvent(new Event('change'));
    const add = dlg.querySelector('.operator-edit-batch');
    expect(add.textContent).toBe('Add to batch');
    expect(dlg.querySelector('.operator-edit-actions').lastChild.textContent).toBe('Set buyback hook');
    add.click();
    await vi.waitFor(() => expect(loadTray(8453, 6)).toHaveLength(1));
    const step = loadTray(8453, 6)[0];
    expect(step).toMatchObject({ kind: 'setHookFor', to: REGISTRY.toLowerCase(), label: 'Set buyback hook', chainId: 8453, projectId: 6n, values: { hook: HOOK } });
    expect(decodeFunctionData({ abi: step.abi, data: step.data }).args).toEqual([6n, HOOK]);
    expect(dlg.querySelector('.operator-edit-status').textContent).toBe('Added to the batch for Base.');
    add.click();
    await new Promise(r => setTimeout(r, 20));
    expect(loadTray(8453, 6)).toHaveLength(1);
  });
});

describe('Same on every chain', () => {
  it('mirrors address-only steps and reports per-chain steps it could not re-resolve', async () => {
    saveTray(8453, 6, [hook(), pool()]);
    const report = await mirrorAcrossChains(project());
    expect(report.mirrored).toEqual(['Optimism (1)']);
    expect(report.skipped).toEqual(['Optimism: Register buyback pool — offline']);
    expect(report.message).toBe('Mirrored Base’s batch to Optimism (1). Skipped Optimism: Register buyback pool — offline.');
    const mirrored = loadTray(10, 7);
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]).toMatchObject({ kind: 'setHookFor', chainId: 10, projectId: 7n, values: { hook: HOOK } });
    expect(decodeFunctionData({ abi: mirrored[0].abi, data: mirrored[0].data }).args).toEqual([7n, HOOK]);
  });
});
