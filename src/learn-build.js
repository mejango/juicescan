// src/learn-build.js
// Learn & Build tab content — engaging walkthrough of the Juicebox protocol

export function renderLearnTab() {
  var container = document.getElementById('tab-learn');
  container.innerHTML = '';

  var wipBanner = document.createElement('div');
  wipBanner.className = 'discover-header';
  wipBanner.textContent = 'Work in progress';
  container.appendChild(wipBanner);

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap';

  // --- Table of Contents ---
  var toc = document.createElement('nav');
  toc.className = 'guide-toc';
  toc.innerHTML =
    '<div class="guide-toc-title">TABLE OF CONTENTS</div>' +
    '<div class="guide-toc-group-label">The Basics</div>' +
    '<a class="guide-toc-link" href="#learn-what">1. What is Juicebox?</a>' +
    '<a class="guide-toc-link" href="#learn-how">2. How It Works</a>' +
    '<a class="guide-toc-link" href="#learn-projects">3. Projects</a>' +
    '<a class="guide-toc-link" href="#learn-revnets">4. Revnets</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">Going Deeper</div>' +
    '<a class="guide-toc-link" href="#learn-rulesets">5. Rulesets</a>' +
    '<a class="guide-toc-link" href="#learn-tokens">6. Tokens</a>' +
    '<a class="guide-toc-link" href="#learn-splits">7. Splits &amp; Payouts</a>' +
    '<a class="guide-toc-link" href="#learn-fees">8. Fees</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">Under the Hood</div>' +
    '<a class="guide-toc-link" href="#learn-architecture">9. Architecture</a>' +
    '<a class="guide-toc-link" href="#learn-hooks">10. Hooks &amp; Extensions</a>' +
    '<a class="guide-toc-link" href="#learn-omnichain">11. Omnichain</a>' +
    '<a class="guide-toc-link" href="#learn-prices">12. Price Feeds</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">The Ecosystem</div>' +
    '<a class="guide-toc-link" href="#learn-permissions">13. Permissions</a>' +
    '<a class="guide-toc-link" href="#learn-nfts">14. NFT Rewards</a>' +
    '<a class="guide-toc-link" href="#learn-croptop">15. Croptop</a>' +
    '<a class="guide-toc-link" href="#learn-buyback">16. Buyback Hook</a>' +
    '<a class="guide-toc-link" href="#learn-loans">17. Loans</a>' +
    '<a class="guide-toc-link" href="#learn-migration">18. Migration</a>' +
    '<a class="guide-toc-link" href="#learn-distributor">19. Distributor</a>' +
    '<a class="guide-toc-link" href="#learn-handles">20. Project Handles</a>' +
    '<a class="guide-toc-link" href="#learn-payer">21. Project Payer</a>';
  wrap.appendChild(toc);

  // ============================================
  // THE BASICS — normie-friendly, no jargon
  // ============================================

  var basicsHeader = document.createElement('div');
  basicsHeader.className = 'guide-part-header';
  basicsHeader.textContent = 'THE BASICS';
  wrap.appendChild(basicsHeader);

  wrap.appendChild(guideSection('learn-what', '1. WHAT IS JUICEBOX?', [
    'Juicebox is a programmable treasury for the open internet. Anyone can create a project, accept payments, and distribute funds according to rules they define — all without middlemen.',
    'People who pay into a project get tokens in return. Those tokens represent their stake. If the project has money in its treasury beyond what it needs for payouts, token holders can cash out their tokens to reclaim a portion of that extra money (called "surplus").',
    'Projects can accept any currency, operate across multiple blockchains, and customize every aspect of how money flows in and out. Tokens can be programmed to serve any purpose — governance votes, membership access, revenue shares, or just a way to track participation.'
  ], []));

  wrap.appendChild(guideSection('learn-how', '2. HOW IT WORKS', [
    'There are really only two core actions: pay and cash out. Everything else is configuration around those two things.'
  ], [
    diagram('THE BASIC LOOP', [
      '  1. Someone PAYS into a project',
      '     └─▶ They receive project tokens',
      '',
      '  2. The project DISTRIBUTES payouts',
      '     └─▶ To team members, partners, other projects',
      '',
      '  3. Token holders can CASH OUT',
      '     └─▶ Burn tokens, reclaim a share of what\'s left',
      '',
      '  surplus = treasury balance - payout commitments',
      '  cash out value = your tokens\' share of the surplus',
    ]),
    textBlock('The project owner configures rules that determine how much to pay out, how many tokens to issue per payment, and what the cash out terms look like. These rules can evolve over time through "rulesets" — scheduled configurations that automatically take effect.'),
    textBlock('Each step is infinitely customizable via pay hooks, cash out hooks, and split hooks — contracts that run custom logic whenever payments come in, tokens are redeemed, or funds are distributed.'),
    textBlock('A 2.5% fee is charged on payouts and certain cash outs. This fuels the JBX growth network, which fee payers automatically participate in — JBX runs on Juicebox itself.')
  ]));

  wrap.appendChild(guideSection('learn-projects', '3. PROJECTS', [
    'A Juicebox project is like a treasury with programmable rules. Each project is represented by an NFT — whoever holds the NFT controls the project.',
    'Projects can accept any token (ETH, stablecoins, etc.) and can operate on multiple chains simultaneously. The project owner sets the rules, but the protocol enforces them automatically — no trust required.',
    'Anyone can create a project. There are no gatekeepers and no approval processes.'
  ], [
    diagram('WHAT A PROJECT DOES', [
      '  ┌───────────────────────────────────────────────┐',
      '  │  YOUR PROJECT                                  │',
      '  │                                                │',
      '  │  accepts payments ──▶ issues tokens            │',
      '  │  holds a treasury ──▶ distributes payouts      │',
      '  │  tracks surplus   ──▶ enables cash outs        │',
      '  │                                                │',
      '  │  rules set by owner, enforced by protocol      │',
      '  └───────────────────────────────────────────────┘',
    ])
  ]));

  wrap.appendChild(guideSection('learn-revnets', '4. REVNETS', [
    'A revnet (revenue network) is a special kind of project where the rules are permanently locked at launch. Nobody — not even the creator — can change them.',
    'This makes revnets ideal for protocols, tokens, and any situation where trust needs to be minimized. The token price, issuance schedule, and cash out terms are all predetermined and immutable.',
    'Revnets progress through "stages" — think of them as chapters in a financial lifecycle. Early stages might issue lots of tokens to attract participation, later stages tighten supply to create scarcity.'
  ], [
    diagram('PROJECT vs REVNET', [
      '  PROJECT                          REVNET',
      '  ───────                          ──────',
      '  owner controls rules             rules locked forever',
      '  flexible governance              zero trust required',
      '  good for: DAOs, treasuries       good for: protocols, tokens',
    ]),
    textBlock('Under the hood, revnets are just Juicebox projects owned by a special contract that refuses to change anything. All the same pay and cash out mechanics apply.')
  ]));

  // ============================================
  // GOING DEEPER — concepts with some jargon
  // ============================================

  var deeperHeader = document.createElement('div');
  deeperHeader.className = 'guide-part-header';
  deeperHeader.textContent = 'GOING DEEPER';
  wrap.appendChild(deeperHeader);

  wrap.appendChild(guideSection('learn-rulesets', '5. RULESETS', [
    'Rulesets are the heartbeat of a project. Each ruleset defines how things work for a period of time: how many tokens per payment, how much can be paid out, and what the cash out terms are.',
    'When a ruleset\'s duration expires, it automatically cycles — same rules, but with an optional decay applied to the token issuance rate. This means early supporters naturally get more tokens per payment than later ones.',
    'The project owner can queue a new ruleset to take effect at the next cycle boundary. If an approval hook is configured, changes must be approved before activating.'
  ], [
    propertyTable('KEY PARAMETERS', [
      ['duration', 'How long the ruleset lasts. 0 = forever (must be explicitly replaced).'],
      ['weight', 'Tokens issued per unit paid. This is the "exchange rate."'],
      ['weightCutPercent', 'How much the weight decreases each cycle (the decay rate).'],
      ['reservedPercent', 'Share of minted tokens set aside for the team/splits.'],
      ['cashOutTaxRate', 'How much cash outs are taxed. Higher = more incentive to hold.'],
      ['baseCurrency', 'Accounting currency (ETH or USD).'],
    ]),
    diagram('RULESET LIFECYCLE', [
      '  queue ruleset    approval hook     cycle boundary',
      '       │              checks              │',
      '       ▼                │                  ▼',
      '   QUEUED ──────▶ APPROVED ──────▶ ACTIVE ──cycles──▶ ACTIVE...',
      '       │                                   ▲',
      '       └── if no approval hook ────────────┘',
    ])
  ]));

  wrap.appendChild(guideSection('learn-tokens', '6. TOKENS', [
    'When someone pays a project, they receive project tokens. Tokens record participation, define each holder\'s share of cash-outable surplus, and can be used by extensions or outside apps as the project\'s own asset. The exchange rate is set by the ruleset weight — for example, 1,000 tokens per ETH.',
    'A portion of tokens can be reserved for the project team. If reservedPercent is 20%, then for every payment, 80% of tokens go to the payer and 20% are set aside for the team\'s configured splits.',
    'Tokens start as internal "credits" — lightweight balances tracked by the protocol. The project can deploy a full ERC-20 token at any time, and holders can convert their credits into real tokens.'
  ], [
    diagram('TOKEN FLOW EXAMPLE', [
      '  payment: 2 ETH',
      '  weight:  500 tokens per ETH',
      '  reserved: 20%',
      '',
      '  total minted = 1,000 tokens',
      '       │',
      '  ┌────┴─────────────────┐',
      '  │                      │',
      '  ▼                      ▼',
      '  800 tokens          200 tokens',
      '  (to payer)          (to team splits)',
    ])
  ]));

  wrap.appendChild(guideSection('learn-splits', '7. SPLITS & PAYOUTS', [
    'Splits control where money and reserved tokens go. Each split directs a percentage to a wallet, another project, or a custom contract.',
    'Payout limits cap how much the project can distribute per cycle. Everything beyond the payout limit is "surplus" — and that\'s what token holders can cash out against.',
    'Splits can be locked until a specific date. Once locked, they can\'t be reduced or removed — only added to. This protects team members and partners from having their share cut.'
  ], [
    diagram('FUND FLOW', [
      '  treasury balance',
      '       │',
      '  ┌────┴──────────────────────┐',
      '  │                           │',
      '  ▼                           ▼',
      '  payout limit             surplus',
      '  (distributed to splits)  (available for cash outs)',
    ])
  ]));

  wrap.appendChild(guideSection('learn-fees', '8. FEES', [
    'The protocol charges a 2.5% fee on payouts and surplus withdrawals. Cash outs with a tax rate above 0% also incur fees.',
    'If the holdFees ruleset flag is enabled, fees are held for 28 days before being processed. During this window, if a project adds funds back, the held fees are returned. After 28 days, fees are forwarded to the Juicebox protocol treasury. If holdFees is off, fees are processed immediately.',
    'Some addresses can be designated as fee-exempt — they pay zero fees on all transactions.'
  ], [
    diagram('FEE EXAMPLE', [
      '  100 ETH payout',
      '     └─▶ 2.5 ETH fee',
      '     └─▶ 97.5 ETH distributed to splits',
      '',
      '  if holdFees is on:  fee held 28 days, refundable',
      '  if holdFees is off: fee processed immediately',
    ])
  ]));

  // ============================================
  // UNDER THE HOOD — technical details
  // ============================================

  var hoodHeader = document.createElement('div');
  hoodHeader.className = 'guide-part-header';
  hoodHeader.textContent = 'UNDER THE HOOD';
  wrap.appendChild(hoodHeader);

  wrap.appendChild(guideSection('learn-architecture', '9. ARCHITECTURE', [
    'Everything you\'ve read about so far — projects, rulesets, tokens, splits, fees — each lives in its own smart contract. These contracts are organized in layers.',
    'Surface contracts are what users interact with: the controller orchestrates project operations, and the terminal handles money in and out. Core contracts store the underlying data: who owns what, what the rules are, where funds go. Omnichain contracts move tokens and funds across blockchains.'
  ], [
    diagram('CONTRACT LAYERS', [
      '┌──────────────────────────────────────────────────────────────┐',
      '│  SURFACE — what users interact with                          │',
      '│  JBController · JBMultiTerminal · JBTerminalStore            │',
      '├──────────────────────────────────────────────────────────────┤',
      '│  CORE — stores protocol state                                │',
      '│  JBProjects · JBDirectory · JBPermissions · JBTokens         │',
      '│  JBRulesets · JBSplits · JBPrices · JBFundAccessLimits       │',
      '│  JBFeelessAddresses                                          │',
      '├──────────────────────────────────────────────────────────────┤',
      '│  OMNICHAIN — cross-chain connectivity                        │',
      '│  JBSucker · JBSuckerDeployer · JBSuckerRegistry              │',
      '└──────────────────────────────────────────────────────────────┘',
    ]),
    propertyTable('WHAT EACH CONTRACT DOES', [
      ['JBController', 'The orchestrator. Deploys projects, queues rulesets, mints and burns tokens.'],
      ['JBMultiTerminal', 'Handles money: pay, cash out, distribute payouts, add funds. Accepts any token.'],
      ['JBTerminalStore', 'The bookkeeper. Tracks balances, payout limits, surplus, and cash out math.'],
      ['JBProjects', 'Each project is an NFT. Whoever holds the NFT controls the project.'],
      ['JBDirectory', 'A phonebook that maps projects to their controller and terminals.'],
      ['JBPermissions', 'Fine-grained access control. Grant specific abilities to other addresses.'],
      ['JBTokens', 'Manages the dual token system: lightweight internal credits + optional full ERC-20 token.'],
      ['JBRulesets', 'Stores and schedules rulesets. Handles cycling, decay, and approval hooks.'],
      ['JBSplits', 'Stores payout and reserved token distribution rules.'],
      ['JBPrices', 'Converts between currencies (e.g. ETH to USD) using price feeds.'],
      ['JBFundAccessLimits', 'Enforces payout limits and surplus allowances.'],
      ['JBFeelessAddresses', 'Registry of addresses exempt from protocol fees.'],
    ])
  ]));

  wrap.appendChild(guideSection('learn-hooks', '10. HOOKS & EXTENSIONS', [
    'A "hook" is a custom contract that plugs into the protocol at a specific moment — like a callback. When a payment comes in, when tokens are cashed out, or when a ruleset changes, the protocol can call your hook to run custom logic.',
    'Projects can add features like NFT rewards, automatic market buybacks, content publishing, and approval gates without modifying the core protocol. Hooks are optional and composable.'
  ], [
    propertyTable('TYPES OF HOOKS', [
      ['Data hook', 'Intercepts payments or cash outs BEFORE they happen. Can modify amounts, redirect funds, or override behavior.'],
      ['Pay hook', 'Runs AFTER a payment is recorded. Good for side effects like minting NFTs or sending notifications.'],
      ['Cash out hook', 'Runs AFTER tokens are burned and funds transferred. Good for cleanup or analytics.'],
      ['Split hook', 'Runs when a payout split sends funds to a contract instead of a wallet. Good for auto-investing.'],
      ['Approval hook', 'Gates queued rulesets — the hook must approve changes before they can activate.'],
    ]),
    propertyTable('BUILT-IN EXTENSIONS', [
      ['Buyback hook', 'Automatically buys tokens from a DEX when the market price is better than the mint price.'],
      ['721 tiers hook', 'Distributes tiered NFTs to contributors based on payment amount.'],
      ['Swap terminal', 'Converts incoming tokens to the project\'s preferred token before recording payment.'],
      ['Project handles', 'Gives projects human-readable names via ENS (Ethereum Name Service).'],
    ])
  ]));

  wrap.appendChild(guideSection('learn-omnichain', '11. OMNICHAIN', [
    'A single project can operate across multiple blockchains — Ethereum, Optimism, Arbitrum, and more. The same project tokens work everywhere, and funds move proportionally between chains.',
    'This works through "suckers" — bridge contracts that connect a project\'s treasuries across chains. When tokens are bridged from one chain to another, the sucker moves a proportional share of the treasury funds to match. Each chain pair has its own sucker using the native bridge (Optimism bridge, Arbitrum bridge, or Chainlink CCIP).',
    'Once tokens have been bridged through a sucker, the token mapping between chains becomes permanent — it can\'t be changed, only disabled. This protects holders from having their cross-chain tokens invalidated.'
  ], [
    diagram('CROSS-CHAIN FLOW', [
      '  Ethereum treasury ◄──── sucker ────► Optimism treasury',
      '       │                                    │',
      '       └── tokens bridged ──────────────────┘',
      '           funds move proportionally',
    ])
  ]));

  wrap.appendChild(guideSection('learn-prices', '12. PRICE FEEDS', [
    'JBPrices normalizes price feeds between currencies, enabling projects to account in USD while managing ETH.',
    'Price feeds are immutable once set — a feed cannot be replaced, only added. Inverse prices are auto-calculated (ETH→USD gives you USD→ETH for free).',
    'Projects can set project-specific feeds that override protocol defaults. If a feed reverts, operations using that currency pair will also revert — safe failure mode (no fund loss, just temporary unavailability).'
  ], []));

  // ============================================
  // THE ECOSYSTEM — ecosystem tools & patterns
  // ============================================

  var ecoHeader = document.createElement('div');
  ecoHeader.className = 'guide-part-header';
  ecoHeader.textContent = 'THE ECOSYSTEM';
  wrap.appendChild(ecoHeader);

  wrap.appendChild(guideSection('learn-permissions', '13. PERMISSIONS', [
    'The project owner doesn\'t have to do everything themselves. They can grant specific abilities to other addresses — like "you can trigger payouts" or "you can queue new rulesets" — without giving away full control.',
    'Each ability has a number (a "permission ID"). Granting permission #8 (SEND_PAYOUTS) to an address lets it distribute funds, but nothing else. There\'s also a special "ROOT" permission (#1) that grants everything — use with care.',
    'Permissions are per-project. Granting someone access to project #5 doesn\'t give them any access to project #6. You can also grant wildcard permissions that apply across all projects an address interacts with.'
  ], [
    propertyTable('COMMON PERMISSIONS', [
      ['ROOT', 'Full control over all operations. Like giving someone the project NFT, but revocable.'],
      ['QUEUE_RULESETS', 'Can schedule new rulesets for the project.'],
      ['MINT_TOKENS', 'Can mint tokens on-demand (if the ruleset allows it).'],
      ['SET_SPLITS', 'Can change how payouts and reserved tokens are distributed.'],
      ['SET_PROJECT_URI', 'Can update the project\'s name, description, and logo.'],
      ['SEND_PAYOUTS', 'Can trigger payout distributions.'],
      ['MANAGE_TERMINALS', 'Can add or remove payment terminals.'],
    ]),
    infoBox('Permissions are separate from ownership. Transferring the project NFT transfers control, but granted permissions remain until explicitly revoked.')
  ]));

  wrap.appendChild(guideSection('learn-nfts', '14. NFT REWARDS', [
    'Projects can reward contributors with NFTs organized into tiers. Each tier has a price threshold, a limited supply, and a category. When someone pays enough, they receive an NFT from the matching tier — like membership cards at different levels.',
    'Tiers are grouped by category, and categories must be defined in ascending order. Each tier can also have governance weight (voting power per NFT) and reserved NFTs that the project owner can mint without requiring payment.',
    'The NFT artwork and metadata can live on IPFS (a decentralized file system) or onchain. This system is powered by a pay hook called JB721TiersHook that automatically mints NFTs when payments come in.'
  ], [
    propertyTable('WHAT EACH TIER DEFINES', [
      ['price', 'Minimum payment to receive this tier\'s NFT.'],
      ['supply', 'How many NFTs are available in this tier. Once sold out, it\'s gone.'],
      ['category', 'A grouping number. Tiers must be submitted with categories in ascending order.'],
      ['reserve frequency', 'Automatically reserve 1 NFT for the project every N minted. 0 = no reserves.'],
      ['voting power', 'How much governance weight each NFT in this tier carries.'],
      ['metadata', 'A link to the NFT\'s artwork and description (usually an IPFS content hash).'],
    ]),
    infoBox('NFT tiers are set up at project launch and can be adjusted later. The project owner can add new tiers, remove existing ones (unless locked), and mint reserved NFTs.')
  ]));

  wrap.appendChild(guideSection('learn-croptop', '15. CROPTOP', [
    'Croptop turns any Juicebox project into a content platform. Anyone can publish content (images, text, links) to a project\'s NFT collection — the content becomes a mintable NFT that supporters can collect.',
    'The project owner sets rules for what can be posted: minimum price, supply limits, and optionally an allowlist of who can post. Within those rules, posting is open to everyone. Each post creates a new NFT tier, and supporters mint copies by paying into the project.',
    'A 5% fee goes to the Croptop protocol on each post. The rest flows to the project treasury. If the same content is posted twice, the existing NFT tier is reused instead of creating a duplicate.'
  ], [
    diagram('HOW CROPTOP WORKS', [
      '  someone publishes content + pays the mint price',
      '     │',
      '     ├─▶ content validated against project\'s posting rules',
      '     ├─▶ new NFT tier created for this content',
      '     ├─▶ 5% fee to Croptop protocol',
      '     └─▶ remaining payment → project treasury',
      '         └─▶ poster receives the first NFT',
    ]),
    textBlock('Croptop works alongside all other Juicebox features. A revnet with Croptop becomes a self-sustaining content platform where creators publish, supporters collect, and funds flow to the treasury automatically.')
  ]));

  wrap.appendChild(guideSection('learn-buyback', '16. BUYBACK HOOK', [
    'When someone pays a project, the protocol normally mints new tokens. But what if buying tokens on the open market would give the payer more tokens for their money? The buyback hook automatically checks and picks the better deal.',
    'Here\'s how it works: when a payment comes in, the hook compares two prices — the project\'s minting rate versus the current market price on a Uniswap V4 trading pool. If the market offers more tokens, the hook swaps instead of minting. If minting is the better deal, it mints normally. The payer always gets the best rate without having to think about it.',
    'The same logic works in reverse for cash outs. If selling tokens on the market returns more than the bonding curve reclaim, the hook routes the cash out through the pool instead.'
  ], [
    diagram('BUYBACK DECISION', [
      '  incoming payment',
      '     │',
      '     ├─ market gives more tokens than minting?',
      '     │  └─▶ swap on the trading pool',
      '     │      └─▶ any leftover amount still minted normally',
      '     │',
      '     └─ minting gives equal or more tokens?',
      '        └─▶ normal mint (no swap needed)',
    ]),
    textBlock('Slippage protection (how much the price can move during the swap) is calculated automatically — it\'s not something the payer needs to set. Advanced users can also provide their own price quote in the payment metadata to bypass the automatic check.')
  ]));

  wrap.appendChild(guideSection('learn-loans', '17. LOANS', [
    'Revnet token holders who need cash don\'t have to sell. They can take out a loan against their tokens instead — keeping their position while accessing liquidity.',
    'When you borrow, your collateral tokens are burned (removed from supply) and you receive funds from the treasury. The loan itself is represented as an NFT, so it can be transferred or sold. When you repay, your tokens are re-minted and returned to you.',
    'Loans have an upfront fee (2.5% to 50% of the borrowed amount, paid to the revnet) plus a small protocol fee. If a loan isn\'t repaid within 10 years, anyone can liquidate it — the collateral tokens stay burned permanently and the loan is written off. This actually benefits remaining token holders, since there are now fewer tokens sharing the same treasury.'
  ], [
    diagram('LOAN LIFECYCLE', [
      '  borrow',
      '     └─▶ your tokens are burned as collateral',
      '     └─▶ funds sent to you from the treasury (minus fees)',
      '     └─▶ you receive a loan NFT as your receipt',
      '',
      '  repay (before 10-year expiry)',
      '     └─▶ return the funds + any time-based fee',
      '     └─▶ your collateral tokens are re-minted back to you',
      '',
      '  liquidation (after 10 years)',
      '     └─▶ loan written off — collateral stays burned',
      '     └─▶ remaining holders benefit from reduced supply',
    ]),
    textBlock('At high cash out tax rates, loan fees can be cheaper than the tax you\'d lose by cashing out — making loans a more capital-efficient way to access liquidity while keeping your position.')
  ]));

  wrap.appendChild(guideSection('learn-migration', '18. MIGRATION', [
    'As the protocol evolves, projects can upgrade to newer versions of its core contracts — without losing their treasury, tokens, or history. Think of it like moving to a new office: same business, better infrastructure.',
    'There are two kinds of migration. A controller migration moves the project\'s management logic (how rulesets work, how tokens are minted) to a new controller. A terminal migration moves funds and accounting to a new terminal. Both follow a safe handoff process where the old contract and the new contract each run checks to ensure nothing is lost.',
    'Only the project owner (or someone they\'ve granted permission to) can trigger a migration, and the destination contract must be registered in the project\'s directory first.'
  ], [
    diagram('MIGRATION FLOW', [
      '  1. register the new contract in the directory',
      '  2. call migrate',
      '  3. old contract runs a "before migration" check',
      '  4. state and funds are transferred',
      '  5. new contract runs an "after migration" check',
    ]),
    textBlock('Because of this two-step verification, migrations are safe by design — both sides have to agree the handoff was successful.')
  ]));

  wrap.appendChild(guideSection('learn-distributor', '19. DISTRIBUTOR', [
    'The distributor is a reward system that automatically shares revenue (or any tokens) among project participants. Think of it like a dividend: funds go into the distributor, and holders collect their fair share over time.',
    'Distribution happens in rounds. At the start of each round, a snapshot captures how much each participant holds. Their share of the round\'s rewards is proportional to their holdings at that moment. Rewards don\'t unlock all at once — they vest gradually over a set number of rounds, encouraging long-term participation.',
    'There are two flavors: one for regular token holders (based on voting power), and one for NFT holders (based on their NFT tiers). Both work the same way — fund it, start a round, and let holders collect as their rewards vest.'
  ], [
    diagram('HOW DISTRIBUTION WORKS', [
      '  funds deposited into the distributor',
      '     │',
      '     ▼',
      '  round starts → snapshot of all holdings',
      '     │',
      '     ▼',
      '  holders begin vesting their share',
      '     └─▶ share = your holdings / total holdings',
      '     └─▶ rewards unlock gradually over time',
      '     │',
      '     ▼',
      '  collect unlocked rewards as rounds pass',
    ]),
    textBlock('If an NFT is burned while rewards are still vesting, the unvested portion is returned to the pool for future rounds — it doesn\'t disappear.')
  ]));

  wrap.appendChild(guideSection('learn-handles', '20. PROJECT HANDLES', [
    'Instead of referring to projects by number ("project #47"), you can give yours a human-readable name like "myproject.eth" using ENS — the Ethereum Name Service, which works like a phonebook for blockchain addresses.',
    'To set up a handle, you need two things: an ENS name you own, and a text record on that name pointing to your project. This two-way link proves that the name owner actually wants the association — anyone can propose a name for a project, but it only counts if the ENS name confirms it.',
    'Multiple people can propose different names for the same project. Frontends (apps and websites) decide which proposer to trust. This open design means no single gatekeeper controls naming.'
  ], [
    diagram('SETTING UP A HANDLE', [
      '  1. own an ENS name (e.g. "myproject.eth")',
      '  2. add a "juicebox" text record: "1:42"  (chain:project)',
      '  3. register the name on-chain for your project',
      '  4. apps verify the ENS record matches',
      '  5. your project now shows as "myproject.eth"',
    ]),
    textBlock('Subdomains work too. "sub.myproject.eth" is stored as ["sub", "myproject"] — the contract reconstructs the full name automatically and verifies it against the ENS registry.')
  ]));

  wrap.appendChild(guideSection('learn-payer', '21. PROJECT PAYER', [
    'A project payer is a dedicated deposit address for your treasury. Any funds sent to it are automatically forwarded into your project — no extra steps for the sender.',
    'You can configure it in two modes. In the default mode, payments mint project tokens for the sender (just like paying the project directly). In "add to balance" mode, funds go straight into the treasury without minting tokens — useful for revenue deposits, donations, or any scenario where token issuance isn\'t desired.',
    'The payer automatically finds the right terminal to route funds to. If your project migrates to a new terminal later, the payer follows it automatically — no reconfiguration needed.'
  ], [
    diagram('HOW THE PROJECT PAYER WORKS', [
      '  someone sends ETH to the payer address',
      '     │',
      '     ▼',
      '  payer looks up the project\'s current terminal',
      '     │',
      '     ├─ default mode',
      '     │  └─▶ pays the project → tokens minted for sender',
      '     │',
      '     └─ "add to balance" mode',
      '        └─▶ adds funds to treasury → no tokens minted',
    ]),
    textBlock('This is especially useful for integrations. Any contract, wallet, or payment flow that can send ETH to an address can now fund your project — they don\'t need to know anything about Juicebox.')
  ]));

  container.appendChild(wrap);
  initSmoothScroll(container);
}

export function renderBuildTab() {
  var container = document.getElementById('tab-build');
  container.innerHTML = '';

  var wipBanner = document.createElement('div');
  wipBanner.className = 'discover-header';
  wipBanner.textContent = 'Work in progress';
  container.appendChild(wipBanner);

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap';

  // --- Table of Contents ---
  var toc = document.createElement('nav');
  toc.className = 'guide-toc';
  toc.innerHTML =
    '<div class="guide-toc-title">TABLE OF CONTENTS</div>' +
    '<div class="guide-toc-group-label">Life of a Project</div>' +
    '<a class="guide-toc-link" href="#build-launch">1. Launch</a>' +
    '<a class="guide-toc-link" href="#build-configure">2. Configure</a>' +
    '<a class="guide-toc-link" href="#build-fund">3. Get Funded</a>' +
    '<a class="guide-toc-link" href="#build-tokens-mgmt">4. Manage Tokens</a>' +
    '<a class="guide-toc-link" href="#build-distribute">5. Distribute</a>' +
    '<a class="guide-toc-link" href="#build-cashout">6. Cash Out</a>' +
    '<a class="guide-toc-link" href="#build-evolve">7. Evolve</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">Life of a Revnet</div>' +
    '<a class="guide-toc-link" href="#build-revnet-what">8. What\'s a Revnet?</a>' +
    '<a class="guide-toc-link" href="#build-revnet-deploy">9. Deploy</a>' +
    '<a class="guide-toc-link" href="#build-revnet-stages">10. Stages</a>' +
    '<a class="guide-toc-link" href="#build-revnet-fees">11. Revnet Fees</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">Ecosystem Tools</div>' +
    '<a class="guide-toc-link" href="#build-permissions">12. Permissions</a>' +
    '<a class="guide-toc-link" href="#build-nfts">13. NFT Tiers</a>' +
    '<a class="guide-toc-link" href="#build-hooks">14. Custom Hooks</a>' +
    '<a class="guide-toc-link" href="#build-distributor">15. Distributor</a>' +
    '<a class="guide-toc-link" href="#build-handles">16. Project Handles</a>' +
    '<a class="guide-toc-link" href="#build-payer">17. Project Payer</a>' +
    '<a class="guide-toc-link" href="#build-swap-terminal">18. Swap Terminal</a>' +
    '<a class="guide-toc-link" href="#build-buyback">19. Buyback Hook</a>';
  wrap.appendChild(toc);

  // --- Life of a Project ---

  var projectHeader = document.createElement('div');
  projectHeader.className = 'guide-part-header';
  projectHeader.textContent = 'LIFE OF A PROJECT';
  wrap.appendChild(projectHeader);

  wrap.appendChild(guideSection('build-launch', '1. LAUNCH', [
    'Everything starts with JBController.launchProjectFor(). This single call:',
  ], [
    stepList([
      'Mints an ERC-721 project NFT to the owner address',
      'Configures initial rulesets (payout limits, token weights, reserved percents, etc.)',
      'Sets up terminal configurations (which tokens the project accepts)',
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
    infoBox('For omnichain projects, use JBOmnichainDeployer.launchProjectFor() instead — it deploys suckers across multiple chains simultaneously.')
  ]));

  wrap.appendChild(guideSection('build-configure', '2. CONFIGURE', [
    'After launch, inspect and understand your project\'s configuration:'
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
    infoBox('Empty fundAccessLimitGroups = zero payouts (NOT unlimited). Use uint224.max for unlimited payouts.')
  ]));

  wrap.appendChild(guideSection('build-fund', '3. GET FUNDED', [
    'Once launched, anyone can contribute to the project through its configured terminals.'
  ], [
    codeBlock(
      'JBMultiTerminal.pay',
      'pay(\n' +
      '  projectId,\n' +
      '  token,              // which token to pay with\n' +
      '  amount,             // how much\n' +
      '  beneficiary,        // who receives the minted tokens\n' +
      '  minReturnedTokens,  // slippage protection\n' +
      '  memo,               // message attached to the payment\n' +
      '  metadata            // extra data for hooks\n' +
      ')\n' +
      '// Returns: number of tokens minted for the beneficiary'
    ),
    fnRefTable('CHECKING BALANCES', [
      ['JBTerminalStore.balanceOf(terminal, projectId, token)', 'Terminal balance for a specific token'],
      ['JBTerminalStore.currentSurplusOf(...)', 'Surplus across specified terminals and tokens'],
      ['JBTerminalStore.currentTotalSurplusOf(...)', 'Surplus aggregated across ALL terminals'],
    ]),
    infoBox('Anyone can also inject capital without receiving tokens via addToBalanceOf(). This is useful for grants, donations, or returning funds.')
  ]));

  wrap.appendChild(guideSection('build-tokens-mgmt', '4. MANAGE TOKENS', [
    'Tokens start as internal credits. Deploy an ERC-20 whenever you\'re ready.'
  ], [
    fnRefTable('TOKEN OPERATIONS', [
      ['JBController.deployERC20For(projectId, name, symbol, salt)', 'Deploy the project\'s ERC-20 token'],
      ['JBTokens.tokenOf(projectId)', 'Get the ERC-20 address (zero if not yet deployed)'],
      ['JBTokens.totalBalanceOf(holder, projectId)', 'Complete holdings (credits + ERC-20)'],
      ['JBTokens.creditBalanceOf(holder, projectId)', 'Internal credits only'],
      ['JBTokens.claimTokensFor(holder, projectId, count, beneficiary)', 'Convert credits into ERC-20 tokens'],
    ]),
    fnRefTable('MINTING & BURNING', [
      ['JBController.mintTokensOf(projectId, tokenCount, beneficiary, memo, useReservedPercent)', 'Owner mints tokens on-demand (if ruleset allows)'],
      ['JBController.burnTokensOf(holder, projectId, tokenCount, memo)', 'Holder burns their own tokens'],
    ])
  ]));

  wrap.appendChild(guideSection('build-distribute', '5. DISTRIBUTE', [
    'Projects distribute funds through payouts and reserved tokens. By default anyone can trigger distribution, but the ownerMustSendPayouts ruleset flag can restrict it to the project owner.'
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
      '// Distributes to splits, leftover to project owner\n' +
      '// 2.5% protocol fee on each distribution'
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
    infoBox('sendPayoutsOf() is permissionless by default — anyone can trigger distributions. To restrict it to the project owner, enable the ownerMustSendPayouts flag in the ruleset metadata.')
  ]));

  wrap.appendChild(guideSection('build-cashout', '6. CASH OUT', [
    'Token holders can cash out (redeem) their tokens for a proportional share of the project\'s surplus. Surplus = terminal balance minus the current payout limit.',
    'The cash out tax rate controls how much value stays in the treasury vs. goes to the redeemer. A rate of 0% = full proportional redemption. Higher rates incentivize holding but reduce access to capital.'
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
    diagram('BONDING CURVE', [
      '  reclaim = surplus × (cashOutCount / totalSupply)',
      '         × [(MAX - taxRate) + taxRate × (cashOutCount / totalSupply)]',
      '         ÷ MAX',
      '',
      '  taxRate = 0%    → full proportional redemption',
      '  taxRate = 100%  → value stays in treasury (early holders protected)',
    ]),
    infoBox('Cash outs with tax rate > 0% incur the 2.5% protocol fee.')
  ]));

  wrap.appendChild(guideSection('build-evolve', '7. EVOLVE', [
    'Projects evolve by queuing new rulesets. Changes take effect at the next cycle boundary (or immediately if the current ruleset has no duration).'
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
      ['JBController.latestQueuedRulesetOf(projectId)', 'Pending ruleset awaiting activation'],
      ['JBController.allRulesetsOf(projectId, startingId, size)', 'Complete ruleset history'],
    ])
  ]));

  // --- Life of a Revnet ---

  var revnetHeader = document.createElement('div');
  revnetHeader.className = 'guide-part-header';
  revnetHeader.textContent = 'LIFE OF A REVNET';
  wrap.appendChild(revnetHeader);

  wrap.appendChild(guideSection('build-revnet-what', '8. WHAT\'S A REVNET?', [
    'A revnet is a Juicebox project owned by a special contract (REVOwner) that enforces a fixed set of rules. No one — not even the deployer — can change the rules after launch.',
    'This creates a revenue-backed token with programmatic capital formation and zero payout mismanagement risk. The token is automatically deployed as an ERC-20 at launch.',
    'Revnets replace "rulesets" with "stages" — same underlying mechanism, but the terminology emphasizes the predetermined progression.'
  ], [
    diagram('REVNET vs PROJECT', [
      '  PROJECT',
      '  • owned by EOA/multisig',
      '  • owner can change rulesets',
      '  • manual ERC-20 deploy',
      '  • flexible governance',
      '  • good for: DAOs, treasuries',
      '',
      '  REVNET',
      '  • owned by REVOwner contract',
      '  • stages locked at deploy',
      '  • ERC-20 auto-deployed',
      '  • trustless, programmatic',
      '  • good for: protocols, tokens',
    ])
  ]));

  wrap.appendChild(guideSection('build-revnet-deploy', '9. DEPLOY A REVNET', [
    'Deploy with REVDeployer.deployFor():'
  ], [
    codeBlock(
      'REVDeployer.deployFor',
      'deployFor(\n' +
      '  revnetId,                        // project ID (or 0 for auto)\n' +
      '  configuration,                   // REVConfig with stages\n' +
      '  terminalConfigurations[],        // payment terminals\n' +
      '  suckerDeploymentConfiguration,   // cross-chain setup\n' +
      '  tiered721HookConfiguration,      // optional NFT tiers\n' +
      '  allowedPosts[]                   // optional croptop posts\n' +
      ')'
    ),
    textBlock('After deployment, interactions are identical to regular projects — pay(), cashOutTokensOf(), and all read functions work the same way. The difference is governance: no one can change the rules.')
  ]));

  wrap.appendChild(guideSection('build-revnet-stages', '10. STAGES', [
    'Stages are pre-programmed rulesets. A revnet might start with high token issuance (bootstrapping), then reduce over time (scarcity), and eventually reach a steady state.',
    'Each stage can configure: token weight, weight decay, reserved splits, cash out tax rate, and more. Once deployed, stages progress automatically at their configured boundaries.'
  ], [
    fnRefTable('READING STAGE STATE', [
      ['JBController.currentRulesetOf(projectId)', 'Active stage parameters'],
      ['JBController.upcomingRulesetOf(projectId)', 'Next stage (empty if current has no duration)'],
      ['JBController.allRulesetsOf(projectId, startingId, size)', 'Complete stage history'],
    ]),
  ]));

  wrap.appendChild(guideSection('build-revnet-fees', '11. REVNET FEES', [
    'Cash outs from revnets with a cash out tax rate > 0% incur two fees:',
  ], [
    stepList([
      '2.5% protocol fee — taken from the reclaimed value by JBMultiTerminal, sent to the Juicebox treasury',
      '2.5% revnet fee — taken from the token count by REVOwner, sent to the revnet fee project',
    ]),
    textBlock('The protocol fee is on the value reclaimed (ETH/tokens out). The revnet fee is on the token count burned (project tokens). These are different bases.')
  ]));

  // --- Ecosystem Tools ---

  var ecoHeader = document.createElement('div');
  ecoHeader.className = 'guide-part-header';
  ecoHeader.textContent = 'ECOSYSTEM TOOLS';
  wrap.appendChild(ecoHeader);

  wrap.appendChild(guideSection('build-permissions', '12. PERMISSIONS', [
    'Grant fine-grained access to other addresses with JBPermissions. Each permission is a bit in a 256-bit field.'
  ], [
    codeBlock(
      'JBPermissions.setPermissionsFor',
      'setPermissionsFor(\n' +
      '  account,         // the address granting permission\n' +
      '  permissionsData  // { operator, projectId, permissionIds[] }\n' +
      ')\n' +
      '// projectId = 0 grants permission across all projects'
    ),
    fnRefTable('CHECKING PERMISSIONS', [
      ['JBPermissions.hasPermission(operator, account, projectId, permissionId, includeRoot, includeWildcard)', 'Check a single permission'],
      ['JBPermissions.hasPermissions(operator, account, projectId, permissionIds[], includeRoot, includeWildcard)', 'Check multiple permissions at once'],
      ['JBPermissions.WILDCARD_PROJECT_ID()', 'Returns 0 — the wildcard project ID'],
    ]),
    propertyTable('PERMISSION IDS', [
      ['1 - ROOT', 'Grants all permissions. Use with extreme care.'],
      ['2 - QUEUE_RULESETS', 'Queue new rulesets for the project.'],
      ['3 - SET_CASH_OUT_DELAY', 'Set delay before cash outs activate.'],
      ['4 - MINT_TOKENS', 'Mint tokens on-demand.'],
      ['5 - BURN_TOKENS', 'Burn tokens from another holder.'],
      ['6 - SET_SPLITS', 'Modify payout and reserved token splits.'],
      ['7 - SET_PROJECT_URI', 'Update project metadata.'],
      ['8 - SEND_PAYOUTS', 'Trigger payout distributions.'],
      ['9 - MIGRATE_TERMINAL', 'Migrate funds to a new terminal.'],
      ['10 - SET_TERMINALS', 'Add or remove terminals.'],
      ['11 - SET_CONTROLLER', 'Change the project controller.'],
      ['12 - USE_ALLOWANCE', 'Withdraw surplus via allowance.'],
    ]),
    infoBox('Permissions are per-operator, per-project. Granting QUEUE_RULESETS to address X for project 5 doesn\'t give X any access to project 6.')
  ]));

  wrap.appendChild(guideSection('build-nfts', '13. NFT TIERS', [
    'Deploy tiered NFTs as pay hooks using JB721TiersHook. Contributors receive NFTs based on payment amount and tier configuration.'
  ], [
    codeBlock(
      'JB721TiersHookProjectDeployer.launchProjectFor',
      'launchProjectFor(\n' +
      '  owner,\n' +
      '  deployTiersHookConfig,    // NFT name, symbol, tiers[]\n' +
      '  launchProjectConfig,      // standard project config\n' +
      '  controller\n' +
      ')\n' +
      '// Always use this deployer, even with empty tiers'
    ),
    propertyTable('TIER CONFIGURATION', [
      ['price', 'Minimum contribution to receive this tier.'],
      ['initialSupply', 'Max NFTs available. 0 = unlimited.'],
      ['category', 'Grouping ID. Tiers MUST be sorted by category (ascending).'],
      ['reserveFrequency', 'Mint 1 reserved NFT every N minted.'],
      ['reserveBeneficiary', 'Who receives reserved NFTs.'],
      ['votingUnits', 'Governance weight. Used by JB721TiersHookGovernance.'],
      ['encodedIPFSUri', 'IPFS content hash for metadata.'],
      ['cannotBeRemoved', 'If true, tier is permanent.'],
    ]),
    fnRefTable('READING NFT STATE', [
      ['JB721TiersHook.tiersOf(hook, categories[], includeResolvedUri, startId, size)', 'List tiers with optional filters'],
      ['JB721TiersHook.tierOf(hook, tierId, includeResolvedUri)', 'Single tier details'],
      ['JB721TiersHook.balanceOf(hook, owner)', 'NFTs held by an address'],
      ['JB721TiersHook.redemptionWeightOf(hook, tokenIds[])', 'Cash out value of specific NFTs'],
    ]),
    infoBox('Tiers are sorted by CATEGORY, not price. The contract reverts with InvalidCategorySortOrder if submitted out of order.')
  ]));

  wrap.appendChild(guideSection('build-hooks', '14. CUSTOM HOOKS', [
    'Build custom logic that executes at key moments in the payment lifecycle. Hooks are the primary extension mechanism.'
  ], [
    propertyTable('HOOK INTERFACES', [
      ['IJBRulesetDataHook', 'Intercepts pay/cashout BEFORE state changes. Can modify weight, token count, memo, and delegate list.'],
      ['IJBPayHook', 'Called AFTER payment recorded and tokens minted. Use for rewards, notifications, side effects.'],
      ['IJBCashOutHook', 'Called AFTER tokens burned and funds transferred. Use for cleanup, analytics, conditional logic.'],
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
      '//   forwardedAmount, weight, projectTokenCount,\n' +
      '//   beneficiary, hookMetadata, payerMetadata'
    ),
    infoBox('Data hooks run BEFORE state changes and can override values. Pay/cashout hooks run AFTER and are for side effects only.')
  ]));

  wrap.appendChild(guideSection('build-distributor', '15. DISTRIBUTOR', [
    'JBDistributor distributes ERC-20 or native ETH rewards to stakers in time-based rounds with linear vesting. Two implementations exist: JBTokenDistributor (for IVotes token holders) and JB721Distributor (for NFT holders).',
    'The distributor is funded via split hooks or direct deposits. Each round, a snapshot captures the distributable balance. Stakers claim their pro-rata share, which vests linearly over a configured number of rounds.'
  ], [
    fnRefTable('CORE FUNCTIONS', [
      ['fund(hook, token, amount)', 'Directly deposit reward tokens for a specific hook\'s staker pool'],
      ['beginVesting(hook, tokenIds[], tokens[])', 'Snapshot and begin vesting for the specified token IDs'],
      ['collectVestedRewards(hook, tokenIds[], tokens[], beneficiary)', 'Collect unlocked vested tokens (auto-vests current round too)'],
      ['releaseForfeitedRewards(hook, tokenIds[], tokens[], beneficiary)', 'Return unvested rewards from burned tokens to the pool'],
      ['poke()', 'Record the snapshot block for the current round early'],
    ]),
    fnRefTable('READ STATE', [
      ['balanceOf(hook, token)', 'Balance held for a hook\'s staker pool'],
      ['collectableFor(hook, tokenId, token)', 'How much is unlocked and ready to collect right now'],
      ['claimedFor(hook, tokenId, token)', 'Total uncollected amount (vesting + vested-but-uncollected)'],
      ['currentRound()', 'The current round number'],
      ['roundSnapshotBlock(round)', 'The block number used for stake weight lookups'],
    ]),
    infoBox('Stake weight comes from IVotes.getPastVotes() for token distributors and tier voting units for 721 distributors. Rewards are proportional to stake weight at the snapshot block.')
  ]));

  wrap.appendChild(guideSection('build-handles', '16. PROJECT HANDLES', [
    'JBProjectHandles maps ENS names to Juicebox project IDs using bidirectional verification. Anyone can propose a handle, but only verified ones (where the ENS text record matches) are returned by handleOf().',
    'All functions take a chainId parameter — handles are chain-aware. Storage is keyed by the setter address, so multiple addresses can propose different handles for the same project.'
  ], [
    fnRefTable('HANDLE FUNCTIONS', [
      ['setEnsNamePartsFor(chainId, projectId, parts[])', 'Associate ENS name parts with a project. Anyone can call this — no access control.'],
      ['ensNamePartsOf(chainId, projectId, setter)', 'Get the stored name parts as set by a specific setter address.'],
      ['handleOf(chainId, projectId, setter)', 'Returns the verified handle string, or empty if ENS text record doesn\'t match.'],
      ['TEXT_KEY', 'The ENS text record key: "juicebox". Expected value: "{chainId}:{projectId}".'],
    ]),
    textBlock('Name parts are in reverse order with .eth appended automatically. For "myproject.eth" → ["myproject"]. For "sub.myproject.eth" → ["sub", "myproject"]. Parts cannot contain dots, "eth", empty strings, or certain Unicode format characters.')
  ]));

  wrap.appendChild(guideSection('build-payer', '17. PROJECT PAYER', [
    'JBProjectPayer is deployed as a minimal proxy (clone). The constructor takes only a JBDirectory address. After deployment, defaults are set via initialize() or setDefaultValues().',
    'When defaultAddToBalance is false, incoming funds trigger pay() — minting tokens for the beneficiary. When true, funds are added via addToBalanceOf() without minting. The beneficiary defaults to msg.sender if not configured.'
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
      '// Anyone sends ETH to the payer\'s address:\n' +
      '//   → receive() fires\n' +
      '//   → looks up DIRECTORY.primaryTerminalOf(projectId, token)\n' +
      '//   → calls pay() or addToBalanceOf() with defaults'
    ),
    infoBox('Terminal lookup happens at payment time via JBDirectory, so the payer automatically follows terminal migrations without reconfiguration.')
  ]));

  wrap.appendChild(guideSection('build-swap-terminal', '18. SWAP TERMINAL', [
    'JBSwapTerminal accepts payments in any token, swaps them through a Uniswap V3 pool into a single output token (TOKEN_OUT, set at deployment), then forwards the result to the project\'s primary terminal. It\'s a pass-through — it never holds a balance.',
    'The output token is fixed per terminal deployment, not per project. Projects configure which Uniswap pool to use for each input token. Slippage protection uses a TWAP oracle with automatic sigmoid-based tolerance, or payers can provide their own quote in metadata.'
  ], [
    fnRefTable('SWAP TERMINAL FUNCTIONS', [
      ['addDefaultPool(projectId, token, pool)', 'Set the Uniswap V3 pool for swapping a specific input token. projectId=0 sets a global default.'],
      ['pay(...)', 'Same IJBTerminal interface as JBMultiTerminal — swaps input to TOKEN_OUT, then calls pay() on the downstream terminal.'],
      ['addToBalanceOf(...)', 'Same as pay() but forwards via addToBalanceOf() on the downstream terminal (no token minting).'],
    ]),
    textBlock('The swap terminal implements IJBTerminal and is registered alongside JBMultiTerminal in JBDirectory. It does not support cash outs or surplus — it is purely a payment pass-through with automatic token conversion.')
  ]));

  wrap.appendChild(guideSection('build-buyback', '19. BUYBACK HOOK', [
    'JBBuybackHook compares the mint price against a Uniswap V4 pool price and routes payments (and cash outs) to whichever gives better value. Slippage tolerance is computed automatically via a sigmoid function — not configurable.',
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
      '// Pool config is immutable once set\n' +
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
    infoBox('The hook also handles cash outs: if the pool offers more than the bonding curve reclaim (after fees), it routes the sell through the pool instead. Payers can bypass the TWAP by providing their own quote in payment metadata.')
  ]));

  container.appendChild(wrap);
  initSmoothScroll(container);
}

// Wants version — the "Why?" page as the answer to "what do project owners
// actually want?". Opens with a single setup paragraph, then a list of
// "They want…" beats culminating in the closer: earn money on their terms.
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
  title.textContent = 'What open source businesses, campaigns, and indy projects actually want:';
  hero.appendChild(title);

  wrap.appendChild(hero);

  var wants = [
    'They want to receive payments wherever and however people want to pay them, and issue their unified, programmable, tokenized assets wherever their users want them, in real time, without managerial overhead.',
    'They want to give their community strong guarantees that assets are backed by the full project’s revenues and fundraises across networks, and can be programmed to do anything else they wish.',
    'They want to use common pay and cash-out functions that let any platform facilitate more flow of money to them, including their own websites. No lock-in.',
    'They want the choice to start their rules open-ended and flexible, evolving as their needs change, and locking for strong guarantees whenever they choose.',
    'They want to operate openly and predictably so they remain auditable by anyone and continue to earn their community’s trust under increased scrutiny over time.',
    'They want to be sure they can keep operating their own money forever, without the powers that be getting in the way.',
    'They want to pay a fee sufficient to feed a healthy, growing, supportive payment network that powers their endeavor without being extractive.',
    'They want certainty that the price they agree to pay for their financial services cannot change on them under any circumstances or by anyone’s discretion.',
    'They want to be acknowledged as customers with real needs, and as investors rewarded for playing a part in helping the payments ecosystem they chose grow by virtue of their usage.',
    'They want to leverage AI acceleration to build more freely and openly with increased security, and without siloing themselves in their own corner of the internet.',
    'They want to be able to fully audit the money system they choose with their own eyes and their own AIs.',
    'They want the freedom to earn their money, on their terms.'
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

// Poem version — the "Why?" page distilled to ten declarative lines.
function renderWhyTabPoem() {
  var container = document.getElementById('tab-why');
  if (!container) return;
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap why-wrap why-poem-wrap';

  var hero = document.createElement('div');
  hero.className = 'why-hero';

  var kicker = document.createElement('div');
  kicker.className = 'why-kicker';
  kicker.textContent = 'WHY OPEN MONEY';
  hero.appendChild(kicker);

  var title = document.createElement('div');
  title.className = 'why-title';
  title.textContent = 'Power was always the product.';
  hero.appendChild(title);

  wrap.appendChild(hero);

  var poemLines = [
    { text: 'Closed rails decide who gets to send.' },
    { text: 'They name the cost, and they name the end.' },
    { text: 'The deal you signed is rewritten while you sleep —' },
    { text: 'The pen, in their hands. The price, yours to keep.' },
    { text: 'Power was always the product they sold,', emphasis: true },
    { text: 'Dressed as your safety since the rails were old.' },
    { text: 'There is another shape that you can use:' },
    { text: 'Public rules, public balances, less to lose.' },
    { text: 'Money you can hold, and share, and earn —' },
    { text: 'The kind of orchard built to return.' },
    { text: 'Build accordingly.', emphasis: true }
  ];

  var poem = document.createElement('div');
  poem.className = 'why-poem';
  for (var i = 0; i < poemLines.length; i++) {
    var line = document.createElement('p');
    line.className = 'why-poem-line' + (poemLines[i].emphasis ? ' why-poem-emphasis' : '');
    line.textContent = poemLines[i].text;
    poem.appendChild(line);
  }
  wrap.appendChild(poem);

  container.appendChild(wrap);
}

// Manifesto version — the "Why?" page framed around the broken generational
// compact: people with no stake will turn against the system. Open money is
// the way back. Read it like a position paper, not a story.
function renderWhyTabManifesto() {
  var container = document.getElementById('tab-why');
  if (!container) return;
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap why-wrap why-story why-manifesto';

  var hero = document.createElement('div');
  hero.className = 'why-hero';

  var kicker = document.createElement('div');
  kicker.className = 'why-kicker';
  kicker.textContent = 'A MANIFESTO ON OPEN MONEY';
  hero.appendChild(kicker);

  var title = document.createElement('div');
  title.className = 'why-title';
  title.textContent = 'Power was always the product.';
  hero.appendChild(title);

  var lead = document.createElement('p');
  lead.className = 'why-lead';
  lead.textContent = 'A person with no stake in a system will, rationally, turn against it. The deal — work, save, accumulate, participate — is no longer on offer for most of the people being asked to live by it. There is another arrangement. It is already in use.';
  hero.appendChild(lead);

  wrap.appendChild(hero);

  var chapters = [
    {
      num: 'I',
      title: 'The deal is breaking.',
      paras: [
        'Most people now rent the things their lives are built on: homes, tools, livelihoods, audiences, distribution. They participate in markets they are not allowed to own a piece of.',
        'A generation\'s worth of stagnant wages, student debt, and unaffordable housing has produced exactly what arithmetic predicted — a large population of adults with no realistic path to capital, and no concrete reason to defend the arrangement that keeps it out of reach.',
        'The discontent that follows is not a failure of values. It is the only honest answer to the terms.'
      ]
    },
    {
      num: 'II',
      title: 'Permission was always the product.',
      paras: [
        'Every closed platform, every payment processor, every centralized exchange sells the same thing: permission to operate inside it. The headline service is incidental. The leverage is everything.',
        'They decide who transacts, which accounts work at any given time, and how prices change. Always for your own good. Always under the auspices of your convenience.',
        'Tenants do not own the building. They cannot fix it. They cannot pass it down. They can only follow the latest rules — and pay the rent that is set without their input.'
      ]
    },
    {
      num: 'III',
      title: 'A stake you can actually hold.',
      paras: [
        'Open money is the alternative. Public rules, public balances, public exits — rules nobody can quietly unplug or rewrite from a boardroom; rules anyone can audit, directly, instead of through spokespersons or the media.',
        'On these rails, the people who fund a project can hold a stake in it. The people who build it can be paid in something that compounds. The people who use it can become co-owners of it, on terms written down where everyone can read them.',
        'The compact gets repaired one project at a time. Not by waiting for a macro fix. By writing the smaller arrangements down in public, where the people inside them can see them and change them.'
      ]
    },
    {
      num: 'IV',
      title: 'This is already happening.',
      paras: [
        'AssangeDAO coordinated funding for a political prisoner the institutions had abandoned. MoonDAO sent an artist to space after the institutions agreed it could not be done. JuiceboxDAO has funded its own protocol, in public, for years, without a corporate parent.',
        'Hundreds of creator collectives, open-source treasuries, and revnets run their own programmable economies on the same rails: paying rent, distributing royalties, returning surplus to the people who paid in.',
        'All of them have been allowed to try. None had to ask permission. Several have outlasted the platforms that told them it could not be done.'
      ]
    },
    {
      num: 'V',
      title: 'The window is unusually open.',
      paras: [
        'AI lets small teams ship financial software faster than any prior generation could. AI auditors make the review side accessible to anyone — not only Solidity specialists, not only people inside well-funded firms.',
        'The audit, historically the most concentrated lever in the system, is decentralizing in real time. Anyone can ask the hard questions; anyone can publish the answers.',
        'The expensive parts of building public infrastructure are getting cheaper for everyone, not only for the people who already had capital.'
      ]
    },
    {
      num: 'VI',
      title: 'Juicebox.',
      paras: [
        'Juicebox is one such piece of infrastructure. Small on purpose. Public functions, inspectable rules, replaceable parts.',
        'Every project does the same moves: accept payments, account for who showed up, distribute money, give people a clean way out. Pay in, cash out, share revenue, verify the rules.',
        'No application. No board. No platform shape. The contracts do not flatter themselves; they were written to be replaced the moment someone makes them better.'
      ]
    },
    {
      num: 'VII',
      title: 'The choice is simple.',
      paras: [
        'Closed rails will keep working — for the people who already have stakes inside them.',
        'Everyone else is being offered a way to claim one, here, on rails where the terms are written down and can be read.',
        'Build accordingly.'
      ]
    }
  ];

  for (var c = 0; c < chapters.length; c++) {
    var ch = chapters[c];
    var section = document.createElement('div');
    section.className = 'why-chapter';

    var heading = document.createElement('div');
    heading.className = 'why-chapter-heading';

    var num = document.createElement('span');
    num.className = 'why-chapter-num';
    num.textContent = ch.num;
    heading.appendChild(num);

    var chTitle = document.createElement('span');
    chTitle.className = 'why-chapter-title';
    chTitle.textContent = ch.title;
    heading.appendChild(chTitle);

    section.appendChild(heading);

    for (var p = 0; p < ch.paras.length; p++) {
      var para = document.createElement('p');
      para.className = 'guide-text why-story-para';
      para.textContent = ch.paras[p];
      section.appendChild(para);
    }

    wrap.appendChild(section);
  }

  var closing = document.createElement('div');
  closing.className = 'why-closing';
  closing.textContent = 'A system holds when the people inside it own something. Build something they can own.';
  wrap.appendChild(closing);

  container.appendChild(wrap);
}

// Banny narrative version of the "Why?" page — kept as a backup of the prior
// story-led structure. Not currently rendered; restore by renaming this back
// to `renderWhyTab`.
function renderWhyTabBanny() {
  var container = document.getElementById('tab-why');
  if (!container) return;
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap why-wrap why-story';

  var hero = document.createElement('div');
  hero.className = 'why-hero';

  var kicker = document.createElement('div');
  kicker.className = 'why-kicker';
  kicker.textContent = 'A SHORT STORY ABOUT MONEY';
  hero.appendChild(kicker);

  var title = document.createElement('div');
  title.className = 'why-title';
  title.textContent = 'Permission was always the product.';
  hero.appendChild(title);

  wrap.appendChild(hero);

  var chapters = [
    {
      num: 'I',
      title: 'Wanting',
      paras: [
        'Banny had something to make.',
        'Not a side project. A thing meant to outlast Banny — funded by the people who used it, repaid to the people who showed up early and often, shaped over years by everyone who kept turning up. An orchard, the kind that feeds a generation.',
        'The world had a short list of shapes on offer: take VC, take a board, take the platform shape. Each came with a deal underneath — sign over enough of the work, the income, the decisions, and you can keep building. Sign over too little, and the doors close.',
        'Banny had read those deals carefully. Banny knew what was being asked, and what was being kept.',
        'Banny wanted the work — at full size, on its own terms.'
      ]
    },
    {
      num: 'II',
      title: 'Narrowing',
      paras: [
        'So the room around Banny began to tighten.',
        'A payout paused mid-stream, with no number to call. A platform sent fresh terms; overnight the side-business model was "noncompliant." A tool Banny had built a workflow around — and could no longer easily leave — raised its prices the moment switching costs were real. A friend running a controversial campaign lost their payment processor in the same week they were on the news.',
        'None of it was personal. That was the worst part. Each was a unilateral decision by someone with the standing to make it, and Banny had none of the levers it would have taken to push back. The deals had been signed, in small print, long before anyone noticed.',
        'This is what closed rails do. They decide who transacts, which accounts work at any given time, and how prices change. Always for your own good. Always under the auspices of your convenience.',
        'It isn\'t paranoia when the walls are actually closer. Banny stopped pretending otherwise.'
      ]
    },
    {
      num: 'III',
      title: 'Leaving',
      paras: [
        'So Banny stopped negotiating with people who already held all the cards.',
        'Banny went looking for a different shape of money. Not a louder one. Not a defiant one. Just one where the terms could not be edited without Banny\'s signature — where the decisions about Banny\'s livelihood did not happen in rooms Banny was not allowed into.'
      ]
    },
    {
      num: 'IV',
      title: 'Shape',
      paras: [
        'The strange part was: it had been there the whole time.',
        'Open money is public rules, public balances, public exits. It runs on rules nobody can quietly unplug or rewrite from a boardroom — rules anyone can audit, directly, instead of through spokespersons or the media. The pen is on the table. The terms are visible. The asymmetry that closed rails quietly depend on simply does not exist.',
        'It is the kind of money you can inherit, share, build on, and walk away from without asking permission, and without surprise updates to the terms.',
        'Banny had been told, for most of a lifetime, that money like this was either a fantasy or a fraud. Banny went to look anyway. The wager was modest — an afternoon of attention. The payoff was the realization that almost none of what had felt inevitable actually was. Power, examined closely, is mostly people agreeing to stand in a particular order.'
      ]
    },
    {
      num: 'V',
      title: 'Precedent',
      paras: [
        'The road had been paved by people Banny could name.',
        'AssangeDAO coordinated funding for a political prisoner the institutions had abandoned — a coalition formed in spite of every gatekeeper that thought it controlled who got paid. MoonDAO sent an artist to space after the institutions agreed it could not be done. JuiceboxDAO funded its own protocol, in public, for years, without a corporate parent — proof that infrastructure can pay its own builders.',
        'Hundreds of creator collectives, open-source treasuries, and revnets had been running their own programmable economies on the same rails: paying rent, distributing royalties, returning surplus to the people who paid in. Each had walked out of a negotiation they had been told they had to accept.',
        'Some had thrived. Some had not. All of them had been allowed to try. Banny was joining a procession that had been walking for a while.'
      ]
    },
    {
      num: 'VI',
      title: 'Instrument',
      paras: [
        'Banny landed on Juicebox.',
        'The protocol is small on purpose — the way good tools tend to be. Every project needs the same moves: accept payments, account for who showed up, distribute money, give people a clean way out. Pay in, cash out, share revenue, verify the rules.',
        'Functions are public. Rules are inspectable. Any piece can be borrowed, forked, or swapped without asking permission. The contracts do not flatter themselves; they were written to be replaced the moment someone makes them better. Power that depends on opacity does not work here, because everything is in writing where anyone can read it.',
        'It fit. Banny began.'
      ]
    },
    {
      num: 'VII',
      title: 'Timing',
      paras: [
        'The timing was generous.',
        'AI now lets a team Banny\'s size ship financial software faster than any prior generation could. The same machines being used to wall the world in are the ones helping Banny build a door — and a window, and a porch, and a small ledger anyone can read. The expensive parts of building infrastructure are getting cheaper for everyone, not only for the people who already had capital.',
        'AI auditors make the review side accessible to anyone — not only Solidity specialists, not only people inside well-funded firms. The audit, historically the most concentrated lever in the system, is decentralizing in real time. Anyone can ask the hard questions; anyone can publish the answers.',
        'Speed without losing the fundamentals: code that is public, behavior that is inspectable, a culture that expects review to continue long after launch.',
        'There are worse moments to begin. There may not be a better one.'
      ]
    },
    {
      num: 'VIII',
      title: 'Arrival',
      paras: [
        'Banny shipped.',
        'Money came in. Money went out. The rules were where Banny had put them, and they were not going to move unless Banny — or the people who had paid in — moved them on purpose. The supporters who had shown up early and often were repaid, on terms they could see and verify for themselves. The orchard had been planted.',
        'Around Banny, the same was happening everywhere: open-source projects earning without hiding the code. Campaigns raising and spending with terms anyone can inspect. Creators keeping direct relationships with their audiences. Customers becoming participants in the value they helped create. Builders showing up on equal terms with everyone else willing to extend the system.',
        'A version of money that does not consume what it touches.',
        'A way of working that competes by virtue of being public.',
        'A power arrangement, finally, written down — and visible to everyone living inside it.'
      ]
    }
  ];

  for (var c = 0; c < chapters.length; c++) {
    var ch = chapters[c];
    var section = document.createElement('div');
    section.className = 'why-chapter';

    var heading = document.createElement('div');
    heading.className = 'why-chapter-heading';

    var num = document.createElement('span');
    num.className = 'why-chapter-num';
    num.textContent = ch.num;
    heading.appendChild(num);

    var chTitle = document.createElement('span');
    chTitle.className = 'why-chapter-title';
    chTitle.textContent = ch.title;
    heading.appendChild(chTitle);

    section.appendChild(heading);

    for (var p = 0; p < ch.paras.length; p++) {
      var para = document.createElement('p');
      para.className = 'guide-text why-story-para';
      para.textContent = ch.paras[p];
      section.appendChild(para);
    }

    wrap.appendChild(section);
  }

  var closing = document.createElement('div');
  closing.className = 'why-closing';
  closing.textContent = 'Banny moved their money out into the open. Thousands of others already have. The orchard is taking root — add yours.';
  wrap.appendChild(closing);

  container.appendChild(wrap);
}

// Classic sectioned version of the "Why?" page — kept as a backup of the
// previous structure (hero + collapsible thematic sections). Not currently
// rendered; restore by renaming this back to `renderWhyTab`.
function renderWhyTabClassic() {
  var container = document.getElementById('tab-why');
  if (!container) return;
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap why-wrap';

  var hero = document.createElement('div');
  hero.className = 'why-hero';

  var kicker = document.createElement('div');
  kicker.className = 'why-kicker';
  kicker.textContent = 'WHY JUICEBOX';
  hero.appendChild(kicker);

  var title = document.createElement('div');
  title.className = 'why-title';
  title.textContent = 'Open money gives open source the confidence to earn.';
  hero.appendChild(title);

  var lead = document.createElement('p');
  lead.className = 'why-lead';
  lead.textContent = 'Juicebox makes open money easier to use: businesses, campaigns, and indy projects share a dependable way to pay in, cash out, and operate by public, customizable rules.';
  hero.appendChild(lead);

  var leadFollow = document.createElement('p');
  leadFollow.className = 'why-lead';
  leadFollow.textContent = 'Simple enough for a group of friends, powerful enough for a world wide web of strangers.';
  hero.appendChild(leadFollow);

  wrap.appendChild(hero);

  wrap.appendChild(guideSection('why-open-money', 'WHY OPEN MONEY?', [
    'Money tends to dictate access and attention. The rails that carry it are run by a small set of gatekeepers — banks, platforms, blockchains, employers, states — whose grip is tightening as AI, robotics, and surveillance media concentrate more of daily life around them. Closed rails decide who transacts, which accounts work at any given time, and how prices change — all under the auspices of your convenience.',
    'Open money is the alternative. Public rules, public balances, public exits — running on rules that nobody can quietly unplug or rewrite from a boardroom, and auditable directly instead of through spokespersons or the media. It is the only kind of money you can actually inherit, share, build on, and walk away from without asking permission, and without surprise updates to your terms.',
    'The demand is already here. Journalists, activists, and political campaigns lose their payment processors with no recourse, often when they are most contentious. Developers build around tools that quietly change their pricing structure the moment switching costs are real. Creators watch accounts freeze and payouts pause mid-stream, with no number to call. Founders read each round of platform terms wondering which business model just became off-limits overnight. Cross-border teams pay a tax in fees and friction just to coordinate.',
    'Over the past five years, Juicebox has already helped groups like these move — from AssangeDAO\'s coordinated push for a political prisoner, to MoonDAO sending an artist to space, to JuiceboxDAO funding its own protocol in public, to hundreds of creator collectives, open-source treasuries, and revnets running their own programmable economies. This is not somewhere people might one day go. It is where work is already happening.'
  ], []));

  wrap.appendChild(guideSection('why-open-web', 'THE OPEN WEB WINS WITH OPEN MONEY', [
    'The open web works because anyone can build with what is already public without asking permission: link to a page, reuse a file, connect one app to another, or make something new from what someone else shared.',
    'Money should be able to do that too. A Juicebox project can be funded, inspected, embedded, extended, audited, and forked by anyone, instead of being locked inside one company\'s website or API.',
    'When project money is open, more people can help it grow: supporters, builders, reviewers, and apps can all meet around the same public system, and be rewarded for it on equal terms as other builders.'
  ], []));

  wrap.appendChild(guideSection('why-speed', 'EXCHANGE WITH CLARITY', [
    'Open money is powerful when it is familiar and reliable. Every project needs the same basic financial moves: accept payments, account for who participated, distribute money, and give people a clear way to exit.',
    'Most projects invent their own financial surface from scratch. Wallets, apps, auditors, contributors, and supporters have to relearn each one. The world does not need another self-declared standard layered on top — it needs implementations that are public, reusable, and humble enough to be replaced.',
    'Juicebox is one such implementation of the core loop: pay and cash out. The functions are public, the rules are inspectable, and any piece can be borrowed, forked, or swapped out without asking permission.'
  ], []));

  wrap.appendChild(guideSection('why-rules', 'VISIBLE TERMS', [
    'When money moves through a project, people need more than promises. They need to see the terms: how funds are handled, what supporters receive, and what can change later.',
    'Juicebox turns the basic rules of a project into visible infrastructure: how money enters, how tokens are issued, how payouts work, how surplus can be reclaimed, and when the rules can change.',
    'Visible terms still leave room for judgment, leadership, and taste. They make those choices easier to trust because everyone can see the money, the limits, and the paths out.'
  ], []));

  wrap.appendChild(guideSection('why-communities', 'PAYMENT CAN BECOME PARTICIPATION', [
    'A pay or donation button often ends the interaction. It lets someone contribute, buy, or help, then gives them no ongoing place in the project. Juicebox lets payment become participation.',
    'Supporters and customers can fund a project, hold project tokens, track the treasury, understand the terms, and stay connected to the value they helped create. Depending on the rules, those tokens can represent participation, connect to integrations, or give holders a way to cash out against available surplus.',
    'Online communities, businesses, and campaigns become durable institutions by handling money openly enough for the mission to survive contact with reality.'
  ], []));

  wrap.appendChild(guideSection('why-open-source-business', 'OPEN SOURCE IS A BETTER BUSINESS', [
    'Open source already wins on trust, distribution, and composability. The hard part has always been the business model: how do the people doing the work earn sustainably without turning the commons back into a private gate?',
    'Juicebox points at a different answer. Revenue can be public, programmable, and shared by design. Users can pay for the tools they depend on, builders can get paid through transparent rules, and investors can back growth with a clearer view of how value flows.',
    'That gives open-source projects a way to outcompete closed companies on their strongest terrain: lower trust costs, faster integration, broader ownership, and business models that improve as more people participate instead of extracting from them.'
  ], []));

  wrap.appendChild(guideSection('why-now', 'WHY NOW?', [
    'AI lets small teams prototype and ship financial software faster than any prior generation. That speed is only useful if the fundamentals stay intact: code that is public, behavior that is inspectable, and a culture that expects review to continue long after launch. Systems that move money deserve more scrutiny than slogans, trust badges, or one-time launch audits can provide.',
    'The good news is that review itself is getting easier. AI auditors make it practical for anyone — not only Solidity specialists — to ask hard questions about open-source contracts: what can this function move, who can call it, what assumptions can break, and what changed since the last review?',
    'AI does not remove risk or replace expert audits, but it makes independent study dramatically more accessible. When the code is open and the tools for reading it are everywhere, supporters, builders, auditors, and skeptics can keep examining the system in public.'
  ], []));

  wrap.appendChild(guideSection('why-unlocks', 'WHEN MONEY IS OPEN', [
    'Creators can earn while keeping a direct relationship with their audience. Businesses can let customers participate in the value they help create. Campaigns can raise and spend with terms everyone can inspect. Open-source projects can turn usage into revenue without hiding the code or locking users in.',
    'The pattern is simple: money enters through shared functions, public rules decide what happens next, and everyone can see the result. Good models can be copied, embedded, extended, and improved instead of trapped inside a private platform.',
    'That means more experiments, clearer commitments, and durable ways for people to earn from the things they help make real — independent of any single platform or gatekeeper.'
  ], []));

  var closing = document.createElement('div');
  closing.className = 'why-closing';
  closing.textContent = 'Juicebox gives project money a public shape: pay in, cash out, share revenue, verify the rules. That makes open work easier to fund, easier to trust, and easier to grow.';
  wrap.appendChild(closing);

  container.appendChild(wrap);
}

// --- Helper builders ---

function guideSection(id, title, paragraphs, extras) {
  var section = document.createElement('div');
  section.className = 'guide-section';
  section.id = id;

  var h = document.createElement('div');
  h.className = 'guide-section-title';
  h.textContent = title;
  section.appendChild(h);

  for (var i = 0; i < paragraphs.length; i++) {
    var p = document.createElement('p');
    p.className = 'guide-text';
    p.textContent = paragraphs[i];
    section.appendChild(p);
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

function contractTable(rows) {
  var el = document.createElement('div');
  el.className = 'guide-contract-table';
  for (var i = 0; i < rows.length; i++) {
    var row = document.createElement('div');
    row.className = 'guide-contract-row';
    var name = document.createElement('span');
    name.className = 'guide-contract-name';
    name.textContent = rows[i][0];
    var desc = document.createElement('span');
    desc.className = 'guide-contract-desc';
    desc.textContent = rows[i][1];
    row.appendChild(name);
    row.appendChild(desc);
    el.appendChild(row);
  }
  return el;
}

function propertyTable(label, rows) {
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
    name.className = 'guide-prop-name';
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
  el.textContent = text;
  return el;
}

function textBlock(text) {
  var p = document.createElement('p');
  p.className = 'guide-text';
  p.textContent = text;
  return p;
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
    text.textContent = items[i];
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
