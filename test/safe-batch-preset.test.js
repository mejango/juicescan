// "Move to buyback 1.4.0 + gateway" resolves per chain from live reads: applied steps are skipped, the deployer's
// 48h default window becomes 30 minutes with a note, no pool means no setPoolFor, and missing target code makes the
// preset unavailable on that chain.
import { describe, expect, it } from 'vitest';
import { BUYBACK_GATEWAY_PRESET, DEPLOYER_DEFAULT_TWAP_NOTE, resolvePreset } from '../src/safe-batch-presets.js';
import { getAddress } from '../src/abi-registry.js';
import { NATIVE_TOKEN } from '../src/safe-batch.js';

const HOOK = getAddress(BUYBACK_GATEWAY_PRESET.targets.hook, 11155111), TERMINAL = getAddress(BUYBACK_GATEWAY_PRESET.targets.terminal, 11155111);
const OLD_HOOK = '0x77BEe1Ad2Ac0AcE98a9b5B58D75685C8b4D94948', OLD_TERMINAL = '0x0fBCbb3D10c8f524840D74EF81c1a9F161C418D7';
const REGISTRY = '0x72f55a54cd53410a5ff175508a5a384227081788', ROUTER_REGISTRY = '0xe0427f250fdb0379c8e98e884ee4570521208cbc';
const ZERO = '0x0000000000000000000000000000000000000000';
const USDC_BASE = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';

// A stub public client: `code` maps deployed addresses, `reads` answers "<address>:<fn>[:<lastArg>]".
function client(code, reads) {
  return {
    getCode: async ({ address }) => (code.includes(address.toLowerCase()) ? '0x6080' : '0x'),
    readContract: async ({ address, functionName, args }) => {
      const key = address.toLowerCase() + ':' + functionName + (args.length > 1 ? ':' + String(args[1]).toLowerCase() : '');
      if (!(key in reads) && functionName === 'twapWindowOf') return 0n; // successful empty-pool read
      if (!(key in reads)) throw new Error('unexpected read ' + key);
      if (reads[key] instanceof Error) throw reads[key];
      return reads[key];
    },
  };
}
const deployed = [HOOK.toLowerCase(), TERMINAL.toLowerCase()];
const poolKey = (fee, tickSpacing) => ({ currency0: ZERO, currency1: ZERO, fee, tickSpacing, hooks: OLD_HOOK });

describe('buyback 1.4.0 + gateway preset', () => {
  it('carries the native pool with the deployer default window replaced by 30 minutes', async () => {
    const reads = {
      [REGISTRY + ':hookOf']: OLD_HOOK, [ROUTER_REGISTRY + ':terminalOf']: OLD_TERMINAL,
      [OLD_HOOK.toLowerCase() + ':twapWindowOf:' + ZERO]: 172800n, [HOOK.toLowerCase() + ':twapWindowOf:' + ZERO]: 0n,
      [OLD_HOOK.toLowerCase() + ':poolKeyOf:' + ZERO]: poolKey(10000, 200),
    };
    const result = await resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 11155111, projectId: 2, client: client(deployed, reads) });
    expect(result.available).toBe(true); expect(result.nothingToDo).toBe(false);
    expect(result.steps).toEqual([
      { kind: 'setHookFor', values: { hook: HOOK } },
      { kind: 'setPoolFor', values: { fee: 10000, tickSpacing: 200, twapWindow: 1800, terminalToken: NATIVE_TOKEN }, note: DEPLOYER_DEFAULT_TWAP_NOTE },
      { kind: 'setTerminalFor', values: { terminal: TERMINAL } },
    ]);
  });

  it('keeps a non-default window and a USDC pool key with the chain USDC as terminal token', async () => {
    const reads = {
      [REGISTRY + ':hookOf']: OLD_HOOK, [ROUTER_REGISTRY + ':terminalOf']: OLD_TERMINAL,
      [OLD_HOOK.toLowerCase() + ':twapWindowOf:' + ZERO]: 0n,
      [OLD_HOOK.toLowerCase() + ':twapWindowOf:' + USDC_BASE]: 900n, [HOOK.toLowerCase() + ':twapWindowOf:' + USDC_BASE]: 0n,
      [OLD_HOOK.toLowerCase() + ':poolKeyOf:' + USDC_BASE]: poolKey(10000, 200),
    };
    const result = await resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 84532, projectId: 6, client: client(deployed, reads) });
    expect(result.steps.map(s => s.kind)).toEqual(['setHookFor', 'setPoolFor', 'setTerminalFor']);
    expect(result.steps[1]).toEqual({ kind: 'setPoolFor', values: { fee: 10000, tickSpacing: 200, twapWindow: 900, terminalToken: USDC_BASE }, note: null });
  });

  it('adds no setPoolFor when the project has no pool, and skips a pool the new hook already carries', async () => {
    const none = await resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 11155111, projectId: 6, client: client(deployed, {
      [REGISTRY + ':hookOf']: OLD_HOOK, [ROUTER_REGISTRY + ':terminalOf']: OLD_TERMINAL,
      [OLD_HOOK.toLowerCase() + ':twapWindowOf:' + ZERO]: 0n,
    }) });
    expect(none.steps.map(s => s.kind)).toEqual(['setHookFor', 'setTerminalFor']);
    const carried = await resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 11155111, projectId: 6, client: client(deployed, {
      [REGISTRY + ':hookOf']: OLD_HOOK, [ROUTER_REGISTRY + ':terminalOf']: OLD_TERMINAL,
      [OLD_HOOK.toLowerCase() + ':twapWindowOf:' + ZERO]: 1800n, [HOOK.toLowerCase() + ':twapWindowOf:' + ZERO]: 1800n,
    }) });
    expect(carried.steps.map(s => s.kind)).toEqual(['setHookFor', 'setTerminalFor']);
    expect(carried.notes).toEqual(['The native pool is already registered on the new hook.']);
  });

  it('skips steps already applied and reports nothing to do when both are current', async () => {
    const partial = await resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 11155111, projectId: 2, client: client(deployed, {
      [REGISTRY + ':hookOf']: HOOK, [ROUTER_REGISTRY + ':terminalOf']: OLD_TERMINAL,
    }) });
    expect(partial.steps).toEqual([{ kind: 'setTerminalFor', values: { terminal: TERMINAL } }]);
    const done = await resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 11155111, projectId: 2, client: client(deployed, {
      [REGISTRY + ':hookOf']: HOOK, [ROUTER_REGISTRY + ':terminalOf']: TERMINAL,
    }) });
    expect(done).toMatchObject({ available: true, nothingToDo: true, steps: [], reason: 'Nothing to do on Sepolia: already on the current hook and gateway.' });
  });

  it.each(['old', 'target'])('rejects a failed %s pool read instead of treating it as an empty pool', async (which) => {
    const reads = {
      [REGISTRY + ':hookOf']: OLD_HOOK, [ROUTER_REGISTRY + ':terminalOf']: OLD_TERMINAL,
      [OLD_HOOK.toLowerCase() + ':twapWindowOf:' + ZERO]: which === 'old' ? new Error('RPC unavailable') : 1800n,
      [HOOK.toLowerCase() + ':twapWindowOf:' + ZERO]: new Error('RPC unavailable'),
    };
    await expect(resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 11155111, projectId: 2, client: client(deployed, reads) })).rejects.toThrow('RPC unavailable');
  });

  it('keeps mainnet unavailable until its gateway artifact lands, even if target code exists elsewhere', async () => {
    const result = await resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 8453, projectId: 6, client: client(deployed, {}) });
    expect(result).toMatchObject({ available: false, steps: [], reason: 'Not deployed on Base yet.' });
  });

  it('is unavailable where either target has no code', async () => {
    const result = await resolvePreset(BUYBACK_GATEWAY_PRESET, { chainId: 84532, projectId: 6, client: client([HOOK.toLowerCase()], {}) });
    expect(result).toMatchObject({ available: false, steps: [], reason: 'Not deployed on Base Sepolia yet.' });
  });
});
