// Sticky split recipients: a split whose hook is the chain's StickyDistributor pays the holders of a Sticky token.
// The split's beneficiary is that Sticky token and its projectId is the reward group, never a project.
// These are the rules of juicebox.money's SDK module (v6/sticky) and of StickyDistributor.isValidGroupId.
// Sticky is not part of deploy-all, so its addresses are pinned here from the Sticky repository's deployments
// (the same address on every chain).
var STICKY_CHAINS = [1, 8453, 42161, 10, 11155111, 84532, 421614, 11155420];
var STICKY_DISTRIBUTOR = '0x489d011dc34983eb2e219a5010806caa418cb46b';
var STICKY_HOOK = '0x57bb7161afce10a12b1761483bfc61dfcb2c4df5';

export var STICKY_CRITERIA_BASE = 1000n;
export var STICKY_MAX_CRITERIA_WEEKS = 520;

export function stickyDistributorAddress(chainId) { return STICKY_CHAINS.indexOf(Number(chainId)) >= 0 ? STICKY_DISTRIBUTOR : null; }
export function stickyHookAddress(chainId) { return STICKY_CHAINS.indexOf(Number(chainId)) >= 0 ? STICKY_HOOK : null; }

// Recognition comes before the generic hook case: only the hook address decides.
// Without a chain (a decoded argument has none) the address alone decides: it is the same on every chain.
export function isStickySplit(split, chainId) {
  var distributor = chainId == null ? STICKY_DISTRIBUTOR : stickyDistributorAddress(chainId);
  return !!distributor && !!split && typeof split.hook === 'string' && split.hook.toLowerCase() === distributor;
}

// Why a group id is not one the distributor honors, or null. Group 0 pays every holder by voting power; any other
// group is minWeeks * 1000 + maxWeeks, with maxWeeks 0 meaning no upper bound.
export function validateStickyGroupId(groupId) {
  groupId = BigInt(groupId);
  if (groupId === 0n) return null;
  if (groupId < 0n) return 'Group ID can\'t be negative.';
  var minWeeks = groupId / STICKY_CRITERIA_BASE, maxWeeks = groupId % STICKY_CRITERIA_BASE, limit = BigInt(STICKY_MAX_CRITERIA_WEEKS);
  if (minWeeks === 0n) return 'Tenure groups need a minimum of at least 1 week.';
  if (minWeeks > limit) return 'Minimum weeks can\'t be more than ' + STICKY_MAX_CRITERIA_WEEKS + '.';
  if (maxWeeks > limit) return 'Maximum weeks can\'t be more than ' + STICKY_MAX_CRITERIA_WEEKS + '.';
  if (maxWeeks !== 0n && maxWeeks < minWeeks) return 'Maximum weeks can\'t be less than minimum weeks.';
  return null;
}

// An invalid group decodes as the default group, because the distributor routes it there.
export function decodeStickyGroupId(groupId) {
  groupId = BigInt(groupId);
  if (groupId === 0n || validateStickyGroupId(groupId) !== null) return { kind: 'default' };
  return { kind: 'tenure', minWeeks: Number(groupId / STICKY_CRITERIA_BASE), maxWeeks: Number(groupId % STICKY_CRITERIA_BASE) };
}

// The group id for a tenure of minWeeks to maxWeeks (0: no upper bound). Refuses what the distributor would not
// honor, so a large maximum can never carry into the minimum.
export function stickyGroupId(minWeeks, maxWeeks) {
  if (!Number.isInteger(minWeeks) || !Number.isInteger(maxWeeks) || minWeeks < 0 || maxWeeks < 0) throw new Error('Enter whole weeks');
  if (maxWeeks > STICKY_MAX_CRITERIA_WEEKS) throw new Error('Maximum weeks can\'t be more than ' + STICKY_MAX_CRITERIA_WEEKS + '.');
  var groupId = BigInt(minWeeks) * STICKY_CRITERIA_BASE + BigInt(maxWeeks);
  var problem = validateStickyGroupId(groupId);
  if (problem) throw new Error(problem);
  return groupId;
}

function weeks(count) { return count === 1 ? '1 week' : count + ' weeks'; }

// "Sticky holders stuck 4 to 52 weeks": who a Sticky split pays, from its group id (the split's projectId).
export function describeStickySplit(groupId) {
  groupId = BigInt(groupId);
  var group = decodeStickyGroupId(groupId);
  if (group.kind === 'default') return 'Sticky group 0 (all holders by voting power)' + (groupId === 0n ? '' : ', since group ' + groupId + ' is invalid');
  if (group.maxWeeks === 0) return 'Sticky holders stuck ' + weeks(group.minWeeks) + ' or more';
  if (group.maxWeeks === group.minWeeks) return 'Sticky holders stuck ' + weeks(group.minWeeks);
  return 'Sticky holders stuck ' + group.minWeeks + ' to ' + group.maxWeeks + ' weeks';
}

// The whole recipient label: the group, then the Sticky token by symbol once known, else by short address.
export function stickyRecipientLabel(split, symbol) {
  var token = String(split.beneficiary || '');
  return describeStickySplit(split.projectId || 0) + ' → ' + (symbol || (token.slice(0, 6) + '…' + token.slice(-4)));
}

var STICKY_TOKEN_ABI = [
  { type: 'function', name: 'PROJECT_ID', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
];
var STICKY_HOOK_ABI = [{ type: 'function', name: 'tokenOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ type: 'address' }] }];

function isRevert(error) {
  for (var cause = error; cause; cause = cause.cause) {
    if (cause.name === 'ContractFunctionRevertedError' || cause.name === 'ContractFunctionZeroDataError') return true;
  }
  return false;
}

// Whether `token` is a Sticky token the chain's StickyHook registered, the check the distributor itself runs
// (_isRegisteredStickyToken). client: a viem public client; where: the chain's name for messages.
// Resolves { ok: true, symbol } or { ok: false, reason }.
export async function checkStickyToken(client, chainId, token, where) {
  var hook = stickyHookAddress(chainId);
  if (!hook) return { ok: false, reason: 'Sticky is not deployed on ' + where + '.' };
  var short = token.slice(0, 6) + '…' + token.slice(-4), notSticky = { ok: false, reason: short + ' is not a Sticky token on ' + where + '.' };
  var projectId;
  try { projectId = await client.readContract({ address: token, abi: STICKY_TOKEN_ABI, functionName: 'PROJECT_ID' }); }
  catch (error) { return isRevert(error) ? notSticky : { ok: false, reason: 'Could not check the Sticky token on ' + where + '.' }; }
  var registered;
  try { registered = await client.readContract({ address: hook, abi: STICKY_HOOK_ABI, functionName: 'tokenOf', args: [projectId] }); }
  catch (error) { return { ok: false, reason: 'Could not check the Sticky token on ' + where + '.' }; }
  if (String(registered).toLowerCase() !== token.toLowerCase()) return notSticky;
  var symbol = await client.readContract({ address: token, abi: STICKY_TOKEN_ABI, functionName: 'symbol' }).catch(function () { return ''; });
  return { ok: true, symbol: symbol };
}
