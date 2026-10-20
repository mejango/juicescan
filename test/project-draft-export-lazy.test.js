import { describe, expect, it, vi } from 'vitest';

// The .jb export loads its chunk on click; a failed load reports in the card and a later click retries.
const draft = vi.hoisted(() => ({ failures: 1, exportDraftFile: vi.fn(), build: vi.fn(async () => ({ state: { name: 'x' }, warnings: [] })) }));
vi.mock('../src/project-draft.js', () => {
  if (draft.failures > 0) { draft.failures -= 1; throw new Error('chunk offline'); }
  return { buildProjectCreateDraft: draft.build, exportDraftFile: draft.exportDraftFile };
});

import { renderExtrasSection } from '../src/discover.js';

describe('.jb export', () => {
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
});
