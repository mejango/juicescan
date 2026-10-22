// Rebuild a live project as an editable .jb create draft. Loaded on demand when someone exports a project.
import { formatEther } from 'viem';
import { getAddress, formatAmount, ZERO_ADDRESS, NATIVE_TOKEN } from './component-base.js';
import { isNativeInventory, nativeActionUnavailable } from './nft-inventory.js';
import { TIER_UNLIMITED_SUPPLY } from './nft721-build.js';
import { decode721RulesetMetadata } from './nft721-ruleset.js';
import * as createFlow from './create-flow.js';
import {
  OMNI_EXTRA_HOOK_ABI, OMNI_TIERED_HOOK_ABI, PROJECT_DRAFT_721_META_ABI, RESERVED_TOKEN_SPLIT_GROUP, USDC_BY_CHAIN,
  chainNameOf, clientFor, controllerAddressFor, currentRulesetAbi, draftDeadlineFor, draftRecipientFromSplit,
  fetchProjectTiers, isKnown721HookClone, isZeroishAddress, ownerOfAbi, payoutLimitsAbi, pidOn, projectChains, read,
  resolveAcctTokens, resolveTierMedia, revnetOperatorOf, sameAddr, splitsOfAbi, surplusAllowancesAbi, terminalOfAbi,
  terminalsOfAbi, toBigInt, tokenCurrencyIdForAccounting, upcomingRulesetAbi,
} from './discover.js';

export { exportDraftFile } from './create-flow.js';

// Packed permissions bitmap an operator holds for (account, projectId). Bit N set → permission id N granted.
var jbPermissionsOfAbi = [{
  type: 'function', name: 'permissionsOf', stateMutability: 'view',
  inputs: [{ name: 'operator', type: 'address' }, { name: 'account', type: 'address' }, { name: 'projectId', type: 'uint256' }],
  outputs: [{ type: 'uint256' }],
}];

// ---------------------------------------------------------------------------
// Existing project -> canonical .jb create draft
// ---------------------------------------------------------------------------

var PROJECT_DRAFT_SPLITS_TOTAL = 1000000000;
var PROJECT_DRAFT_UNLIMITED = 2n ** 200n;
var PROJECT_DRAFT_721_FLAGS_ABI = [{
  type: 'function', name: 'flagsOf', stateMutability: 'view', inputs: [{ type: 'address' }],
  outputs: [{ type: 'tuple', components: [
    { name: 'noNewTiersWithReserves', type: 'bool' }, { name: 'noNewTiersWithVotes', type: 'bool' },
    { name: 'noNewTiersWithOwnerMinting', type: 'bool' }, { name: 'preventOverspending', type: 'bool' },
    { name: 'issueTokensForSplits', type: 'bool' },
  ] }],
}];
var PROJECT_DRAFT_SUCKER_PAIRS_ABI = [{
  type: 'function', name: 'suckerPairsOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }],
  outputs: [{ type: 'tuple[]', components: [
    { name: 'local', type: 'address' }, { name: 'remote', type: 'bytes32' }, { name: 'remoteChainId', type: 'uint256' },
  ] }],
}];
var PROJECT_DRAFT_SUCKER_DEPLOYER_ABI = [{ type: 'function', name: 'deployer', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }];

function draftFingerprint(value) {
  return JSON.stringify(value, function (_, v) { return typeof v === 'bigint' ? v.toString() : v; });
}

function draftCanonChainId(chainId) {
  var map = { 11155111: 1, 11155420: 10, 84532: 8453, 421614: 42161 };
  return map[Number(chainId)] || Number(chainId);
}

function draftPerChainSet(state, chainId, key, value) {
  var cid = draftCanonChainId(chainId);
  if (!state.perChain[cid]) state.perChain[cid] = {};
  if (!state.perChain[cid].addr) state.perChain[cid].addr = {};
  state.perChain[cid].addr[key] = value;
}

function draftStageFromLive(ruleset, metadata, reservedSplits, chainId) {
  var stage = createFlow.createStage();
  stage.expanded = true;
  stage.durationSeconds = Number(ruleset.duration || 0);
  var weight = toBigInt(ruleset.weight || 0);
  stage.tokenMode = weight > 0n ? 'custom' : 'none';
  stage.weight = weight > 0n ? formatEther(weight) : '0';
  stage.weightCutPercent = Number(ruleset.weightCutPercent || 0) / 1e7;
  stage.issuanceCutOn = stage.weightCutPercent > 0;
  stage.baseCurrency = Number(metadata.baseCurrency || 1);
  stage.cashOutEnabled = Number(metadata.cashOutTaxRate || 0) < 10000;
  stage.cashOutTaxRate = Number(metadata.cashOutTaxRate || 0) / 100;
  stage.allowOwnerMinting = !!metadata.allowOwnerMinting;
  stage.pauseTransfers = !!metadata.pauseCreditTransfers;
  stage.metadataExtra = Number(metadata.metadata || 0);
  stage.pause721Transfers = decode721RulesetMetadata(stage.metadataExtra).pauseTransfers;
  stage.pausePay = !!metadata.pausePay;
  stage.holdFees = !!metadata.holdFees;
  stage.allowSetTerminals = !!metadata.allowSetTerminals;
  stage.allowSetController = !!metadata.allowSetController;
  stage.allowTerminalMigration = !!metadata.allowTerminalMigration;
  stage.allowSetCustomToken = !!metadata.allowSetCustomToken;
  stage.allowAddAccountingContext = !!metadata.allowAddAccountingContext;
  stage.allowAddPriceFeed = !!metadata.allowAddPriceFeed;
  var deadline = draftDeadlineFor(ruleset.approvalHook, chainId);
  stage.deadline = deadline.key;
  var reservedRate = Number(metadata.reservedPercent || 0) / 100;
  stage.reservedRecipients = (reservedSplits || []).map(function (split) {
    return draftRecipientFromSplit(split, Number(split.percent || 0) / PROJECT_DRAFT_SPLITS_TOTAL * reservedRate, '');
  });
  return { stage: stage, customApproval: deadline.address };
}

function draftPayoutState(limit, splits, decimals, owner) {
  if (!limit || toBigInt(limit.amount) === 0n) return { mode: 'none', recipients: [] };
  var total = toBigInt(limit.amount);
  if (total >= PROJECT_DRAFT_UNLIMITED) {
    return { mode: 'unlimited', recipients: (splits || []).map(function (split) {
      return draftRecipientFromSplit(split, Number(split.percent || 0) / PROJECT_DRAFT_SPLITS_TOTAL * 100, '');
    }) };
  }
  var recipients = [], allocated = 0n;
  (splits || []).forEach(function (split) {
    var amount = total * toBigInt(split.percent || 0) / BigInt(PROJECT_DRAFT_SPLITS_TOTAL);
    allocated += amount;
    if (amount > 0n) recipients.push(draftRecipientFromSplit(split, 0, formatAmount(amount, decimals)));
  });
  // A finite payout's unallocated group remainder goes to the owner. Make it explicit in the new draft so
  // the reconstructed payout limit remains byte-for-byte the same total instead of silently shrinking.
  if (allocated < total) {
    recipients.push({ type: 'wallet', address: owner || ZERO_ADDRESS, projectId: 0, percent: 0,
      amountEth: formatAmount(total - allocated, decimals), lockedUntil: 0, preferAddToBalance: false,
      _ownerRemainder: true });
  }
  return { mode: 'limited', recipients: recipients };
}

async function draftLiveProjectChain(project, chain) {
  var chainId = Number(chain.id), pid = pidOn(project, chainId);
  var controller = await controllerAddressFor(chainId, pid);
  var canonicalController = getAddress('JBController', chainId);
  if (!canonicalController || !sameAddr(controller, canonicalController)) {
    throw new Error('This project uses a non-standard controller on ' + (chain.name || chainNameOf(chainId)) + ', which the create wizard cannot reproduce.');
  }
  var current = await clientFor(chainId).readContract({ address: controller, abi: currentRulesetAbi, functionName: 'currentRulesetOf', args: [pid] });
  if (!current || !current[0] || toBigInt(current[0].id || 0) === 0n) {
    current = await clientFor(chainId).readContract({ address: controller, abi: upcomingRulesetAbi, functionName: 'upcomingRulesetOf', args: [pid] });
  }
  if (!current || !current[0] || toBigInt(current[0].id || 0) === 0n || !current[1]) throw new Error('No live ruleset could be verified on ' + (chain.name || chainNameOf(chainId)) + '.');
  var contexts = await resolveAcctTokens(chainId, pid);
  var terminals = await read(chainId, 'JBDirectory', terminalsOfAbi, 'terminalsOf', [pid]);
  var owner = project.isRevnet
    ? await revnetOperatorOf(Number(pid), chainId)
    : await read(chainId, 'JBProjects', ownerOfAbi, 'ownerOf', [pid]);
  return { chain: chain, chainId: chainId, projectId: pid, controller: controller, ruleset: current[0], metadata: current[1], contexts: contexts, terminals: terminals || [], owner: owner };
}

async function draftUpcomingProjectChain(source, project) {
  var upcoming = await clientFor(source.chainId).readContract({ address: source.controller, abi: upcomingRulesetAbi, functionName: 'upcomingRulesetOf', args: [source.projectId] });
  if (!upcoming || !upcoming[0] || toBigInt(upcoming[0].id || 0) === 0n || String(upcoming[0].id) === String(source.ruleset.id)) return null;
  return Object.assign({}, source, { ruleset: upcoming[0], metadata: upcoming[1] });
}

function draftContextKind(context, chainId) {
  if (sameAddr(context.address, NATIVE_TOKEN)) return 'eth';
  if (USDC_BY_CHAIN[chainId] && sameAddr(context.address, USDC_BY_CHAIN[chainId])) return 'usdc';
  return 'custom';
}

function draftRulesetFingerprint(source) {
  var r = source.ruleset, m = source.metadata;
  var hookRole = isZeroishAddress(m.dataHook) ? 'none'
    : (sameAddr(m.dataHook, getAddress('REVOwner', source.chainId)) ? 'revowner'
      : (sameAddr(m.dataHook, getAddress('JBOmnichainDeployer', source.chainId)) ? 'omnichain' : 'direct'));
  return draftFingerprint({
    duration: r.duration, weight: r.weight, weightCutPercent: r.weightCutPercent,
    approval: draftDeadlineFor(r.approvalHook, source.chainId).key,
    metadata: {
      reservedPercent: m.reservedPercent, cashOutTaxRate: m.cashOutTaxRate, baseCurrency: m.baseCurrency,
      pausePay: m.pausePay, pauseCreditTransfers: m.pauseCreditTransfers, allowOwnerMinting: m.allowOwnerMinting,
      allowSetCustomToken: m.allowSetCustomToken, allowTerminalMigration: m.allowTerminalMigration,
      allowSetTerminals: m.allowSetTerminals, allowSetController: m.allowSetController,
      allowAddAccountingContext: m.allowAddAccountingContext, allowAddPriceFeed: m.allowAddPriceFeed,
      ownerMustSendPayouts: m.ownerMustSendPayouts, holdFees: m.holdFees,
      scopeCashOutsToLocalBalances: m.scopeCashOutsToLocalBalances, metadata: m.metadata,
      useDataHookForPay: m.useDataHookForPay, useDataHookForCashOut: m.useDataHookForCashOut, hookRole: hookRole,
    },
    contexts: source.contexts.map(function (ctx) { var kind = draftContextKind(ctx, source.chainId); return [kind, kind === 'custom' ? String(ctx.address).toLowerCase() : '', ctx.decimals]; })
      .sort(function (a, b) { return a[0].localeCompare(b[0]); }),
  });
}

function draftSplitFingerprint(split) {
  return [String(split.percent || 0), String(split.projectId || 0), String(split.beneficiary || '').toLowerCase(),
    !!split.preferAddToBalance, String(split.lockedUntil || 0), String(split.hook || '').toLowerCase()];
}

// Read each ruleset's fund-access state once. The same verified snapshot is used for both cross-chain
// comparison and draft construction, avoiding a second identical batch of splits/limits RPC calls.
export async function readDraftFunds(project, source, readContract) {
  readContract = readContract || read;
  var pid = source.projectId != null ? BigInt(source.projectId) : pidOn(project, source.chainId), rid = toBigInt(source.ruleset.id), terminal = getAddress('JBMultiTerminal', source.chainId);
  var reserved = await readContract(source.chainId, 'JBSplits', splitsOfAbi, 'splitsOf', [pid, rid, RESERVED_TOKEN_SPLIT_GROUP]);
  var funds = await Promise.all(source.contexts.map(async function (context) {
    var values = await Promise.all([
      readContract(source.chainId, 'JBFundAccessLimits', payoutLimitsAbi, 'payoutLimitsOf', [pid, rid, terminal, context.address]),
      readContract(source.chainId, 'JBFundAccessLimits', surplusAllowancesAbi, 'surplusAllowancesOf', [pid, rid, terminal, context.address]),
      readContract(source.chainId, 'JBSplits', splitsOfAbi, 'splitsOf', [pid, rid, BigInt(context.address)]),
    ]);
    return { context: context, payouts: values[0] || [], allowances: values[1] || [], splits: values[2] || [] };
  }));
  return { reserved: reserved || [], funds: funds };
}

function draftFundsFingerprint(source, snapshot) {
  var rows = snapshot.funds.map(function (fund) {
    var context = fund.context;
    var tokenCurrency = tokenCurrencyIdForAccounting(context.address);
    function limits(list) { return (list || []).map(function (limit) {
      return [String(limit.amount), toBigInt(limit.currency) === tokenCurrency ? 'token' : String(limit.currency)];
    }); }
    var kind = draftContextKind(context, source.chainId);
    return { kind: kind, custom: kind === 'custom' ? String(context.address).toLowerCase() : '',
      payouts: limits(fund.payouts), allowances: limits(fund.allowances), splits: fund.splits.map(draftSplitFingerprint) };
  });
  rows.sort(function (a, b) { return a.kind.localeCompare(b.kind); });
  return draftFingerprint({ reserved: snapshot.reserved.map(draftSplitFingerprint), rows: rows });
}

function applyDraftOwnerRemainders(state, sources, project) {
  if (!state.stages || !state.stages.length || sources.length < 2) return;
  state.stages.forEach(function (stage, stageIndex) {
    (stage.reservedRecipients || []).forEach(function (recipient, index) {
      if (!recipient._ownerRemainder) return;
      sources.slice(1).forEach(function (source) {
        var owner = project.isRevnet ? getAddress('REVOwner', source.chainId) : source.owner;
        if (!sameAddr(owner, recipient.address)) draftPerChainSet(state, source.chainId, 'r:' + stageIndex + ':' + index, owner || ZERO_ADDRESS);
      });
      delete recipient._ownerRemainder;
    });
    (stage.payoutRecipients || []).forEach(function (recipient, index) {
      if (!recipient._ownerRemainder) return;
      sources.slice(1).forEach(function (source) {
        if (!sameAddr(source.owner, sources[0].owner)) draftPerChainSet(state, source.chainId, 'p:' + stageIndex + ':' + index, source.owner || ZERO_ADDRESS);
      });
      delete recipient._ownerRemainder;
    });
    Object.keys(stage.payoutByKind || {}).forEach(function (kind) {
      ((stage.payoutByKind[kind] || {}).recipients || []).forEach(function (recipient, index) {
        if (!recipient._ownerRemainder) return;
        sources.slice(1).forEach(function (source) {
          if (!sameAddr(source.owner, sources[0].owner)) draftPerChainSet(state, source.chainId, 'pk:' + kind + ':' + index, source.owner || ZERO_ADDRESS);
        });
        delete recipient._ownerRemainder;
      });
    });
  });
}

function applyDraftDetails(state, project) {
  var meta = project.projectMetadata || {};
  state.details.name = meta.name || project.name || '';
  state.details.ticker = String(meta.symbol || meta.ticker || project.tokenSymbol || project.metaSymbol || '').replace(/^\$/, '');
  state.details.tagline = meta.projectTagline || meta.tagline || project.tagline || '';
  state.details.description = meta.description || project.descriptionHtml || project.description || '';
  state.details.logoUri = meta.logoUri || '';
  state.details.coverImageUri = meta.coverImageUri || '';
  state.details.website = meta.infoUri || meta.domain || project.infoUri || '';
  state.details.twitter = meta.twitter || project.twitter || '';
  state.details.discord = meta.discord || project.discord || '';
  state.details.telegram = meta.telegram || project.telegram || '';
  state.details.whatsapp = meta.whatsapp || project.whatsapp || '';
  state.details.payDisclosure = meta.payDisclosure || project.payDisclosure || '';
  state.details.tags = Array.isArray(meta.tags) ? meta.tags.slice() : (project.tags || []).slice();
  state.storeCategories = Object.keys(project.storeCategories || {}).map(Number).filter(function (id) { return id > 0; })
    .sort(function (a, b) { return a - b; }).map(function (id) { return { id: id, name: String(project.storeCategories[id]) }; });
}

async function applyDraftAccountingAndTerminals(state, project, sources) {
  var home = sources[0];
  var kinds = home.contexts.map(function (ctx) { return draftContextKind(ctx, home.chainId); });
  if (kinds.filter(function (kind) { return kind === 'custom'; }).length) {
    if (home.contexts.length !== 1 || kinds[0] !== 'custom') throw new Error('The project mixes a custom accounting token with other contexts, which the .jb editor cannot reproduce.');
    state.accepts = ['custom'];
    state.customToken = { address: home.contexts[0].address, symbol: home.contexts[0].symbol || '', name: '', decimals: home.contexts[0].decimals, status: 'ok', error: '' };
  } else {
    state.accepts = ['eth', 'usdc'].filter(function (kind) { return kinds.indexOf(kind) !== -1; });
  }
  if (!state.accepts.length) throw new Error('No supported accounting context was found.');

  var routerModes = await Promise.all(sources.map(async function (source) {
    var multi = getAddress('JBMultiTerminal', source.chainId);
    var router = getAddress('JBRouterTerminalRegistry', source.chainId);
    var lower = source.terminals.map(function (address) { return String(address).toLowerCase(); });
    if (!multi || lower.indexOf(multi.toLowerCase()) === -1) throw new Error('The canonical terminal is missing on ' + (source.chain.name || chainNameOf(source.chainId)) + '.');
    var allowed = [multi.toLowerCase()]; if (router) allowed.push(router.toLowerCase());
    var unknown = lower.filter(function (address) { return allowed.indexOf(address) === -1; });
    if (unknown.length) throw new Error('The project uses a custom terminal on ' + (source.chain.name || chainNameOf(source.chainId)) + ', which the .jb editor cannot reproduce.');
    var usesRouter = !!(router && lower.indexOf(router.toLowerCase()) !== -1);
    if (usesRouter) {
      var target = await read(source.chainId, 'JBRouterTerminalRegistry', terminalOfAbi, 'terminalOf', [source.projectId]);
      var canonicalTarget = getAddress('JBRouterTerminalGateway', source.chainId) || getAddress('JBRouterTerminal', source.chainId);
      if (!canonicalTarget || !sameAddr(target, canonicalTarget)) throw new Error('The project uses a custom router-terminal target on ' + (source.chain.name || chainNameOf(source.chainId)) + '.');
    }
    return usesRouter;
  }));
  if (routerModes.some(function (mode) { return mode !== routerModes[0]; })) throw new Error('Router-terminal use differs by chain, which one .jb draft cannot reproduce.');
  state.swapRouter = routerModes[0];
}

function draftChainFamily(chainId) {
  chainId = Number(chainId);
  if (chainId === 1 || chainId === 11155111) return 'ETH';
  if (chainId === 10 || chainId === 11155420) return 'OP';
  if (chainId === 8453 || chainId === 84532) return 'BASE';
  if (chainId === 42161 || chainId === 421614) return 'ARB';
  return '';
}

function draftSuckerDeployer(chainId, remoteChainId, type) {
  var localFamily = draftChainFamily(chainId), remoteFamily = draftChainFamily(remoteChainId);
  if (!localFamily || !remoteFamily) return null;
  if (type === 'native') {
    if (localFamily !== 'ETH' && remoteFamily !== 'ETH') return null;
    var rollup = localFamily === 'ETH' ? remoteFamily : localFamily;
    var name = rollup === 'OP' ? 'JBOptimismSuckerDeployer' : rollup === 'BASE' ? 'JBBaseSuckerDeployer' : rollup === 'ARB' ? 'JBArbitrumSuckerDeployer' : null;
    return name ? getAddress(name, chainId) : null;
  }
  var testnet = [11155111, 11155420, 84532, 421614].indexOf(Number(remoteChainId)) !== -1;
  return getAddress('JBCCIPSuckerDeployer__' + remoteFamily + (testnet ? '_SEP' : ''), chainId) || null;
}

async function applyDraftSuckers(state, project, sources, warnings) {
  var sourceIds = sources.map(function (source) { return source.chainId; });
  var rows = await Promise.all(sources.map(async function (source) {
    var registry = getAddress('JBSuckerRegistry', source.chainId);
    if (!registry) return { source: source, pairs: [] };
    var pairs = await clientFor(source.chainId).readContract({ address: registry, abi: PROJECT_DRAFT_SUCKER_PAIRS_ABI, functionName: 'suckerPairsOf', args: [source.projectId] });
    var classified = await Promise.all((pairs || []).map(async function (pair) {
      var remoteId = Number(pair.remoteChainId);
      if (sourceIds.indexOf(remoteId) === -1) throw new Error('An active bridge points outside the project’s exported chain set.');
      // Suckers expose their factory directly; unlike 721/split-hook clones they predate Address Registry
      // registration, so this is the instance-native provenance proof for their bridge family.
      var deployer = await clientFor(source.chainId).readContract({ address: pair.local, abi: PROJECT_DRAFT_SUCKER_DEPLOYER_ABI, functionName: 'deployer', args: [] });
      var type = sameAddr(deployer, draftSuckerDeployer(source.chainId, remoteId, 'native')) ? 'native'
        : (sameAddr(deployer, draftSuckerDeployer(source.chainId, remoteId, 'ccip')) ? 'ccip' : null);
      if (!type) throw new Error('An active bridge instance was not produced by a known native or CCIP sucker deployer.');
      return { remoteId: remoteId, type: type };
    }));
    return { source: source, pairs: classified };
  }));
  if (sources.length === 1) {
    if (rows[0].pairs.length) throw new Error('The project has active bridges outside its visible chain set.');
    return;
  }
  var types = {};
  rows.forEach(function (row) { row.pairs.forEach(function (pair) { types[pair.type] = true; }); });
  state.suckerType = types.native && types.ccip ? 'both' : (types.ccip ? 'ccip' : (types.native ? 'native' : ''));
  if (!state.suckerType) throw new Error('The project spans multiple chains but has no reproducible active bridge topology.');
  rows.forEach(function (row) {
    var actual = row.pairs.map(function (pair) { return pair.remoteId + ':' + pair.type; }).sort();
    var expected = [];
    sourceIds.filter(function (remoteId) { return remoteId !== row.source.chainId; }).forEach(function (remoteId) {
      (state.suckerType === 'both' ? ['native', 'ccip'] : [state.suckerType]).forEach(function (type) {
        if (draftSuckerDeployer(row.source.chainId, remoteId, type)) expected.push(remoteId + ':' + type);
      });
    });
    expected.sort();
    if (draftFingerprint(actual) !== draftFingerprint(expected)) throw new Error('The active bridge topology cannot be reproduced by one .jb bridge setting.');
  });
  warnings.push('The .jb recreates the verified active bridge types; later custom token-mapping or deprecation changes are not included.');
}

function applyDraftFunds(state, project, source, stage, snapshot) {
  var reserved = snapshot.reserved;
  var built = draftStageFromLive(source.ruleset, source.metadata, reserved, source.chainId);
  Object.assign(stage, built.stage);
  if (built.customApproval) {
    if (state.approvalAddress && !sameAddr(state.approvalAddress, built.customApproval)) throw new Error('Rulesets use different custom approval-hook addresses, which one .jb draft cannot reproduce.');
    state.approvalAddress = built.customApproval;
  }
  var reservedShare = (reserved || []).reduce(function (sum, split) { return sum + Number(split.percent || 0); }, 0);
  var reservedRate = Number(source.metadata.reservedPercent || 0) / 100;
  if (reservedRate > 0 && reservedShare < PROJECT_DRAFT_SPLITS_TOTAL) {
    var reserveOwner = project.isRevnet ? getAddress('REVOwner', source.chainId) : source.owner;
    stage.reservedRecipients.push({ type: 'wallet', address: reserveOwner || ZERO_ADDRESS, projectId: 0,
      percent: (PROJECT_DRAFT_SPLITS_TOTAL - reservedShare) / PROJECT_DRAFT_SPLITS_TOTAL * reservedRate,
      amountEth: '', lockedUntil: 0, preferAddToBalance: false, _ownerRemainder: true });
  }

  var fundRows = snapshot.funds.map(function (fund) {
    if (fund.payouts.length > 1 || fund.allowances.length > 1) throw new Error('A ruleset has multiple fund-access currencies for one token, which the .jb editor cannot reproduce.');
    return { context: fund.context, kind: draftContextKind(fund.context, source.chainId),
      limit: fund.payouts[0], allowance: fund.allowances[0], splits: fund.splits };
  });
  if (Number(stage.durationSeconds || 0) <= 0 && [reserved].concat(fundRows.map(function (row) { return row.splits; }))
    .some(function (rows) { return (rows || []).some(function (split) { return Number(split.lockedUntil || 0) > 0; }); })) {
    throw new Error('A flexible live ruleset contains locked splits, which the .jb editor cannot preserve.');
  }

  var perToken = state.projectType === 'custom' && (state.accepts.length > 1 || state.accepts[0] === 'custom');
  if (perToken) {
    var allowanceModes = [];
    fundRows.forEach(function (row) {
      var expectedCurrency = tokenCurrencyIdForAccounting(row.context.address);
      if (row.limit && toBigInt(row.limit.amount) > 0n && toBigInt(row.limit.currency) !== expectedCurrency) {
        throw new Error('A per-token payout limit uses a different pricing currency, which the .jb editor cannot reproduce.');
      }
      var key = row.kind === 'custom' ? 'custom' : row.kind;
      stage.payoutByKind[key] = draftPayoutState(row.limit, row.splits, row.context.decimals, source.owner);
      var allowanceAmount = row.allowance ? toBigInt(row.allowance.amount) : 0n;
      if (allowanceAmount > 0n && allowanceAmount < PROJECT_DRAFT_UNLIMITED) throw new Error('A finite per-token surplus allowance cannot be reproduced by the .jb editor.');
      allowanceModes.push(allowanceAmount >= PROJECT_DRAFT_UNLIMITED);
    });
    if (allowanceModes.some(function (on) { return on !== allowanceModes[0]; })) throw new Error('Surplus allowance settings differ by accounting token.');
    stage.surplusAllowanceOn = !!allowanceModes[0]; stage.surplusAllowanceUnlimited = !!allowanceModes[0];
  } else {
    // The create flow configures revnet fund access against its first accounting context. Do not silently
    // discard live limits/splits on another accepted token which the .jb form cannot express.
    var row = fundRows.find(function (candidate) { return candidate.kind === state.accepts[0]; }) || fundRows[0];
    var unrepresentable = fundRows.filter(function (candidate) { return candidate !== row; }).some(function (candidate) {
      return (candidate.limit && toBigInt(candidate.limit.amount) > 0n)
        || (candidate.allowance && toBigInt(candidate.allowance.amount) > 0n)
        || (candidate.splits && candidate.splits.length);
    });
    if (unrepresentable) throw new Error('This revnet has fund access or payout splits on more than one accounting token, which the .jb editor cannot reproduce.');
    var payoutDecimals = row && row.limit ? createFlow.fundAccessAmountDecimals(row.limit.currency, row.context) : row.context.decimals;
    var payout = draftPayoutState(row.limit, row.splits, payoutDecimals, source.owner);
    stage.payoutMode = payout.mode; stage.payoutRecipients = payout.recipients;
    if (row.limit) stage.payoutCurrency = Number(row.limit.currency);
    if (row.allowance && toBigInt(row.allowance.amount) > 0n) {
      stage.surplusAllowanceOn = true;
      stage.surplusAllowanceUnlimited = toBigInt(row.allowance.amount) >= PROJECT_DRAFT_UNLIMITED;
      stage.surplusAllowanceCurrency = Number(row.allowance.currency);
      if (!stage.surplusAllowanceUnlimited) {
        stage.surplusAllowanceAmount = formatAmount(row.allowance.amount, createFlow.fundAccessAmountDecimals(row.allowance.currency, row.context));
      }
    }
  }
  return { reserved: reserved, funds: fundRows };
}

function draftTierFingerprint(tier) {
  return draftFingerprint({ id: tier.id, price: tier.price, initial: tier.initial, category: tier.category,
    encodedIpfsUri: tier.encodedIpfsUri, discountPercent: tier.discountPercent, reserveFrequency: tier.reserveFrequency,
    votingUnits: tier.votingUnits, reserveBeneficiary: String(tier.reserveBeneficiary || '').toLowerCase(),
    splitPercent: tier.splitPercent, flags: tier.flags });
}

// The collection's name, symbol and flags as one chain reports them. Every read must succeed: a flag read as
// false would drop a restriction such as preventOverspending from the copied draft.
export function readDraftCollection(client, shop) {
  return Promise.all([
    client.readContract({ address: shop.hook, abi: PROJECT_DRAFT_721_META_ABI, functionName: 'name', args: [] }),
    client.readContract({ address: shop.hook, abi: PROJECT_DRAFT_721_META_ABI, functionName: 'symbol', args: [] }),
    client.readContract({ address: shop.store, abi: PROJECT_DRAFT_721_FLAGS_ABI, functionName: 'flagsOf', args: [shop.hook] }),
  ]);
}

async function applyDraftShop(state, project, sources, warnings) {
  var chainProjects = sources.map(function (source) { return Object.assign({}, project, { id: Number(source.projectId), chainId: source.chainId }); });
  var shops = await Promise.all(chainProjects.map(function (p) { return fetchProjectTiers(p); }));
  var any = shops.some(Boolean);
  if (!any) {
    if (!project.isRevnet && sources.some(function (source) { return !isZeroishAddress(source.metadata.dataHook); })) throw new Error('The project uses a custom data hook which the .jb editor cannot reproduce.');
    return;
  }
  if (shops.some(function (shop) { return !shop; })) throw new Error('The shop is not present on every project chain.');
  var home = shops[0];
  if (shops.some(isNativeInventory)) throw new Error(nativeActionUnavailable('manageTiers'));
  var knownShops = await Promise.all(shops.map(function (shop, index) {
    return isKnown721HookClone(shop.hook, sources[index].chainId, sources[index].projectId);
  }));
  if (knownShops.some(function (known) { return !known; })) {
    throw new Error('A shop hook is not a verified 721 instance from a known deployer in the Address Registry.');
  }
  shops.slice(1).forEach(function (shop) {
    if (Number(shop.pricing.currency) !== Number(home.pricing.currency) || Number(shop.pricing.decimals) !== Number(home.pricing.decimals)
      || draftFingerprint(shop.tiers.map(draftTierFingerprint)) !== draftFingerprint(home.tiers.map(draftTierFingerprint))) {
      throw new Error('The shop configuration differs by chain, which one .jb draft cannot reproduce.');
    }
  });

  var expectedShopDecimals = Number(home.pricing.currency) === 1 ? 18 : (Number(home.pricing.currency) === 2 ? 6 : null);
  if (state.accepts[0] === 'custom' && Number(home.pricing.currency) === Number(tokenCurrencyIdForAccounting(state.customToken.address))) {
    expectedShopDecimals = Number(state.customToken.decimals);
  }
  if (home.tiers.length && expectedShopDecimals == null) throw new Error('The shop uses a pricing currency the .jb editor cannot reproduce.');
  if (home.tiers.length && Number(home.pricing.decimals) !== expectedShopDecimals) throw new Error('The shop uses non-standard pricing decimals which the .jb editor cannot reproduce.');

  // Verify the per-tier permanent split groups on every chain too; tier structs only carry splitPercent, not
  // the destinations. Omitting this check could silently clone the right prices with the wrong recipients.
  var tierSplitFingerprints = await Promise.all(shops.map(async function (shop, sourceIndex) {
    var source = sources[sourceIndex];
    var rows = await Promise.all(shop.tiers.map(async function (tier) {
      if (!tier.splitPercent) return [tier.id, []];
      var group = BigInt(shop.hook) | (BigInt(tier.id) << 160n);
      var splits = await read(source.chainId, 'JBSplits', splitsOfAbi, 'splitsOf', [pidOn(project, source.chainId), 0n, group]);
      return [tier.id, (splits || []).map(draftSplitFingerprint)];
    }));
    return draftFingerprint(rows);
  }));
  if (tierSplitFingerprints.some(function (fingerprint) { return fingerprint !== tierSplitFingerprints[0]; })) {
    throw new Error('Shop item split recipients differ by chain, which one .jb draft cannot reproduce safely.');
  }

  if (project.isRevnet) {
    sources.forEach(function (source) {
      var expected = getAddress('REVOwner', source.chainId);
      if (!expected || !sameAddr(source.metadata.dataHook, expected)) throw new Error('The revnet data hook is not the verified REVOwner on ' + (source.chain.name || chainNameOf(source.chainId)) + '.');
    });
    var permissionRows = await Promise.all(sources.map(function (source) {
      var revOwner = getAddress('REVOwner', source.chainId);
      return read(source.chainId, 'JBPermissions', jbPermissionsOfAbi, 'permissionsOf', [source.owner || ZERO_ADDRESS, revOwner, source.projectId]);
    }));
    var permissionFingerprint = permissionRows.map(function (packed) {
      var bits = toBigInt(packed || 0); return [24, 25, 26, 27].map(function (id) { return ((bits >> BigInt(id)) & 1n) === 1n; });
    });
    if (permissionFingerprint.slice(1).some(function (row) { return draftFingerprint(row) !== draftFingerprint(permissionFingerprint[0]); })) {
      throw new Error('Revnet shop operator permissions differ by chain.');
    }
    state.collection.opCanAdjustTiers = permissionFingerprint[0][0];
    state.collection.opCanUpdateMetadata = permissionFingerprint[0][1];
    state.collection.opCanMint = permissionFingerprint[0][2];
    state.collection.opCanIncreaseDiscount = permissionFingerprint[0][3];
  } else {
    var redemptionModes = await Promise.all(sources.map(async function (source, index) {
      var dataHook = source.metadata.dataHook, omni = getAddress('JBOmnichainDeployer', source.chainId), shop = shops[index];
      if (omni && sameAddr(dataHook, omni)) {
        var extra = await clientFor(source.chainId).readContract({ address: omni, abi: OMNI_EXTRA_HOOK_ABI, functionName: 'extraDataHookOf', args: [source.projectId, toBigInt(source.ruleset.id)] });
        var extraHook = extra && (extra.dataHook || extra[0]);
        if (!isZeroishAddress(extraHook)) throw new Error('This shop is composed with another custom data hook, which the .jb editor cannot reproduce.');
        var tierCfg = await clientFor(source.chainId).readContract({ address: omni, abi: OMNI_TIERED_HOOK_ABI, functionName: 'tiered721HookOf', args: [source.projectId, toBigInt(source.ruleset.id)] });
        var configuredHook = tierCfg && (tierCfg.hook || tierCfg[0]);
        if (!sameAddr(configuredHook, shop.hook)) throw new Error('The omnichain wrapper’s shop hook could not be verified.');
        return !!(tierCfg && (tierCfg.useDataHookForCashOut != null ? tierCfg.useDataHookForCashOut : tierCfg[1]));
      }
      if (!sameAddr(dataHook, shop.hook)) throw new Error('The live data hook is not the verified shop hook.');
      return !!source.metadata.useDataHookForCashOut;
    }));
    if (redemptionModes.some(function (mode) { return mode !== redemptionModes[0]; })) throw new Error('Shop cash out behavior differs by chain.');
    state.collection.useForRedemptions = redemptionModes[0];
  }

  var metas = await Promise.all(shops.map(function (shop, index) { return readDraftCollection(clientFor(sources[index].chainId), shop); }));
  if (metas.slice(1).some(function (meta) { return draftFingerprint(meta) !== draftFingerprint(metas[0]); })) throw new Error('Shop collection metadata or flags differ by chain.');
  var meta = metas[0];
  state.shopEnabled = true; state.storePricingCurrency = Number(home.pricing.currency);
  state.collection.name = meta[0] || ''; state.collection.symbol = meta[1] || '';
  state.collection.nameTouched = !!meta[0]; state.collection.symbolTouched = !!meta[1];
  var flags = meta[2];
  ['noNewTiersWithReserves', 'noNewTiersWithVotes', 'noNewTiersWithOwnerMinting', 'preventOverspending', 'issueTokensForSplits'].forEach(function (key) { state.collection[key] = !!flags[key]; });

  state.nfts = await Promise.all(home.tiers.map(async function (tier) {
    var media = await resolveTierMedia(home, tier, sources[0].chainId).catch(function () { return {}; });
    if (!media.name && !media.description && !media.image && !media.animationUrl) {
      warnings.push('Metadata for shop item #' + tier.id + ' could not be resolved. Its encoded IPFS value is preserved, but review the item name and media before deploying.');
    }
    var splitRows = [];
    if (tier.splitPercent > 0) {
      var group = BigInt(home.hook) | (BigInt(tier.id) << 160n);
      // 721 tier split groups are permanent shop configuration and are stored under ruleset ID 0.
      var splits = await read(sources[0].chainId, 'JBSplits', splitsOfAbi, 'splitsOf', [pidOn(project, sources[0].chainId), 0n, group]);
      var splitShare = (splits || []).reduce(function (sum, split) { return sum + Number(split.percent || 0); }, 0);
      if (splitShare !== PROJECT_DRAFT_SPLITS_TOTAL) {
        throw new Error('Shop item #' + tier.id + ' has an implicit split remainder, which the .jb shop editor cannot reproduce.');
      }
      splitRows = (splits || []).map(function (split) {
        if (!isZeroishAddress(split.hook) || split.preferAddToBalance || Number(split.lockedUntil || 0) > 0) {
          throw new Error('Shop item #' + tier.id + ' uses advanced split behavior which the .jb shop editor cannot reproduce.');
        }
        var pct = Number(tier.splitPercent) / PROJECT_DRAFT_SPLITS_TOTAL * 100 * Number(split.percent) / PROJECT_DRAFT_SPLITS_TOTAL;
        return { pct: pct, recip: Number(split.projectId || 0) > 0 ? String(split.projectId) : (split.beneficiary || ZERO_ADDRESS), benef: Number(split.projectId || 0) > 0 ? (split.beneficiary || ZERO_ADDRESS) : '' };
      });
    }
    var unlimited = Number(tier.initial) >= TIER_UNLIMITED_SUPPLY;
    var effectiveVotes = toBigInt(tier.votingUnits || 0);
    if (toBigInt(tier.price || 0) > 0n && effectiveVotes === 0n) {
      throw new Error('Shop item #' + tier.id + ' explicitly has zero voting units, which the .jb shop editor cannot reproduce.');
    }
    // The store returns effective voting units, not the `useVotingUnits` flag. Bendystraw retains the raw
    // AddTier votingUnits value, so use it to disambiguate an explicit value from price-based voting and
    // verify it against the live result. If the index row is unavailable, only infer cases which are provable.
    var indexedVotes = tier.indexedMetadata && tier.indexedMetadata.votingUnits != null
      ? toBigInt(tier.indexedMetadata.votingUnits) : null;
    var explicitVotes;
    if (indexedVotes != null) {
      explicitVotes = indexedVotes > 0n;
      var expectedVotes = explicitVotes ? indexedVotes : toBigInt(tier.price || 0);
      if (expectedVotes !== effectiveVotes) throw new Error('Indexed voting units for shop item #' + tier.id + ' do not match the live hook.');
    } else if (effectiveVotes > 0xffffffffn) {
      explicitVotes = false; // explicit values are stored as uint32
    } else if (effectiveVotes !== toBigInt(tier.price || 0)) {
      explicitVotes = true;
    } else {
      throw new Error('Shop item #' + tier.id + ' has ambiguous voting-unit configuration and no indexed creation value; exporting would risk changing it.');
    }
    return {
      expanded: false, advOpen: false, name: media.name || ('Item ' + tier.id), description: media.description || '',
      imageUri: media.image || media.animationUrl || '', mediaType: media.mediaType || '', metaUri: '', encodedIpfsUri: tier.encodedIpfsUri || '',
      price: formatAmount(tier.price, home.pricing.decimals), limited: !unlimited, supply: unlimited ? '' : String(tier.initial),
      splitOn: tier.splitPercent > 0, splitRecipients: splitRows,
      discountOn: Number(tier.discountPercent || 0) > 0, discountPct: String(Number(tier.discountPercent || 0) / 2), category: Number(tier.category || 0),
      reserveOn: Number(tier.reserveFrequency || 0) > 0, reserveFrequency: String(tier.reserveFrequency || ''), reserveBeneficiary: tier.reserveBeneficiary || '',
      votingOn: explicitVotes, votingUnits: explicitVotes ? String(effectiveVotes) : '',
      flags: { allowOwnerMint: !!(tier.flags && tier.flags.allowOwnerMint), transfersPausable: !!(tier.flags && tier.flags.transfersPausable),
        cantBeRemoved: !!(tier.flags && tier.flags.cantBeRemoved), allowCredits: !(tier.flags && tier.flags.cantBuyWithCredits),
        ownerCanEditDiscount: !(tier.flags && tier.flags.cantIncreaseDiscountPercent) },
      _resolvedCategoryName: media.category || '',
    };
  }));
  state.nfts.forEach(function (item) {
    var categoryId = Number(item.category || 0), resolvedCategoryName = String(item._resolvedCategoryName || '').trim();
    var categoryName = resolvedCategoryName || (categoryId > 0 ? ('Category ' + categoryId) : '');
    if (categoryId > 0 && categoryName && !state.storeCategories.some(function (entry) { return Number(entry.id) === categoryId; })) {
      state.storeCategories.push({ id: categoryId, name: categoryName });
      if (!resolvedCategoryName) warnings.push('No stored label was available for shop category #' + categoryId + '; the .jb uses “' + categoryName + '” as an editable fallback.');
    }
    delete item._resolvedCategoryName;
  });
  state.storeCategories.sort(function (a, b) { return Number(a.id) - Number(b.id); });
  if (home.resolver) warnings.push('Dynamic shop resolver output was copied as the current item name/media; review those fields before deploying.');
}

// Reconstruct the configuration which the current create wizard can faithfully represent. Transaction-critical
// values come from contracts; Bendystraw-first project metadata is used only for display fields.
export async function buildProjectCreateDraft(project) {
  var state = createFlow.newCreateDraftState(), warnings = [];
  var chains = projectChains(project);
  var testnetIds = [11155111, 11155420, 84532, 421614];
  var testnetCount = chains.filter(function (chain) { return testnetIds.indexOf(Number(chain.id)) !== -1; }).length;
  if (testnetCount && testnetCount !== chains.length) throw new Error('A .jb draft cannot mix mainnet and testnet chains.');
  state.network = testnetCount ? 'testnet' : 'mainnet';
  state.chainIds = chains.map(function (chain) { return Number(chain.id); });
  state.projectType = project.isRevnet ? 'revnet' : 'custom';
  applyDraftDetails(state, project);
  var sources = await Promise.all(chains.map(function (chain) { return draftLiveProjectChain(project, chain); }));
  if (sources.some(function (source) { return isZeroishAddress(source.owner); })) {
    throw new Error('The ' + (project.isRevnet ? 'operator' : 'project owner') + ' could not be verified on every project chain.');
  }
  if (sources.slice(1).some(function (source) { return draftRulesetFingerprint(source) !== draftRulesetFingerprint(sources[0]); })) {
    throw new Error('Ruleset or accounting configuration differs by chain, which one .jb draft cannot reproduce safely.');
  }
  await applyDraftAccountingAndTerminals(state, project, sources);
  await applyDraftSuckers(state, project, sources, warnings);
  var fundSnapshots = await Promise.all(sources.map(function (source) { return readDraftFunds(project, source); }));
  var fundFingerprints = sources.map(function (source, index) { return draftFundsFingerprint(source, fundSnapshots[index]); });
  if (fundFingerprints.some(function (fingerprint) { return fingerprint !== fundFingerprints[0]; })) {
    throw new Error('Fund access, reserved splits, or payout splits differ by chain, which one .jb draft cannot reproduce safely.');
  }
  state.details.owner = sources[0].owner || '';
  state.revOperator = sources[0].owner || '';
  sources.slice(1).forEach(function (source) {
    if (!sameAddr(source.owner, sources[0].owner)) draftPerChainSet(state, source.chainId, project.isRevnet ? 'op' : 'owner', source.owner || '');
  });
  var stageSourceSets = [sources];

  if (project.isRevnet) {
    // The current stage is reproducible from the live ruleset. Earlier stage history is useful context but cannot
    // enumerate unclaimed auto-issuance beneficiaries, so keep one current stage and disclose that limitation.
    var currentStage = createFlow.createStage();
    applyDraftFunds(state, project, sources[0], currentStage, fundSnapshots[0]);
    currentStage.cutFreqDays = String(Number(currentStage.durationSeconds || 0) / 86400);
    currentStage.issuanceCutOn = Number(currentStage.durationSeconds || 0) > 0;
    currentStage.autoIssuances = [];
    state.stages = [currentStage]; state.afterMode = currentStage.durationSeconds > 0 ? 'cycle' : 'wait';
    state.revBaseCurrency = Number(sources[0].metadata.baseCurrency || 1);
    warnings.push('Revnet auto-issuance beneficiaries and earlier completed stages are not enumerable from the current ruleset, so this .jb starts from the live stage.');
    warnings.push('Any later revnet buyback-pool or registry-routing changes are not part of the .jb create form; review the new revnet’s market setup after deployment.');
  } else {
    var stage = createFlow.createStage();
    applyDraftFunds(state, project, sources[0], stage, fundSnapshots[0]);
    state.stages = [stage]; state.afterMode = stage.durationSeconds > 0 ? 'cycle' : 'wait';
    var upcomingSources = await Promise.all(sources.map(function (source) { return draftUpcomingProjectChain(source, project); }));
    var upcomingCount = upcomingSources.filter(Boolean).length;
    if (upcomingCount && upcomingCount !== sources.length) throw new Error('The queued upcoming ruleset is not present on every project chain.');
    if (upcomingCount) {
      if (Number(stage.durationSeconds || 0) <= 0) throw new Error('A distinct ruleset is queued after a flexible current ruleset, which the .jb sequencer cannot reproduce safely.');
      if (upcomingSources.slice(1).some(function (source) { return draftRulesetFingerprint(source) !== draftRulesetFingerprint(upcomingSources[0]); })) {
        throw new Error('The queued upcoming ruleset differs by chain.');
      }
      var upcomingFundSnapshots = await Promise.all(upcomingSources.map(function (source) { return readDraftFunds(project, source); }));
      var upcomingFundFingerprints = upcomingSources.map(function (source, index) { return draftFundsFingerprint(source, upcomingFundSnapshots[index]); });
      if (upcomingFundFingerprints.some(function (fingerprint) { return fingerprint !== upcomingFundFingerprints[0]; })) throw new Error('Upcoming fund access or splits differ by chain.');
      sources.forEach(function (currentSource, index) {
        var nextSource = upcomingSources[index];
        var currentRole = isZeroishAddress(currentSource.metadata.dataHook) ? 'none'
          : (sameAddr(currentSource.metadata.dataHook, getAddress('JBOmnichainDeployer', currentSource.chainId)) ? 'omnichain' : 'direct');
        var nextRole = isZeroishAddress(nextSource.metadata.dataHook) ? 'none'
          : (sameAddr(nextSource.metadata.dataHook, getAddress('JBOmnichainDeployer', nextSource.chainId)) ? 'omnichain' : 'direct');
        if (currentRole !== nextRole || !!currentSource.metadata.useDataHookForPay !== !!nextSource.metadata.useDataHookForPay
          || !!currentSource.metadata.useDataHookForCashOut !== !!nextSource.metadata.useDataHookForCashOut
          || (currentRole === 'direct' && !sameAddr(currentSource.metadata.dataHook, nextSource.metadata.dataHook))) {
          throw new Error('The queued ruleset changes data-hook behavior, which the .jb create form cannot reproduce.');
        }
      });
      await Promise.all(upcomingSources.map(async function (nextSource, index) {
        var omni = getAddress('JBOmnichainDeployer', nextSource.chainId);
        if (!omni || !sameAddr(nextSource.metadata.dataHook, omni)) return;
        var currentSource = sources[index];
        var configs = await Promise.all([
          clientFor(nextSource.chainId).readContract({ address: omni, abi: OMNI_EXTRA_HOOK_ABI, functionName: 'extraDataHookOf', args: [nextSource.projectId, toBigInt(nextSource.ruleset.id)] }),
          clientFor(nextSource.chainId).readContract({ address: omni, abi: OMNI_TIERED_HOOK_ABI, functionName: 'tiered721HookOf', args: [currentSource.projectId, toBigInt(currentSource.ruleset.id)] }),
          clientFor(nextSource.chainId).readContract({ address: omni, abi: OMNI_TIERED_HOOK_ABI, functionName: 'tiered721HookOf', args: [nextSource.projectId, toBigInt(nextSource.ruleset.id)] }),
        ]);
        var extraHook = configs[0] && (configs[0].dataHook || configs[0][0]);
        var currentHook = configs[1] && (configs[1].hook || configs[1][0]);
        var nextHook = configs[2] && (configs[2].hook || configs[2][0]);
        var currentRedeem = !!(configs[1] && (configs[1].useDataHookForCashOut != null ? configs[1].useDataHookForCashOut : configs[1][1]));
        var nextRedeem = !!(configs[2] && (configs[2].useDataHookForCashOut != null ? configs[2].useDataHookForCashOut : configs[2][1]));
        if (!isZeroishAddress(extraHook) || !sameAddr(currentHook, nextHook) || currentRedeem !== nextRedeem) {
          throw new Error('The queued ruleset changes omnichain hook composition, which the .jb create form cannot reproduce.');
        }
      }));
      var nextStage = createFlow.createStage();
      applyDraftFunds(state, project, upcomingSources[0], nextStage, upcomingFundSnapshots[0]);
      state.stages.push(nextStage); state.afterMode = nextStage.durationSeconds > 0 ? 'cycle' : 'wait';
      stageSourceSets.push(upcomingSources);
    }
  }
  if (state.stages.some(function (stage) { return stage.deadline === 'custom'; })) {
    var customApprovalByChain = {};
    stageSourceSets.forEach(function (sourceSet) {
      sourceSet.forEach(function (source) {
        if (draftDeadlineFor(source.ruleset.approvalHook, source.chainId).key !== 'custom') return;
        var prior = customApprovalByChain[source.chainId];
        if (prior && !sameAddr(prior, source.ruleset.approvalHook)) throw new Error('Custom approval hooks differ between rulesets on one chain.');
        customApprovalByChain[source.chainId] = source.ruleset.approvalHook;
      });
    });
    sources.slice(1).forEach(function (source) {
      var address = customApprovalByChain[source.chainId];
      if (address && !sameAddr(address, state.approvalAddress)) draftPerChainSet(state, source.chainId, 'approval', address);
    });
  }
  applyDraftOwnerRemainders(state, sources, project);
  if (sources[0].metadata.ownerMustSendPayouts) throw new Error('The live ruleset requires owner-sent payouts, a flag the .jb editor cannot reproduce.');
  if (sources[0].metadata.scopeCashOutsToLocalBalances) throw new Error('The live ruleset scopes cash outs to local balances, which the .jb editor cannot reproduce.');
  if ((Number(sources[0].metadata.metadata || 0) & ~1) !== 0) warnings.push('The live ruleset contains additional custom metadata bits. They are preserved by the .jb draft but are not directly editable.');
  await applyDraftShop(state, project, sources, warnings);
  if (state.shopEnabled && state.collection.useForRedemptions) state.stages.forEach(function (stage) { stage.cashOutEnabled = false; });
  state.step = 0; state.tos = false;
  return { state: state, warnings: warnings };
}
