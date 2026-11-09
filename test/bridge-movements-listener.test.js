import { describe, expect, it } from 'vitest';
import { renderBridgeTransactions } from '../src/discover.js';

function projectCountingReads() {
  const project = { id: 7, reads: 0 };
  Object.defineProperty(project, 'chains', { get() { project.reads += 1; return []; } });
  return project;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('queued movements table', () => {
  it('does not reread its project while it is off the page', async () => {
    const project = projectCountingReads();
    const card = renderBridgeTransactions(project);
    document.body.appendChild(card);
    await settle();
    const initial = project.reads;
    document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
    await settle();
    expect(project.reads).toBe(initial + 1);

    card.remove();
    document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
    document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
    await settle();
    expect(project.reads).toBe(initial + 1);
  });

  it('keeps refreshing after its tab is hidden and shown again', async () => {
    const project = projectCountingReads();
    const tab = document.createElement('div');
    tab.appendChild(renderBridgeTransactions(project));
    document.body.appendChild(tab);
    await settle();
    document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
    await settle();
    const shown = project.reads;

    tab.remove();
    document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
    await settle();
    expect(project.reads).toBe(shown);

    document.body.appendChild(tab);
    document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
    await settle();
    expect(project.reads).toBe(shown + 1);
  });
});
