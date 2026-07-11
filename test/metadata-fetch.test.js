import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BENDYSTRAW_PROJECT_QUERY,
  applyProjectMetadata,
  encodedIpfsCandidates,
  fetchMetadata,
  ipfsGatewayUrls,
  ipfsToHttp,
  projectMetadataFromBendystraw,
} from '../src/discover.js';

describe('IPFS metadata fetches', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a multi-gateway list with a path gateway first and eth.sucks as fallback', () => {
    const urls = ipfsGatewayUrls('ipfs://bafytest/meta.json');
    expect(urls[0]).toBe('https://gateway.pinata.cloud/ipfs/bafytest/meta.json');
    expect(urls).toContain('https://bafytest.eth.sucks/meta.json');
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
    expect(fetchMock.mock.calls[0][0]).toBe('https://gateway.pinata.cloud/ipfs/bafycache/project.json');

    fetchMock.mockClear();
    const second = await fetchMetadata('https://bafycache.eth.sucks/project.json');
    expect(second).toEqual(first);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reconstructs both canonical DAG-PB and legacy raw candidates from an on-chain tier digest', () => {
    expect(encodedIpfsCandidates('0xbdb815453bdd29f5af61a541e6382e7aace86076a9ba3ca3f6b3bdf7c58aa27f')).toEqual([
      'ipfs://Qmb7EZvTHUeVTDi6YmwDFQvKEfCR4UGciUka24coJcNJzS',
      'ipfs://bafkreif5xakuko65fh226ynfihtdqlt2vtuga5vjxi6kh5vtxx34lcvcp4',
    ]);
  });
});

describe('Bendystraw-first project metadata', () => {
  it('requests the parsed JSON and every project metadata field used by Discovery', () => {
    ['metadataUri', 'metadata', 'name', 'description', 'projectTagline', 'logoUri', 'infoUri', 'tags'].forEach((field) => {
      expect(BENDYSTRAW_PROJECT_QUERY).toContain(field);
    });
  });

  it('prefers the complete indexed JSON and fills fields it omits from searchable columns', () => {
    const record = projectMetadataFromBendystraw({
      metadataUri: 'ipfs://bafyproject',
      metadata: { name: 'Indexed JSON name', logoUri: 'ipfs://bafylogo', symbol: 'META', storeCategories: { 1: 'Bounties' } },
      name: 'Denormalized name',
      description: 'Indexed description',
      projectTagline: 'Indexed tagline',
      handle: 'indexed-handle',
    });
    expect(record).toMatchObject({
      uri: 'ipfs://bafyproject',
      handle: 'indexed-handle',
      source: 'bendystraw',
      hasEmbeddedMetadata: true,
      metadata: {
        name: 'Indexed JSON name',
        description: 'Indexed description',
        projectTagline: 'Indexed tagline',
        logoUri: 'ipfs://bafylogo',
        symbol: 'META',
        storeCategories: { 1: 'Bounties' },
      },
    });
  });

  it('normalizes searchable columns when parsed JSON is unavailable', () => {
    expect(projectMetadataFromBendystraw({ name: 'Indexed fallback', logoUri: 'ipfs://bafylogo' })).toMatchObject({
      source: 'bendystraw',
      hasEmbeddedMetadata: false,
      metadata: { name: 'Indexed fallback', logoUri: 'ipfs://bafylogo' },
    });
    expect(projectMetadataFromBendystraw(null)).toBeNull();
  });

  it('applies indexed metadata consistently to cards, details, shop categories, and edit prefills', () => {
    const project = applyProjectMetadata({}, {
      uri: 'ipfs://bafyproject',
      source: 'bendystraw',
      handle: 'indexed-handle',
      metadata: {
        name: 'Bounty 1',
        description: 'A useful project',
        projectTagline: 'Public bounties',
        logoUri: 'ipfs://bafylogo',
        symbol: 'BEN1',
        payDisclosure: 'Include a public link.',
        storeCategories: { 1: 'Entries' },
      },
    });
    expect(project).toMatchObject({
      name: 'Bounty 1',
      description: 'A useful project',
      tagline: 'Public bounties',
      logoUri: 'https://gateway.pinata.cloud/ipfs/bafylogo',
      metaSymbol: 'BEN1',
      metadataUri: 'ipfs://bafyproject',
      projectMetadataSource: 'bendystraw',
      payDisclosure: 'Include a public link.',
      storeCategories: { 1: 'Entries' },
    });
  });
});
