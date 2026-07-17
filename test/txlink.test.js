import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendTxLinkCopy, buildTxLinkEntries, renderConfirmBody } from '../src/component-base.js';

const TO = '0x1111111111111111111111111111111111111111';
const TO_2 = '0x2222222222222222222222222222222222222222';

function decodedParams(entry) {
  const url = new URL(entry.url);
  return { url, params: JSON.parse(url.searchParams.get('params')) };
}

describe('txlink confirmation sharing', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('encodes an exact eth_sendTransaction URL once and leaves from to the opening wallet', () => {
    const [entry] = buildTxLinkEntries({
      chainId: 8453,
      chain: 'Base',
      address: TO,
      calldata: '0x1234abcd',
      value: '1000000000000000 wei (0.001 ETH)',
    });
    const { url, params } = decodedParams(entry);
    expect(url.origin).toBe('https://txlink.stupidtech.net');
    expect(url.searchParams.get('method')).toBe('eth_sendTransaction');
    expect(url.searchParams.get('chainId')).toBe('8453');
    expect(params).toEqual({ to: TO, data: '0x1234abcd', value: '0x38d7ea4c68000' });
    expect(params.from).toBeUndefined();
    expect(entry.url).not.toContain('%2522');
  });

  it('copies one executable URL per line for a multi-chain confirmation', async () => {
    const payload = { chains: [
      { chain: 'Ethereum', chainId: 1, address: TO, calldata: '0xaaaa', value: 0n },
      { chain: 'Base', chainId: 8453, address: TO_2, calldata: '0xbbbb', value: '0' },
    ] };
    const entries = buildTxLinkEntries(payload);
    expect(entries).toHaveLength(2);
    expect(decodedParams(entries[0]).url.searchParams.get('chainId')).toBe('1');
    expect(decodedParams(entries[1]).url.searchParams.get('chainId')).toBe('8453');

    const container = document.createElement('div');
    const button = appendTxLinkCopy(container, payload);
    button.click();
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(entries.map(entry => entry.url).join('\n'));
  });

  it('does not render a Copy tx button in the confirm modal', () => {
    const content = document.createElement('div');
    renderConfirmBody(content, { txlinkUnavailableReason: 'Permit2 signature required.' });
    expect(content.querySelector('.tx-copy-btn')).toBeNull();
  });
});
