# Learn / Build / API content audit — results (2026-06-20)

Audited the Learn, Build, and API page content against the **deployed V6 contract set**
(`deploy-all-v6/deployments/ethereum`) and the submodule Solidity sources. Method: a
multi-agent workflow (8 content slices + API), each finding adversarially verified against
source. **40 findings, 39 confirmed, 1 rejected.** All confirmed findings fixed; the three
"Work in progress" banners (Learn, Build, API) removed.

## Fixed

### Build · Permissions — the big one (10+ findings)
The `PERMISSION IDS` table (`learn-build.js`) carried **stale V5-era numbering** and a
**non-existent `SET_CASH_OUT_DELAY`** permission. Rebuilt the whole table from the canonical
`nana-permission-ids-v6/src/JBPermissionIds.sol` (IDs 1–23): 1 ROOT, 2 QUEUE_RULESETS,
3 LAUNCH_RULESETS, 4 CASH_OUT_TOKENS, 5 SEND_PAYOUTS, 6 MIGRATE_TERMINAL, 7 SET_PROJECT_URI,
8 DEPLOY_ERC20, 9 SET_TOKEN, 10 MINT_TOKENS, 11 BURN_TOKENS, 12 CLAIM_TOKENS, 13 TRANSFER_CREDITS,
14 SET_CONTROLLER, 15 SET_TERMINALS, 16 ADD_TERMINALS, 17 SET_PRIMARY_TERMINAL, 18 USE_ALLOWANCE,
19 SET_SPLIT_GROUPS, 20 ADD_PRICE_FEED, 21 ADD_ACCOUNTING_CONTEXTS, 22 SET_TOKEN_METADATA,
23 SIGN_FOR_ERC20. Also fixed the learn-permissions prose: `#8 (SEND_PAYOUTS)` → `#5`.

### Build · §18 Swap Terminal → Router Terminal (stale, 3 findings)
Described the **archived** `JBSwapTerminal` (Uniswap V3, fixed `TOKEN_OUT`, `addDefaultPool`).
The deployed contract is **`JBRouterTerminal`**: universal terminal, no fixed output token,
`JBPayRouteResolver` picks the best route (direct / Uniswap V3 / V4 / recursive cash-out).
Rewrote the section + function table (`pay`, `addToBalanceOf`, `previewPayFor`,
`bestPoolLiquidityOf`); renamed the heading + TOC label.

### Build/Learn · §15/§19 Distributor (not deployed)
`JBDistributor`/`JBTokenDistributor`/`JB721Distributor` exist in `nana-distributor-v6` but are
**not in the V6 deployment**. Marked as an optional, project-deployed add-on; fixed
`IVotes` → `IJBActiveVotes (e.g. JBERC20)`; noted the total-stake denominator uses
`getPastTotalActiveVotes` (excludes undelegated/AMM-held balances).

### Build · §13 NFT Tiers (7 fixes)
- `redemptionWeightOf` → `cashOutWeightOf(tokenIds[])` (V6 renamed redemption→cash-out)
- `initialSupply` "0 = unlimited" → "≥1, capped 999,999,999, 0 rejected" (store reverts on 0)
- `votingUnits` "JB721TiersHookGovernance" → `JB721Checkpoints`; applies only when `flags.useVotingUnits`
- `encodedIPFSUri` → `encodedIpfsUri` (case)
- `cannotBeRemoved` → `flags.cantBeRemoved` (nested flag)
- `tiersOf`/`tierOf` re-attributed to `JB721TiersHookStore`; `balanceOf(owner)` (not `(hook,owner)`)
- `launchProjectFor` — added the missing `salt` parameter

### Build · §14 Custom Hooks
- `IJBRulesetDataHook` "modify weight, token count, memo, delegate list" → accurate override
  surface (weight / cash-out tax rate / effective counts + hook specifications); "delegate" was V3
- `projectTokenCount` → `newlyIssuedTokenCount` (JBAfterPayRecordedContext field)

### Smaller prose fixes
- Build §6 cash-out: surplus = balance − **remaining (unused)** payout limit (was "current")
- Learn §8 fees: 28-day held fees **can be** forwarded (via `processHeldFeesOf`/later op), not auto
- Build tokens: `JBTokens.claimTokensFor` → `JBController.claimTokensFor` (the user entry point)
- Build §9 revnet deploy: `terminalConfigurations[]` → `accountingContextsToAccept[]` (REVDeployer.deployFor)
- Learn §12 prices: added L2 sequencer-feed note + "backup feeds tried before revert"
- Learn §11 omnichain: added deprecation + emergency-hatch escape path for bridge failure
- Build §16 handles: Unicode-filtering claim corrected (only ASCII control/DEL/dots/"eth"; ENSIP-15 off-chain)

### API · CONTRACT_DESCRIPTIONS (`prompts.js`)
- Removed stale **`JBTokenDistributor`** (not deployed).
- Sharpened `JBRouterTerminal`.
- Added 18 missing deployed-contract descriptions: `JBBuybackHook`, `REVOwner`, `JBProjectPayer(+Deployer)`,
  `JBOmnichainDeployer`, `JBOptimismSucker`/`JBArbitrumSucker`/`JBBaseSucker`, `JBUniswapV4Hook`,
  `JBUniswapV4LPSplitHook(+Deployer)`, `DefifaDeployer`/`DefifaHook`/`DefifaGovernor`,
  `CTPublisher`/`CTDeployer`/`CTProjectOwner`, `JBMatchingPriceFeed`, `JBHeldFees`.

## Rejected (1)
- Build §18 "does not support cash outs or surplus" — the verifier found the claim is *true* for
  the contract the sentence names (archived JBSwapTerminal). Moot after the §18 rewrite.

## Not in scope
- The **ACTIONS / Common Actions** tab still carries a "Work in progress" banner (`app.js:195`).
  Its content was not part of this Learn/Build/API audit — left untouched.
- `abi-registry.js` `sources` map still lists `JBTokenDistributor`, but that file is
  build-generated from the deploy artifacts, so a hand-edit would be overwritten.
