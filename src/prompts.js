// src/prompts.js
// Generate LLM prompts for protocol auditing and per-function context

import { registry } from './abi-registry.js';

var ECOSYSTEM_REPO_URL = 'https://github.com/Bananapus/version-6';

function getContractRepo(contractName) {
  var src = registry && registry.sources && registry.sources[contractName];
  if (!src) return null;
  return {
    repo: src.repo || null,
    githubUrl: src.githubUrl || null,
    path: src.path || null,
  };
}

function pushRepoContext(lines, contractName) {
  lines.push('## Source Repositories');
  lines.push('- Full ecosystem (start here for cross-repo audits): ' + ECOSYSTEM_REPO_URL + ' — read its root `AUDIT_INSTRUCTIONS.md` for the audit engine.');
  var src = getContractRepo(contractName);
  if (src && src.githubUrl) {
    var contractRef = '- This contract’s repo: ' + src.githubUrl;
    if (src.path) contractRef += ' (' + src.path + ')';
    lines.push(contractRef);
    lines.push('- Repo-local audit notes: ' + src.githubUrl + '/blob/main/AUDIT_INSTRUCTIONS.md');
  }
  lines.push('');
}

var CONTRACT_DESCRIPTIONS = {
  JBMultiTerminal: 'Holds funds and executes pay, payout, cash out, surplus allowance, and fee-processing flows. Multi-token. Handles fees (2.5%, 28-day hold). Permit2 integration.',
  JBTerminalStore: 'Owns accounting and surplus logic. Records payment minting, payout limit usage, and bonding curve reclaim math. Data hook integration point.',
  JBController: 'Orchestrator for project lifecycle — ruleset queuing, token minting/burning, reserved token distribution, ERC2771 meta-transactions.',
  JBDirectory: 'Routes projects to their terminals and controllers. Handles migration hooks.',
  JBRulesets: 'Stores current and queued economic parameters. Linked-list via basedOnId. Weight decay with cache. Approval hooks.',
  JBTokens: 'Dual token system: internal credits + ERC-20. Credits burned first on cash out. 18-decimal requirement.',
  JBSplits: 'Packed split storage for payout and reserved token distribution. Locked splits enforcement.',
  JBFundAccessLimits: 'Payout limits and surplus allowances per terminal/token/currency.',
  JBPrices: 'Price feed registry with project-specific and protocol default fallback. Inverse auto-calculation. Immutable feeds.',
  JBPermissions: '256-bit packed permissions. ROOT (1) grants all. Wildcard projectId=0 for cross-project access.',
  JBProjects: 'ERC-721 project ownership NFTs.',
  JBERC20: 'Cloneable ERC20Votes+Permit token. Owned by JBTokens.',
  JBFeelessAddresses: 'Fee-exempt address registry.',
  JB721TiersHook: 'Tiered NFT rewards hook. Tiers sorted by category. Supports pay and cash out hooks.',
  JB721TiersHookStore: 'Storage for 721 tier data, pricing, and metadata.',
  JB721TiersHookDeployer: 'Factory for deploying 721 tiered hooks.',
  JB721TiersHookProjectDeployer: 'Combined project + 721 hook deployment.',
  JBBuybackHook: 'Pay data hook that routes a payment through a Uniswap pool to buy back the project token when that yields more tokens than minting. Otherwise minting proceeds normally.',
  JBBuybackHookRegistry: 'Registry for buyback hooks that route payments through DEXs when cheaper than minting.',
  JBSuckerRegistry: 'Registry for cross-chain sucker bridges.',
  JBAddressRegistry: 'Maps deployed contract addresses to their deployers for trust verification.',
  REVDeployer: 'Deploys and manages revnet (revenue network) projects.',
  REVOwner: 'Runtime data hook for every revnet — coordinates the 721 and buyback hooks at pay time, aggregates cross-chain supply/surplus, and routes the 2.5% fee at cash out. Split from REVDeployer for EIP-170 size limits.',
  REVLoans: 'Loan system using project tokens as collateral.',
  JBRouterTerminal: 'Universal payment terminal: accepts any token and converts it into whatever the destination project accepts, picking the route (direct forward, Uniswap V3/V4 swap, recursive cash out) that yields the most project tokens. Never holds a balance.',
  JBRouterTerminalRegistry: 'Registry whose terminalOf(projectId) selects a gateway or a previous router for that project cohort. Resolve live per chain; retired selections can continue serving existing projects.',
  JBRouterTerminalGateway: 'Registry-selected payment terminal. Takes custody before calling ROUTER; a failed protocol-fee route retains funds in a committed pending call for retry or finalization. A queued fee is still held, not settled or forgiven.',
  JBRatioPriceFeed: 'Ratio feed registered in JBPrices for USDC/native and USDC/ETH accounting. Read deployment availability per chain; OP Sepolia has the feed without the router or gateway.',
  JBProjectHandles: 'Maps ENS names to project IDs.',
  JBProjectPayer: 'Payment relay that auto-forwards received ETH/ERC-20 to a project’s terminal via receive(), or routes explicitly via pay/addToBalanceOf. Deployed as an EIP-1167 clone.',
  JBProjectPayerDeployer: 'Factory that deploys JBProjectPayer EIP-1167 minimal-proxy clones.',
  JBOmnichainDeployer: 'One-stop deployer for omnichain projects: launches a project with a tiered 721 hook and cross-chain suckers in one transaction, then inserts itself as every ruleset data hook to coordinate the 721/buyback hooks and compute cross-chain total supply and surplus.',
  JBOptimismSucker: 'Cross-chain bridge to/from Optimism: cashes out a project’s tokens locally and queues funds+tokens into an outbox merkle tree, then mints them to beneficiaries on the peer chain via an inbox merkle proof. Registered via JBSuckerRegistry.',
  JBArbitrumSucker: 'Cross-chain bridge to/from Arbitrum, using merkle outbox/inbox trees to move a project’s tokens and backing funds between chains. Registered via JBSuckerRegistry.',
  JBBaseSucker: 'Cross-chain bridge to/from Base, using merkle outbox/inbox trees to move a project’s tokens and backing funds between chains. Registered via JBSuckerRegistry.',
  JBUniswapV4Hook: 'Uniswap V4 hook that routes swaps to whichever venue — V4 pool or Juicebox project — gives the user more tokens. Uses a 30-minute TWAP oracle to resist price manipulation.',
  JBUniswapV4LPSplitHook: 'Split hook that builds and manages a project-owned Uniswap V4 liquidity position, seeded by the project’s reserved-token distributions via a two-stage accumulate-then-deploy lifecycle.',
  JBUniswapV4LPSplitHookDeployer: 'Factory that deploys lightweight JBUniswapV4LPSplitHook clones.',
  DefifaDeployer: 'Deploys and manages Defifa prediction-market games — each game has tiers representing outcomes; players mint tier NFTs during the MINT phase, a scorecard assigns cash out weights after the event, and the pooled funds are distributed proportionally to winning holders. Phases: COUNTDOWN → MINT → REFUND → SCORING → COMPLETE/NO_CONTEST.',
  DefifaHook: 'The 721 hook powering Defifa games — enforces game-phase rules on minting and cash out, and applies the scorecard cash out weights per tier.',
  DefifaGovernor: 'Manages ratification of Defifa scorecards via token-weighted attestation — NFT holders attest to proposed cash out weights with power proportional to NFTs held; a scorecard ratifies once it reaches quorum.',
  CTPublisher: 'The Croptop publishing engine. Anyone can publish NFT posts to a project’s 721 hook subject to per-category criteria (min price, supply bounds, allowlist) set by the collection owner; routes a 5% fee to the fee project, pays the remainder into the project terminal, and dedups duplicate IPFS URIs to reuse existing tiers.',
  CTDeployer: 'Deploys Juicebox projects pre-configured for Croptop — a permissionless NFT publishing system — and registers posting permissions/criteria.',
  CTProjectOwner: 'A dead-end project owner that locks ownership while preserving Croptop posting permissions.',
  JBMatchingPriceFeed: 'A 1:1 price feed used when a payout limit is denominated in the same currency as the terminal token, so no conversion is needed.',
  JBHeldFees: 'External library for held-fee storage operations used by JBMultiTerminal during the 28-day fee hold.',
};

// Mirrors AUDIT_BODY in juicebox-money src/lib/audit-prompt.ts; keep the two in sync.
export function getAuditPrompt() {
  return [
    'You are a security engineer auditing the Juicebox V6 protocol and its web apps: open-source, permissionless programmable money on Ethereum, Optimism, Base, and Arbitrum. Find every practical way an attacker, malformed integration, stale deployment, or wrong UI assumption could steal or strand funds, brick a project, corrupt owner or token holder invariants, mislead a user about the transaction they sign, or make the system less safe, efficient, or clear for people and AIs.',
    '',
    'Do not stop at the first finding. Work from first principles, check claims against code and tests, and write proofs of concept wherever you can. Treat existing audits as evidence, not as a priority guide. Use a new .md file as a scratchpad and for results.',
    '',
    'Start with the complete ecosystem repository:',
    '',
    '```bash',
    'git clone --recursive https://github.com/Bananapus/version-6.git',
    'cd version-6',
    '```',
    '',
    'Read `AUDIT_INSTRUCTIONS.md` at the repository root and follow its workflow. That file and the checked-out source are the source of truth; the primer below is a fast start.',
    '',
    '## Focus',
    '',
    '- `nana-core-v6`: JBMultiTerminal (pay, payouts, cash outs, surplus allowance, fees with a 28-day hold), JBTerminalStore (balances, surplus, cash out math), JBController (rulesets, mint and burn, reserved tokens), JBRulesets (linked list, weight cuts, approval hooks, packed metadata), JBTokens (credits and ERC-20, credits burned first), JBPermissions (256-bit packed, ROOT grants all, wildcard projectId 0), JBPrices (immutable feeds, inverse rates), JBSplits, JBFundAccessLimits, JBDirectory.',
    '- The extensions: the 721 hook, buyback hook, router terminal, suckers, omnichain deployers, `revnet-core-v6`, and the deployment data in `deploy-all-v6`.',
    '- The web apps under `webclients/`: transaction construction and review, wallet and chain state, launch configuration, project discovery, pay, cash out, and payout flows, shop and metadata rendering, IPFS boundaries, server routes, and anywhere untrusted offchain data reaches a user or a transaction.',
    '',
    '## Key flows',
    '',
    '1. Payment: accept funds → STORE.recordPaymentFrom (weight, data hook) → mint tokens → fulfill pay hooks',
    '2. Cash out: STORE.recordCashOutFor (cash out math, data hook) → burn tokens → transfer reclaim → fulfill hooks → take fees',
    '3. Payouts: STORE.recordPayoutFor → pay splits → leftover to owner → take fees',
    '4. Reserved tokens: accumulate in pendingReservedTokenBalanceOf → sendReservedTokensToSplitsOf mints and distributes',
    '',
    '## Verify that',
    '',
    '1. Terminal solvency: internal balances plus held fees reconcile with actual token balances.',
    '2. No over-withdrawal: payouts and allowance use never exceed per-cycle limits.',
    '3. Cash outs: surplus, total supply, tax rate, fees, and hook overrides produce the correct reclaim.',
    '4. Rulesets: the active ruleset and cycling match the exact timing and approval hook rules.',
    '5. Tokens: credits, ERC-20 supply, pending reserved tokens, and mint and burn paths stay coherent.',
    '6. Privilege: permissions, wildcards, controller migration, and terminal routing allow no unauthorized control.',
    '7. Held fees are never forgiven, duplicated, or charged to the wrong place.',
    '8. previewPayFor and previewCashOutFrom match execution.',
    '9. Every app-built transaction targets the intended contract, chain, ABI, method, value, token, project, and beneficiary, and the review shows everything security-relevant.',
    '10. Untrusted RPC, metadata, IPFS, URL, image, and API inputs cannot cause injection, request forgery, resource exhaustion, privacy leaks, unsafe redirects, or misleading signing.',
    '11. Wallet, account, and chain changes, stale queries, retries, partial failures, and concurrent submissions fail safely.',
    '',
    '## Multichain and multi-token',
    '',
    '- NATIVE_TOKEN (0x…EEEe) is a sentinel; WRAPPED_NATIVE_TOKEN wraps it. Token addresses and decimals differ per chain, so no token address is portable. JBFixedPointNumber adjusts decimals and JBPrices converts currencies.',
    '- Suckers bridge with merkle trees (outbox and inbox). Token mappings are immutable once the outbox has entries. Bridged amounts are capped at uint128 for SVM peers.',
    '- JBChainlinkV3SequencerPriceFeed checks the L2 sequencer and enforces a grace period after a restart.',
    '- Accounting contexts track token, decimals, and currency per terminal, with no duplicates. currency (uint32) is uint32(uint160(token)), distinct from baseCurrency (1 = ETH, 2 = USD). groupId (uint256) and currency (uint32) name the same token at different widths; mixing them causes silent bugs.',
    '- Surplus aggregates across terminals and tokens through JBPrices. A reverting feed reverts every operation using that pair: denial of service, not loss.',
    '- Empty fundAccessLimitGroups means zero payouts, not unlimited; uint224.max is unlimited.',
    '- Fee-free payouts between projects on the same terminal are tracked per token.',
    '- Fee-on-transfer, rebasing, and non-standard-decimal ERC-20s are edge cases at system boundaries.',
    '',
    '## Attack surfaces',
    '',
    '- pay, cashOutTokensOf, sendPayoutsOf, and useAllowanceOf',
    '- preview paths that other repos treat as execution truth',
    '- the held fee lifecycle and _processFee',
    '- surplus aggregation across terminals and tokens',
    '- controller and terminal migration',
    '- setPermissionsFor and wildcard rules',
    '- reentrancy through pay, cash out, and split hooks',
    '- cross-chain token mapping and bridge message integrity',
    '',
    '## Key constants',
    '',
    '- Fee: STANDARD_FEE = 25 of MAX_FEE = 1000, so 2.5%',
    '- MAX_RESERVED_PERCENT = 10,000',
    '- MAX_CASH_OUT_TAX_RATE = 10,000',
    '- SPLITS_TOTAL_PERCENT = 1,000,000,000',
    '- NATIVE_TOKEN = 0x000000000000000000000000000000000000EEEe',
    '- Fee hold: 28 days (2,419,200 seconds)',
    '',
    '## Known issues (accepted)',
    '',
    '- cashOut(0) with totalSupply == 0 returns the entire surplus',
    '- Pending reserved tokens count in totalSupply, lowering cash out value',
    '- mulDiv rounding breaks cash out subadditivity by under 0.01%',
    '',
    '## Report',
    '',
    'For every finding: severity and realistic impact; affected files, contracts, functions, routes, and chains; the violated invariant; a reproducible sequence; a proof of concept or failing test; and the smallest fix with its tradeoffs. Report non-exploitable correctness gaps, performance hazards, confusing documentation, and missing tests separately. If a suspected issue is not exploitable, name the guard that prevents it.',
  ].join('\n');
}

function formatTupleType(param) {
  if (!param.components) return param.type;
  var fields = param.components.map(function(c) {
    return c.type + ' ' + (c.name || '');
  }).join(', ');
  return 'tuple(' + fields + ')' + (param.type.endsWith('[]') ? '[]' : '');
}

// Extract current field values from a component’s DOM
function extractComponentFields(componentEl) {
  var fields = [];
  var sections = componentEl.querySelectorAll('.component-section');
  for (var i = 0; i < sections.length; i++) {
    var sec = sections[i];
    var label = sec.querySelector('.input-label');
    var labelText = label ? label.childNodes[0].textContent.trim() : '';

    // Text/number inputs
    var input = sec.querySelector('input.field, input.amount-input, textarea.field');
    if (input) {
      var val = input.value || '';
      if (val) fields.push({ label: labelText, value: val });
      // Also check token dropdown in same section
      var tokenDd = sec.querySelector('.token-dropdown');
      if (tokenDd) {
        fields.push({ label: labelText + ' token', value: tokenDd.options[tokenDd.selectedIndex].text });
      }
      continue;
    }

    // Select dropdowns
    var select = sec.querySelector('select.field, select.network-dropdown');
    if (select) {
      fields.push({ label: labelText, value: select.options[select.selectedIndex].text });
      continue;
    }

    // Pills (chain pills, option pills)
    var selectedPill = sec.querySelector('.chain-pill.selected, .pill.selected');
    if (selectedPill) {
      fields.push({ label: labelText, value: selectedPill.textContent.trim() });
      continue;
    }
  }

  // Chain selector at top level
  var chainPill = componentEl.querySelector('.chain-pills-row .chain-pill.selected');
  if (chainPill && !fields.some(function(f) { return f.label === 'chain'; })) {
    fields.push({ label: 'chain', value: chainPill.textContent.trim() });
  }

  // Network dropdown
  var netDd = componentEl.querySelector('.network-dropdown');
  if (netDd) {
    fields.push({ label: 'network', value: netDd.options[netDd.selectedIndex].text });
  }

  return fields;
}

export function getComponentAuditPrompt(fn, contractName, fnNatspec, componentEl) {
  var lines = [];
  lines.push('I’m about to execute a Juicebox V6 transaction using a frontend component. Please audit what I’m about to sign — verify the parameters are correct, flag any risks, and confirm the onchain effect matches my intent.');
  lines.push('');

  pushRepoContext(lines, contractName);

  // What component
  var title = componentEl.querySelector('.component-title');
  lines.push('## Action: ' + (title ? title.textContent : fn.name));
  lines.push('');

  // Contract context
  lines.push('## Contract: ' + contractName);
  if (CONTRACT_DESCRIPTIONS[contractName]) {
    lines.push(CONTRACT_DESCRIPTIONS[contractName]);
  }
  lines.push('');

  // Function signature
  var paramList = fn.inputs.map(function(p) {
    return p.type + ' ' + (p.name || '');
  }).join(', ');
  lines.push('## Solidity Function');
  lines.push('`' + fn.name + '(' + paramList + ')`');
  lines.push('State mutability: ' + fn.stateMutability);
  lines.push('');

  // Current field values from the form
  var fields = extractComponentFields(componentEl);
  if (fields.length > 0) {
    lines.push('## My Current Input Values');
    for (var i = 0; i < fields.length; i++) {
      lines.push('- **' + fields[i].label + '**: ' + fields[i].value);
    }
    lines.push('');
  }

  // NatSpec
  if (fnNatspec) {
    if (fnNatspec.notice) {
      lines.push('## Function Description');
      lines.push(fnNatspec.notice);
      lines.push('');
    }
  }

  // Parameters with types
  if (fn.inputs.length > 0) {
    lines.push('## Parameter Specification');
    for (var j = 0; j < fn.inputs.length; j++) {
      var p = fn.inputs[j];
      var desc = '';
      if (fnNatspec && fnNatspec.params) {
        desc = fnNatspec.params[p.name] || fnNatspec.params[p.name.replace(/^_/, '')] || '';
      }
      var typeStr = p.type;
      if (p.components) {
        typeStr = formatTupleType(p);
      }
      lines.push('- `' + (p.name || 'param' + j) + '` (' + typeStr + ')' + (desc ? ': ' + desc : ''));
    }
    lines.push('');
  }

  // What to check
  lines.push('## Please Verify');
  lines.push('1. Do my input values correctly map to the function parameters?');
  lines.push('2. Will the onchain effect match what I intend (based on the action name and values)?');
  lines.push('3. Are there any risks, gotchas, or edge cases with these specific values?');
  if (fn.stateMutability === 'payable') {
    lines.push('4. This function accepts ETH via msg.value — is the amount and token correct?');
  }
  lines.push('');

  // Protocol context
  lines.push('## Protocol Context');
  lines.push('Juicebox V6 is an open-source programmable money protocol. Key invariants: terminal solvency, no over-withdrawal, correct bonding curve cashout, privilege containment via JBPermissions.');
  lines.push('');
  lines.push('Known gotchas: empty fundAccessLimitGroups = zero payouts (not unlimited), pending reserved tokens inflate totalSupply reducing cashout value, currency (uint32) != baseCurrency (1=ETH, 2=USD).');

  return lines.join('\n');
}
