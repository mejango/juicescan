import { describe, expect, it, vi } from 'vitest';

// Pretty widgets in the Actions rows load with their own chunk on first expand; a failed load says so and
// the next click loads again.
const pay = vi.hoisted(() => ({ failures: 1, loads: 0 }));
const payFn = { type: 'function', name: 'pay', stateMutability: 'payable', inputs: [], outputs: [] };

vi.mock('../src/pay-component.js', () => {
  pay.loads += 1;
  if (pay.failures > 0) { pay.failures -= 1; throw new Error('chunk offline'); }
  return { renderPayComponent: () => { const node = document.createElement('div'); node.className = 'pay-widget'; return node; } };
});
vi.mock('../src/abi-registry.js', () => ({
  contracts: { JBMultiTerminal: [payFn] },
  meta: {}, categories: {}, chains: {},
  commonActions: [{ title: 'Pay', className: 'pay', entries: [{ contract: 'JBMultiTerminal', function: 'pay', label: 'PAY' }] }],
  getFunctions: () => [payFn],
  getAddress: () => null,
  getFunctionSource: () => null,
  loadFunctionSourceBody: () => Promise.resolve(null),
  getGithubUrl: () => null,
}));
vi.mock('../src/abi-natspec.js', () => ({ natspec: {} }));
vi.mock('../src/form.js', () => ({ renderFunctionForm: () => document.createElement('form') }));
vi.mock('../src/prompts.js', () => ({ getComponentAuditPrompt: () => '' }));
vi.mock('../src/components.js', () => ({ renderStyleEditor: () => document.createElement('div') }));
vi.mock('../src/component-base.js', () => ({ buildEmbedUrl: () => '', errMessage: (error, fallback) => (error && error.message) || fallback }));

describe('Actions widget rows', () => {
  it('load the widget on first expand and retry a failed load', async () => {
    document.body.innerHTML = '<section id="tab-common"></section>';
    const { renderCommonActions } = await import('../src/contracts-directory.js');
    renderCommonActions();
    const summary = document.querySelector('.fn-summary');
    expect(pay.loads).toBe(0);

    summary.click();
    await vi.waitFor(() => expect(document.querySelector('.fn-row').textContent).toMatch(/Click the row to try again/));
    summary.click();
    await vi.waitFor(() => expect(document.querySelector('.pay-widget')).not.toBeNull());
    expect(document.querySelector('.fn-row').textContent).not.toMatch(/try again/);
    expect(pay.loads).toBe(2);
  });
});
