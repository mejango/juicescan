// src/defifa.js
// Native Defifa NFT actions for every Defifa 721 generation (1.0.2, retired, and 2.0.0; their native interface is
// the same): pay, cash out and transfer preparation, receipt-bound effect checks, the saved-call proof and the
// recovery context. Started as a lean mirror of nana-sdk-core 3.4.1 v6/defifa.ts and v6/tierPrice.ts;
// test/fixtures/defifa-games/defifa.json pins results and reads.

import { decodeAbiParameters, decodeFunctionData, encodeAbiParameters, encodeFunctionData, erc20Abi, erc721Abi, isAddress, isHash, isHex, parseEventLogs, zeroAddress } from 'viem';
import { getABI } from './abi-registry.js';
import { createHookMetadata, hookMetadataId } from './hook-metadata.js';
import { defifaDeploymentOf, getProjectNftInventory, sameAddress } from './nft-inventory-read.js';
import { buildPayTx, resolvePaymentTerminal } from './pay-prepare.js';
import { hasExactSafeExecutionEvent, SAFE_EXECUTION_FAILURE_TOPIC, SAFE_EXECUTION_SUCCESS_TOPIC } from './safe.js';

const defifaActionAbi = [
  { name: 'defaultAttestationDelegate', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'getTierDelegateOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'gamePhaseReporter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'noContestTriggeredFor', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'tokensClaimableFor', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256[]' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { name: 'DEFIFA_TOKEN', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'BASE_PROTOCOL_TOKEN', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];

const defifaEffectAbi = [
  { name: 'Mint', type: 'event', inputs: [
    { type: 'uint256', name: 'tokenId', indexed: true },
    { type: 'uint256', name: 'tierId', indexed: true },
    { type: 'address', name: 'beneficiary', indexed: true },
    { type: 'uint256', name: 'totalAmountContributed' },
    { type: 'address', name: 'caller' },
  ] },
  { name: 'ClaimedTokens', type: 'event', inputs: [
    { type: 'address', name: 'beneficiary', indexed: true },
    { type: 'uint256', name: 'defifaTokenAmount' },
    { type: 'uint256', name: 'baseProtocolTokenAmount' },
    { type: 'address', name: 'caller' },
  ] },
];

const DISCOUNT_DENOMINATOR = 200n;

/** A tier's discounted price, flooring like JB721TiersHookStore: price - mulDiv(price, discountPercent, 200). */
export function effectiveTierPrice(price, discountPercent) {
  let discount = BigInt(discountPercent);
  if (discount <= 0n) return price;
  if (discount > DISCOUNT_DENOMINATOR) discount = DISCOUNT_DENOMINATOR;
  return price - (price * discount) / DISCOUNT_DENOMINATOR;
}

/** Adapter RPC/review budget, not a native protocol supply or metadata limit. */
export const MAX_DEFIFA_ACTION_NFTS = 128;

/** Phase-only display eligibility; preparation still authenticates current rules. */
export function defifaPhaseAllowsPay(phase) {
  return phase === 1;
}

/** NO_CONTEST additionally requires native activation, checked by preparation. */
export function defifaPhaseAllowsCashOut(phase) {
  return phase === 1 || phase === 2 || phase === 4 || phase === 5;
}

function assertActionSize(count) {
  if (count < 1 || count > MAX_DEFIFA_ACTION_NFTS) throw new Error(`Defifa preparations accept 1–${MAX_DEFIFA_ACTION_NFTS} NFTs per action.`);
}

function address(value, label, allowZero = false) {
  if (!isAddress(value) || (!allowZero && value === zeroAddress)) throw new Error(`${label} must be a valid${allowZero ? '' : ' nonzero'} address.`);
  return value;
}

function buildCashOutTx({ chainId, terminal, holder, projectId, cashOutCount, tokenToReclaim, minTokensReclaimed = 0n, beneficiary, metadata = '0x' }) {
  return {
    chainId,
    address: terminal,
    abi: getABI('JBMultiTerminal', chainId),
    functionName: 'cashOutTokensOf',
    args: [holder, projectId, cashOutCount, tokenToReclaim, minTokensReclaimed, beneficiary, metadata],
  };
}

function build721CashOutMetadata({ metadataIdTarget, tokenIds }) {
  if (tokenIds.length === 0) throw new Error('build721CashOutMetadata requires at least one token id');
  if (new Set(tokenIds.map(String)).size !== tokenIds.length) throw new Error('build721CashOutMetadata token ids must be unique');
  if (tokenIds.some((tokenId) => tokenId <= 0n)) throw new Error('build721CashOutMetadata token ids must be positive');
  return createHookMetadata([hookMetadataId(metadataIdTarget, 'cashOut')], [encodeAbiParameters([{ type: 'uint256[]' }], [tokenIds])]);
}

/**
 * Native Defifa pay payload: (address attestationDelegate, uint16[] tierIds), keyed to the hook implementation.
 * Zero delegates through the game's configured default, or to the beneficiary. Generic 721 pay metadata is
 * incompatible: its true boolean becomes address 1.
 */
export function buildDefifaPayMetadata({ metadataIdTarget, tierIdsToMint, attestationDelegate = zeroAddress }) {
  address(metadataIdTarget, 'Defifa metadataIdTarget');
  address(attestationDelegate, 'Defifa attestation delegate', true);
  if (tierIdsToMint.length === 0 || tierIdsToMint.some((id, index) => typeof id !== 'bigint' || id < 1n || id > 65535n || (index > 0 && id < tierIdsToMint[index - 1]))) {
    throw new Error('Defifa tier IDs must be nonempty, ascending positive uint16 values; repeats mint multiple NFTs.');
  }
  return createHookMetadata([hookMetadataId(metadataIdTarget, 'pay')], [
    encodeAbiParameters([{ type: 'address' }, { type: 'uint16[]' }], [attestationDelegate, tierIdsToMint.map(Number)]),
  ]);
}

async function actionContext(client, args, blockNumber) {
  address(args.account, 'Defifa account');
  if (args.expectedHook) address(args.expectedHook, 'Defifa expected hook');
  if (args.projectId <= 0n) throw new Error('Defifa projectId must be positive.');
  const inventory = await getProjectNftInventory(client, { chainId: args.chainId, projectId: args.projectId, tierLimit: 1, blockNumber });
  if (inventory?.protocol !== 'defifa') throw new Error('Project is not an authenticated native Defifa game.');
  if (args.expectedHook && !sameAddress(inventory.hook, args.expectedHook)) throw new Error('Defifa collection changed since review.');
  const snapshot = { ...client, readContract: (parameters) => client.readContract({ ...parameters, blockNumber: inventory.blockNumber }) };
  return { inventory, snapshot };
}

async function paymentTerminal(snapshot, args, inventory) {
  const terminal = await resolvePaymentTerminal(snapshot, { chainId: args.chainId, projectId: args.projectId, token: inventory.pricing.token });
  if (terminal.isRouter) throw new Error('Defifa settlement token has no primary terminal.');
  const context = await snapshot.readContract({
    address: terminal.address,
    abi: getABI('JBMultiTerminal', args.chainId),
    functionName: 'accountingContextForTokenOf',
    args: [args.projectId, inventory.pricing.token],
  });
  if (!sameAddress(context.token, inventory.pricing.token) || Number(context.currency) !== inventory.pricing.currency || Number(context.decimals) !== inventory.pricing.decimals) {
    throw new Error('Defifa terminal accounting does not match native pricing.');
  }
  return terminal.address;
}

/**
 * Fresh native identity, MINT phase, selected supply and exact tier cost at one block. Re-run after review and
 * compare the entire request before execution. ERC20 payments need allowance. Donations are separate
 * addToBalanceOf calls: native Defifa rejects overpayment.
 */
export async function prepareDefifaPay(client, args) {
  assertActionSize(args.tierIdsToMint.length);
  args = { ...args, tierIdsToMint: [...args.tierIdsToMint] };
  const beneficiary = address(args.beneficiary ?? args.account, 'Defifa beneficiary');
  const attestationDelegate = args.attestationDelegate ?? zeroAddress;
  buildDefifaPayMetadata({ metadataIdTarget: beneficiary, tierIdsToMint: args.tierIdsToMint, attestationDelegate });
  const { inventory, snapshot } = await actionContext(client, args);
  if (!defifaPhaseAllowsPay(inventory.phase) || inventory.ruleset.metadata.pausePay || !inventory.ruleset.metadata.useDataHookForPay) throw new Error('Defifa NFT entry is not open.');
  const counts = new Map();
  for (const tierId of args.tierIdsToMint) counts.set(tierId, (counts.get(tierId) ?? 0n) + 1n);
  const [terminal, configuredDelegate, selectedTiers] = await Promise.all([
    paymentTerminal(snapshot, args, inventory),
    snapshot.readContract({ address: inventory.hook, abi: defifaActionAbi, functionName: 'defaultAttestationDelegate' }),
    Promise.all([...counts].map(async ([tierId, count]) => {
      const tier = await snapshot.readContract({
        address: inventory.store,
        abi: getABI(defifaDeploymentOf(args.chainId, inventory.implementation).storeAbi, args.chainId),
        functionName: 'tierOf',
        args: [inventory.hook, tierId, false],
      });
      if (BigInt(tier.id) !== tierId || BigInt(tier.remainingSupply) < count) throw new Error(`Defifa tier ${tierId} is unavailable for the selected quantity.`);
      return { tierId, count, unitPrice: effectiveTierPrice(tier.price, tier.discountPercent) };
    })),
  ]);
  const amount = selectedTiers.reduce((sum, tier) => sum + tier.unitPrice * tier.count, 0n);
  const metadata = buildDefifaPayMetadata({ metadataIdTarget: inventory.implementation, tierIdsToMint: args.tierIdsToMint, attestationDelegate });
  const resolvedDelegate = attestationDelegate !== zeroAddress ? attestationDelegate : configuredDelegate !== zeroAddress ? configuredDelegate : beneficiary;
  const effectiveDelegates = await Promise.all([...counts.keys()].map(async (tierId) => {
    if (sameAddress(args.account, beneficiary)) return { tierId, delegate: resolvedDelegate };
    const prior = await snapshot.readContract({ address: inventory.hook, abi: defifaActionAbi, functionName: 'getTierDelegateOf', args: [beneficiary, tierId] });
    return { tierId, delegate: prior === zeroAddress ? beneficiary : prior };
  }));
  return {
    inventory,
    amount,
    selectedTiers,
    attestationDelegate,
    effectiveAttestationDelegate: new Set(effectiveDelegates.map(({ delegate }) => delegate.toLowerCase())).size === 1 ? effectiveDelegates[0].delegate : null,
    effectiveDelegates,
    transaction: buildPayTx({ chainId: args.chainId, terminal, projectId: args.projectId, token: inventory.pricing.token, amount, beneficiary, minReturnedTokens: 0n, memo: args.memo, metadata }),
  };
}

async function requireOwner(snapshot, hook, tokenId, account) {
  const owner = await snapshot.readContract({ address: hook, abi: erc721Abi, functionName: 'ownerOf', args: [tokenId] });
  if (!sameAddress(owner, account)) throw new Error(`Defifa NFT ${tokenId} is not owned by the sender.`);
}

/** Fresh owner/phase checks and exact cashOutTokensOf simulation, with no ERC721 approval. */
export async function prepareDefifaCashOut(client, args) {
  assertActionSize(args.tokenIds.length);
  args = { ...args, tokenIds: [...args.tokenIds] };
  const beneficiary = address(args.beneficiary ?? args.account, 'Defifa beneficiary');
  const minimumReclaim = args.minimumReclaim ?? 0n;
  if (minimumReclaim < 0n) throw new Error('Defifa minimum reclaim cannot be negative.');
  const tokenIds = [...args.tokenIds];
  build721CashOutMetadata({ metadataIdTarget: beneficiary, tokenIds });
  const { inventory, snapshot } = await actionContext(client, args);
  if (!defifaPhaseAllowsCashOut(inventory.phase)) throw new Error('Defifa NFT cash-out is not available in this phase.');
  if (inventory.phase === 5) {
    const reporter = await snapshot.readContract({ address: inventory.hook, abi: defifaActionAbi, functionName: 'gamePhaseReporter' });
    const activated = await snapshot.readContract({ address: reporter, abi: defifaActionAbi, functionName: 'noContestTriggeredFor', args: [args.projectId] });
    if (!activated) throw new Error('Defifa no-contest must be activated before refunds.');
  }
  await Promise.all(tokenIds.map((tokenId) => requireOwner(snapshot, inventory.hook, tokenId, args.account)));
  const terminal = await paymentTerminal(snapshot, args, inventory);
  const transaction = buildCashOutTx({
    chainId: args.chainId,
    terminal,
    holder: args.account,
    projectId: args.projectId,
    cashOutCount: 0n,
    tokenToReclaim: inventory.pricing.token,
    minTokensReclaimed: minimumReclaim,
    beneficiary,
    metadata: build721CashOutMetadata({ metadataIdTarget: inventory.implementation, tokenIds }),
  });
  const [simulation, rewards, defifaToken, baseProtocolToken] = await Promise.all([
    client.simulateContract({ ...transaction, account: args.account, blockNumber: inventory.blockNumber }),
    snapshot.readContract({ address: inventory.hook, abi: defifaActionAbi, functionName: 'tokensClaimableFor', args: [tokenIds] }),
    snapshot.readContract({ address: inventory.hook, abi: defifaActionAbi, functionName: 'DEFIFA_TOKEN' }),
    snapshot.readContract({ address: inventory.hook, abi: defifaActionAbi, functionName: 'BASE_PROTOCOL_TOKEN' }),
  ]);
  const [defifaDecimals, baseProtocolDecimals] = await Promise.all([
    snapshot.readContract({ address: defifaToken, abi: erc20Abi, functionName: 'decimals' }),
    snapshot.readContract({ address: baseProtocolToken, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  return {
    inventory,
    transaction,
    reclaimAmount: simulation.result,
    protocolRewards: { defifaToken, defifaAmount: rewards[0], defifaDecimals, baseProtocolToken, baseProtocolAmount: rewards[1], baseProtocolDecimals },
  };
}

/** Standard NFT transfer; native pause flags and receiver callbacks are simulated exactly. */
export async function prepareDefifaTransfer(client, args) {
  args = { ...args };
  address(args.recipient, 'Defifa recipient');
  if (args.tokenId <= 0n) throw new Error('Defifa tokenId must be positive.');
  const { inventory, snapshot } = await actionContext(client, args);
  await requireOwner(snapshot, inventory.hook, args.tokenId, args.account);
  const transaction = { chainId: args.chainId, address: inventory.hook, abi: erc721Abi, functionName: 'safeTransferFrom', args: [args.account, args.recipient, args.tokenId] };
  await client.simulateContract({ ...transaction, account: args.account, blockNumber: inventory.blockNumber });
  return { inventory, transaction };
}

function requireNativeMetadata(metadata, expected) {
  if (expected.toLowerCase() !== metadata.toLowerCase()) throw new Error('Receipt does not prove the exact reviewed Defifa NFT effects.');
}

function payTierIds(metadata, implementation) {
  const [delegate, ids] = decodeAbiParameters([{ type: 'address' }, { type: 'uint16[]' }], `0x${metadata.slice(130)}`);
  const tierIds = ids.map(BigInt);
  requireNativeMetadata(metadata, buildDefifaPayMetadata({ metadataIdTarget: implementation, attestationDelegate: delegate, tierIdsToMint: tierIds }));
  return tierIds;
}

function cashOutTokenIds(metadata, implementation) {
  const [tokenIds] = decodeAbiParameters([{ type: 'uint256[]' }], `0x${metadata.slice(130)}`);
  requireNativeMetadata(metadata, build721CashOutMetadata({ metadataIdTarget: implementation, tokenIds: [...tokenIds] }));
  return [...tokenIds];
}

/**
 * A saved wallet call, as the Defifa write hold stores it: { chainId, account, safe, hash, call: { to, data, value } },
 * normalized. `hash` is the transaction hash, or the Safe proposal hash for a Safe call; null before the wallet answers.
 */
export function parseSavedCall(record) {
  const call = record?.call;
  if (!Number.isSafeInteger(record?.chainId) || record.chainId <= 0 || !isAddress(record.account ?? '', { strict: false }) || typeof record.safe !== 'boolean'
    || (record.hash != null && !isHash(record.hash)) || !isAddress(call?.to ?? '', { strict: false }) || !isHex(call.data) || call.data.length % 2 !== 0
    || typeof call.value !== 'string' || !/^(0|[1-9]\d{0,77})$/.test(call.value)) {
    throw new Error('Invalid saved write recovery record. Keep this action pending.');
  }
  return {
    chainId: record.chainId,
    account: record.account.toLowerCase(),
    safe: record.safe,
    hash: record.hash ? record.hash.toLowerCase() : null,
    call: { to: call.to.toLowerCase(), data: call.data.toLowerCase(), value: call.value },
  };
}

/**
 * How a saved call ran, proven from the chain: 'success' or 'failed'. A direct call must be the account's own
 * transaction of exactly that call. A Safe call is proven by the Safe's own ExecutionSuccess or ExecutionFailure
 * event for the saved proposal hash, whose EIP-712 hash commits to the call (a Safe execution transaction that
 * reverted outright, returned by the wallet as the saved hash, ran nothing). The block must be canonical, and a
 * Safe failure final: until then a reorg could let the same signed proposal run again. `transaction` and
 * `canonical` are the node's reads of `receipt`'s hash. Throws while any of that is unproven: keep the action held.
 */
export async function proveSavedCall(client, saved, receipt, transaction, canonical) {
  const record = parseSavedCall(saved);
  const pending = () => new Error('The saved wallet write is not yet proven. Keep this action pending.');
  const hash = receipt?.transactionHash?.toLowerCase();
  if (!record.hash || !isHash(hash ?? '') || (!record.safe && record.hash !== hash)) throw pending();
  if (!transaction || !canonical) [transaction, canonical] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
  const blockHash = canonical?.blockHash?.toLowerCase();
  if ((await client.getChainId()) !== record.chainId || transaction?.hash?.toLowerCase() !== hash || canonical.transactionHash?.toLowerCase() !== hash
    || !isHash(blockHash ?? '') || blockHash !== receipt.blockHash?.toLowerCase() || blockHash !== transaction.blockHash?.toLowerCase()
    || typeof canonical.blockNumber !== 'bigint' || canonical.blockNumber !== receipt.blockNumber || canonical.blockNumber !== transaction.blockNumber
    || (canonical.status !== 'success' && canonical.status !== 'reverted')) throw pending();
  let status;
  if (!record.safe) {
    if (!sameAddress(transaction.from, record.account) || !sameAddress(transaction.to ?? zeroAddress, record.call.to)
      || (transaction.input ?? '').toLowerCase() !== record.call.data || BigInt(transaction.value ?? 0n) !== BigInt(record.call.value)) throw pending();
    status = canonical.status === 'success' ? 'success' : 'failed';
  } else if (canonical.status === 'reverted') {
    if (hash !== record.hash || !sameAddress(transaction.to ?? zeroAddress, record.account)) throw pending();
    status = 'failed';
  } else {
    if (!Array.isArray(canonical.logs) || canonical.logs.some((log) => log.removed !== false || log.transactionHash?.toLowerCase() !== hash
      || log.blockHash?.toLowerCase() !== blockHash || log.blockNumber !== canonical.blockNumber)) throw pending();
    const ran = hasExactSafeExecutionEvent(canonical.logs, record.account, record.hash, SAFE_EXECUTION_SUCCESS_TOPIC);
    const failed = hasExactSafeExecutionEvent(canonical.logs, record.account, record.hash, SAFE_EXECUTION_FAILURE_TOPIC);
    if (ran === failed) throw pending();
    status = ran ? 'success' : 'failed';
  }
  if (record.safe && status === 'failed') {
    const finalized = await client.getBlock({ blockTag: 'finalized' });
    if (typeof finalized?.number !== 'bigint' || finalized.number < canonical.blockNumber) throw pending();
  }
  const block = await client.getBlock({ blockNumber: canonical.blockNumber });
  if (block?.number !== canonical.blockNumber || block.hash?.toLowerCase() !== blockHash) throw pending();
  return status;
}

/**
 * Reconstruct native verification context from an existing reviewed-write journal. Authenticates the
 * project/terminal at the receipt's historical block; never prepares, simulates or sends a new action. Call
 * verifyDefifaNftTransaction afterward: restoration alone proves no outcome.
 */
export async function restoreDefifaNftReceiptContext(client, args) {
  args = { ...args, receipt: { ...args.receipt } };
  const saved = parseSavedCall(args.record);
  function fail() {
    throw new Error('Saved call is not the reviewed native Defifa action. Keep this attempt pending.');
  }
  if (saved.chainId !== args.chainId || !saved.hash || (!saved.safe && saved.hash.toLowerCase() !== args.receipt.transactionHash.toLowerCase()) || typeof args.receipt.blockNumber !== 'bigint' || args.receipt.blockNumber < 0n) fail();
  const identity = { chainId: args.chainId, projectId: args.projectId, account: saved.account, expectedHook: args.expectedHook };
  const { inventory, snapshot } = await actionContext(client, identity, args.receipt.blockNumber);
  let transaction;
  if (sameAddress(saved.call.to, inventory.hook)) {
    const call = decodeFunctionData({ abi: erc721Abi, data: saved.call.data });
    if (call.functionName !== 'safeTransferFrom' || call.args.length !== 3) fail();
    const [from, recipient, tokenId] = call.args;
    if (!sameAddress(from, saved.account) || tokenId <= 0n) fail();
    address(recipient, 'Defifa recipient');
    transaction = { chainId: args.chainId, address: inventory.hook, abi: erc721Abi, functionName: 'safeTransferFrom', args: [from, recipient, tokenId] };
  } else {
    const terminal = await paymentTerminal(snapshot, identity, inventory);
    if (!sameAddress(saved.call.to, terminal)) fail();
    const call = decodeFunctionData({ abi: getABI('JBMultiTerminal', args.chainId), data: saved.call.data });
    if (call.functionName === 'pay') {
      const [projectId, token, amount, beneficiary, minimum, memo, metadata] = call.args;
      if (projectId !== args.projectId || !sameAddress(token, inventory.pricing.token)) fail();
      payTierIds(metadata, inventory.implementation);
      transaction = buildPayTx({ chainId: args.chainId, terminal, projectId, token, amount, beneficiary, minReturnedTokens: minimum, memo, metadata });
    } else if (call.functionName === 'cashOutTokensOf') {
      const [holder, projectId, count, token, minimum, beneficiary, metadata] = call.args;
      if (projectId !== args.projectId || !sameAddress(holder, saved.account) || !sameAddress(token, inventory.pricing.token) || count !== 0n) fail();
      cashOutTokenIds(metadata, inventory.implementation);
      transaction = buildCashOutTx({ chainId: args.chainId, terminal, projectId, holder, cashOutCount: count, tokenToReclaim: token, minTokensReclaimed: minimum, beneficiary, metadata });
    } else fail();
  }
  const data = encodeFunctionData(transaction);
  if (data.toLowerCase() !== saved.call.data.toLowerCase() || ('value' in transaction ? transaction.value : 0n) !== BigInt(saved.call.value)) fail();
  return { hook: inventory.hook, implementation: inventory.implementation, account: saved.account, transaction, ...(saved.safe ? { safe: { proposalHash: saved.hash } } : {}) };
}

/**
 * Verify native NFT effects of one exact reviewed call; throw if proof is missing. The caller must first
 * authenticate the canonical receipt and the actual chain/account/call/value. Receipt logs, not end-of-block
 * ownership, prove transfers: a receiver may forward an NFT in its callback or later in the same block.
 */
export function verifyDefifaNftReceipt({ hook, implementation, account, transaction }, receipt) {
  address(hook, 'Defifa receipt hook');
  address(account, 'Defifa receipt account');
  if (!defifaDeploymentOf(transaction.chainId, implementation)) throw new Error('Defifa receipt context does not match the pinned chain implementation.');
  if (receipt.status !== 'success') throw new Error('Defifa transaction did not succeed.');
  const multiTerminalAbi = getABI('JBMultiTerminal', transaction.chainId);
  const hookLogs = receipt.logs.filter((log) => sameAddress(log.address, hook));
  const transfers = parseEventLogs({ abi: erc721Abi, eventName: 'Transfer', logs: hookLogs });
  const fail = () => {
    throw new Error('Receipt does not prove the exact reviewed Defifa NFT effects.');
  };
  if (transaction.functionName === 'safeTransferFrom') {
    const [from, recipient, tokenId] = transaction.args;
    if (!sameAddress(transaction.address, hook) || !sameAddress(from, account)) fail();
    if (transfers.filter(({ args }) => sameAddress(args.from, from) && sameAddress(args.to, recipient) && args.tokenId === tokenId).length !== 1) fail();
    return;
  }
  const terminalLogs = receipt.logs.filter((log) => sameAddress(log.address, transaction.address));
  if (transaction.functionName === 'pay') {
    const [projectId, , amount, beneficiary, , memo, metadata] = transaction.args;
    const tierIds = payTierIds(metadata, implementation);
    const payments = parseEventLogs({ abi: multiTerminalAbi, eventName: 'Pay', logs: terminalLogs }).filter(({ args }) => args.projectId === projectId && sameAddress(args.payer, account) && sameAddress(args.beneficiary, beneficiary) && args.amount === amount && args.memo === memo && args.metadata.toLowerCase() === metadata.toLowerCase() && sameAddress(args.caller, account));
    const mints = parseEventLogs({ abi: defifaEffectAbi, eventName: 'Mint', logs: hookLogs });
    if (payments.length !== 1 || mints.length !== tierIds.length || new Set(mints.map(({ args }) => args.tokenId)).size !== mints.length) fail();
    for (const [index, mint] of mints.entries()) {
      if (mint.args.tierId !== tierIds[index] || !sameAddress(mint.args.beneficiary, beneficiary) || mint.args.totalAmountContributed !== amount || !sameAddress(mint.args.caller, transaction.address)) fail();
      if (transfers.filter(({ args }) => args.from === zeroAddress && sameAddress(args.to, beneficiary) && args.tokenId === mint.args.tokenId).length !== 1) fail();
    }
    return;
  }
  const [holder, projectId, cashOutCount, , minimum, beneficiary, metadata] = transaction.args;
  const tokenIds = cashOutTokenIds(metadata, implementation);
  if (!sameAddress(holder, account) || cashOutCount !== 0n) fail();
  const cashOuts = parseEventLogs({ abi: multiTerminalAbi, eventName: 'CashOutTokens', logs: terminalLogs }).filter(({ args }) => args.projectId === projectId && sameAddress(args.holder, holder) && sameAddress(args.beneficiary, beneficiary) && args.cashOutCount === 0n && args.reclaimAmount >= minimum && args.metadata.toLowerCase() === metadata.toLowerCase() && sameAddress(args.caller, account));
  const burns = transfers.filter(({ args }) => sameAddress(args.from, holder) && args.to === zeroAddress);
  if (cashOuts.length !== 1 || burns.length !== tokenIds.length || tokenIds.some((id) => burns.filter(({ args }) => args.tokenId === id).length !== 1)) fail();
  if (cashOuts[0].args.reclaimAmount === 0n) {
    const claims = parseEventLogs({ abi: defifaEffectAbi, eventName: 'ClaimedTokens', logs: hookLogs });
    if (!claims.some(({ args }) => sameAddress(args.beneficiary, beneficiary) && sameAddress(args.caller, transaction.address) && (args.defifaTokenAmount > 0n || args.baseProtocolTokenAmount > 0n))) fail();
  }
}

/**
 * The exact reviewed action failed: a direct call's own transaction reverted in a canonical block, or a Safe
 * execution failed in a canonical finalized block. This closes only that attempt; a reverted Safe outer
 * executor alone does not establish it.
 */
export class DefifaNftTransactionRevertedError extends Error {
  constructor(hash, chainId) {
    super('The reviewed Defifa transaction failed onchain.');
    this.hash = hash;
    this.chainId = chainId;
    this.name = 'DefifaNftTransactionRevertedError';
  }
}

/**
 * Authenticate canonical execution of the exact reviewed call (proveSavedCall), then prove native NFT effects.
 * Only DefifaNftTransactionRevertedError proves failure; on any other error keep context and receipt and retry
 * this read-only function, never resend.
 */
export async function verifyDefifaNftTransaction(client, context, receipt) {
  const { transaction, account } = context;
  const call = { to: transaction.address, data: encodeFunctionData(transaction), value: 'value' in transaction ? transaction.value : 0n };
  const actualPromise = client.getTransaction({ hash: receipt.transactionHash });
  const canonicalPromise = client.getTransactionReceipt({ hash: receipt.transactionHash });
  const [chainId, actual, canonical] = await Promise.all([client.getChainId(), actualPromise, canonicalPromise]);
  if (chainId !== transaction.chainId || canonical.blockHash !== receipt.blockHash || canonical.blockNumber !== receipt.blockNumber || canonical.transactionHash.toLowerCase() !== receipt.transactionHash.toLowerCase()) {
    throw new Error('Defifa receipt identity is unavailable or changed; keep this transaction pending.');
  }
  if (!context.safe && !sameAddress(actual.from, account)) throw new Error('Defifa transaction sender does not match the reviewed account.');
  const saved = { chainId: transaction.chainId, account, safe: Boolean(context.safe), hash: context.safe?.proposalHash ?? receipt.transactionHash, call: { ...call, value: call.value.toString() } };
  // The chain id was read above: the proof re-reads only the canonical block.
  const status = await proveSavedCall({ ...client, getChainId: async () => chainId }, saved, canonical, actual, canonical);
  if (status === 'failed') throw new DefifaNftTransactionRevertedError(canonical.transactionHash, chainId);
  // The caller's supplied logs may be stale or fabricated: only fresh canonical logs reach the effect verifier.
  if (canonical.logs.some((log) => log.removed !== false || log.transactionHash?.toLowerCase() !== canonical.transactionHash.toLowerCase() || log.blockHash?.toLowerCase() !== canonical.blockHash.toLowerCase() || log.blockNumber !== canonical.blockNumber || log.transactionIndex !== canonical.transactionIndex)) {
    throw new Error('Defifa receipt logs are not bound to the canonical transaction.');
  }
  verifyDefifaNftReceipt(context, canonical);
}
