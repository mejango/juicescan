import { addrOrZero, isAddr, ZERO_ADDRESS as ZERO } from './component-base.js';

export var TIER_UNLIMITED_SUPPLY = 999999999;

var MEDIA_TYPE_BY_EXTENSION = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v', ogv: 'video/ogg',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', json: 'application/json',
};

// File.type can be empty for otherwise ordinary audio/video files on some browsers and operating systems. Preserve
// an extension-derived MIME in metadata so a raw IPFS CID (which has no filename) still renders with the right player.
export function mediaTypeForFile(file) {
  var explicit = String(file && file.type || '').trim().toLowerCase().split(';')[0];
  if (explicit && explicit !== 'application/octet-stream' && explicit !== 'binary/octet-stream') return explicit;
  var name = String(file && file.name || '').toLowerCase();
  var match = /\.([a-z0-9]+)$/.exec(name);
  return match ? (MEDIA_TYPE_BY_EXTENSION[match[1]] || '') : '';
}

// Canonical metadata for a 721 shop item. Images use the NFT `image` field; every other attached file
// (video/audio/PDF/text) uses `animation_url`, with its MIME retained so the storefront can render a real
// preview even though an IPFS CID has no filename extension.
export function build721TierMetadata(o) {
  o = o || {};
  var name = String(o.name || o.fallbackName || 'Item').trim() || 'Item';
  var meta = { name: name };
  if (o.description) meta.description = String(o.description);
  if (o.categoryName) meta.categoryName = String(o.categoryName);
  var mediaUri = String(o.mediaUri || o.imageUri || '').trim();
  var mediaType = String(o.mediaType || '').trim().toLowerCase();
  if (mediaUri) {
    if (mediaType) meta.mediaType = mediaType;
    if (mediaType.indexOf('image/') === 0) meta.image = mediaUri;
    else meta.animation_url = mediaUri;
  }
  return meta;
}

export function tierDiscountPercentFromPct(value) {
  if (value == null || String(value).trim() === '') return 0;
  var pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Discount must be between 0 and 100%.');
  return Math.round(pct * 2);
}

function clampTierInitialSupply(value, unlimited) {
  if (unlimited) return TIER_UNLIMITED_SUPPLY;
  var raw = String(value == null ? '' : value).trim();
  if (!/^\d+$/.test(raw)) throw new Error('Item supply must be a whole number.');
  var n = BigInt(raw);
  if (n <= 0n || n > BigInt(TIER_UNLIMITED_SUPPLY)) throw new Error('Item supply must be between 1 and ' + TIER_UNLIMITED_SUPPLY + '.');
  return Number(n);
}

function uintNumber(value, bits, label) {
  var raw = typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : String(value == null ? 0 : value).trim();
  if (!/^\d+$/.test(raw)) throw new Error(label + ' must be a whole number.');
  var n = BigInt(raw), max = (1n << BigInt(bits)) - 1n;
  if (n > max) throw new Error(label + ' is too large (max uint' + bits + ').');
  return Number(n);
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
  var price; try { price = BigInt(o.price || 0); } catch (_) { throw new Error('Item price must be an integer in base units.'); }
  if (price < 0n || price > (1n << 104n) - 1n) throw new Error('Item price is too large (max uint104).');
  var reserveFrequency = uintNumber(o.reserveFrequency || 0, 16, 'Reserve frequency');
  if (reserveFrequency > 0 && !isAddr(o.reserveBeneficiary)) throw new Error('A reserved item needs a valid reserve beneficiary.');
  var reserveBeneficiary = reserveFrequency > 0 ? addrOrZero(o.reserveBeneficiary) : ZERO;
  var votingUnits = uintNumber(o.votingUnits || 0, 32, 'Voting units');
  var category = uintNumber(o.category || 0, 24, 'Category');
  var discountPercent = uintNumber(o.discountPercent || 0, 8, 'Discount percent');
  if (discountPercent > 200) throw new Error('Discount percent exceeds the protocol maximum of 200.');
  var splitPercent = uintNumber(o.splitPercent || 0, 32, 'Split percent');
  if (splitPercent > 1000000000) throw new Error('Split percent exceeds 100%.');
  var flags = o.flags || {};
  return {
    price: price,
    initialSupply: clampTierInitialSupply(o.initialSupply, !!o.unlimited),
    votingUnits: votingUnits,
    reserveFrequency: reserveFrequency,
    reserveBeneficiary: reserveBeneficiary,
    encodedIpfsUri: o.encodedIpfsUri || ('0x' + '0'.repeat(64)),
    category: category,
    discountPercent: discountPercent,
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
    splitPercent: splitPercent,
    splits: o.splits || [],
  };
}
