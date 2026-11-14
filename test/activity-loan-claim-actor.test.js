// Loan and bridge claim rows name the account that acted, as juicebox.money and revnet.money do.
import { describe, it, expect } from 'vitest';
import { activityRowFromEvent } from '../src/discover.js';

const project = { id: 3, chainId: 8453, tokenSymbol: 'REV' };
const SAFE = '0x5afe000000000000000000000000000000000000';
const EXECUTOR = '0x9999999999999999999999999999999999999999';
const event = (part) => ({ chainId: 8453, txHash: '0xabc', timestamp: 1700000000, from: EXECUTOR, ...part });

describe('activity actors', () => {
  it('attributes a repayment and a liquidation to the caller, not the executor', () => {
    expect(activityRowFromEvent(event({ repayLoanEvent: { caller: SAFE, from: EXECUTOR } }), project).account).toBe(SAFE);
    expect(activityRowFromEvent(event({ liquidateLoanEvent: { caller: SAFE, from: EXECUTOR, collateral: '1', borrowAmount: '1' } }), project).account).toBe(SAFE);
  });

  it('names the account inside a bridge claim’s 32-byte beneficiary', () => {
    const row = activityRowFromEvent(event({ bridgeClaimEvent: { beneficiary: '0x' + '0'.repeat(24) + SAFE.slice(2), peerChainId: 1, projectTokenCount: '1000000000000000000' } }), project);
    expect(row.account).toBe(SAFE);
  });
});
