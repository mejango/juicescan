# Transaction coverage — JB V6 web app vs the v6 contracts

How completely the app's transactions are pinned by tests. **Line coverage is the wrong lens here** — the
app is ~95% DOM rendering, so per-file line % stays low even when the money path is fully tested. The metric
that matters: **does each transaction have a pure `buildXArgs()` round-tripped through its contract ABI?**

Legend: **U** = unit/encoding test (round-trips through the contract ABI + arg assertions); **S** = UI smoke.

## Transactions — builder + test status

| App action | Contract function | Builder | Test |
|---|---|---|---|
| Pay | `JBMultiTerminal.pay` | `buildPayArgs` | **U** (+ slippage-floor regression) |
| Cash out | `JBMultiTerminal.cashOutTokensOf` | `buildCashOutArgs` / `cashOutMinReclaimed` | **U** |
| Send payouts | `JBMultiTerminal.sendPayoutsOf` | `buildSendPayoutsArgs` | **U** |
| Launch project | `JBController.launchProjectFor` / omnichain | `buildLaunchArgs` | **U** + **S** |
| Deploy revnet | `REVDeployer.deployFor` | `buildRevnetArgs` | **U** + **S** |
| Queue rulesets | `JBController.queueRulesetsOf` | `buildQueueRulesetsArgs` | **U** |
| Mint | `JBController.mintTokensOf` | `buildMintArgs` | **U** |
| Burn | `JBController.burnTokensOf` | `buildBurnArgs` | **U** |
| Deploy ERC-20 | `JBController.deployERC20For` | `buildDeployErc20Args` | **U** |
| Send reserved | `JBController.sendReservedTokensToSplitsOf` | `buildSendReservedArgs` | **U** |
| Claim credits | `JBController.claimTokensFor` | `buildClaimTokensArgs` | **U** |
| Set permissions | `JBPermissions.setPermissionsFor` | `buildSetPermissionsArgs` | **U** (ids vs JBPermissionIds.sol) |
| Borrow | `REVLoans.borrowFrom` | `buildBorrowArgs` | **U** (+ slippage floor wired) |
| Repay | `REVLoans.repayLoan` | `buildRepayArgs` | **U** |
| Move between chains | `JBSucker.prepare` → `toRemote` | `buildSuckerPrepareArgs` / `buildSuckerToRemoteArgs` | **U** |

Plus create-flow encoding invariants (**U**): custom-token currency id consistency, `splitState` per recipient
type, split-group sums, the approval-hook (preset/custom/per-chain) + split-lock encoding, the deploy preflight
gates (recipient / over-100% / custom-token / approval), `parseAmount`/`addrOrZero` safety, `deploySalt`.

## Views (display logic)

| Area | Test |
|---|---|
| `bendystraw-format` volumeUsd / bigint / bool | **U** (`views.test.js`) |
| create-flow steps, accounting pills, approval condition, split lock, deploy gating | **S** (`ui-smoke.mjs`) |

## Not yet under unit test
- **autoIssueFor**, **adjustTiers (721)**, **queue via omnichain** — built as pre-encoded `data` for the
  relayr/Safe payload path (`encodeFunctionData` is runtime-validated; a wrong arg throws at build time).
- **Safe `execTransaction`** (`safe.js`) — the Safe-owner flow; encoded via the Safe SDK shape.
- **addToBalanceOf** — ABI present, no active call site.
- Broader view rendering (discover cards, project-detail tabs) — covered by UI smoke + manual CDP, not unit.

## Adherence
`verify-tx-builders-vs-contracts` (workflow, 5 agents) confirmed **every builder encodes correctly** against the
deployed V6 contracts (selectors, arg order, types, payability) — zero HIGH/MEDIUM. The three LOW findings
(deploy-erc20 permission label, permission display grouping, borrow slippage floor) are fixed.
