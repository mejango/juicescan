import { checkFeeBuyback, createFeeWatch, feeMessage, feeReceipt } from './fee-buyback.ts';
import { feeBuybackContext } from './fee-buyback-client.js';

export function mountFeeBuybackReview(host, call, changed) {
  var alive = true, waiting = false, busy = true, stopBlocks;
  var result = { status: 'unknown', fees: [] };
  var panel = document.createElement('section'); panel.setAttribute('aria-label', 'Fee token return');
  panel.className = 'tx-confirm-note'; host.appendChild(panel);
  function render() {
    if (!alive) return;
    panel.replaceChildren(); panel.hidden = result.status === 'none';
    var message = document.createElement('p'); message.setAttribute('role', 'status');
    message.textContent = busy ? 'Checking fee return…' : feeMessage(result); panel.appendChild(message);
    result.fees.filter(function (fee) { return fee.route !== 'unknown'; }).forEach(function (fee) {
      var row = document.createElement('p'); row.textContent = feeReceipt(fee); panel.appendChild(row);
    });
    var status = document.createElement('p');
    status.textContent = (waiting && result.status !== 'ready' ? 'Waiting. ' : '') + (context ? 'Checking new blocks automatically.' : 'Automatic checks unavailable. Retry now.') + (result.checkedAt ? ' Last checked ' + new Date(result.checkedAt).toLocaleTimeString() + '.' : '');
    panel.appendChild(status);
    if ((result.status === 'fallback' && !waiting) || result.status === 'unknown') {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'create-btn ghost';
      button.textContent = result.status === 'fallback' ? 'Wait for better rate' : 'Retry now'; button.disabled = busy;
      button.addEventListener('click', function () {
        if (result.status === 'fallback') { waiting = true; render(); }
        else { busy = true; render(); void monitor.refresh(); }
      }); panel.appendChild(button);
    }
    changed({ busy: busy, label: result.status === 'none' ? null : busy ? 'Checking fee return…' : result.status === 'fallback' ? 'Submit anyway' : result.status === 'ready' ? 'Review and submit' : 'Submit without estimate' });
  }
  var context;
  try { if (call.from) context = feeBuybackContext(call.chainId, call.from); } catch (_) { /* Keep unknown. */ }
  var monitor = createFeeWatch(function () {
    return context ? checkFeeBuyback(context.client, call, context.options) : Promise.resolve({ status: 'unknown', fees: [] });
  }, function (next) { result = next; busy = false; render(); });
  render(); void monitor.refresh();
  if (context) stopBlocks = context.client.watchBlockNumber({ pollingInterval: 4000,
    onBlockNumber: function () { void monitor.refresh(); },
    onError: function () { result = { status: 'unknown', fees: [] }; render(); },
  });
  return {
    confirm: async function () {
      if (!alive || busy) return false;
      busy = true; render();
      try { return await monitor.confirm(); } finally { busy = false; render(); }
    },
    stop: function () { alive = false; monitor.stop(); if (stopBlocks) stopBlocks(); },
  };
}
