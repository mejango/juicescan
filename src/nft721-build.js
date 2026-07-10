import { addrOrZero, ZERO_ADDRESS as ZERO } from './component-base.js';

export var TIER_UNLIMITED_SUPPLY = 999999999;

export function tierDiscountPercentFromPct(value) {
  var pct = parseFloat(value);
  if (!(pct > 0)) return 0;
  return Math.min(200, Math.round(pct / 100 * 200));
}

export function clampTierInitialSupply(value, unlimited) {
  if (unlimited) return TIER_UNLIMITED_SUPPLY;
  var n = Math.floor(Number(value) || 0);
  if (n < 0) return 0;
  if (n > TIER_UNLIMITED_SUPPLY) return TIER_UNLIMITED_SUPPLY;
  return n;
}

export function sortTierEntriesByCategory(entries, pickTier) {
  pickTier = pickTier || function (e) { return e.tier || e; };
  return entries.slice().sort(function (a, b) {
    var at = pickTier(a), bt = pickTier(b);
    var ac = Number((at && at.category) || 0);
    var bc = Number((bt && bt.category) || 0);
    if (ac !== bc) return ac - bc;
    return Number(a.order || 0) - Number(b.order || 0);
  });
}

export function build721TierConfig(o) {
  o = o || {};
  var reserveFrequency = Number(o.reserveFrequency || 0);
  var reserveBeneficiary = reserveFrequency > 0 ? addrOrZero(o.reserveBeneficiary) : ZERO;
  var votingUnits = Number(o.votingUnits || 0);
  var flags = o.flags || {};
  return {
    price: BigInt(o.price || 0),
    initialSupply: clampTierInitialSupply(o.initialSupply, !!o.unlimited),
    votingUnits: votingUnits,
    reserveFrequency: reserveFrequency,
    reserveBeneficiary: reserveBeneficiary,
    encodedIpfsUri: o.encodedIpfsUri || ('0x' + '0'.repeat(64)),
    category: Number(o.category) || 0,
    discountPercent: Number(o.discountPercent || 0),
    flags: {
      allowOwnerMint: !!flags.allowOwnerMint,
      useReserveBeneficiaryAsDefault: flags.useReserveBeneficiaryAsDefault != null
        ? !!flags.useReserveBeneficiaryAsDefault
        : reserveFrequency > 0 && reserveBeneficiary !== ZERO,
      transfersPausable: !!flags.transfersPausable,
      useVotingUnits: flags.useVotingUnits != null ? !!flags.useVotingUnits : votingUnits > 0,
      cantBeRemoved: !!flags.cantBeRemoved,
      cantIncreaseDiscountPercent: !!flags.cantIncreaseDiscountPercent,
      cantBuyWithCredits: !!flags.cantBuyWithCredits,
    },
    splitPercent: Number(o.splitPercent || 0),
    splits: o.splits || [],
  };
}
