// Center alone owns default reads; explicit custom RPC settings remain available.
import { describe, it, expect } from 'vitest';
import { fallbackRpcFor, readRpcUrlsFor } from '../src/chain.js';

describe('Center read RPC policy', () => {
  it('uses Center alone for a supported mainnet', () => {
    expect(readRpcUrlsFor(8453, '')).toEqual([
      'https://juicebox.center/v1/rpc/8453',
    ]);
  });
  it('uses Center alone for testnets and leaves unsupported chains unchanged', () => {
    expect(readRpcUrlsFor(84532, '')).toEqual(['https://juicebox.center/v1/rpc/84532']);
    expect(readRpcUrlsFor(999, '')).toEqual([undefined]);
    expect(fallbackRpcFor(999)).toBeUndefined();
  });
  it('honors explicit custom RPC settings', () => {
    expect(readRpcUrlsFor(1, 'https://rpc.example')).toEqual(['https://rpc.example']);
  });
});
