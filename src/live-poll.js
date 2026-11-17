// A card's background refresh. `tick` runs every `intervalMs` while the card is on the page and the page is
// visible, and never overlaps itself. Off the page or hidden, nothing runs and no timer is kept; it picks up when
// the page is visible again or a project tab is shown again ('jb:tab-shown'), at once if a tick is overdue.
// A tick that fails (it rejects or resolves false) doubles the wait, up to `maxMs`; a success restores it.
// The document listeners stay for the card's cached tab, as onDocumentWhileConnected's do.
export var LIVE_POLL_MS = 30000;

export function livePoll(node, tick, opts) {
  var base = (opts && opts.intervalMs) || LIVE_POLL_MS;
  var max = (opts && opts.maxMs) || base * 8;
  var delay = base, timer = null, running = false, dueAt = Date.now() + base;
  function idle() { return !node.isConnected || document.visibilityState === 'hidden'; }
  function arm(ms) { timer = setTimeout(run, ms); }
  function run() {
    timer = null;
    if (idle()) return;
    running = true;
    Promise.resolve().then(tick).then(function (ok) { return ok !== false; }, function () { return false; }).then(function (ok) {
      delay = ok ? base : Math.min(max, delay * 2);
      running = false;
      dueAt = Date.now() + delay;
      arm(delay);
    });
  }
  function resume() {
    if (timer || running || idle()) return;
    var wait = dueAt - Date.now();
    if (wait > 0) arm(wait); else run();
  }
  document.addEventListener('visibilitychange', resume);
  document.addEventListener('jb:tab-shown', resume);
  arm(base);
}
