import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeIpfsUriToBytes32, pinJson, unixFsFileBlock } from '../src/ipfs-pin.js';

const DIGEST = '0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const CIDV0 = 'QmNLfbof5rLekrACjeuLk9JmGZD2HDBHCU4z16iYKmx5SE';
const CIDV1_RAW = 'bafkreiaaaebagbafaydqqcikbmga2dqpcaireeyuculbogazdinryhi6d4';
const CIDV1_DAG_PB = 'bafybeih77367z6727h4pp5xv6tz7f4pq57xo33hl5lu6rz7g4xsohyxb4a';
const CIDV1_UNSUPPORTED_HASH = 'bafkrgiaaaebagbafaydqqcikbmga2dqpcaireeyuculbogazdinryhi6d4';

describe('encodeIpfsUriToBytes32', () => {
  it('keeps existing CIDv0 support', () => {
    expect(encodeIpfsUriToBytes32('ipfs://' + CIDV0)).toBe(DIGEST);
  });

  it('rejects raw CIDv1 file hashes whose codec the on-chain bytes32 slot would lose', () => {
    expect(() => encodeIpfsUriToBytes32('ipfs://' + CIDV1_RAW)).toThrow(/Raw CIDv1 metadata/);
  });

  it('accepts CIDv1 dag-pb hashes and gateway URLs', () => {
    expect(encodeIpfsUriToBytes32('https://gateway.pinata.cloud/ipfs/' + CIDV1_DAG_PB + '/meta.json')).toBe(
      '0xfffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0',
    );
    expect(() => encodeIpfsUriToBytes32('https://' + CIDV1_RAW + '.ipfs.dweb.link/meta.json')).toThrow(/Raw CIDv1 metadata/);
  });

  it('rejects CIDv1 hashes that cannot fit the on-chain bytes32 IPFS slot', () => {
    expect(() => encodeIpfsUriToBytes32('ipfs://' + CIDV1_UNSUPPORTED_HASH)).toThrow(/sha2-256/);
  });
});

describe('Pinata v3 JSON compatibility', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('wraps JSON as a canonical one-block UnixFS file node', () => {
    const bytes = unixFsFileBlock(new TextEncoder().encode('{"a":1}'));
    expect(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')).toBe(
      '0a0d080212077b2261223a317d1807',
    );
  });

  it('returns the DAG-PB CIDv0 sharing the raw-upload multihash', async () => {
    localStorage.setItem('jb-pinata-jwt', 'test-jwt');
    let uploaded;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      uploaded = init.body.get('file');
      return { ok: true, text: async () => JSON.stringify({ data: { cid: CIDV1_RAW } }) };
    }));

    await expect(pinJson({ a: 1 }, 'tier')).resolves.toBe('ipfs://' + CIDV0);
    const bytes = new Uint8Array(await uploaded.arrayBuffer());
    expect(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')).toBe(
      '0a0d080212077b2261223a317d1807',
    );
  });
});
