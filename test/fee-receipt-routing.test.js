import { beforeEach, describe, expect, it, vi } from 'vitest';

const preview = vi.hoisted(() => vi.fn());
vi.mock('../src/pay-preview.js', async importOriginal => ({
  ...await importOriginal(), computePayPreview: preview,
}));
vi.mock('../src/component-base.js', async importOriginal => ({
  ...await importOriginal(),
  createPublicClientForChain: () => ({ readContract: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000000') }),
}));
import { renderFeeReceipt } from '../src/discover.js';

describe('fee receipt routing uncertainty', () => {
  beforeEach(() => { preview.mockReset(); });
  const options = { chainId: 1, feeProjectId: 1, decimals: 6, symbol: 'USDC', feeAmount: 25_000n };

  it.each([{ unavailable: true }, { received: 0n }])('keeps the assessed fee visible when no destination output can be previewed', async result => {
    preview.mockResolvedValue(result);
    const node = document.createElement('div');
    renderFeeReceipt(node, options);
    expect(node.querySelector('.ops-preview-fee').textContent).toContain('0.025 USDC');
    await vi.waitFor(() => expect(node.textContent).toContain('does not confirm a refund'));
    expect(node.querySelector('a').getAttribute('href')).toBe('#eth:1');
    expect(node.textContent).toContain('Routing may remain pending');
  });

  it('keeps a successful preview conditional on routing', async () => {
    preview.mockResolvedValue({ received: 10n ** 18n });
    const node = document.createElement('div');
    renderFeeReceipt(node, options);
    await vi.waitFor(() => expect(node.textContent).toContain('if the fee routes successfully'));
  });

  it('keeps the fee and pending state visible when the preview request fails', async () => {
    preview.mockRejectedValue(new Error('preview unavailable'));
    const node = document.createElement('div');
    renderFeeReceipt(node, options);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(node.textContent).toContain('0.025 USDC');
    expect(node.textContent).toContain('Routing may remain pending');
  });
});
