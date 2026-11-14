// The shared `.jb` file (version 2, src/jb-draft-format.js) to and from the launch form's state.
// The form's own state stays the browser's saved draft; only files cross here. A file holding
// something this form cannot express is refused whole, never half opened.

import {
  emptyJbDraft, emptyJbDraftItem, emptyJbDraftSplit, emptyJbDraftStage, JbDraftError, jbDraftDecimal, jbDraftTokenCurrency, jbDraftUnsupported,
} from './jb-draft-format.js';

var SITE = 'Juicescan';
function refuse(what) { throw jbDraftUnsupported(SITE, what); }

var FOREVER_SECONDS = 4294967295;
var DAY = 86400;
var PAYOUT_MODE_OUT = { none: 'none', unlimited: 'all', limited: 'amounts' };
var PAYOUT_MODE_IN = { none: 'none', all: 'unlimited', amounts: 'limited' };
var SPLIT_TO = { wallet: 'address', project: 'project', lphook: 'fundMarket', customhook: 'hook' };
var SPLIT_TYPE = { address: 'wallet', project: 'project', fundMarket: 'lphook', hook: 'customhook' };

function text(value) { return String(value == null ? '' : value).trim(); }
// A typed number as the format's plain decimal. Throws on one the file can't hold.
var num = jbDraftDecimal;
// A stored number as a plain decimal. Zero, and anything that is not a positive number, is ''.
function positive(value) {
  var n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  var typed = String(n);
  return /e/i.test(typed) ? n.toFixed(18).replace(/\.?0+$/, '') : typed;
}
function hasEntries(map) { return Object.keys(map || {}).length > 0; }

// Move a decimal's point without a float: "20" by -2 is "0.2", "0.1234" by 2 is "12.34".
export function shiftDecimal(value, places) {
  if (value === '') return '';
  var parts = value.split('.');
  var whole = parts[0] || '', digits = whole + (parts[1] || '');
  var point = whole.length + places;
  if (point < 1) { digits = '0'.repeat(1 - point) + digits; point = 1; }
  while (digits.length < point) digits += '0';
  var left = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
  var right = digits.slice(point).replace(/0+$/, '');
  return right ? left + '.' + right : left;
}

// ---------------------------------------------------------------------------
// Form state to file
// ---------------------------------------------------------------------------

// `deps`: { canon(chainId), customCurrency(address) } from the launch form, which owns both rules.
export function toJbDraft(state, deps) {
  var revnet = state.projectType === 'revnet';
  var accepts = (state.accepts && state.accepts.length ? state.accepts : ['eth']).slice();
  var custom = accepts[0] === 'custom';
  var chains = (state.chainIds || []).map(Number);
  var details = state.details || {};
  var collection = state.collection || {};

  var customId = custom ? deps.customCurrency(text((state.customToken || {}).address)) : 0;
  function currency(id) {
    if (Number(id) === 1) return 'eth';
    if (Number(id) === 2) return 'usd';
    if (customId && Number(id) === customId) return 'token';
    throw new Error('This draft counts an amount in a currency a .jb file cannot name.');
  }
  // One field's per-chain overrides, for the chains this draft launches on.
  function chainMap(key, read) {
    var out = {};
    chains.forEach(function (chainId) {
      var store = (state.perChain || {})[deps.canon(chainId)];
      var value = store && store.addr ? store.addr[key] : '';
      value = (read || text)(value);
      if (value !== '') out[chainId] = value;
    });
    return out;
  }
  function splitOut(row, keys, lockOk, amounts) {
    var to = SPLIT_TO[row.type] || 'address';
    var out = emptyJbDraftSplit(to);
    out.lockedUntil = lockOk ? Number(row.lockedUntil) || 0 : 0;
    if (amounts) { out.amount = num(row.amountEth); out.amountPerChain = chainMap(keys.amount, num); }
    else out.share = positive(row.percent) || '0';
    // The Fund market hook pays the launching wallet, so its row names no one.
    if (to === 'fundMarket') return out;
    out.address = text(row.address);
    out.addressPerChain = chainMap(keys.address);
    if (to === 'project' || to === 'hook') {
      out.projectId = positive(row.projectId);
      out.projectIdPerChain = chainMap(keys.projectId, num);
    }
    if (to === 'project') out.addToBalance = !!row.preferAddToBalance;
    if (to === 'hook') out.hook = text(row.hookAddress);
    return out;
  }
  function reservedOut(stage, index, lockOk) {
    return (stage.reservedRecipients || []).map(function (row, n) {
      return splitOut(row, { address: 'r:' + index + ':' + n, projectId: 'rpid:' + index + ':' + n }, lockOk, false);
    });
  }

  function revnetStageOut(stage, index) {
    var out = emptyJbDraftStage('revnet', accepts);
    out.baseCurrency = custom ? 'token' : accepts.indexOf('usdc') !== -1 || Number(state.revBaseCurrency) === 2 ? 'usd' : 'eth'; // as the launch encodes it
    if (index === 0) out.startAt = stage.scheduleOn && stage.schedule ? Number(stage.schedule) || 0 : 0;
    else out.startAfterDays = positive(stage.startDaysAfter) || '30';
    out.issuance = num(stage.weight) || (index === 0 ? '0' : '');
    if (stage.issuanceCutOn && Number(stage.cutFreqDays) > 0) {
      out.cutDays = num(stage.cutFreqDays);
      out.cutPercent = positive(stage.weightCutPercent);
    }
    out.cashOutTax = shiftDecimal(positive(stage.cashOutTaxRate) || '0', -2);
    out.reserved = reservedOut(stage, index, false);
    out.autoIssuances = (stage.autoIssuances || []).map(function (row, n) {
      // A row mints on one chain: its own while still selected, else the first.
      var want = deps.canon(Number(row.chainId));
      var mint = chains.filter(function (chainId) { return deps.canon(chainId) === want; })[0] || chains[0] || 0;
      var store = (state.perChain || {})[deps.canon(mint)];
      var onChain = text(store && store.addr ? store.addr['ai:' + index + ':' + n] : '');
      return { count: num(row.count), address: onChain || text(row.address), chainId: mint };
    });
    out.metadataExtra = Number(stage.metadataExtra) || 0;
    return out;
  }

  function projectStageOut(stage, index) {
    var out = emptyJbDraftStage('project', accepts);
    var issues = stage.tokenMode !== 'none';
    var lockOk = Number(stage.durationSeconds) > 0;
    var byToken = accepts.length > 1 || custom;
    if (index === 0) out.startAt = stage.scheduleOn && stage.schedule ? Number(stage.schedule) || 0 : 0;
    else if (stage.startMode === 'date') out.startAt = Number(stage.startDate) || 0;
    else out.startAfterCycles = num(stage.startCycles) || '1';
    out.duration = Number(stage.durationSeconds) || 0;
    // This form has no "keep the rate before it": a blank is no issuance.
    out.issuance = issues ? num(stage.weight) || '0' : '0';
    out.baseCurrency = currency(stage.baseCurrency);
    out.cutPercent = issues ? positive(stage.weightCutPercent) : '';
    out.reserved = issues ? reservedOut(stage, index, lockOk) : [];
    var redeems = !!(state.shopEnabled && collection.useForRedemptions);
    out.payouts = accepts.map(function (token) {
      var held = byToken ? (stage.payoutByKind || {})[token] || { mode: 'none', recipients: [] }
        : { mode: stage.payoutMode, recipients: stage.payoutRecipients || [] };
      var mode = PAYOUT_MODE_OUT[held.mode] || 'none';
      var prefix = byToken ? 'pk' : 'p', scope = byToken ? token : index;
      return {
        token: token,
        mode: mode,
        // Amounts beside one token count in the stage's chosen currency; else in the token itself.
        currency: mode === 'amounts' && !byToken ? currency(stage.payoutCurrency) : jbDraftTokenCurrency(token),
        splits: mode === 'none' ? [] : (held.recipients || []).map(function (row, n) {
          return splitOut(row, {
            address: prefix + ':' + scope + ':' + n,
            projectId: prefix + 'pid:' + scope + ':' + n,
            amount: prefix + 'amt:' + scope + ':' + n,
          }, lockOk, mode === 'amounts');
        }),
      };
    });
    // An allowance needs surplus: none is left when every token pays out everything.
    var surplus = out.payouts.some(function (payout) { return payout.mode !== 'all'; });
    // Payouts of everything leave nothing to cash out: the launch sends 1.
    out.cashOutTax = (stage.cashOutEnabled || redeems) && surplus ? shiftDecimal(positive(stage.cashOutTaxRate) || '0', -2) : '1';
    if (stage.surplusAllowanceOn && surplus) {
      var limited = !byToken && !stage.surplusAllowanceUnlimited;
      out.surplusAllowance = limited
        ? { mode: 'limited', amount: num(stage.surplusAllowanceAmount), currency: currency(stage.surplusAllowanceCurrency) }
        : { mode: 'unlimited', amount: '', currency: jbDraftTokenCurrency(accepts[0]) };
    }
    // A stage that never ends has no next stage to approve.
    out.approval = out.duration === FOREVER_SECONDS ? 'none' : stage.deadline || 'none';
    out.holdFees = !!stage.holdFees;
    out.ownerMinting = !!stage.allowOwnerMinting;
    out.pausePay = !!stage.pausePay;
    out.pauseCreditTransfers = !!stage.pauseTransfers;
    out.pause721Transfers = !!stage.pause721Transfers;
    out.useTotalSurplusForCashOuts = !!stage.useTotalSurplusForCashOuts;
    out.ownerMustSendPayouts = !!stage.ownerMustSendPayouts;
    out.metadataExtra = Number(stage.metadataExtra) || 0;
    out.powers = {
      setTerminals: !!stage.allowSetTerminals,
      setController: !!stage.allowSetController,
      terminalMigration: !!stage.allowTerminalMigration,
      setCustomToken: !!stage.allowSetCustomToken,
      addAccountingContext: !!stage.allowAddAccountingContext,
      // A custom token is priced by feeds its owner adds: the launch grants that.
      addPriceFeed: !!stage.allowAddPriceFeed || custom,
    };
    return out;
  }

  function itemOut(item, index) {
    var out = emptyJbDraftItem();
    var flags = item.flags || {};
    out.name = item.name || '';
    out.description = item.description || '';
    out.mediaUri = text(item.imageUri);
    out.mediaType = item.mediaType || '';
    out.price = num(item.price);
    out.supply = item.limited ? num(item.supply) : '';
    out.supplyPerChain = item.limited ? chainMap('isup:' + index, num) : {};
    out.excludedChains = chains.filter(function (chainId) {
      var store = (state.perChain || {})[deps.canon(chainId)];
      var entry = store && store.items && store.items[index];
      return !!entry && entry.include === false;
    });
    out.discountPercent = item.discountOn ? num(item.discountPct) : '';
    if (item.reserveOn && Number(item.reserveFrequency) > 0) {
      out.reserveEvery = num(item.reserveFrequency);
      out.reserveBeneficiary = text(item.reserveBeneficiary);
      out.reserveBeneficiaryPerChain = chainMap('rb:' + index);
    }
    out.category = Number(item.category) || 0;
    out.splits = item.splitOn ? (item.splitRecipients || []).map(function (row, n) {
      var to = /^[0-9]+$/.test(text(row.recip)) && Number(row.recip) > 0 ? 'project' : 'address';
      var split = emptyJbDraftSplit(to);
      split.share = num(row.pct);
      if (to === 'project') {
        // The launch looks this project up on each other chain, so one id cannot say where the split goes there.
        if ((state.chainIds || []).length > 1) throw new JbDraftError("This draft has a shop item split to a project on more than one chain, which a .jb file can't hold.");
        split.projectId = text(row.recip); split.address = text(row.benef);
      }
      else { split.address = text(row.recip); split.addressPerChain = chainMap('is:' + index + ':' + n); }
      return split;
    }) : [];
    out.allowOwnerMint = !!flags.allowOwnerMint;
    out.transfersPausable = !!flags.transfersPausable;
    out.cantBeRemoved = !!flags.cantBeRemoved;
    out.allowCredits = flags.allowCredits !== false;
    out.ownerCanEditDiscount = flags.ownerCanEditDiscount !== false;
    return out;
  }

  var out = emptyJbDraft(revnet ? 'revnet' : 'project', accepts);
  out.name = details.name || '';
  out.ticker = details.ticker || '';
  out.tagline = details.tagline || '';
  out.description = details.description || '';
  out.payNotice = details.payDisclosure || '';
  out.tags = (details.tags || []).map(String);
  out.logoUri = text(details.logoUri);
  out.coverUri = text(details.coverImageUri);
  out.links = {
    website: text(details.website), twitter: text(details.twitter), discord: text(details.discord),
    telegram: text(details.telegram), instagram: text(details.instagram), whatsapp: text(details.whatsapp),
  };
  out.chains = chains;
  out.bridge = state.suckerType || 'ccip';
  out.owner = text(revnet ? state.revOperator : details.owner);
  out.ownerPerChain = chainMap(revnet ? 'op' : 'owner');
  out.customToken = custom ? text((state.customToken || {}).address) : '';
  out.anyToken = state.swapRouter !== false;
  if (!revnet) {
    out.approvalHook = text(state.approvalAddress);
    out.approvalHookPerChain = chainMap('approval');
    out.afterMode = state.afterMode || 'wait';
  }
  out.stages = (state.stages || []).map(revnet ? revnetStageOut : projectStageOut);
  out.shop = {
    currency: currency(state.storePricingCurrency),
    // As launched: what was typed, else the project's own name and ticker.
    collectionName: deps.collectionName(state),
    collectionSymbol: deps.collectionSymbol(state),
    preventOverspending: !!collection.preventOverspending,
    noNewTiersWithReserves: !!collection.noNewTiersWithReserves,
    noNewTiersWithVotes: !!collection.noNewTiersWithVotes,
    noNewTiersWithOwnerMinting: !!collection.noNewTiersWithOwnerMinting,
    // A revnet's launch sends neither of these two.
    issueTokensForSplits: !revnet && !!collection.issueTokensForSplits,
    itemsRedeem: !revnet && !!(state.shopEnabled && collection.useForRedemptions),
    operatorCanAdjustTiers: collection.opCanAdjustTiers !== false,
    operatorCanUpdateMetadata: collection.opCanUpdateMetadata !== false,
    operatorCanMint: collection.opCanMint !== false,
    operatorCanIncreaseDiscount: collection.opCanIncreaseDiscount !== false,
    categories: (state.storeCategories || []).map(function (entry) { return { id: Number(entry.id), name: String(entry.name || '') }; }),
    items: state.shopEnabled ? (state.nfts || []).map(itemOut) : [],
  };
  return out;
}

// ---------------------------------------------------------------------------
// File to form state
// ---------------------------------------------------------------------------

// `file` is a checked draft (checkJbDraft). `deps`: { state(), stage(), item(), pairs, canon(chainId),
// customCurrency(address), durationPresets } from the launch form. Returns form state for the form's own
// import path to normalize.
export function fromJbDraft(file, deps) {
  var revnet = file.kind === 'revnet';
  var accepts = file.accepts.slice();
  var custom = accepts[0] === 'custom';
  var byToken = !revnet && (accepts.length > 1 || custom);
  var state = deps.state();

  if (file.stages.length > 20) refuse('more than 20 stages');
  if (file.safe) refuse('a new Safe as the ' + (revnet ? 'operator' : 'owner'));
  if (!accepts.length) refuse('no accepted token');
  if (!file.chains.length) refuse('no chain chosen');
  var testnet = file.chains.map(function (chainId) {
    var pair = deps.pairs.filter(function (entry) { return entry.canon === chainId || entry.testnet === chainId; })[0];
    if (!pair) refuse('a chain this site does not launch on');
    return pair.testnet === chainId;
  });
  if (testnet.some(function (flag) { return flag !== testnet[0]; })) refuse('mainnets and testnets together');
  if (file.chains.length > 1 && !file.linkChains) refuse('chains that are not linked');
  if (custom && !file.customToken) refuse('a custom token without its address');
  var customId = custom ? deps.customCurrency(file.customToken) : 0;
  if (custom && !customId) refuse('a custom token named by something other than its address');

  function currencyId(unit) { return unit === 'token' ? customId : unit === 'usd' ? 2 : 1; }
  // With USDC accepted, everything is counted in USD so both tokens have a price.
  function forcedUsd(unit, what) {
    if (!custom && accepts.indexOf('usdc') !== -1 && unit !== 'usd') refuse(what + ' not counted in USD while USDC is accepted');
  }
  function setOnChain(chainId, key, value) {
    if (file.chains.indexOf(Number(chainId)) === -1) refuse('a value for a chain it does not launch on');
    var canon = deps.canon(Number(chainId));
    if (!state.perChain[canon]) state.perChain[canon] = { payouts: {}, items: {}, addr: {} };
    state.perChain[canon].addr[key] = value;
  }
  function chainMapIn(map, key) { Object.keys(map).forEach(function (chainId) { setOnChain(chainId, key, map[chainId]); }); }
  // A per-chain name is looked up only where its field shows, so one that never shows would launch as no address.
  function chainAddressesIn(map, key) {
    Object.keys(map).forEach(function (chainId) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(map[chainId])) refuse('a per-chain address given as a name');
    });
    chainMapIn(map, key);
  }

  function splitIn(row, keys, lockOk, amounts) {
    if (row.to === 'sticky') refuse('a Sticky split');
    if (row.lockedUntil > 0 && !lockOk) refuse(revnet ? 'a locked split' : 'a locked split in a stage with no cycle');
    var out = {
      type: SPLIT_TYPE[row.to], address: '', projectId: 0, percent: amounts ? 0 : Number(row.share) || 0, amountEth: '',
      preferAddToBalance: row.addToBalance, lockedUntil: row.lockedUntil, hookAddress: row.hook,
    };
    if (amounts) { out.amountEth = row.amount; chainMapIn(row.amountPerChain, keys.amount); }
    if (row.to === 'fundMarket') {
      // The hook reads the paying project, not the row: a recipient or project id here changes nothing.
      if (hasEntries(row.addressPerChain)) refuse('a Fund market split that differs by chain');
      return out;
    }
    out.address = row.address;
    chainAddressesIn(row.addressPerChain, keys.address);
    if (row.to === 'project' || row.to === 'hook') {
      if (row.projectId && !Number.isSafeInteger(Number(row.projectId))) refuse('a project id that is not a whole number');
      out.projectId = Number(row.projectId) || 0;
      chainMapIn(row.projectIdPerChain, keys.projectId);
    }
    return out;
  }
  function reservedIn(stage, index, lockOk) {
    return stage.reserved.map(function (row, n) {
      return splitIn(row, { address: 'r:' + index + ':' + n, projectId: 'rpid:' + index + ':' + n }, lockOk, false);
    });
  }
  function percentIn(value) { return Number(value) || 0; }

  function revnetStageIn(stage, index) {
    var out = deps.stage();
    if (index === 0 && stage.startAt > 0) { out.scheduleOn = true; out.schedule = String(stage.startAt); }
    if (index > 0) {
      if (!(Number(stage.startAfterDays) >= 1)) refuse('a later stage that starts less than a day after the one before');
      out.startDaysAfter = stage.startAfterDays;
    }
    out.weight = stage.issuance;
    out.issuanceCutOn = stage.cutDays !== '';
    if (out.issuanceCutOn) out.cutFreqDays = stage.cutDays;
    out.weightCutPercent = percentIn(stage.cutPercent);
    out.cashOutEnabled = true;
    out.cashOutTaxRate = Number(shiftDecimal(stage.cashOutTax || '0', 2));
    out.pause721Transfers = true;
    out.reservedRecipients = reservedIn(stage, index, false);
    out.autoIssuances = stage.autoIssuances.map(function (row) {
      return { count: row.count, address: row.address, chainId: row.chainId };
    });
    out.metadataExtra = stage.metadataExtra;
    return out;
  }

  function durationIn(out, seconds) {
    out.durationSeconds = seconds;
    var preset = seconds === 0 || seconds === FOREVER_SECONDS
      || deps.durationPresets.some(function (entry) { return entry.seconds === seconds; });
    if (preset) return;
    var unit = seconds % DAY === 0 ? 'days' : 'hours';
    out.durationCustom = true;
    out.customDurUnit = unit;
    out.customDurVal = String(seconds / (unit === 'days' ? DAY : 3600));
    if (Math.round(Number(out.customDurVal) * (unit === 'days' ? DAY : 3600)) !== seconds || /e/i.test(out.customDurVal)) {
      refuse('a cycle length this form cannot show');
    }
  }

  var perChainPayouts = {};
  function projectStageIn(stage, index) {
    var out = deps.stage();
    var lockOk = stage.duration > 0;
    if (index === 0) {
      if (stage.startAt > 0) { out.scheduleOn = true; out.schedule = String(stage.startAt); }
    } else if (stage.startAt > 0) { out.startMode = 'date'; out.startDate = String(stage.startAt); }
    else {
      if (!/^[1-9]\d*$/.test(stage.startAfterCycles)) refuse('a later stage with no start');
      out.startMode = 'cycles'; out.startCycles = stage.startAfterCycles;
    }
    durationIn(out, stage.duration);
    if (index > 0 && stage.issuance === '') refuse('a later stage that keeps the issuance before it');
    out.tokenMode = 'custom';
    out.weight = stage.issuance;
    forcedUsd(stage.baseCurrency, 'issuance');
    out.baseCurrency = currencyId(stage.baseCurrency);
    out.weightCutPercent = percentIn(stage.cutPercent);
    out.reservedRecipients = reservedIn(stage, index, lockOk);
    out.reservedPercent = out.reservedRecipients.reduce(function (sum, row) { return sum + row.percent; }, 0);
    var tax = Number(stage.cashOutTax || '0');
    // Items that redeem take cash outs in place of the token, at this same tax.
    out.cashOutEnabled = tax < 1 && !file.shop.itemsRedeem;
    out.cashOutTaxRate = tax < 1 || file.shop.itemsRedeem ? Number(shiftDecimal(stage.cashOutTax || '0', 2)) : 0;

    // By token, amounts count in each token itself; the stage's own currency then follows the accepted set.
    out.payoutCurrency = custom ? customId : accepts.indexOf('usdc') !== -1 ? 2 : currencyId(stage.payouts[0].currency);
    stage.payouts.forEach(function (payout) {
      var mode = PAYOUT_MODE_IN[payout.mode];
      var amounts = payout.mode === 'amounts';
      var prefix = byToken ? 'pk' : 'p', scope = byToken ? payout.token : index;
      if (byToken && payout.currency !== jbDraftTokenCurrency(payout.token)) {
        refuse('payouts counted in another currency than their token');
      }
      if (!byToken) forcedUsd(payout.currency, 'payouts');
      // By token, a row's per-chain values are held once for every stage.
      if (byToken) payout.splits.forEach(function (row, n) {
        var held = JSON.stringify([row.addressPerChain, row.projectIdPerChain, row.amountPerChain].map(function (map) {
          return Object.keys(map).sort().map(function (chainId) { return [chainId, map[chainId]]; });
        }));
        var at = payout.token + ':' + n;
        if (at in perChainPayouts && perChainPayouts[at] !== held) refuse('per-chain payout values that differ by stage');
        perChainPayouts[at] = held;
      });
      var recipients = payout.splits.map(function (row, n) {
        return splitIn(row, {
          address: prefix + ':' + scope + ':' + n,
          projectId: prefix + 'pid:' + scope + ':' + n,
          amount: prefix + 'amt:' + scope + ':' + n,
        }, lockOk, amounts);
      });
      if (byToken) out.payoutByKind[payout.token] = { mode: mode, recipients: recipients };
      else { out.payoutMode = mode; out.payoutRecipients = recipients; }
    });
    var allowance = stage.surplusAllowance;
    var surplus = stage.payouts.some(function (payout) { return payout.mode !== 'all'; });
    if (!surplus && tax < 1) refuse('a cash out tax under 1 beside payouts of everything');
    if (allowance.mode !== 'none') {
      if (!surplus) refuse('an owner allowance beside payouts of everything');
      if (byToken && allowance.mode === 'limited') refuse('a limited owner allowance beside payouts by token');
      out.surplusAllowanceOn = true;
      out.surplusAllowanceUnlimited = allowance.mode === 'unlimited';
      if (allowance.mode === 'limited') {
        forcedUsd(allowance.currency, 'an owner allowance');
        out.surplusAllowanceAmount = allowance.amount;
        out.surplusAllowanceCurrency = currencyId(allowance.currency);
      }
    }
    if (!out.surplusAllowanceOn || out.surplusAllowanceUnlimited) out.surplusAllowanceCurrency = out.payoutCurrency;
    if (stage.duration === FOREVER_SECONDS && stage.approval !== 'none') refuse('an approval rule on a stage that never ends');
    out.deadline = stage.approval;
    out.holdFees = stage.holdFees;
    out.allowOwnerMinting = stage.ownerMinting;
    out.pausePay = stage.pausePay;
    out.pauseTransfers = stage.pauseCreditTransfers;
    out.pause721Transfers = stage.pause721Transfers;
    out.useTotalSurplusForCashOuts = stage.useTotalSurplusForCashOuts;
    out.ownerMustSendPayouts = stage.ownerMustSendPayouts;
    out.metadataExtra = stage.metadataExtra;
    out.allowSetTerminals = stage.powers.setTerminals;
    out.allowSetController = stage.powers.setController;
    out.allowTerminalMigration = stage.powers.terminalMigration;
    out.allowSetCustomToken = stage.powers.setCustomToken;
    out.allowAddAccountingContext = stage.powers.addAccountingContext;
    if (custom && !stage.powers.addPriceFeed) refuse('a custom token without the power to add price feeds');
    out.allowAddPriceFeed = stage.powers.addPriceFeed;
    return out;
  }

  function itemIn(item, index) {
    var out = deps.item();
    if (Number(item.votingUnits) > 0) refuse('a shop item with voting units');
    out.name = item.name;
    out.description = item.description;
    out.imageUri = item.mediaUri;
    out.mediaType = item.mediaType;
    // The launch pins each item's metadata from the fields here, so a file's own document would be replaced.
    if (item.metadataUri) refuse('a shop item with its own metadata file');
    out.price = item.price;
    out.limited = item.supply !== '';
    out.supply = item.supply;
    Object.keys(item.supplyPerChain).forEach(function (chainId) {
      if (!out.limited) refuse('a per-chain quantity on an unlimited shop item');
      if (item.supplyPerChain[chainId] === 'unlimited') refuse('a shop item unlimited on one chain only');
      setOnChain(chainId, 'isup:' + index, item.supplyPerChain[chainId]);
    });
    item.excludedChains.forEach(function (chainId) {
      if (file.chains.indexOf(chainId) === -1) refuse('a value for a chain it does not launch on');
      var canon = deps.canon(chainId);
      if (!state.perChain[canon]) state.perChain[canon] = { payouts: {}, items: {}, addr: {} };
      state.perChain[canon].items[index] = { include: false };
    });
    out.discountOn = Number(item.discountPercent) > 0;
    out.discountPct = out.discountOn ? item.discountPercent : '';
    out.reserveOn = Number(item.reserveEvery) > 0;
    if (out.reserveOn) {
      out.reserveFrequency = item.reserveEvery;
      out.reserveBeneficiary = item.reserveBeneficiary;
      chainAddressesIn(item.reserveBeneficiaryPerChain, 'rb:' + index);
    } else if (item.reserveBeneficiary || hasEntries(item.reserveBeneficiaryPerChain)) {
      refuse('a reserved item beneficiary with nothing reserved');
    }
    out.category = item.category;
    out.splitOn = item.splits.length > 0;
    out.splitRecipients = item.splits.map(function (row, n) {
      if (row.to !== 'address' && row.to !== 'project') refuse('a shop item split to a hook');
      if (row.lockedUntil > 0) refuse('a locked shop item split');
      if (row.addToBalance) refuse('a shop item split added to a project balance');
      if (row.to === 'project') {
        if (hasEntries(row.projectIdPerChain) || hasEntries(row.addressPerChain)) refuse('a shop item project split that differs by chain');
        if (!/^[1-9]\d*$/.test(row.projectId)) refuse('a shop item project split with no project');
        if (file.chains.length > 1) refuse('a shop item split to a project on more than one chain');
        if (row.address && !/^0x[0-9a-fA-F]{40}$/.test(row.address)) refuse('a shop item split given as a name');
        return { pct: row.share, recip: row.projectId, benef: row.address };
      }
      if (!row.address && hasEntries(row.addressPerChain)) refuse('a shop item split with no address for every chain');
      // An item's fields open only on demand, so a name here might never be looked up before launch.
      if (row.address && !/^0x[0-9a-fA-F]{40}$/.test(row.address)) refuse('a shop item split given as a name');
      chainAddressesIn(row.addressPerChain, 'is:' + index + ':' + n);
      return { pct: row.share, recip: row.address, benef: '' };
    });
    out.flags = {
      allowOwnerMint: item.allowOwnerMint, transfersPausable: item.transfersPausable, cantBeRemoved: item.cantBeRemoved,
      allowCredits: item.allowCredits, ownerCanEditDiscount: item.ownerCanEditDiscount,
    };
    out.expanded = false;
    return out;
  }

  state.projectType = revnet ? 'revnet' : 'custom';
  state.network = testnet[0] ? 'testnet' : 'mainnet';
  state.chainIds = file.chains.slice();
  state.accepts = accepts;
  if (custom) state.customToken.address = file.customToken;
  state.swapRouter = file.anyToken;
  state.suckerType = file.bridge;
  var details = state.details;
  details.name = file.name; details.ticker = file.ticker; details.tagline = file.tagline;
  details.description = file.description; details.payDisclosure = file.payNotice; details.tags = file.tags.slice();
  details.logoUri = file.logoUri; details.coverImageUri = file.coverUri;
  details.website = file.links.website; details.twitter = file.links.twitter; details.discord = file.links.discord;
  details.telegram = file.links.telegram; details.instagram = file.links.instagram; details.whatsapp = file.links.whatsapp;
  if (revnet) state.revOperator = file.owner; else details.owner = file.owner;
  chainAddressesIn(file.ownerPerChain, revnet ? 'op' : 'owner');

  if (revnet) {
    var base = file.stages[0].baseCurrency;
    if (file.stages.some(function (stage) { return stage.baseCurrency !== base; })) refuse('stages priced in different currencies');
    forcedUsd(base, 'issuance');
    if (custom !== (base === 'token')) refuse('issuance priced in another currency than its token');
    state.revBaseCurrency = currencyId(base);
    state.stages = file.stages.map(revnetStageIn);
  } else {
    state.approvalAddress = file.approvalHook;
    chainAddressesIn(file.approvalHookPerChain, 'approval');
    if (!file.approvalHook && file.stages.some(function (stage) { return stage.approval === 'custom'; })) {
      refuse('a custom approval rule without its contract');
    }
    state.afterMode = file.afterMode;
    state.stages = file.stages.map(projectStageIn);
  }

  var shop = file.shop;
  forcedUsd(shop.currency, 'shop prices');
  if (custom !== (shop.currency === 'token')) refuse('a shop priced in another currency than its token');
  state.storePricingCurrency = currencyId(shop.currency);
  var collection = state.collection;
  if (shop.collectionName) { collection.name = shop.collectionName; collection.nameTouched = true; }
  if (shop.collectionSymbol) { collection.symbol = shop.collectionSymbol; collection.symbolTouched = true; }
  collection.preventOverspending = shop.preventOverspending;
  collection.noNewTiersWithReserves = shop.noNewTiersWithReserves;
  collection.noNewTiersWithVotes = shop.noNewTiersWithVotes;
  collection.noNewTiersWithOwnerMinting = shop.noNewTiersWithOwnerMinting;
  collection.issueTokensForSplits = shop.issueTokensForSplits;
  collection.useForRedemptions = shop.itemsRedeem;
  collection.opCanAdjustTiers = shop.operatorCanAdjustTiers;
  collection.opCanUpdateMetadata = shop.operatorCanUpdateMetadata;
  collection.opCanMint = shop.operatorCanMint;
  collection.opCanIncreaseDiscount = shop.operatorCanIncreaseDiscount;
  if (shop.itemsRedeem && !shop.items.length) refuse('shop items that cash out with no items');
  // Items cash out only where there are items: a chain with none would launch with cash outs off.
  if (shop.itemsRedeem && file.chains.some(function (chainId) {
    return shop.items.every(function (item) { return item.excludedChains.indexOf(chainId) !== -1; });
  })) refuse('shop items that cash out on a chain with no items');
  state.storeCategories = shop.categories.map(function (entry) { return { id: entry.id, name: entry.name }; });
  state.nfts = shop.items.map(itemIn);
  state.shopEnabled = shop.items.length > 0;
  return state;
}
