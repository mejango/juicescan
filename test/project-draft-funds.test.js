import { describe, expect, it } from 'vitest';
import { readDraftFunds } from '../src/discover.js';

const NATIVE_TOKEN = '0x000000000000000000000000000000000000EEEe';
const CUSTOM_TOKEN = '0x0000000000000000000000000000000000001234';

describe('project .jb fund snapshots', () => {
  it('reads and normalizes one complete limits-and-splits batch per ruleset', async () => {
    const calls = [];
    const reservedSplit = { percent: 250_000_000n };
    const readContract = async (chainId, contract, _abi, functionName, args) => {
      calls.push({ chainId, contract, functionName, args });
      if (functionName === 'payoutLimitsOf') return [{ amount: 10n, currency: BigInt(args[3]) }];
      if (functionName === 'surplusAllowancesOf') return undefined;
      if (args[2] === 1n) return [reservedSplit];
      return [{ percent: args[2] }];
    };
    const source = {
      chainId: 84532,
      projectId: 42n,
      ruleset: { id: 9n },
      contexts: [
        { address: NATIVE_TOKEN, decimals: 18 },
        { address: CUSTOM_TOKEN, decimals: 6 },
      ],
    };

    const snapshot = await readDraftFunds({ id: 42, chainId: 84532, idByChain: { 84532: 42 } }, source, readContract);

    expect(calls).toHaveLength(7); // one reserved-split read + three reads per accounting context
    expect(calls.filter((call) => call.functionName === 'splitsOf')).toHaveLength(3);
    expect(calls.filter((call) => call.functionName === 'payoutLimitsOf')).toHaveLength(2);
    expect(calls.filter((call) => call.functionName === 'surplusAllowancesOf')).toHaveLength(2);
    expect(calls.every((call) => call.chainId === 84532 && call.args[0] === 42n && call.args[1] === 9n)).toBe(true);
    expect(snapshot.reserved).toEqual([reservedSplit]);
    expect(snapshot.funds).toHaveLength(2);
    expect(snapshot.funds[0]).toMatchObject({ context: source.contexts[0], allowances: [] });
    expect(snapshot.funds[0].payouts).toEqual([{ amount: 10n, currency: BigInt(NATIVE_TOKEN) }]);
    expect(snapshot.funds[1].splits).toEqual([{ percent: BigInt(CUSTOM_TOKEN) }]);
  });
});
