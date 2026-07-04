import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchMetadata, ipfsGatewayUrls, ipfsToHttp } from '../src/discover.js';

describe('IPFS metadata fetches', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a multi-gateway list with eth.sucks first for DNS-safe CIDs', () => {
    const urls = ipfsGatewayUrls('ipfs://bafytest/meta.json');
    expect(urls[0]).toBe('https://bafytest.eth.sucks/meta.json');
    expect(urls).toContain('https://gateway.pinata.cloud/ipfs/bafytest/meta.json');
    expect(urls).toContain('https://dweb.link/ipfs/bafytest/meta.json');
    expect(urls).toContain('https://ipfs.io/ipfs/bafytest/meta.json');
    expect(ipfsToHttp('ipfs://bafytest/meta.json')).toBe(urls[0]);
  });

  it('falls back to path gateways first for CIDv0, which is not DNS-safe', () => {
    const urls = ipfsGatewayUrls('ipfs://QmNotDnsSafe/meta.json');
    expect(urls[0]).toBe('https://gateway.pinata.cloud/ipfs/QmNotDnsSafe/meta.json');
    expect(urls.some((url) => url.includes('.eth.sucks'))).toBe(false);
  });

  it('normalizes gateway URLs to the same immutable cache key', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ name: 'Cached Project' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchMetadata('ipfs://bafycache/project.json');
    expect(first).toEqual({ name: 'Cached Project' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://bafycache.eth.sucks/project.json');

    fetchMock.mockClear();
    const second = await fetchMetadata('https://bafycache.eth.sucks/project.json');
    expect(second).toEqual(first);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
