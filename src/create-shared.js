// src/create-shared.js
// Create-flow pieces that project pages use without opening the wizard: the launch/queue ABI tuple shapes,
// the split-sales copy, the toggle row, the deploy salt and split filling. create-flow.js itself loads on
// demand, so these live here.

import { keccak256, stringToHex } from 'viem';
import { el } from './component-base.js';

// Keep this contract flag's builder-facing language identical across the
// create flow and project shop config (and aligned with the sibling clients).
export var SPLIT_SALES_TOKEN_CREDIT_TITLE = 'Full token credit on split sales';
export var SPLIT_SALES_TOKEN_CREDIT_ON = 'Buyers get project tokens for their entire payment, even the portion an item routes to splits.';
export var SPLIT_SALES_TOKEN_CREDIT_OFF = 'Tokens are only issued for what stays in the project.';

export var SPLITS_TOTAL = 1000000000; // 1e9

// ---------------------------------------------------------------------------
// ABI building blocks (shared struct components)
// ---------------------------------------------------------------------------

// Field order MUST match the onchain JBSplit struct exactly (the selector hashes the tuple types in
// order): percent, projectId, beneficiary, preferAddToBalance, lockedUntil, hook.
export var SPLIT_COMPONENTS = [
  { name: 'percent', type: 'uint32' },
  { name: 'projectId', type: 'uint64' },
  { name: 'beneficiary', type: 'address' },
  { name: 'preferAddToBalance', type: 'bool' },
  { name: 'lockedUntil', type: 'uint48' },
  { name: 'hook', type: 'address' },
];
var SPLIT_GROUP_COMPONENTS = [
  { name: 'groupId', type: 'uint256' },
  { name: 'splits', type: 'tuple[]', components: SPLIT_COMPONENTS },
];
var FUND_ACCESS_COMPONENTS = [
  { name: 'terminal', type: 'address' },
  { name: 'token', type: 'address' },
  { name: 'payoutLimits', type: 'tuple[]', components: [
    { name: 'amount', type: 'uint224' }, { name: 'currency', type: 'uint32' }] },
  { name: 'surplusAllowances', type: 'tuple[]', components: [
    { name: 'amount', type: 'uint224' }, { name: 'currency', type: 'uint32' }] },
];
export var METADATA_FULL = [
  { name: 'reservedPercent', type: 'uint16' }, { name: 'cashOutTaxRate', type: 'uint16' },
  { name: 'baseCurrency', type: 'uint32' }, { name: 'pausePay', type: 'bool' },
  { name: 'pauseCreditTransfers', type: 'bool' }, { name: 'allowOwnerMinting', type: 'bool' },
  { name: 'allowSetCustomToken', type: 'bool' }, { name: 'allowTerminalMigration', type: 'bool' },
  { name: 'allowSetTerminals', type: 'bool' }, { name: 'allowSetController', type: 'bool' },
  { name: 'allowAddAccountingContext', type: 'bool' }, { name: 'allowAddPriceFeed', type: 'bool' },
  { name: 'ownerMustSendPayouts', type: 'bool' }, { name: 'holdFees', type: 'bool' },
  { name: 'scopeCashOutsToLocalBalances', type: 'bool' }, { name: 'useDataHookForPay', type: 'bool' },
  { name: 'useDataHookForCashOut', type: 'bool' }, { name: 'dataHook', type: 'address' },
  { name: 'metadata', type: 'uint16' },
];
var METADATA_PAYHOOK = [
  { name: 'reservedPercent', type: 'uint16' }, { name: 'cashOutTaxRate', type: 'uint16' },
  { name: 'baseCurrency', type: 'uint32' }, { name: 'pausePay', type: 'bool' },
  { name: 'pauseCreditTransfers', type: 'bool' }, { name: 'allowOwnerMinting', type: 'bool' },
  { name: 'allowSetCustomToken', type: 'bool' }, { name: 'allowTerminalMigration', type: 'bool' },
  { name: 'allowSetTerminals', type: 'bool' }, { name: 'allowSetController', type: 'bool' },
  { name: 'allowAddAccountingContext', type: 'bool' }, { name: 'allowAddPriceFeed', type: 'bool' },
  { name: 'ownerMustSendPayouts', type: 'bool' }, { name: 'holdFees', type: 'bool' },
  { name: 'scopeCashOutsToLocalBalances', type: 'bool' }, { name: 'useDataHookForCashOut', type: 'bool' },
  { name: 'metadata', type: 'uint16' },
];
export function rulesetConfigComponents(metaComponents) {
  return [
    { name: 'mustStartAtOrAfter', type: 'uint48' }, { name: 'duration', type: 'uint32' },
    { name: 'weight', type: 'uint112' }, { name: 'weightCutPercent', type: 'uint32' },
    { name: 'approvalHook', type: 'address' },
    { name: 'metadata', type: 'tuple', components: metaComponents },
    { name: 'splitGroups', type: 'tuple[]', components: SPLIT_GROUP_COMPONENTS },
    { name: 'fundAccessLimitGroups', type: 'tuple[]', components: FUND_ACCESS_COMPONENTS },
  ];
}
// JBPayDataHookRulesetConfig is the reduced ruleset shape accepted by the single-chain 721 project deployer.
// Export the canonical tuple components so queue builders cannot accidentally substitute a full
// JBRulesetConfig[] (which has a different selector even though most fields look identical).
export var PAY_DATA_HOOK_RULESET_COMPONENTS = rulesetConfigComponents(METADATA_PAYHOOK);
export var TERMINAL_CONFIG_COMPONENTS = [
  { name: 'terminal', type: 'address' },
  { name: 'accountingContextsToAccept', type: 'tuple[]', components: [
    { name: 'token', type: 'address' }, { name: 'decimals', type: 'uint8' }, { name: 'currency', type: 'uint32' }] },
];
// 721
var TIER_FLAGS = [
  { name: 'allowOwnerMint', type: 'bool' }, { name: 'useReserveBeneficiaryAsDefault', type: 'bool' },
  { name: 'transfersPausable', type: 'bool' }, { name: 'useVotingUnits', type: 'bool' },
  { name: 'cantBeRemoved', type: 'bool' }, { name: 'cantIncreaseDiscountPercent', type: 'bool' },
  { name: 'cantBuyWithCredits', type: 'bool' },
];
export var TIER_COMPONENTS = [
  { name: 'price', type: 'uint104' }, { name: 'initialSupply', type: 'uint32' },
  { name: 'votingUnits', type: 'uint32' }, { name: 'reserveFrequency', type: 'uint16' },
  { name: 'reserveBeneficiary', type: 'address' }, { name: 'encodedIpfsUri', type: 'bytes32' },
  { name: 'category', type: 'uint24' }, { name: 'discountPercent', type: 'uint8' },
  { name: 'flags', type: 'tuple', components: TIER_FLAGS },
  { name: 'splitPercent', type: 'uint32' },
  { name: 'splits', type: 'tuple[]', components: SPLIT_COMPONENTS },
];
var HOOK_FLAGS = [
  { name: 'noNewTiersWithReserves', type: 'bool' }, { name: 'noNewTiersWithVotes', type: 'bool' },
  { name: 'noNewTiersWithOwnerMinting', type: 'bool' }, { name: 'preventOverspending', type: 'bool' },
  { name: 'issueTokensForSplits', type: 'bool' },
];
export var DEPLOY_721_COMPONENTS = [
  { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'baseUri', type: 'string' },
  { name: 'tokenUriResolver', type: 'address' }, { name: 'contractUri', type: 'string' },
  { name: 'tiersConfig', type: 'tuple', components: [
    { name: 'tiers', type: 'tuple[]', components: TIER_COMPONENTS },
    { name: 'currency', type: 'uint32' }, { name: 'decimals', type: 'uint8' }] },
  { name: 'flags', type: 'tuple', components: HOOK_FLAGS },
];
export function toggleRow(label, desc, checked, onChange) {
  var w = el('div', 'create-toggle-row');
  var lbl = el('label', 'create-toggle');
  var cb = el('input', '');
  cb.type = 'checkbox'; cb.checked = !!checked;
  function descAt(state) { return typeof desc === 'function' ? desc(state) : desc; }
  var d = null;
  cb.addEventListener('change', function () { if (d) d.textContent = descAt(cb.checked); onChange(cb.checked); });
  lbl.appendChild(cb);
  var t = el('span', 'create-toggle-label'); t.textContent = label;
  lbl.appendChild(t);
  w.appendChild(lbl);
  var hasDesc = (typeof desc === 'function') ? (descAt(true) || descAt(false)) : desc;
  if (hasDesc) { d = el('div', 'create-hint'); d.textContent = descAt(!!checked); w.appendChild(d); }
  return w;
}

// Deterministic salt — same on every chain (so omnichain sucker addresses match). No Math.random.
export function deploySalt(state, owner) {
  return keccak256(stringToHex((state.details.name || 'project') + ':' + String(owner).toLowerCase()));
}

// Adjust a list of integer split shares so they sum to EXACTLY SPLITS_TOTAL (1e9). Per-row rounding can
// drift a few atoms above/below; JBSplits reverts if a group EXCEEDS SPLITS_TOTAL. We correct the drift on
// the largest share (always non-zero, can't go negative for tiny deltas). Use for groups meant to
// distribute 100% (reserved tokens, limited payouts). Returns the same array, mutated.
export function fillSplits(rawShares) {
  if (!rawShares.length) return rawShares;
  var sum = rawShares.reduce(function (s, v) { return s + v; }, 0);
  var delta = SPLITS_TOTAL - sum;
  if (delta !== 0) {
    var maxI = 0;
    for (var i = 1; i < rawShares.length; i++) if (rawShares[i] > rawShares[maxI]) maxI = i;
    rawShares[maxI] = Math.max(0, rawShares[maxI] + delta);
  }
  return rawShares;
}
