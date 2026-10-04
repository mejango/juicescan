import { afterEach, describe, expect, it, vi } from 'vitest';
import { BENDYSTRAW_MAINNET_HOST, BENDYSTRAW_TESTNET_HOST, BENDYSTRAW_GRAPHQL_ENDPOINTS } from '../src/bendystraw-endpoints.js';
import { bendystrawQuery, setBendystrawNetwork } from '../src/bendystraw-client.js';
import { loadProjectPreview } from '../src/project-preview-server.mjs';

afterEach(() => setBendystrawNetwork('mainnet'));

describe('shared Bendystraw origins', () => {
  it('keeps the configured public mainnet and testnet schema destinations explicit', () => {
    expect(BENDYSTRAW_MAINNET_HOST).toBe('https://bendystraw.up.railway.app');
    expect(BENDYSTRAW_TESTNET_HOST).toBe('https://testnet.bendystraw.xyz');
    expect(BENDYSTRAW_GRAPHQL_ENDPOINTS).toEqual({
      mainnet: BENDYSTRAW_MAINNET_HOST + '/graphql',
      testnet: BENDYSTRAW_TESTNET_HOST + '/graphql',
    });
  });

  it.each([['mainnet', BENDYSTRAW_MAINNET_HOST], ['testnet', BENDYSTRAW_TESTNET_HOST]])
    ('sends browser %s queries to the shared origin through the existing keyed route', async (network, host) => {
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { __typename: 'Query' } }), {
        headers: { 'content-type': 'application/json' },
      }));
      setBendystrawNetwork(network);
      await expect(bendystrawQuery('query Health { __typename }')).resolves.toEqual({ __typename: 'Query' });
      const [url, request] = vi.mocked(fetch).mock.calls[0];
      expect(new URL(url).origin).toBe(host);
      expect(new URL(url).pathname).toMatch(/^\/[^/]+\/graphql$/);
      expect(request.method).toBe('POST');
      expect(JSON.parse(request.body).query).toBe('query Health { __typename }');
    });

  it.each([['mainnet', BENDYSTRAW_MAINNET_HOST, 8453], ['testnet', BENDYSTRAW_TESTNET_HOST, 84532]])
    ('sends server %s previews to the same network origin with exact project/chain identity', async (network, host, chainId) => {
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { project: null } }), {
        headers: { 'content-type': 'application/json' },
      }));
      await expect(loadProjectPreview({ network, projectId: 13, chainId })).resolves.toBeNull();
      const [url, request] = vi.mocked(fetch).mock.calls[0];
      expect(new URL(url).origin).toBe(host);
      expect(new URL(url).pathname).toMatch(/^\/[^/]+\/graphql$/);
      expect(JSON.parse(request.body).variables).toEqual({ projectId: 13, chainId, version: 6 });
    });
});
