// Rules juicebox.money and revnet.money take from their SDK (resolveProjectBuybackHook, the revnet cash out fee),
// kept here by hand because Juicescan has no SDK. Change them in both places.

const ZERO = '0x0000000000000000000000000000000000000000';
const isZero = (address) => !address || address.toLowerCase() === ZERO;

const BUYBACK_HOOK_ABI = [{ type: 'function', name: 'BUYBACK_HOOK', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }];
const HOOK_OF_ABI = [{ type: 'function', name: 'hookOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ type: 'address' }] }];
const EXTRA_DATA_HOOK_OF_ABI = [{ type: 'function', name: 'extraDataHookOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'rulesetId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'dataHook', type: 'address' }, { name: 'useDataHookForPay', type: 'bool' }, { name: 'useDataHookForCashOut', type: 'bool' }] }] }];
const TIERED_721_HOOK_OF_ABI = [{ type: 'function', name: 'tiered721HookOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'rulesetId', type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'bool' }] }];

/**
 * The buyback hook a project's current ruleset calls when paid or cashed out, or null when it calls none. A registry
 * names a default hook for every project, so the answer always goes through the ruleset's data hook:
 * - a buyback hook of any generation: that hook;
 * - the buyback hook registry: its `hookOf`;
 * - a revnet's REVOwner: the registry it was deployed with (`BUYBACK_HOOK()`), then `hookOf`;
 * - the omnichain deployer: the project's extra data hook, by that hook's own use flags. On a cash out the
 *   deployer skips the extra hook when a 721 hook handles cash outs.
 * A ruleset that does not use its data hook for the direction calls no hook. A failed read throws.
 *
 * @param {object} io
 * @param {() => Promise<{hook: string, rulesetId: bigint, useDataHookForPay: boolean, useDataHookForCashOut: boolean}>} io.ruleset
 *   The current ruleset's data hook and flags; a zero hook when the project has no controller.
 * @param {(address: string, abi: object[], functionName: string, args: unknown[]) => Promise<unknown>} io.read
 * @param {(address: string, contract: string) => boolean} io.is The address is a deployment of `contract`, of any generation.
 * @param {bigint} projectId
 * @param {'pay'|'cashOut'} [direction]
 * @returns {Promise<string|null>}
 */
export async function resolveBuybackHook(io, projectId, direction) {
  const used = (flags) => !!(direction === 'cashOut' ? flags.useDataHookForCashOut : flags.useDataHookForPay);
  const behind = async (hook) => {
    if (io.is(hook, 'JBBuybackHook')) return hook;
    const revnet = io.is(hook, 'REVOwner');
    if (!revnet && !io.is(hook, 'JBBuybackHookRegistry')) return null;
    const registry = revnet ? await io.read(hook, BUYBACK_HOOK_ABI, 'BUYBACK_HOOK', []) : hook;
    const resolved = await io.read(registry, HOOK_OF_ABI, 'hookOf', [projectId]);
    return isZero(resolved) ? null : resolved;
  };

  const ruleset = await io.ruleset();
  if (isZero(ruleset.hook) || !used(ruleset)) return null;
  if (!io.is(ruleset.hook, 'JBOmnichainDeployer')) return behind(ruleset.hook);
  const args = [projectId, BigInt(ruleset.rulesetId)];
  if (direction === 'cashOut') {
    const tiered = await io.read(ruleset.hook, TIERED_721_HOOK_OF_ABI, 'tiered721HookOf', args);
    if (!isZero(tiered[0]) && tiered[1]) return null;
  }
  const extra = await io.read(ruleset.hook, EXTRA_DATA_HOOK_OF_ABI, 'extraDataHookOf', args);
  if (isZero(extra.dataHook) || !used(extra)) return null;
  return behind(extra.dataHook);
}

/**
 * Whether a revnet's own cash out fee applies: REVOwner skips it when the cash out tax is zero, when the fee
 * revnet has no terminal for the token, when the beneficiary is feeless, and when the holder is a sucker.
 * Undefined while the tax rate is unread.
 */
export function revnetCashOutFeeApplies({ cashOutTaxRate, feeTerminalExists = true, beneficiaryIsFeeless = false, holderIsSucker = false }) {
  if (cashOutTaxRate === undefined || cashOutTaxRate === null) return undefined;
  if (!feeTerminalExists || beneficiaryIsFeeless || holderIsSucker) return false;
  return BigInt(cashOutTaxRate) !== 0n;
}

/** The token count a revnet cash out reclaims against once its fee is taken: `count - count / 40`, as REVOwner rounds. */
export function cashOutCountAfterRevnetFee(count, applies) {
  return applies ? count - count / 40n : count;
}
