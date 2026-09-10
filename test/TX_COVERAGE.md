# Transaction coverage — JB V6 web app vs the v6 contracts

How completely the app's transactions are pinned by tests. **Line coverage is the wrong lens here** — the
app is ~95% DOM rendering, so per-file line % stays low even when the money path is fully tested. The metric
that matters: **does each transaction have a pure `buildXArgs()` round-tripped through its contract ABI?**

Legend: **U** = unit/encoding test (round-trips through the contract ABI + arg assertions); **S** = UI smoke.

## Transactions — builder + test status

| App action | Contract function | Builder | Test |
|---|---|---|---|
| Pay | `JBMultiTerminal.pay` | `buildPayArgs` | **U** (+ slippage-floor regression) |
| Add to balance | `JBMultiTerminal.addToBalanceOf` / `JBRouterTerminalRegistry.addToBalanceOf` | `buildAddToBalanceArgs` | **U** (both canonical ABIs; exact native/ERC-20 value + approval semantics) |
| Cash out | `JBMultiTerminal.cashOutTokensOf` | `buildCashOutArgs` / `cashOutMinReclaimed` | **U** |
| Send payouts | `JBMultiTerminal.sendPayoutsOf` | `buildSendPayoutsArgs` | **U** |
| Launch project | `JBController.launchProjectFor` / omnichain | `buildLaunchArgs` | **U** + **S** |
| Deploy revnet | `REVDeployer.deployFor` | `buildRevnetArgs` | **U** + **S** |
| Queue rulesets | `JBController.queueRulesetsOf` | `buildQueueRulesetsArgs` | **U** |
| Queue omnichain rulesets / start shop | `JBOmnichainDeployer.queueRulesetsOf` overloads | `buildOmnichainQueueArgs` / `buildNewShopQueueCall` | **U** (canonical overload selectors + nested args) |
| Mint | `JBController.mintTokensOf` | `buildMintArgs` | **U** |
| Burn | `JBController.burnTokensOf` | `buildBurnArgs` | **U** |
| Deploy ERC-20 | `JBController.deployERC20For` | `buildDeployErc20Args` | **U** |
| Send reserved | `JBController.sendReservedTokensToSplitsOf` | `buildSendReservedArgs` | **U** |
| Claim credits | `JBController.claimTokensFor` | `buildClaimTokensArgs` | **U** |
| Distribute auto issuance | `REVOwner.autoIssueFor` | `buildAutoIssueArgs` | **U** |
| Add / remove shop items | `JB721TiersHook.adjustTiers` | `buildAdjustTiersArgs` | **U** (all tier fields + remove ids) |
| Mint shop item without payment | `JB721TiersHook.mintFor` | `buildOwnerMintTierIds` | **U** (repeated uint16 quantity, bounds, exact ABI round trip) |
| Set permissions | `JBPermissions.setPermissionsFor` | `buildSetPermissionsArgs` | **U** (ids vs JBPermissionIds.sol) |
| Borrow | `REVLoans.borrowFrom` | `buildBorrowArgs` | **U** (+ slippage floor wired) |
| Repay | `REVLoans.repayLoan` | `buildRepayArgs` | **U** |
| Move between chains | `JBSucker.prepare` → `toRemote` | `buildSuckerPrepareArgs` / `buildSuckerToRemoteArgs` | **U** |
| Set ENS project record | exact resolver `setText(node,"juicebox","chainId:projectId")` | `buildSetEnsProjectRecordCall` | **U** (exact Registry resolver only; no resolver replacement; live tuple authority + resolver authorization rechecked at Safe queue boundaries; direct/Safe postcondition) |
| Publish project handle | `JBProjectHandles.setEnsNamePartsFor` | `buildSetProjectHandleCall` | **U** (canonical reversed labels; encoded tuple’s current owner/operator + exact ENS record rechecked at Safe queue boundaries; direct/Safe postcondition) |
| Batch step: set buyback hook / register pool / set router terminal / set TWAP window / initialize pool | `JBBuybackHookRegistry.setHookFor` / `.setPoolFor` / `JBRouterTerminalRegistry.setTerminalFor` / `JBBuybackHook.setTwapWindowOf` / `JBBuybackHookRegistry.initializePoolFor` | `buildStep` (safe-batch) | **U** (reference calldata + selectors for the preset trio; every kind re-encodes from its own ABI on load; power descriptors wrapped by `fn`) |
| Safe operator batch | `MultiSendCallOnly.multiSend` as ONE operation-1 SafeTx, or the Safe App `sendTransactions` list, or ordered direct sends | `composeBatch` / `encodeMultiSend` | **U** (packed layout + decode round trip; operation-1 EIP-712 hash, typed message and POST body; ordered Safe App txs; `eth_simulateV1` gate with per-call fallback; dependency ordering) |

## Structural wallet boundary inventory

These rows describe shared or deliberately generic signing boundaries rather
than one ABI builder. `npm run transaction:check` counts every production
occurrence, including the boundary definitions, so adding, moving, or bypassing
one cannot silently enter the app.

| Action | Boundary | Safety coverage |
|---|---|---|
| Reviewed direct write boundary | `executeTransaction` | Exact review payload, account/chain rechecks, simulation, receipt status, approval ordering, and Safe routing are unit-tested. |
| Reviewed single-chain direct write | `discover.js` direct dispatcher | One-chain management calls use the exact review modal, recheck the account and chain, simulate the raw call, submit directly, and require a successful receipt. Unsupported Relayr destinations and untrusted recipients use sequential direct sends with the same review boundary. |
| Sequential direct batch recovery | `direct-batch.js` / Create direct launch journal | Per-account action journals retain each submitted hash and block replay of confirmed or unknown legs. Resume checks sender, target, calldata, value, and successful receipt; changed calldata fails closed. Create retains the exact launch plan and shared start for remaining chains. Web Locks serialize supported-browser submissions; `.request` inventory occurrences here include lock requests, not additional RPC writes. Storage is required before opening a wallet request. |
| Selected project action recovery | `action-plan.js` / shared selected-call adapter | Frozen calldata and destination snapshots are durable before wallet requests; unique plan IDs and per-round checkpoints prevent earlier confirmed work from replaying. Multiple allocations on a chain use explicit resumable rounds. Storage and Web Locks are required. Safe requests are journaled before proposal; each known hash and preproposal block floor is retained immediately. Resume skips known queued destinations, submits only untouched calls, and reconciles later external execution with canonical exact Safe events/calldata/receipts. Unknown requests without a known response remain blocked. |
| Distribution receipt semantics | `distribution-plan.js` / direct, forwarded, and Safe receipt boundaries | Caught payout/reserved failures and hook underpull keep successful outer receipts pending. Exact emitter, project, original sender, token, and completion event are required. Safe reload reconstructs exact inner calldata; the original controller immutable TOKENS read is raw, CCIP-off, gas and output bounded. |
| Generic ABI contract write | `form.js` reviewed write | Displays target/function/arguments/calldata/value, rechecks account and chain, simulates, then requires a successful receipt. |
| Relayr forwarded bundle / payment | `relayrPostBundle` / `relayrPay` | Same-family eligibility across the four mainnets and four Sepolia testnets, recipient forwarder trust, exact EIP-712 domain and sender suffix, explicit funding choice, account-pinned publication/payment journals, and partial/unknown recovery are unit-tested. Funding options and the final payment boundary use the original published destination family; testnet bundles cannot request real mainnet ETH. Signed request fingerprints are saved before POST; ambiguous publication blocks fresh signatures. Known quotes can reopen in the same window, while reload retains a guard without persisting signatures. Each wallet send requires a durable marker; exact destination verification is required before paid receipts clear. The prepaid native-payment target, selector, runtime hash, token, bundle UUID, and deadline are pinned and decoded client-side; exact target/value/calldata receive mandatory review before bounded simulation and send. Forwarded publication requires a shared Web Lock and persistent signer/forwarder/chain nonce reservation across action scopes, including creation. Chain-proven nonce consumption or signature expiry is required before retirement; funding rechecks the reservation. Raw payer/Safe entries are exempt from forwarder nonce reservations. |
| Safe proposal / confirmation / execution | Safe App and Safe service boundaries | Proposal hashes remain distinct from execution; canonical Safe proxy/singleton identity, bounded CCIP-off reads, exact `execTransaction` tuples, current owners/threshold/nonce/confirmations, raw bounded simulation, post-review freshness, receipt status, and exact pending-call reuse without duplicate proposals are tested. |
| Permit2 and direct approvals | reviewed approval helpers | Canonical Permit2 domain/spender, amount/deadline/nonce, account rechecks, simulations, post-receipt allowance checks, valid-allowance reuse, and typed-signature fallback to an approval-block-anchored on-chain authorization are tested. |
| Project management actions | `discover.js` reviewed action handlers | Individual ABI builders are tracked above; all submission paths must remain behind the shared review, Safe, or Relayr boundaries. |
| Bounded shop item identity reads | `discover.js` raw `eth_call` | A single live tier lookup has explicit gas and response limits. Discount/removal verifies shared content, price, supply, reserves, category, flags, hook/store, and permissions; divergent items can be edited on the current chain. |
| Bounded exact ENS / handle reads | `project-handles.js` raw `eth_call` | Exact-node resolver and handle reads use explicit gas, pin Registry + resolver reads where applicable, supply `JBProjectHandles` as caller, bound returndata, reject noncanonical handles, and bypass CCIP redirects. |
| Wallet connection / network request | EIP-1193 provider requests | Only account permission, account enumeration, chain switching, and the chain-gated `eth_getTransactionReceipt` poll are allowed here; all write/sign APIs are inventoried separately. |
| Add liquidity through the Safe App | `runAddLiquidityTxs` one `proposeSafeTransactions` batch | When the Safe App holds the wallet and more than one call remains (ERC20→Permit2 approve, onchain Permit2 approve, mint), the sequence is built by the pure `lpAddLiquidityCalls` from the same live allowance reads and call descriptors as the sequential path, guarded against steps already queued (including inside a queued MultiSend), simulated from the Safe with `eth_simulateV1` (per-call fallback skipping the dependent mint), and proposed ONCE; the confirm previews every call with the exact deadline the proposal reuses. Every other connection keeps the per-step path. Remove, move and fee claims are single calls and unchanged. |
| Safe operator batch | `safe-batch-ui.js` MultiSend proposal, Safe App batch, and ordered direct sends | Queued steps re-encode from their own ABI on every read or the tray is discarded. A Safe authority gets exactly one proposal: the Safe App's ordered `sendTransactions` list, or one `{ to: MultiSendCallOnly, operation: 1 }` SafeTx at the next free nonce (approveHash + execTransaction where no service exists), after `getCode` on MultiSendCallOnly and a whole-sequence `eth_simulateV1` from the Safe (per-call `eth_call` fallback that skips dependent steps). Never N separate proposals. An EOA authority reuses the reviewed direct/Relayr dispatcher with an ordered array of calls per chain. The batch dialog holds its primary while a dependency is out of order. |

Plus create-flow encoding invariants (**U**): custom-token currency id consistency, `splitState` per recipient
type, split-group sums, the approval-hook (preset/custom/per-chain) + split-lock encoding, the deploy preflight
gates (recipient / over-100% / custom-token / approval), `parseAmount`/`addrOrZero` safety, `deploySalt`.

## Views (display logic)

| Area | Test |
|---|---|
| `bendystraw-format` volumeUsd / bigint / bool | **U** (`views.test.js`) |
| create-flow steps, accounting pills, approval condition, split lock, deploy gating | **S** (`ui-smoke.mjs`) |

## Not yet under unit test
- Broader view rendering (discover cards, project-detail tabs) — covered by UI smoke + manual CDP, not unit.

Safe `execTransaction` encoding is covered in `components-tx.test.js`, including
the exact outer tuple assembled from the queued Safe transaction and signatures.
The project and account queue paths execute reviewed same-chain Safe batches
directly, in nonce order; only batches spanning multiple distinct chains use
Relayr within its four supported mainnets or four Sepolia testnets. Mixed-network Safe execution retains the direct sequence.

Recovery regressions are covered by `relayr-publication.test.js`, `relayr-recovery.test.js`,
`relayr-scope.test.js`, `relayr-payment-receipt.test.js`, `relayr-forwarding.test.js`,
`relayr-ui.test.js`, `direct-batch.test.js`, and `create-direct-recovery.test.js`.
An interrupted wallet request with no transaction hash, an unknown quote publication, or an unpaid quote
after reload remains blocked for wallet/onchain inspection. No automatic retry creates a new payment.
The exact client-published destination calls are simulated after funding review and again inside the final
payment lock. Only native caller balance may be overridden to represent Relayr-funded value; target code
and storage remain live. A changed forwarder nonce, expired signature, reverted destination, or failed Safe
execution blocks payment.

## Multichain project setters

`metadata-multichain.test.js` checks destination controller/project IDs, live metadata merging, shared
edited fields with preserved local properties, URI deduplication, and state changes before execution.
`setUriOf` details and category updates retain stable project/action recovery scopes and route through the
shared EOA/Safe boundary. Category additions allocate shared IDs above every selected chain's existing IDs;
category execution remains a prerequisite to using those IDs for new items.

`splits-edit-project-chains.test.js` checks that recipient project IDs resolve to each destination or block
before any write. `multichain-token-setters.test.js` rejects mixed token deployment and accounting decimals,
and checks local token addresses/currencies/project IDs. `shop-tier-identity.test.js` blocks same-numbered
items with differing content or terms, and permits chain-local edits of divergent shops.
`setter-call-descriptors.test.js` checks structured Safe App call descriptors against the encoded setter bytes.

## Selected-chain operational actions

`shop-add-plan.test.js` checks that all staged items stay in one local-hook call per destination and uploads
are skipped on saved-plan resume. `shop-media.test.js` and `shop-media-ui.test.js` cover the reachable media
editor, destination-specific JSON preservation, file/URI inputs, shared upload deduplication, exact collection
sentinels, live hook/store/tier identity, permission 25, and resolver rejection.

`distribution-plan.test.js`, `distribution-ui.test.js`, and `distribution-receipts.test.js` cover selected
reserved/payout calls with local project/controller/terminal/token, currency, decimals, balances, ruleset limits,
quoted minimum outputs, optional Safe sender, and receipt semantics. `credit-claims.test.js` and
`credit-claims-ui.test.js` cover live destination credit/token/controller reads, exact claims and saved recovery.
`auto-issuance-aggregate.test.js` preserves all unlocked distinct stage/beneficiary allocations; repeated
indexed rows deduplicate, while multiple allocations on one chain become explicitly reviewed rounds.

`project-payer-recovery-ui.test.js` checks recovery before changed form validation and account-pinned raw publication. Direct testnet journals retain their original transport after Relayr eligibility expands; saved requests never become fresh Relayr signatures. `relayr-nonce-reservations.test.js` covers cross-action conflicts, stale/expired nonces, reload and corrupt/unavailable storage.

`action-plan.test.js`, `direct-batch.test.js`, and `relayr-recovery.test.js` cover checkpoint-before-cleanup,
interrupted parent storage, immutable resumed calls, Safe count accounting and partial/unknown guards.
`selected-safe-recovery.test.js` and `safe-proposal-recovery.test.js` cover immediate known-proposal checkpoints, partial reload, later external execution, native Safe App hashes, canonical block identity, and bounded adaptive event scans. `safe-submission-phases.test.js` checks actual POST/write boundary markers and proven user rejection. Known onchain approveHash records reconcile like hosted proposals; only unknown proposals need original-queue inspection. Frozen Relayr rounds cannot clear their child receipt and silently replay completed legs. Confirming a proposal does not mark its calls executed.
Payer deployments retain their raw permissionless Relayr entries; dependent create/category steps retain
separate reviews and completion requirements.

## Adherence
`verify-tx-builders-vs-contracts` (workflow, 5 agents) confirmed **every builder encodes correctly** against the
deployed V6 contracts (selectors, arg order, types, payability) — zero HIGH/MEDIUM. The three LOW findings
(deploy-erc20 permission label, permission display grouping, borrow slippage floor) are fixed.
