// Read-only checks of one project's current V6 wiring: no wallet, no tier enumeration, no indexer.
// A hand port of the SDK's getProjectDeploymentDiagnostics (v6/deploymentDiagnostics), the checker behind
// juicebox.money's "Check deployment": same check ids, statuses and sentences, so the two reports compare.
// Reads are pinned to one block. Custom hooks and controllers are "unsupported" where a capability cannot be
// verified, never a mismatch merely for differing from the canonical deployment.
import { isAddress } from 'viem';
import { contractReverted } from './encoding.js';
import { getABI, getAddress } from './abi-registry.js';

var zeroAddress = '0x0000000000000000000000000000000000000000', zeroHash = '0x' + '0'.repeat(64);
// Kept here, not imported from the NFT inventory reader: sharing that lazy module would split it into the startup set.
function sameAddress(left, right) { return left.toLowerCase() === right.toLowerCase(); }
function v6Address(contract, chainId) {
  var found = getAddress(contract, chainId);
  if (!found) throw new Error('No v6 ' + contract + ' deployment on chain ' + chainId);
  return found;
}

export var DEPLOYMENT_STATUS_LABEL = { passed: 'Verified', mismatch: 'Mismatch', unsupported: 'Custom / unsupported', unavailable: 'Unavailable', info: 'Information' };
export var DEPLOYMENT_CATEGORIES = [['project', 'Project contracts'], ['hook', 'Hook wiring'], ['pricing', 'Shop pricing'], ['permissions', 'Permissions']];

// What the indexer's answer for the project record does and does not establish.
export function describeProjectDataStatus(status) {
  if (status === 'available') return 'Indexed project details are available.';
  if (status === 'missing') return 'The indexer returned no project record. This does not establish why it is missing.';
  if (status === 'incomplete') return 'Some indexed project details are missing. This does not establish indexing progress.';
  if (status === 'unavailable') return 'The indexer request did not complete. Indexing progress is unknown.';
  return 'The indexer was not checked.';
}

// The shop powers read for a supplied operator: label, permission id.
var SHOP_PERMISSIONS = [['Adjust tiers', 24], ['Update metadata', 25], ['Mint items', 26], ['Increase discounts', 27]];
var MISMATCH_ACTION = 'Compare these values with the original deployment call before choosing a correction; immutable settings may require a new deployment.';

// The project's 721 shop hook and its store, or null when it authoritatively has none. A data hook that is not
// the omnichain deployer may be the shop itself: only a proven revert of STORE() says it is not. Other failures throw.
async function resolveShopHook(read, chainId, projectId, isRevnet, current) {
  var hook = null, authoritative = true;
  if (isRevnet) {
    var revnetHook = await read({ address: v6Address('REVOwner', chainId), abi: getABI('REVOwner', chainId), functionName: 'tiered721HookOf', args: [projectId] });
    hook = revnetHook !== zeroAddress ? revnetHook : null;
  } else {
    var dataHook = current.metadata.dataHook;
    if (dataHook && dataHook !== zeroAddress) {
      var omni = getAddress('JBOmnichainDeployer', chainId);
      if (omni && sameAddress(dataHook, omni)) {
        var found = await read({ address: omni, abi: getABI('JBOmnichainDeployer', chainId), functionName: 'tiered721HookOf', args: [projectId, BigInt(current.ruleset.id)] });
        hook = found[0] !== zeroAddress ? found[0] : null;
      } else { hook = dataHook; authoritative = false; }
    }
  }
  if (!hook) return null;
  var readStore = function () { return read({ address: hook, abi: getABI('JB721TiersHook', chainId), functionName: 'STORE' }); };
  var store = authoritative ? await readStore() : await readStore().catch(function (error) { if (contractReverted(error)) return null; throw error; });
  return store ? { hook: hook, store: store } : null;
}

// client: a viem public client on args.chainId. args: { chainId, projectId (bigint), operator? }.
// Resolves the copyable, JSON-safe report: { version, chainId, projectId, operator?, checkedAt, checkedBlock, kind, checks }.
export async function getProjectDeploymentDiagnostics(client, args) {
  var chainId = args.chainId, projectId = args.projectId;
  var requestedOperator = args.operator && isAddress(args.operator) ? args.operator : undefined;
  var report = { version: 6, chainId: chainId, projectId: projectId.toString(), checkedAt: new Date().toISOString(), checkedBlock: null, kind: 'unknown', checks: [] };
  if (requestedOperator) report.operator = requestedOperator;
  function add(check) {
    if (check.status === 'mismatch' && !check.action) check.action = MISMATCH_ACTION;
    report.checks.push(check);
  }
  function unavailable(id, category, label, error) {
    var missing = contractReverted(error);
    add({
      id: id, category: category, label: label, status: missing ? 'unsupported' : 'unavailable',
      message: missing ? 'The contract read reverted or returned no data, so this check could not be verified.' : 'The chain read did not complete. No mismatch was established.',
      action: 'Retry the check or inspect this contract with your deployment configuration.',
    });
  }
  if (projectId <= 0n) {
    add({ id: 'project', category: 'project', status: 'unsupported', label: 'Project', message: 'A positive project ID is required.' });
    return report;
  }
  var blockNumber;
  try {
    var connected = await client.getChainId();
    if (connected !== chainId) {
      add({ id: 'network', category: 'project', status: 'unavailable', label: 'Network', message: 'The connected network does not match this project.', actual: String(connected), expected: String(chainId), action: 'Choose the project\'s network and retry.' });
      return report;
    }
    blockNumber = await client.getBlockNumber();
    report.checkedBlock = blockNumber.toString();
  } catch (error) {
    unavailable('network', 'project', 'Network');
    return report;
  }
  var directory, projects, controller, revOwner, revDeployer, omni;
  try {
    directory = v6Address('JBDirectory', chainId); projects = v6Address('JBProjects', chainId); controller = v6Address('JBController', chainId);
    revOwner = v6Address('REVOwner', chainId); revDeployer = v6Address('REVDeployer', chainId); omni = v6Address('JBOmnichainDeployer', chainId);
  } catch (error) {
    add({ id: 'network', category: 'project', status: 'unsupported', label: 'Network', message: 'This site has no supported v6 deployment on this network.' });
    return report;
  }
  // Every read uses this same block; no mutable latest reads.
  function read(parameters) { return client.readContract(Object.assign({}, parameters, { blockNumber: blockNumber })); }
  var first = await Promise.allSettled([
    read({ address: projects, abi: getABI('JBProjects', chainId), functionName: 'ownerOf', args: [projectId] }),
    read({ address: directory, abi: getABI('JBDirectory', chainId), functionName: 'controllerOf', args: [projectId] }),
  ]);
  if (first[0].status === 'rejected') { unavailable('project.owner', 'project', 'Project owner', first[0].reason); return report; }
  var owner = first[0].value, isRevnet = sameAddress(owner, revOwner);
  report.kind = isRevnet ? 'revnet' : 'juicebox';
  add({ id: 'project.owner', category: 'project', status: 'passed', label: 'Project exists', message: 'The v6 project registry returned its current owner.', actual: owner });
  if (first[1].status === 'rejected') { unavailable('project.controller', 'project', 'Controller', first[1].reason); return report; }
  if (!sameAddress(first[1].value, controller)) {
    report.kind = 'custom';
    add({ id: 'project.controller', category: 'project', status: 'unsupported', label: 'Controller', message: 'This controller requires deployment-specific checks.', actual: first[1].value, expected: controller, action: 'Compare with the controller chosen in the deployment script.' });
    return report;
  }
  add({ id: 'project.controller', category: 'project', status: 'passed', label: 'Controller', message: 'The project uses the supported v6 controller.', actual: controller });
  var canonicalRevnet = false;
  if (isRevnet) {
    try {
      var hash = await read({ address: revDeployer, abi: getABI('REVDeployer', chainId), functionName: 'hashedEncodedConfigurationOf', args: [projectId] });
      canonicalRevnet = hash !== zeroHash;
      add({
        id: 'project.provenance', category: 'project', status: canonicalRevnet ? 'passed' : 'unsupported', label: 'Revnet configuration',
        message: canonicalRevnet ? 'The canonical deployer has a configuration for this revnet.' : 'No canonical configuration is registered. Ownership alone does not establish canonical deployment.',
        actual: hash,
      });
    } catch (error) { unavailable('project.provenance', 'project', 'Revnet configuration', error); }
  }
  var current;
  try {
    var currentRead = await read({ address: controller, abi: getABI('JBController', chainId), functionName: 'currentRulesetOf', args: [projectId] });
    current = { ruleset: currentRead[0], metadata: currentRead[1] };
  } catch (error) {
    unavailable('project.ruleset', 'project', 'Current ruleset', error);
    if (!isRevnet) return report;
  }
  if (current && Number(current.ruleset.id) === 0) {
    add({ id: 'project.ruleset', category: 'project', status: 'info', label: 'Current ruleset', message: 'No active ruleset is available yet. Hook routing cannot be checked.' });
    if (!isRevnet) return report;
    current = undefined;
  }
  var metadata = current && current.metadata;
  if (metadata) {
    var routing = { id: 'hook.routing', category: 'hook', status: canonicalRevnet && !sameAddress(metadata.dataHook, revOwner) ? 'mismatch' : 'info', label: 'Payment hook routing', message: 'The current ruleset selects this data hook.', actual: metadata.dataHook };
    if (canonicalRevnet) routing.expected = revOwner;
    add(routing);
    var flags = {
      id: 'hook.flags', category: 'hook', status: canonicalRevnet && (!metadata.useDataHookForPay || !metadata.useDataHookForCashOut) ? 'mismatch' : 'info', label: 'Hook enablement',
      message: canonicalRevnet ? 'Canonical composite hooks enable both payment and cash-out routing.' : 'Hook enablement can be an intentional ruleset choice.',
      actual: 'payments=' + metadata.useDataHookForPay + '; cashOuts=' + metadata.useDataHookForCashOut,
    };
    if (canonicalRevnet) flags.expected = 'payments=true; cashOuts=true';
    add(flags);
  }
  var resolved;
  try { resolved = await resolveShopHook(read, chainId, projectId, isRevnet, current); }
  catch (error) { unavailable('hook.shop', 'hook', 'Shop hook', error); return report; }
  if (!resolved) {
    var custom = !!metadata && metadata.dataHook !== zeroAddress && !sameAddress(metadata.dataHook, omni) && !isRevnet;
    if (custom) report.kind = 'custom';
    var noShop = {
      id: 'hook.shop', category: 'hook', status: canonicalRevnet ? 'mismatch' : custom ? 'unsupported' : 'info', label: 'Shop hook',
      message: canonicalRevnet ? 'The canonical revnet has no registered shop hook.' : custom ? 'The selected custom data hook does not expose a supported 721 shop.' : 'No 721 shop is configured. This is valid for a Juicebox project.',
    };
    if (canonicalRevnet) { noShop.actual = zeroAddress; noShop.expected = 'A registered 721 hook'; }
    add(noShop);
    return report;
  }
  var hook = resolved.hook, hookAbi = getABI('JB721TiersHook', chainId);
  add({ id: 'hook.shop', category: 'hook', status: 'passed', label: 'Shop hook', message: 'The project resolves to a hook reporting a 721 store address.', actual: hook });
  async function bind(id, label, functionName, expected) {
    try {
      var actual = String(await read({ address: hook, abi: hookAbi, functionName: functionName }));
      var check = {
        id: id, category: 'hook', label: label, status: expected ? (actual.toLowerCase() === expected.toLowerCase() ? 'passed' : 'mismatch') : 'info',
        message: expected ? 'Compared the hook\'s binding with this project.' : 'The hook reported this value; custom ownership can be intentional.', actual: actual,
      };
      if (expected) check.expected = expected;
      add(check);
      return actual;
    } catch (error) { unavailable(id, 'hook', label, error); return undefined; }
  }
  var bound = await Promise.all([
    bind('hook.projectId', 'Hook project', 'projectId', projectId.toString()),
    bind('hook.directory', 'Hook directory', 'DIRECTORY', directory),
    bind('hook.owner', 'Shop authority', 'owner', canonicalRevnet ? revOwner : undefined),
    bind('hook.permissions', 'Permission registry', 'PERMISSIONS'),
  ]);
  var hookProject = bound[0], hookOwner = bound[2], permissionRegistry = bound[3];
  await Promise.all([
    (async function () {
      if (sameAddress(resolved.store, zeroAddress)) {
        add({ id: 'hook.store', category: 'hook', status: 'mismatch', label: 'Shop store', message: 'The hook reports no store address.', actual: zeroAddress, expected: 'A deployed 721 store', action: 'Compare the hook initialization with the deployment script before using its shop.' });
        return;
      }
      try {
        var maxTierId = await read({ address: resolved.store, abi: getABI('JB721TiersHookStore', chainId), functionName: 'maxTierIdOf', args: [hook] });
        add({ id: 'hook.store', category: 'hook', status: 'passed', label: 'Shop store', message: 'The reported store is readable; highest tier ID is ' + maxTierId + '.', actual: resolved.store });
      } catch (error) { unavailable('hook.store', 'hook', 'Shop store', error); }
    })(),
    (async function () {
      try {
        var factory = await read({ address: v6Address('JBAddressRegistry', chainId), abi: getABI('JBAddressRegistry', chainId), functionName: 'deployerOf', args: [hook] });
        var expected = v6Address('JB721TiersHookDeployer', chainId), canonical = sameAddress(factory, expected);
        add({
          id: 'hook.provenance', category: 'hook', status: canonical ? 'passed' : 'unsupported', label: 'Shop factory',
          message: canonical ? 'The registry records the canonical 721 factory.' : 'The registry does not establish canonical factory provenance. Custom hooks need separate review.',
          actual: factory, expected: expected,
        });
      } catch (error) { unavailable('hook.provenance', 'hook', 'Shop factory', error); }
    })(),
    (async function () {
      try {
        var pricing = await read({ address: hook, abi: hookAbi, functionName: 'pricingContext' });
        add({ id: 'shop.pricing', category: 'pricing', status: 'info', label: 'Shop pricing', message: 'Prices use these units. Precision alone cannot establish whether an item was priced as intended.', actual: 'currency=' + pricing[0] + '; decimals=' + pricing[1] });
      } catch (error) { unavailable('shop.pricing', 'pricing', 'Shop pricing', error); }
    })(),
    (async function () {
      if (args.operator && !requestedOperator) {
        add({ id: 'shop.permissions', category: 'permissions', status: 'unsupported', label: 'Shop permissions', message: 'The supplied operator is not a valid address.', action: 'Supply the operator address from your deployment configuration.' });
        return;
      }
      if (!requestedOperator) {
        var none = { id: 'shop.permissions', category: 'permissions', status: 'info', label: 'Shop permissions', message: 'Operator permissions can be intentionally restricted. Supply an operator address to read its current powers.' };
        if (hookOwner) none.actual = 'Shop authority: ' + hookOwner;
        add(none);
        return;
      }
      if (!hookOwner || !hookProject || !permissionRegistry) {
        var dependencies = ['hook.owner', 'hook.projectId', 'hook.permissions'].map(function (id) { return report.checks.find(function (item) { return item.id === id; }); });
        add({
          id: 'shop.permissions', category: 'permissions', label: 'Shop permissions',
          status: dependencies.some(function (item) { return item && item.status === 'unavailable'; }) ? 'unavailable' : 'unsupported',
          message: 'A required hook authority or binding read could not be verified. Operator powers remain unknown.', action: 'Retry the missing hook reads before checking operator powers.',
        });
        return;
      }
      var permissions = v6Address('JBPermissions', chainId);
      if (sameAddress(requestedOperator, zeroAddress) || hookProject !== projectId.toString() || !sameAddress(permissionRegistry, permissions)) {
        add({
          id: 'shop.permissions', category: 'permissions', status: 'unsupported', label: 'Shop permissions',
          message: 'Operator powers cannot be established for an unverified project binding, custom permission registry or zero operator.',
          action: 'Verify the hook\'s project and permission registry, then supply a nonzero operator address.',
        });
        return;
      }
      await Promise.all(SHOP_PERMISSIONS.map(async function (permission) {
        var label = permission[0], id = permission[1];
        try {
          var allowed = sameAddress(requestedOperator, hookOwner) || await read({
            address: permissions, abi: getABI('JBPermissions', chainId), functionName: 'hasPermissions',
            args: [requestedOperator, hookOwner, projectId, [BigInt(id)], true, true],
          });
          add({ id: 'shop.permission.' + id, category: 'permissions', status: 'info', label: label, message: 'This is the supplied operator\'s current capability, including owner, root and wildcard authority.', actual: allowed ? 'Allowed' : 'Not allowed' });
        } catch (error) { unavailable('shop.permission.' + id, 'permissions', label, error); }
      }));
    })(),
  ]);
  report.checks.sort(function (left, right) { return left.id.localeCompare(right.id); });
  return report;
}

// The report shown when the chain reads themselves could not run.
export function unreadDeploymentReport(chainId, projectId, checkedAt) {
  return {
    version: 6, chainId: chainId, projectId: String(projectId), kind: 'unknown', checkedAt: checkedAt, checkedBlock: null,
    checks: [{ id: 'contract-read', category: 'project', status: 'unavailable', label: 'Contract reads', message: 'Could not read the deployment. Its configuration has not been verified.', action: 'Retry the check.' }],
  };
}

// What the indexer holds for the project, read apart from the chain: a failed indexer request proves nothing
// about wiring. loadRow(chainId, projectId) resolves the project's record or nothing; groupMembers(id) the
// { chainId, projectId } records of its linked group.
export async function readProjectIndexStatus(loadRow, groupMembers, chainId, projectId) {
  var row = await loadRow(chainId, projectId);
  if (!row) return { status: 'missing', message: describeProjectDataStatus('missing') };
  var out = { status: 'available', message: describeProjectDataStatus('available') + ' Individual stats and activity may have separate availability.' };
  if (!row.suckerGroupId) return out;
  try {
    var members = await groupMembers(row.suckerGroupId);
    if (!members.some(function (member) { return Number(member.chainId) === Number(chainId) && Number(member.projectId) === Number(projectId); })) {
      return { status: 'incomplete', linkedProjectsStatus: 'incomplete', message: 'The project record is available, but its linked project records are incomplete. Cross-chain totals may be incomplete.' };
    }
  } catch (error) {
    return { status: 'incomplete', linkedProjectsStatus: 'unavailable', message: 'The project record is available, but its linked project request failed. Cross-chain totals may be incomplete.' };
  }
  out.linkedProjectsStatus = 'available';
  return out;
}

// Both reads, each settling on its own: { checkedAt, deployment, indexer }.
export async function readProjectDiagnostics(deps, chainId, projectId, operator) {
  var checkedAt = new Date().toISOString();
  var settled = await Promise.allSettled([
    Promise.resolve().then(function () {
      return getProjectDeploymentDiagnostics(deps.clientFor(chainId), operator ? { chainId: chainId, projectId: BigInt(projectId), operator: operator } : { chainId: chainId, projectId: BigInt(projectId) });
    }),
    Promise.resolve().then(function () { return readProjectIndexStatus(deps.loadRow, deps.groupMembers, chainId, projectId); }),
  ]);
  return {
    checkedAt: checkedAt,
    deployment: settled[0].status === 'fulfilled' ? settled[0].value : unreadDeploymentReport(chainId, projectId, checkedAt),
    indexer: settled[1].status === 'fulfilled' ? settled[1].value : { status: 'unavailable', message: describeProjectDataStatus('unavailable') },
  };
}

// The "Check deployment" dialog. deps: { el, openModal, copyText, clientFor, loadRow, groupMembers,
// deployments: [{ chainId, projectId, name }], selected (index) }.
export function openDeploymentCheck(deps) {
  var el = deps.el, deployments = deps.deployments;
  function line(className, text) { var node = el('div', className); node.textContent = text; return node; }
  var form = el('div', 'modal-body operator-edit extras-body deploy-check');
  form.appendChild(line('extras-payer-copy', 'Read-only checks of the selected project and its data availability.'));
  form.appendChild(line('operator-edit-label extras-label', 'Deployment'));
  var select = el('select', 'operator-edit-jwt extras-select'); select.setAttribute('aria-label', 'Deployment');
  deployments.forEach(function (deployment, index) {
    var option = document.createElement('option'); option.value = String(index); option.textContent = deployment.name + ', #' + deployment.projectId; select.appendChild(option);
  });
  select.value = String(deps.selected || 0);
  form.appendChild(select);
  var operatorRow = el('label', 'extras-checkbox-row'), operatorCheck = document.createElement('input'); operatorCheck.type = 'checkbox';
  var operatorText = document.createElement('span'); operatorText.textContent = 'Check an address\'s shop permissions';
  operatorRow.appendChild(operatorCheck); operatorRow.appendChild(operatorText); form.appendChild(operatorRow);
  var operatorInput = el('input', 'operator-edit-jwt extras-address'); operatorInput.type = 'text'; operatorInput.placeholder = '0x…';
  operatorInput.spellcheck = false; operatorInput.autocomplete = 'off'; operatorInput.setAttribute('aria-label', 'Operator address'); operatorInput.style.display = 'none';
  form.appendChild(operatorInput);
  var status = el('div', 'operator-edit-status'); status.setAttribute('role', 'status'); form.appendChild(status);
  var results = el('div', 'deploy-check-results'); form.appendChild(results);
  var actions = el('div', 'operator-edit-actions extras-actions');
  var again = el('a', 'operator-cta'); again.href = '#'; again.textContent = 'Check again'; actions.appendChild(again);
  var copy = el('a', 'operator-cta'); copy.href = '#'; copy.textContent = 'Copy diagnostics'; copy.style.display = 'none'; actions.appendChild(copy);
  form.appendChild(actions);

  var sequence = 0, report = null;
  function render() {
    results.textContent = '';
    results.appendChild(line('deploy-check-meta', 'Checked ' + report.checkedAt + (report.deployment.checkedBlock ? ', Block ' + report.deployment.checkedBlock : '')));
    if (report.deployment.operator) results.appendChild(line('deploy-check-meta', 'Checked operator: ' + report.deployment.operator));
    var indexer = el('section', 'deploy-check-item'); indexer.setAttribute('aria-label', 'Indexer availability');
    indexer.appendChild(line('deploy-check-title', 'Indexer availability')); indexer.appendChild(line('deploy-check-line', report.indexer.message));
    results.appendChild(indexer);
    DEPLOYMENT_CATEGORIES.forEach(function (category) {
      var checks = report.deployment.checks.filter(function (check) { return check.category === category[0]; });
      if (!checks.length) return;
      var section = el('section', 'deploy-check-section'); section.setAttribute('aria-label', category[1]);
      section.appendChild(line('deploy-check-title', category[1]));
      checks.forEach(function (check) {
        var item = el('div', 'deploy-check-item');
        var head = el('div', 'deploy-check-head'); head.appendChild(line('deploy-check-label', check.label));
        head.appendChild(line('deploy-check-status' + (check.status === 'mismatch' ? ' mismatch' : ''), DEPLOYMENT_STATUS_LABEL[check.status]));
        item.appendChild(head); item.appendChild(line('deploy-check-line', check.message));
        if (check.actual !== undefined) item.appendChild(line('deploy-check-value', 'Actual: ' + check.actual));
        if (check.expected !== undefined) item.appendChild(line('deploy-check-value', 'Expected: ' + check.expected));
        if (check.action) item.appendChild(line('deploy-check-line', check.action));
        section.appendChild(item);
      });
      results.appendChild(section);
    });
  }
  function run() {
    var mine = ++sequence;
    report = null; results.textContent = ''; copy.style.display = 'none'; copy.textContent = 'Copy diagnostics';
    var deployment = deployments[Number(select.value)], operator = operatorCheck.checked ? operatorInput.value.trim() : '';
    if (operator && !isAddress(operator)) { status.className = 'operator-edit-status error'; status.textContent = 'Enter a valid operator address, or leave it blank.'; return; }
    status.className = 'operator-edit-status pending'; status.textContent = 'Checking contracts and project data…'; again.textContent = 'Checking…';
    readProjectDiagnostics(deps, deployment.chainId, deployment.projectId, operator).then(function (value) {
      if (mine !== sequence) return;
      report = value; status.className = 'operator-edit-status'; status.textContent = ''; render(); copy.style.display = '';
    }, function () {
      if (mine !== sequence) return;
      status.className = 'operator-edit-status error'; status.textContent = 'Could not complete the deployment check. Retry shortly.';
    }).then(function () { if (mine === sequence) again.textContent = 'Check again'; });
  }
  select.addEventListener('change', run);
  operatorCheck.addEventListener('change', function () {
    operatorInput.style.display = operatorCheck.checked ? '' : 'none';
    if (operatorCheck.checked) operatorInput.focus();
    else if (operatorInput.value.trim()) { operatorInput.value = ''; run(); }
  });
  operatorInput.addEventListener('change', run);
  again.addEventListener('click', function (event) { event.preventDefault(); run(); });
  copy.addEventListener('click', function (event) {
    event.preventDefault(); if (!report) return;
    var serialized = JSON.stringify(report, null, 2);
    Promise.resolve().then(function () { return deps.copyText(serialized); }).then(function () { copy.textContent = 'Copied'; }, function () {
      if (results.querySelector('textarea')) return;
      results.appendChild(line('deploy-check-line', 'Clipboard unavailable. Select and copy the diagnostics below.'));
      var area = el('textarea', 'deploy-check-raw'); area.readOnly = true; area.rows = 10; area.value = serialized; area.setAttribute('aria-label', 'Deployment diagnostics');
      area.addEventListener('focus', function () { area.select(); });
      results.appendChild(area);
    });
  });
  deps.openModal('Check deployment', form);
  run();
}
