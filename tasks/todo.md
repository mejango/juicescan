# Bendystraw per-token data: event tokens, single-token check, USD balances (2026-10-20)

Brief: /private/tmp/claude-501/-Users-jango-Documents-jb-v6-evm/7d1fdce3-54c6-4145-93c3-bfa2558645d2/scratchpad/client-round-brief.md. Bendystraw now serves each money event's `token`/`decimals`/`tokenSymbol`, `project.accountingTokenCount`, `projectTokenBalances` and USD balances at current rates.

- [x] 1. Activity: select `token decimals tokenSymbol` on pay, cash out, payout and add-to-balance (feed and account receipts); each row formats its amount in its own token, symbol falling back to `sourceTokenMeta`, then USD. Fan-out totals keep a token only when every pay shares it. Add-to-balance gains its `amountUsd` fallback.
- [x] 2. Single-token check: the project's one shared accounting token comes from the Bendystraw project rows (`accountingTokenCount`, `token`, `decimals`, `tokenSymbol`) through the existing `flowTokenFromContexts`; the per-chain onchain context reads in `fetchProjectActivity` go. Swaps (no token field) keep using it.
- [x] 3. Floor history: gate and decimals come from that same Bendystraw single-token answer instead of the onchain balance breakdown and the home accounting-token read.
- [x] 4. Stats: drop the unused `volume`/`balance`/`tokenSupply` from the indexed stats path.
- [x] 5. Data tab catalog: event amount columns read their row's `tokenSymbol`/`decimals`; project and group catalogs add `balanceUsd`, `accountingTokenCount` and `projectTokenBalances`.
- [x] 6. Tests, full `npm run check`, Codex loop until approve, PR, no merge.

### Review
`npm run check` (Node 22.23.1, DEPLOY_ALL_DEPLOYMENTS_DIR at the pinned deploy-all c62b3ac) passes: 0 production vulnerabilities, GraphQL documents valid against both live Bendystraw schemas, 200 files / 2025 unit tests with coverage floors, startup 712,765 / 722,000 B gzip, total 2,022,572 / 2,060,000 B, 148 browser tests. Codex pass 1 fixes: link previews list `projectTokenBalances` per token; token identity uses the shared context key (native, USDC, address) so lookalike symbols do not merge; a failed row lookup is retried; fan-out totals compare resolved tokens; Data tab fills ETH/USDC symbols; previews merge only listed tokens across chains, keep any other token on its own line and count unnamed tokens in USD (pass 2); holder cash-out receipts carry tokens; Top contributors and the Build guide example rank by USD. Codex gpt-6.1-sol: pass 1 and 2 requested changes (fixed above), pass 3 approved. `schema:check` now also validates the 56 Data tab catalog queries (93 documents in all); a misspelled catalog field fails it.

## Plan refinement
- **Objective:** Every Juicescan amount that Bendystraw indexes is shown in its own token or in USD, never in a guessed accounting token; nothing blanks when a field is missing (USD or the current behavior instead).
- **System fit:** Outcome (honest amounts) -> capability (Bendystraw per-token fields) -> evidence (live schema on both endpoints, sampled rows) -> prepared action (read-only GraphQL documents validated by `schema:check`) -> verified result (unit tests plus the full gate). Bendystraw owns token identity; `formatActivityAmount`/`sourceTokenMeta`/`flowTokenFromContexts` stay the display owners. Header balances, Funds breakdown and transaction paths are unaffected.
- **Reuse and simplicity:** Reuse `flowTokenFromContexts` by mapping Bendystraw rows to the context shape it already checks; reuse `sourceTokenMeta` for symbol fallback and the data tab's `amount` formatter (`row.decimals`, `symbolKey`). Removed: per-chain onchain context reads for activity and the floor chart's onchain gate. No new modules.
- **Evidence and unknowns:** Introspection of mainnet and testnet shows the fields; sampled rows show `suckerGroupMoment.accountingTokenUsdRate` is the rate of whichever token moved, so `balanceUsd` cannot be turned back into pair units for a mixed group; the floor chart keeps exact raw sums for single-token groups only. Old cached project rows lack the new fields and fall back to USD.
- **Verification:** Unit tests for per-event labels, symbol fallback, USD fallback, fan-out token agreement and the row-to-context mapping; `npm run check` (schema check against both live schemas, coverage, bundle budget, browser).
- **Resource budget:** One worktree, one behavior commit (no extraction needed); replan if the gate shows a schema or budget surprise.

# Pay minimum: SDK 3.3.0 quote, failure reason, adjustable minimum (2026-10-20)

Ruling (jango): get the payer the most tokens possible; when a payment fails, say why and let the payer adjust their minimum. Matches jbm's pay card (scratchpad wt-jbm-paymin).

- [x] 1. Refactor (no behavior change): the cash-out "Max slippage" row becomes one `slippageControl` helper; `prepareCardPay` moves to pay-preview.js so the COMPONENTS widget can share it.
- [x] 2. Bump @bananapus/nana-sdk-core 3.1.0 -> 3.3.0 (Node 22, npm 10.9).
- [x] 3. executeTransaction passes the raw error in its failure meta; a mined revert re-simulates the sent call at its block so the reason is known.
- [x] 4. Pay card: decodePayFailure's line on failure; a shortfall (TERMINAL_UNDER_MIN, BUYBACK_SLIPPAGE_EXCEEDED) shows the Max slippage row prefilled with the tolerance that would have passed and "Review again", which re-quotes with it. The tolerance holds only for the payment it was set on; 1% otherwise.
- [x] 5. COMPONENTS widget: prepareUserPay sets minimum + metadata per route; failures read through decodePayFailure.
- [ ] 6. Tests, full `npm run check`, screenshot of the failure state, PR, two Codex passes, no merge.

### Review
SDK 3.3.0 installed and its typings match the source. `npm run test:ci` (with DEPLOY_ALL_DEPLOYMENTS_DIR at the pinned deploy-all c62b3ac) passes: 200 files / 2000 unit tests, bundle budget (startup 710,683 / 722,000 B gzip, total 2,019,990 / 2,060,000 B), 148 browser tests. Rendered the shortfall state in Chromium with the real modules (decoded line, Max slippage prefilled 3.5%, Review again). Cross-client: same SDK calls, retry math and "Review again" as jbm; the row keeps juicescan's own "Max slippage" label and 0.5/1/3/5 presets from cash out.

## Plan refinement
- **Objective:** Juicescan's pay card and pay widget send SDK 3.3.0's quote-based minimum and metadata, show the decoded reason when a pay fails, and let the payer loosen the minimum and retry after a shortfall; the happy path is unchanged.
- **System fit:** Outcome (most tokens, understood failure) -> capability (SDK prepareUserPay, decodePayFailure) -> evidence (simulation error, or mined revert re-simulated at its block) -> prepared action (prepareUserPay with slippageBps) -> authority (existing pay confirm + executeTransaction) -> verified result (receipt). SDK owns minimum and reason text; juicescan owns the slippage row and retry wiring. Cash-out, Safe proposals and other flows keep their behavior.
- **Reuse and simplicity:** Reuse the cash-out Max slippage row (extracted, not copied), prepareCardPay (moved to the shared pay-preview module), SDK messages, the pay card's existing stale-quote re-run (payAfterPreview). New: one retry-tolerance helper mirroring jbm's payRetrySlippageBps, one retry hook on the confirm context.
- **Evidence and unknowns:** SDK source wt-sdk-paymin (executionErrors.ts, pay.ts); published 3.3.0 typings re-read after install. Unknown: a mined revert re-simulated at its block may not revert again (then the generic line stays).
- **Verification:** Unit tests for the retry helper, decoded messages through the pay card, widget args from prepareUserPay; full `npm run check` (source, deployments, generated, schema, transaction inventory, bundle, coverage, budget, browser); Playwright screenshot of the shortfall state.
- **Resource budget:** One worktree, one SDK bump, refactor commit first then behavior commit; replan if 3.3.0's API differs from the SDK source or the bundle budget moves more than the new code.

# Thorough test coverage — transactions + views

## 2026-10-03 — publication endpoint recovery
- [x] Diagnose the custom testnet domain failure using keyless public health, schema and known-project reads.
- [x] Extract one shared endpoint owner without changing destinations; verify and commit the refactor separately.
- [x] Switch the testnet owner to the healthy official Railway origin and update behavioral regressions.
- [x] Measure the pinned Node 22 build, align the distribution budget with the recorded release delta, and run release checks.

### Review
The custom testnet domain returns Railway 502, while the source-documented Railway origin serves the current four Sepolia chains, full schema, and known V6 Base Sepolia project 13 (kmac's shop / KMAC). Keyless CORS remains limited to the configured retail origin, so browser requests retain the existing keyed route. The behavior-preserving shared-origin refactor passes 32 focused tests in 6 files and produces byte-identical learn/build HTML; both destinations remain unchanged in its separate commit (b598f79).

The testnet destination now changes once in the shared owner for browser queries, server previews, DATA prompts, Build guides, and the live schema gate. Mainnet remains unchanged. All 37 production GraphQL documents validate against both live schemas; 32 focused tests cover exact origins, keyed routes, project identity and displayed/copied endpoints. Source syntax checks 271 JavaScript files; the fresh pinned Node 22.23.1 bundle measures 9,983,374 B raw / 1,472,846 B gzip for app.js and 2,244,915 B gzip total. The endpoint change adds 126 B total over the same-toolchain duration release (2,244,789 B); the total cap rises from 2,244,000 B to the next 1 KB (2,245,000 B), with individual file limits unchanged. Bundle budget and diff checks pass. Parent will rerun the complete publication gates after these edits stop; no backend or DNS changes and no private-key diagnostics.

## 2026-10-03 — custom ruleset duration decimals
- [x] Verify the focused existing baseline (5 files, 65 tests) and trace typing, conversion, draft and queue consumers.
- [x] Add a real-browser regression for sequential decimal typing and preserve input focus/raw text.
- [x] Share strict custom-duration conversion across state updates, imports and launch/queue validation; retain draft persistence and refresh all duration-dependent controls while typing.
- [x] Verify behavioral tests, source syntax, bundle and Chromium regressions; document results.

### Review
The number input and full render discarded a trailing decimal point and focus: Chromium reproduced `4.` becoming `4`. A text input with the decimal keyboard now preserves raw text; scoped focus/caret restoration keeps the existing render, draft persistence, summaries, Afterwards choices, approval controls and split locks synchronized. One strict converter owns rounding to seconds and validates positive custom durations within uint32 bounds; imported custom stages rederive seconds, and launch/queue builders and deploy controls reject invalid values. Existing split locks survive incomplete custom text and clear only for an explicit Flexible choice.

Validation: all 181 unit-test files / 1810 tests pass, including 23 new duration regressions; all 24 Chromium modal tests pass across desktop/tablet/mobile/narrow viewports. The browser regression proves sequential `4.5` / `.5`, native unit activation, mid-value caret edits, draft persistence, dependent-control updates and one-click Next. Source syntax (269 files), bundle, distribution budget (2,243,839 B gzip / 2,244,000 B limit) and `git diff --check` pass. No commit, publish or generated ABI/deployment edits.

Pattern: extract inline `executeTransaction({...})` arg-building into a pure exported `buildXArgs(...)`
returning `{address, abi, functionName, args, value}`; component calls it (spread / Object.assign);
unit test round-trips through the contract ABI + asserts amounts/decimals/recipients/slippage.

## Transactions
- [x] pay (JBMultiTerminal.pay) — buildPayArgs (+ fixed a real slippage-floor bug: was reading state.preview.received which doesn't exist → 0n)
- [x] cashout (cashOutTokensOf) — buildCashOutArgs / cashOutMinReclaimed (95% floor)
- [x] move between chains (JBSucker.prepare → toRemote) — buildSuckerPrepareArgs / buildSuckerToRemoteArgs
- [x] loan (REVLoans.borrowFrom / repayLoan) — buildBorrowArgs / buildRepayArgs (+ wired the 99% borrow slippage floor)
- [x] mint (mintTokensOf) / burn (burnTokensOf)
- [x] deploy ERC-20 (deployERC20For)
- [x] send payouts (sendPayoutsOf)
- [x] send reserved (sendReservedTokensToSplitsOf)
- [x] queue ruleset (queueRulesetsOf) — buildQueueRulesetsArgs
- [x] claim credits (claimTokensFor)
- [x] permissions (setPermissionsForOperator) — + fixed display grouping (31 Router, 36 Omnichain)
- [x] Safe (execTransaction) — safeExecArgs (shared by direct + relayr paths)
- [ ] autoIssueFor / adjustTiers (721) / omnichain-queue — built as pre-encoded relayr/Safe `data` (runtime-validated); lower priority
- [ ] addToBalanceOf — ABI present, no active call site

## Views
- [x] bendystraw-format (volumeUsd / bigint / bool) — views.test.js
- [x] create-flow steps / pills / approval / lock / deploy gating — ui-smoke.mjs
- [ ] discover cards + project-detail tabs — UI smoke + manual CDP (no unit)

## Docs / audit-readiness
- [x] README.md (architecture, build pipeline, currency model, tx→contract map, testing, IPFS)
- [x] contract-adherence review (workflow) — all builders correct; 3 LOW fixed
- [x] TX_COVERAGE.md updated

## Review
91 vitest tests (8 files) + 9 UI smoke, all green. Build clean. Branch: audit-fixes-tx-security-and-tests.
Uncommitted — left for review.

## 2026-07-28 — kmac88 operator feedback (metadata round-trip, pay notice, kept fields, reserved-split removal)
- [x] Tests first: test/metadata-edit-roundtrip.test.js (merge helper, payDisclosure semantics, kept-keys helper, modal wiring)
- [x] Tests first: test/reserved-splits-empty.test.js (empty-group payload, empty setSplitGroupsOf encode, queue 0% reserved, UI copy)
- [x] 1. mergeProjectMetadataEdit: spread live projectUri JSON, overwrite only dirty form fields; fail closed when live JSON unreadable (submitProjectEdit + addStoreCategories)
- [x] 2. Payment notice textarea in edit-project modal (payDisclosure key, untouched≠cleared)
- [x] 3. "Other fields kept: …" read-only line from unmanagedProjectMetadataKeys(loadedMeta)
- [x] 4a. Verify queue flow encodes reservedPercent 0 with no reserved recipients (test only — already derived from row sum)
- [x] 4b. Reserved-splits modal: link "queue a new ruleset with a 0% reserved rate" → openQueueRulesetModal
- [x] 4c. Allow submitting an EMPTY reserved group (drop "Add at least one recipient" gate; owner-accrual explainer; locked rows already frozen)
- [x] Full suite + drift gates + bundle green; no commit

### Review
Root causes: (1) edit-project save fell back to `{}` when the live projectUri JSON couldn't be fetched, and always overwrote all known fields (degrading untouched rich descriptions); (4) submitSplitsEdit hard-refused an empty recipients list ("Add at least one recipient"), and the 0%-reserved lever actually lives in queue-ruleset (rate = sum of reserved rows — already encodes 0 with no rows, now test-locked).
Changes: mergeProjectMetadataEdit + unmanagedProjectMetadataKeys + loadLiveProjectMetadata (fail-closed, shared with addStoreCategories); dirty-tracked form fields; Payment notice (payDisclosure) textarea; "Other fields kept:" line; buildSplitsEditPayload allows empty groups; owner-accrual explainer + queue-ruleset deep-link in the reserved editor; "Splits cleared" status.
Tests: test/metadata-edit-roundtrip.test.js (10) + test/reserved-splits-empty.test.js (11). Full suite 94 files / 674 tests green; check:source/deployments/generated/transaction + bundle budget green. Uncommitted.

## 2026-07-28 — reserved-splits card + editor (6 defects, confirmed onchain)
kmac88's Base Sepolia projects have NO splits on any ruleset and reservedPercent = 0 everywhere — the
"100% to an address" they saw was fabricated by our UI.
- [x] Tests first: test/reserved-splits-card.test.js (36 tests, one describe per defect)
- [x] D1 fillSplits → renderSplitsInto: empty group renders PROSE, never a synthesized 100% owner row; leftover row only when the group has recipients; owner LABEL beside the address (funds-card payouts row too)
- [x] D2 editor switched to GROUP-SHARE percentages (rows sum to 100% of the group, like jbm/revnet/juicy); issuance equivalent is derived read-only text; buildSplitsEditPayload(rows) takes no limit → the 0-limit dead end is gone
- [x] D3 rows show issuance share + "(x% of limit)" companion (jbm idiom); section note when reservedPercent is 0
- [x] D4 createRulesetSplitsLoader(project) — every read takes its CHAIN; cache keyed chain:ruleset; ensureUpcoming + openEditSplitsModal + lock duration follow the selected chain
- [x] D5 editor names the ruleset id/cycle it verified and warns when it differs from the card's
- [x] D6 JBSplits.splitsOf fallback (ruleset 0) read per chain; clearing blocked when the fallback is non-empty; fails closed on read error (mirrors juicy-vision SetSplitsForm)
- [x] Full suite + drift gates + bundle + playwright green; no commit

### Review
Root causes: (1) `fillSplits` synthesized a leftover row for an EMPTY group and wiped the owner label when
project.owner was known; (2) `verifiedLimit = reservedPercent/100` was 0 and consumed unguarded, so the
editor showed "0% of 0% limit" and rejected every percentage; (4) `faPid`/`faHome` were captured once from
the home chain while the chain dropdown swapped in another chain's ruleset id; (6) `JBSplits.splitsOf`
falls back to ruleset 0 when a group is empty (JBSplits.sol:154-159), so "clearing sends tokens to the
owner" only holds when the fallback group is empty.
New exports: renderSplitsInto, splitShareDisplay, splitsEditorTotalText, splitsEditorRulesetNotice,
splitsClearGuard, createRulesetSplitsLoader. Removed: splitLimitPctFor (dead once percentages are group
shares), the reserved-limit drift check in submitSplitsEdit (encoding no longer depends on the rate).
Tests: test/reserved-splits-card.test.js (36 new) + test/reserved-splits-empty.test.js retargeted to
group-share semantics. 95 files / 722 tests green; check:source/deployments/generated/transaction, bundle
budget (1,893,827 B gzip of 2,050,000 B) and 44 playwright tests green. Uncommitted.

## Native Defifa Entries consumer (2026-10-11)

## Plan refinement
- **Objective:** Show historical native entries, validated against the SDK market identity, and label known native markets Defifa while retaining ordinary shop behavior.
- **System fit:** The shared SDK owns protocol identity; Metalog owns receipt/curve verification and domain charts; Juicescan displays read-only evidence. Root coordinates API deployment, CI merge and publication; no wallet or contract changes.
- **Reuse and simplicity:** Reuse native inventory, flavor callbacks, explorer links, existing table/subtab styles and esbuild. Load a separate same-origin ESM only when Entries is selected; add no dependencies or chain scans.
- **Evidence and unknowns:** API metalog.entries.v1 uses fixed snapshot/cursor pagination, full range objects and optional chart precision errors. Desktop/mobile mocked integration is verified; production API/publication proof remains pending.
- **Verification:** Required npm check and hosted CI remain gates. Focused parser/render/identity tests, actual lazy-module browser integration, source/transaction checks and measured bundle ceilings cover failures, retry, pagination and generic writer exclusion.
- **Resource budget:** Each user-requested page is bounded by the API and a 2MiB/20s consumer ceiling; initial inventory adds no history scan. Optional module total growth is measured with pinned Node22.23.1; retain rounded, enforced ceilings.

- [x] Read required workspace resources and trace existing owners; root refinement gate passed.
- [x] Implement validated lazy entry history and SDK-native flavor labeling.
- [x] Focused tests:82; desktop/mobile browser integration:2; source/transaction/bundle checks pass.
- [x] Required full npm check passes: 1906 unit tests, 96 browser cases, clean audit, syntax/deployment/generated/schema/transaction gates and 2,286,212 B total gzip.
- [ ] Hosted CI must pass on final pushed source.
- [x] Deployed API pinned Base27 page validates; actual public evidence desktop/mobile replay passes (7 range rows,100 tokens,600 curve segments).
- [ ] Verify merged asset bytes and published desktop/mobile native Entries.

### Review
Source is prepared on an isolated branch; parent dirty drafts remain untouched. Entry charts use API density/positions directly, retain manual-reference and unavailable-chart labels, and never infer current ownership or sales. Source push does not imply publication or real transactions.

Validation evidence: /tmp/juicescan-entries-check.log; /tmp/juicescan-entries-real-replay/results.json and390.png/1280.png; /tmp/juicescan-entries-live-api.json. Public API snapshot52459661 includes verified transaction0xcd6bd310120559b85d136be071177421affbb34e8a3c2e31d8606d6ca2a0e212. PR61 is source-only; parent owns merge/publication after CI.

### Presentation follow-up (2026-10-11)
User requested no visible middot separators, a plain Onchain ranges caption, and no Terms explained project-header link. Copy is changed at the existing owners, retaining receipt/block audit details and protocol math comments. Root refinement gate passed before edits; native-caption, visible-copy and header-link regressions enforce the preference. Required complete checks and hosted CI rerun on the final copy commit before release.

## Generic Defifa NFT consumer final scope (2026-10-11)

## Plan refinement
- **Objective:** Show generic Defifa NFT tiers and verified protocol flavor, without Metalog links, numeric-range assumptions or curve information. Keep the requested plain captions and remove the header glossary link.
- **System fit:** The published SDK owns protocol identity, exact names/pricing/supply/phase and read snapshots. Metalog alone owns curve evidence. Generic writer guards remain fail closed; root owns merge/publication.
- **Reuse and simplicity:** Remove the optional curve module/client/build/CSS/tests completely; use the existing native inventory and SDK identity callbacks. Change visible copy at its existing owners, with no new dependencies.
- **Evidence and unknowns:** Nonnumeric names and mixed prices must render unchanged. The hidden inventory block enables release proof without technical caption text. Existing ordinary JB721 behavior remains covered.
- **Verification:** Run focused native/control/copy tests, source/transaction checks, complete required npm check and final hosted CI. Root verifies published source and desktop/mobile after coordinated release.
- **Resource budget:** Remove all curve request, asset and budget additions. Measure any remaining generic-flavor growth with pinned Node22.23.1 and keep enforced narrow ceilings. No new chain scans or public writes.

## Defifa basic Juicebox actions (2026-10-12)

## Plan refinement
- **Objective:** Make verified Defifa projects usable for ordinary Add to balance, remove inactive payment fragments, then integrate generic native NFT checkout/transfer/cashout without Metalog-specific data or public wallet writes.
- **System fit:** Existing SDK owns identity and protocol metadata; Juicescan owns rendering and existing terminal/accounting/simulation/review/receipt execution. Defifa mint and cashout require native calldata, while Add to balance is independent of NFT minting.
- **Reuse and simplicity:** Preserve the existing Add-to-balance transaction builder and quote/review protections. Keep genericPay false and scope its guard to actual generic Pay. Reuse the forthcoming SDK native encoder instead of copying Metalog.
- **Evidence and unknowns:** Baseline origin/main95cdc21 is clean; prior blanket native guards prevent Add to balance and leave memo/feedback visible. Native mint delegate defaults, phase, ownership and exact prices must be checked before subsequent integration.
- **Verification:** Focused control/action regressions prove unknown/error states hide all unused controls, verified Defifa exposes Add to balance, and generic Pay remains blocked. Required full checks and native simulated/reviewed action tests precede publication; no public wallet execution.
- **Resource budget:** Separate clean worktree preserves parent drafts. Finish basic-funds/UI behavior separately before native NFT integration. Use focused tests while iterating, one required full check after final source freeze, and coordinate SDK ownership.

- [x] Enable verified native Add to balance using existing execution owner and clean unused fragments.
- [x] Prove focused UI/action guard and ordinary/Revnet parity.
- [x] Integrate shared SDK native NFT actions with fresh identity/phase/price/ownership simulation.
- [ ] Run required checks and independent review before release.

Basic-funds review: focused 35 tests across inventory-controls, nft-inventory and discover-calldata-gaps pass on Node22.23.1; source syntax gate280 passes; ten focused desktop/mobile native browser cases pass. Unknown identity hides unused fields; verified native exposes Add to balance and keeps incompatible Pay guarded. No public wallet writes. Required final full checks/publication remain pending after shared native NFT integration.

Review correction: payment mode is validated as exactly Pay or Add to balance before any protocol guard or calldata preparation. Empty/unknown forged select values fail closed; focused suite now37 tests. Shared hook metadata decoder refactor preserves the installed SDK2.28 generic shop/swap/buyback/redemption outputs and passes existing10 review decoder tests plus source280 gate before native decoder changes.

Funding refinement: NFT identity is not authority for hook-free addToBalanceOf. Failed NFT reads keep minting unavailable and Retry visible but permit intentional funding after independent accounting-context, attached-terminal, wallet-balance and exact transaction checks. Direct top-ups do not call the mint preview hook. Root refined plan authorizes this correction; generic Pay remains blocked until authenticated.

Failed-identity funding review: focused actual-renderer test reaches an Add-to-balance review despite NFT RPC failure, while attached terminal/accounting/wallet checks remain required; twelve desktop/mobile native browser cases pass. Optional transaction receipt verification has three meaningful engine cases (await before success, retain submitted pending on failed verification/no resend, ordinary caller parity). Full final gates remain pending SDK/native integration.

## Native NFT actions and durable recovery refinement

## Plan refinement
- **Objective:** Support native Defifa NFT mint, transfer and cashout through the existing review/execution engine, preserving unknown submitted attempts across tab changes and reload while leaving independent funding available.
- **System fit:** Shared SDK preparations own phase, selected prices, delegation, ownership, canonical call/receipt proof and holdings. Shared SDK browser write recovery owns reservations, exact call persistence, locks and recovery; the app only renders controls and existing execution callbacks.
- **Reuse and simplicity:** Reuse SDK action bounds/phase predicates, selected tier snapshots, typed finalized failure, shared recovery journal and existing Safe execution lookup. Existing engine optional receipt/reverify hooks are extended narrowly; no duplicate calldata, token-ID arithmetic or second journal.
- **Evidence and unknowns:** Official SDK publication remains a release prerequisite; an integrity-checked local SDK preview only supports development builds. Self-payment delegation applies to all existing selected-tier holdings. Unknown receipt/proposal outcomes never authorize another send.
- **Verification:** Test mixed tier selections/prices, ERC20 approval rechecks/newer snapshot simulation, zero reclaim plus rewards, exact canonical receipt effects, Safe proposal/check, per-action pending reservation and unmount/reload recovery. Require final qualified SDK install, full repository gates/CI and read-only published desktop/mobile verification.
- **Resource budget:** SDK calls are bounded to128 action NFTs and explicit holdings continuations. Separate panel/tests ownership avoids discover edits racing; one final build/check follows frozen official dependencies. No public wallet writes or publication before parent coordination.

### Development review
Pinned Node22.23.1/npm10.9.8 with the SHA256-verified checked SDK preview passes 1,906 unit tests, 95 focused action/control cases and 18 desktop/mobile browser cases. Browser cases use the actual SDK journal for remount/reload, mock wallet execution and receipt preparation, and prove unknown submissions cannot resend while independent actions remain available. The execution boundary awaits durable reservation after simulation/gas, permits exact pre-wallet cleanup and numeric4001 refusal cleanup, and keeps all uncertain answers pending. Disposed panels preserve original receipt proof and clear only the matching record without new background reads.

Same-runtime/environment baseline95cdc21/core2.28 measures 10,408,036 B app raw / 1,508,387 B app gzip and 2,280,560 B total gzip. The checked development preview plus native integration measures 10,590,337 B / 1,536,512 B and 2,308,685 B total. Existing budgets intentionally fail until official package bytes are installed and narrow measured ceilings are reviewed. Official dependency pin, clean installation, required complete check, hosted CI and final read-only signed-out/connected publication proof remain outstanding. No public wallet writes or publication occurred.

## Safe native approval and final wallet boundary refinement

## Plan refinement
- **Objective:** Authenticate every native Safe payment as one exact call, with a separate verified ERC20 approval when needed, and stop wallet invocation when the reviewed account, chain, View as or route changes.
- **System fit:** Existing component allowance and execution owners prepare ordinary approvals; the SDK generic reviewed-write verifier proves approval receipts while native helpers prove NFT calls. The existing per-project pay journal retains successive legs and recovery.
- **Reuse and simplicity:** Extract one allowance reader with behavior-preserving caller changes first; native-only single-call mode preserves ordinary Safe atomic batches. Reuse shared journal and receipt proofs, adding no SDK batch API or second transaction store.
- **Evidence and unknowns:** Independent review reproduced immediate-execution-hash failure for a pay-only saved record of an approval-plus-pay Safe batch, and actor/route changes during the final awaited chain check. Proposal hashes and immediate execution hashes remain separately authenticated by shared owners.
- **Verification:** Regress final account, View as, route and chain changes, reviewed route versus persisted Safe flag, exact approval-only Safe review, canonical approval recovery then fresh mint review, immediate execution receipt lookup, unknown receipt errors and ordinary batch parity. Run final official SDK pin/full gates after review.
- **Resource budget:** Approval is a deliberate separate wallet action under the existing pay scope; recovery probes a returned hash once before one bounded Safe lookup. No public transactions, speculative batch decoder or additional journal.

### Final release qualification
Official core2.29.0 is pinned with the publisher-verified SHA512 integrity, and a clean Node22.23.1/npm10.9.8 installation changes no other dependencies. Required npm check passes 1,925 unit tests and 116 browser cases, production audit, source/deployment/generated/schema/transaction gates and measured bundle ceilings. Final independent review approved the separate Safe approval and final wallet-boundary corrections. Evidence: /tmp/juicescan-defifa-actions-official-check-final.log.

The first required run intentionally remains recorded at /tmp/juicescan-defifa-actions-official-check.log: an older SDK deployment checkout had the correct content digest but Git revisiona6ab40c, while this consumer and its CI pin c62b3ac. The successful rerun used /Users/jango/Documents/jb/v6/evm/deploy-all-v6/deployments at exact c62b3ac, with no gate changes. SDK and app deployment pins have different scopes.

Official final bundle measures 10,594,759 B app raw / 1,537,367 B app gzip and 2,309,541 B total gzip. Caps round only these measured values to the next1KB; no unrelated asset allowance changes. Hosted CI, immutable merged artifact publication, Center pointer deployment and actual signed-out/100-NFT-wallet read-only verification remain separate release gates. No public wallet writes occurred.

## Center-owned ENS reads

## Plan refinement
- **Objective:** Route forward and reverse ENS reads through the existing Center mainnet client while preserving normalization, caches, address hints and explicit custom RPC preferences. Native actions are unchanged.
- **System fit:** The create-flow ENS helper serves address fields and the connected-account header; discover already uses the shared Center client. The wallet/chain owners choose supported default and explicit user transports.
- **Reuse and simplicity:** Remove the dedicated PublicNode client and unused viem constructor imports. Reuse existing createPublicClientForChain(1), without a new resolver abstraction or provider fallback.
- **Evidence and unknowns:** Actual connected-wallet production proof identified UniversalResolver RPC at PublicNode. Grep shows this is the only direct provider constructor; remaining PublicNode constants are unreachable default fallback entries on the eight Center-supported chains.
- **Verification:** Meaningful constructor/transport regressions exercise normalized forward and reverse APIs, failure retry and explicit custom RPC parity; full required checks, narrow size measurement, hosted CI and merged-byte publication precede final live ENS verification.
- **Resource budget:** One clean branch preserves the previous immutable release. Reuse source and transport owners; one bounded live ENS proof after deployment with no wallet writes.

### ENS review
Three real viem HTTP regressions fail on the original dedicated provider and pass with the shared client, including normalized forward/reverse resolution, cache/alias behavior and explicit custom RPC isolation. Required npm check passes on Node22.23.1/npm10.9.8: 1,928 unit tests, 116 browser cases, production audit, source/deployment/generated/schema/transaction and bundle gates. Bundle decreases to 10,594,623 B app raw / 1,537,295 B app gzip and 2,309,470 B total gzip, with unchanged caps. Evidence: /tmp/juicescan-center-ens-before.log and /tmp/juicescan-center-ens-check.log.

Native action, inventory, identity and transaction-engine source files are byte-equivalent to approved75f0553. Root reviewed the narrow transport change. Hosted CI, exact merged publication/byte proof, Center directory update and narrow actual forward/reverse/connected-wallet verification remain release gates; the completed native production proof is retained. No public wallet writes.


## Shared Defifa checkout presentation

## Plan refinement
- **Objective:** Defifa NFT checkout uses the same visible Shop preview, tier cards, synchronized cart and Pay-card layout as ordinary collections, while retaining native phase, exact-price, delegation and transaction evidence requirements.
- **System fit:** discover owns makeNftCart, makePayShopItem, renderTierCard and the Pay/Shop layout; defifa-nft-actions owns SDK preparation, review, durable recovery, successive Safe approval and canonical receipt verification. Connect existing selection to that adapter without generic native calldata.
- **Reuse and simplicity:** Reuse existing presentation functions directly with a native display adaptation and mint-only/holdings-only adapter options. Avoid copying the ordinary transaction engine or building another cart. If a clean shared owner is missing, extract behavior unchanged in a separately checked commit before changing presentation.
- **Evidence and unknowns:** Current native strip prematurely returns one Choose NFTs link from a tierLimit1 identity; the Shop uses independent quantity fields. Full SDK inventory is already owned by fetchProjectTiers; first native adapter render reuses its verified snapshot, while preparation/refresh remains fresh. Cosmetic URI reads use the authenticated store/hook and snapshot block, one tier at a time, cached and visible-only; names remain immediate SDK evidence. Native metadata supplies actual names, mixed prices, supplies and phase, not Metalog identity or curve evidence.
- **Verification:** Prove ordinary preview/card parity, native complete tier preview and shared cart synchronization, exact native selected quantities/prices/review, phase/supply limits, unknown/error retry, preserved recovery and Safe approval tests, desktop/mobile fixture screenshots, full required checks, hosted CI and exact merged release/live proof.
- **Resource budget:** One clean worktree at222c5f preserves dirty parents and previous artifacts; reuse existing dependencies and bounded SDK readers. Separate native adapter work from discover presentation ownership; no public wallet writes, new contracts, unbounded histories or curve requests.

- [x] Freeze shared presentation/adapter design and run plan gate.
- [x] Reuse preview/tier cards/cart for native checkout and preserve ordinary behavior.
- [x] Pass focused native/security/parity and desktop/mobile presentation regressions.
- [ ] Pass full gates/CI and publish only exact merged artifact.

### Shared checkout review
Behavior-preserving subtotal extraction e0af172 passed40focusedtests before presentation changes. Final independent source review passes137focusedtests and covers actual EOA/Safe/prerequisite approval invocation boundaries, funding chain round trips, cart ABA changes, memo/delegate changes, DOM disposal, and preservation of the original durable attempt. Owning adapter69 tests and presentation15 tests pass; desktop/mobile16 browser cases pass with screenshot inspection. Visible chain duplication was caught by screenshots and fixed in the existing hidden-selector CSS owner. No contract or public wallet transactions occurred.

Final measured app10,608,739 B raw/1,540,551 B gzip and total2,312,731 B gzip versus same-environment222c5f10,594,623/1,537,295/2,309,470. Narrow next1KB caps10,609,000/1,541,000/2,313,000 cover shared UI/media/native intent guards, without dependency changes or other asset allowances. Full required checks, hosted CI, exact merged artifact publication/byte verification and actual live qualification remain gates.

Required check completed on Node22.23.1/npm10.9.8 with official locked SDK2.29.0: 1,962 unit tests across192files, 124 browser cases, production audit0, source/deployment/generated/schema/transaction gates and measured bundle ceilings all pass. Evidence /tmp/juicescan-shared-checkout-full-check.log. The first sandbox DNS-only audit failure remains /tmp/juicescan-shared-checkout-full-check-sandbox-network.log; no check was skipped or weakened. Final independent source review approved; actual recorded-artwork replay screenshots remain supplementary to the passing fixture and later live release gates.

Final recorded-art review caught a funding-only terminal warning incorrectly appearing in native Pay. Scope that display to the funding form while native SDK preparation remains authoritative; Add restores the genuine warning. Independent review and all16inventory-control tests pass. Final measured app10,608,862 B raw/1,540,572 B gzip,total2,312,753 B gzip remains within unchanged narrowed ceilings. Actual-art replay screenshots at1280/390 for native and ordinary Shop render the exact Center-recorded SVG, with explicit synthetic inventory labeling, no overflow/errors/writes, and native-only warning hidden. Evidence /tmp/juicescan-native-art-replay/summary.json. Repeating required checks on this last two-line presentation delta before publishing the final PR head.

Final caller refinement: the only remaining default native-actions UI caller is the existing Cash out action row. Explicitly render its holdings-only adapter so this route preserves transfer/redemption while removing the duplicate legacy mint quantity form. Keep the exported adapter's unrelated default behavior unchanged. Gate with a real caller/modal regression, then repeat the final required check and hosted CI.

Final caller gate completed: 17inventory-controls cases pass, including the actual Cash out modal's owned transfer/redemption controls and absence of another mint form. Final required npm check passes1,964unit tests across192files and124browser cases, all source/deployment/generated/schema/transaction/dependency/audit/budget gates. App10,608,884 B raw/1,540,590 B gzip,total2,312,771 B gzip stays under the narrowed ceilings. Evidence /tmp/juicescan-shared-checkout-qualified-check.log. Source is frozen for the final hosted CI head and exact merged release.

Caller regression qualification: use entry phase1, where both mint and refund actions are protocol-valid. Restoring the old default Cash out caller makes the regression fail with visible Mint NFTs and Review NFT mint; restoring holdings-only passes all17cases. Evidence /tmp/juicescan-cashout-caller-before.log and /tmp/juicescan-cashout-caller-after.log. This final change is test data only; checked production source and measured budgets are unchanged. Hosted CI must pass the updated exact head.

Concrete Connect-draft refinement before release: isolated probes on cleanac9f1ee reproduce note/recipientB being overwritten by pre-connectA during awaitconnect, both with and without wallet-change events. Preserve the existing mint draft across its redraw and read the latest draft after connection; no new state machine, journal, protocol authority or engine changes. Require both reproductions as regression gates, preserve existing post-review/final-send invalidation, and repeat the final exacthead required check/hosted CI. No further speculative sweep is part of this fix. Evidence /tmp/native-connect-draft-probe-false.json and /tmp/native-connect-draft-probe-true.json.

Connect fix frozen: four existing draft-lifecycle lines changed, no new state or journal. Both no-event and wallet-event/redrawn-field cases now prepare latestB and retain visibleB, while all69existing invalidation/recovery cases remain green. Independent review passes71native cases. Final measurement10,608,959 B raw/1,540,607 B gzip,total2,312,787 B gzip remains under the same narrowed budgets; no ceiling changed. Repeat only the required final-source gates and hosted CI, then release without another source sweep.


## 2026-10-12 — shared tier image failure fallback

- **Outcome:** Invalid or unavailable NFT artwork leaves a readable placeholder in Shop, previews, detail and selected-item thumbnails; verified names and checkout remain usable.
- **System fit:** Existing renderTierMediaInto owns media presentation and setMediaSource owns retry exhaustion. Reuse those owners for native and ordinary images, without rewriting creator SVGs or changing transaction authority.
- **Evidence and unknowns:** Actual recorded Base27 tier2 SVG fails XML decoding; shipped shared renderer reproduces naturalWidth0 and blank content in thumb/full/detail. Evidence /tmp/juicescan-image-failure-before.json. Inspect selected thumbnail callers to route image failures through the same owner.
- **Authority and recovery:** User authorized preview fixes and release; root coordinates final Center pointer. Only existing media retry exhaustion replaces failed image; no contracts, wallet execution, provider changes or SVG sanitization.
- **Verification:** Add exhausted-image and retry/stale-node regressions plus real Chromium malformed-SVG fallback proof; preserve successful images, names/cart selection and existing media behavior. Run required full checks, exact-head CI and merged release byte verification.
- **Resource budget:** One shared renderer callback plus existing selected thumbnail caller reuse; bounded recorded-URI browser proof, no live chain fanout or new dependencies. Narrow measured budget only if final bytes require it.

Fallback review: independent83focused tests and4viewport browser regressions pass. Exact recorded Base27tier2 URI is verified by hash e0af53dad397dde566149344d384da26e5c43090d0d4495fcb90c73a4b5d5f61; before/after three-mode browser evidence and native/ordinary desktop/mobile card/preview/selected replay all prove no broken img after failure. Synthetic inventory is explicitly distinct from recorded URI provenance. Measured final app10,609,107 raw/1,540,684 gzip (+148/+77 B), requiring only raw cap next1KB10,610,000; gzip/total and all other caps unchanged. No dependencies, SVG rewriting, protocol or transaction authority changes. Required full gates and exact hosted CI remain before merged artifact publication.

Screenshot correction: shared selected-thumb placeholder needs compact single-line styling in its existing34px box. Scope .paybox-nft-thumb .shop-tier-ph to9px/ellipsis/nowrap, preserving full adjacent NFT name and all valid-image styles. Browser gate asserts compact selected fallback plus intact name; refresh recorded-art PNG before final exacthead gates.

Final CSS qualification: source/deployment/generated/schema/transaction/dependency/audit gates and1,972unit/coverage cases passed before the screenshot-only style delta. The superseded browser run was intentionally interrupted (exit130), not qualified as full success. Final CSS build/budget and4focused viewport cases pass; complete browser matrix reruns finalCSS and exact-head hosted CI runs every gate. Final total2,312,880gzip stays below unchanged2,313,000cap. Recorded failed-art replay refreshed all4screenshots with compact selected placeholder and adjacent full name intact.


## 2026-10-12 — compact Pay mode and empty loading notice

- **Objective:** Native and ordinary Pay mode chevrons hug their label; pending identity renders no empty bordered error bar while real errors stay visible.
- **System fit:** Existing renderPayCard owns mode changes and funding diagnostics; sizeSelectToText owns option sizing and shared .paybox-contract-warning owns warning presentation. Native preparation/phase/review/journal/receipt owners remain unchanged.
- **Reuse and simplicity:** Native full-inventory transition sets Add to balance back to Pay without invoking the existing sizing helper. Centralize that call in updateModeUi and keep empty warning boxes hidden in the shared CSS owner, without new state or dependencies.
- **Evidence and unknowns:** Source identifies stale Add-width and initially empty terminalNotice before first diagnostics render. Reproduce pending identity and native fixture transition in real Chromium before changes; source investigation is not live verification.
- **Verification:** Extend existing delayed-identity browser harness with compact Pay width native/ordinary parity, no empty warning geometry, and real error visibility. Run owning control regressions, required local/hosted gates, exact merged artifact publication and8byte comparisons before root Center pointer.
- **Resource budget:** Two shared presentation owners, existing harness, no live RPC fanout/wallet signing or sends. Scope strictly these2bugs; narrow measured caps only if required by final bytes.

Before/after qualification: original native Pay width111px and empty warning height16px fail both regressions. Shared-owner fixes pass4desktop/mobile cases: native Pay matches ordinary compact width before/after Pay→Add→Pay, pending warning has0height, genuine funding error is visible. Owning17control unit tests pass. Final total2,312,885gzip remains under all existing caps, no budget changes. Source action/preparation/phase/recovery/journal/metadata owners are unchanged. Required full exacthead checks/CI and verified publication remain.

### Allowed decrease (jango ruling 2026-10-20)
- [x] The tolerance control reads "Allowed decrease" in every client: `slippageControl`'s label and custom-input name (pay and cash out), the pay and cash-out minimum lines and the buyback-floor message. Presets stay juicescan's 0.5/1/3/5. The cash-out minimum line drops its em dash.

### SDK 3.4.1 (2026-10-20)
- [x] Bump @bananapus/nana-sdk-core 3.3.0 -> 3.4.1; delete juicescan's payRetrySlippageBps and pay tolerance constants for the SDK's `payRetrySlippageBps`, `PAY_DEFAULT_SLIPPAGE_BPS` and `PAY_MAX_SLIPPAGE_BPS`. A retry is offered only when the SDK marks the failure `adjustable` with a nonzero shortfall.
- [x] The zero-fill line is the SDK's ("This payment would return no tokens.").
- [x] The custom allowed-decrease field is bounded by the SDK cap (49.5% for pay), checked after rounding.
- [x] Codex final pass: the cash-out preview's `var slip` (a bps number) shadowed the shared `slip` control, so `slip.sync()` threw on pool routes (from the refactor commit). Renamed the local `slipBps`; `test/var-before-declaration.test.js` fails any function that reads a name before its own `var` shadows it.
- [x] Codex passes 2 and 3: the gate now counts named function expressions, class static blocks, module bindings, imports and destructuring as outer names, skips keys, member names and parameters a var redeclares (fixtures for each), and still catches the original cash-out shadow; the known-revert pay test encodes a complete revert and asserts its line, with the truncated selector kept as an unknown-failure case.
- [x] Codex passes 4 and 5: a memo edit ends a loosened tolerance but leaves the quote, so Pay still opens the review in one click (both tested); the gate also models a function expression's own name, named class expressions, block-scoped functions (not hoisted) and destructuring and loop targets as writes.
- [x] Codex pass 6 (UX): a quote that fails with a known reason shows that sentence in the card (and in the COMPONENTS widget) instead of "preview unavailable" or "No payment contract"; after Review again such a failure stops with the reason, no second quote or "Wait for the preview" dead end; a loosened payment that went through re-quotes the next one at the default tolerance so Pay is one click. Each tested, with negative controls.
- [x] Codex passes 7-9 (UX): a known quote-failure reason shows before any zero-amount early return (credit-covered NFT checkout), and Pay on such a quote re-quotes in that click; the widget's routing tag no longer holds up review (shown with its preview in one render, kept on submit only for the same route and metadata), and Pay works while a preview loads. Pass 10: SHIP. `npm run check` on 5649052: 2018 unit, budgets, 148 browser.

## 2026-10-22 — hold ambiguous direct writes

## Plan refinement
- **Objective:** A direct wallet write whose wallet errors without a hash (anything but an explicit rejection, code 4001) stays held: no second send of the same action, held across reloads, with a Check onchain / I checked my wallet exit; a hash with lost tracking is held the same way.
- **System fit:** `executeTransaction` (component-base.js) owns every generic direct write; `lpSendTx` (discover.js) and the ABI form (form.js) are the two other direct `writeContract` sends. Defifa and Relayr keep their own journals (Defifa opts out via `onWriteRejected`); `direct-batch.js` already persists a `sending` marker. Safe proposals and approvals are unchanged.
- **Reuse and simplicity:** Reuse SDK 3.4.1 `createBrowserWriteRecovery` + `createHeldWriteStorage` + `readReviewedWriteNonce` (writeRecovery is already in the startup chunk, no bump). One shared hold helper in component-base used by all three senders; no new journal.
- **Evidence and unknowns:** Verified on origin/main 1a49a35: the catch at component-base.js:1604 only keeps a state with a hash; lpSendTx:29322 and form.js:387 the same. SDK semantics read from 3.5.2 source and 3.4.1 d.ts.
- **Verification:** Failing-first vitest: ambiguous error then a second call does not open the wallet; 4001 releases; success clears; record survives a module reload (localStorage); check resolves by receipt. Then `npm run test:ci` (+ deps/audit), bundle budgets before/after.
- **Resource budget:** Nonce read runs in parallel with gas estimation (no new happy-path waterfall). Two Codex passes. Replan if budgets fail.

- [x] Failing tests (fail on origin/main source)  - [x] Shared hold + executeTransaction  - [x] lpSendTx + form.js  - [x] Gates + budgets
- [x] Codex pass 1 (request changes): storage now fails closed before the wallet; slot re-read before the wallet opens; release only the shown attempt; 4001-only release predicate; nonce search dropped (an estimated nonce cannot bind a no-hash attempt, as in the SDK), so no-hash holds end only by the user's wallet check.
- Direction change: local code mirroring the SDK, no new SDK imports.
- [x] Codex pass 2 (request changes): Web Locks now required to send (no in-tab fallback); a memory-kept hash only overlays the stored record of the same attempt.
- [x] jango rule: no extra confirmation on the normal path (tested: one dialog); a held action settles itself from the chain on the next attempt and offers one release only when the chain cannot settle it.
- [x] Codex pass 3 (request changes): every release now runs under the action's Web Lock (queued), so a stale callback cannot interleave with another window's swap; a held write that went through is reported as success (executeTransaction onSuccess with recovered:true, LP returns its hash, form shows success) instead of an error.
- [x] Codex pass 4 (request changes): both LP mint entry points (multicall, modifyLiquidities) share one hold, checked before any permit signature; a release must match the attempt's id and hash, so a release queued behind an open wallet never removes the hash it returned. Behavioral LP regression added.
- [x] Codex pass 5 (request changes): the release dialog compares id and hash with the attempt it shows and releases that snapshot, so a hash saved after the dialog opened stays held. Dialog-level regression added.
# Relayr definite rejection recovery

## Plan refinement
- **Objective:** Return a definitely rejected wallet payment to its original unpaid quote, while retaining uncertain submissions and signed request evidence.
- **System fit:** relayrPay owns wallet-error classification; existing funding callers own durable sessions. Restore only the exact hashless attempt under the existing payment lock.
- **Reuse and simplicity:** Reuse existing session persistence and locking, adding no dependencies or SDK requirements.
- **Evidence and unknowns:** Current main wraps all send errors as uncertain; monotonic persistence also prevents rollback. Trace all callers and preserve cross-window conflict protection.
- **Verification:** Test direct and nested4001, ambiguous transport errors, names without evidence, quote retry and journal monotonicity; run source, transaction, build and applicable repository tests.
- **Resource budget:** One isolated worktree and focused regressions followed by required gates; preserve dirty original checkout.

- [ ] Implement narrow rejection classification and explicit rollback.
- [ ] Verify failure/retry and uncertainty regressions.
- [ ] Run repository gates and publish reviewable branch.

Implementation review: Existing strict write-hold rejection classifier is reused. relayrPay restores only definite4001 rejections under its payment lock; all three funding callers restore the same hashless quote without erasing publication/request evidence. Uncertain transport errors and paid/conflicting records remain held. Focused payment/recovery/journal58 tests and creation recovery26 tests pass. Syntax325 files, transaction inventory118 boundaries, production bundle and original bundle budgets pass. Full coverage and repository/browser gates remain pending before publication.

# Correct Terminate notice boundaries — 2026-10-24

## Plan refinement
- **Objective:** Preserve configured notice on timed predecessors of Terminate and omit it only from the final FOREVER stage.
- **System fit:** Deployed core-v6@1.0.2 JBRulesets uses the predecessor approval hook to gate successor replacement. A Terminate clone remains a successor boundary. Client form applicability and encoding must share this rule.
- **Reuse and simplicity:** Adjust existing deadlineApplies and assembleRuleset owners; retain preset/custom hook resolution without new abstractions.
- **Evidence and unknowns:** Contract investigator verified deployed artifact matches nana-core-v6 bce6a4eea9f2442b328128e9861e3cee68704622. JBRulesets deriveStartFrom576, base hook763-779 and parent hook909 establish semantics, with three actual lifecycle regressions passing. FOREVER4294967295 is ordinary long duration, not magic protocol finality.
- **Verification:** Encode single and multiple timed stages ending in Terminate, timed stages before an explicit FOREVER stage, all-FOREVER and queue paths; assert preset/custom hooks and visible approval control, then rerun affected gates.
- **Resource budget:** Separate minimal commit after rejection recovery, bounded to notice applicability/encoding/copy and regressions. No contract changes or deployment.

- [ ] Correct notice applicability and per-stage hook encoding.
- [ ] Verify launch/queue payload and form regressions.

Notice review: Updated the existing applicability owner to retain notice controls whenever a configured stage is not FOREVER. Per-stage encoding omits the hook only on FOREVER stages, retaining it on each timed predecessor. Added launch/queue single and multiple timed+Terminate payload checks, explicit final FOREVER/custom hook checks and form-visibility checks. Focused notice/scheduling34 tests pass. No contract source changed.

# Preserve client-generated stage ordering — 2026-10-24

## Plan refinement
- **Objective:** Encode sequential stage boundaries in Custom launch/queue and Revnet launch, preserving Wait/Terminate and pinning immediate staged launches once; no contract changes or dependencies.
- **System fit:** A pure schedule owner derives actual cycle-aligned starts from pinned first start, parent, monotonic queue IDs and known notices. Encoders reuse its explicit starts; existing signed Relayr requests bound execution and direct/Safe reviews show execution limits, with receipt ancestry checked before success.
- **Reuse and simplicity:** Move existing deriveStartFrom unchanged into an import-free scheduling owner before adding ordered scheduling. Reuse existing 600-second first-start pin and direct/Relayr journals, request deadline and receipt logs. Keep existing one-stage launch behavior.
- **Evidence and unknowns:** Deployed core can replace a pending predecessor when later mustStartAtOrAfter is zero or below the predecessor's actual end. A known-notice schedule is stable within its prepared inclusion window; external Safe and direct mining cannot be expired onchain. Custom hooks can report ineligible states independent of timing, requiring explicit rejection of unprovable batches.
- **Verification:** Regression tests assert encoded floors and unchanged-contract ancestry through a contract-semantic fixture for default/no-hook, one-second delay, long notice, Wait/Terminate, queue parent/latest-ID and exact-second Revnet cycles. Signed deadline and expired preparation tests cover real callers; run source/inventory/build/budgets and affected suites before final Astra review.
- **Resource budget:** One pure math owner, existing create/discover compilers and local Relayr deadline extension only; physical locked dependency copy; freeze source before broad tests and avoid contract edits or deployments.

- [ ] Extract existing derivation without changing behavior.
- [ ] Implement explicit ordered schedules and lifecycle expiry guards.
- [ ] Verify focused and full owning checks, then hand off for separate Astra review.

Review progress: Existing derivation was extracted unchanged in712a972 after50focused checks. The client compilers now materialize every successor boundary, include known notices and latest IDs, retain the first pin and carry valid-until metadata through Relayr recovery. No-hook schedules remain ordered after delayed inclusion; external direct/Safe execution deadlines are advisory, while Relayr signatures enforce theirs. Unknown custom approval batches fail closed. Revnet frequencies and requested intervals use whole seconds, including fractional-day/no-cut cases.

Independent Astra review reproduced a short replacement-window error and a confirmed-receipt recovery bypass. The schedule horizon now respects the replacement approval window before monotonic IDs, and receipt checks verify the first chosen parent as well as every follower. Held-write recovery runs the original receipt verifier before release/success; single EOA creations retain their exact calls in the existing durable session. Tests cover module reload and retry without a second send.186focused checks across11suites pass; an earlier intermediate-source full run passed2157tests, but final broad checks will be rerun after review because the recovery changes invalidate that earlier source proof. Source, transaction inventory, build and unchanged bundle limits passed before the final review fixes.
Astra follow-up: a final expiry guard can prove a request unsent after the direct session has entered awaiting-wallet. Session transition now occurs in the existing onSending hook, and onBeforeWriteAborted restores the exact un-hashed attempt to ready. A real executeTransaction test crosses expiry while its final network await is held, proving zero wallet writes and one abort callback; a caller test proves the launch becomes discardable.94affected cases pass after this narrow follow-up. The preceding frozen snapshot60c804d passed2162full tests and148browser checks; final source verification will include this follow-up.
Final math refinement after Astra/parent discussion: materialize starts from actual preparation time and the observed latest ID, rather than a hypothetical future queue horizon. Explicit dates and replacement positions remain unchanged; only automatic append chooses extra headroom if its known parent notice leaves no usable execution window. Very short cycles with insufficient notice headroom produce an actionable admission error.191focused tests across11suites pass after the refinement, including explicit-date stability, automatic flexible-parent append and tiny-cycle admission.
Final resumed-result presentation delta: a detected ancestry error must leave state.deployed empty, otherwise the launch UI can show its success view despite the rejected receipt. The semantic-error branch clears success state before rethrowing;49affected tests pass, including a direct capture regression with a skipped intermediate stage. Separate Astra has been asked to review this narrow delta after approving098e9af.
Expired-quote recovery refinement: a strict quoted/unpaid expired schedule exposes an explicit Rebuild action in creation and Discover. It performs no signing, publishing or payment. Under the existing account payment lock, retirement requires every original publication proof, the canonical forwarder deployment, a pinned latest block whose timestamp is strictly after the signed deadline, and an unchanged nonce proving each request unused. Live, consumed, unknown, sending or changed-account evidence remains active. Only after archiving the complete receipt plus per-chain proof does the active marker clear; nonce reservations remain intact and the existing publication owner rechecks them before any replacement bundle.79focused cases pass, including actual UI availability and no automatic send, live/consumed/unknown refusal and archive-storage failure. This closes the bounded-window rebuild dead end without using wall-clock expiry as execution authority.
