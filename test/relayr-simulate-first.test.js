// A relayed change is simulated from the signer before any signature is asked for, as juicebox.money does:
// a call that would revert is refused with its chain instead of being relayed and paid for.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulateRelayedCalls } from '../src/discover.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const TO = '0x2222222222222222222222222222222222222222';
const call = (cid, data) => ({ cid, name: cid === 1 ? 'Ethereum' : 'Base', to: TO, data });

describe('simulateRelayedCalls', () => {
  it("simulates each chain's first call from the signer", async () => {
    const asked = [];
    const clientOf = cid => ({ request: async req => { asked.push([cid, req.method, req.params[0]]); return '0x'; } });
    await simulateRelayedCalls([call(1, '0xaa'), call(1, '0xbb'), call(8453, '0xcc')], ACCOUNT, 400000n, clientOf);
    expect(asked).toEqual([
      [1, 'eth_call', { from: ACCOUNT, to: TO, data: '0xaa', value: '0x0', gas: '0x61a80' }],
      [8453, 'eth_call', { from: ACCOUNT, to: TO, data: '0xcc', value: '0x0', gas: '0x61a80' }],
    ]);
  });

  it('refuses with the chain when a call would revert', async () => {
    const clientOf = cid => ({ request: async () => { if (cid === 8453) throw new Error('execution reverted'); return '0x'; } });
    await expect(simulateRelayedCalls([call(1, '0xaa'), call(8453, '0xcc')], ACCOUNT, 400000n, clientOf))
      .rejects.toThrow(/^This change would fail on Base: .* Nothing was signed\.$/);
  });

  it('runs before the first forwarder signature', () => {
    const source = readFileSync('src/discover.js', 'utf8');
    const relayed = source.slice(source.indexOf("via: 'Relayr: one prepaid payment relays the same change"));
    expect(relayed.indexOf('await simulateRelayedCalls(calls, account, gas || 400000n);')).toBeGreaterThan(-1);
    expect(relayed.indexOf('await simulateRelayedCalls(')).toBeLessThan(relayed.indexOf('buildForwardedTx('));
  });
});
