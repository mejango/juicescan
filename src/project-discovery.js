import { discoverChains, firstChainForNetwork } from './component-base.js';
import { getManifestChains } from './chain.js';

// The chain the form will open on, as soon as the chains still unanswered can no longer change it: the linked
// chain when it is live, else the first live chain of the selected network, else the first live chain. Null
// while a chain ranked ahead of every live answer is still out, so a slow RPC never changes which chain is picked.
export function settledChainChoice(chainIds, answers, defaultChain, wantTestnet) {
  var chains = getManifestChains();
  var order = (defaultChain && chainIds.indexOf(defaultChain) !== -1 ? [defaultChain] : [])
    .concat(chainIds.filter(function (id) { var c = chains[String(id)]; return c && !!c.testnet === wantTestnet; }), chainIds);
  for (var i = 0; i < order.length; i++) {
    if (answers[order[i]] === undefined) return null;
    if (answers[order[i]]) return order[i];
  }
  return null;
}

// The tool forms' project lookup. `state.phase` is 'idle' (no valid project id, or not found), 'discovering' or
// 'ready', and only the latest request lands. The caller resets its own fields first. `chosen(chainId)` applies
// the preferred chain before the ready render; `ready(chainId)` starts the loads that follow it.
export function projectDiscovery(state, updateUI) {
  var generation = 0;
  return function discover(chosen, ready) {
    var gen = ++generation;
    var pid = state.projectId;
    if (!pid || !/^\d+$/.test(pid) || pid === '0') { state.phase = 'idle'; updateUI(); return; }
    state.phase = 'discovering';
    updateUI();
    var chainIds = Object.keys(getManifestChains()).map(Number);
    var started = false;
    function liveOf(answers) { return chainIds.filter(function (id) { return answers[id]; }); }
    function start(live, preferred) {
      started = true;
      state.liveChains = live;
      chosen(preferred);
      state._defaultChain = null;
      state.phase = 'ready';
      updateUI();
      if (ready) ready(preferred);
    }
    discoverChains(pid, function (live) {
      if (gen !== generation) return;
      if (started) {
        // A chain that answered after the form opened joins the chain list; the choice already made stands.
        if (live.length !== state.liveChains.length) { state.liveChains = live; updateUI(); }
        return;
      }
      state.liveChains = live;
      if (!live.length) { state.phase = 'idle'; state.error = 'Could not find the project on the chains we could reach.'; updateUI(); return; }
      start(live, (state._defaultChain && live.indexOf(state._defaultChain) !== -1) ? state._defaultChain : firstChainForNetwork(state) || live[0]);
    }, function (answers) {
      if (gen !== generation || started) return;
      var preferred = settledChainChoice(chainIds, answers, state._defaultChain, state.network === 'testnet');
      if (preferred) start(liveOf(answers), preferred);
    });
  };
}
