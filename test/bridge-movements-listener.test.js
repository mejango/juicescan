import { describe, expect, it } from 'vitest';
import { renderBridgeTransactions } from '../src/discover.js';

function projectCountingReads() {
  const project = { id: 7, reads: 0 };
  Object.defineProperty(project, 'chains', { get() { project.reads += 1; return []; } });
  return project;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('queued movements table', () => {
  it('stops rereading its project once it leaves the page', async () => {
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
});
