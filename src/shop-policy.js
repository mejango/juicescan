// Saved unsigned launch/add calls retain their original bytes. Refuse outdated economics before
// another authorization; callers reconcile already-submitted hashes before applying this policy.
export function assertNewTierPolicy(value) {
  if (!value || typeof value !== 'object') return;
  if (value.initialSupply != null && value.price != null && value.flags) {
    if (value.flags.useVotingUnits) throw new Error('This saved item uses custom voting units. Rebuild and review it with price-based governance.');
    if (BigInt(value.initialSupply) === 1n && BigInt(value.reserveFrequency || 0) > 0n) throw new Error('A reserved item needs a supply of at least 2 (or unlimited).');
  }
  Object.values(value).forEach(assertNewTierPolicy);
}

