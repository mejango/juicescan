// src/learn-build.js
// Learn & Build tab content — engaging walkthrough of the Juicebox protocol

export function renderLearnTab() {
  var container = document.getElementById('tab-learn');
  container.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.className = 'guide-wrap';
  wrap.appendChild(guideJourneyLinks('learn'));

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
    '<a class="guide-toc-link" href="#learn-rulesets">5. Scheduled Rules</a>' +
    '<a class="guide-toc-link" href="#learn-tokens">6. Tokens</a>' +
    '<a class="guide-toc-link" href="#learn-splits">7. Sharing Money</a>' +
    '<a class="guide-toc-link" href="#learn-fees">8. Fees</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">Under the Hood</div>' +
    '<a class="guide-toc-link" href="#learn-architecture">9. Contracts</a>' +
    '<a class="guide-toc-link" href="#learn-hooks">10. Adding Features</a>' +
    '<a class="guide-toc-link" href="#learn-omnichain">11. Connecting Chains</a>' +
    '<a class="guide-toc-link" href="#learn-prices">12. Price Feeds</a>' +
    '<div class="guide-toc-group-label" style="margin-top:8px">The Ecosystem</div>' +
    '<a class="guide-toc-link" href="#learn-permissions">13. Permissions</a>' +
    '<a class="guide-toc-link" href="#learn-nfts">14. NFT Rewards</a>' +
    '<a class="guide-toc-link" href="#learn-croptop">15. Croptop</a>' +
    '<a class="guide-toc-link" href="#learn-buyback">16. Buying Existing Tokens</a>' +
    '<a class="guide-toc-link" href="#learn-loans">17. Loans</a>' +
    '<a class="guide-toc-link" href="#learn-migration">18. Moving Contracts</a>' +
    '<a class="guide-toc-link" href="#learn-distributor">19. Sharing Rewards</a>' +
    '<a class="guide-toc-link" href="#learn-handles">20. Project Handles</a>' +
    '<a class="guide-toc-link" href="#learn-payer">21. Payer Address</a>' +
    '<a class="guide-toc-link" href="#learn-glossary">22. Glossary</a>';
  wrap.appendChild(toc);

  // ============================================
  // THE BASICS — introduce the money flow before technical names
  // ============================================

  var basicsHeader = document.createElement('div');
  basicsHeader.className = 'guide-part-header';
  basicsHeader.textContent = 'THE BASICS';
  wrap.appendChild(basicsHeader);

  wrap.appendChild(guideSection('learn-what', '1. WHAT IS JUICEBOX?', [
    "Juicebox helps people collect and share money under rules anyone can check. A project holds the money. Its rules set who can receive it and what people get when they pay.",
    "A payment may give you project tokens. Depending on the rules, you can return tokens for some of the project’s available money. This is called a cash out. Tokens do not automatically give ownership or voting rights, and do not promise a return.",
    "Before paying, check what the project accepts, what you receive, and who can change its rules. A project’s number and balance belong to a specific blockchain."
  ], []));

  wrap.appendChild(guideSection('learn-how', '2. HOW IT WORKS', [
    "People pay a project, the project sends money to its recipients, and token holders may cash out under its rules."
  ], [
    diagram('THE BASIC LOOP', [
      '  1. Someone PAYS into a project',
      '     └─▶ They may receive project tokens',
      '',
      '  2. The project DISTRIBUTES payouts',
      '     └─▶ To team members, partners, other projects',
      '',
      '  3. Token holders can CASH OUT',
      '     └─▶ Return tokens for available money',
      '',
      '  The rules set what each person can receive.',
    ]),
    textBlock('The owner chooses how much money can be paid out, how many tokens a payment creates, and the cash out terms. Rules can repeat on a schedule or change when an allowed replacement starts.'),
    textBlock('Projects can add features such as digital rewards or payments to other projects. The sections below explain these choices one at a time.')
  ]));

  wrap.appendChild(guideSection('learn-projects', '3. PROJECTS', [
    "A project holds money and follows rules recorded on a blockchain. Programs on that chain, called smart contracts, carry out the rules.",
    "Each project has a unique ownership token, called an NFT. The account holding it controls the project within its rules. Some choices can be locked, and some tasks can be assigned to other accounts.",
    "Anyone can create a project. Check its rules and the accounts and contracts it relies on."
  ], [
    diagram('WHAT A PROJECT DOES', [
      '  ┌───────────────────────────────────────────────┐',
      '  │  YOUR PROJECT                                  │',
      '  │                                                │',
      '  │  accepts payments ──▶ issues tokens            │',
      '  │  holds funds      ──▶ distributes payouts      │',
      '  │  tracks funds     ──▶ supports cash outs       │',
      '  │                                                │',
      '  │  rules set by owner, enforced by protocol      │',
      '  └───────────────────────────────────────────────┘',
    ])
  ]));

  wrap.appendChild(guideSection('learn-revnets', '4. REVNETS', [
    "A revenue network, or revnet, is a Juicebox project that commits to its money rules at launch. Its schedule sets how payments create tokens, how tokens are shared, and how cash outs work. The creator cannot rewrite these choices later.",
    "The schedule does not fix a trading price or promise income. What a token can be sold or cashed out for depends on available money and the current terms.",
    "A revnet can still have someone who manages allowed tasks, such as its description or payment recipients. This person is called an operator."
  ], [
    diagram('PROJECT vs REVNET', [
      '  PROJECT                          REVNET',
      '  ───────                          ──────',
      '  rules may allow changes          money rules committed at launch',
      '  permitted owner changes          limited operator powers remain',
      '  can adapt over time              follows its agreed schedule',
    ]),
    textBlock('A contract called REVOwner owns each revnet and enforces these limits. Check which tasks its operator can perform and which optional features it uses.')
  ]));

  // ============================================
  // GOING DEEPER — concepts with some jargon
  // ============================================

  var deeperHeader = document.createElement('div');
  deeperHeader.className = 'guide-part-header';
  deeperHeader.textContent = 'GOING DEEPER';
  wrap.appendChild(deeperHeader);

  wrap.appendChild(guideSection('learn-rulesets', "5. SCHEDULED RULES (RULESETS)", [
    "A project can schedule a group of rules for a period of time. This group is called a ruleset. It sets the token rate, payout limits, and cash out terms.",
    "A timed ruleset repeats until an allowed replacement starts. It can create fewer tokens per payment on each repeat. This reduction is called issuance decay; it applies only when configured.",
    "The owner can schedule a replacement when the current rules allow it. Some projects require another contract to approve the change first. That contract is an approval hook."
  ], [
    propertyTable('KEY PARAMETERS', [
      ['duration', 'Cycle length in seconds. 0 = flexible, continuing until an eligible replacement starts.'],
      ['weight', 'Tokens created per unit paid, before any share is set aside for others.'],
      ['weightCutPercent', 'How much the weight decreases each cycle (the decay rate).'],
      ['reservedPercent', 'Share of new tokens set aside for chosen recipients.'],
      ['cashOutTaxRate', 'Controls how much of a holder’s share stays for others when they cash out. At 100%, ordinary cash outs return nothing.'],
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
    "A payment can create project tokens. Creating tokens is called minting or issuance. The ruleset sets the starting rate, such as 1,000 tokens per ETH. Optional project features can change what a payment returns.",
    "A project can set aside some new tokens for chosen recipients. This is the reserved share. With 20% reserved, the payer receives 80% and the recipients share 20%.",
    "Tokens can be recorded as balances inside Juicebox, called credits. If the project has a separate, transferable token contract using the ERC-20 standard, holders can claim their credits as those tokens. Both forms count toward their project balance."
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

  wrap.appendChild(guideSection('learn-splits', "7. SHARING MONEY (SPLITS & PAYOUTS)", [
    "A project chooses recipients and a percentage for each. These instructions are called splits. They can send payouts or reserved tokens to a wallet, another project, or a contract.",
    "The payout limit caps how much money can be sent out in a cycle. Money above the unused part of that limit is called surplus. Holders can cash out against it under the project’s terms.",
    "A split can be locked until a date. Its share and recipient cannot be removed or reduced before then. Its lock can be extended, and other splits can be added alongside it."
  ], [
    diagram('FUND FLOW', [
      '  project balance',
      '       │',
      '  ┌────┴──────────────────────┐',
      '  │                           │',
      '  ▼                           ▼',
      '  payout limit             surplus',
      '  (distributed to splits)  (available for cash outs)',
    ])
  ]));

  wrap.appendChild(guideSection('learn-fees', '8. FEES AND SHARED NETWORKS', [
    "Fees support revnets that share their tokens with the people and projects paying them. Core Juicebox fees support Juicebox Protocol V6 (JBP6, project 1). Revnet-specific fees support REV (project 3).",
    "A processed fee pays the receiving revnet and can return its tokens. Recipients can hold or cash out those tokens under the revnet’s terms. Amounts and values vary; tokens do not promise a refund or profit.",
    "The recipient depends on the action. Core payout fees credit the project owner; core cash out fees credit the cash out recipient. The extra REV cash out fee credits the holder whose tokens were cashed out.",
    "The standard core charge is 2.5% of the eligible amount leaving a project. It applies to payouts, extra owner withdrawals, and eligible cash outs or contract moves. Transfers within Juicebox and registered exemptions can change whether it applies, so use the actual quote.",
    "Cash out tax is a separate rule: it leaves money in the source project for remaining holders. It does not pay another revnet. The formula below calculates a starting cash out amount; the full quote also includes optional project features and charges.",
    "For a non-exempt cash out, a tax rate above 0% makes the full returned amount eligible for the core fee. At 0%, the contract tracks funds from fee-free project transfers as feeFreeSurplusOf. Only the smaller of this balance and the returned amount is eligible, preventing a round trip from avoiding the charge.",
    "A revnet cash out with a nonzero tax rate also sets aside 2.5% of the token count for REV and calculates its value through the cash out formula. This is a different basis from the core fee on money returned. The two rates cannot be added into a flat 5% charge.",
    "A project can delay eligible payout and withdrawal fees for 28 days with holdFees. Returning matching funds through addToBalanceOf with shouldReturnHeldFees can recover held fees before they are processed. After the hold ends, someone must process them; they do not move automatically when the clock expires. With holding disabled, processing is attempted immediately.",
    "Borrowing pays 1% to REV and a chosen 2.5–50% prepayment to the lending revnet. The withdrawal also normally pays Juicebox’s 2.5% fee. Successful fee payments credit tokens to the chosen loan recipient.",
    "Posting through Croptop adds 5% of the items’ listed price as a payment to CPN (project 2), another revnet. Its tokens go to the chosen fee recipient. Posts to CPN itself are exempt. Later purchases do not pay this posting charge.",
    "Network transaction costs (gas) and trading-pool charges are separate. They do not automatically support JBP6 or REV. Check the complete amount paid and received in the transaction review."
  ], [
    diagram('A FULLY ELIGIBLE PAYOUT', [
      '  100 ETH leaves the project',
      '     ├─▶ 97.5 ETH to payout recipients',
      '     └─▶ 2.5 ETH pays the JBP6 revnet',
      '          └─▶ any returned JBP6 tokens credit the project owner',
    ]),
    diagram('STARTING CASH OUT CALCULATION', [
      '  s = available surplus',
      '  q = tokens cashed out / total token supply',
      '  t = cash out tax rate, from 0 to 1',
      '',
      '  if t = 1: return 0',
      '  otherwise: starting amount = s × q × (1 - t + t × q)',
      '',
      '  core fee = eligible amount × 0.025',
      '  recipient gets the quoted amount after applicable charges',
      '',
      '  Contracts round down in integer units.',
      '  Revnet contracts adjust the counts and split the output.',
      '  Preview the full operation; this formula alone is not a quote.',
    ]),
    propertyTable('PROCESSING DETAILS', [
      ['processHeldFeesOf', 'Processes eligible held fees after their waiting period.'],
      ['JBFeelessAddresses', 'Checks exemptions for the address, project, and caller; an exemption is not a promise that every action is free.'],
      ['feeFreeSurplusOf', 'The tracked amount considered for core fees on a zero-tax cash out.'],
    ]),
    guideReference('https://revnet.money/learn', 'Read Revnet’s guide for its loan terms and worked examples.'),
  ]));

  // ============================================
  // UNDER THE HOOD — technical details
  // ============================================

  var hoodHeader = document.createElement('div');
  hoodHeader.className = 'guide-part-header';
  hoodHeader.textContent = 'UNDER THE HOOD';
  wrap.appendChild(hoodHeader);

  wrap.appendChild(guideSection('learn-architecture', "9. HOW THE CONTRACTS FIT TOGETHER", [
    "Juicebox divides the work between several contracts. The controller manages project rules and tokens. A terminal accepts payments and sends money out. Other contracts record ownership, balances, and recipients.",
    "The names below are useful when checking a transaction or building an app."
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
      ['JBController', 'Creates projects, schedules rules, and creates or removes tokens.'],
      ['JBMultiTerminal', 'Accepts configured payment tokens and handles cash outs, payouts, and deposits.'],
      ['JBTerminalStore', 'The bookkeeper. Tracks balances, payout limits, surplus, and cash out math.'],
      ['JBProjects', 'Each project is an NFT. Whoever holds the NFT controls the project.'],
      ['JBDirectory', 'A phonebook that maps projects to their controller and terminals.'],
      ['JBPermissions', 'Records which accounts can perform each task.'],
      ['JBTokens', 'Manages the dual token system: lightweight internal credits + optional full ERC-20 token.'],
      ['JBRulesets', 'Stores and schedules rulesets. Handles cycling, decay, and approval hooks.'],
      ['JBSplits', 'Stores payout and reserved token distribution rules.'],
      ['JBPrices', 'Converts between currencies (e.g. ETH to USD) using price feeds.'],
      ['JBFundAccessLimits', 'Enforces payout limits and surplus allowances.'],
    ])
  ]));

  wrap.appendChild(guideSection('learn-hooks', "10. ADDING FEATURES (HOOKS)", [
    "A project can call an extra contract during a payment, cash out, or rule change. That contract is called a hook.",
    "Hooks add features such as digital rewards or buying existing tokens from a trading pool. Each hook has its own behavior, so check which ones a project uses."
  ], [
    propertyTable('TYPES OF HOOKS', [
      ['Data hook', 'Intercepts payments or cash outs BEFORE they happen. Can modify amounts, redirect funds, or override behavior.'],
      ['Pay hook', 'Runs AFTER a payment is recorded. Good for side effects like minting NFTs or sending notifications.'],
      ['Cash out hook', 'Runs AFTER tokens are burned and funds transferred. Good for cleanup or analytics.'],
      ['Split hook', 'Runs when a payout split sends funds to a contract instead of a wallet. Good for auto-investing.'],
      ['Approval hook', 'Gates queued rulesets — the hook must approve changes before they can activate.'],
    ]),
    propertyTable('BUILT-IN EXTENSIONS', [
      ['Buyback hook', 'Can buy existing tokens from a trading pool when that gives more tokens than creating new ones.'],
      ['721 tiers hook', 'Distributes tiered NFTs to contributors based on payment amount.'],
      ['Router terminal', 'Can exchange a payment token for one the project accepts.'],
      ['Project handles', 'Gives projects human-readable names via ENS (Ethereum Name Service).'],
    ])
  ]));

  wrap.appendChild(guideSection('learn-omnichain', "11. CONNECTING BLOCKCHAINS", [
    "A project can connect its tokens and funds across blockchains. Each chain still has its own project number, balance, and transactions.",
    "A contract that moves assets between chains is called a bridge. Juicebox’s bridge contracts are called suckers. They move a share of project funds along with the tokens being transferred.",
    "Once a token mapping has been used, it cannot be changed; it can be disabled. Transfers depend on the bridge used for that pair of chains.",
    "If a bridge fails, a project can retire the connection after a delay and enable local withdrawals through an emergency exit. Recovery depends on the connection’s state and settings."
  ], [
    diagram('CROSS-CHAIN FLOW', [
      '  Ethereum funds ◄──── sucker ────► Optimism funds',
      '       │                                    │',
      '       └── tokens bridged ──────────────────┘',
      '           funds move proportionally',
    ])
  ]));

  wrap.appendChild(guideSection('learn-prices', "12. EXCHANGE RATES (PRICE FEEDS)", [
    "A project may track its rules in dollars while holding ETH. It needs a source for the exchange rate. This source is called a price feed; JBPrices reads it.",
    "Once added, a feed cannot be replaced. Projects can add their own feeds, which are tried before the shared defaults. The contract can also use the inverse of a rate.",
    "If no source returns a usable price, an action that needs that price fails. On supported chains with an outage check, the feed also pauses prices while the chain’s transaction service is down and briefly after it restarts."
  ], []));

  // ============================================
  // THE ECOSYSTEM — ecosystem tools & patterns
  // ============================================

  var ecoHeader = document.createElement('div');
  ecoHeader.className = 'guide-part-header';
  ecoHeader.textContent = 'THE ECOSYSTEM';
  wrap.appendChild(ecoHeader);

  wrap.appendChild(guideSection('learn-permissions', '13. PERMISSIONS', [
    "An owner can let another account do a specific task, such as sending payouts or scheduling rules. These grants are called permissions.",
    "Each task has a number. Permission 5, SEND_PAYOUTS, allows payouts. Permission 1, ROOT, grants every supported task, so it gives broad control.",
    "A grant normally applies to one project. Project ID 0 means every project the granting account controls on that chain."
  ], [
    propertyTable('COMMON PERMISSIONS', [
      ['ROOT', 'Full control over all operations. Like giving someone the project NFT, but revocable.'],
      ['QUEUE_RULESETS', 'Can schedule new rulesets for the project.'],
      ['MINT_TOKENS', 'Can mint tokens on-demand (if the ruleset allows it).'],
      ['SET_SPLIT_GROUPS', 'Can change how payouts and reserved tokens are distributed.'],
      ['SET_PROJECT_URI', 'Can update the project’s name, description, and logo.'],
      ['SEND_PAYOUTS', 'Can trigger payout distributions.'],
      ['SET_TERMINALS', 'Can replace the project’s terminal list (ADD_TERMINALS only appends).'],
    ]),
    infoBox('When ownership changes, the old owner’s grants no longer authorize actions on the project. The new owner’s grants apply.')
  ]));

  wrap.appendChild(guideSection('learn-nfts', '14. NFT REWARDS', [
    "Projects can give payers unique digital items, called NFTs. Items are grouped into tiers, each with a price, available quantity, and category. A payment can collect the selected items it covers.",
    "A tier can also set voting power, items reserved for a chosen recipient, and whether the owner can create items without a payment.",
    "Images and descriptions can be stored on the blockchain or in IPFS, a system for sharing files by their content. The JB721TiersHook contract handles these rewards."
  ], [
    propertyTable('WHAT EACH TIER DEFINES', [
      ['price', 'Minimum payment to receive this tier’s NFT.'],
      ['supply', 'How many NFTs are available in this tier. Once sold out, it’s gone.'],
      ['category', 'A grouping number. Tiers must be submitted with categories in ascending order.'],
      ['reserve frequency', 'Automatically reserve 1 NFT for the project every N minted. 0 = no reserves.'],
      ['voting power', 'How much governance weight each NFT in this tier carries.'],
      ['metadata', 'A link to the NFT’s artwork and description (usually an IPFS content hash).'],
    ]),
    infoBox('NFT tiers are set up at project launch and can be adjusted later. The project owner can add new tiers, remove existing ones (unless locked), and mint reserved NFTs.')
  ]));

  wrap.appendChild(guideSection('learn-croptop', '15. CROPTOP', [
    "Croptop lets people publish images, text, or links as items in a project’s NFT collection. Supporters collect copies by paying the project.",
    "The owner sets posting rules, including minimum prices, supply limits, and who can post. Reposting the same content reuses its existing tier."
  ], [
    diagram('HOW CROPTOP WORKS', [
      '  someone publishes content + pays the mint price',
      '     │',
      '     ├─▶ content validated against project’s posting rules',
      '     ├─▶ new NFT tier created for this content',
      '     └─▶ payment supports the project',
      '         └─▶ poster receives the first NFT',
    ]),
    textBlock('Croptop can be used with projects or revnets. Creators publish, supporters collect, and payments support the project.')
  ]));

  wrap.appendChild(guideSection('learn-buyback', "16. BUYING EXISTING TOKENS", [
    "A payment can create new tokens or buy existing ones from a trading pool. A pool holds tokens that people can trade against.",
    "The buyback hook compares the project’s token rate with its configured Uniswap V4 pool. It can buy from the pool when that returns more tokens, then create tokens for any unspent payment.",
    "It can also sell tokens during a cash out when the configured pool offers more than the project’s cash out quote. This comparison does not cover every market."
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
    textBlock('A minimum return protects against a worse price before the trade completes. This is called slippage protection. The hook calculates a default from recent prices; a payer can supply a quote and minimum instead.')
  ]));

  wrap.appendChild(guideSection('learn-loans', '17. LOANS', [
    "Revnet holders can borrow project money against their tokens. The tokens used for the loan are called collateral.",
    "Borrowing removes those tokens from the supply. Repaying restores them. A transferable NFT records the loan, including the amount owed and the collateral.",
    "A loan has a ten-year deadline. After it expires, anyone can close the unpaid loan, and its collateral stays removed. Compare the amount you receive, the repayment quote, and what a cash out would return before borrowing."
  ], [
    diagram('LOAN LIFECYCLE', [
      '  borrow',
      '     └─▶ your tokens are burned as collateral',
      '     └─▶ you receive the quoted amount',
      '     └─▶ you receive a loan NFT as your receipt',
      '',
      '  repay (before 10-year expiry)',
      '     └─▶ pay the current repayment amount',
      '     └─▶ your collateral tokens are re-minted back to you',
      '',
      '  liquidation (after 10 years)',
      '     └─▶ loan written off — collateral stays burned',
      '     └─▶ those tokens cannot be restored by repayment',
    ]),
    textBlock('Borrowing preserves a way to restore your tokens. It does not promise that their value will cover repayment.')
  ]));

  wrap.appendChild(guideSection('learn-migration', "18. MOVING TO NEW CONTRACTS", [
    "Where the rules allow it, a project can move to different contracts. This is called migration.",
    "A controller migration moves management of rules and tokens. A terminal migration moves funds to another payment contract that accepts the same token.",
    "The owner or an authorized account must start the move. Check the destination contract and the resulting rules before approving it."
  ], [
    diagram('MIGRATION FLOW', [
      '  CONTROLLER',
      '  1. JBDirectory.setControllerOf(newController)',
      '  2. new controller runs its "before receive" check',
      '  3. old controller hands its state over (migrate)',
      '  4. new controller runs its "after receive" check',
      '',
      '  TERMINAL',
      '  1. JBMultiTerminal.migrateBalanceOf(to)',
      '  2. balance moves to a terminal that accepts the same token',
    ]),
    textBlock('A controller migration runs checks before and after the handoff. A terminal migration transfers a balance. These checks do not establish that a new contract is safe.')
  ]));

  wrap.appendChild(guideSection('learn-distributor', "19. SHARING REWARDS", [
    "A project can add a distributor to share deposited rewards with eligible token or NFT holders. Rewards come from money put into that contract; holding project tokens alone does not promise them.",
    "Rewards are divided into rounds. A record of eligible holdings at a chosen block determines each person’s share. This record is called a snapshot.",
    "Rewards unlock gradually over later rounds, a process called vesting. Token holders must assign their voting power, even to themselves, to count in the token distributor. NFT eligibility depends on the configured tiers."
  ], [
    diagram('HOW DISTRIBUTION WORKS', [
      '  funds deposited into the distributor',
      '     │',
      '     ▼',
      '  round starts → snapshot of all holdings',
      '     │',
      '     ▼',
      '  participants begin vesting their share',
      '     └─▶ share = your holdings / total holdings',
      '     └─▶ rewards unlock gradually over time',
      '     │',
      '     ▼',
      '  collect unlocked rewards as rounds pass',
    ]),
    textBlock('If an NFT is burned while rewards are still vesting, anyone can release the forfeited portion back into the current round — it doesn’t disappear. Unclaimed rounds do expire.')
  ]));

  wrap.appendChild(guideSection('learn-handles', '20. PROJECT HANDLES', [
    'Instead of referring to projects by number ("project #47"), you can give yours a human-readable name like "myproject.eth" using ENS — the Ethereum Name Service, which works like a phonebook for blockchain addresses.',
    'To set up a handle, you need two things: an ENS name you own, and a text record on that name pointing to your project. This two-way link proves that the name owner actually wants the association — anyone can propose a name for a project, but it only counts if the ENS name confirms it.',
    'Multiple people can propose different names for the same project. Frontends (apps and websites) decide which proposer to trust. This open design means no single gatekeeper controls naming.'
  ], [
    diagram('SETTING UP A HANDLE', [
      '  1. own an ENS name (e.g. "myproject.eth")',
      '  2. add a "juicebox" text record: "1:42"  (chain:project)',
      '  3. register the name onchain for your project',
      '  4. apps verify the ENS record matches',
      '  5. your project now shows as "myproject.eth"',
    ]),
    textBlock('Subdomains work too, stored innermost-last: "sub.myproject.eth" is stored as ["myproject", "sub"] — the contract joins the parts in reverse and appends .eth, then verifies the result against the ENS registry.')
  ]));

  wrap.appendChild(guideSection('learn-payer', '21. PAYER ADDRESS', [
    "A project can have a dedicated ETH deposit address, called a payer address. Sending ETH there can pay the project without a separate payment form. Sending other tokens directly does not trigger a payment.",
    "In payment mode, the project can create tokens for the chosen recipient. In add-to-balance mode, the money increases the project’s balance without creating tokens.",
    "The address looks up the project’s current payment contract when it receives ETH, so it follows allowed contract changes."
  ], [
    diagram('HOW THE PAYER ADDRESS WORKS', [
      '  someone sends ETH to the payer address',
      '     │',
      '     ▼',
      '  payer address looks up the project’s current terminal',
      '     │',
      '     ├─ default mode',
      '     │  └─▶ pays the project → tokens minted for sender',
      '     │',
      '     └─ "add to balance" mode',
      '        └─▶ adds funds to balance → no tokens minted',
    ]),
    textBlock('This is especially useful for integrations. Any contract, wallet, or payment flow that can send ETH to an address can now fund your project — they don’t need to know anything about Juicebox.')
  ]));

  wrap.appendChild(guideGlossary('learn'));
  container.appendChild(wrap);
  initSmoothScroll(container);
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
    '<a class="guide-toc-link" href="#build-configure">2. Configure</a>' +
    '<a class="guide-toc-link" href="#build-fund">3. Get Funded</a>' +
    '<a class="guide-toc-link" href="#build-tokens-mgmt">4. Manage Tokens</a>' +
    '<a class="guide-toc-link" href="#build-distribute">5. Distribute</a>' +
    '<a class="guide-toc-link" href="#build-cashout">6. Cash Out</a>' +
    '<a class="guide-toc-link" href="#build-evolve">7. Evolve</a>' +
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
    "To create a project, choose its owner, payment rules, and accepted tokens. The controller is the contract that manages those settings. Call JBController.launchProjectFor() to:"
  ], [
    stepList([
      'Create the project’s ownership token (an ERC-721 NFT) for the owner',
      'Set the first scheduled rules, called rulesets',
      'Choose payment contracts, called terminals, and the tokens they accept',
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
    infoBox('To connect a project across chains, use JBOmnichainDeployer.launchProjectFor(). It creates the project and local bridge contracts, called suckers. Run it on each chosen chain.')
  ]));

  wrap.appendChild(guideSection('build-configure', '2. CONFIGURE', [
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
    infoBox('Empty fundAccessLimitGroups = zero payouts (NOT unlimited). Use uint224.max for unlimited payouts.')
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
      ['JBTerminalStore.currentTotalSurplusOf(...)', 'Surplus aggregated across ALL terminals'],
    ]),
    infoBox('Use addToBalanceOf() to deposit money without receiving project tokens.')
  ]));

  wrap.appendChild(guideSection('build-tokens-mgmt', '4. MANAGE TOKENS', [
    "Project tokens can be recorded as internal balances, called credits. A separate ERC-20 contract makes them transferable through standard wallets and apps. Creating tokens is minting; permanently removing them is burning."
  ], [
    fnRefTable('TOKEN OPERATIONS', [
      ['JBController.deployERC20For(projectId, name, symbol, salt)', 'Deploy the project’s ERC-20 token'],
      ['JBTokens.tokenOf(projectId)', 'Get the ERC-20 address (zero if not yet deployed)'],
      ['JBTokens.totalBalanceOf(holder, projectId)', 'Complete holdings (credits + ERC-20)'],
      ['JBTokens.creditBalanceOf(holder, projectId)', 'Internal credits only'],
      ['JBController.claimTokensFor(holder, projectId, count, beneficiary)', 'Convert credits into ERC-20 tokens'],
    ]),
    fnRefTable('MINTING & BURNING', [
      ['JBController.mintTokensOf(projectId, tokenCount, beneficiary, memo, useReservedPercent)', 'Owner mints tokens on-demand (if ruleset allows)'],
      ['JBController.burnTokensOf(holder, projectId, tokenCount, memo)', 'Holder burns their own tokens'],
    ])
  ]));

  wrap.appendChild(guideSection('build-distribute', '5. DISTRIBUTE', [
    "Payouts send project money to chosen recipients. Reserved tokens are the share of newly created tokens set aside for recipients. Each recipient instruction is called a split. By default anyone can trigger distribution; the rules can restrict payouts to the owner or authorized accounts."
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
    infoBox('sendPayoutsOf() is permissionless by default — anyone can trigger distributions. To restrict it to the project owner, enable the ownerMustSendPayouts flag in the ruleset metadata.')
  ]));

  wrap.appendChild(guideSection('build-cashout', '6. CASH OUT', [
    "A cash out removes a holder’s tokens and returns project money under the current rules. Money above the unused payout limit is called surplus; it is the starting amount for this calculation.",
    "The cash out tax rate controls how much of a holder’s share stays for others. At 0%, the starting calculation is proportional. At 100%, ordinary cash outs return nothing. Preview the full operation to account for the project’s configured behavior."
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

  wrap.appendChild(guideSection('build-evolve', '7. EVOLVE', [
    "To change a project’s rules, schedule a replacement ruleset. Its start depends on the current rules, the requested start time, and any required approval. A ruleset without a fixed duration can change when its replacement becomes eligible."
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
    'A revnet commits its money rules and stage schedule at launch. Its owner contract, REVOwner, enforces those choices. It starts with an ERC-20 token; an operator keeps only the tasks the contracts allow.',
    'Choose the schedule, accepted tokens, and optional features, then call REVDeployer.deployFor(). The Learn guide explains what these choices mean.'
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
    textBlock('Use the same pay(), cashOutTokensOf(), and read functions as other projects. The revnet’s committed schedule limits what can change later.')
  ]));

  wrap.appendChild(guideSection('build-revnet-stages', '9. STAGES', [
    "A stage sets the token rate, how it changes over time, the reserved share, and cash out terms. The schedule is committed at launch.",
    "Stages begin at their configured times. A lower token rate creates fewer tokens per payment; it does not guarantee a higher trading price."
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
      ['JBPermissions.WILDCARD_PROJECT_ID()', 'Returns 0 — the wildcard project ID'],
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
      ['10 - MINT_TOKENS', 'Mint tokens on-demand.'],
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
    infoBox('Permissions are per-operator, per-project. Granting QUEUE_RULESETS to address X for project 5 doesn’t give X any access to project 6.')
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
      ['category', 'Grouping ID. Tiers MUST be sorted by category (ascending).'],
      ['reserveFrequency', 'Mint 1 reserved NFT every N minted.'],
      ['reserveBeneficiary', 'Who receives reserved NFTs.'],
      ['votingUnits', 'Governance weight (via JB721Checkpoints). Applies only when the tier’s flags.useVotingUnits is set — otherwise voting power tracks the tier price.'],
      ['encodedIpfsUri', 'IPFS content hash for metadata.'],
      ['flags.cantBeRemoved', 'If true, tier is permanent (one of the nested flags: allowOwnerMint, useVotingUnits, transfersPausable, cantBeRemoved, …).'],
    ]),
    fnRefTable('READING NFT STATE', [
      ['JB721TiersHookStore.tiersOf(hook, categories[], includeResolvedUri, startId, size)', 'List tiers with optional filters'],
      ['JB721TiersHookStore.tierOf(hook, tierId, includeResolvedUri)', 'Single tier details'],
      ['JB721TiersHook.balanceOf(owner)', 'NFTs held by an address'],
      ['JB721TiersHook.cashOutWeightOf(tokenIds[])', 'Cash out weight of specific NFTs (divide by totalCashOutWeight() for the surplus fraction)'],
    ]),
    infoBox('Tiers are sorted by CATEGORY, not price. The contract reverts with InvalidCategorySortOrder if submitted out of order.')
  ]));

  wrap.appendChild(guideSection('build-hooks', '12. CUSTOM HOOKS', [
    "To add behavior during a payment, cash out, or rule change, supply a contract the project calls at that point. This contract is called a hook. Choose the interface for the step you need."
  ], [
    propertyTable('HOOK INTERFACES', [
      ['IJBRulesetDataHook', 'Intercepts pay and cash out BEFORE state changes. Can override the weight (pay) or the cash out tax rate / effective counts (cash out), and specify pay and cash out hook specifications.'],
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
      '//   forwardedAmount, weight, newlyIssuedTokenCount,\n' +
      '//   beneficiary, hookMetadata, payerMetadata'
    ),
    infoBox('Data hooks run BEFORE state changes and can override values. Pay and cash out hooks run AFTER and are for side effects only.')
  ]));

  wrap.appendChild(guideSection('build-distributor', '13. DISTRIBUTOR', [
    "A distributor shares deposited rewards with eligible holders in rounds. Rewards unlock gradually over time, called vesting. JBTokenDistributor uses token voting power; JB721Distributor uses NFT holdings. Both are optional contracts a project can deploy.",
    "At a chosen block, a snapshot records the holdings used to calculate each share. Deposits can come directly or through a payout hook."
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
    infoBox('A holder’s stake comes from IVotes.getPastVotes() (token distributors) or tier voting units (721 distributors). The TOTAL-stake denominator uses IJBActiveVotes.getPastTotalActiveVotes — which excludes undelegated balances (e.g. AMM-held tokens), so holders must delegate (even to themselves) to count. Rewards are proportional to active stake at the snapshot block.')
  ]));

  wrap.appendChild(guideSection('build-handles', '14. PROJECT HANDLES', [
    'JBProjectHandles maps ENS names to Juicebox project IDs using bidirectional verification. Anyone can propose a handle, but only verified ones (where the ENS text record matches) are returned by handleOf().',
    'All functions take a chainId parameter — handles are chain-aware. Storage is keyed by the setter address, so multiple addresses can propose different handles for the same project.'
  ], [
    fnRefTable('HANDLE FUNCTIONS', [
      ['setEnsNamePartsFor(chainId, projectId, parts[])', 'Associate ENS name parts with a project. Anyone can call this — no access control.'],
      ['ensNamePartsOf(chainId, projectId, setter)', 'Get the stored name parts as set by a specific setter address.'],
      ['handleOf(chainId, projectId, setter)', 'Returns the verified handle string, or empty if ENS text record doesn’t match.'],
      ['TEXT_KEY', 'The ENS text record key: "juicebox". Expected value: "{chainId}:{projectId}".'],
    ]),
    textBlock('Name parts are in reverse order. handleOf returns the dot-joined labels without a .eth suffix; the suffix is only added when computing the namehash for verification. `_formatHandle` (JBProjectHandles.sol:220-232) walks the array from the LAST element to the first, so the innermost label goes last. For "myproject.eth" → ["myproject"]. For "sub.myproject.eth" → ["myproject", "sub"]. Parts cannot contain dots, ASCII control characters, DEL, "eth", or be empty. Unicode normalization (ENSIP-15) is the caller/client’s responsibility, not the contract’s.')
  ]));

  wrap.appendChild(guideSection('build-payer', '15. PAYER ADDRESS', [
    "A payer address forwards incoming ETH to a project using saved settings. Deploy JBProjectPayer as a lightweight copy of its implementation, called a clone, then set its defaults with initialize() or setDefaultValues().",
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
    infoBox('Terminal lookup happens at payment time via JBDirectory, so the payer address automatically follows terminal migrations without reconfiguration.')
  ]));

  wrap.appendChild(guideSection('build-swap-terminal', '16. ROUTER TERMINAL', [
    "If a project does not accept the payer’s token directly, JBRouterTerminal can exchange it for an accepted token and forward the payment. It needs a supported route; accepting a token is not a promise that a usable route exists.",
    "JBPayRouteResolver compares supported routes and estimates which returns the most project tokens. It can use a direct payment, a Uniswap trade, a cash out from another project, or a combination. The output token can differ between payments."
  ], [
    fnRefTable('ROUTER TERMINAL FUNCTIONS', [
      ['pay(...)', 'Same IJBTerminal interface as JBMultiTerminal — resolves the best route, converts the input, then calls pay() on the destination terminal.'],
      ['addToBalanceOf(...)', 'Same as pay() but forwards via addToBalanceOf() on the destination terminal (no token minting).'],
      ['previewPayFor(...)', 'Preview the chosen route and expected output for a payment without executing it.'],
      ['pendingCallCount(), pendingCallCommitmentOf(id), pendingCallFailureOf(id)', 'Inspect gateway calls that retain custody after a failed protocol-fee route. Count is an ID counter; a nonzero commitment identifies an outstanding call.'],
      ['processPendingCall[WithGas](...), finalizePendingCall[WithGas](...)', 'Retry or finalize a committed gateway call using its original event payload. Review QueuePendingCall, ProcessPendingCall, RefundPendingCall, and RecordTerminalCallFailure to distinguish retained, settled, and refunded funds.'],
      ['bestPoolLiquidityOf(tokenA, tokenB)', 'Report the deepest-liquidity Uniswap pool the router would use for a pair.'],
    ]),
    textBlock('Rollout availability comes from each chain’s canonical deployment records. Proposals do not activate a chain before execution; OP Sepolia has the JBRatioPriceFeed without a buyback hook, router, or gateway. The ratio feed covers USDC/native and USDC/ETH pricing for ETH-based payments and mixed-balance cash outs.'),
    textBlock('The router is reached through JBRouterTerminalRegistry, which is what a project adds to JBDirectory alongside JBMultiTerminal; read terminalOf(projectId), then ROUTER() when the selected terminal is JBRouterTerminalGateway. The gateway takes custody before routing. Previous cohorts can still resolve to their old router until an operator migrates them. Routing is internal (JBPayRouteResolver) — there is no per-project pool configuration.')
  ]));

  wrap.appendChild(guideSection('build-buyback', '17. BUYBACK HOOK', [
    "JBBuybackHook compares creating new tokens with buying them from its configured Uniswap V4 pool. It also compares project cash outs with selling into that pool.",
    "The default minimum return uses an average pool price over a chosen time window, called a time-weighted average price (TWAP). Buyback 1.4.0 payment metadata under getId('pay', hook) must encode three words: (uint256 amountToSwapWith, uint256 minimumSwapAmountOut, bool skipSplits); two-word payment quotes revert. A swap below the TWAP floor falls back to minting. Use the project’s live hook generation when preparing metadata."
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
    infoBox('Preview the complete operation and set a minimum return. A comparison with one configured pool does not establish the best price across all markets.')
  ]));

  // --- Build Your Own ---
  var ownHeader = document.createElement('div');
  ownHeader.className = 'guide-part-header';
  ownHeader.textContent = 'BUILD YOUR OWN';
  wrap.appendChild(ownHeader);

  wrap.appendChild(guideSection('build-bendystraw', '18. INDEXED DATA (BENDYSTRAW)', [
    "Bendystraw collects contract events into a searchable database, called an indexer. It serves project lists, activity, charts, and holdings through GraphQL, a query API.",
    "Use it for browsing. Before a wallet signs, read current balances, rules, spending approvals, and quotes directly from the chain. An indexer can be behind or incomplete; missing results do not prove nothing happened."
  ], [
    fnRefTable('ENDPOINTS', [
      ['https://bendystraw.up.railway.app/graphql', 'Mainnets: Ethereum, Optimism, Base, Arbitrum. No API key needed'],
      ['https://testnet.bendystraw.xyz/graphql', 'Testnets: Sepolia and the L2 Sepolias'],
      ['…/schema', 'A playground with the schema explorer; POST an introspection query to the graphql URL for codegen (same schema on both databases)'],
    ]),
    codeBlock(
      'A first query',
      'POST https://bendystraw.up.railway.app/graphql\n' +
      '{\n' +
      '  projects(where: { chainId: 8453, version: 6 }, orderBy: "balance", orderDirection: "desc", limit: 10) {\n' +
      '    items { projectId chainId name balance suckerGroupId }\n' +
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
      'Every V6 row is versioned: filter with version: 6, and key a project by chainId + projectId, never projectId alone — the same number exists on every chain.',
      'Numeric arguments on singular queries are Float!, not Int! (Ponder’s choice). Declare variables as Float! or the request fails validation with no data.',
      'Lists page with limit and offset and return totalCount; loop until you have them all rather than trusting one page.',
      'suckerGroupId is as-of-event: when chains are linked later, old event rows keep the group id they were written with. Query by every project in the group when you need the full history.',
      'The SDK’s requestBendystraw(endpoint, query, variables) handles the POST, error surfacing, and endpoint normalisation; selectBendystrawEndpoint picks mainnet vs testnet from a chainId.',
    ]),
    infoBox('Building with an agent? The /jb-bendystraw skill in the Juicebox V6 skills library carries the schema, the query patterns above, and the gotchas — hand it over before asking for a feed, chart, or holder table. Source: github.com/peripheralist/bendystraw.')
  ]));

  wrap.appendChild(guideSection('build-clients', '19. COPY THIS SITE', [
    "This explorer runs in the browser. Its files are published to IPFS, and it reads live data from chain connections and Bendystraw. Its source is readable, including the code that builds transactions.",
    "Each guide section has a copy-link button. Each action card has a prompt naming its source file and contract function. Share these with an assistant to start building your own app."
  ], [
    stepList([
      'In Discover, click the link icon at the bottom of a component (e.g. the Pay card) to copy a recreation prompt; or in Build/Learn, click the icon by a section header to copy its link.',
      'Paste it to your LLM and ask: "Recreate this against the Juicebox V6 contracts."',
      'Give it the two repos below. The README’s transaction→contract map shows exactly which function each action calls.',
      'Mirror the pattern: every transaction is a pure buildXArgs() that round-trips through the contract ABI — copy the builder and keep its round-trip test.'
    ]),
    (function () {
      var box = document.createElement('p'); box.className = 'guide-text';
      box.appendChild(document.createTextNode('Reference: '));
      var lk = function (href, text) { var a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; return a; };
      box.appendChild(lk('https://github.com/mejango/juicescan', 'this site’s repo (README + tests)'));
      box.appendChild(document.createTextNode(' and '));
      box.appendChild(lk('https://github.com/Bananapus/version-6', 'V6 contracts (version-6)'));
      box.appendChild(document.createTextNode('.'));
      return box;
    })(),
    (function () {
      var p = document.createElement('p'); p.className = 'guide-text';
      p.textContent = 'The whole app is the source you are looking at — fetch the IPFS bundle and read app.js, or clone the repo. Nothing is hidden server-side: the transaction your wallet signs is built entirely in this code.';
      return p;
    })()
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
  title.textContent = 'What open source businesses, campaigns, and indie projects actually want:';
  hero.appendChild(title);

  wrap.appendChild(hero);

  var wants = [
    "They want people to pay from the apps and chains they use.",
    "They want to share project tokens with the people who support them.",
    "They want clear rules for who can use the money and how.",
    "They want to keep rules flexible or commit to a schedule.",
    "They want anyone to be able to check their money and rules.",
    "They want to use their own websites and tools.",
    "They want to connect their project with other projects.",
    "They want to understand their choices before making them.",
    "They want their community to see what is promised and what can change.",
    "They want assistants to help them build and check their work.",
    "They want to read and use the code behind their money.",
    "They want the freedom to earn their money, on their terms."
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

function glossaryList(rows) {
  var list = document.createElement('dl');
  list.className = 'guide-glossary';
  rows.forEach(function (row) {
    var term = document.createElement('dt');
    term.textContent = row[0];
    var meaning = document.createElement('dd');
    meaning.textContent = row[1];
    list.appendChild(term);
    list.appendChild(meaning);
  });
  return list;
}

function guideGlossary(guide) {
  return guideSection(guide + '-glossary', '22. GLOSSARY', [
    'Use these definitions when a guide or contract names a concept.'
  ], [glossaryList([
    ['Smart contract', 'A program on a blockchain that carries out recorded rules.'],
    ['Project', 'A Juicebox account for collecting and sharing money under its rules.'],
    ['Token', 'A recorded unit of participation. Its rights depend on the project.'],
    ['Cash out', 'Return project tokens for money under the current rules.'],
    ['Revnet', 'A project that commits its money rules and schedule at launch.'],
    ['Operator', 'An account allowed to perform specific tasks for a project.'],
    ['Ruleset', 'A group of project rules that begins at an allowed time.'],
    ['Stage', 'A period in a revnet’s committed schedule.'],
    ['Mint / issuance', 'Create new tokens. Burning permanently removes tokens.'],
    ['Reserved share', 'The portion of new tokens set aside for chosen recipients.'],
    ['Split', 'Instructions assigning a recipient a share of payouts or reserved tokens.'],
    ['Payout limit', 'The most a project can pay out during a cycle.'],
    ['Surplus', 'Money above the unused payout limit, used to calculate cash outs.'],
    ['Cash out tax', 'The rule controlling how much of a holder’s share stays for others.'],
    ['Credits / ERC-20', 'Internal project-token balances / the standard for a separate transferable token contract.'],
    ['NFT', 'A uniquely identified token, used for ownership or digital items.'],
    ['Controller / terminal', 'The contract managing rules and tokens / a contract handling money in and out.'],
    ['Hook', 'An extra contract called during an action to add behavior.'],
    ['Sucker', 'A Juicebox bridge contract that moves tokens and matching funds between chains.'],
    ['Price feed / TWAP', 'A source of exchange rates / an average price over a time window.'],
    ['Slippage', 'A change in the return between a quote and a completed trade. Set a minimum to limit it.'],
    ['Snapshot / vesting', 'A record of holdings at a chosen block / rewards unlocking over time.'],
    ['RPC / indexer', 'A connection used to read a chain or send transactions / a service organizing chain events for search.'],
    ['ABI', 'A contract’s function and data format, used to encode and decode calls.'],
  ])]);
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
