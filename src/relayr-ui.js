// src/relayr-ui.js
// The one DOM builder for the "Paid Relayr request" receipt card. The create flow, the add-items modal,
// and the Discover recovery panel all show the same card (head + bundle + payment + per-chain rows + note);
// only their note wording, state labels, and action buttons differ, so those stay at the call sites.
// relayr.js stays DOM-free; this module owns the shared presentation.

import { formatEther } from 'viem';
import { el, openDialog, truncAddr, txExplorerUrl } from './component-base.js';
import { chainNameFor } from './chain.js';
import { relayrPaymentOptions, relayrProgress, relayrStateIsSuccess, relayrStateIsFailed, relayrDestinationHash } from './relayr.js';

// Choosing a funding chain never signs or pays. The shared payment boundary still reviews the exact quote.
export function chooseRelayrPayment(quote) {
  var options = relayrPaymentOptions(quote);
  return new Promise(function (resolve) {
    var modal = openDialog('Choose where to pay', { onClose: function () { resolve(null); } });
    var body = el('div', 'modal-body');
    var note = el('p'); note.textContent = 'One payment funds this bundle on every destination chain. Choose the chain holding the ETH you want to use.';
    body.appendChild(note);
    var label = el('label'); label.textContent = 'Payment chain';
    var select = el('select', 'field create-input'); select.setAttribute('aria-label', 'Payment chain');
    var placeholder = el('option'); placeholder.value = ''; placeholder.textContent = 'Choose a chain'; select.appendChild(placeholder);
    options.forEach(function (payment, index) {
      var option = el('option'); option.value = String(index);
      option.textContent = chainNameFor(payment.chain) + ' — ' + formatEther(BigInt(payment.amount)) + ' ETH';
      select.appendChild(option);
    });
    label.appendChild(select); body.appendChild(label);
    var foot = el('div', 'create-modal-foot');
    var cancel = el('button', 'create-btn ghost'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    var next = el('button', 'create-btn primary'); next.type = 'button'; next.textContent = 'Review payment'; next.disabled = true;
    select.addEventListener('change', function () { next.disabled = select.value === ''; });
    cancel.addEventListener('click', modal.close);
    next.addEventListener('click', function () {
      if (select.value === '') return;
      var payment = options[Number(select.value)];
      resolve(payment); modal.close();
    });
    foot.appendChild(cancel); foot.appendChild(next); body.appendChild(foot); modal.panel.appendChild(body);
  });
}

// Default per-chain state label: Confirmed / Failed / the raw Relayr state while pending.
export function relayrReceiptStateLabel(record, verifiedOnchain) {
  var state = String(record && record.status && record.status.state || '');
  if (relayrStateIsSuccess(state)) return verifiedOnchain
    ? { text: 'Confirmed', kind: 'ok' }
    : { text: 'Relayr reported success — verifying', kind: 'pending' };
  if (relayrStateIsFailed(state)) return { text: 'Failed', kind: 'err' };
  return { text: state || 'Waiting for Relayr', kind: 'pending' };
}

// Render the receipt card body into `panel` (cleared first). Callers append their own action buttons.
// opts: { noteText, stateLabel(record) -> {text, kind}, chainNameOf(chainId) -> string }.
// Returns the session's relayrProgress.
export function renderRelayrReceiptInto(panel, session, opts) {
  opts = opts || {};
  panel.innerHTML = '';
  var progress = relayrProgress(session.records, session.expectedCount);
  var head = el('div', 'relayr-pending-head');
  var title = el('strong'); title.textContent = 'Paid Relayr request'; head.appendChild(title);
  var count = el('span', 'relayr-pending-count' + (progress.failed ? ' err' : ''));
  count.textContent = progress.confirmed + '/' + progress.total + (opts.verifiedOnchain ? ' confirmed' : ' reported complete'); head.appendChild(count);
  panel.appendChild(head);
  var bundle = el('div', 'relayr-pending-meta'); bundle.appendChild(document.createTextNode('Bundle '));
  var bundleId = document.createElement('code'); bundleId.textContent = session.bundleUuid; bundle.appendChild(bundleId);
  panel.appendChild(bundle);
  if (session.paymentHash) {
    var payment = el('div', 'relayr-pending-meta'); payment.appendChild(document.createTextNode('Payment '));
    var href = txExplorerUrl(session.paymentChainId, session.paymentHash);
    if (href) {
      var link = document.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = truncAddr(session.paymentHash); payment.appendChild(link);
    } else payment.appendChild(document.createTextNode(truncAddr(session.paymentHash)));
    panel.appendChild(payment);
  }
  var rows = el('div', 'relayr-pending-chains');
  var chains = session.chains || [], records = session.records || [];
  var rowCount = Math.max(Number(session.expectedCount) || 0, chains.length, records.length);
  var stateLabel = opts.stateLabel || function (record) { return relayrReceiptStateLabel(record, opts.verifiedOnchain); };
  for (var i = 0; i < rowCount; i++) {
    var row = el('div', 'relayr-pending-chain');
    var chain = chains[i]; var name = el('span');
    name.textContent = (chain && chain.name) || (chain && opts.chainNameOf && opts.chainNameOf(chain.id)) || ('Chain ' + (i + 1));
    row.appendChild(name);
    var state = stateLabel(records[i]);
    var destinationHash = relayrDestinationHash(records[i]);
    var destinationHref = destinationHash && chain && txExplorerUrl(chain.id, destinationHash);
    var value = destinationHref ? document.createElement('a') : document.createElement('span');
    value.className = 'relayr-pending-chain-state ' + state.kind; value.textContent = state.text;
    if (destinationHref) { value.href = destinationHref; value.target = '_blank'; value.rel = 'noopener'; }
    row.appendChild(value); rows.appendChild(row);
  }
  panel.appendChild(rows);
  if (opts.noteText) {
    var note = el('div', 'relayr-pending-note'); note.textContent = opts.noteText; panel.appendChild(note);
  }
  return progress;
}
