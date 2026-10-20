import { decodeAbiParameters } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  buildDirectSwapErc20ExecuteTx,
  permit2AllowanceCovers,
  permit2SignatureNeedsOnchainFallback,
} from '../src/discover.js';

describe('direct pool sale Permit2 authorization', () => {
  it('reuses only an amount-sufficient allowance which outlives the send buffer', () => {
    var now = 1_000;
    expect(
      permit2AllowanceCovers([50_000_000n, 2_000n, 0n], 50_000_000n, now, 60),
    ).toBe(true);
    expect(
      permit2AllowanceCovers([49_999_999n, 2_000n, 0n], 50_000_000n, now, 60),
    ).toBe(false);
    expect(
      permit2AllowanceCovers([50_000_000n, 1_060n, 0n], 50_000_000n, now, 60),
    ).toBe(false);
    expect(permit2AllowanceCovers(null, 50_000_000n, now, 60)).toBe(false);
  });

  it('falls back for unsupported typed-data RPCs but never after a user rejection', () => {
    expect(
      permit2SignatureNeedsOnchainFallback({
        code: -32602,
        message: 'Invalid parameters',
      }),
    ).toBe(true);
    expect(
      permit2SignatureNeedsOnchainFallback({
        cause: { code: 4200, message: 'Unsupported method' },
      }),
    ).toBe(true);
    expect(
      permit2SignatureNeedsOnchainFallback({
        code: 4001,
        message: 'User rejected the request',
      }),
    ).toBe(false);
    expect(
      permit2SignatureNeedsOnchainFallback(new Error('Disconnected')),
    ).toBe(false);
  });

  it('builds a single V4 sell of the project token through the Universal Router', () => {
    var tx = buildDirectSwapErc20ExecuteTx(
      8453,
      {
        key: {
          currency0: '0x0000000000000000000000000000000000000000',
          currency1: '0x2222222222222222222222222222222222222222',
          fee: 10000,
          tickSpacing: 200,
          hooks: '0x4444444444444444444444444444444444444444',
        },
        zeroForOne: false,
        pairAddr: '0x2222222222222222222222222222222222222222',
        tokenOut: '0x0000000000000000000000000000000000000000',
      },
      25_000_000n,
      100n,
      '0x3333333333333333333333333333333333333333',
      1_800_000_000,
    );

    expect(tx.args[0]).toBe('0x10');
    expect(tx.args[1]).toHaveLength(1);
    expect(tx.value).toBe(0n);
    var decoded = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      tx.args[1][0],
    );
    expect(decoded[0]).toBe('0x060c0e');
  });
});
