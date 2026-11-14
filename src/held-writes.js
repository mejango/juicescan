// src/held-writes.js
// Every write this browser still holds for the connected wallet, in one corner list, wherever its form is.
// juicebox.money shows the same list (HeldWritesList). Each row is the line its own form would show
// (component-base heldWriteView); nothing here sends, and a hold ends only on the user's click.

import { chainSettlesHold, heldWritesOf, writeHold } from './write-hold.js';
import { heldWriteView, offerHeldRelease, errMessage } from './component-base.js';
import { getAccount, onWalletChange } from './wallet.js';

var REFRESH_MS = 20000;

export function mountHeldWrites() {
  var box = document.createElement('div');
  box.className = 'held-writes';
  box.setAttribute('aria-live', 'polite');
  box.hidden = true;
  document.body.appendChild(box);
  var run = 0;
  var settled = new Map(); // a mined result does not change: read it once
  var seenPending = new Set(); // a send its own form is still following is not listed on first sight

  async function viewOf(hold, label) {
    var record = hold.read();
    if (!record) return null;
    if (!chainSettlesHold(record)) return null;
    var id = record.id + ':' + (record.hash || '');
    if (settled.has(id)) return settled.get(id);
    // No hash yet and the action's lock is taken: its wallet prompt is still open, so nothing is held.
    if (!record.hash && !(await hold.withLock(async function () { return true; }).catch(function () { return false; }))) return null;
    var view = await heldWriteView(hold, label);
    if (!view) return null;
    if (view.receipt) settled.set(id, view);
    if (view.state === 'pending' && !seenPending.has(id)) { seenPending.add(id); return null; }
    return view;
  }

  function row(hold, view, refresh) {
    var item = document.createElement('div'); item.className = 'held-writes-row';
    var line = document.createElement('span'); line.textContent = view.line; item.appendChild(line);
    var action = view.receipt ? 'Dismiss' : view.state === 'unsettled' ? 'Check' : '';
    if (!action) return item;
    var button = document.createElement('button'); button.type = 'button'; button.className = 'held-writes-action'; button.textContent = action;
    button.addEventListener('click', function () {
      if (!view.receipt) { offerHeldRelease(hold, view.record, view.line); return; }
      button.disabled = true;
      hold.release(view.record).then(refresh, function (err) { button.disabled = false; line.textContent = errMessage(err, 'Could not dismiss it.'); });
    });
    item.appendChild(button);
    return item;
  }

  async function refresh() {
    var mine = ++run, account = getAccount();
    var holds = (account ? heldWritesOf(account) : []).map(function (h) {
      return { hold: writeHold(h.chainId, account, { to: h.to, functionName: h.functionName }), label: h.functionName };
    });
    var views = await Promise.all(holds.map(function (h) { return viewOf(h.hold, h.label).catch(function () { return null; }); }));
    if (mine !== run) return;
    box.replaceChildren.apply(box, holds.map(function (h, i) { return views[i] ? row(h.hold, views[i], refresh) : null; }).filter(Boolean));
    box.hidden = !box.childElementCount;
  }

  onWalletChange(refresh);
  window.addEventListener('focus', refresh);
  setInterval(function () { var account = getAccount(); if (account && heldWritesOf(account).length) refresh(); else if (!box.hidden) refresh(); }, REFRESH_MS);
  refresh();
}
