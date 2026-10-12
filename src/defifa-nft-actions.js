import { prepareDefifaPay, prepareDefifaCashOut, prepareDefifaTransfer, getDefifaHoldings, verifyDefifaNftTransaction, restoreDefifaNftReceiptContext, DefifaNftTransactionRevertedError, MAX_DEFIFA_ACTION_NFTS, defifaPhaseAllowsPay, defifaPhaseAllowsCashOut, effectiveTierPrice } from '@bananapus/nana-sdk-core/v6';
import { encodeFunctionData, decodeFunctionData, TransactionReceiptNotFoundError } from 'viem';
import { createBrowserWriteRecovery, readBrowserWriteRecovery, verifyReviewedWriteReceipt } from '@bananapus/nana-sdk-core/review';
import { txHashForSafeTx } from './safe-app.js';
import { getAccount, getViewAs, connect, createPublicClientForChain, executeTransaction, waitForTrackedTransactionReceipt, onEffectiveAccountChange, ZERO_ADDRESS, isAddr, isSafeConnected, formatAmount, readErc20Allowance, erc20ApproveAbi, NATIVE_TOKEN } from './component-base.js';
import { readProjectNftInventory } from './nft-inventory.js';

const actionNames = { mint: 'pay', cashout: 'cash-out', transfer: 'transfer' };

function approvalOf(record) {
  try { var decoded = decodeFunctionData({ abi: erc20ApproveAbi, data: record.call.data }); return decoded.functionName === 'approve' ? decoded : null; }
  catch { return null; }
}

async function assertApprovalGranted(client, record, receipt) {
  var approval = approvalOf(record);
  if (!approval) throw new Error('Original approval calldata is unavailable.');
  var allowance = await readErc20Allowance(client, record.call.to, record.account, approval.args[0], receipt.blockNumber);
  if (allowance < approval.args[1]) throw new Error('Original approval did not grant the reviewed allowance. Keep this action pending.');
}

function fingerprint(prepared) {
  return JSON.stringify({ transaction: prepared.transaction, phase: prepared.inventory.phase,
    hook: prepared.inventory.hook, implementation: prepared.inventory.implementation,
    pricing: prepared.inventory.pricing, prices: prepared.inventory.tiers.map(function (tier) { return [tier.id, tier.price]; }),
    delegate: prepared.effectiveAttestationDelegate, delegates: prepared.effectiveDelegates, selectedTiers: prepared.selectedTiers, reclaim: prepared.reclaimAmount, rewards: prepared.protocolRewards },
  function (key, value) { return typeof value === 'bigint' ? value.toString() : value; });
}

// The SDK owns calldata, phase/ownership checks, holdings pagination and receipt effects.
export function renderDefifaNftActions(inventory, chainId, projectId, formatPrice, options) {
  options = options || {};
  var mintOnly = options.mode === 'mint', holdingsOnly = options.mode === 'holdings';
  var updateCartView = function () {}, readMintDraft = function () { return null; }, cartRevision = 0;
  function cartSnapshot() { var entries = options.cart.entries(); return JSON.stringify(Object.keys(entries).filter(function (id) { return entries[id] > 0; }).sort(function (a, b) { return Number(a) - Number(b); }).map(function (id) { return [id, entries[id]]; })); }
  var root = document.createElement('section'); root.className = 'defifa-nft-actions'; root.setAttribute('aria-label', 'Defifa NFT actions'); root.style.overflowWrap = 'anywhere';
  var recoveryBody = document.createElement('div'), body = document.createElement('div'), status = document.createElement('p'); status.setAttribute('role', 'status');
  root.append(recoveryBody, body, status); if (mintOnly) status.className = 'paybox-status'; status.style.wordBreak = 'break-word';
  var records = new Map();
  function namespace(kind) { return 'defifa:' + actionNames[kind] + ':' + BigInt(projectId); }
  var client = createPublicClientForChain(chainId), current = inventory, holdings = null, holder = null, generation = 0, busy = false, disposed = false, active = true;
  function text(parent, tag, value) { var node = document.createElement(tag); node.textContent = value; parent.appendChild(node); return node; }
  function button(parent, label, action) { var node = text(parent, 'button', label); node.type = 'button'; node.className = 'btn'; node.addEventListener('click', action); return node; }
  function input(parent, label, type, value) {
    var wrap = document.createElement('label'); wrap.className = 'operator-edit-label'; wrap.style.display = 'block'; var caption = text(wrap, 'span', label); caption.style.overflowWrap = 'anywhere';
    var node = document.createElement('input'); node.type = type; node.value = value; node.className = 'field create-input'; node.setAttribute('aria-label', label);
    if (type !== 'checkbox') { caption.style.display = 'block'; node.style.width = type === 'number' ? '6ch' : '42ch'; node.style.maxWidth = '100%'; }
    wrap.appendChild(node); parent.appendChild(wrap); return node;
  }
  function message(value) { if (!disposed && active) status.textContent = value; }
  function assertAccount(account) {
    if (getViewAs()) throw new Error('Leave View as before transacting.');
    if (!account || !getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) throw new Error('Connected account changed. Refresh and review again.');
  }
  function error(err) { busy = false; if (disposed || !active) return; message(err.message || String(err)); body.replaceChildren(); button(body, 'Retry', refresh); }
  function readRecovery(account) {
    records.clear(); recoveryBody.replaceChildren();
    if (!account) return;
    Object.keys(actionNames).filter(function (kind) { return mintOnly ? kind === 'mint' : holdingsOnly ? kind !== 'mint' : true; }).forEach(function (kind) {
      var record = readBrowserWriteRecovery({ chainId: chainId, account: account, namespace: namespace(kind) });
      if (!record) return;
      records.set(kind, record);
      var card = document.createElement('div'); recoveryBody.appendChild(card);
      text(card, 'p', (approvalOf(record) ? 'Pending token approval' : 'Pending NFT ' + actionNames[kind]) + ': ' + (record.hash || 'Wallet submission outcome unknown. Do not submit this action again.'));
      if (!record.hash) return;
      button(card, record.safe ? 'Check Safe execution' : 'Check original transaction', async function (event) {
        var check = event.currentTarget, ticket = generation, resultMessage = ''; check.disabled = true;
        var recovery = createBrowserWriteRecovery(record);
        try {
          await recovery.withLock(async function () {
            recovery.submitted(record.hash, record);
            var receipt;
            if (record.safe) {
              try { receipt = await client.getTransactionReceipt({ hash: record.hash }); }
              catch (err) {
                if (!(err instanceof TransactionReceiptNotFoundError)) throw err;
                var executionHash = await txHashForSafeTx(record.hash);
                if (!executionHash) { resultMessage = 'Safe proposal remains unverified. No execution receipt is available.'; return; }
                receipt = await waitForTrackedTransactionReceipt(client, executionHash, null, chainId);
              }
            } else receipt = await waitForTrackedTransactionReceipt(client, record.hash, null, chainId);
            if (approvalOf(record)) {
              var outcome = await verifyReviewedWriteReceipt(client, record, receipt);
              if (outcome === 'success') await assertApprovalGranted(client, record, receipt);
              recovery.clear(record);
              resultMessage = outcome === 'failed' ? 'Original token approval ' + record.hash + ' failed onchain. Review a new approval if needed.' : 'Token approval ' + record.hash + ' verified onchain. Review NFT mint again to continue.';
              return;
            }
            try {
              var context = await restoreDefifaNftReceiptContext(client, { chainId: chainId, projectId: BigInt(projectId), record: record, receipt: receipt });
              await verifyDefifaNftTransaction(client, context, receipt);
            } catch (err) {
              if (!(err instanceof DefifaNftTransactionRevertedError)) throw err;
              recovery.clear(record); resultMessage = 'Original NFT transaction ' + record.hash + ' failed onchain. You may review a new transaction.'; return;
            }
            recovery.clear(record); resultMessage = 'Original NFT transaction ' + record.hash + ' verified onchain.';
          });
          if (disposed || !active || ticket !== generation || account !== getAccount()) return;
          busy = false; if (await refresh()) message(resultMessage);
        } catch (err) { if (!disposed && active && ticket === generation && account === getAccount()) message('Transaction remains unverified: ' + (err.message || String(err))); }
        finally { if (!disposed) check.disabled = false; }
      });
    });
  }
  async function refresh(initial) {
    if (busy || disposed || !active || (!root.isConnected && initial !== true)) return false;
    var ticket = ++generation, account = getAccount(); body.replaceChildren(); message('Loading NFT actions…');
    try {
      readRecovery(account);
      var next = initial === true && (mintOnly || holdingsOnly) ? await Promise.resolve(inventory) : await readProjectNftInventory(client, { chainId: chainId, projectId: BigInt(projectId) });
      if (disposed || !active || !root.isConnected || ticket !== generation || account !== getAccount()) return false;
      if (!next || next.protocol !== 'defifa' || next.hook.toLowerCase() !== inventory.hook.toLowerCase()) throw new Error('NFT collection identity changed. Reload the project.');
      var owned = account && !mintOnly ? await getDefifaHoldings(client, { chainId: chainId, projectId: BigInt(projectId), account: account, expectedHook: next.hook, blockNumber: next.blockNumber }) : null;
      if (ticket !== generation || account !== getAccount()) return;
      current = next; holdings = owned; holder = account; if (options.onInventory) options.onInventory(next); message(''); draw(); return true;
    } catch (err) { if (ticket === generation) error(err); return false; }
  }
  async function submit(kind, values) {
    if (busy || disposed || !active || !root.isConnected) return;
    var account = holder; busy = true; generation++;
    var ticket = generation, reviewedCart = kind === 'mint' && options.cart ? cartSnapshot() : null, reviewedCartRevision = cartRevision, reviewedDraft = kind === 'mint' ? readMintDraft() : null;
    function assertIntent() {
      assertAccount(account);
      if (disposed || !active || !root.isConnected || ticket !== generation || (reviewedCart !== null && (cartRevision !== reviewedCartRevision || cartSnapshot() !== reviewedCart)) || JSON.stringify(readMintDraft()) !== JSON.stringify(reviewedDraft)) throw new Error('NFT checkout details or view changed. Review again.');
    }
    body.querySelectorAll('button').forEach(function (node) { node.disabled = true; });
    try {
      assertAccount(account);
      if (readBrowserWriteRecovery({ chainId: chainId, account: account, namespace: namespace(kind) })) throw new Error('Check the original transaction before starting this action again.');
      var args = Object.assign({ chainId: chainId, projectId: BigInt(projectId), account: account, expectedHook: current.hook }, values);
      var prepare = kind === 'mint' ? prepareDefifaPay : kind === 'cashout' ? prepareDefifaCashOut : prepareDefifaTransfer;
      message('Preparing transaction…');
      var reviewed = await prepare(client, args); assertIntent();
      if (kind === 'cashout') { args.minimumReclaim = reviewed.reclaimAmount; reviewed = await prepare(client, args); assertIntent(); }
      var snapshot = fingerprint(reviewed), rows = [['Collection', reviewed.inventory.hook], ['Account', account]];
      if (kind === 'mint') {
        reviewed.selectedTiers.forEach(function (selection) { var tier = current.tiers.find(function (item) { return BigInt(item.id) === selection.tierId; }); rows.push(['Tier ' + selection.tierId + (tier ? ': ' + tier.name : ''), selection.count + ' NFTs at ' + formatPrice(selection.unitPrice, reviewed.inventory.pricing) + ' each']); });
        rows.push(['Total', formatPrice(reviewed.amount, reviewed.inventory.pricing)], ['Voting power recipient', reviewed.effectiveAttestationDelegate]);
      } else rows.push(['NFT IDs', (args.tokenIds || [args.tokenId]).map(String).join(', ')]);
      if (args.memo) rows.push(['Memo', args.memo]);
      if (kind === 'transfer') rows.push(['Recipient', args.recipient]);
      if (kind === 'cashout') {
        rows.push(['Minimum reclaim', formatPrice(reviewed.reclaimAmount, reviewed.inventory.pricing)]);
        var rewards = reviewed.protocolRewards;
        if (rewards) { rows.push(['Defifa rewards', formatAmount(rewards.defifaAmount, rewards.defifaDecimals) + ' (' + rewards.defifaToken + ')']); rows.push(['Base protocol rewards', formatAmount(rewards.baseProtocolAmount, rewards.baseProtocolDecimals) + ' (' + rewards.baseProtocolToken + ')']); }
      }
      var safeRoute = isSafeConnected(), token = reviewed.inventory.pricing.token;
      var approvalOnly = kind === 'mint' && safeRoute && token && token.toLowerCase() !== NATIVE_TOKEN.toLowerCase() && token.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
        && await readErc20Allowance(client, token, account, reviewed.transaction.address) < reviewed.amount;
      assertIntent();
      if (isSafeConnected() !== safeRoute) throw new Error('Wallet route changed. Review the transaction again.');
      var request = approvalOnly ? { chainId: chainId, address: token, abi: erc20ApproveAbi, functionName: 'approve', args: [reviewed.transaction.address, reviewed.amount], value: 0n } : reviewed.transaction;
      var label = approvalOnly ? 'Approve token spending' : kind === 'mint' ? 'Mint Defifa NFTs' : kind === 'cashout' ? 'Cash out Defifa NFTs' : 'Transfer Defifa NFT';
      if (approvalOnly) rows = [['Account', account], ['Token', token], ['Spender', reviewed.transaction.address], ['Approval amount', formatPrice(reviewed.amount, reviewed.inventory.pricing)]];
      var context = { hook: reviewed.inventory.hook, implementation: reviewed.inventory.implementation, account: account, transaction: reviewed.transaction };
      var recovery = createBrowserWriteRecovery({ chainId: chainId, account: account, namespace: namespace(kind), safe: safeRoute, call: { to: request.address, data: encodeFunctionData(request), value: request.value || 0n } });
      await recovery.withLock(function () { return new Promise(function (resolve) {
        if (recovery.read()) { error(new Error('Check the original transaction before starting this action again.')); resolve(); return; }
        var reservation = null;
        async function finishPending(value, hash) {
          try { if (reservation && hash) reservation = recovery.submitted(hash, reservation); }
          catch (err) { busy = false; if (await refresh()) message(err.message || String(err)); resolve(); return; }
          busy = false; if (await refresh()) message(value); resolve();
        }
        function releaseBeforeBroadcast() { if (reservation && !reservation.hash) { recovery.rejected(); reservation = null; } }
        executeTransaction(Object.assign({}, request, {
          expectedSafe: safeRoute, safeSingleCall: kind === 'mint',
          tokenAddr: kind === 'mint' && !approvalOnly ? reviewed.inventory.pricing.token : undefined, spenderAddr: kind === 'mint' && !approvalOnly ? reviewed.transaction.address : undefined, approvalAmount: kind === 'mint' && !approvalOnly ? reviewed.amount : undefined,
          onSending: function () { assertIntent(); if (isSafeConnected() !== safeRoute) throw new Error('Wallet route changed. Review the transaction again.'); reservation = recovery.reserve(); },
          assertWriteState: assertIntent,
          onBeforeWriteAborted: releaseBeforeBroadcast, onWriteRejected: releaseBeforeBroadcast,
          label: label, confirmSummary: { action: label, rows: rows },
          confirmNote: approvalOnly ? 'This approves token spending only. No NFTs are minted. After approval is verified, review NFT mint again to continue.' : kind === 'mint' ? 'Self-payment applies the reviewed voting power recipient to ALL existing NFTs you own in the selected tiers, as well as the new NFTs.' : kind === 'cashout' ? 'The selected NFTs will be burned in exchange for the displayed reclaim and protocol rewards.' : undefined,
          reverify: async function () { assertIntent(); var fresh = await prepare(client, args); assertIntent(); if (fingerprint(fresh) !== snapshot) throw new Error('NFT phase, prices, voting power recipient or cash-out quote changed. Review again.'); return { simulationBlockNumber: fresh.inventory.blockNumber }; },
          verifyReceipt: async function (receipt) {
            if (!approvalOnly) return verifyDefifaNftTransaction(client, context, receipt);
            if (!reservation) throw new Error('Original approval reservation is unavailable.');
            var outcome = await verifyReviewedWriteReceipt(client, reservation, receipt);
            if (outcome !== 'success') throw new Error('Original approval failed onchain. Check the original transaction.');
            await assertApprovalGranted(client, reservation, receipt);
          },
          onStatus: function (value, statusKind, meta) { if (meta && meta.hash && reservation) { try { reservation = recovery.submitted(meta.hash, reservation); } catch (err) { message(err.message || String(err)); } } if (meta && meta.trackingError) finishPending(value, meta.hash); else message(value); },
          onError: function (value, meta) { if (reservation) finishPending(value, meta && meta.submittedHash); else { error(new Error(value)); resolve(); } },
          onSuccess: async function (value, meta) {
            if (!meta || meta.phase !== 'confirmed') return finishPending(value, meta && meta.safeTxHash);
            try { if (reservation) recovery.clear(reservation); if (!approvalOnly && reviewedCart !== null && !disposed && active && root.isConnected && ticket === generation && account === getAccount() && cartRevision === reviewedCartRevision && cartSnapshot() === reviewedCart && JSON.stringify(readMintDraft()) === JSON.stringify(reviewedDraft)) options.cart.clear(); busy = false; if (await refresh()) message(approvalOnly ? 'Token approval verified onchain. Review NFT mint again to continue.' : 'NFT transaction verified onchain.'); } catch (err) { finishPending(err.message || String(err), meta.hash); } finally { resolve(); }
          },
        }));
      }); });
    } catch (err) { error(err); }
  }
  function drawCartMint() {
    if (!options.cart || typeof options.cartTotal !== 'function') throw new Error('Shared NFT cart is unavailable.');
    if (!defifaPhaseAllowsPay(current.phase) || records.has('mint')) { text(body, 'p', records.has('mint') ? 'NFT mint is pending verification.' : 'NFT minting is not open.'); return; }
    var row = document.createElement('div'); row.className = 'paybox-amount-row';
    var field = document.createElement('div'); field.className = 'paybox-field'; row.appendChild(field);
    var amount = document.createElement('input'); amount.className = 'paybox-amount'; amount.type = 'text'; amount.readOnly = true; amount.setAttribute('aria-label', 'Selected NFT amount'); field.appendChild(amount);
    var currency = document.createElement('span'); currency.className = 'paybox-curr-static'; field.appendChild(currency);
    var pay = button(row, holder ? 'Pay' : 'Connect', async function () {
      try {
        var delegateAddress = delegate.value.trim(), note = memo.value;
        if (!holder) {
          await connect(); if (!await refresh()) return;
          var freshMemo = body.querySelector('.paybox-memo'), freshDelegate = body.querySelector('input[aria-label="Voting power recipient (optional)"]');
          if (!freshMemo || !freshDelegate) throw new Error('NFT checkout view changed. Review again.');
          freshMemo.value = note; freshDelegate.value = delegateAddress;
        }
        if (delegateAddress && !isAddr(delegateAddress)) throw new Error('Enter a valid voting power recipient address.');
        var entries = options.cart.entries(), ids = [];
        Object.keys(entries).forEach(function (id) {
          var quantity = entries[id];
          if (!Number.isSafeInteger(quantity) || quantity < 0 || ids.length + quantity > MAX_DEFIFA_ACTION_NFTS) throw new Error('Select at most ' + MAX_DEFIFA_ACTION_NFTS + ' whole NFTs per transaction.');
          for (var i = 0; i < quantity; i++) ids.push(BigInt(id));
        });
        if (!ids.length) throw new Error('Select NFTs in the shop first.');
        ids.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
        submit('mint', { tierIdsToMint: ids, attestationDelegate: delegateAddress || ZERO_ADDRESS, memo: note });
      } catch (err) { message(err.message || String(err)); }
    }); pay.className = 'paybox-btn'; body.appendChild(row);
    var memo = document.createElement('input'); memo.type = 'text'; memo.className = 'paybox-memo'; memo.placeholder = 'Add a note (optional)'; memo.setAttribute('aria-label', 'Payment note'); body.appendChild(memo);
    var delegate = input(body, 'Voting power recipient (optional)', 'text', ''); delegate.placeholder = '0x…';
    readMintDraft = function () { return { memo: memo.value, delegate: delegate.value.trim() }; };
    var feedback = document.createElement('div'); feedback.className = 'paybox-feedback'; body.appendChild(feedback);
    updateCartView = function () {
      if (disposed || !active) return;
      var total = options.cartTotal(current, options.cart); amount.value = formatPrice(total, current.pricing); amount.style.width = Math.max(4, amount.value.length) + 'ch';
      feedback.replaceChildren(); var entries = options.cart.entries(), selected = Object.keys(entries).filter(function (id) { return entries[id] > 0; });
      pay.disabled = busy || !selected.length;
      if (!selected.length) return;
      text(feedback, 'div', 'You get').className = 'paybox-yg-label';
      var list = document.createElement('div'); list.className = 'paybox-nft-list'; feedback.appendChild(list);
      selected.forEach(function (id) {
        var line = document.createElement('div'); line.className = 'paybox-nft-row'; list.appendChild(line);
        text(line, 'span', '+').className = 'paybox-nft-plus';
        var thumb = document.createElement('span'); thumb.className = 'paybox-nft-thumb'; line.appendChild(thumb);
        var imageUrl = options.cart.image(id);
        if (imageUrl) { var image = document.createElement('img'); image.src = imageUrl; image.alt = options.cart.name(id) || 'NFT ' + id; image.loading = 'lazy'; thumb.appendChild(image); }
        var tier = current.tiers.find(function (item) { return BigInt(item.id) === BigInt(id); });
        text(line, 'span', (options.cart.name(id) || (tier && tier.name) || 'NFT ' + id) + (entries[id] > 1 ? ' ×' + entries[id] : '')).className = 'paybox-nft-label';
      });
    };
    updateCartView();
  }
  function draw() {
    body.replaceChildren();
    if (getViewAs()) { text(body, 'p', 'Leave View as to mint, transfer or cash out NFTs.'); button(body, 'Refresh', refresh); return; }
    if (mintOnly) { drawCartMint(); return; }
    if (!holder) { button(body, 'Connect wallet for NFT actions', async function () { try { await connect(); await refresh(); } catch (err) { error(err); } }); return; }
    if (!holdingsOnly && defifaPhaseAllowsPay(current.phase) && !records.has('mint')) {
      text(body, 'h4', 'Mint NFTs');
      var quantities = current.tiers.map(function (tier) { var field = input(body, 'Tier ' + tier.id + ': ' + tier.name + ', ' + formatPrice(effectiveTierPrice(BigInt(tier.price), tier.discountPercent || 0), current.pricing) + ' per NFT', 'number', '0'); field.min = '0'; field.step = '1'; field.max = String(MAX_DEFIFA_ACTION_NFTS); return { tier: tier, field: field }; });
      var delegate = input(body, 'Voting power recipient (optional)', 'text', ''); delegate.placeholder = '0x…';
      text(body, 'p', 'Leave blank to use the collection’s default. Self-payment also updates voting power for existing NFTs in these tiers.');
      button(body, 'Review NFT mint', function () {
        try {
          var ids = [];
          quantities.forEach(function (entry) { var raw = entry.field.value; if (!/^\d+$/.test(raw)) throw new Error('Enter a whole NFT quantity.'); var quantity = Number(raw); if (!Number.isSafeInteger(quantity) || quantity > MAX_DEFIFA_ACTION_NFTS || ids.length + quantity > MAX_DEFIFA_ACTION_NFTS) throw new Error('Select at most ' + MAX_DEFIFA_ACTION_NFTS + ' NFTs per transaction.'); for (var i = 0; i < quantity; i++) ids.push(BigInt(entry.tier.id)); });
          if (!ids.length) throw new Error('Select at least one NFT.');
          var address = delegate.value.trim(); if (address && !isAddr(address)) throw new Error('Enter a valid voting power recipient address.');
          ids.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
          submit('mint', { tierIdsToMint: ids, attestationDelegate: address || ZERO_ADDRESS });
        } catch (err) { message(err.message); }
      });
    } else if (!holdingsOnly) text(body, 'p', records.has('mint') ? 'NFT mint is pending verification.' : 'NFT minting is not open.');
    text(body, 'h4', 'Your NFTs');
    text(body, 'p', 'Owned NFTs: ' + String(holdings.totalOwned));
    var selected = [];
    holdings.tokens.forEach(function (token) {
      var tier = current.tiers.find(function (item) { return Number(item.id) === Number(token.tierId); });
      var check = input(body, 'NFT ' + token.tokenId + ', tier ' + token.tierId + (tier ? ': ' + tier.name : ''), 'checkbox', ''); selected.push({ tokenId: BigInt(token.tokenId), check: check });
    });
    if (holdings.nextCursor != null) {
      var more = button(body, 'Load more owned NFTs', async function () {
        var ticket = generation, account = holder; more.disabled = true;
        try {
          assertAccount(account);
          var page = await getDefifaHoldings(client, { chainId: chainId, projectId: BigInt(projectId), account: account, expectedHook: current.hook, blockNumber: holdings.blockNumber, cursor: holdings.nextCursor });
          if (ticket !== generation) return;
          assertAccount(account);
          var fields = new Map(Array.from(body.querySelectorAll('input'), function (node) { return [node.getAttribute('aria-label'), { value: node.value, checked: node.checked }]; }));
          holdings = Object.assign({}, page, { tokens: holdings.tokens.concat(page.tokens) }); draw();
          body.querySelectorAll('input').forEach(function (node) { var saved = fields.get(node.getAttribute('aria-label')); if (saved) { node.value = saved.value; node.checked = saved.checked; } });
        } catch (err) { if (ticket === generation) error(err); }
      });
    }
    if (!holdings.tokens.length) { if (!holdings.complete) text(body, 'p', 'More NFT candidates remain to be checked.'); button(body, 'Refresh NFT actions', refresh); return; }
    function selectedIds() { return selected.filter(function (item) { return item.check.checked; }).map(function (item) { return item.tokenId; }); }
    if (!records.has('transfer')) {
      var recipient = input(body, 'Transfer recipient', 'text', ''); recipient.placeholder = '0x…';
      button(body, 'Review NFT transfer', function () { var ids = selectedIds(), address = recipient.value.trim(); if (ids.length !== 1) { message('Select exactly one NFT to transfer.'); return; } if (!isAddr(address) || address.toLowerCase() === ZERO_ADDRESS.toLowerCase()) { message('Enter a valid nonzero recipient address.'); return; } submit('transfer', { tokenId: ids[0], recipient: address }); });
    }
    if (defifaPhaseAllowsCashOut(current.phase) && !records.has('cashout')) button(body, 'Review NFT cash out', function () { var ids = selectedIds(); if (!ids.length) { message('Select NFTs to cash out.'); return; } if (ids.length > MAX_DEFIFA_ACTION_NFTS) { message('Select at most ' + MAX_DEFIFA_ACTION_NFTS + ' NFTs per transaction.'); return; } submit('cashout', { tokenIds: ids }); });
    else text(body, 'p', 'NFT cash out is not available in this phase.');
    button(body, 'Refresh NFT actions', refresh);
  }
  if (options.cart) {
    var syncCart = function () { if (!disposed && active && root.isConnected) updateCartView(); };
    options.cart.subscribe(function () { cartRevision++; syncCart(); }); options.cart.onName(syncCart);
  }
  var unsubscribe = onEffectiveAccountChange(function () { if (!root.isConnected) { root.dispose(); return; } generation++; if (busy) return; refresh(); });
  root.setActive = function (value) { if (disposed || active === !!value) return; active = !!value; generation++; if (active && !busy) refresh(); };
  root.dispose = function () { if (disposed) return; disposed = true; generation++; unsubscribe(); };
  refresh(true);
  return root;
}
