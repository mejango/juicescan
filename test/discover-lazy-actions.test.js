import { describe, expect, it, vi } from 'vitest';

// Click-time modules: the .jb export and the move/add-liquidity modals load on first use. A failed load
// reports where the user clicked, and a later click retries.
const draft = vi.hoisted(() => ({ failures: 1, exportDraftFile: vi.fn(), build: vi.fn(async () => ({ state: { name: 'x' }, warnings: [] })) }));
vi.mock('../src/project-draft.js', () => {
  if (draft.failures > 0) { draft.failures -= 1; throw new Error('chunk offline'); }
  return { buildProjectCreateDraft: draft.build, exportDraftFile: draft.exportDraftFile };
});

const ops = vi.hoisted(() => ({ failures: 1, buildMoveModal: vi.fn(() => { const node = document.createElement('div'); node.className = 'move-body'; return node; }) }));
vi.mock('../src/project-ops-modals.js', () => {
  if (ops.failures > 0) { ops.failures -= 1; throw new Error('chunk offline'); }
  return { buildMoveModal: ops.buildMoveModal, buildAddLiquidityModal: vi.fn() };
});

import { opsActionsRow, renderExtrasSection } from '../src/discover.js';

describe('click-time modules', () => {
  it('loads the export module on click and retries after a failed load', async () => {
    const project = { id: 12, chainId: 8453, idByChain: { 8453: 12 }, chains: [{ id: 8453, name: 'Base' }] };
    const section = renderExtrasSection(project); document.body.appendChild(section);
    const card = section.querySelector('.extras-export-card');
    const button = card.querySelector('.operator-cta');
    const status = card.querySelector('.operator-edit-status');

    button.click();
    await vi.waitFor(() => expect(status.className).toContain('error'));
    expect(draft.build).not.toHaveBeenCalled();

    button.click();
    await vi.waitFor(() => expect(status.className).toContain('success'));
    expect(draft.build).toHaveBeenCalledWith(project);
    expect(draft.exportDraftFile).toHaveBeenCalledWith({ name: 'x' });
  });

  it('opens the move modal from its module and reports a failed load in the modal', async () => {
    document.body.innerHTML = '';
    const project = { id: 12, chainId: 8453, idByChain: { 8453: 12, 10: 7 }, chains: [{ id: 8453, name: 'Base' }, { id: 10, name: 'Optimism' }] };
    const row = opsActionsRow(project, { noLoans: true }); document.body.appendChild(row);
    const move = [...row.querySelectorAll('button')].find(button => button.textContent === 'Move between chains');

    move.click();
    await vi.waitFor(() => expect(document.body.textContent).toMatch(/Reload the page to try again/));
    expect(ops.buildMoveModal).not.toHaveBeenCalled();

    move.click();
    await vi.waitFor(() => expect(document.querySelector('.move-body')).not.toBeNull());
    expect(ops.buildMoveModal).toHaveBeenCalledWith(project);
  });
});
