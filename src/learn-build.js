// src/learn-build.js
// Learn & Build tab content — engaging walkthrough of the Juicebox protocol

import { BENDYSTRAW_GRAPHQL_ENDPOINTS } from './bendystraw-endpoints.js';
import { LEARN_SECTIONS } from './learn-sections.js';

export function renderLearnTab() {
  var container = document.getElementById('tab-learn');
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap';
  wrap.appendChild(guideJourneyLinks('learn'));

  var toc = document.createElement('nav');
  toc.className = 'guide-toc';
  toc.innerHTML = '<div class="guide-toc-title">TABLE OF CONTENTS</div>';
  var lastPart = '';
  LEARN_SECTIONS.forEach(function (section, i) {
    if (section.part !== lastPart) {
      var label = document.createElement('div');
      label.className = 'guide-toc-group-label';
      if (lastPart) label.style.marginTop = '8px';
      label.textContent = section.part;
      toc.appendChild(label);
    }
    var link = document.createElement('a');
    link.className = 'guide-toc-link';
    link.href = '#' + section.id;
    link.textContent = (i + 1) + '. ' + section.title;
    toc.appendChild(link);
    lastPart = section.part;
  });
  wrap.appendChild(toc);

  lastPart = '';
  LEARN_SECTIONS.forEach(function (section, i) {
    if (section.part !== lastPart) {
      var header = document.createElement('div');
      header.className = 'guide-part-header';
      header.textContent = section.part.toUpperCase();
      wrap.appendChild(header);
      lastPart = section.part;
    }
    var extras = (section.aliases || []).map(function (alias) {
      var anchor = document.createElement('span');
      anchor.id = alias;
      return anchor;
    });
    (section.blocks || []).forEach(function (block) {
      extras.push.apply(extras, learnBlock(block));
    });
    wrap.appendChild(guideSection(section.id, (i + 1) + '. ' + section.title.toUpperCase(), section.paragraphs || [], extras));
  });

  container.appendChild(wrap);
  initSmoothScroll(container);
}

// jbm-relative links point back to juicebox.money; in-page anchors stay local.
function learnHref(href) {
  return href.charAt(0) === '/' ? 'https://juicebox.money' + href : href;
}

// Guide prose may link a word with `[label](href)`; everything else renders as text.
var INLINE_LINK = /\[([^\]]+)\]\(((?:#|\/|https?:)[^)\s]*)\)/g;
function inline(node, text) {
  var last = 0;
  text.replace(INLINE_LINK, function (match, label, href, index) {
    node.appendChild(document.createTextNode(text.slice(last, index)));
    var a = document.createElement('a');
    a.href = learnHref(href);
    a.textContent = label;
    node.appendChild(a);
    last = index + match.length;
  });
  node.appendChild(document.createTextNode(text.slice(last)));
  return node;
}

// Same rule as juicebox.money's guideRowId, so `#term-cash-out-tax` works on both sites.
function rowId(prefix, name) {
  return prefix + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function compareTable(label, columns, rows) {
  var wrap = document.createElement('div');
  wrap.className = 'guide-prop-table';
  var table = document.createElement('table');
  table.className = 'guide-compare-table';
  var caption = document.createElement('caption');
  caption.className = 'guide-prop-title';
  caption.textContent = label;
  table.appendChild(caption);
  [columns].concat(rows).forEach(function (cells, i) {
    var tr = document.createElement('tr');
    cells.forEach(function (cell) {
      var td = document.createElement(i ? 'td' : 'th');
      if (!i) td.scope = 'col';
      td.textContent = cell;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  return wrap;
}

function learnBlock(block) {
  if (block.type === 'diagram') return [diagram(block.label, block.lines)];
  if (block.type === 'table') return [block.rowIdPrefix ? glossaryList(block.rows, block.rowIdPrefix) : propertyTable(block.label, block.rows, block.plainKeys)];
  if (block.type === 'compare') return [compareTable(block.label, block.columns, block.rows)];
  if (block.type === 'points') return block.items.map(function (item) {
    var p = document.createElement('p');
    p.className = 'guide-text';
    var key = document.createElement('strong');
    key.textContent = item.key + ':';
    p.appendChild(key);
    return inline(p, ' ' + item.text);
  });
  if (block.type === 'steps') return [stepList(block.items)];
  if (block.type === 'info') return [infoBox(block.text)];
  if (block.type === 'text') return [textBlock(block.text)];
  if (block.type === 'links') return block.items.map(function (item) { return guideReference(learnHref(item.href), item.label); });
  return [];
}

export function renderBuildTab() {
  var container = document.getElementById('tab-build');
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap';
  wrap.appendChild(guideJourneyLinks('build'));

  var agentPrompt = document.createElement('p');
  agentPrompt.className = 'guide-agent-prompt';
  agentPrompt.appendChild(document.createTextNode('Building with an agent? '));
  var agentPromptButton = document.createElement('button');
  agentPromptButton.type = 'button';
  agentPromptButton.textContent = 'Copy the Juicebox build prompt';
  var prompt = [
      'I want to build a product or platform on Juicebox V6.',
      '',
      'My product: [describe the users, the value they exchange, and the experience I want].',
      '',
      'Act as my protocol engineer and product architect. Start by reading the Learn and Build sections in this Juicescan bundle, then inspect https://github.com/Bananapus/version-6 and https://github.com/mejango/juicescan. Use only current V6 repositories; do not substitute older Juicebox versions.',
      '',
      'Design the smallest safe architecture that gives my users a native product experience while Juicebox handles the money layer. Decide whether I need a flexible Juicebox project, a revnet with committed economics, or both. Map every user action to exact V6 reads and transactions, including payments, token issuance, cash outs, payouts, shops, hooks, permissions, and multichain settlement where relevant.',
      '',
      'For each transaction, identify the contract, function, arguments, units, permissions, fees, approvals, slippage or minimum-output protection, and the state that must be re-read immediately before signing. Use pure transaction builders which round-trip through the ABI. Show and decode every transaction before asking for a signature.',
      '',
      'Deliver: (1) a plain-language product flow, (2) the onchain architecture, (3) a threat model and trust assumptions, (4) an incremental implementation plan, (5) test cases and invariants, and (6) the first working vertical slice. Keep the interface branded as my product; treat Juicebox as open infrastructure, not a hosted dependency.'
    ].join('\n');
  agentPromptButton.addEventListener('click', function () {
    var copied = function () {
      agentPromptButton.textContent = 'Build prompt copied';
      setTimeout(function () { agentPromptButton.textContent = 'Copy the Juicebox build prompt'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).then(copied, copied);
    else {
      try {
        var textarea = document.createElement('textarea');
        textarea.value = prompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (_) {}
      copied();
    }
  });
  agentPrompt.appendChild(agentPromptButton);
  agentPrompt.appendChild(document.createTextNode('.'));
  wrap.appendChild(agentPrompt);
  var promptDetails = document.createElement('details');
  var promptSummary = document.createElement('summary');
  promptSummary.textContent = 'Read or copy the build prompt';
  promptDetails.appendChild(promptSummary);
  promptDetails.appendChild(codeBlock('Juicebox V6 build prompt', prompt));
  wrap.appendChild(promptDetails);

  // --- Table of Contents ---
  var toc = document.createElement('nav');
  toc.className = 'guide-toc';
  toc.innerHTML =
    '<div class="guide-toc-title">TABLE OF CONTENTS</div>' +
    '<div class="guide-toc-group-label">Life of a Project</div>' +
    '<a class="guide-toc-link" href="#build-launch">1. Launch</a>' +
    '<a class="guide-toc-link" href="#build-configure">2. Read a Project</a>' +
    '<a class="guide-toc-link" href="#build-fund">3. Get Funded</a>' +
    '<a class="guide-toc-link" href="#build-tokens-mgmt">4. Manage Tokens</a>' +
    '<a class="guide-toc-link" href="#build-distribute">5. Send Payouts and Reserved Tokens</a>' +
    '<a class="guide-toc-link" href="#build-cashout">6. Cash Out</a>' +
    '<a class="guide-toc-link" href="#build-evolve">7. Change the Rules</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">Life of a Revnet</div>' +
    '<a class="guide-toc-link" href="#build-revnet-deploy">8. Deploy</a>' +
    '<a class="guide-toc-link" href="#build-revnet-stages">9. Stages</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">Ecosystem Tools</div>' +
    '<a class="guide-toc-link" href="#build-permissions">10. Permissions</a>' +
    '<a class="guide-toc-link" href="#build-nfts">11. NFT Tiers</a>' +
    '<a class="guide-toc-link" href="#build-hooks">12. Custom Hooks</a>' +
    '<a class="guide-toc-link" href="#build-distributor">13. Distributor</a>' +
    '<a class="guide-toc-link" href="#build-handles">14. Project Handles</a>' +
    '<a class="guide-toc-link" href="#build-payer">15. Payer Address</a>' +
    '<a class="guide-toc-link" href="#build-swap-terminal">16. Router Terminal</a>' +
    '<a class="guide-toc-link" href="#build-buyback">17. Buyback Hook</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">Build Your Own</div>' +
    '<a class="guide-toc-link" href="#build-bendystraw">18. Indexed Data</a>' +
    '<a class="guide-toc-link" href="#build-clients">19. Copy This Site</a>';
  wrap.appendChild(toc);

  // --- Life of a Project ---

  var projectHeader = document.createElement('div');
  projectHeader.className = 'guide-part-header';
  projectHeader.textContent = 'LIFE OF A PROJECT';
  wrap.appendChild(projectHeader);

  wrap.appendChild(guideSection('build-launch', '1. LAUNCH', [
    "JBController.launchProjectFor() creates a project in one transaction:"
  ], [
    stepList([
      'Mints the project NFT to the owner',
      'Queues the first rulesets',
      'Sets the terminals and the tokens they accept',
      'Registers the project in JBDirectory',
    ]),
    codeBlock(
      'JBController.launchProjectFor',
      'launchProjectFor(\n' +
      '  owner,                    // receives the project NFT\n' +
      '  projectUri,               // metadata (name, description, logo)\n' +
      '  rulesetConfigurations[],  // operational parameters\n' +
      '  terminalConfigurations[], // payment processing setup\n' +
      '  memo                      // transaction description\n' +
      ')'
    ),
    infoBox('To connect a project across chains, use JBOmnichainDeployer.launchProjectFor(). It creates the project and its suckers, the local bridge contracts. Run it on each chosen chain.')
  ]));

  wrap.appendChild(guideSection('build-configure', '2. READ A PROJECT', [
    "Read the owner, current rules, accepted tokens, and payout recipients before deciding which actions are available. Use both chain ID and project ID to identify the project."
  ], [
    fnRefTable('READING PROJECT STATE', [
      ['JBProjects.ownerOf(projectId)', 'Who owns the project NFT'],
      ['JBController.uriOf(projectId)', 'Metadata link (name, description, logo)'],
      ['JBController.currentRulesetOf(projectId)', 'Active ruleset and its metadata'],
      ['JBController.upcomingRulesetOf(projectId)', 'What comes next (auto-cycled with weight decay)'],
      ['JBDirectory.terminalsOf(projectId)', 'All active terminals'],
      ['JBDirectory.primaryTerminalOf(projectId, token)', 'Default terminal for a specific token'],
      ['JBMultiTerminal.accountingContextsOf(projectId)', 'Which tokens/currencies are accepted'],
      ['JBSplits.splitsOf(projectId, rulesetId, groupId)', 'Payout and reserved token distribution rules'],
    ]),
    fnRefTable('FUND ACCESS LIMITS', [
      ['JBFundAccessLimits.payoutLimitOf(...)', 'Maximum distributable per cycle per token'],
      ['JBFundAccessLimits.surplusAllowanceOf(...)', 'How much surplus the owner can withdraw'],
    ]),
    infoBox('Empty fundAccessLimitGroups means zero payouts, not unlimited. Use uint224.max for unlimited payouts.')
  ]));

  wrap.appendChild(guideSection('build-fund', '3. GET FUNDED', [
    "A terminal is a contract that accepts project payments. Resolve the current terminal for the token you will pay with, then preview the payment before requesting a signature."
  ], [
    codeBlock(
      'JBMultiTerminal.pay',
      'pay(\n' +
      '  projectId,\n' +
      '  token,              // which token to pay with\n' +
      '  amount,             // how much\n' +
      '  beneficiary,        // who receives the minted tokens\n' +
      '  minReturnedTokens,  // reject a return below this token count\n' +
      '  memo,               // message attached to the payment\n' +
      '  metadata            // extra data for hooks\n' +
      ')\n' +
      '// Returns: number of tokens minted for the beneficiary'
    ),
    fnRefTable('CHECKING BALANCES', [
      ['JBTerminalStore.balanceOf(terminal, projectId, token)', 'Terminal balance for a specific token'],
      ['JBTerminalStore.currentSurplusOf(...)', 'Surplus across specified terminals and tokens'],
      ['JBTerminalStore.currentTotalSurplusOf(...)', 'Surplus aggregated across all terminals'],
    ]),
    infoBox('Use addToBalanceOf() to deposit money without receiving project tokens.')
  ]));

  wrap.appendChild(guideSection('build-tokens-mgmt', '4. MANAGE TOKENS', [
    "Until a project deploys its ERC-20, holders’ tokens are credits, balances recorded inside Juicebox. Once it exists, holders can claim credits as ERC-20 tokens."
  ], [
    fnRefTable('TOKEN OPERATIONS', [
      ['JBController.deployERC20For(projectId, name, symbol, salt)', 'Deploy the project’s ERC-20 token'],
      ['JBTokens.tokenOf(projectId)', 'Get the ERC-20 address (zero if not yet deployed)'],
      ['JBTokens.totalBalanceOf(holder, projectId)', 'Complete holdings (credits + ERC-20)'],
      ['JBTokens.creditBalanceOf(holder, projectId)', 'Internal credits only'],
      ['JBController.claimTokensFor(holder, projectId, count, beneficiary)', 'Convert credits into ERC-20 tokens'],
    ]),
    fnRefTable('MINTING & BURNING', [
      ['JBController.mintTokensOf(projectId, tokenCount, beneficiary, memo, useReservedPercent)', 'Owner mints tokens on demand (if the ruleset allows)'],
      ['JBController.burnTokensOf(holder, projectId, tokenCount, memo)', 'Holder burns their own tokens'],
    ])
  ]));

  wrap.appendChild(guideSection('build-distribute', '5. SEND PAYOUTS AND RESERVED TOKENS', [
    "Payouts send project money to its splits, and reserved tokens send their share of new tokens to theirs. A split names one recipient and its percentage."
  ], [
    codeBlock(
      'JBMultiTerminal.sendPayoutsOf',
      'sendPayoutsOf(\n' +
      '  projectId,\n' +
      '  token,\n' +
      '  amount,              // up to the payout limit\n' +
      '  currency,\n' +
      '  minTokensPaidOut     // slippage protection\n' +
      ')\n' +
      '// Distributes to splits, leftover to project owner'
    ),
    codeBlock(
      'JBController.sendReservedTokensToSplitsOf',
      'sendReservedTokensToSplitsOf(projectId)\n' +
      '// Anyone can call this at any time\n' +
      '// Mints accumulated reserved tokens and distributes to splits'
    ),
    fnRefTable('TRACKING USAGE', [
      ['JBTerminalStore.usedPayoutLimitOf(...)', 'How much of the payout limit has been used this cycle'],
      ['JBTerminalStore.usedSurplusAllowanceOf(...)', 'How much surplus allowance has been used'],
      ['JBController.pendingReservedTokenBalanceOf(projectId)', 'Undistributed reserved tokens'],
    ]),
    infoBox('Anyone can call sendPayoutsOf(). Set ownerMustSendPayouts in the ruleset metadata to restrict it to the project owner.')
  ]));

  wrap.appendChild(guideSection('build-cashout', '6. CASH OUT', [
    "A cash out burns a holder’s tokens and returns a share of the surplus, the money above the unused payout limit.",
    "The cash out tax rate sets how much of that share stays for other holders. 0 returns a proportional share and 1 returns nothing. Preview the cash out before signing: a data hook can change the result."
  ], [
    codeBlock(
      'JBMultiTerminal.cashOutTokensOf',
      'cashOutTokensOf(\n' +
      '  holder,\n' +
      '  projectId,\n' +
      '  cashOutCount,         // how many tokens to burn\n' +
      '  tokenToReclaim,       // which token to receive\n' +
      '  minTokensReclaimed,   // slippage protection\n' +
      '  beneficiary,          // who receives the funds\n' +
      '  metadata\n' +
      ')'
    ),
    guideReference('learn.html#learn-fees', 'See the full cash out calculation and where charges go.', 'build-revnet-fees')
  ]));

  wrap.appendChild(guideSection('build-evolve', '7. CHANGE THE RULES', [
    "To change a project’s rules, queue a replacement ruleset. It starts when the current cycle ends, the requested start time has passed, and any approval hook approves. A ruleset with no duration is replaced as soon as its replacement is eligible."
  ], [
    codeBlock(
      'JBController.queueRulesetsOf',
      'queueRulesetsOf(\n' +
      '  projectId,\n' +
      '  rulesetConfigurations[],  // new parameters\n' +
      '  memo\n' +
      ')\n' +
      '// If an approval hook is configured, it must approve\n' +
      '// the changes before they can activate.'
    ),
    fnRefTable('INSPECTING QUEUED CHANGES', [
      ['JBController.latestQueuedRulesetOf(projectId)', 'Latest ruleset in the queue and its approval status (may already be the active one)'],
      ['JBController.allRulesetsOf(projectId, startingId, size)', 'Complete ruleset history'],
    ])
  ]));

  // --- Life of a Revnet ---

  var revnetHeader = document.createElement('div');
  revnetHeader.className = 'guide-part-header';
  revnetHeader.textContent = 'LIFE OF A REVNET';
  wrap.appendChild(revnetHeader);



  var revnetIntroAlias = document.createElement('span');
  revnetIntroAlias.id = 'build-revnet-what';
  wrap.appendChild(revnetIntroAlias);
  wrap.appendChild(guideSection('build-revnet-deploy', '8. DEPLOY A REVNET', [
    'A revnet fixes its money rules and stage schedule at launch. REVOwner, the contract that owns every revnet, enforces them. A revnet starts with an ERC-20 token, and its operator keeps only the tasks the contracts allow.',
    'Choose the schedule, accepted tokens, and optional features, then call REVDeployer.deployFor().'
  ], [
    codeBlock(
      'REVDeployer.deployFor',
      'deployFor(\n' +
      '  revnetId,                        // project ID (or 0 for auto)\n' +
      '  configuration,                   // REVConfig with stages\n' +
      '  accountingContextsToAccept[],    // tokens the terminal should accept\n' +
      '  suckerDeploymentConfiguration,   // cross-chain setup\n' +
      '  tiered721HookConfiguration,      // optional NFT tiers\n' +
      '  allowedPosts[]                   // optional croptop posts\n' +
      ')'
    ),
    textBlock('A revnet uses the same pay(), cashOutTokensOf(), and read functions as any other project.')
  ]));

  wrap.appendChild(guideSection('build-revnet-stages', '9. STAGES', [
    "A stage sets the token rate, how it changes over time, the split, and the cash out tax. Each stage begins at the time fixed at launch."
  ], [
    fnRefTable('READING STAGE STATE', [
      ['JBController.currentRulesetOf(projectId)', 'Active stage parameters'],
      ['JBController.upcomingRulesetOf(projectId)', 'Next stage (empty if none is queued)'],
      ['JBController.allRulesetsOf(projectId, startingId, size)', 'Complete stage history'],
    ]),
  ]));



  // --- Ecosystem Tools ---

  var ecoHeader = document.createElement('div');
  ecoHeader.className = 'guide-part-header';
  ecoHeader.textContent = 'ECOSYSTEM TOOLS';
  wrap.appendChild(ecoHeader);

  wrap.appendChild(guideSection('build-permissions', '10. PERMISSIONS', [
    "To let another account perform a task, grant it a permission through JBPermissions. Each permission has an ID; the contract stores the grants as bits in a 256-bit field."
  ], [
    codeBlock(
      'JBPermissions.setPermissionsFor',
      'setPermissionsFor(\n' +
      '  account,         // the address granting permission\n' +
      '  permissionsData  // { operator, projectId, permissionIds[] }\n' +
      ')\n' +
      '// projectId = 0 is the wildcard: every project `account` controls on this chain'
    ),
    fnRefTable('CHECKING PERMISSIONS', [
      ['JBPermissions.hasPermission(operator, account, projectId, permissionId, includeRoot, includeWildcard)', 'Check a single permission'],
      ['JBPermissions.hasPermissions(operator, account, projectId, permissionIds[], includeRoot, includeWildcard)', 'Check multiple permissions at once'],
      ['JBPermissions.WILDCARD_PROJECT_ID()', 'Returns 0, the wildcard project ID'],
    ]),
    propertyTable('PERMISSION IDS', [
      ['1 - ROOT', 'Grants all permissions. Use with extreme care.'],
      ['2 - QUEUE_RULESETS', 'Queue new rulesets for the project.'],
      ['3 - LAUNCH_RULESETS', 'Launch the project’s first rulesets.'],
      ['4 - CASH_OUT_TOKENS', 'Cash out (redeem) project tokens on a holder’s behalf.'],
      ['5 - SEND_PAYOUTS', 'Trigger payout distributions.'],
      ['6 - MIGRATE_TERMINAL', 'Migrate funds to a new terminal.'],
      ['7 - SET_PROJECT_URI', 'Update project metadata.'],
      ['8 - DEPLOY_ERC20', 'Deploy the project’s ERC-20 token.'],
      ['9 - SET_TOKEN', 'Set a custom token for the project.'],
      ['10 - MINT_TOKENS', 'Mint tokens on demand.'],
      ['11 - BURN_TOKENS', 'Burn tokens from another holder.'],
      ['12 - CLAIM_TOKENS', 'Claim credits into ERC-20 tokens for a holder.'],
      ['13 - TRANSFER_CREDITS', 'Transfer a holder’s unclaimed credits.'],
      ['14 - SET_CONTROLLER', 'Change the project controller.'],
      ['15 - SET_TERMINALS', 'Set the project’s terminals.'],
      ['16 - ADD_TERMINALS', 'Add terminals to the project.'],
      ['17 - SET_PRIMARY_TERMINAL', 'Set the primary terminal for a token.'],
      ['18 - USE_ALLOWANCE', 'Withdraw surplus via the surplus allowance.'],
      ['19 - SET_SPLIT_GROUPS', 'Modify payout and reserved token splits.'],
      ['20 - ADD_PRICE_FEED', 'Add a price feed for a currency pair.'],
      ['21 - ADD_ACCOUNTING_CONTEXTS', 'Add accounting contexts (accepted tokens) to a terminal.'],
      ['22 - SET_TOKEN_METADATA', 'Set the project token’s name and symbol.'],
      ['23 - SIGN_FOR_ERC20', 'Sign ERC-20 permit approvals on the project’s behalf.'],
      ['24 - ADJUST_721_TIERS', 'Add or remove tiers on a 721 hook.'],
      ['25 - SET_721_METADATA', 'Update a 721 hook’s metadata (base URI, resolver, contract URI).'],
      ['26 - MINT_721', 'Mint NFTs directly, without a payment.'],
      ['27 - SET_721_DISCOUNT_PERCENT', 'Set the 721 hook’s discount percent.'],
      ['28 - SET_BUYBACK_TWAP', 'Set the buyback hook’s TWAP window.'],
      ['29 - SET_BUYBACK_POOL', 'Set the buyback hook’s Uniswap pool.'],
      ['30 - SET_BUYBACK_HOOK', 'Set which buyback hook the registry routes the project to.'],
      ['31 - SET_ROUTER_TERMINAL', 'Configure the project’s router terminal.'],
      ['32 - MAP_SUCKER_TOKEN', 'Map a token across a sucker pair.'],
      ['33 - DEPLOY_SUCKERS', 'Deploy cross-chain suckers for the project.'],
      ['34 - SET_SUCKER_PEER', 'Set a sucker’s cross-chain peer.'],
      ['35 - SUCKER_SAFETY', 'Emergency token recovery on a sucker.'],
      ['36 - SET_SUCKER_DEPRECATION', 'Deprecate a sucker.'],
      ['37 - OPEN_LOAN', 'Open a REVLoans loan against project tokens.'],
      ['38 - REALLOCATE_LOAN', 'Move collateral between loans. Also borrows the full current capacity.'],
      ['39 - REPAY_LOAN', 'Repay a loan on a holder’s behalf.'],
    ]),
    infoBox('A grant covers one operator and one project. QUEUE_RULESETS for project 5 gives no access to project 6.')
  ]));

  wrap.appendChild(guideSection('build-nfts', '11. NFT TIERS', [
    "To give payers digital items, add a tiered NFT contract with JB721TiersHook. It runs during payment as a pay hook. Payers select tiers in the payment metadata and receive the items their payment covers."
  ], [
    codeBlock(
      'JB721TiersHookProjectDeployer.launchProjectFor',
      'launchProjectFor(\n' +
      '  owner,\n' +
      '  deployTiersHookConfig,    // NFT name, symbol, tiers[]\n' +
      '  launchProjectConfig,      // standard project config\n' +
      '  controller,\n' +
      '  salt                      // CREATE2 salt for a deterministic hook address (0 for none)\n' +
      ')\n' +
      '// Always use this deployer, even with empty tiers'
    ),
    propertyTable('TIER CONFIGURATION', [
      ['price', 'What one NFT of this tier costs.'],
      ['initialSupply', 'Max NFTs available. Must be at least 1; capped at 999,999,999. 0 is rejected.'],
      ['category', 'Grouping ID. Tiers must be sorted by category, ascending.'],
      ['reserveFrequency', 'Mint 1 reserved NFT every N minted.'],
      ['reserveBeneficiary', 'Who receives reserved NFTs.'],
      ['votingUnits', 'Governance weight (via JB721Checkpoints). Applies only when the tier’s flags.useVotingUnits is set. Otherwise voting power tracks the tier price.'],
      ['encodedIpfsUri', 'IPFS content hash for metadata.'],
      ['flags.cantBeRemoved', 'If true, tier is permanent (one of the nested flags: allowOwnerMint, useVotingUnits, transfersPausable, cantBeRemoved, …).'],
    ]),
    fnRefTable('READING NFT STATE', [
      ['JB721TiersHookStore.tiersOf(hook, categories[], includeResolvedUri, startId, size)', 'List tiers with optional filters'],
      ['JB721TiersHookStore.tierOf(hook, tierId, includeResolvedUri)', 'Single tier details'],
      ['JB721TiersHook.balanceOf(owner)', 'NFTs held by an address'],
      ['JB721TiersHook.cashOutWeightOf(tokenIds[])', 'Cash out weight of specific NFTs (divide by totalCashOutWeight() for the surplus fraction)'],
    ]),
    infoBox('Tiers are sorted by category, not price. The contract reverts with InvalidCategorySortOrder if they are submitted out of order.')
  ]));

  wrap.appendChild(guideSection('build-hooks', '12. CUSTOM HOOKS', [
    "A hook is a contract the project calls during a payment, cash out, payout, or rule change. Choose the interface for the step you need."
  ], [
    propertyTable('HOOK INTERFACES', [
      ['IJBRulesetDataHook', 'Intercepts pay and cash out before state changes. Can override the weight (pay) or the cash out tax rate / effective counts (cash out), and specify pay and cash out hook specifications.'],
      ['IJBPayHook', 'Called after the payment is recorded and tokens are minted. Use for rewards, notifications, side effects.'],
      ['IJBCashOutHook', 'Called after tokens are burned and funds are transferred. Use for cleanup, analytics, conditional logic.'],
      ['IJBSplitHook', 'Called when a split routes funds to a hook address. Use for auto-investing, compounding, forwarding.'],
      ['IJBRulesetApprovalHook', 'Gates queued rulesets. Must return APPROVED before a queued ruleset can activate.'],
    ]),
    codeBlock(
      'IJBPayHook interface',
      'function afterPayRecordedWith(\n' +
      '  JBAfterPayRecordedContext calldata context\n' +
      ') external payable;\n' +
      '\n' +
      '// context includes:\n' +
      '//   payer, projectId, rulesetId, amount,\n' +
      '//   forwardedAmount, weight, newlyIssuedTokenCount,\n' +
      '//   beneficiary, hookMetadata, payerMetadata'
    ),
    infoBox('Data hooks run before state changes and can override values. Pay and cash out hooks run after and are for side effects only.')
  ]));

  wrap.appendChild(guideSection('build-distributor', '13. DISTRIBUTOR', [
    "A distributor shares deposited rewards with eligible holders in rounds, and each round’s rewards vest over time. JBTokenDistributor uses token voting power; JB721Distributor uses NFT holdings.",
    "Each round takes a snapshot of holdings at one block and calculates every share from it. Deposits come directly or through a split hook."
  ], [
    fnRefTable('CORE FUNCTIONS', [
      ['fund(hook, token, amount)', 'Directly deposit reward tokens for a specific hook’s staker pool'],
      ['beginVesting(hook, tokenIds[], tokens[])', 'Snapshot and begin vesting for the specified token IDs'],
      ['collectVestedRewards(hook, tokenIds[], tokens[], beneficiary)', 'Collect unlocked vested tokens (auto-vests current round too)'],
      ['releaseForfeitedRewards(hook, tokenIds[], tokens[], beneficiary)', 'Return unvested rewards from burned tokens to the pool'],
      ['poke()', 'Record the snapshot block for the current round early'],
    ]),
    fnRefTable('READ STATE', [
      ['balanceOf(hook, token)', 'Balance held for a hook’s staker pool'],
      ['collectableFor(hook, tokenId, token)', 'How much is unlocked and ready to collect right now'],
      ['claimedFor(hook, tokenId, token)', 'Total uncollected amount (vesting + vested-but-uncollected)'],
      ['currentRound()', 'The current round number'],
      ['roundSnapshotBlock(round)', 'The block number used for stake weight lookups'],
    ]),
    infoBox('Token holders count only after delegating their votes, including to themselves. A share is the holder’s votes (IVotes.getPastVotes, or tier voting units for NFTs) over IJBActiveVotes.getPastTotalActiveVotes at the snapshot block.')
  ]));

  wrap.appendChild(guideSection('build-handles', '14. PROJECT HANDLES', [
    'JBProjectHandles maps ENS names to project IDs. A handle needs two matching records: the project names the ENS name, and the name’s juicebox text record names the project. handleOf() returns only handles where both match.',
    'Every function takes a chainId. Storage is keyed by the setter address, so several addresses can propose different handles for one project.'
  ], [
    fnRefTable('HANDLE FUNCTIONS', [
      ['setEnsNamePartsFor(chainId, projectId, parts[])', 'Associate ENS name parts with a project. Anyone can call this.'],
      ['ensNamePartsOf(chainId, projectId, setter)', 'Get the stored name parts as set by a specific setter address.'],
      ['handleOf(chainId, projectId, setter)', 'Returns the verified handle string, or empty if ENS text record doesn’t match.'],
      ['TEXT_KEY', 'The ENS text record key: "juicebox". Expected value: "{chainId}:{projectId}".'],
    ]),
    textBlock('Store name parts innermost-last: myproject.eth is ["myproject"], and sub.myproject.eth is ["myproject", "sub"]. handleOf returns the labels joined by dots, without .eth. A part cannot be empty, be "eth", or contain dots or control characters. Normalize names (ENSIP-15) before storing; the contract does not.')
  ]));

  wrap.appendChild(guideSection('build-payer', '15. PAYER ADDRESS', [
    "A payer address forwards incoming ETH to a project using saved settings. Deploy JBProjectPayer as a clone of its implementation, then set its defaults with initialize() or setDefaultValues().",
    "With defaultAddToBalance false, ETH triggers pay(); with true, it triggers addToBalanceOf() without creating tokens. An unset beneficiary defaults to the sender. For ERC-20 tokens, approve spending and call pay() or addToBalanceOf(); a direct token transfer does not trigger either."
  ], [
    codeBlock(
      'JBProjectPayer defaults',
      '// Set via initialize() after clone deployment:\n' +
      'defaultProjectId       // which project to forward to\n' +
      'defaultBeneficiary     // who gets the tokens (0 = msg.sender)\n' +
      'defaultMemo            // attached to each payment\n' +
      'defaultMetadata        // extra data for hooks\n' +
      'defaultAddToBalance    // false = pay(), true = addToBalance()\n' +
      '\n' +
      '// Anyone sends ETH to the payer address:\n' +
      '//   → receive() fires\n' +
      '//   → looks up DIRECTORY.primaryTerminalOf(projectId, token)\n' +
      '//   → calls pay() or addToBalanceOf() with defaults'
    ),
    infoBox('The payer address looks up the terminal in JBDirectory at payment time, so it follows terminal migrations.')
  ]));

  wrap.appendChild(guideSection('build-swap-terminal', '16. ROUTER TERMINAL', [
    "JBRouterTerminal exchanges a token the project does not accept for one it does, then forwards the payment. The payment fails when no route exists.",
    "JBPayRouteResolver compares supported routes and estimates which returns the most project tokens. It can use a direct payment, a Uniswap trade, a cash out from another project, or a combination. The output token can differ between payments."
  ], [
    fnRefTable('ROUTER TERMINAL FUNCTIONS', [
      ['pay(...)', 'Same IJBTerminal interface as JBMultiTerminal. Resolves the best route, converts the input, then calls pay() on the destination terminal.'],
      ['addToBalanceOf(...)', 'Same as pay() but forwards via addToBalanceOf() on the destination terminal (no token minting).'],
      ['previewPayFor(...)', 'Preview the chosen route and expected output for a payment without executing it.'],
      ['pendingCallCount(), pendingCallCommitmentOf(id), pendingCallFailureOf(id)', 'Inspect gateway calls that retain custody after a failed protocol-fee route. Count is an ID counter; a nonzero commitment identifies an outstanding call.'],
      ['processPendingCall[WithGas](...), finalizePendingCall[WithGas](...)', 'Retry or finalize a committed gateway call using its original event payload. Review QueuePendingCall, ProcessPendingCall, RefundPendingCall, and RecordTerminalCallFailure to distinguish retained, settled, and refunded funds.'],
      ['bestPoolLiquidityOf(tokenA, tokenB)', 'Report the deepest-liquidity Uniswap pool the router would use for a pair.'],
    ]),
    textBlock('Read terminalOf(projectId) on JBRouterTerminalRegistry, the terminal a project lists in JBDirectory alongside JBMultiTerminal. If it returns a JBRouterTerminalGateway, read ROUTER() for the router. The gateway takes custody before routing. Routes are chosen per payment; a project configures no pool.'),
    textBlock('Check each chain’s deployment record before relying on the router: OP Sepolia has the ratio price feed only.')
  ]));

  wrap.appendChild(guideSection('build-buyback', '17. BUYBACK HOOK', [
    "JBBuybackHook compares creating new tokens with buying them from its configured Uniswap V4 pool. It also compares project cash outs with selling into that pool.",
    "The default minimum return is the pool’s time-weighted average price (TWAP) over a chosen window. Payment metadata under getId('pay', hook) encodes (uint256 amountToSwapWith, uint256 minimumSwapAmountOut, bool skipSplits). A swap below the TWAP floor mints instead. Older hook generations use other formats, so read the project’s live hook before preparing metadata."
  ], [
    codeBlock(
      'JBBuybackHook configuration',
      '// Set up the buyback hook with a Uniswap V4 pool\n' +
      'JBBuybackHook.setPoolFor(\n' +
      '  projectId,\n' +
      '  fee,              // Uniswap pool fee tier\n' +
      '  tickSpacing,      // pool tick spacing\n' +
      '  twapWindow,       // TWAP observation window (seconds)\n' +
      '  terminalToken     // the terminal token to route\n' +
      ')\n' +
      '// The pool key is once-only; the TWAP window stays mutable via setTwapWindowOf\n' +
      '// Requires SET_BUYBACK_POOL permission'
    ),
    diagram('BUYBACK DECISION FLOW', [
      '  payment arrives',
      '     │',
      '     ▼',
      '  query TWAP oracle for market price',
      '     │',
      '     ├─ pool gives more tokens than minting',
      '     │  └─▶ swap on Uniswap V4, mint any unswapped remainder',
      '     │',
      '     └─ minting gives equal or more tokens',
      '        └─▶ normal mint flow (weight × amount)',
    ]),
    infoBox('Preview the payment and set a minimum return. The hook compares minting with one pool, not with every market.')
  ]));

  // --- Build Your Own ---
  var ownHeader = document.createElement('div');
  ownHeader.className = 'guide-part-header';
  ownHeader.textContent = 'BUILD YOUR OWN';
  wrap.appendChild(ownHeader);

  wrap.appendChild(guideSection('build-bendystraw', '18. INDEXED DATA (BENDYSTRAW)', [
    "Bendystraw indexes contract events and serves project lists, activity, charts, and holdings through GraphQL.",
    "Use it for browsing. Before a wallet signs, read balances, rules, approvals, and quotes from the chain: the indexer can be behind or incomplete."
  ], [
    fnRefTable('ENDPOINTS', [
      [BENDYSTRAW_GRAPHQL_ENDPOINTS.mainnet, 'Mainnets: Ethereum, Base, Arbitrum, Optimism. No API key needed'],
      [BENDYSTRAW_GRAPHQL_ENDPOINTS.testnet, 'Testnets: Sepolia and the L2 Sepolias'],
      ['…/schema', 'A playground with the schema explorer; POST an introspection query to the graphql URL for codegen (same schema on both databases)'],
    ]),
    codeBlock(
      'A first query',
      'POST ' + BENDYSTRAW_GRAPHQL_ENDPOINTS.mainnet + '\n' +
      '{\n' +
      '  projects(where: { chainId: 8453, version: 6 }, orderBy: "balanceUsd", orderDirection: "desc", limit: 10) {\n' +
      '    items { projectId chainId name balanceUsd suckerGroupId }\n' +
      '    totalCount\n' +
      '  }\n' +
      '}'
    ),
    fnRefTable('WHAT TO ASK IT FOR', [
      ['projects / project(chainId, projectId)', 'Name, metadata URI, balance, token, owner, and the sucker group that links its chains'],
      ['payEvents, cashOutTokensEvents, activityEvents', 'The feed behind any project page; filter by projectId or suckerGroupId'],
      ['participants', 'Token holders and their balances, per project or per sucker group'],
      ['buybackPools, swapEvents, buybackPoolPositions', 'The AMM: pool identity, every trade’s post-trade price, and every LP range'],
      ['loans, borrowLoanEvents', 'Revnet loans and their collateral'],
      ['nftTiers, mintNftEvents', '721 shop tiers and purchases'],
      ['suckerTransactions', 'Cross-chain moves and where each one is in its lifecycle'],
    ]),
    stepList([
      'Every V6 row is versioned: filter with version: 6, and key a project by chainId and projectId, never projectId alone. The same number exists on every chain.',
      'Numeric arguments on singular queries are Float!, not Int! (Ponder’s choice). Declare variables as Float! or the request fails validation with no data.',
      'Lists page with limit and offset and return totalCount; loop until you have them all rather than trusting one page.',
      'suckerGroupId is as-of-event: when chains are linked later, old event rows keep the group id they were written with. Query by every project in the group when you need the full history.',
      'The SDK’s requestBendystraw(endpoint, query, variables) handles the POST, error surfacing, and endpoint normalisation; selectBendystrawEndpoint picks mainnet vs testnet from a chainId.',
    ]),
    infoBox('Building with an agent? The /jb-bendystraw skill in the Juicebox V6 skills library carries the schema and the query patterns above. Hand it over before asking for a feed, chart, or holder table.')
  ]));

  wrap.appendChild(guideSection('build-clients', '19. COPY THIS SITE', [
    "This explorer is static files on IPFS. It reads chain RPCs and Bendystraw, and builds every transaction in the browser."
  ], [
    stepList([
      'In Discover, click the link icon at the bottom of a card, such as Pay, to copy a prompt naming its source file and contract function. In Learn and Build, the icon by a section heading copies its link.',
      'Paste it to your LLM and ask: "Recreate this against the Juicebox V6 contracts."',
      'Give it the two repositories below. The transaction coverage record in this site’s repository lists the function each action calls.',
      'Keep the pattern: every transaction is a pure buildXArgs() that a test round-trips through the contract ABI.'
    ]),
    (function () {
      var box = document.createElement('p'); box.className = 'guide-text';
      box.appendChild(document.createTextNode('Reference: '));
      var lk = function (href, text) { var a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; return a; };
      box.appendChild(lk('https://github.com/mejango/juicescan', 'this site’s source'));
      box.appendChild(document.createTextNode(' and '));
      box.appendChild(lk('https://github.com/Bananapus/version-6', 'the V6 contracts'));
      box.appendChild(document.createTextNode('.'));
      return box;
    })()
  ]));

  container.appendChild(wrap);
  initSmoothScroll(container);
}

export function renderWhyTab() {
  var container = document.getElementById('tab-why');
  if (!container) return;
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap why-wrap why-wants';

  var hero = document.createElement('div');
  hero.className = 'why-hero';

  var kicker = document.createElement('div');
  kicker.className = 'why-kicker';
  kicker.textContent = 'WHY JUICEBOX?';
  hero.appendChild(kicker);

  var title = document.createElement('div');
  title.className = 'why-title';
  title.textContent = 'What projects get with Juicebox';
  hero.appendChild(title);

  wrap.appendChild(hero);

  var wants = [
    "Payments from any app or chain",
    "Tokens for supporters",
    "Rules anyone can check",
    "Flexible rules or a committed schedule",
    "Your own site and tools",
    "Open code"
  ];

  var list = document.createElement('div');
  list.className = 'why-wants-list';
  for (var i = 0; i < wants.length; i++) {
    var w = document.createElement('p');
    w.className = 'why-want';
    w.textContent = wants[i];
    list.appendChild(w);
  }
  wrap.appendChild(list);

  container.appendChild(wrap);
}

// --- Helper builders ---

function guideJourneyLinks(guide) {
  var nav = document.createElement('nav');
  nav.className = 'guide-text';
  nav.setAttribute('aria-label', 'Learn, build, and inspect a payment');
  [
    ['https://juicebox.money/learn#learn-before-you-pay', 'Understand a payment'],
    ['https://juicebox.money/build/first-payment', 'Read, pay on testnet, and verify'],
    ['https://revnet.money/learn#three-prices', 'Understand revnet prices'],
    [guide === 'learn' ? '#learn-glossary' : 'learn.html#learn-glossary', 'Glossary'],
    [guide + '.html', 'Read this guide without JavaScript'],
  ].forEach(function (item) {
    var p = document.createElement('p');
    var a = document.createElement('a');
    a.href = item[0];
    a.textContent = item[1];
    p.appendChild(a);
    nav.appendChild(p);
  });
  return nav;
}

function guideReference(href, label, id) {
  var p = document.createElement('p');
  p.className = 'guide-text';
  if (id) p.id = id;
  var link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  p.appendChild(link);
  return p;
}

function glossaryList(rows, idPrefix) {
  var list = document.createElement('dl');
  list.className = 'guide-glossary';
  rows.forEach(function (row) {
    var term = document.createElement('dt');
    term.id = rowId(idPrefix, row[0]);
    term.textContent = row[0];
    var meaning = document.createElement('dd');
    meaning.textContent = row[1];
    list.appendChild(term);
    list.appendChild(meaning);
  });
  return list;
}

// A small link icon next to a section header that copies a deep link to that section (paste to an LLM).
function sectionLinkButton(id) {
  var btn = document.createElement('button');
  btn.className = 'guide-copy-link';
  btn.type = 'button';
  btn.title = 'Copy a link to this section';
  btn.setAttribute('aria-label', 'Copy link to this section');
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  btn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    var url = location.origin + location.pathname + location.search + '#' + id;
    var ok = function () { btn.classList.add('guide-copy-link--ok'); btn.title = 'Copied'; setTimeout(function () { btn.classList.remove('guide-copy-link--ok'); btn.title = 'Copy a link to this section'; }, 1300); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, ok);
    else { try { var ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (_) {} ok(); }
  });
  return btn;
}

function guideSection(id, title, paragraphs, extras) {
  var section = document.createElement('div');
  section.className = 'guide-section';
  section.id = id;

  var h = document.createElement('h2');
  h.className = 'guide-section-title';
  var titleSpan = document.createElement('span');
  titleSpan.textContent = title;
  h.appendChild(titleSpan);
  // Copy a deep link to this section — paste it to an LLM ("recreate this feature against the V6 contracts")
  // or share it. The link routes back to this tab + scrolls here (see applyHash in app.js).
  h.appendChild(sectionLinkButton(id));
  section.appendChild(h);

  for (var i = 0; i < paragraphs.length; i++) {
    var p = document.createElement('p');
    p.className = 'guide-text';
    section.appendChild(inline(p, paragraphs[i]));
  }

  if (extras) {
    for (var j = 0; j < extras.length; j++) {
      section.appendChild(extras[j]);
    }
  }

  return section;
}

function diagram(label, lines) {
  var el = document.createElement('div');
  el.className = 'guide-diagram';
  // Diagrams scroll horizontally on narrow screens. Make that viewport
  // keyboard-reachable instead of trapping the content behind touch input.
  el.tabIndex = 0;
  var title = document.createElement('div');
  title.className = 'guide-diagram-title';
  title.textContent = label;
  el.appendChild(title);
  var pre = document.createElement('pre');
  pre.className = 'guide-diagram-pre';
  pre.textContent = lines.join('\n');
  el.appendChild(pre);
  return el;
}

function propertyTable(label, rows, plainKeys) {
  var el = document.createElement('div');
  el.className = 'guide-prop-table';
  if (label) {
    var title = document.createElement('div');
    title.className = 'guide-prop-title';
    title.textContent = label;
    el.appendChild(title);
  }
  for (var i = 0; i < rows.length; i++) {
    var row = document.createElement('div');
    row.className = 'guide-prop-row';
    var name = document.createElement('code');
    name.className = plainKeys ? 'guide-prop-name guide-prop-name-plain' : 'guide-prop-name';
    name.textContent = rows[i][0];
    var desc = document.createElement('span');
    desc.className = 'guide-prop-desc';
    desc.textContent = rows[i][1];
    row.appendChild(name);
    row.appendChild(desc);
    el.appendChild(row);
  }
  return el;
}

function fnRefTable(label, rows) {
  var el = document.createElement('div');
  el.className = 'guide-fn-table';
  if (label) {
    var title = document.createElement('div');
    title.className = 'guide-fn-title';
    title.textContent = label;
    el.appendChild(title);
  }
  for (var i = 0; i < rows.length; i++) {
    var row = document.createElement('div');
    row.className = 'guide-fn-row';
    var fn = document.createElement('code');
    fn.className = 'guide-fn-name';
    fn.textContent = rows[i][0];
    var desc = document.createElement('span');
    desc.className = 'guide-fn-desc';
    desc.textContent = rows[i][1];
    row.appendChild(fn);
    row.appendChild(desc);
    el.appendChild(row);
  }
  return el;
}

function codeBlock(label, code) {
  var el = document.createElement('div');
  el.className = 'guide-code';
  // Long examples scroll horizontally at phone widths; expose that scroll
  // region to keyboard and assistive-technology users as well.
  el.tabIndex = 0;
  if (label) {
    var title = document.createElement('div');
    title.className = 'guide-code-title';
    title.textContent = label;
    el.appendChild(title);
  }
  var pre = document.createElement('pre');
  pre.className = 'guide-code-pre';
  pre.textContent = code;
  el.appendChild(pre);
  return el;
}

function infoBox(text) {
  var el = document.createElement('div');
  el.className = 'guide-info';
  return inline(el, text);
}

function textBlock(text) {
  var p = document.createElement('p');
  p.className = 'guide-text';
  return inline(p, text);
}

function stepList(items) {
  var el = document.createElement('div');
  el.className = 'guide-steps';
  for (var i = 0; i < items.length; i++) {
    var step = document.createElement('div');
    step.className = 'guide-step';
    var num = document.createElement('span');
    num.className = 'guide-step-num';
    num.textContent = (i + 1);
    var text = document.createElement('span');
    text.className = 'guide-step-text';
    inline(text, items[i]);
    step.appendChild(num);
    step.appendChild(text);
    el.appendChild(step);
  }
  return el;
}

function initSmoothScroll(container) {
  container.querySelectorAll('.guide-toc-link').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var targetId = link.getAttribute('href').slice(1);
      var target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}
