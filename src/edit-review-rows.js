// Review rows that state what an owner edit changes: the value before and the value after, per chain.
// The same lines juicebox.money shows for the same edits.

var SPLITS_TOTAL = 1000000000n;

var METADATA_LABELS = {
  name: 'Name', projectTagline: 'Tagline', description: 'Description', payDisclosure: 'Payment notice',
  infoUri: 'Website', twitter: 'X / Twitter', discord: 'Discord', telegram: 'Telegram',
  whatsapp: 'WhatsApp', instagram: 'Instagram',
};

function reviewValue(value) {
  var text = String(value == null ? '' : value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '—';
  return text.length > 48 ? text.slice(0, 45) + '…' : text;
}

var own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
// A key that is missing differs from one that is present with null: the pinned file differs.
function sameKey(before, after, key) { return own(before, key) === own(after, key) && JSON.stringify(before[key]) === JSON.stringify(after[key]); }

// entries: [{ chainId, projectId, previous, metadata }]. One heading row per chain, then one row per changed key.
export function metadataChangeRows(entries, chainNameOf) {
  var rows = [];
  (entries || []).forEach(function (entry) {
    var name = chainNameOf(entry.chainId);
    var before = entry.previous || {}, after = entry.metadata || {};
    var keys = Object.keys(before).concat(Object.keys(after)).filter(function (key, index, all) { return all.indexOf(key) === index; });
    var changed = keys.filter(function (key) { return !sameKey(before, after, key); });
    rows.push([name, 'Project #' + entry.projectId]);
    changed.forEach(function (key) {
      var had = own(before, key) && before[key] !== '' && before[key] != null;
      var has = own(after, key) && after[key] !== '' && after[key] != null;
      if (METADATA_LABELS[key]) rows.push([name + ', ' + METADATA_LABELS[key], reviewValue(before[key]) + ' → ' + reviewValue(after[key])]);
      else if (key === 'logoUri') rows.push([name + ', Logo', !has ? 'Removed' : had ? 'Replaced' : 'Added']);
      else if (key === 'storeCategories') rows.push([name + ', Shop categories', !has ? 'Removed' : had ? 'Changed' : 'Added']);
      else rows.push([name + ', Custom property ' + key, own(after, key) ? 'Set to the reviewed value' : 'Removed']);
    });
    if (!changed.length) rows.push([name + ', Fields', 'Unchanged, this chain’s profile is pinned again as is']);
  });
  return rows;
}

function pct(billionths) { return String(Number((Number(billionths) / 1e7).toFixed(7))); }

function recipientText(split, now) {
  var beneficiary = String(split.beneficiary || '');
  var hook = String(split.hook || '');
  var none = /^0x0*$/.test(beneficiary) || !beneficiary;
  // With no project, no hook and no beneficiary, the contracts pay whoever sends the distribution.
  var who = /^0x0*$/.test(hook) || !hook
    ? (BigInt(split.projectId || 0) > 0n ? 'Project #' + BigInt(split.projectId) + (split.preferAddToBalance ? ' (added to its balance)' : none ? '' : ' (tokens to ' + beneficiary + ')')
      : none ? 'Whoever sends the distribution' : beneficiary)
    : 'Hook ' + hook;
  return who + ' ' + pct(split.percent) + '%' + (Number(split.lockedUntil || 0) > now ? ' (locked)' : '');
}

function allocated(splits) { return (splits || []).reduce(function (total, split) { return total + BigInt(split.percent); }, 0n); }

// One chain's split replacement: where it lands, who was paid, who will be, and what is left to the owner.
export function splitChangeRows(input) {
  var now = input.now == null ? Math.floor(Date.now() / 1000) : input.now;
  var list = function (splits) {
    return (splits || []).length ? splits.map(function (split) { return recipientText(split, now); }).join('; ') : 'None';
  };
  return [
    [input.chainName, 'Project #' + input.projectId + ', current ruleset ' + input.rulesetId],
    [input.chainName + ', Previous recipients', list(input.previous)],
    [input.chainName + ', New recipients', list(input.next)],
    [input.chainName + ', Owner remainder', pct(SPLITS_TOTAL - allocated(input.previous)) + '% → ' + pct(SPLITS_TOTAL - allocated(input.next)) + '%'],
  ];
}
