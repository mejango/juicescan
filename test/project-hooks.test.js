// The buyback hook a project's ruleset actually calls, and the revnet cash out fee: the same cases the SDK's
// resolveProjectBuybackHook and fee helpers are tested with, since juicebox.money and revnet.money take them there.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveBuybackHook, revnetCashOutFeeApplies, cashOutCountAfterRevnetFee } from '../src/project-hooks.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const REGISTRY = '0x00000000000000000000000000000000000000a1';
const OLD_REGISTRY = '0x00000000000000000000000000000000000000a2';
const REV_OWNER = '0x00000000000000000000000000000000000000b1';
const OMNICHAIN = '0x00000000000000000000000000000000000000c1';
const HOOK = '0x00000000000000000000000000000000000000d1';
const OLD_HOOK = '0x00000000000000000000000000000000000000d2';
const PINNED = '0x00000000000000000000000000000000000000e1';
const OTHER = '0x00000000000000000000000000000000000000f1';
const PROJECT = 7n;

const FAMILIES = {
  JBBuybackHook: [HOOK, OLD_HOOK],
  JBBuybackHookRegistry: [REGISTRY, OLD_REGISTRY],
  REVOwner: [REV_OWNER],
  JBOmnichainDeployer: [OMNICHAIN],
};

/** A chain answering each read only at the contract and with the arguments it is for. */
function chain({ dataHook = ZERO, pay = true, cashOut = true, extra, hook721, hookOf = { [REGISTRY]: PINNED }, revnetRegistry = REGISTRY, fail } = {}) {
  const reads = [];
  return {
    reads,
    io: {
      ruleset: async () => {
        if (fail === 'ruleset') throw new Error('rpc down');
        return { hook: dataHook, rulesetId: 42n, useDataHookForPay: pay, useDataHookForCashOut: cashOut };
      },
      is: (address, family) => FAMILIES[family].includes(address),
      read: async (address, _abi, functionName, args) => {
        reads.push(functionName);
        if (fail === functionName) throw new Error('rpc down');
        const at = (expected, expectedArgs) => {
          if (address !== expected) throw new Error(functionName + ' read at ' + address);
          if (args.join() !== expectedArgs.join()) throw new Error(functionName + ' read with ' + args.join());
        };
        switch (functionName) {
          case 'BUYBACK_HOOK': at(REV_OWNER, []); return revnetRegistry;
          case 'hookOf':
            if (!(address in hookOf)) throw new Error('no registry at ' + address);
            at(address, [PROJECT]);
            return hookOf[address];
          case 'extraDataHookOf':
            at(OMNICHAIN, [PROJECT, 42n]);
            return { dataHook: extra ? extra.dataHook : ZERO, useDataHookForPay: extra ? extra.pay !== false : true, useDataHookForCashOut: extra ? extra.cashOut !== false : true };
          case 'tiered721HookOf':
            at(OMNICHAIN, [PROJECT, 42n]);
            return [hook721 ? hook721.hook : ZERO, hook721 ? hook721.cashOut : false];
          default: throw new Error('unexpected read ' + functionName);
        }
      },
    },
  };
}
const resolve = (setup, direction) => resolveBuybackHook(chain(setup).io, PROJECT, direction);

describe('resolveBuybackHook', () => {
  it('resolves the registry as the data hook through its hookOf', async () => {
    expect(await resolve({ dataHook: REGISTRY })).toBe(PINNED);
    expect(await resolve({ dataHook: REGISTRY, hookOf: { [REGISTRY]: ZERO } })).toBeNull();
  });

  it('finds no hook for a project whose ruleset calls another hook, or none, and never asks the registry', async () => {
    for (const dataHook of [OTHER, ZERO]) {
      const { io, reads } = chain({ dataHook });
      expect(await resolveBuybackHook(io, PROJECT)).toBeNull();
      expect(reads).not.toContain('hookOf');
    }
  });

  it("resolves a revnet through its owner contract's own registry", async () => {
    expect(await resolve({ dataHook: REV_OWNER, revnetRegistry: OLD_REGISTRY, hookOf: { [OLD_REGISTRY]: PINNED } })).toBe(PINNED);
  });

  it('takes a buyback hook of any generation as the data hook', async () => {
    expect(await resolve({ dataHook: HOOK })).toBe(HOOK);
    expect(await resolve({ dataHook: OLD_HOOK })).toBe(OLD_HOOK);
  });

  it("follows the direction's use flag", async () => {
    const setup = { dataHook: REGISTRY, pay: true, cashOut: false };
    expect(await resolve(setup, 'pay')).toBe(PINNED);
    expect(await resolve(setup)).toBe(PINNED);
    expect(await resolve(setup, 'cashOut')).toBeNull();
  });

  it("unwraps the omnichain deployer to the project's extra hook, by that hook's own flags", async () => {
    const setup = { dataHook: OMNICHAIN, extra: { dataHook: REGISTRY, pay: true, cashOut: false } };
    expect(await resolve(setup, 'pay')).toBe(PINNED);
    expect(await resolve(setup, 'cashOut')).toBeNull();
    expect(await resolve({ dataHook: OMNICHAIN })).toBeNull();
    expect(await resolve({ dataHook: OMNICHAIN, extra: { dataHook: OTHER } })).toBeNull();
  });

  it('skips the extra hook on a cash out a 721 hook handles, and only then', async () => {
    const setup = { dataHook: OMNICHAIN, extra: { dataHook: HOOK }, hook721: { hook: OTHER, cashOut: true } };
    expect(await resolve(setup, 'cashOut')).toBeNull();
    expect(await resolve(setup, 'pay')).toBe(HOOK);
    expect(await resolve({ ...setup, hook721: { hook: OTHER, cashOut: false } }, 'cashOut')).toBe(HOOK);
  });

  it('throws on a failed read instead of reporting no hook', async () => {
    await expect(resolve({ dataHook: REGISTRY, fail: 'ruleset' })).rejects.toThrow('rpc down');
    await expect(resolve({ dataHook: REGISTRY, fail: 'hookOf' })).rejects.toThrow('rpc down');
    await expect(resolve({ dataHook: REV_OWNER, fail: 'BUYBACK_HOOK' })).rejects.toThrow('rpc down');
    await expect(resolve({ dataHook: OMNICHAIN, extra: { dataHook: HOOK }, fail: 'extraDataHookOf' })).rejects.toThrow('rpc down');
  });
});

describe('the revnet cash out fee', () => {
  it('applies with a cash out tax, unless REVOwner skips it', () => {
    expect(revnetCashOutFeeApplies({ cashOutTaxRate: 2000 })).toBe(true);
    expect(revnetCashOutFeeApplies({ cashOutTaxRate: 0 })).toBe(false);
    expect(revnetCashOutFeeApplies({ cashOutTaxRate: 2000, feeTerminalExists: false })).toBe(false);
    expect(revnetCashOutFeeApplies({ cashOutTaxRate: 2000, beneficiaryIsFeeless: true })).toBe(false);
    expect(revnetCashOutFeeApplies({ cashOutTaxRate: 2000, holderIsSucker: true })).toBe(false);
    expect(revnetCashOutFeeApplies({})).toBeUndefined();
  });

  it('rounds as the contract does: count - count / 40', () => {
    expect(cashOutCountAfterRevnetFee(1n, true)).toBe(1n);
    expect(cashOutCountAfterRevnetFee(40n, true)).toBe(39n);
    expect(cashOutCountAfterRevnetFee(41n, true)).toBe(40n);
    expect(cashOutCountAfterRevnetFee(1_000n, true)).toBe(975n);
    expect(cashOutCountAfterRevnetFee(1_000n, false)).toBe(1_000n);
  });
});

describe('where the rules are used', () => {
  const discover = readFileSync('src/discover.js', 'utf8');

  it('resolves every project buyback hook through the one rule, the pool summary included', () => {
    const summary = discover.slice(discover.indexOf('function buybackPoolStateRead('));
    expect(summary.slice(0, 400)).toContain('projectBuybackHook(project, chainId, { strict: true })');
    expect(discover).toContain('return resolveBuybackHook({');
  });

  it("nets a revnet's own fee in the holder's cash out value and the unit value", () => {
    expect(discover).toContain("cashOutCountAfterRevnetFee(bal, !!project.isRevnet && !!taxRate)");
    expect(discover).toContain("cashOutCountAfterRevnetFee(ONE_TOKEN, !!project.isRevnet && !!taxRate)");
  });
});
