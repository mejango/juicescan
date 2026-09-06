import { describe, expect, it } from 'vitest';
import {
  activityRowFromEvent,
  mergeSameTxActivityRows,
  projectFeedRowsFromEvents,
  renderActivityRow,
} from '../src/discover.js';

const seller = '0x1111111111111111111111111111111111111111';
const project = {
  tokenSymbol: 'SBB',
  tokenAddress: '0x2222222222222222222222222222222222222222',
  _flowToken: { symbol: 'ETH', decimals: 18 },
};
const transaction = { chainId: 8453, txHash: '0xsale', timestamp: 1, from: seller };

function swap(direction, amount = '2340000000000000000', tx = transaction) {
  return {
    ...tx,
    swapEvent: {
      ...tx, direction, projectTokenAmount: amount, terminalTokenAmount: '23000000000000',
    },
  };
}

function mint(count, tx = transaction) {
  return {
    ...tx,
    mintTokensEvent: {
      ...tx, beneficiary: seller, beneficiaryTokenCount: count,
    },
  };
}

describe('buyback activity direction', () => {
  it.each(['buy', 'BUY', undefined])('keeps %s purchases as incoming pool buys', direction => {
    const row = activityRowFromEvent(swap(direction), project);
    expect(row.direction).toBe('in');
    expect(row.action).toBe('bought 2.34 SBB via the buyback pool');
  });

  it.each(['sell', 'SELL'])('renders %s as a sale without a purchase receipt or reserve', direction => {
    const row = activityRowFromEvent(swap(direction), {
      ...project,
      _remintByTx: { '8453:0xsale': ['1000000000000000000'] },
      _remintPayeeByTx: { '8453:0xsale': [seller] },
    });
    expect(row.type).toBe('sell');
    expect(row.direction).toBe('out');
    expect(row.baseAmount).toBe('0.000023 ETH');
    expect(row.action).toBe('sold 2.34 SBB via the buyback pool');
    expect(row.received).toBe('');
    expect(row.payee).toBe('');
  });

  it('renders the reported cash-out transaction without saying the seller bought tokens', () => {
    const rows = projectFeedRowsFromEvents([
      swap('sell'),
      {
        ...transaction,
        cashOutTokensEvent: {
          ...transaction, holder: seller, beneficiary: seller,
          cashOutCount: '2390000000000000000', reclaimAmount: '23000000000000',
        },
      },
      mint('2340000000000000000'),
    ], { ...project });
    const merged = mergeSameTxActivityRows(rows, project);
    expect(merged).toHaveLength(1);
    expect(merged[0].direction).toBe('out');
    expect(merged[0].account).toBe(seller);
    expect(merged[0].actionParts).toEqual([
      'cashed out 2.39 SBB',
      'sold 2.34 SBB via the buyback pool',
    ]);
    const element = renderActivityRow(merged[0], project);
    expect(element.querySelector('.activity-tag').textContent).toBe('out');
    expect(element.querySelector('.activity-actor').textContent).toMatch(/^to /);
    expect(element.querySelector('.activity-bullets').textContent).not.toContain('bought');
  });

  it('labels leftover payment issuance with its actual source', () => {
    const row = activityRowFromEvent(swap('mint'), project);
    expect(row.type).toBe('issuance');
    expect(row.direction).toBe('in');
    expect(row.action).toBe('bought 2.34 SBB from issuance');
    expect(row.received).toBe('');
  });

  it('does not guess buy or sell for an unrecognized direction', () => {
    const row = activityRowFromEvent(swap('future-direction'), project);
    expect(row.direction).toBe('');
    expect(row.action).toBe('swapped 2.34 SBB via the buyback pool');
  });

  it.each(['mint', 'sell', 'future-direction'])('does not infer a reserve from mixed buy/%s remints', direction => {
    const rows = projectFeedRowsFromEvents([
      swap('buy', '100000000000000000000'),
      swap(direction, '100000000000000000000'),
      // The receipt can combine pool output and leftover issuance, or an
      // internal sale remint. It is not proof of a 50% buy reserve.
      mint('50000000000000000000'),
    ], { ...project });
    expect(rows[0].action).toBe('bought 100 SBB via the buyback pool');
    expect(rows[0].received).toBe('');
    expect(rows.every(row => !row.action.includes('reserve'))).toBe(true);
  });

  it('keeps a pure buy receipt on another chain independent of a sale', () => {
    const remoteTx = { ...transaction, chainId: 1 };
    const rows = projectFeedRowsFromEvents([
      swap('sell'),
      mint('1000000000000000000'),
      swap('buy', '100000000000000000000', remoteTx),
      mint('50000000000000000000', remoteTx),
    ], { ...project });
    expect(rows[0].action).toBe('sold 2.34 SBB via the buyback pool');
    expect(rows[1].action).toBe('bought 100 SBB via the buyback pool, receiving 50 SBB after the 50% reserve');
  });
});
