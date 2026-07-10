import { describe, expect, it } from 'vitest';
import { toEventSelector } from 'viem';
import { lpCollectPoolLogs } from '../src/discover.js';

const INITIALIZE = toEventSelector('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
const MODIFY = toEventSelector('ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)');
const POOL_ID = `0x${'ab'.repeat(32)}`;
const POSITION_MANAGER = `0x${'12'.repeat(20)}`;

function indexedAddress(address) {
  return `0x${address.slice(2).padStart(64, '0')}`;
}

function modifyLog(sender, tokenId, blockNumber = 101n) {
  return {
    topics: [MODIFY, POOL_ID, indexedAddress(sender)],
    data: `0x${'0'.repeat(192)}${tokenId.toString(16).padStart(64, '0')}`,
    blockNumber: `0x${blockNumber.toString(16)}`,
  };
}

describe('Uniswap V4 LP history parsing', () => {
  it('anchors history at Initialize and accepts only the configured PositionManager sender', () => {
    const state = { initializeBlock: null, tokenIds: {} };
    lpCollectPoolLogs([
      { topics: [INITIALIZE, POOL_ID], data: '0x', blockNumber: '0x64' },
      modifyLog(`0x${'34'.repeat(20)}`, 77n),
      modifyLog(POSITION_MANAGER, 42n),
    ], POSITION_MANAGER, state);

    expect(state.initializeBlock).toBe(100n);
    expect(state.tokenIds['42']).toEqual({ id: 42n, block: 101n });
    expect(state.tokenIds['77']).toBeUndefined();
  });

  it('rejects malformed matching logs instead of silently dropping positions', () => {
    const state = { initializeBlock: null, tokenIds: {} };
    expect(() => lpCollectPoolLogs([{
      topics: [MODIFY, POOL_ID, indexedAddress(POSITION_MANAGER)],
      data: '0x1234',
      blockNumber: '0x65',
    }], POSITION_MANAGER, state)).toThrow(/Malformed ModifyLiquidity/);
  });
});
