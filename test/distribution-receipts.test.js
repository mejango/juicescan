import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData } from 'viem';
import { getABI } from '../src/abi-registry.js';
import { verifyDistributionReceipt, verifyQueuedDistributionReceipt, distributionCallFromTransaction, readDistributionTokens } from '../src/distribution-plan.js';

const TARGET = '0x1111111111111111111111111111111111111111';
const TOKENS = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const SENDER = '0x4444444444444444444444444444444444444444';
const HOOK = '0x5555555555555555555555555555555555555555';
const ZERO = '0x0000000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dead';
const split = (over = {}) => ({ percent: 1000000000, projectId: 0n, beneficiary: SENDER,
  preferAddToBalance: false, lockedUntil: 0, hook: ZERO, ...over });
const call = (reserved = false) => ({ to: TARGET, chainId: 1,
  functionName: reserved ? 'sendReservedTokensToSplitsOf' : 'sendPayoutsOf',
  args: reserved ? [7n] : [7n, TOKEN, 1000n, 1n, 975n], validation: { tokens: TOKENS, sender: SENDER } });

// Encode with the generated contract ABIs, independently of the verifier's bounded event ABI.
function event(name, overrides = {}, address = TARGET) {
  const contract = name === 'Burn' ? 'JBTokens' : /Reserved|SplitHook/.test(name) ? 'JBController' : 'JBMultiTerminal';
  const definition = getABI(contract).find(item => item.type === 'event' && item.name === name);
  if (!definition) throw new Error('Missing local ABI event ' + name);
  const args = { projectId: 7n, rulesetId: 99n, rulesetCycleNumber: 1n, groupId: 1n, group: BigInt(TOKEN),
    split: split(), tokenCount: 1000n, caller: SENDER, owner: SENDER, projectOwner: SENDER,
    amount: 1000n, amountPaidOut: 975n, fee: 25n, netAmount: 975n, netLeftoverPayoutAmount: 0n,
    leftoverAmount: 0n, hook: HOOK, reason: '0x1234', addr: SENDER, token: TOKEN,
    holder: TARGET, count: 25n, creditBalance: 0n, tokenBalance: 0n, ...overrides };
  return { address, topics: encodeEventTopics({ abi: [definition], eventName: name, args }),
    data: encodeAbiParameters(definition.inputs.filter(input => !input.indexed),
      definition.inputs.filter(input => !input.indexed).map(input => args[input.name])) };
}
const receipt = (logs) => ({ status: 'success', logs });

describe('payout delivery receipts', () => {
  it.each([0n, 1n, 39n, 40n, 41n, 1000n, 1000000000000000001n])('allows the legitimate floored 2.5%% fee on %s', amount => {
    expect(verifyDistributionReceipt(call(), receipt([
      event('SendPayoutToSplit', { amount, netAmount: amount - amount / 40n }), event('SendPayouts'),
    ]))).toBe(true);
  });

  it('allows feeless full delivery', () => {
    expect(verifyDistributionReceipt(call(), receipt([
      event('SendPayoutToSplit', { netAmount: 1000n }), event('SendPayouts'),
    ]))).toBe(true);
  });

  it.each(['PayoutReverted', 'PayoutTransferReverted'])('keeps a successful transaction with %s incomplete', name => {
    expect(() => verifyDistributionReceipt(call(), receipt([event(name), event('SendPayouts')]))).toThrow(/distribution is incomplete/);
  });

  it.each([0n, 974n])('detects hook underdelivery %s without requiring a revert event', netAmount => {
    expect(() => verifyDistributionReceipt(call(), receipt([
      event('SendPayoutToSplit', { split: split({ hook: HOOK }), netAmount }), event('SendPayouts'),
    ]))).toThrow(/less than its allocation/);
  });

  it('does not hide a one-wei shortfall in fee rounding', () => {
    expect(() => verifyDistributionReceipt(call(), receipt([
      event('SendPayoutToSplit', { amount: 39n, netAmount: 38n }), event('SendPayouts'),
    ]))).toThrow(/less than its allocation/);
  });

  it('ignores events from other emitters, projects, tokens and nested callers', () => {
    expect(verifyDistributionReceipt(call(), receipt([
      event('PayoutReverted', {}, HOOK), event('PayoutReverted', { projectId: 8n }),
      event('PayoutReverted', { caller: HOOK }), event('PayoutTransferReverted', { token: HOOK }),
      event('SendPayoutToSplit', { group: BigInt(HOOK), netAmount: 0n }), event('SendPayouts'),
    ]))).toBe(true);
  });
});

describe('reserved-token delivery receipts', () => {
  it.each(['ReservedDistributionReverted', 'SplitHookReverted'])('detects the caught %s even with a final completion event', name => {
    expect(() => verifyDistributionReceipt(call(true), receipt([
      event(name), event('SendReservedTokensToSplits'),
    ]))).toThrow(/distribution is incomplete/);
  });

  it('detects a successful ERC20 hook that did not consume its entire allowance', () => {
    expect(() => verifyDistributionReceipt(call(true), receipt([
      event('Burn', { caller: TARGET }, TOKENS),
      event('SendReservedTokensToSplit', { split: split({ hook: HOOK }) }), event('SendReservedTokensToSplits'),
    ]))).toThrow(/left tokens unconsumed/);
  });

  it('accepts a configured burn split without confusing it with hook underpull', () => {
    expect(verifyDistributionReceipt(call(true), receipt([
      event('Burn', { caller: TARGET, count: 1000n }, TOKENS),
      event('SendReservedTokensToSplit', { split: split({ beneficiary: DEAD }) }),
      event('SendReservedTokensToSplits'),
    ]))).toBe(true);
  });

  it('ignores unrelated burn emitters, holders and projects', () => {
    expect(verifyDistributionReceipt(call(true), receipt([
      event('Burn', { caller: TARGET }, HOOK), event('Burn', { caller: TARGET, holder: HOOK }, TOKENS),
      event('Burn', { caller: TARGET, projectId: 8n }, TOKENS),
      event('SendReservedTokensToSplit', { split: split({ hook: HOOK }) }), event('SendReservedTokensToSplits'),
    ]))).toBe(true);
  });

  it('requires the original token manager and sender for saved-call verification', () => {
    const original = call(true);
    delete original.validation.tokens;
    expect(() => verifyDistributionReceipt(original, receipt([]))).toThrow(/token-manager/);
    delete original.validation.sender;
    expect(() => verifyDistributionReceipt(original, receipt([]))).toThrow(/original sender/);
  });
});

it('does not accept missing, malformed or failed receipt evidence', () => {
  expect(() => verifyDistributionReceipt(call(), receipt([]))).toThrow(/completion event is missing/);
  expect(() => verifyDistributionReceipt(call(), { status: 'reverted', logs: [] })).toThrow(/not verified/);
  const malformed = event('PayoutReverted'); malformed.data = '0x12';
  expect(() => verifyDistributionReceipt(call(), receipt([malformed]))).toThrow(/could not be decoded/);
});


describe('Safe distribution receipt reconstruction after reload', () => {
  function queued(reserved) {
    const original = call(reserved);
    return { to: TARGET, data: encodeFunctionData({ abi: getABI(reserved ? 'JBController' : 'JBMultiTerminal'), functionName: original.functionName, args: original.args }), operation: 0 };
  }
  it('rebuilds the exact local payout and catches a soft failure without any saved UI closure', async () => {
    const tx = queued(false), readTokens = vi.fn();
    expect(distributionCallFromTransaction(tx, SENDER)).toMatchObject({ to: TARGET, args: call().args, validation: { sender: SENDER } });
    await expect(verifyQueuedDistributionReceipt(tx, SENDER, receipt([event('PayoutReverted'), event('SendPayouts')]), readTokens)).rejects.toThrow('distribution is incomplete');
    expect(readTokens).not.toHaveBeenCalled();
  });
  it('reads the original controller immutable TOKENS and detects unconsumed hook burns', async () => {
    const readTokens = vi.fn(async () => TOKENS);
    await expect(verifyQueuedDistributionReceipt(queued(true), SENDER, receipt([
      event('Burn', { caller: TARGET }, TOKENS), event('SendReservedTokensToSplit', { split: split({ hook: HOOK }) }), event('SendReservedTokensToSplits'),
    ]), readTokens)).rejects.toThrow('left tokens unconsumed');
    expect(readTokens).toHaveBeenCalledWith(TARGET);
  });
  it('keeps a reserved receipt pending when its immutable target cannot be read', async () => {
    await expect(verifyQueuedDistributionReceipt(queued(true), SENDER, receipt([event('SendReservedTokensToSplits')]), async () => { throw new Error('RPC unavailable'); })).rejects.toThrow('RPC unavailable');
  });
  it('ignores unrelated Safe calls and rejects delegated distributions', async () => {
    expect(distributionCallFromTransaction({ data: '0x12345678' }, SENDER)).toBeNull();
    expect(() => distributionCallFromTransaction({ ...queued(false), operation: 1 }, SENDER)).toThrow('delegated distribution');
  });
});


it('bounds original-controller token-manager reads and rejects oversized or malformed results', async () => {
  const client = { request: vi.fn(async () => '0x' + '0'.repeat(24) + TOKENS.slice(2)) };
  await expect(readDistributionTokens(client, TARGET)).resolves.toBe(TOKENS);
  expect(client.request).toHaveBeenCalledWith({ method: 'eth_call', params: [expect.objectContaining({ to: TARGET, gas: '0x30d40' }), 'latest'] });
  for (const bad of ['0x', '0x' + 'ff'.repeat(32), '0x' + '0'.repeat(128), null]) {
    client.request.mockResolvedValueOnce(bad);
    await expect(readDistributionTokens(client, TARGET)).rejects.toThrow('could not be verified');
  }
});
