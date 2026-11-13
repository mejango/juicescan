// Mirrors juicebox-money src/lib/build-guide.ts (resolved BUILD_SECTIONS); regenerate when that file changes.
export const BUILD_SECTIONS = [
  {
    "id": "start-pick-the-model",
    "aliases": [
      "build-revnet-what"
    ],
    "part": "Start here",
    "title": "Choose a project or revnet",
    "paragraphs": [
      "A Juicebox project accepts money, issues tokens, and follows rules its owner can change when those rules allow it. A revnet fixes its terms at launch; its operator keeps a smaller set of controls.",
      "Project builders can launch with an [AI assistant](#founders-launch-with-an-agent) or the [launch form](/create), without code. App builders connect their product through the [SDK](#apps-set-up-the-sdk) and [Juicebox Center](#apps-juicebox-center). Contract builders add new behavior in Solidity."
    ],
    "blocks": [
      {
        "type": "compare",
        "label": "Pick the model",
        "columns": [
          "You need to",
          "Use"
        ],
        "rows": [
          [
            "Pay a team from revenue or donations on a schedule",
            "Project with a spending limit"
          ],
          [
            "Keep the option to change rules or contracts later",
            "Project with those owner powers enabled"
          ],
          [
            "Sell collectibles or memberships",
            "Either, with a shop"
          ],
          [
            "Fix the terms at launch so nobody can change them",
            "Revnet"
          ],
          [
            "Let holders cash out against the balance sheet",
            "Project or revnet"
          ],
          [
            "Let holders borrow against their tokens",
            "Revnet"
          ]
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/learn",
            "label": "Learn how Juicebox works"
          },
          {
            "href": "https://revnet.money/build",
            "label": "Building specifically with revnets"
          }
        ]
      }
    ]
  },
  {
    "id": "start-your-first-build",
    "part": "Start here",
    "title": "Start with one working example",
    "paragraphs": [
      "Choose one result below. Each path explains the tools you need as you use them. The Learn glossary is there when you need a definition."
    ],
    "blocks": [
      {
        "type": "steps",
        "items": [
          "Launch a project: have an [AI assistant](#founders-launch-with-an-agent) prepare it, or fill in the [launch form](/create) on a test network. Review the terms, then try a small payment and payout before using real funds.",
          "Build an app: follow Your first test payment. Read a project, preview a payment, and check the result.",
          "Write a contract: choose one behavior to add. Read the V6 contract reference, build it, and test against a local copy of the chain."
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "#founders-launch-with-an-agent",
            "label": "Project builder path"
          },
          {
            "href": "/build/first-payment",
            "label": "Your first test payment"
          },
          {
            "href": "#contracts-install-and-launch",
            "label": "Contract builder path"
          },
          {
            "href": "/learn#learn-glossary",
            "label": "Plain-language glossary"
          },
          {
            "href": "/learn#learn-fees",
            "label": "How fees work"
          }
        ]
      }
    ]
  },
  {
    "id": "founders-launch-with-an-agent",
    "part": "Project builders",
    "audience": [
      "founders"
    ],
    "title": "Launch with an AI assistant",
    "paragraphs": [
      "Describe the project to an assistant and let it do the setup. Connect it to the Juicebox MCP at https://juicebox.center/mcp with the command below. It reads projects, models terms, pins your name and logo to IPFS once you approve the upload, and prepares the exact launch transaction for each chain. It holds no keys and signs nothing. You review the plan and sign in your wallet.",
      "Or have the assistant write a .jb draft. Import it at the top of the [launch form](/create), check every section, and launch from there."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "Connect the Juicebox MCP in Claude Code",
        "lang": "bash",
        "code": "claude mcp add --transport http juicebox https://juicebox.center/mcp"
      },
      {
        "type": "text",
        "text": "Other assistants take the same URL as a remote MCP server. It answers assistants only, so it shows nothing in a browser."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/create",
            "label": "Open the launch form"
          },
          {
            "href": "https://juicebox.center/api",
            "label": "Juicebox Center API directory"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills",
            "label": "Juicebox V6 skills"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/draft.ts",
            "label": "Source: draft format"
          }
        ]
      }
    ]
  },
  {
    "id": "founders-launch-without-code",
    "aliases": [
      "founders-launch-from-the-wizard"
    ],
    "part": "Project builders",
    "audience": [
      "founders"
    ],
    "title": "Launch without code",
    "paragraphs": [
      "The [launch form](/create) covers Flavor, Look and feel, Rules or Stages when needed, Shop, and Launch. The simple flavor skips Rules and uses preset terms. Other projects can schedule new terms when their rules allow it. A revnet fixes its main financial terms at launch, while its operator keeps a limited set of controls."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "The steps",
        "rows": [
          [
            "Flavor",
            "Choose a project type, real or test networks, accepted assets, and owner. Link chains if needed. A custom token must use the same address on each chain. “Accept any token” adds support for asset conversion. Turning “Allow changes” off sends ownership to an address nobody can use"
          ],
          [
            "Look and feel",
            "Name (100 characters), token symbol, tagline, description (10,000 characters), logo and cover (25 MB each), links, tags, and payment notice. Saved when you launch to IPFS, a network that identifies files by their content"
          ],
          [
            "Rules",
            "Set the first terms, what follows them, and how much notice changes require. The next section explains each setting"
          ],
          [
            "Shop",
            "Add items with prices, supply, media, and categories. Choose who receives sales, discounts, reserved copies, and any voting rights. Launch creates a shop contract even with no items"
          ],
          [
            "Launch",
            "One transaction per chain: preview, review, sign, and wait. A shared Safe wallet creates a proposal that still needs approval and execution"
          ]
        ]
      },
      {
        "type": "info",
        "text": "Drafts save in your browser. Import or export the form as a .jb file. A live project’s Extras tab can export its current settings so you can compare them with your draft."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/create",
            "label": "Open the launch form"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/launch.ts",
            "label": "Source: how the form becomes a launch call"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/draft.ts",
            "label": "Source: draft format"
          }
        ]
      }
    ]
  },
  {
    "id": "founders-rules-field-by-field",
    "part": "Project builders",
    "audience": [
      "founders"
    ],
    "title": "Choose the project’s rules",
    "paragraphs": [
      "A ruleset groups a project’s terms and can repeat in cycles. These are its settings in the [launch form](/create)."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Rules step",
        "rows": [
          [
            "Duration",
            "How long each cycle lasts: 1 day to a year, Flexible (0), or Forever. Timed cycles repeat until replaced. Flexible rules have no cycle boundary; notice and approval still apply"
          ],
          [
            "Issuance",
            "New tokens per ETH or USD paid, before reserved tokens. Default 10,000. Leave blank on a later ruleset to continue the previous rate after any scheduled cuts"
          ],
          [
            "Issuance cut",
            "How much the new-token rate falls each cycle. Revnets express this as “cut X% every N days”"
          ],
          [
            "Reserved split",
            "The share of new tokens reserved for other recipients. Add recipients to set the total"
          ],
          [
            "Cash outs",
            "Let holders exchange tokens for available project funds. The cash out tax controls how much stays for remaining holders: 0 gives a proportional share; 1 turns cash outs off. Revnets may also delay when cash outs begin"
          ],
          [
            "Payouts",
            "None, payments to the owner within a limit, or payments to named recipients. Set amounts or percentage shares for each accepted asset. Limits apply per cycle and per chain"
          ],
          [
            "Surplus allowance",
            "How much the owner can withdraw beyond the regular spending limit"
          ],
          [
            "Accept payments",
            "Off pauses paying"
          ],
          [
            "Owner can mint any time",
            "Whether the owner can create tokens without a payment (allowOwnerMinting)"
          ],
          [
            "Superpowers",
            "Launch contracts and settings the owner can change: payment contracts, rules manager, project token, accepted assets, and currency feeds. Check both the current powers and whether later rules can enable more"
          ],
          [
            "Afterwards, notice",
            "What follows these terms, and how much notice a change needs: 3 hours, 1 day, 3 days, 7 days, or none"
          ]
        ]
      },
      {
        "type": "info",
        "text": "The form sets up the shop extension automatically. The Learn guide explains how the cash out tax changes the amount holders receive, with a worked example."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/create",
            "label": "Open the launch form"
          },
          {
            "href": "/learn#learn-rulesets",
            "label": "Rulesets, in the Learn guide"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-ruleset/SKILL.md",
            "label": "jb-ruleset skill"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/components/create/StageRulesEditor.tsx",
            "label": "Source: rules editor"
          }
        ]
      }
    ]
  },
  {
    "id": "founders-what-deploy-does",
    "part": "Project builders",
    "audience": [
      "founders",
      "frontend"
    ],
    "title": "What happens when you launch",
    "blocks": [
      {
        "type": "points",
        "items": [
          {
            "key": "Launch contract",
            "text": "the app uses REVDeployer.deployFor for revnets, JBOmnichainDeployer.launchProjectFor for linked chains, and JB721TiersHookProjectDeployer.launchProjectFor for other projects. These launchers set up the required extensions."
          },
          {
            "key": "Creation fee",
            "text": "up to 0.001 ETH per chain plus gas, shown in the review before you sign."
          },
          {
            "key": "One transaction per chain",
            "text": "sign each launch in order with the same wallet. The app keeps a shared salt so linked bridge contracts get matching addresses."
          },
          {
            "key": "Afterwards",
            "text": "each chain has its own project ID; the page lives at /<chain>:<id>. The Rulesets or Terms tab shows the terms as the contracts hold them."
          }
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/create",
            "label": "Open the launch form"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-project/SKILL.md",
            "label": "jb-project skill"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-omnichain-ui/SKILL.md",
            "label": "jb-omnichain-ui skill"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/launch.ts",
            "label": "Source: buildLaunchRequest"
          }
        ]
      }
    ]
  },
  {
    "id": "founders-running-a-project",
    "part": "Project builders",
    "audience": [
      "founders"
    ],
    "title": "Manage your project",
    "paragraphs": [
      "The project page groups available management actions into tabs. Available actions depend on your account, project rules, and extensions."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Project page",
        "rows": [
          [
            "Rulesets",
            "Read current and upcoming terms. Schedule a change under the project’s timing and approval rules"
          ],
          [
            "Funds",
            "Send funds to chosen recipients, use the owner’s extra withdrawal allowance, or add funds"
          ],
          [
            "Owners",
            "See holders and balances. Send reserved tokens to recipients, or create tokens scheduled by a revnet"
          ],
          [
            "Shop",
            "Add items, create reserved copies, replace media, and redeem items"
          ],
          [
            "Admin",
            "Manage permissions, ownership, names, links, and token details. Use the contract and market controls allowed by the current rules"
          ],
          [
            "Extras",
            "Export current terms as a .jb file, create a payment-forwarding address, and manage funds supplied to markets"
          ]
        ]
      },
      {
        "type": "info",
        "text": "New terms must meet the start time, notice, and approval requirements. Timed rules also require an eligible cycle boundary. A change with too little notice is skipped."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/components/project/QueueRulesetFlow.tsx",
            "label": "Source: queue ruleset flow"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/permissions.ts",
            "label": "Source: permission catalogue"
          }
        ]
      }
    ]
  },
  {
    "id": "start-the-contracts",
    "part": "App builders",
    "audience": [
      "frontend",
      "contracts"
    ],
    "title": "Find the right contract",
    "paragraphs": [
      "Juicebox publishes [every deployed contract by chain](https://github.com/Bananapus/deploy-all-v6/tree/main/deployments), with its address and the ABI format used to call it. The [SDK](#apps-set-up-the-sdk) includes the same address map. A project can use its own contracts, so use JBDirectory to find the contracts currently managing its rules and payments before building a transaction."
    ],
    "blocks": [
      {
        "type": "diagram",
        "label": "Contract layers",
        "description": "The controller and terminal handle operations; core contracts store identity, permissions, rules, and accounting; sucker contracts connect deployments across chains.",
        "lines": [
          "SURFACE: what users call",
          "  JBController, JBMultiTerminal,",
          "  JBTerminalStore",
          "CORE: protocol state",
          "  JBProjects, JBDirectory,",
          "  JBPermissions, JBTokens,",
          "  JBRulesets, JBSplits, JBPrices,",
          "  JBFundAccessLimits,",
          "  JBFeelessAddresses",
          "OMNICHAIN: links chains",
          "  JBSucker, JBSuckerDeployer,",
          "  JBSuckerRegistry"
        ]
      },
      {
        "type": "table",
        "label": "Who does what",
        "rows": [
          [
            "JBProjects",
            "Records each project’s owner as a unique NFT"
          ],
          [
            "JBController",
            "Manages rules, creates project tokens, and records project details"
          ],
          [
            "JBMultiTerminal",
            "Receives payments, holds funds, sends payouts, and handles cash outs"
          ],
          [
            "JBRulesets, JBSplits, JBFundAccessLimits, JBTokens, JBTerminalStore",
            "Store rules, recipients, spending limits, tokens, and balances"
          ],
          [
            "JBDirectory",
            "Finds the controller that manages a project’s rules and the terminals that take its payments"
          ],
          [
            "JBPermissions",
            "Records permission to act for another account"
          ],
          [
            "JBPrices",
            "Converts currencies when calculating new tokens and spending limits"
          ],
          [
            "JBFeelessAddresses",
            "Lists addresses that pay and receive without the protocol fee"
          ],
          [
            "JB721TiersHook + deployer",
            "Adds a shop to project payments"
          ],
          [
            "JBBuybackHookRegistry + JBBuybackHook",
            "Buys existing tokens on Uniswap V4 when that gives the payer more tokens"
          ],
          [
            "JBSucker + JBSuckerRegistry, JBOmnichainDeployer",
            "Links projects and moves tokens between chains"
          ],
          [
            "JBRouterTerminalRegistry",
            "Finds supported ways to convert a payment into an accepted token"
          ],
          [
            "REVDeployer, REVOwner, REVLoans",
            "Revnets"
          ]
        ]
      },
      {
        "type": "points",
        "items": [
          {
            "key": "Chains",
            "text": "Ethereum, Base, Arbitrum, and Optimism, plus their Sepolia test networks. Find the list in the SDK’s SUPPORTED_CHAINS and JB_CHAINS."
          },
          {
            "key": "Source",
            "text": "[the V6 source](https://github.com/Bananapus/version-6) is current. Older Juicebox versions are not interchangeable with it, and this site redirects unknown routes to the legacy app for those."
          }
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/deploy-all-v6",
            "label": "Deployed addresses"
          },
          {
            "href": "https://github.com/Bananapus/nana-core-v6",
            "label": "Core contract source"
          },
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Every V6 repository"
          }
        ]
      }
    ]
  },
  {
    "id": "start-operation-map",
    "part": "App builders",
    "audience": [
      "frontend",
      "contracts"
    ],
    "title": "Find a contract call",
    "paragraphs": [
      "The contract call and [SDK](#apps-set-up-the-sdk) builder behind each action. Some actions need more than one transaction, such as approving a token before paying. Examples later in this guide use placeholders; replace them before use."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "User action → contract call",
        "rows": [
          [
            "Launch a project",
            "JBController.launchProjectFor, or the 721 / omnichain deployers (buildLaunchProjectTx / buildOmnichainLaunchProjectTx)"
          ],
          [
            "Launch a revnet",
            "REVDeployer.deployFor (buildDeployRevnetTx)"
          ],
          [
            "Pay",
            "JBMultiTerminal.pay (buildPayTx)"
          ],
          [
            "Buy a shop item",
            "JBMultiTerminal.pay with 721 metadata (build721PayMetadata)"
          ],
          [
            "Add funds, no tokens",
            "JBMultiTerminal.addToBalanceOf"
          ],
          [
            "Cash out",
            "JBMultiTerminal.cashOutTokensOf (prepareHookAwareCashOut)"
          ],
          [
            "Send payouts",
            "JBMultiTerminal.sendPayoutsOf"
          ],
          [
            "Withdraw surplus allowance",
            "JBMultiTerminal.useAllowanceOf"
          ],
          [
            "Send reserved tokens to other recipients",
            "JBController.sendReservedTokensToSplitsOf"
          ],
          [
            "Schedule new terms",
            "JBController.queueRulesetsOf (buildQueueRulesetsTx)"
          ],
          [
            "Edit recipients and shares",
            "JBController.setSplitGroupsOf (buildSetSplitGroupsTx)"
          ],
          [
            "Create the project’s transferable ERC-20 token contract",
            "JBController.deployERC20For (buildDeployErc20Tx)"
          ],
          [
            "Move tokens tracked in Juicebox into the ERC-20",
            "JBController.claimTokensFor (buildClaimTokensTx)"
          ],
          [
            "Create more tokens",
            "JBController.mintTokensOf (buildMintTokensTx)"
          ],
          [
            "Give someone permission",
            "JBPermissions.setPermissionsFor (buildSetPermissionsTx)"
          ],
          [
            "Manage the shop",
            "JB721TiersHook.adjustTiers / mintFor"
          ],
          [
            "Move tokens to another chain",
            "sucker.prepare → toRemote → claim"
          ],
          [
            "Choose a market for buying existing tokens",
            "JBBuybackHookRegistry.initializePoolFor / setHookFor"
          ],
          [
            "Create an address that forwards payments",
            "JBProjectPayerDeployer (buildDeployProjectPayerTx)"
          ]
        ]
      },
      {
        "type": "text",
        "text": "Store amounts as whole numbers in the token’s smallest unit, using bigint. Convert only for display. Identify each project by both chain ID and project ID. Linked projects share a sucker group ID, but keep separate addresses, balances, and rule IDs on each chain."
      }
    ]
  },
  {
    "id": "apps-set-up-the-sdk",
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Set up the SDK",
    "paragraphs": [
      "The Juicebox SDK, @bananapus/nana-sdk-core, helps you read projects and prepare transactions. It includes addresses and contract ABIs. Import shared addresses, formats, and project details from the package root; import V6 reads and transaction builders from /v6.",
      "A builder prepares a request without sending it: { chainId, address, abi, functionName, args, value }. Read with a public client and sign with a wallet client on the same chain."
    ],
    "blocks": [
      {
        "type": "links",
        "items": [
          {
            "href": "/build/first-payment#read",
            "label": "Start Your first test payment"
          },
          {
            "href": "/examples/read-project.mjs",
            "label": "Download the tested read-project.mjs example"
          },
          {
            "href": "/build/first-payment#preview",
            "label": "Next: preview, simulate, and inspect a payment"
          }
        ]
      },
      {
        "type": "text",
        "text": "The tutorial uses an existing project on the Base Sepolia test network. It includes the full working example, package versions, expected output, and help when a step fails."
      },
      {
        "type": "table",
        "label": "SDK exports, grouped (from /v6 unless marked)",
        "rows": [
          [
            "Reads",
            "getAccountingContexts, resolvePaymentTerminal, getCurrentRuleset, getUpcomingRuleset, getAllRulesets, previewPay, prepareUserPay, getCashOutQuote, getHookAwareCashOutQuote, getV6SuckerPairs, getSuckerMovements, getTokenAddress, getCreditBalance, getProjectCreationFee, getProject721Shop, hasPermissions, getBorrowableAmount"
          ],
          [
            "Builders",
            "buildLaunchProjectTx, buildOmnichainLaunchProjectTx, buildDeployRevnetTx, buildPayTx, buildCashOutTx, buildQueueRulesetsTx, buildOmnichainQueueRulesetsTx, buildSetSplitGroupsTx, buildSetPermissionsTx, buildDeployErc20Tx, buildClaimTokensTx, buildTransferCreditsTx, buildMintTokensTx, buildBurnTokensTx, buildDeployProjectPayerTx, buildBridgePrepareTx, buildToRemoteTx, buildBridgeClaimTx, buildSyncAccountingDataTx, buildPermit2ApproveTx, buildBorrowTx, buildRepayLoanTx"
          ],
          [
            "Config builders",
            "buildRulesetConfiguration, buildRulesetMetadata, buildAccountingContext, buildTerminalConfigurations, buildSplit, fillSplitPercents, buildTierMetadata, build721RulesetMetadata, build721PayMetadata, buildRevnetStageConfig"
          ],
          [
            "Constants (/v6)",
            "slippageFloor, RULESET_WEIGHT_INHERIT, STANDARD_FEE, MAX_FEE, RESERVED_TOKEN_SPLIT_GROUP_ID, payoutSplitGroupId, PERMIT2_ADDRESS, the uniswapV4* math family"
          ],
          [
            "Constants (package root)",
            "MAX_RESERVED_PERCENT, MAX_CASH_OUT_TAX_RATE, SPLITS_TOTAL_PERCENT, NATIVE_TOKEN, USDC_ADDRESSES"
          ],
          [
            "Sub-entries",
            "/v6/loans, /v6/loan-math, /v6/cash-out, /v6/permit2, /v6/uniswap-v4, /chains, /jbcenter, /review, /safe, /bendystraw-operations, /testing"
          ]
        ]
      },
      {
        "type": "code",
        "label": "TypeScript imports and address lookup (chainId supplied by your app)",
        "lang": "ts",
        "code": "import {\n  buildPayTx, buildQueueRulesetsTx, buildRulesetConfiguration, buildRulesetMetadata,\n  buildSetSplitGroupsTx, getCurrentRuleset, previewPay, slippageFloor,\n} from \"@bananapus/nana-sdk-core/v6\";\n\nimport {\n  getJBContractAddress, JBCoreContracts, jbMultiTerminalAbi, type JBChainId,\n} from \"@bananapus/nana-sdk-core\";\n\nconst multiTerminal = getJBContractAddress(JBCoreContracts.JBMultiTerminal, 6, chainId);"
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://www.npmjs.com/package/@bananapus/nana-sdk-core",
            "label": "V6 SDK package"
          },
          {
            "href": "https://github.com/Bananapus/juice-sdk-v4",
            "label": "SDK source (repository name is historical; includes V6)"
          },
          {
            "href": "https://github.com/Bananapus/juice-sdk-v4/blob/main/packages/core/src/v6/rulesets.ts",
            "label": "Ruleset reader source"
          },
          {
            "href": "/create",
            "label": "Create a testnet project"
          }
        ]
      }
    ]
  },
  {
    "id": "apps-juicebox-center",
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Juicebox Center: RPC, IPFS, and indexed data",
    "paragraphs": [
      "Juicebox Center (juicebox.center) runs the shared services an app needs, so you hold no provider keys. Read any supported chain through its RPC, pin and read files on IPFS, query [Bendystraw](#apps-indexed-data) data through its API, and connect assistants through its [MCP](#founders-launch-with-an-agent)."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Services",
        "rows": [
          [
            "RPC",
            "POST https://juicebox.center/v1/rpc/<chainId>. Read methods only, no key, any origin; approved sites get a higher budget. Log queries span at most 50,000 blocks"
          ],
          [
            "IPFS",
            "POST /v1/pins/json (2 MiB), /v1/pins/file (25 MiB images), /v1/pins/media (500 MiB) from approved site origins. Read anything at juicebox.center/ipfs/<cid>"
          ],
          [
            "Indexed data",
            "The /api/v1 REST API serves Bendystraw records and contract reads with signed requests; Bendystraw’s own endpoint stays open too"
          ],
          [
            "MCP",
            "https://juicebox.center/mcp: reads, quotes, and unsigned transaction plans for assistants. Connect with claude mcp add --transport http juicebox https://juicebox.center/mcp"
          ]
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://juicebox.center",
            "label": "Juicebox Center"
          },
          {
            "href": "https://juicebox.center/api",
            "label": "API directory"
          }
        ]
      }
    ]
  },
  {
    "id": "apps-read-a-project",
    "aliases": [
      "build-configure"
    ],
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Read a project",
    "paragraphs": [
      "Use the index (next section) to find and display projects. Use the chain for anything a signature depends on, and read it again right before signing. Where the [SDK](#apps-set-up-the-sdk) has a reader for a row, the row names it; each takes a public client and { chainId, projectId, … }."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "What to read, and where",
        "rows": [
          [
            "Owner and project details",
            "JBProjects.ownerOf / JBController.uriOf"
          ],
          [
            "Controller, terminals",
            "JBDirectory.controllerOf / terminalsOf / primaryTerminalOf"
          ],
          [
            "Current, next, queued rulesets",
            "JBController.currentRulesetOf / upcomingRulesetOf / latestQueuedRulesetOf / allRulesetsOf. SDK: getCurrentRuleset, getUpcomingRuleset, getAllRulesets"
          ],
          [
            "Accepted tokens",
            "JBMultiTerminal.accountingContextsOf. SDK: getAccountingContexts"
          ],
          [
            "Balance and surplus",
            "JBTerminalStore.balanceOf(terminal, projectId, token) / currentSurplusOf / usedPayoutLimitOf / usedSurplusAllowanceOf"
          ],
          [
            "Limits",
            "JBFundAccessLimits.payoutLimitOf / surplusAllowanceOf"
          ],
          [
            "Supply and balances",
            "JBTokens.totalSupplyOf / totalBalanceOf / creditBalanceOf / tokenOf. SDK: getCreditBalance, getTokenAddress"
          ],
          [
            "Splits",
            "JBSplits.splitsOf(projectId, rulesetId, groupId)"
          ],
          [
            "Pending reserved tokens",
            "JBController.pendingReservedTokenBalanceOf"
          ],
          [
            "Cash out quote",
            "JBMultiTerminal.previewCashOutFrom. SDK: getHookAwareCashOutQuote"
          ],
          [
            "Permissions",
            "JBPermissions.hasPermission / hasPermissions. SDK: hasPermissions"
          ],
          [
            "Chains",
            "JBSuckerRegistry.suckerPairsOf. SDK: getV6SuckerPairs"
          ]
        ]
      },
      {
        "type": "info",
        "text": "Show cached names, logos, and facts while the chain refreshes. Treat state you could not read as unknown, never as zero, empty, or permitted."
      }
    ]
  },
  {
    "id": "apps-indexed-data",
    "part": "App builders",
    "title": "Search project data with Bendystraw",
    "paragraphs": [
      "Bendystraw indexes Juicebox chain records into a searchable database. It supplies project lists, activity, charts, and market positions through GraphQL queries.",
      "Use it for fast browsing. Before signing, read balances, terms, spending approvals, and quotes directly from the chain again. The index can be a few blocks behind, so missing activity does not prove that a transaction failed."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Endpoints",
        "rows": [
          [
            "https://bendystraw.up.railway.app/graphql",
            "Mainnets: Ethereum, Base, Arbitrum, Optimism. No API key needed"
          ],
          [
            "https://testnet.bendystraw.xyz/graphql",
            "Testnets: Sepolia and the L2 Sepolias"
          ],
          [
            "…/schema",
            "A playground with the schema explorer; POST an introspection query to the graphql URL for codegen (same schema on both databases)"
          ]
        ]
      },
      {
        "type": "code",
        "label": "A first query",
        "lang": "bash",
        "code": "curl -s https://bendystraw.up.railway.app/graphql -H 'content-type: application/json' -d '{\"query\":\"{ projects(where:{chainId:8453,version:6}, orderBy:\\\"balanceUsd\\\", orderDirection:\\\"desc\\\", limit:10){ items{ projectId chainId name balance balanceUsd tokenSymbol decimals suckerGroupId } totalCount } }\"}'"
      },
      {
        "type": "table",
        "label": "What to ask it for",
        "rows": [
          [
            "projects / project(chainId, projectId, version: 6)",
            "Name, metadata URI, balance, token, owner, and the sucker group that links its chains"
          ],
          [
            "balance, volume",
            "BigInt strings in the project’s own token; read token, tokenSymbol, and decimals to format them"
          ],
          [
            "balanceUsd, volumeUsd",
            "BigInt strings with 18 decimals; 0 when the token has no price feed"
          ],
          [
            "limit",
            "At most 1000 rows per page; the default is 50"
          ],
          [
            "payEvents, cashOutTokensEvents, activityEvents",
            "The feed behind any project page; filter by projectId or suckerGroupId"
          ],
          [
            "participants",
            "Token holders and their balances, per project or per sucker group"
          ],
          [
            "buybackPools, swapEvents, buybackPoolPositions",
            "Market pools, prices after trades, and the price ranges funded by liquidity providers"
          ],
          [
            "loans, borrowLoanEvents",
            "Revnet loans and their collateral"
          ],
          [
            "nftTiers, mintNftEvents",
            "721 shop tiers and purchases"
          ],
          [
            "suckerTransactions",
            "Cross-chain moves and where each one is in its lifecycle"
          ]
        ]
      },
      {
        "type": "steps",
        "items": [
          "Every V6 row is versioned: filter with version: 6, and key a project by chainId + projectId, never projectId alone — the same number exists on every chain.",
          "Numeric arguments on singular queries are Float!, not Int! (Ponder’s choice). Declare variables as Float! or the request fails validation with no data.",
          "Lists page with limit and offset and return totalCount; loop until you have them all rather than trusting one page.",
          "suckerGroupId is as-of-event: when chains are linked later, old event rows keep the group id they were written with. Query by every project in the group when you need the full history.",
          "The [SDK](#apps-set-up-the-sdk)’s requestBendystraw(endpoint, query, variables) handles the POST, error surfacing, and endpoint normalisation; selectBendystrawEndpoint picks mainnet vs testnet from a chainId. Both import from the package root.",
          "Do not send GraphQL text from a browser to an index you expose. Register each query on your server under an operation id and have the browser post { operation, variables } to a same-origin route that validates them. Keep heavy history and ranking queries server-only.",
          "Pool reserves need no RPC: sum the indexed positions at the latest swap’s sqrtPriceX96. The jb-bendystraw skill has the recipe."
        ]
      },
      {
        "type": "info",
        "text": "Give your assistant the /jb-bendystraw skill for help with queries, charts, and holder lists. It is part of the [Juicebox V6 skills library](https://github.com/mejango/juicebox-skills). See the [Bendystraw source](https://github.com/peripheralist/bendystraw)."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/bendystraw.ts",
            "label": "Source reference"
          }
        ]
      }
    ],
    "aliases": [
      "build-bendystraw"
    ],
    "audience": [
      "frontend"
    ]
  },
  {
    "id": "apps-accept-payments",
    "aliases": [
      "build-fund"
    ],
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Accept payments",
    "paragraphs": [
      "A payment goes to the project’s terminal, which issues tokens under the current ruleset. When a buyback hook finds more tokens in the pool, it buys there instead and gives the payer every token it buys. prepareUserPay returns the metadata to send, the preview to show and the minimum to sign with. With a usable pool quote, the minimum is that quote less 1%. Otherwise it is about what minting alone gives the payer less 1%, which can be far below the preview.",
      "For an ERC-20, approve only the request’s address for only the amount. Native payments carry the amount as value. A shop purchase is a payment with tier metadata: show every item and the token result in the review. addToBalanceOf adds funds without issuing tokens."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "Quote, build, and send the payment",
        "lang": "ts",
        "code": "import { buildPayTx, prepareUserPay, resolvePaymentTerminal } from \"@bananapus/nana-sdk-core/v6\";\n\n// Your app supplies publicClient, walletClient, account, chainId, projectId,\n// token, amount, beneficiary, and memo.\nconst { address: terminal } = await resolvePaymentTerminal(publicClient, { chainId, projectId, token });\n\nconst { metadata, preview, minReturnedTokens } = await prepareUserPay(publicClient, {\n  chainId, terminal, projectId, token, amount, beneficiary,\n  // Shop purchase: add tiers: { metadataIdTarget, tierIdsToMint }\n});\nif (preview.beneficiaryTokenCount <= 0n) throw new Error(\"No token output; review the payment terms\");\n\nconst tx = buildPayTx({\n  chainId, terminal, projectId, token, amount, beneficiary, metadata,\n  minReturnedTokens, // usable pool quote less 1%; else about the mint amount less 1%\n  memo,\n});\n\n// ERC-20: approve tx.address for amount before this step. Native: tx.value === amount.\nconst { request } = await publicClient.simulateContract({ ...tx, account });\nconst hash = await walletClient.writeContract(request);\nconst receipt = await publicClient.waitForTransactionReceipt({ hash });\nif (receipt.status !== \"success\") throw new Error(\"Payment reverted\");"
      },
      {
        "type": "table",
        "label": "Helpers",
        "rows": [
          [
            "Quote",
            "prepareUserPay (metadata, preview and minimum); previewPay for a preview only"
          ],
          [
            "Shop metadata",
            "tiers on prepareUserPay"
          ],
          [
            "Token not accepted directly",
            "resolvePaymentTerminal finds the registry entry; terminalOf resolves its gateway or previous router"
          ],
          [
            "Balances",
            "JBTerminalStore.balanceOf(terminal, projectId, token) / currentSurplusOf"
          ]
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/JBMultiTerminal.sol",
            "label": "JBMultiTerminal.sol"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-pay-hook/SKILL.md",
            "label": "jb-pay-hook skill"
          }
        ]
      }
    ]
  },
  {
    "id": "apps-cash-out",
    "aliases": [
      "build-cashout"
    ],
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Cash out",
    "paragraphs": [
      "Holders exchange tokens for part of the surplus: the balance not scheduled for payouts. The cash out tax sets how much stays for remaining holders; 0 returns a proportional share, 1 turns cash outs off. The tokens are burned.",
      "Quote with previewCashOutFrom, which runs the project’s data hook and any buyback decision; a surplus-only calculation can disagree with the real transaction. The route decides where the minimum goes: minTokensReclaimed on the terminal path, buyback metadata on the pool path. Re-quote after any change to rules, supply, balance, pool, or fees."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "Prepare a cash out with the hook-aware quote",
        "lang": "ts",
        "code": "const prepared = await prepareHookAwareCashOut(publicClient, {\n  chainId, terminal, holder, projectId, cashOutCount, tokenToReclaim,\n  beneficiary,\n});\n\nconst { route, transaction: tx } = prepared;\n// Pool routes are re-previewed with their slippage metadata before return."
      },
      {
        "type": "table",
        "label": "Token accounts",
        "rows": [
          [
            "Claim credits as ERC-20",
            "buildClaimTokensTx (JBController.claimTokensFor)"
          ],
          [
            "Burn",
            "buildBurnTokensTx (JBController.burnTokensOf)"
          ]
        ]
      },
      {
        "type": "info",
        "text": "Credits and claimed ERC-20 tokens behave differently on the market. Only compare a pool route for the claimed balance the router can spend."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/learn#learn-cash-outs",
            "label": "Cash outs, with a worked example"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-cash-out-hook/SKILL.md",
            "label": "jb-cash-out-hook skill"
          }
        ]
      }
    ]
  },
  {
    "id": "apps-move-across-chains",
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Move tokens across chains",
    "paragraphs": [
      "Sucker contracts bridge tokens between linked projects in pairs. A move has separate steps: prepare on the source chain, send through a bridge, then claim on the destination with a proof. A source receipt does not mean the destination tokens are ready.",
      "Track each move’s source sucker, peer, token mapping, leaf index, beneficiary, proof, fees, and status, and keep queued, in transit, claimable, claimed, and failed distinct. CCIP and native bridges need different value and take different times; find the payable value by simulating the exact call. Accounting sync is separate: it updates the peer’s view of the balance without moving funds."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Sucker sequence",
        "rows": [
          [
            "1. prepare (source)",
            "buildBridgePrepareTx: burn the tokens and queue a leaf"
          ],
          [
            "2. toRemote (source)",
            "buildToRemoteTx: send the tree root through the bridge"
          ],
          [
            "3. claim (destination)",
            "buildBridgeClaimTx or claimFromSuckerMovement: prove the leaf and mint"
          ],
          [
            "syncAccountingData",
            "buildSyncAccountingDataTx: push the local balance snapshot to the peer"
          ],
          [
            "Peers and moves",
            "getV6SuckerPairs; getSuckerMovements"
          ]
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/nana-suckers-v6",
            "label": "nana-suckers-v6"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-suckers/SKILL.md",
            "label": "jb-suckers skill"
          }
        ]
      }
    ]
  },
  {
    "id": "apps-wallets-safe-relayr",
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Connect wallets and request approval",
    "paragraphs": [
      "A wallet can send a transaction directly. A shared Safe wallet needs a proposal and approvals before execution. A group of approved calls can be sent across chains with one payment. Permit2 grants limited token spending for swaps. This site chooses the flow based on the connected account."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Signing paths in this site",
        "rows": [
          [
            "Wallet write",
            "submitReviewedContractWrite: review the decoded call → switch chain → simulate as the connected account → sign → wait for the receipt"
          ],
          [
            "Actions on behalf of an owner",
            "runAuthorityCalls selects the flow. A directly controlled wallet signs itself. An account that supports forwarded calls (ERC-2771) can approve a prepaid bundle. A Safe receives proposals in its transaction service"
          ],
          [
            "Safe",
            "Propose, approve, then execute. A Safe can use the same address on another chain, but its deployment and signing authority must be checked on each chain"
          ],
          [
            "Permit2",
            "Used for direct Uniswap V4 swaps. Other token payments use approve for the exact amount"
          ]
        ]
      },
      {
        "type": "text",
        "text": "Chain reads go through [Juicebox Center](#apps-juicebox-center)’s RPC. Connections include browser wallets, WalletConnect, Coinbase, and Safe. Para provides an embedded wallet and card purchases. A Safe’s L1 and L2 versions differ, so a Safe that controls a project on one chain may not exist at the same address on another; check before offering an action there."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/authority.ts",
            "label": "runAuthorityCalls"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/relayr.ts",
            "label": "Cross-chain execution"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/safe.ts",
            "label": "Safe"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-relayr/SKILL.md",
            "label": "Cross-chain execution integration skill"
          }
        ]
      }
    ]
  },
  {
    "id": "apps-metadata-and-ipfs",
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Save names, descriptions, and media",
    "blocks": [
      {
        "type": "points",
        "items": [
          {
            "key": "Shape",
            "text": "JBProjectMetadata: name, description, projectTagline, logoUri, coverImageUri, infoUri, payButton, payDisclosure, tags, twitter, telegram, discord, archived."
          },
          {
            "key": "Read",
            "text": "getProjectMetadata(publicClient, { jbControllerAddress, projectId }) resolves the project’s uri and fetches it; ipfsUri and cidFromIpfsUri handle the encoding. All three import from the package root."
          },
          {
            "key": "Pin",
            "text": "this site pins JSON, images (25 MB), and media (500 MB) straight from the browser to [Juicebox Center](#apps-juicebox-center), which is origin-allowlisted and guards against empty files. The gateway is juicebox.center/ipfs/."
          },
          {
            "key": "Write",
            "text": "the owner updates the pointer with JBController.setUriOf (SET_PROJECT_URI)."
          }
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/jbcenter-ipfs.ts",
            "label": "Juicebox Center IPFS client"
          }
        ]
      }
    ]
  },
  {
    "id": "apps-transaction-boundary",
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Review, send, and confirm a transaction",
    "paragraphs": [
      "Use one request from preview through submission. Just before signing, refresh balances, limits, and permissions. Prepare the request, run a trial with the actual account, and show what it does and the minimum it will return. After sending, distinguish a rejected wallet request, a shared-wallet proposal, a pending transaction, and a confirmed success or failure.",
      "The app checks that the encoded request still matches what the user reviewed. Its trial uses eth_call with a gas limit. A source check also verifies that every contract write uses one of the reviewed submission functions."
    ],
    "blocks": [
      {
        "type": "diagram",
        "label": "Build → simulate → decode → review → write → confirm",
        "description": "Refresh chain state, build one request, simulate it for the actual account, decode and review it, then submit that same request. Report success only after a successful transaction receipt.",
        "lines": [
          "1. fresh reads",
          "2. pure builder",
          "3. simulateContract, real account",
          "4. decode the calldata, show the user",
          "5. writeContract",
          "6. waitForTransactionReceipt",
          "7. success only when",
          "   receipt.status === \"success\""
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/transaction-review.ts",
            "label": "Review"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/src/lib/transaction-builders.ts",
            "label": "Every write builder"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/scripts/check-transaction-inventory.mjs",
            "label": "Write-site inventory check"
          }
        ]
      }
    ]
  },
  {
    "id": "apps-run-this-site",
    "part": "App builders",
    "audience": [
      "frontend"
    ],
    "title": "Run this site locally",
    "paragraphs": [
      "Use the Node.js version in .nvmrc and npm 12 (the engines in package.json). Copy the example public configuration before starting. NEXT_PUBLIC values are shipped to the browser, so they must never contain private keys or secrets."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "Clone, install, and start the reference app",
        "lang": "bash",
        "code": "git clone https://github.com/mejango/juicebox-money.git\ncd juicebox-money\nnpm ci\ncp .env.example .env.local\nnpm run dev"
      },
      {
        "type": "text",
        "text": "Open http://localhost:3001. Confirm the configured indexer, RPC service, wallet providers, and allowed origin work in your environment. Start with project reads, then connect a testnet wallet for transaction flows."
      },
      {
        "type": "table",
        "label": "Commands",
        "rows": [
          [
            "npm run dev",
            "Next.js on port 3001"
          ],
          [
            "npm run check",
            "Full repository gate: dependencies, types, lint, source/deployment/schema checks, tests, production build, browser checks, and budgets"
          ],
          [
            "npm test / npm run test:browser",
            "Vitest, then Playwright against the built app with a fixture server"
          ],
          [
            "npm run schema:check",
            "Regenerates and verifies the Bendystraw operation registry"
          ]
        ]
      },
      {
        "type": "points",
        "items": [
          {
            "key": "Env",
            "text": "NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_BENDYSTRAW_URL, NEXT_PUBLIC_TESTNET_BENDYSTRAW_URL, NEXT_PUBLIC_PARA_API_KEY, NEXT_PUBLIC_PARA_ENV, NEXT_PUBLIC_VERSION; WalletConnect and the on-ramp provider are optional. No RPC or IPFS keys live in the client."
          },
          {
            "key": "Tests",
            "text": "the fixture-based browser suite isolates external services; use the documented fork and live-service checks separately when validating an integration."
          }
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-money",
            "label": "Repository"
          },
          {
            "href": "https://github.com/mejango/juicebox-money/blob/main/TESTING.md",
            "label": "TESTING.md"
          }
        ]
      }
    ]
  },
  {
    "id": "build-tokens-mgmt",
    "part": "Life of a project",
    "title": "Manage tokens",
    "paragraphs": [
      "Juicebox can track token balances itself as credits. A project can also create a separate token contract using the ERC-20 standard. Holders can then move credits into that contract. Count both forms when showing a holder’s total balance."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Token operations",
        "rows": [
          [
            "JBController.deployERC20For(projectId, name, symbol, salt)",
            "Deploy the project’s ERC-20 token"
          ],
          [
            "JBTokens.tokenOf(projectId)",
            "Get the ERC-20 address (zero if not yet deployed)"
          ],
          [
            "JBTokens.totalBalanceOf(holder, projectId)",
            "Complete holdings (credits + ERC-20)"
          ],
          [
            "JBTokens.creditBalanceOf(holder, projectId)",
            "Internal credits only"
          ],
          [
            "JBController.claimTokensFor(holder, projectId, count, beneficiary)",
            "Convert credits into ERC-20 tokens"
          ]
        ]
      },
      {
        "type": "table",
        "label": "Minting & burning",
        "rows": [
          [
            "JBController.mintTokensOf(projectId, tokenCount, beneficiary, memo, useReservedPercent)",
            "Owner mints tokens on-demand (if ruleset allows)"
          ],
          [
            "JBController.burnTokensOf(holder, projectId, tokenCount, memo)",
            "Holder burns their own tokens"
          ]
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "frontend",
      "contracts"
    ]
  },
  {
    "id": "build-distribute",
    "part": "Life of a project",
    "title": "Send funds and reserved tokens",
    "paragraphs": [
      "Payouts send funds to the project’s chosen recipients, and reserved tokens send new tokens to recipients other than the payer. Anyone can normally trigger these distributions, but the ownerMustSendPayouts setting can restrict payouts to the owner or an operator with SEND_PAYOUTS permission."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "JBMultiTerminal.sendPayoutsOf (call outline)",
        "lang": "solidity",
        "code": "sendPayoutsOf(\n  projectId,\n  token,\n  amount,              // up to the payout limit\n  currency,\n  minTokensPaidOut     // minimum amount the recipient must receive\n)\n// Distributes to splits, leftover to project owner\n// Review the final amount each recipient will receive"
      },
      {
        "type": "code",
        "label": "JBController.sendReservedTokensToSplitsOf (call outline)",
        "lang": "solidity",
        "code": "sendReservedTokensToSplitsOf(projectId)\n// Anyone can call this at any time\n// Mints accumulated reserved tokens and distributes to splits"
      },
      {
        "type": "table",
        "label": "Tracking usage",
        "rows": [
          [
            "JBTerminalStore.usedPayoutLimitOf(...)",
            "How much of the payout limit has been used this cycle"
          ],
          [
            "JBTerminalStore.usedSurplusAllowanceOf(...)",
            "How much surplus allowance has been used"
          ],
          [
            "JBController.pendingReservedTokenBalanceOf(projectId)",
            "Undistributed reserved tokens"
          ]
        ]
      },
      {
        "type": "info",
        "text": "Recipients and their shares are stored as splits. Calling sendPayoutsOf() sends funds to those recipients; any leftover goes to the project owner."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "frontend",
      "contracts"
    ]
  },
  {
    "id": "revnet-go-deeper",
    "aliases": [
      "build-revnet-deploy",
      "build-revnet-stages"
    ],
    "part": "Revnets",
    "title": "Build with revnets",
    "paragraphs": [
      "A revnet uses the same payment, cash out, and bridge calls as any project, so everything above applies. The Revnet build guide covers what only revnets have: launching with REVDeployer.deployFor, stages, splits, loans, and the operator."
    ],
    "blocks": [
      {
        "type": "links",
        "items": [
          {
            "href": "https://revnet.money/build#launch-without-code",
            "label": "Launch a revnet"
          },
          {
            "href": "https://revnet.money/build#install-and-deploy-from-solidity",
            "label": "deployFor, field by field"
          },
          {
            "href": "https://revnet.money/build#operate-loans",
            "label": "Loans"
          },
          {
            "href": "https://revnet.money/build#operator-operations",
            "label": "Operator actions"
          },
          {
            "href": "https://revnet.money/build",
            "label": "The whole Revnet build guide"
          }
        ]
      }
    ]
  },
  {
    "id": "contracts-install-and-launch",
    "aliases": [
      "build-launch",
      "build-evolve"
    ],
    "part": "Contract builders",
    "audience": [
      "contracts"
    ],
    "title": "Install the code and launch from Solidity",
    "paragraphs": [
      "The V6 repos ship as npm packages and import by package path; remappings.txt in every repo only maps forge-std, and node_modules resolves the rest. Solidity 0.8.28."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Packages",
        "rows": [
          [
            "@bananapus/core-v6",
            "Terminals, controller, tokens, splits, permissions, prices, the hook interfaces"
          ],
          [
            "@bananapus/721-hook-v6",
            "Shop tiers and the 721 project deployer"
          ],
          [
            "@bananapus/omnichain-deployers-v6",
            "Launch plus suckers in one call"
          ],
          [
            "@bananapus/buyback-hook-v6, @bananapus/suckers-v6, @bananapus/router-terminal-v6",
            "Pool routing, cross-chain, token routing"
          ],
          [
            "@bananapus/project-payer-v6, @bananapus/project-handles-v6, @bananapus/distributor-v6",
            "Payer addresses, ENS handles, distributor"
          ],
          [
            "@bananapus/permission-ids-v6",
            "The permission ID constants"
          ],
          [
            "@rev-net/core-v6",
            "Revnets"
          ]
        ]
      },
      {
        "type": "table",
        "label": "launchProjectFor, field by field",
        "rows": [
          [
            "JBController.launchProjectFor",
            "(address owner, string projectUri, JBRulesetConfig[] rulesetConfigurations, JBTerminalConfig[] terminalConfigurations, string memo) payable → projectId. msg.value must equal JBProjects.creationFee() exactly"
          ],
          [
            "JBController.queueRulesetsOf",
            "(uint256 projectId, JBRulesetConfig[] rulesetConfigurations, string memo). Schedules new terms. The current timing and approval requirements decide when they can begin"
          ],
          [
            "JBRulesetConfig",
            "mustStartAtOrAfter (uint48; 0 = now), duration (uint32 seconds; 0 = until replaced), weight (uint112, 18-dec tokens per base-currency unit; 1 = inherit the decayed weight, 0 = no issuance), weightCutPercent (uint32, of 1e9), approvalHook, metadata, splitGroups[], fundAccessLimitGroups[]"
          ],
          [
            "JBRulesetMetadata",
            "reservedPercent (uint16, of 10,000), cashOutTaxRate (uint16, of 10,000; 10,000 = cash outs off), baseCurrency (uint32: 1 = ETH, 2 = USD, or uint32(uint160(token))), pausePay, pauseCreditTransfers, allowOwnerMinting, allowSetCustomToken, allowTerminalMigration, allowSetTerminals, allowSetController, allowAddAccountingContext, allowAddPriceFeed, ownerMustSendPayouts, holdFees, scopeCashOutsToLocalBalances, useDataHookForPay, useDataHookForCashOut, dataHook, metadata (uint16, 14 usable bits)"
          ],
          [
            "JBFundAccessLimitGroup",
            "terminal, token, payoutLimits[] and surplusAllowances[] as { amount (uint224, in the token’s decimals), currency (uint32) }, sorted by strictly increasing currency. Empty = no payouts; type(uint224).max = unlimited. Per chain, never aggregate"
          ],
          [
            "JBTerminalConfig",
            "terminal, accountingContextsToAccept[] of { token, decimals (uint8), currency (uint32) }. NATIVE_TOKEN is 0x…EEEe with currency 61166"
          ],
          [
            "JBSplitGroup / JBSplit",
            "groupId (1 = reserved tokens; uint256(uint160(token)) = payouts in that token), splits[] of { percent (uint32, of 1e9), projectId (uint64), beneficiary, preferAddToBalance, lockedUntil (uint48), hook }. Routing: hook, else projectId, else beneficiary"
          ],
          [
            "JBOmnichainDeployer.launchProjectFor",
            "(owner, projectUri, JBOmnichain721Config, rulesetConfigurations, terminalConfigurations, memo, JBSuckerDeploymentConfig) payable → (projectId, hook, suckers[]). Also deploys this chain’s suckers; the sucker salt is keccak256(sender, salt), so the same sender must launch on every chain"
          ],
          [
            "JB721TiersHookProjectDeployer.launchProjectFor",
            "(owner, JBDeploy721TiersHookConfig, JBLaunchProjectConfig, controller, salt) payable → (projectId, hook). Sets the hook as the data hook"
          ]
        ]
      },
      {
        "type": "text",
        "text": "Read JBProjects.creationFee() right before each launch (getProjectCreationFee in the SDK) and pass that exact amount as value. Show it in the review before signing. buildLaunchProjectTx calls JBController.launchProjectFor directly and creates no shop; use JB721TiersHookProjectDeployer.launchProjectFor when the project needs one."
      },
      {
        "type": "info",
        "text": "queueRulesetsOf timing: with a timed base ruleset the new one snaps to the next cycle boundary; with a flexible base it starts at mustStartAtOrAfter, clamped to at least the queue time plus the approval hook’s DURATION. A JBDeadline hook fails any ruleset queued with less notice than its duration, and currentRulesetOf only honours Approved or hook-less rulesets."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/examples/launch-project.mjs",
            "label": "Download launch-project.mjs: build and simulate a launch on Base Sepolia without signing"
          },
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/JBController.sol",
            "label": "JBController.sol"
          },
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/structs/JBRulesetMetadata.sol",
            "label": "JBRulesetMetadata.sol"
          },
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/JBRulesets.sol",
            "label": "JBRulesets.sol"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-fund-access-limits/SKILL.md",
            "label": "jb-fund-access-limits skill"
          }
        ]
      }
    ]
  },
  {
    "id": "build-hooks",
    "part": "Contract builders",
    "title": "Add custom behavior with hooks",
    "paragraphs": [
      "A hook can change a payment’s token output, send rewards, or check a rule change. Choose the interface for the moment when your code needs to run."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Hook interfaces",
        "rows": [
          [
            "IJBRulesetDataHook",
            "Runs before a payment or cash out is recorded. Can change the new-token rate, cash out inputs, and which later hooks run."
          ],
          [
            "IJBPayHook",
            "Runs after a payment is recorded and tokens are created. Can deliver rewards or trigger other actions."
          ],
          [
            "IJBCashOutHook",
            "Runs after a cash out is recorded. Can receive funds and run additional actions."
          ],
          [
            "IJBSplitHook",
            "Runs when a recipient’s share is sent to an extension. Can forward or use the funds."
          ],
          [
            "IJBRulesetApprovalHook",
            "Approves new project terms before they can take effect. Must return APPROVED."
          ]
        ]
      },
      {
        "type": "text",
        "text": "[MyPayHook.sol](/examples/MyPayHook.sol) is a complete data hook and pay hook to start from. It keeps issuance unchanged, counts each payer’s payments, and accepts calls only from the project’s terminals. It is unaudited example code."
      },
      {
        "type": "info",
        "text": "Use a data hook to change the values recorded by the payment or cash out. Use later hooks to receive funds or trigger additional actions."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "contracts"
    ]
  },
  {
    "id": "contracts-hook-mechanics",
    "part": "Contract builders",
    "audience": [
      "contracts"
    ],
    "title": "Hook mechanics",
    "blocks": [
      {
        "type": "code",
        "label": "Install the hook interfaces",
        "lang": "bash",
        "code": "npm install @bananapus/core-v6"
      },
      {
        "type": "code",
        "label": "Import by package path",
        "lang": "solidity",
        "code": "import {IJBRulesetDataHook} from \"@bananapus/core-v6/src/interfaces/IJBRulesetDataHook.sol\";\nimport {IJBPayHook} from \"@bananapus/core-v6/src/interfaces/IJBPayHook.sol\";"
      },
      {
        "type": "points",
        "items": [
          {
            "key": "Installing a data hook",
            "text": "set metadata.dataHook and useDataHookForPay / useDataHookForCashOut on the ruleset. beforePayRecordedWith returns the weight to use and pay hook specifications; beforeCashOutRecordedWith returns the tax rate, count, supply, surplus, and cash out hook specifications."
          },
          {
            "key": "Funds",
            "text": "native value arrives at a pay or cash out hook as msg.value; ERC-20 arrives as an allowance you must transferFrom during the call, revoked afterwards. Quote the amount the hook will actually receive. A specification with noop = true is informational and never called."
          },
          {
            "key": "Two metadatas",
            "text": "hookMetadata is authored by the data hook, while payerMetadata / cashOutMetadata comes from the caller. Trust hookMetadata only after authenticating the calling terminal and the expected hook path; validate caller-supplied fields."
          },
          {
            "key": "Metadata format",
            "text": "JBMetadataResolver: a reserved first word, then a table of 4-byte ids with word offsets, then 32-byte-aligned blobs. createMetadata(ids, datas), addToMetadata, getDataFor(id, metadata). Ids are getId(purpose, target) = bytes4(bytes20(target) ^ bytes20(keccak256(purpose)))."
          },
          {
            "key": "Minting from a hook",
            "text": "JBController.mintTokensOf lets the terminal, the ruleset’s data hook, or any address the data hook’s hasMintPermissionFor approves mint without a grant; everyone else needs MINT_TOKENS (10) and allowOwnerMinting."
          },
          {
            "key": "Split hooks",
            "text": "a split whose hook field is set receives its share through processSplitWith. On the reserved-token path the controller approves an ERC-20 for the amount and burns whatever the hook leaves unspent; on payouts the terminal checks ERC-165 first."
          },
          {
            "key": "Reentrancy",
            "text": "a hook can call back into your contract before its first call finishes. Protect your state updates and test each callback. A guard that blocks every nested call can break intended flows. Use override(ERC165, IERC165) for supportsInterface."
          }
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/examples/MyPayHook.sol",
            "label": "Download MyPayHook.sol: a data hook and pay hook that builds with Foundry (unaudited example)"
          },
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/interfaces/IJBRulesetDataHook.sol",
            "label": "IJBRulesetDataHook.sol"
          },
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/libraries/JBMetadataResolver.sol",
            "label": "JBMetadataResolver.sol"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-pay-hook/SKILL.md",
            "label": "jb-pay-hook skill"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-cash-out-hook/SKILL.md",
            "label": "jb-cash-out-hook skill"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-split-hook/SKILL.md",
            "label": "jb-split-hook skill"
          }
        ]
      }
    ]
  },
  {
    "id": "contracts-fees",
    "aliases": [
      "founders-fees",
      "build-revnet-fees"
    ],
    "part": "Contract builders",
    "audience": [
      "contracts"
    ],
    "title": "Fees, in detail",
    "paragraphs": [
      "The 2.5% fee applies to payouts, surplus allowance withdrawals, and cash outs with a tax above 0. It is paid into the fee revnet, which returns its tokens to the fee recipient."
    ],
    "blocks": [
      {
        "type": "points",
        "items": [
          {
            "key": "Recipient",
            "text": "set a recipient for the fee payment to return tokens; a zero recipient gets none."
          },
          {
            "key": "Exempt",
            "text": "payments between projects on the same terminal, and addresses listed in JBFeelessAddresses. A transfer forwarded straight to a non-exempt extension is still charged."
          },
          {
            "key": "Fee-free surplus",
            "text": "a 0% tax cash out still pays the fee on funds that arrived through fee-free payouts, tracked as feeFreeSurplusOf."
          },
          {
            "key": "Held fees",
            "text": "with holdFees, payout and allowance fees wait 28 days. Returning funds with the return-held-fees option recovers a matching part. After the delay someone must process them. Cash out fees are never held."
          },
          {
            "key": "Failures",
            "text": "a failed direct fee payment credits the funds back to the source project. Through a router gateway, a failed fee route stays pending for retry or refund; a successful receipt does not mean it settled."
          },
          {
            "key": "Loans",
            "text": "revnet loan fees are covered in the Revnet build guide."
          }
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/JBMultiTerminal.sol",
            "label": "JBMultiTerminal.sol"
          },
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/JBFeelessAddresses.sol",
            "label": "JBFeelessAddresses.sol"
          },
          {
            "href": "https://revnet.money/build#loans-from-contracts",
            "label": "Revnet loan fees"
          },
          {
            "href": "/learn#learn-fees",
            "label": "Fees in plain language"
          }
        ]
      }
    ]
  },
  {
    "id": "contracts-migration-and-prices",
    "part": "Contract builders",
    "audience": [
      "contracts"
    ],
    "title": "Migration and price feeds",
    "paragraphs": [
      "When its rules allow it, a project can move to new contracts. JBDirectory.setControllerOf hands rules and tokens to a new controller; both controllers run checks before the handoff completes. JBMultiTerminal.migrateBalanceOf moves a balance to a terminal that accepts the same token. Neither check proves the new contract is trustworthy or keeps every old setting.",
      "JBPrices converts currencies, for example to price terms in USD while accepting ETH. It uses a project-specific feed when one exists, otherwise the default, and can use a feed in reverse. A registered feed cannot be replaced; projects add their own when allowAddPriceFeed is set. With no usable feed the action reverts; a failed lookup is never a price of zero. Feeds that watch an L2 sequencer pause price-dependent actions during an outage and a recovery period after it."
    ],
    "blocks": [
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/JBDirectory.sol",
            "label": "JBDirectory.sol"
          },
          {
            "href": "https://github.com/Bananapus/nana-core-v6/blob/main/src/JBPrices.sol",
            "label": "JBPrices.sol"
          }
        ]
      }
    ]
  },
  {
    "id": "build-permissions",
    "part": "Contract builders",
    "title": "Permissions",
    "paragraphs": [
      "Give another address permission for a specific action with JBPermissions. Choose only the permissions it needs and the project they apply to. The contract stores each permission as one bit in a 256-bit field."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "JBPermissions.setPermissionsFor (call outline)",
        "lang": "solidity",
        "code": "setPermissionsFor(\n  account,         // the address granting permission\n  permissionsData  // { operator, projectId, permissionIds[] }\n)\n// projectId = 0 is the wildcard: every project `account` controls on this chain"
      },
      {
        "type": "table",
        "label": "Checking permissions",
        "rows": [
          [
            "JBPermissions.hasPermission(operator, account, projectId, permissionId, includeRoot, includeWildcardProjectId)",
            "Check a single permission"
          ],
          [
            "JBPermissions.hasPermissions(operator, account, projectId, permissionIds[], includeRoot, includeWildcardProjectId)",
            "Check multiple permissions at once"
          ],
          [
            "JBPermissions.WILDCARD_PROJECT_ID()",
            "Returns 0 — the wildcard project ID"
          ]
        ]
      },
      {
        "type": "table",
        "label": "Permission ids",
        "rows": [
          [
            "1 - ROOT",
            "Grants every permission. Prefer the specific actions needed."
          ],
          [
            "2 - QUEUE_RULESETS",
            "Queue new rulesets for the project."
          ],
          [
            "3 - LAUNCH_RULESETS",
            "Launch the project’s first rulesets."
          ],
          [
            "4 - CASH_OUT_TOKENS",
            "Cash out project tokens on a holder’s behalf."
          ],
          [
            "5 - SEND_PAYOUTS",
            "Trigger payout distributions."
          ],
          [
            "6 - MIGRATE_TERMINAL",
            "Migrate funds to a new terminal."
          ],
          [
            "7 - SET_PROJECT_URI",
            "Update project metadata."
          ],
          [
            "8 - DEPLOY_ERC20",
            "Deploy the project’s ERC-20 token."
          ],
          [
            "9 - SET_TOKEN",
            "Set a custom token for the project."
          ],
          [
            "10 - MINT_TOKENS",
            "Create tokens without a payment."
          ],
          [
            "11 - BURN_TOKENS",
            "Burn tokens from another holder."
          ],
          [
            "12 - CLAIM_TOKENS",
            "Claim credits into ERC-20 tokens for a holder."
          ],
          [
            "13 - TRANSFER_CREDITS",
            "Transfer a holder’s unclaimed credits."
          ],
          [
            "14 - SET_CONTROLLER",
            "Change the project controller."
          ],
          [
            "15 - SET_TERMINALS",
            "Set the project’s terminals."
          ],
          [
            "16 - ADD_TERMINALS",
            "Add terminals to the project."
          ],
          [
            "17 - SET_PRIMARY_TERMINAL",
            "Set the primary terminal for a token."
          ],
          [
            "18 - USE_ALLOWANCE",
            "Withdraw surplus via the surplus allowance."
          ],
          [
            "19 - SET_SPLIT_GROUPS",
            "Modify payout and reserved token splits."
          ],
          [
            "20 - ADD_PRICE_FEED",
            "Add a price feed for a currency pair."
          ],
          [
            "21 - ADD_ACCOUNTING_CONTEXTS",
            "Add accounting contexts to a terminal so it accepts more tokens."
          ],
          [
            "22 - SET_TOKEN_METADATA",
            "Set the project token’s name and symbol."
          ],
          [
            "23 - SIGN_FOR_ERC20",
            "Sign ERC-20 permit approvals on the project’s behalf."
          ],
          [
            "24 - ADJUST_721_TIERS",
            "Add or remove tiers on a 721 hook."
          ],
          [
            "25 - SET_721_METADATA",
            "Update a 721 hook’s metadata (base URI, resolver, contract URI)."
          ],
          [
            "26 - MINT_721",
            "Mint NFTs directly, without a payment."
          ],
          [
            "27 - SET_721_DISCOUNT_PERCENT",
            "Set the 721 hook’s discount percent."
          ],
          [
            "28 - SET_BUYBACK_TWAP",
            "Set the TWAP window the buyback hook averages the market price over."
          ],
          [
            "29 - SET_BUYBACK_POOL",
            "Set the buyback hook’s Uniswap pool."
          ],
          [
            "30 - SET_BUYBACK_HOOK",
            "Set which buyback hook the registry routes the project to."
          ],
          [
            "31 - SET_ROUTER_TERMINAL",
            "Configure the project’s router terminal."
          ],
          [
            "32 - MAP_SUCKER_TOKEN",
            "Link matching assets across a pair of sucker bridge contracts."
          ],
          [
            "33 - DEPLOY_SUCKERS",
            "Create bridge contracts between the project’s chains."
          ],
          [
            "34 - SET_SUCKER_PEER",
            "Set a sucker’s cross-chain peer."
          ],
          [
            "35 - SUCKER_SAFETY",
            "Emergency token recovery on a sucker."
          ],
          [
            "36 - SET_SUCKER_DEPRECATION",
            "Deprecate a sucker."
          ],
          [
            "37 - OPEN_LOAN",
            "Open a REVLoans loan against project tokens."
          ],
          [
            "38 - REALLOCATE_LOAN",
            "Move collateral into a new loan and borrow its current capacity. The operator chooses where new proceeds go."
          ],
          [
            "39 - REPAY_LOAN",
            "Repay or release collateral on a holder’s behalf. The operator chooses where returned collateral goes."
          ]
        ]
      },
      {
        "type": "info",
        "text": "Permissions are per-operator, per-project. Granting QUEUE_RULESETS to address X for project 5 doesn’t give X any access to project 6."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "contracts",
      "frontend"
    ]
  },
  {
    "id": "contracts-test",
    "part": "Contract builders",
    "audience": [
      "contracts"
    ],
    "title": "Test against deployed contracts",
    "blocks": [
      {
        "type": "table",
        "label": "Foundry",
        "rows": [
          [
            "TestBaseWorkflow",
            "@bananapus/core-v6/test/helpers/TestBaseWorkflow.sol: deploys the full protocol locally with a mock USDC and two terminals, plus Permit2. Extend it for unit tests of hooks and integrations"
          ],
          [
            "Fork tests",
            "Fork the chain at one fixed block for a local copy. Configure foundry.toml rpc_endpoints and test against the published deployment addresses"
          ],
          [
            "Sizes",
            "forge build --sizes early; several V6 contracts sit near EIP-170 and were split or trimmed to fit. Plan for library extraction if you are close"
          ],
          [
            "Bytecode parity",
            "compare the deployed machine code with the published deployment artifacts. Matching source alone is insufficient because linked libraries change the resulting code"
          ]
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/nana-core-v6/tree/main/test/helpers",
            "label": "TestBaseWorkflow"
          }
        ]
      }
    ]
  },
  {
    "id": "contracts-sharp-edges",
    "part": "Contract builders",
    "audience": [
      "contracts",
      "frontend"
    ],
    "title": "Behavior to check carefully",
    "blocks": [
      {
        "type": "points",
        "items": [
          {
            "key": "Who is the payer",
            "text": "context.payer is the terminal’s msg.sender. Through a router, project payer, or wrapper it is that contract, unless the contract exposes originalPayer() (IJBPayerTracker), which the router registry probes. Expose the original payer where the integration expects it, and set beneficiary/refund addresses explicitly so rewards or refunds are not accidentally credited to the intermediary."
          },
          {
            "key": "Router terminal cold start",
            "text": "the router registry reverts accountingContextForTokenOf for projects below its threshold; it is not universally accepting. Probe with previewPayFor before assuming a route."
          },
          {
            "key": "Buyback metadata is three words",
            "text": "the pay metadata under getId(\"pay\", hook) decodes as (amountToSwapWith, minimumSwapAmountOut, skipSplits). Always encode all three; two-word quotes revert. The buyback hook mints when the swap cannot meet its floor."
          },
          {
            "key": "Router gateway custody",
            "text": "resolve registry.terminalOf(projectId), then gateway.ROUTER() when the selected terminal is a gateway. Eligible failed fee routes remain held for retry, not paid or forgiven. Track QueuePendingCall, ProcessPendingCall, RecordTerminalCallFailure and RefundPendingCall; pendingCallCount is the lifetime count of issued IDs, not the number currently pending."
          },
          {
            "key": "Per-chain rollout and prices",
            "text": "use canonical executed deployment records, preserving previous and v1 addresses for history. Mainnet proposals do not activate the new stack. JBRatioPriceFeed supplies project-zero defaults for USDC→NATIVE and USDC→ETH; addresses vary by chain and OP Sepolia has the feed without hook/router/gateway."
          },
          {
            "key": "Payouts to a project without a terminal",
            "text": "if the recipient project has no payment contract for the asset, its payout fails and the balance is restored. The payout limit is still consumed."
          },
          {
            "key": "Ownership changes reset permissions",
            "text": "permissions must come from the current owner. A previous owner’s grants stop working after ownership transfers."
          },
          {
            "key": "Sucker salt",
            "text": "the omnichain deployer derives sucker addresses from the sender and the salt, so a different wallet on another chain produces a project that cannot be linked."
          }
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-terminal-selection/SKILL.md",
            "label": "jb-terminal-selection skill"
          },
          {
            "href": "https://github.com/Bananapus/nana-buyback-hook-v6",
            "label": "Buyback hook integration reference"
          },
          {
            "href": "https://github.com/mejango/juicebox-skills/tree/main/plugins/juicebox-v6/skills/jb-suckers/SKILL.md",
            "label": "jb-suckers skill"
          }
        ]
      }
    ]
  },
  {
    "id": "build-nfts",
    "part": "Ecosystem tools",
    "title": "Sell collectibles and memberships",
    "paragraphs": [
      "A project shop can sell items as uniquely identified NFTs. Items are grouped into tiers with a price and supply. The JB721TiersHook extension delivers the selected items when a payment covers their price."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "JB721TiersHookProjectDeployer.launchProjectFor (call outline)",
        "lang": "solidity",
        "code": "launchProjectFor(\n  owner,\n  deployTiersHookConfig,    // NFT name, symbol, tiers[]\n  launchProjectConfig,      // standard project config\n  controller,\n  salt                      // CREATE2 salt for a deterministic hook address (0 for none)\n)\n// Creates the project and its shop in one call, even with empty tiers"
      },
      {
        "type": "table",
        "label": "Tier configuration",
        "rows": [
          [
            "price",
            "What one NFT of this tier costs."
          ],
          [
            "initialSupply",
            "Max NFTs available. Must be at least 1; capped at 999,999,999. 0 is rejected."
          ],
          [
            "category",
            "Grouping ID. Tiers MUST be sorted by category (ascending)."
          ],
          [
            "reserveFrequency",
            "Mint 1 reserved NFT every N minted."
          ],
          [
            "reserveBeneficiary",
            "Who receives reserved NFTs."
          ],
          [
            "votingUnits",
            "Voting weight through JB721Checkpoints. Used only when flags.useVotingUnits is set; otherwise the tier’s price sets its voting weight."
          ],
          [
            "encodedIpfsUri",
            "IPFS content hash for metadata."
          ],
          [
            "flags.cantBeRemoved",
            "If true, tier is permanent (one of the nested flags: allowOwnerMint, useVotingUnits, transfersPausable, cantBeRemoved, …)."
          ]
        ]
      },
      {
        "type": "table",
        "label": "Reading nft state",
        "rows": [
          [
            "JB721TiersHookStore.tiersOf(hook, categories[], includeResolvedUri, startId, size)",
            "List tiers with optional filters"
          ],
          [
            "JB721TiersHookStore.tierOf(hook, tierId, includeResolvedUri)",
            "Single tier details"
          ],
          [
            "JB721TiersHook.balanceOf(owner)",
            "NFTs held by an address"
          ],
          [
            "JB721TiersHook.cashOutWeightOf(tokenIds[])",
            "Cash out weight of specific NFTs (divide by totalCashOutWeight() for the surplus fraction)"
          ]
        ]
      },
      {
        "type": "info",
        "text": "Sort tiers by category. An out-of-order list fails with InvalidCategorySortOrder."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "founders",
      "frontend",
      "contracts"
    ]
  },
  {
    "id": "build-buyback",
    "part": "Ecosystem tools",
    "title": "Buy existing tokens when they offer more",
    "paragraphs": [
      "A payment can create new tokens or buy existing ones from a market. JBBuybackHook compares both and uses the configured Uniswap V4 pool when it gives the payer more tokens. It can also route cash outs.",
      "To limit price changes during a swap, the hook calculates its default minimum from a time-weighted average price. The buyback hook mints when the swap cannot meet its floor. Pay metadata under getId(\"pay\", hook) must encode (amountToSwapWith, minimumSwapAmountOut, skipSplits); the third word is a bool, and a two-word quote reverts."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "JBBuybackHook configuration (call outline)",
        "lang": "solidity",
        "code": "// Set up the buyback hook with a Uniswap V4 pool\nJBBuybackHook.setPoolFor(\n  projectId,\n  fee,              // Uniswap pool fee tier\n  tickSpacing,      // pool tick spacing\n  twapWindow,       // TWAP observation window (seconds)\n  terminalToken     // the terminal token to route\n)\n// The pool key is once-only; the TWAP window stays mutable via setTwapWindowOf\n// Requires SET_BUYBACK_POOL permission"
      },
      {
        "type": "diagram",
        "label": "Buyback decision flow",
        "lines": [
          "payment arrives",
          "  │",
          "  ▼",
          "query TWAP oracle for market price",
          "  │",
          "  ├─ pool gives more than minting",
          "  │  └▶ swap on Uniswap V4,",
          "  │     mint any unswapped remainder",
          "  │",
          "  └─ minting gives equal or more",
          "     └▶ normal mint flow",
          "        (weight × amount)"
        ]
      },
      {
        "type": "info",
        "text": "For cash outs, the hook can sell tokens through the pool when that returns more than the project’s cash out quote. Callers can supply their own quote and minimum in the transaction metadata."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "frontend",
      "contracts"
    ]
  },
  {
    "id": "build-swap-terminal",
    "part": "Ecosystem tools",
    "title": "Router terminal: accept other assets",
    "paragraphs": [
      "A router can convert a payment into an asset the project accepts. JBRouterTerminal finds a supported route, makes the conversion, and forwards the result to the project’s payment contract. It does not keep a project balance.",
      "JBPayRouteResolver compares available routes by the tokens the payer would receive. A route may forward an accepted asset, swap through Uniswap V3 or V4, cash out other Juicebox tokens, or combine these steps. Availability depends on the project, asset, and market; check previewPayFor before offering the route."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Router terminal functions",
        "rows": [
          [
            "pay(...)",
            "Same IJBTerminal interface as JBMultiTerminal — resolves the best route, converts the input, then calls pay() on the destination terminal."
          ],
          [
            "addToBalanceOf(...)",
            "Same as pay() but forwards via addToBalanceOf() on the destination terminal (no token minting)."
          ],
          [
            "previewPayFor(...)",
            "Preview the chosen route and expected output for a payment without executing it."
          ],
          [
            "bestPoolLiquidityOf(tokenA, tokenB)",
            "Report the deepest-liquidity Uniswap pool the router would use for a pair."
          ]
        ]
      },
      {
        "type": "text",
        "text": "Projects attach JBRouterTerminalRegistry to JBDirectory alongside JBMultiTerminal. Read terminalOf(projectId) to find the selected route: current deployments use JBRouterTerminalGateway → ROUTER(), while unmigrated projects can still select the previous router. The gateway takes custody before routing. Eligible failed fee routes remain pending for retry instead of being settled or forgiven; finalization can refund the source project after qualified failures. Use canonical deployment records per chain: a proposed mainnet deployment is not a live gateway."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "frontend",
      "contracts"
    ]
  },
  {
    "id": "build-payer",
    "part": "Ecosystem tools",
    "title": "Create an address that forwards payments",
    "paragraphs": [
      "A payer address forwards incoming ETH to a project. Deploy JBProjectPayer as a small clone of a shared implementation. Its constructor takes JBDirectory; set defaults through initialize() or setDefaultValues().",
      "When defaultAddToBalance is false, incoming ETH calls pay() and delivers project tokens to the beneficiary. When true, it adds funds without creating tokens. With no chosen beneficiary, the contract finds the original payer, including through supported forwarding contracts. ERC-20 payments need an explicit pay() or addToBalanceOf() call after approval; sending those tokens directly will not trigger a payment."
    ],
    "blocks": [
      {
        "type": "code",
        "label": "JBProjectPayer defaults (call outline)",
        "lang": "solidity",
        "code": "// Set via initialize() after clone deployment:\ndefaultProjectId       // which project to forward to\ndefaultBeneficiary     // who gets the tokens (0 = msg.sender)\ndefaultMemo            // attached to each payment\ndefaultMetadata        // extra data for hooks\ndefaultAddToBalance    // false = pay(), true = addToBalance()\n\n// Anyone sends ETH to the payer address:\n//   → receive() fires\n//   → looks up DIRECTORY.primaryTerminalOf(projectId, token)\n//   → calls pay() or addToBalanceOf() with defaults"
      },
      {
        "type": "info",
        "text": "The payer address looks up the project’s current payment contract through JBDirectory each time it receives a payment."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "founders",
      "contracts"
    ]
  },
  {
    "id": "build-handles",
    "part": "Ecosystem tools",
    "title": "Give a project a name",
    "paragraphs": [
      "A project can use a readable ENS name. JBProjectHandles checks that the name’s record also points back to the project before returning it from handleOf().",
      "Anyone can propose a name. The registry stores each proposal by its setter, chain ID, and project ID. Apps should also check that the project’s current owner or operator claimed the name."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Handle functions",
        "rows": [
          [
            "setEnsNamePartsFor(chainId, projectId, parts[])",
            "Associate ENS name parts with a project. Anyone can call this — no access control."
          ],
          [
            "ensNamePartsOf(chainId, projectId, setter)",
            "Get the stored name parts as set by a specific setter address."
          ],
          [
            "handleOf(chainId, projectId, setter)",
            "Returns the verified handle string, or empty if ENS text record doesn’t match."
          ],
          [
            "TEXT_KEY",
            "The ENS text record key: \"juicebox\". Expected value: \"{chainId}:{projectId}\"."
          ]
        ]
      },
      {
        "type": "text",
        "text": "Name parts are in reverse order. handleOf returns the dot-joined labels without a .eth suffix; the suffix is only added when computing the namehash for verification. handleOf walks the array from the last element to the first, so the innermost label goes last. For \"myproject.eth\" → [\"myproject\"]. For \"sub.myproject.eth\" → [\"myproject\", \"sub\"]. Parts cannot contain dots, ASCII control characters, DEL, \"eth\", or be empty. Unicode normalization (ENSIP-15) is the caller/client’s responsibility, not the contract’s."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "founders",
      "frontend"
    ]
  },
  {
    "id": "build-distributor",
    "part": "Ecosystem tools",
    "title": "Share rewards over time",
    "paragraphs": [
      "A distributor shares reward tokens with eligible holders over time. Rewards vest gradually. Deploy this optional extension for your project; it is separate from the shared core contracts.",
      "JBTokenDistributor supports tokens with IJBActiveVotes, such as Juicebox JBERC20. JB721Distributor supports NFT holders. Fund either through project distributions or direct deposits. Each round records the available rewards and holders’ eligible balances, then unlocks their shares evenly over the configured rounds."
    ],
    "blocks": [
      {
        "type": "table",
        "label": "Core functions",
        "rows": [
          [
            "fund(hook, token, amount)",
            "Directly deposit reward tokens for a specific hook’s staker pool"
          ],
          [
            "beginVesting(hook, tokenIds[], tokens[])",
            "Snapshot and begin vesting for the specified token IDs"
          ],
          [
            "collectVestedRewards(hook, tokenIds[], tokens[], beneficiary)",
            "Collect unlocked vested tokens (auto-vests current round too)"
          ],
          [
            "releaseForfeitedRewards(hook, tokenIds[], tokens[], beneficiary)",
            "Return unvested rewards from burned tokens to the pool"
          ],
          [
            "poke()",
            "Record the snapshot block for the current round early"
          ]
        ]
      },
      {
        "type": "table",
        "label": "Read state",
        "rows": [
          [
            "balanceOf(hook, token)",
            "Balance held for a hook’s staker pool"
          ],
          [
            "collectableFor(hook, tokenId, token)",
            "How much is unlocked and ready to collect right now"
          ],
          [
            "claimedFor(hook, tokenId, token)",
            "Total uncollected amount (vesting + vested-but-uncollected)"
          ],
          [
            "currentRound()",
            "The current round number"
          ],
          [
            "roundSnapshotBlock(round)",
            "The block number used for stake weight lookups"
          ]
        ]
      },
      {
        "type": "info",
        "text": "Reward shares use voting weight at a recorded block. Token distributors read IVotes.getPastVotes(); NFT distributors use tier voting units. Token holders must assign their votes, even to themselves, to count. IJBActiveVotes.getPastTotalActiveVotes excludes balances whose votes are unassigned."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "Source reference"
          }
        ]
      }
    ],
    "audience": [
      "contracts"
    ]
  },
  {
    "id": "ship-test-what-can-surprise-you",
    "part": "Ship it safely",
    "title": "Test what can surprise you",
    "blocks": [
      {
        "type": "points",
        "items": [
          {
            "key": "Launch",
            "text": "the encoded configuration round-trips through the ABI; the creation fee is read at send time; the same sender and salt yield the same sucker addresses on a second chain."
          },
          {
            "key": "Payments",
            "text": "the chosen route’s executable minimum is no worse than the alternatives shown; an empty pool falls back to issuance; a router route is probed, not assumed."
          },
          {
            "key": "Cash outs",
            "text": "the terminal or hook enforces the same minimum the confirmation shows, including zero-tax cash outs."
          },
          {
            "key": "Payouts",
            "text": "limits apply per chain and cycle; a recipient project without a payment contract can consume the limit without receiving funds."
          },
          {
            "key": "Rulesets",
            "text": "a queue with too little notice fails its approval hook; an inherited weight is decayed, not copied."
          },
          {
            "key": "Permissions",
            "text": "the narrowest ID is granted, scoped to the project; a Safe proposal is not success."
          },
          {
            "key": "Hooks",
            "text": "reentrancy from a hostile hook or token, an under-pulling split hook, hostile payer metadata."
          }
        ]
      },
      {
        "type": "text",
        "text": "Test against a local copy of the current deployments. Publish the addresses, source, user actions, and schedule of terms so people can check how your product works. The audit page has prompts for reviewing a whole product or one transaction."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "/audit",
            "label": "Audit prompts and source index"
          },
          {
            "href": "https://github.com/mejango/juicebox-money",
            "label": "Reference web client"
          }
        ]
      }
    ]
  },
  {
    "id": "build-clients",
    "part": "Ship it safely",
    "title": "Use this app as a reference",
    "paragraphs": [
      "Use Juicebox Money’s source to build your own product. Its Next.js app shows how to find projects, load details and media, and prepare transactions against the current V6 contracts.",
      "Start with a flow close to yours, such as Pay, Cash Out, Create, or Shop. Read its source and tests to see how it checks current data, prepares a request, and shows what the user will sign."
    ],
    "blocks": [
      {
        "type": "steps",
        "items": [
          "Start from the product flow closest to yours — such as Pay, Cash Out, project creation, ruleset editing, or the Shop — and identify its component, supporting reads, and transaction builder.",
          "Give your assistant the relevant source, tests, guide link, V6 contracts, and [Juicebox V6 skills library](https://github.com/mejango/juicebox-skills) to help it explain anything Juicebox.",
          "Use indexed data for browsing. Refresh the chain data the transaction depends on just before building and sending it.",
          "Prepare one request and check that encoding and decoding preserves its fields. Test the behavior your product depends on before asking a wallet to sign."
        ]
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-money",
            "label": "Juicebox Money’s repo (source + tests)"
          },
          {
            "href": "https://github.com/Bananapus/version-6",
            "label": "V6 contracts (version-6)"
          }
        ]
      },
      {
        "type": "text",
        "text": "Use the app to study the experience and its source to see how it works. The server helps with search, media, and request preparation. The wallet signs only after the action is shown and checked against the V6 contract format."
      },
      {
        "type": "links",
        "items": [
          {
            "href": "https://github.com/mejango/juicebox-money",
            "label": "Source reference"
          }
        ]
      }
    ]
  }
];
