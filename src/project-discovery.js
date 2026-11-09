import { discoverChains, firstChainForNetwork } from './component-base.js';

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
    discoverChains(pid, function (live) {
      if (gen !== generation) return;
      state.liveChains = live;
      if (!live.length) { state.phase = 'idle'; state.error = 'Could not find the project on the chains we could reach.'; updateUI(); return; }
      var preferred = (state._defaultChain && live.indexOf(state._defaultChain) !== -1) ? state._defaultChain : firstChainForNetwork(state) || live[0];
      chosen(preferred);
      state._defaultChain = null;
      state.phase = 'ready';
      updateUI();
      if (ready) ready(preferred);
    });
  };
}
