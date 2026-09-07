import { encodeFunctionData, isAddress } from 'viem';

export var CREDIT_CLAIM_ABI = [{
  type: 'function', name: 'claimTokensFor', stateMutability: 'nonpayable',
  inputs: [
    { name: 'holder', type: 'address' }, { name: 'projectId', type: 'uint256' },
    { name: 'tokenCount', type: 'uint256' }, { name: 'beneficiary', type: 'address' },
  ], outputs: [],
}];

function address(value) {
  return typeof value === 'string' && isAddress(value, { strict: false }) && !/^0x0+$/i.test(value);
}

function validatedState(value, name) {
  if (!value || !address(value.controller)) throw new Error('Could not verify the project controller on ' + name + '.');
  if (!address(value.token)) throw new Error('The project’s ERC-20 is not deployed or could not be verified on ' + name + '.');
  var projectId, credit;
  try {
    if (value.projectId == null || value.credit == null || typeof value.projectId === 'boolean' || typeof value.credit === 'boolean') throw new Error('Missing claim state');
    projectId = BigInt(value.projectId); credit = BigInt(value.credit);
  } catch (_) { throw new Error('Could not verify the project ID and unclaimed credits on ' + name + '.'); }
  if (projectId <= 0n || credit < 0n || credit >= 1n << 256n) throw new Error('Invalid project ID or unclaimed credits on ' + name + '.');
  return { projectId: projectId, credit: credit, controller: value.controller, token: value.token };
}

// Read each destination independently. All amounts and identities become part of the immutable review;
// a zero/unread destination is an error rather than a silently omitted claim.
export async function prepareCreditClaims(chains, holder, readState) {
  if (!address(holder)) throw new Error('Connect the wallet whose credits will be claimed.');
  if (!Array.isArray(chains) || !chains.length) throw new Error('Select at least one chain to claim credits.');
  var ids = chains.map(function (chain) { return Number(chain.id); });
  if (ids.some(function (id) { return !Number.isSafeInteger(id) || id <= 0; }) || new Set(ids).size !== ids.length) throw new Error('Select each destination chain only once.');
  return Promise.all(chains.map(async function (chain) {
    var name = chain.name || ('Chain ' + chain.id);
    var live = validatedState(await readState(Number(chain.id), holder), name);
    if (live.credit === 0n) throw new Error('No unclaimed credits remain on ' + name + '. Deselect that chain or refresh its balance.');
    var args = [holder, live.projectId, live.credit, holder];
    return {
      chainId: Number(chain.id), name: name, projectId: live.projectId, holder: holder,
      controller: live.controller, token: live.token, tokenCount: live.credit,
      expectedState: { token: live.token },
      to: live.controller, abi: CREDIT_CLAIM_ABI, functionName: 'claimTokensFor', args: args,
      data: encodeFunctionData({ abi: CREDIT_CLAIM_ABI, functionName: 'claimTokensFor', args: args }),
    };
  }));
}

// Sequential direct/Safe execution supplies its current destination. Relayr checks every destination
// before publication/funding. An earlier confirmed direct claim must not invalidate a later chain.
export async function verifyCreditClaims(plans, readState, chainId) {
  var selected = chainId == null ? plans : plans.filter(function (plan) { return plan.chainId === Number(chainId); });
  if (!selected.length) throw new Error('The reviewed credit claim is missing its destination.');
  await Promise.all(selected.map(async function (plan) {
    var live = validatedState(await readState(plan.chainId, plan.holder), plan.name);
    if (live.projectId !== plan.projectId || live.controller.toLowerCase() !== plan.controller.toLowerCase() || live.token.toLowerCase() !== plan.token.toLowerCase()) {
      throw new Error('The project ID, controller, or token changed on ' + plan.name + '. Review the credit claim again.');
    }
    if (live.credit < plan.tokenCount) throw new Error('The unclaimed balance decreased on ' + plan.name + '. Review the credit amount again before submitting.');
  }));
}

// Reload recovery rebuilds its check from the frozen calldata and token snapshot, never from the
// modal’s current selection or balances. The call’s exact arguments remain the source of authority.
export async function verifySavedCreditClaims(calls, readState, chainId) {
  var plans = calls.map(function (call) {
    var args = call.args;
    var token = call.expectedState && call.expectedState.token;
    var cid = Number(call.chainId == null ? call.cid : call.chainId);
    if (!Array.isArray(args) || args.length !== 4 || !address(args[0]) || String(args[0]).toLowerCase() !== String(args[3]).toLowerCase() || !address(token)) {
      throw new Error('The saved credit claim lacks its original holder, beneficiary, or token snapshot. Verify its transactions before submitting again.');
    }
    var data = encodeFunctionData({ abi: CREDIT_CLAIM_ABI, functionName: 'claimTokensFor', args: args });
    if (String(call.data).toLowerCase() !== data.toLowerCase()) throw new Error('The saved credit claim calldata does not match its reviewed arguments.');
    return { chainId: cid, name: call.name || ('Chain ' + cid), projectId: BigInt(args[1]), holder: args[0],
      controller: call.to, token: token, tokenCount: BigInt(args[2]) };
  });
  return verifyCreditClaims(plans, readState, chainId);
}
