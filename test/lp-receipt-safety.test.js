import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/discover.js'), 'utf8');

describe('LP transaction receipt safety', () => {
  it('rejects a mined revert before returning the LP transaction hash', () => {
    const start = source.indexOf('async function lpSendTx');
    const end = source.indexOf('\nvar lpPositionViewAbi', start);
    const helper = source.slice(start, end);
    expect(helper).toContain("receipt.status !== 'success'");
    expect(helper.indexOf("receipt.status !== 'success'")).toBeLessThan(helper.lastIndexOf('return hash'));
  });

  it('sends every non-multisig LP write under the shared hold, released only by a read receipt', () => {
    const start = source.indexOf('async function lpSendTx');
    const helper = source.slice(start, source.indexOf('\nvar lpPositionViewAbi', start));
    expect(helper).toContain('await heldWriteGate(hold');
    expect(helper).toContain('sendHeldWrite(hold, function');
    expect(helper).toContain('invokeWallet(chainId, expected, reviewedSafe');
    expect(helper.match(/current\.writeContract\(/g)).toHaveLength(1);
    const send = helper.indexOf('function send(lock)');
    const held = helper.indexOf('sendHeldWrite(');
    expect(send).toBeGreaterThanOrEqual(0);
    expect(held).toBeGreaterThanOrEqual(0);
    expect(send).toBeLessThan(held);
    expect(helper).toContain('if (receipt && hold) await hold.release(sent.reservation)');
  });

  it('confirms the direct-swap Permit2 approval through the shared dual-source receipt poll', () => {
    const start = source.indexOf("'Swap-router authorization submitted. Confirming onchain…'");
    expect(start).toBeGreaterThan(0);
    const step = source.slice(start, source.indexOf('Swap router authorized.', start));
    expect(step).toContain('waitForTrackedTransactionReceipt(client, approvalHash, wallet, chainId)');
    // viem's watcher alone can sit pending forever on some wallet/RPC pairs; no write may wait on it bare.
    expect(source).not.toContain('client.waitForTransactionReceipt(');
    expect(source).not.toContain('pollDirectSwapReceipt');
  });
});
