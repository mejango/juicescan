import { describe, expect, it, vi } from 'vitest';
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

  it('takes an empty scan as final and retries only a scan that threw', async () => {
    vi.useFakeTimers();
    try {
      const empty = projectCountingReads();
      document.body.appendChild(renderBridgeTransactions(empty));
      await vi.advanceTimersByTimeAsync(0);
      const once = empty.reads;
      await vi.advanceTimersByTimeAsync(60000);
      expect(empty.reads).toBe(once);

      const failing = { id: 7, reads: 0 };
      Object.defineProperty(failing, 'chains', { get() { failing.reads += 1; throw new Error('RPC down'); } });
      document.body.appendChild(renderBridgeTransactions(failing));
      await vi.advanceTimersByTimeAsync(0);
      expect(failing.reads).toBe(1);
      await vi.advanceTimersByTimeAsync(60000);
      expect(failing.reads).toBe(5);
    } finally { vi.useRealTimers(); }
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
