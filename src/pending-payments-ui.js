import { pendingPaymentKey } from './pending-payments.js';

function node(tag, className, text) {
  var element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

// The adapter supplies the existing project transaction boundary. This view never signs or sends.
export function renderPendingPayments(options) {
  var card = node('section', 'detail-card pending-payments');
  card.hidden = true;
  var title = node('h3', 'detail-card-title', 'Payments awaiting routing');
  card.appendChild(title);
  var intro = node('p', 'detail-card-body', 'These payments are held while their destination route is unavailable. Anyone can retry them. They are not spendable project funds.');
  card.appendChild(intro);
  var body = node('div', 'pending-payments-rows'); card.appendChild(body);
  var archive = node('div', 'detail-card-body'); card.appendChild(archive);
  var status = node('div', 'claim-row-status'); status.setAttribute('role', 'status'); card.appendChild(status);
  var batch = node('button', 'ops-action-btn pending-payments-batch', 'Batch all pending');
  batch.type = 'button'; card.appendChild(batch);
  var refresh = node('button', 'ops-action-btn', 'Refresh'); refresh.type = 'button'; card.appendChild(refresh);
  var states = [], busy = false, complete = false, generation = 0;

  function saved() { return options.hasSaved(); }
  function setStatus(message, kind) { status.textContent = message; status.className = 'claim-row-status ' + (kind || ''); }
  function updateActions() {
    var ready = states.filter(function (state) { return state.eligible; });
    var visiblePayments = states.length > 0 || saved();
    title.hidden = !visiblePayments; intro.hidden = !visiblePayments; batch.hidden = !visiblePayments;
    batch.textContent = saved() ? 'Resume saved routing' : ready.length < states.length ? 'Batch ' + ready.length + ' ready' : 'Batch all pending';
    batch.disabled = busy || (!saved() && (!complete || !ready.length));
    refresh.disabled = busy;
    body.querySelectorAll('button').forEach(function (button) { button.disabled = busy || saved() || button.dataset.ready !== 'true'; });
    var archived = options.archived ? options.archived() : [];
    archive.replaceChildren();
    if (archived.length) {
      archive.appendChild(node('p', '', 'These payments resolved elsewhere. Their obsolete Safe proposals were not executed; cancel them in Safe{Wallet} if they still occupy a nonce.'));
      archived.forEach(function (proposal) {
        var link = node('a', '', proposal.chain + ' · ' + proposal.hash);
        link.href = proposal.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        var line = node('div'); line.appendChild(link); archive.appendChild(line);
      });
      card.hidden = false;
    }
  }

  function renderRows() {
    body.replaceChildren();
    states.forEach(function (state) {
      var row = node('form', 'pending-payment-row');
      var detail = node('div', 'detail-card-body');
      detail.appendChild(node('div', '', options.describe(state.row)));
      detail.appendChild(node('div', '', 'To project #' + state.row.projectId + ' · ' + options.chainName(state.row.chainId)));
      if (state.error) detail.appendChild(node('div', '', 'Could not verify this payment: ' + state.error));
      else if (!state.eligible) detail.appendChild(node('div', '', 'Available ' + new Date(Number(state.nextAttemptAt) * 1000).toLocaleString()));
      else if (state.finalizes) detail.appendChild(node('div', '', 'A final attempt may return this payment to its source project if the route still fails.'));
      row.appendChild(detail);
      var submit = node('button', 'ops-action-btn', state.finalizes ? 'Review final attempt' : 'Review payment');
      submit.type = 'submit'; submit.dataset.ready = String(!!state.eligible); row.appendChild(submit);
      row.addEventListener('submit', function (event) { event.preventDefault(); if (state.eligible && !busy && !saved()) start([state.row]); });
      body.appendChild(row);
    });
    updateActions();
  }

  async function load() {
    if (busy) return;
    var current = ++generation;
    complete = false; updateActions();
    try {
      var rows = await options.loadRows();
      var seen = new Set();
      var next = await Promise.all(rows.map(async function (row) {
        var key = pendingPaymentKey(row);
        if (seen.has(key)) throw new Error('The pending payment list contains duplicate identities.');
        seen.add(key);
        try { return await options.readState(row); }
        catch (error) { return { row: row, eligible: false, error: error.message || 'Read failed.' }; }
      }));
      if (current !== generation) return;
      states = next.filter(Boolean); complete = states.every(function (state) { return !state.error; });
      card.hidden = !states.length && !saved();
      if (complete) setStatus('', '');
      else setStatus('Some payments could not be verified. Refresh before batching.', 'error');
      renderRows();
    } catch (error) {
      if (current !== generation) return;
      card.hidden = false;
      setStatus('Could not load payments awaiting routing. ' + (error.message || 'Try again.'), 'error');
      updateActions();
    }
  }

  async function start(rows) {
    if (busy) return;
    busy = true; updateActions();
    try {
      var outcome = await options.run(rows, setStatus);
      if (outcome && outcome.completed) {
        options.acknowledge();
        setStatus(outcome.obsoleteProposals && outcome.obsoleteProposals.length
          ? 'Routing status verified. Some payments resolved elsewhere; their old Safe proposals were not executed.'
          : 'Routing attempts confirmed. Payments may remain pending if their route still fails.', 'success');
        if (options.onUpdated) options.onUpdated();
      } else if (outcome && !outcome.cancelled) {
        setStatus('Routing attempts proposed to your Safe. Execute them in the Safe queue, then resume here to verify their results.', 'pending');
      }
    } catch (error) { setStatus(error.message || 'Could not attempt routing.', 'error'); }
    finally { busy = false; updateActions(); }
  }

  batch.addEventListener('click', function () {
    if (!batch.disabled) start(saved() ? [] : states.filter(function (state) { return state.eligible; }).map(function (state) { return state.row; }));
  });
  refresh.addEventListener('click', load);
  card._refresh = load;
  card._ready = load();
  return card;
}
