// src/nft-inventory-read.js
// NFT inventory discovery and native Defifa holdings. Lean mirror of nana-sdk-core 3.4.1 v6/nftInventory.ts,
// v6/defifaHoldings.ts and the 721 shop read in v6/nft.ts (@ballkidz/defifa 1.0.2 native interface);
// test/fixtures/sdk-3.4.1/nft-inventory.json pins identical results and identical reads. Every read is fail-closed:
// an RPC failure throws, an unrecognized hook returns null, and nothing is ever read as zero.

import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, isAddress, zeroAddress } from 'viem';
import { getABI, getAddress } from './abi-registry.js';

// The one JB721 tiers hook store every Defifa game uses (@ballkidz/defifa 1.0.2, same address on every chain).
const DEFIFA_STORE = '0x69913acf79dbba170d9efafe605ee62b42164f9c';
const TOKEN_MULTIPLIER = 1000000000n;

const defifaReadAbi = [
  { name: 'store', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'CODE_ORIGIN', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'projectId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'gamePhaseReporter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'gamePotReporter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'pricingCurrency', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'contractURI', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'tierNameOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
  { name: 'currentSupplyOfTier', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'currentGamePotOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'bool' }], outputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }] },
  { name: 'currentGamePhaseOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
];

const ownershipAbi = [
  { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'ERC721NonexistentToken', type: 'error', inputs: [{ type: 'uint256', name: 'tokenId' }] },
];

export function sameAddress(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

export function v6Address(contract, chainId) {
  const found = getAddress(contract, chainId);
  if (!found) throw new Error(`No v6 ${contract} deployment on chain ${chainId}`);
  return found;
}

// The native deployer and its hook implementation, from the deployment registry; null off the Defifa chains.
export function defifaDeployment(chainId) {
  const deployer = getAddress('DefifaDeployer', chainId);
  const implementation = getAddress('DefifaHook', chainId);
  return deployer && implementation ? { deployer, implementation } : null;
}

// A proven revert or empty return means the contract lacks the function; transport failures prove nothing.
function isMissingContractFunctionError(error) {
  return error instanceof BaseError && error.walk((cause) => cause instanceof ContractFunctionRevertedError || cause instanceof ContractFunctionZeroDataError) !== null;
}

async function readRuleset(client, functionName, { chainId, projectId }) {
  const [ruleset, metadata] = await client.readContract({
    address: v6Address('JBController', chainId),
    abi: getABI('JBController', chainId),
    functionName,
    args: [projectId],
  });
  return { ruleset, metadata };
}

// The project's 721 shop: hook, store, metadata target, pricing and tiers. Null only when the project
// authoritatively has no shop; a failed read throws.
async function read721Shop(client, { chainId, projectId, isRevnet, ruleset, tierLimit, categories, includeResolvedUri, startingId }) {
  let hook = null;
  let authoritative = true;
  if (isRevnet) {
    const revnetHook = await client.readContract({
      address: v6Address('REVOwner', chainId),
      abi: getABI('REVOwner', chainId),
      functionName: 'tiered721HookOf',
      args: [projectId],
    });
    hook = revnetHook !== zeroAddress ? revnetHook : null;
  } else {
    const dataHook = ruleset.metadata.dataHook;
    if (dataHook && dataHook !== zeroAddress) {
      const omni = getAddress('JBOmnichainDeployer', chainId);
      if (omni && dataHook.toLowerCase() === omni.toLowerCase()) {
        const [omniHook] = await client.readContract({
          address: omni,
          abi: getABI('JBOmnichainDeployer', chainId),
          functionName: 'tiered721HookOf',
          args: [projectId, BigInt(ruleset.ruleset.id)],
        });
        hook = omniHook !== zeroAddress ? omniHook : null;
      } else {
        hook = dataHook;
        authoritative = false;
      }
    }
  }
  if (!hook) return null;
  const hookAbi = getABI('JB721TiersHook', chainId);
  const readStore = () => client.readContract({ address: hook, abi: hookAbi, functionName: 'STORE' });
  const store = authoritative ? await readStore() : await readStore().catch((error) => {
    if (isMissingContractFunctionError(error)) return null;
    throw error;
  });
  if (!store) return null;
  // Older hooks without METADATA_ID_TARGET key pay metadata off the hook itself; any other failure throws.
  const [metadataIdTarget, pricingRaw] = await Promise.all([
    client.readContract({ address: hook, abi: hookAbi, functionName: 'METADATA_ID_TARGET' }).catch((error) => {
      if (isMissingContractFunctionError(error)) return hook;
      throw error;
    }),
    client.readContract({ address: hook, abi: hookAbi, functionName: 'pricingContext' }),
  ]);
  const raw = await client.readContract({
    address: store,
    abi: getABI('JB721TiersHookStore', chainId),
    functionName: 'tiersOf',
    args: [hook, categories, includeResolvedUri, startingId, BigInt(tierLimit)],
  });
  const tiers = raw.filter((tier) => tier.initialSupply > 0).map((tier) => ({
    id: tier.id,
    price: tier.price,
    remainingSupply: tier.remainingSupply,
    initialSupply: tier.initialSupply,
    votingUnits: tier.votingUnits,
    reserveFrequency: tier.reserveFrequency,
    category: tier.category,
    discountPercent: tier.discountPercent,
    encodedIpfsUri: tier.encodedIpfsUri,
    resolvedUri: tier.resolvedUri ?? '',
  }));
  return {
    hook,
    store,
    metadataIdTarget,
    pricing: { currency: Number(pricingRaw[0]), decimals: Number(pricingRaw[1]) },
    tiers,
    ruleset: isRevnet ? null : ruleset,
  };
}

/**
 * Discover displayable NFT tiers at one block, including Defifa games before entry starts and after payments
 * stop. Unknown hooks return null; RPC failures throw. Defifa recognition requires the pinned deployer, exact
 * clone runtime, project binding, native implementation/store and both game reporters.
 */
export async function getProjectNftInventory(client, args) {
  const { chainId, projectId, isRevnet = false, tierLimit = 100, startingId = 0n, categories = [], includeResolvedUri = false } = args;
  if (!Number.isInteger(tierLimit) || tierLimit < 1 || tierLimit > 128) throw new Error('NFT inventory tierLimit must be an integer between 1 and 128.');
  if (startingId < 0n) throw new Error('NFT inventory startingId cannot be negative.');
  if (categories.some((category, index) => category < 0n || category > 0xffffffn || (index > 0 && category <= categories[index - 1]))) {
    throw new Error('NFT inventory categories must be ascending, unique uint24 values for stable pagination.');
  }
  if ((await client.getChainId()) !== chainId) throw new Error('NFT inventory client is connected to the wrong chain.');
  if (args.blockNumber !== undefined && args.blockNumber < 0n) throw new Error('NFT inventory blockNumber cannot be negative.');
  const blockNumber = args.blockNumber ?? (await client.getBlockNumber());
  const snapshot = { ...client, readContract: (parameters) => client.readContract({ ...parameters, blockNumber }) };
  const ruleset = isRevnet ? undefined : await readRuleset(snapshot, 'currentRulesetOf', args);
  const hook = ruleset?.metadata.dataHook;
  const deployment = defifaDeployment(chainId);
  let owner;
  // Only project ownership by the native deployer admits a Defifa candidate; arbitrary custom hooks are never probed as Defifa.
  if (!isRevnet && deployment) {
    owner = await snapshot.readContract({ address: v6Address('JBProjects', chainId), abi: getABI('JBProjects', chainId), functionName: 'ownerOf', args: [projectId] });
  }
  if (!deployment || !owner || !sameAddress(owner, deployment.deployer)) {
    const shop = await read721Shop(snapshot, { chainId, projectId, isRevnet, ruleset, tierLimit: tierLimit + 1, categories, includeResolvedUri, startingId });
    if (!shop) return null;
    return {
      ...shop,
      protocol: 'jb721',
      blockNumber,
      tiers: shop.tiers.slice(0, tierLimit),
      nextStartingId: shop.tiers[tierLimit] ? BigInt(shop.tiers[tierLimit].id) : null,
      capabilities: { genericPay: true, genericCashOut: true, manageTiers: true },
    };
  }
  // Countdown has no active ruleset yet; its first configured hook is queued.
  const hookRuleset = !hook || hook === zeroAddress ? await readRuleset(snapshot, 'upcomingRulesetOf', args) : ruleset;
  const defifaHook = hookRuleset.metadata.dataHook;
  if (!defifaHook || defifaHook === zeroAddress) return null;
  const cloneCode = await client.getBytecode({ address: defifaHook, blockNumber });
  const expectedCode = `0x363d3d373d3d3d363d73${deployment.implementation.slice(2)}5af43d82803e903d91602b57fd5bf3`;
  if (cloneCode?.toLowerCase() !== expectedCode) throw new Error('Defifa hook clone does not match its pinned implementation.');
  const read = (functionName) => snapshot.readContract({ address: defifaHook, abi: defifaReadAbi, functionName });
  const [store, implementation, hookProjectId, phaseReporter, potReporter, currency, contractUri] = await Promise.all([
    read('store'), read('CODE_ORIGIN'), read('projectId'), read('gamePhaseReporter'), read('gamePotReporter'), read('pricingCurrency'), read('contractURI'),
  ]);
  if (!sameAddress(store, DEFIFA_STORE) || !sameAddress(implementation, deployment.implementation) || hookProjectId !== projectId
    || !sameAddress(phaseReporter, deployment.deployer) || !sameAddress(potReporter, deployment.deployer)) {
    throw new Error('Defifa hook provenance does not match the project deployment.');
  }
  const [pot, phase, raw] = await Promise.all([
    snapshot.readContract({ address: deployment.deployer, abi: defifaReadAbi, functionName: 'currentGamePotOf', args: [projectId, false] }),
    snapshot.readContract({ address: deployment.deployer, abi: defifaReadAbi, functionName: 'currentGamePhaseOf', args: [projectId] }),
    snapshot.readContract({
      address: store,
      abi: getABI('JB721TiersHookStore', chainId),
      functionName: 'tiersOf',
      args: [defifaHook, categories, includeResolvedUri, startingId, BigInt(tierLimit + 1)],
    }),
  ]);
  if (typeof currency !== 'bigint' || currency > 0xffffffffn || pot[2] > 255n || pot[1] === zeroAddress || phase > 5) throw new Error('Defifa pricing or phase context is invalid.');
  const visible = raw.filter((tier) => tier.initialSupply > 0);
  const tiers = await Promise.all(visible.slice(0, tierLimit).map(async (tier) => {
    const [name, currentSupply] = await Promise.all([
      snapshot.readContract({ address: defifaHook, abi: defifaReadAbi, functionName: 'tierNameOf', args: [BigInt(tier.id)] }),
      snapshot.readContract({ address: defifaHook, abi: defifaReadAbi, functionName: 'currentSupplyOfTier', args: [BigInt(tier.id)] }),
    ]);
    return { ...tier, name, currentSupply };
  }));
  return {
    protocol: 'defifa',
    hook: defifaHook,
    store,
    implementation,
    contractUri,
    pricing: { currency: Number(currency), decimals: Number(pot[2]), token: pot[1] },
    phase,
    tiers,
    ruleset: hookRuleset,
    blockNumber,
    capabilities: { genericPay: false, genericCashOut: false, manageTiers: false },
    nextStartingId: visible[tierLimit] ? BigInt(visible[tierLimit].id) : null,
  };
}

function nonexistentToken(error) {
  if (!(error instanceof BaseError)) return false;
  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError && revert.data?.errorName === 'ERC721NonexistentToken';
}

function cursorOffset(cursor) {
  if (cursor !== undefined && (typeof cursor !== 'string' || !/^(0|[1-9]\d{0,77})$/.test(cursor) || BigInt(cursor) >= 1n << 256n)) throw new Error('Enter a valid inventory cursor.');
  return cursor === undefined ? 0n : BigInt(cursor);
}

/** Cumulative-mint scan of one holdings page; callers authenticate the snapshot first. */
export async function scanDefifaHoldings(client, context) {
  const { hook, blockNumber, account, owned, tiers, cursor, limit } = context;
  const minted = tiers.map((tier) => ({ tierId: Number(tier.id), count: BigInt(tier.initialSupply) - BigInt(tier.remainingSupply) }));
  if (minted.some((tier) => tier.count < 0n)) throw new Error('The NFT supply returned an invalid count.');
  const total = minted.reduce((sum, tier) => sum + tier.count, 0n);
  const start = cursorOffset(cursor);
  if (start > total) throw new Error('The inventory cursor is outside this snapshot.');
  if (owned === 0n) return { tokens: [], totalOwned: 0n, totalCandidates: total, nextCursor: null, complete: true };
  const end = start + BigInt(limit) < total ? start + BigInt(limit) : total;
  const candidates = [];
  let offset = 0n;
  for (const tier of minted) {
    const low = start > offset ? start - offset : 0n;
    const high = end < offset + tier.count ? end - offset : tier.count;
    for (let i = low; i < high; i++) candidates.push({ tierId: tier.tierId, tokenId: BigInt(tier.tierId) * TOKEN_MULTIPLIER + i + 1n });
    offset += tier.count;
    if (offset >= end) break;
  }
  const checks = await Promise.all(candidates.map(async (token) => {
    try {
      const owner = await client.readContract({ address: hook, abi: ownershipAbi, functionName: 'ownerOf', args: [token.tokenId], blockNumber });
      return owner.toLowerCase() === account.toLowerCase() ? token : null;
    } catch (error) {
      if (nonexistentToken(error)) return null;
      throw error;
    }
  }));
  const tokens = checks.filter((token) => token !== null);
  const complete = end === total || (start === 0n && BigInt(tokens.length) === owned);
  return { tokens, totalOwned: owned, totalCandidates: total, nextCursor: complete ? null : end.toString(), complete };
}

/** Authenticated, bounded native holdings at one immutable snapshot; no indexer required. */
export async function getDefifaHoldings(client, args) {
  const { chainId, projectId, account, expectedHook, cursor, blockNumber, limit = 100 } = args;
  if (!isAddress(account) || account === zeroAddress) throw new Error('Provide a nonzero holdings account.');
  if (expectedHook !== undefined && (!isAddress(expectedHook) || expectedHook === zeroAddress)) throw new Error('Provide a valid expected Defifa hook.');
  if (projectId <= 0n || projectId >= 1n << 256n) throw new Error('Provide a valid Defifa project ID.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Defifa holdings limit must be between 1 and 200.');
  cursorOffset(cursor);
  if (cursor !== undefined && blockNumber === undefined) throw new Error('Holdings continuation requires its original blockNumber.');
  if (blockNumber !== undefined && blockNumber < 0n) throw new Error('Provide a valid holdings blockNumber.');
  const identity = await getProjectNftInventory(client, { chainId, projectId, blockNumber, tierLimit: 1 });
  if (!identity || identity.protocol !== 'defifa') throw new Error('The project is not a verified Defifa collection.');
  if (expectedHook && expectedHook.toLowerCase() !== identity.hook.toLowerCase()) throw new Error('The Defifa hook changed. Refresh the collection.');
  const snapshot = identity.blockNumber;
  const owned = await client.readContract({ address: identity.hook, abi: ownershipAbi, functionName: 'balanceOf', args: [account], blockNumber: snapshot });
  if (owned < 0n || owned >= 1n << 256n) throw new Error('The NFT balance returned an invalid count.');
  const tiers = [];
  const ids = new Set();
  const cursors = new Set();
  let startingId = 0n;
  for (;;) {
    if (cursors.has(startingId)) throw new Error('Defifa holdings tier pagination repeated a cursor.');
    cursors.add(startingId);
    const raw = await client.readContract({
      address: identity.store,
      abi: getABI('JB721TiersHookStore', chainId),
      functionName: 'tiersOf',
      args: [identity.hook, [], false, startingId, 129n],
      blockNumber: snapshot,
    });
    if (raw.length > 129 || raw.some((tier) => !Number.isSafeInteger(tier.initialSupply) || tier.initialSupply < 0)) throw new Error('The NFT tier page returned an invalid count.');
    const visible = raw.filter((tier) => tier.initialSupply > 0);
    for (const tier of visible.slice(0, 128)) {
      if (!Number.isSafeInteger(tier.id) || tier.id < 1 || tier.id > 65535 || ids.has(tier.id)) throw new Error('Defifa holdings returned an invalid or duplicate tier ID.');
      if (!Number.isSafeInteger(tier.initialSupply) || !Number.isSafeInteger(tier.remainingSupply) || tier.remainingSupply < 0 || tier.remainingSupply > tier.initialSupply || tier.initialSupply >= Number(TOKEN_MULTIPLIER)) {
        throw new Error('The NFT supply returned an invalid count.');
      }
      ids.add(tier.id);
      tiers.push(tier);
    }
    if (tiers.length > 4096 || (tiers.length === 4096 && visible[128])) throw new Error('Defifa holdings tier pagination exceeded 4096 tiers.');
    if (!visible[128]) break;
    startingId = BigInt(visible[128].id);
  }
  const result = await scanDefifaHoldings(client, { hook: identity.hook, blockNumber: snapshot, account, owned, tiers, cursor, limit });
  return { hook: identity.hook, blockNumber: snapshot, ...result };
}
