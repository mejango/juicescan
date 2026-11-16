# Fewer network requests (2026-11-16)

jango's rule: a page loads what it needs once, then refreshes about every 30 seconds or on a distinct user action; faster polling only for a short window right after the user sends a transaction. Bendystraw allows 100 requests per minute per IP. No read that protects money or correctness is removed or weakened. Branch `perf/lean-network`, not pushed, for review.

- [x] 1 Activity card: 30 s poll; a tick sends one probe and reloads (activity, ruleset rows, pending payments) only when it changed; sucker map kept per project for the session; post-transaction fast path unchanged. `test/activity-poll.test.js`.
- [x] 2 Live price: no timer without a pool; pool key and slot0 read once per refresh; indexed history paged again only when the indexer's row counts changed (full paging kept, no incremental merge). `test/price-refresh.test.js`.
- [x] 3 Indexer failures: a 429 without Retry-After waits 5 s and is retried once (`test/bendystraw-batching.test.js`); a failed poll tick doubles the interval, capped at 4 minutes, reset on success (`test/live-poll.test.js`).
- [x] 4 Safe queue: in-flight dedupe for `listPendingSafeTxs`; nothing kept after it settles, so dialog-open and propose-time reads stay fresh. `test/safe-runtime.test.js`.
- [x] 5 Bridge leaves over an hour old persisted with `src/cache.js` (`src/bridge-leaves.js`), validated by the outbox count, still verified against the emitted root, dropped on a mismatch. `test/bridge-leaves.test.js`.
- [x] 6 Empty bridge table: retry only when a read threw. `test/bridge-movements-listener.test.js`.
- [x] 7 Held writes: 30 s, skipped while hidden, focus refresh at most once per 30 s, an unsettled row re-read for ten minutes and then only by Check, which reads again before offering a release. `test/held-writes-polling.test.js`.
- [x] 8 `waitForSafeExecution`: 4 s for the first minute, then 30 s. `test/safe-app.test.js`.
- [x] 9 Safe queue page: a host is repeated only after a 5xx or a network error; the legacy host is still tried. `test/safe-runtime.test.js`.
- [x] 10 Real: the price timer and, on phones, the activity loop stopped for good once their tab was switched away. Both use `src/live-poll.js` and resume on `jb:tab-shown`, which `showTab` dispatches.
- [x] Full `npx vitest run`, `npm run check:source`, `schema:check`, `transaction:check`, `check:bundle`; commits per finding.

## Review
- Startup grew 1,094 B gzip (740,086 to 741,180), over the 741,000 ceiling; the ceiling is now 742,100 in its own commit, for jango to accept or reject.
- Not covered by a unit test: the one line in `showTab` that dispatches `jb:tab-shown` (the resume itself is tested in `test/live-poll.test.js`).
- Seen, not changed, not verified in a browser: the price refresh appears to draw pool values without the base-currency conversion the first load applies when the issuance currency differs from the accounting token.

## Plan refinement
- **Objective:** Juicescan asks the indexer, the Safe service and RPC less often or not twice, per the ten audited findings, with no change to what a user is shown before signing. Success is each finding done with a test that fails without it, or skipped with a stated reason.
- **System fit:** Read cadence lives with each card in `src/discover.js`; the indexer client (`src/bendystraw-client.js`), Safe service client (`src/safe.js`), held writes (`src/held-writes.js`) and cache (`src/cache.js`) keep their owners. Pre-sign re-reads, Safe policy and nonce re-verification, proof reads and the fee-buyback block watch are untouched; authority and execution links are unaffected.
- **Reuse and simplicity:** One new small owner, `src/live-poll.js`, holds the poll rule (30 s, idle while hidden or detached, resume when shown, double after a failure) for both the activity card and the price chart instead of two hand-rolled timers. Reused: `cacheGet`/`cacheSet`, the nonce in-flight pattern, `onDocumentWhileConnected`, `ammPriceFromSqrtPriceX96`, `readPoolState`.
- **Evidence and unknowns:** The findings come from a read-only audit at 9936c82 and each is re-read in source before a change. Unknown until tried: whether an incremental swap merge is safe (the series is downsampled and reserves are replayed, so a count probe with full paging on change is the fallback), and whether the live indexer accepts the aliased probe query (the schema check covers the fields).
- **Verification:** A vitest regression per behavior change (fake timers for cadence), the affected tests as each lands, then `npx vitest run` and `npm run check:source`. The deployment-parity step of `npm run check` fails locally for environment reasons and is not part of this evidence.
- **Resource budget:** One worktree, one finding at a time, `discover.js` read by line range only, small commits. Replan if a finding is wrong in source or a change would delay or weaken a pre-sign read; such a finding is skipped and reported.

# Parity with juicebox.money (2026-11-13)

jango: fix everywhere Juicescan is behind and everywhere juicebox.money is behind; home page and sign-in stay different by design; the Build guide becomes the same; revnet.money aligned too, scoped to revnets; thorough; unsure items go in one list at the end. Source reports: scratchpad `parity-1..5-*.md` (Juicescan 53b7882 vs juicebox.money 0512c604).

Juicescan PRs, in order. Each is re-checked against the cited lines before a change, lands with a regression test, and passes `npm run check`.

- [x] J1 Safety: Set terminals prefilled from the live list; transfer acknowledgement; pay amount cleared when a chain switch changes the token; payment notice in the pay review; paused payments read and blocked; Safe proposal is its own state in every flow (cash out, loan, repay, redeem, move, bridge claim, owner actions, batch, launch); cash out minimum row on the pool route; queued movements keyed by pair, token and sucker; single-chain distributions verify the receipt. Done in PR #106.
- [x] J2 Same result: ERC-20 deploy salt is juicebox.money's `keccak256("jb-erc20:name:symbol")` in both deploy paths; chain order Ethereum, Base, Arbitrum, Optimism; cash out tax as its 0 to 1 value; a revnet starts at 0.1; launch salt random per launch; each client names the other's `.jb` draft on import; a failed route read fails the token list with a retry; a tier with unread flags is not buyable with credits. Held for jango: router ERC-20 authorization (Permit2 here, plain approve there), a shared `.jb` format, which salt continues tokens already deployed here.
- [x] J9 The SDK 6.6.0 rules, ported by hand (`src/project-hooks.js`, `buildPayPermit2Metadata`): the buyback hook is the one the current ruleset calls for the direction (use flags, a revnet's own registry, the omnichain deployer's extra hook, any hook generation), the pool summary included; every ERC-20 payment from a plain wallet signs a free Permit2 authorization, direct or routed, an already approved terminal asks for nothing, and any account with code approves the exact amount; `addToHookMetadata` keeps the reserved word and refuses malformed metadata; a revnet's own fee is netted in the holder's cash out value and the unit value. The floor chip stays labelled before fees.
- [ ] J3 Launch: done: an empty owner or operator uses the connected wallet; a Safe launch ends as proposed and stays off Relayr (one chain at a time, the Safe app is bound to one chain); every accepted token mapped on suckers, CCIP by default; price feeds stay addable for a custom token; revnets always deploy with the shop config; gates for ticker, unlinked pairs, unfinished items and a start under an hour out; an hour of lead behind a notice. Open: metadata through Center (Center refuses a site with no fixed origin, for jango), re-signing only unfinished chains, live price feed gate, a receipt for every chain.
- [ ] J4 Gates and review: done: holders of QUEUE_RULESETS, SET_PROJECT_URI and SET_SPLIT_GROUPS pass the owner gate; a ticked acknowledgement before every send; owner powers check each selected chain's rules; pool parameters bounded before review; pay review in plain rows (J1). Open: old and new values in ruleset, split, metadata and shop reviews; permission ids for the remaining owner powers.
- [ ] J5 Missing features: wallet balance line and dollar value on the pay card; cover image, extra links; funding chart; 404; header stats; deadline names; activity paging; pool migration and market editing; held-writes list; Simple preset; multisig owner.
- [ ] J6 Wording: every shared string reads as juicebox.money's (after its own rule breaches are fixed there).
- [x] J7 Build guide mirrors juicebox.money's (`src/build-sections.js`, the resolved `BUILD_SECTIONS`), as Learn does; the two guides link to each other inside the bundle.

- [x] J9 Pinata key fields and gates removed (Center pins with no setup). A first token deploy says that later chains need the same account, name and symbol (`TOKEN_SAME_ADDRESS_NOTE`).
- [ ] J8 Round two, after jango's rulings of 2026-11-13. Done: price feeds checked live on the review step, every chain, before pinning, with Retry; a receipt line for every launched chain, and an unreadable project ID says not to resubmit; tickers without a dollar sign; testnet indexer at testnet.bendystraw.xyz; metadata pins through Juicebox Center with no key (needs Center #110 deployed), and a launch never goes out without metadata; the token editor deploys an existing token on the chains missing it, at the same address when this sender can reproduce it. Open: the Pinata key fields are now dead UI and come out; Safe launch on several chains as one proposal per chain through the owner wallet path; one `.jb` format shared with juicebox.money and revnet.money; the buyback hook and router terminal resolved through the ruleset data hook, and the revnet fee netted, inline; Relayr first with ordered sends as the fallback; re-signing only unfinished chains.
- [x] J11 A relayed owner change is simulated from the signer on each chain before any forwarder signature (`simulateRelayedCalls`); a revert is refused with its chain. Launch already estimates each leg before signing.
- [x] J10 Rulings of 2026-11-14: a Safe launch on several chains is refused with what to do instead (connect a wallet, name the Safe as owner); Set terminals sends an empty list only with Allow an empty list turned on (it stops payments and cash outs), the same field juicebox.money has.
- [x] J12 The shared `.jb` file (version 2, rulings of 2026-11-14): `src/jb-draft-format.js` is the SDK's format module with its types removed (regenerated by `build/port-jb-draft-format.mjs`, held to the SDK's vectors by `test/jb-draft-format.test.js`); `src/jb-draft.js` maps the file to and from the launch form's state and refuses what the form cannot express (a new Safe, Sticky splits, unlinked chains, a later project stage that keeps the issuance before it, item voting units, and more, each by name). Import, export and the live-project export all go through it; the browser's saved draft keeps the form's own state. The test builds every chain's launch call before and after a round trip and requires them equal. Version 1 files are refused by name.

juicebox.money and revnet.money items are tracked in those repos' `tasks/todo.md`.

## Plan refinement
- **Objective:** For the same user action on the same project, Juicescan and juicebox.money (and revnet.money for revnets) do the same thing and say the same words; the home page, sign-in and SDK use stay different. Success is each listed gap closed with a test, or put to jango in the end list.
- **System fit:** juicebox.money (through the SDK) is the reference for behavior and wording unless its side is the gap. Juicescan keeps one owner per rule: `component-base.js` `executeTransaction` owns send states, `chain.js` owns chain order, `create-flow.js` owns launch, `discover.js` cards consume them. Mirrored copy keeps its source (Learn, and now Build, from juicebox.money).
- **Reuse and simplicity:** Fix the shared owner once (for example the proposed state handled in the status setter, not per card). Port juicebox.money's rule rather than inventing a third. No SDK dependency is added to Juicescan. Features that need a hosted service juicebox.money has and a static site cannot (card or bank) go to the end list.
- **Evidence and unknowns:** The reports are subagent readings; 13 Juicescan claims were confirmed by me, the rest are re-read before each change. Unknowns that need an owner ruling (which salt wins for projects already deployed, which wording wins where Juicescan's is the clearer one, cash out tax as decimal or percent) are held for the end list unless juicebox.money's rule is plainly the reference.
- **Verification:** A unit or browser regression per fix, reverted once to see it fail where the fix is a gate; full `npm run check` per PR; CI green before asking to merge. Transaction-argument changes round-trip through the ABI tests.
- **Resource budget:** One worktree, PRs sized so one `npm run check` (about 8 minutes) covers each; edits in the main session; read-only subagents only for the revnet comparison and for review. Replan if a fix needs an SDK release or a contract read contradicts a report.


# Open first, fill in after (2026-11-14)

jango: do the whole inventory of places where Juicescan can feel faster the way juicebox.money does, without giving up data integrity; merge to main when ready. The inventory is the 2026-11-13 read-only sweep (sections A to E below).

Rule for every item: the click answers at once (dialog, pressed button, placeholder row); nothing can be agreed to or sent until the exact call and every read that decides it is on screen; a failed read is said, never replaced by a default.

- [x] Shared lever: `openPendingReview` (confirm dialog opens with known rows, "Loading…" for the rest, acknowledgement and Confirm locked), `busyWhile` for buttons, a status line while an earlier held write is checked. `test/confirm-pending.test.js`.
- [x] A. Clicks that showed nothing while reads ran: project card, Cash out button, Safe queue Sign and Execute, item discount and remove, free mint review, redeem items, LP claim fees, Burn, Launch and Pay tool forms, owner and operator forms, lazy chunk downloads.
- [x] B. Reviews that waited behind a status line: Pay, Cash out, loans, payouts and allowance, distribute reserved, bridge claim, execute and sync, Move and Add liquidity, Safe batch, queue rulesets, create launch and resume, Relayr review, Defifa actions, LP move and remove, edit splits.
- [x] C. Views that went blank: handle URL tab switches, the rebuild after a confirmed transaction, account page lists and route, Defifa panel, tool form chain discovery, Data tab and contract read.
- [x] D. Independent reads run together instead of in sequence, in every flow touched above.
- [x] E. Rows that popped in late get a placeholder from the first paint.
- [x] Each item ends changed with a test, or listed in the review with the reason it stays.

## Review (2026-11-14)

Built as one shared lever plus six sections in isolated worktrees, each diff read before merging. Two Codex passes on the combined diff.

Changed on review: the bridge fee probes stay in order (probing every budget at once always cost the slowest probe and let a throttled RPC raise the fee shown); a routed subtab now switches on a reused page (cached sections keep their switch, slugs accepted), which the handle URL reuse exposed.

Left as they were, with the reason:
- Relayr payment review: a test pins that a different runtime is rejected before the review opens; one code read of delay.
- Cash out by direct pool sale, and Add liquidity submit: both use the stepped pay dialog, whose step list depends on the authorization plan read. The buttons already disable and say what they are doing.
- Contract warnings under the header, the "Rules change in" notice and "Your loans": most projects and wallets have none, so a placeholder would appear and vanish for the majority.
- Pending multisig cards, Distribute form, pending payments per row: already open-first or already parallel.
- Cash out inventory then route, Defifa cash out's two prepares, the handle editor's record checks, token edit's token verification first: each read depends on the one before it.
- Owner and operator form buttons: the shared path now says "Checking who can send this…" at the click; the buttons themselves get no visual disable because the shared path does not hold them.
- After a confirmed transaction no card has its own refresh: the page is still rebuilt from fresh data, and the old page stays visible but inert until the new one has loaded (or 4 seconds).

Known cost: a tool form opens as soon as its chain choice is settled, so a chain that answers later re-renders the form once.

Not verified against live wallets or a live Safe. The page handoff, handle URL tab switches and the first-use loading dialog are covered by unit tests of their parts and by the existing browser suite, not by a browser test written for them.

## Plan refinement
- **Objective:** Every listed Juicescan action responds at the click and fills in as reads land, with no change to what is sent or to which reads gate a send. Success is each inventory item changed and tested, or recorded with the reason it stays as it is.
- **System fit:** `component-base.js` owns the confirm dialog and `executeTransaction`; flows in `discover.js`, the tool components, `create-flow.js`, `safe-batch-ui.js`, `relayr.js` and `project-ops-modals.js` consume it. The pending state lives in that one dialog and is handed to `executeTransaction` through the existing `confirmSession` path, so prepared call, authority, send and receipt handling are untouched. juicebox.money and revnet.money already work this way, so no port is owed there.
- **Reuse and simplicity:** One pending mode in the existing dialog and one button helper; no second dialog, no state library, no SDK. Views reuse their existing skeletons and caches. Sequential independent reads become `Promise.all` in place; dependent reads keep their order.
- **Evidence and unknowns:** The inventory came from subagent sweeps at 39f2a09 with four items spot-checked; every item is re-read at current main before it changes. Unknown: which E placeholders shift layout more than they help, and whether the post-transaction rebuild can refresh in place without stale cards; both are decided against the code, and anything that would trade integrity for speed stays and is listed.
- **Verification:** Unit regression per changed flow (pending dialog locks Confirm, failed read fails closed, busy button), the existing transaction suites unchanged and green, `npm run test:ci` including the browser suite, one independent review of the combined diff, CI green before merge.
- **Resource budget:** The shared lever first in the main session; then sections split by file region across isolated worktrees from that commit, each brief carrying these rules and resources; I review every diff before merging it into one branch and one PR. Replan if a section needs the dialog API to change or main moves under a region being edited.

## 2026-11-14: Owner gates and read parity with juicebox.money (J5a)

## Plan refinement
- **Objective:** Close the Juicescan gaps the round 8 comparison found that are plain to verify: operators holding the matching permission can use the owner powers juicebox.money lets them use, and the project header and ruleset detail show what juicebox.money shows. Success is each item changed with a test, and nothing else sent differently.
- **System fit:** `discover.js` owns the owner power list, the header and the ruleset rows; `runAuthorityActionAcrossChains` already takes a `permissionId` and checks it onchain, so each power only names its id. No SDK, by rule; the ids are the V6 `JBPermissionIds` values juicebox.money uses.
- **Reuse and simplicity:** One `permissionId` field per power on the existing list, read by the one runner. Header stats reuse the existing formatters. The not-found state is one render function for malformed routes and missing groups. Skipped: a shared permission table module, since the ids are used in one file.
- **Evidence and unknowns:** Ids checked against `JBPermissionIds.sol` and juicebox.money's authority map. The comparison report is model output; each item was re-read in both clients before changing. Unknown: whether jango wants the "This juicebox is empty" wording and the "raised" and "holders" stats as written; listed for him.
- **Verification:** A unit test per item (`owner-power-permissions`, `ruleset-deadline-name`, `project-links-and-cover`, `header-stats`, route not found), `npm run test:ci`, one Codex pass over the branch diff, CI green on the PR.
- **Resource budget:** Main session only, one branch stacked on #116, one PR. Replan if #116 changes the launch surface under these files.

- [x] Owner powers pass for an operator holding the matching permission
- [x] Ruleset detail names a known rule-change deadline by its length
- [x] Header: cover image, WhatsApp and Instagram links, raised and holders stats
- [x] A route that names no project says so
- [x] Full check, Codex pass, PR

### Review
- Owner powers (mint, set controller, set terminals, migrate, add price feed, set token, buyback hook, pool and TWAP, router terminal, add accounting token) each name the `JBPermissionIds` value that delegates them, and the one runner checks it onchain, so an operator holding it passes the gate as on juicebox.money.
- Ruleset detail names a known rule-change deadline by its length. The header shows the cover image, WhatsApp (https only) and Instagram (handle pattern) links, and raised and holders stats. A malformed route or a missing project says so instead of showing the grid.
- Verification: `npm run check` green (2576 unit tests, 148 browser tests). Codex `gpt-6.1-sol` two passes: one finding fixed (a metadata refresh dropped the Instagram link), pass 2 CLEAN.
- Total distribution budget raised 2,135,000 to 2,140,000 B gzip, measured 2,135,380.
- Not done here: the rest of the round 8 list (pay card balance and dollar line, funding chart for custom projects, activity paging and bridge rows, held-writes list, Simple preset, multisig owner, old and new values in reviews, Relayr re-sign of unfinished chains). New copy for jango: "This juicebox is empty" and its line, the "raised" and "holders" stats.

## 2026-11-14: Pay the better of the listed routes (J6)

- [x] Project pay card: a token the project takes directly is also quoted through the router the project lists; the payment goes to the route that gives the payer more.
- [x] One ranking for both pay surfaces (`payRouteIsBetter` in `pay-preview.js`): most tokens to the payer, then the larger minimum, then total issuance, then the direct terminal. The same order as the SDK's `prepareBestUserPay`.

## Plan refinement
- **Objective:** Ruling 1 of 2026-11-14: a payment is quoted on every terminal the project lists and takes the best, the same on all three clients. Success is the project card paying the router when it quotes more and the direct terminal otherwise.
- **System fit:** The card's preview already carries the prepared metadata and minimum; it now also carries the terminal it was quoted on, and the send reads the terminal from the reviewed preview. The listed-terminal check at send (`paySurfaceAllows`) still runs on the chosen terminal.
- **Reuse and simplicity:** `prepareCardPay` per route, the existing ranking moved to the module both surfaces import. Item checkout and add to balance are unchanged. No SDK.
- **Evidence and unknowns:** The card's terminal surface (`readProjectPaymentSurface`) says whether the directory lists the registry and the multi terminal; without it the card quotes the token's own entry only.
- **Verification:** Unit tests for the tie-break and for the card paying each route; `npm run check`; Codex until clean.
- **Resource budget:** One branch from main, one full gate, review passes as needed.
- **Authority and recovery:** A pull request, merged on jango's word. One commit; reverts alone.
- **Agent-system impact:** None.

## 2026-11-14: Paged activity and listed terminals in the Pay tool (J7)

- [x] Project feed loads the newest 250 rows per indexer query, then a "more" control loads the next page. The 15 second refresh reads the loaded window only, not the whole history.
- [x] Standalone Pay tool quotes only the candidates the project's directory lists. An unread directory keeps both candidates, since the preview still gates the send.
- [x] Launch defaults checked against the 2026-11-14 ruling: new revnet stages already start with no cut and a cash out tax of 0.1. No change.

## Plan refinement
- **Objective:** Close two J5 gaps against juicebox.money: its feed pages at 250 with a "more" control, and its pay route candidates come from the project's listed terminals. Success is a bounded refresh and no quote on an unlisted terminal.
- **System fit:** `fetchBendystrawCollectionPages` already takes a row cap and reports `capped`. `mergeActivityPages` stops the merged feed at the newest edge of a capped query so rows never show with gaps; ruleset rows from chain state join once the window reaches back to them.
- **Reuse and simplicity:** juicebox.money's strings ("more", "Loading…", "Could not load more activity. Try again."). No new module. No SDK.
- **Evidence and unknowns:** Bendystraw limits a caller to 100 requests a minute; an open project with a long history spent several per refresh. Rows sharing the edge's exact timestamp may wait for the next page.
- **Verification:** Unit tests for the merge and for the Pay tool's listed filter; `npm run check` (2587 unit, 148 browser, green); Codex until clean.
- **Resource budget:** One branch from main, one full gate, review passes as needed.
- **Authority and recovery:** A pull request, merged on jango's word. One commit; reverts alone.
- **Agent-system impact:** None.

## 2026-11-14: Funding chart for custom projects (J8a)

- [x] Overview of a custom project shows a Volume / Balance bar chart with a range choice, the same series juicebox.money draws. Revnets keep the price chart.

## Plan refinement
- **Objective:** Close the J5 funding chart gap. Success is a custom project's Overview showing cumulative dollar volume (payments plus direct additions) or dollar balance over a chosen window.
- **System fit:** `src/funding-chart.js` holds the series rule (`fundingChartPoints`, a hand port of juicebox.money's `bucketize`) and the card. `discover.js` only fetches the two indexed collections and mounts it.
- **Reuse and simplicity:** Native selects for metric and range, an inline SVG with a title per bar. Existing paged indexer fetch. No chart library, no SDK.
- **Evidence and unknowns:** The card stays hidden when there is no history or the read fails; the page's numbers do not depend on it. Not rendered against the live indexer in a browser.
- **Verification:** Unit tests for the series and the card; `npm run check`; Codex until clean.
- **Resource budget:** One branch on top of J7, one full gate, review passes as needed.
- **Authority and recovery:** A pull request, merged on jango's word. One commit; reverts alone.
- **Agent-system impact:** None.

## 2026-11-14: Round 9, jango's answers to the end list (J9)

- [x] J9a Funding chart Balance is holdings at today's price: each token's indexed balance history times today's price (chain ETH feed, 1 for USDC, newest indexed rate otherwise).
- [x] J9b Every launch goes through JBOmnichainDeployer, also on one chain (no sucker configurations, zero sucker salt), so the project can connect a chain later. Queueing for such a project already goes through the deployer.
- [x] J9c Payment notice differences across chains, and a failed notice read.
- [x] J9d Pay card and Pay tool say "You get about" and show the guaranteed floor when a market price sets part of the amount.
- [x] J9e Held-writes list, Simple preset, old and new values in the queue review, and the queue refuses a copied ruleset whose shop the deployer would not carry on any chain. Full check green (2612 unit, 148 browser); Codex pass 3 CLEAN.
- [x] J9f Old and new values in the splits and details reviews (`src/edit-review-rows.js`). Full check green (2617 unit, 148 browser). Codex three passes: four wording findings fixed; two set aside (a split's runtime fallbacks when the project has no token or terminal, and 0xdead shown as an address).
- [ ] J9g Builds still owed, each its own pull request: Relayr re-sign of unfinished launch chains, multisig owner creation, old-pool position move. Asked of jango with a design for each.

## Plan refinement
- **Objective:** Close the items jango answered on 2026-11-14 so Juicescan does what juicebox.money does and states only what is true.
- **System fit:** The chart series stays in `funding-chart.js`, launch routing in `create-flow.js` `buildLaunchArgs`, each a hand port of the juicebox.money rule. No SDK.
- **Reuse and simplicity:** J9a reuses the page's ETH feed read and the paged indexer reader. J9b deletes two launch branches.
- **Evidence and unknowns:** `JBOmnichainDeployer._launchProjectFor` deploys suckers only for a nonzero sucker salt, and its no-shop overload still deploys an empty 721 hook, so every such project can queue through it. Bendystraw `origin/main` values a V6 balance per token at the rate when it last moved (the J8a note about flow accrual came from a stale checkout). The indexer reads a several-field clause inside OR as any of those fields, so history is read per deployment, and the project record batch now wraps each project in its own AND. Not launched on a live chain from this branch.
- **Verification:** Unit tests per rule; the full `npm run check`; CI green before merge.
- **Resource budget:** One branch, one pull request.
- **Authority and recovery:** A pull request, merged on jango's word; a new build is published only when asked. One commit per item.
- **Agent-system impact:** None.

## 2026-11-14: Round 10, the builds still owed (J10)

- [x] J10a Relayr launch: finish unfinished chains. A paid bundle that left chains unfinished signs the SAME launch call again for those chains at the SAME forwarder nonce and funds one new bundle (`src/launch-retry.js`, `finishCreateRelayr`, `relayrPostBundle` `replaces`). jango approved keeping the launch calldata in browser storage and letting the nonce guard accept a same-nonce replacement of the same action.
- [x] J10b Multisig owner creation in create. The owner (or a revnet's operator) can be a new Safe: 2 to 20 signers and an approval count. Its address is fixed by them and the launch's salt, the same on every chain, and each chain's launch goes out as one Multicall3 batch that creates the Safe and then launches (`src/safe-create.js`, `withSafeCreation`, `checkSafeCreation`). The shared `.jb` file's `safe` is read and written instead of refused.
- [x] J10e Exact pay route choice. With a wallet connected, each native-token route is run as the payer (the amount lent to the call) and the one that delivers the most tokens wins; a reverting route is dropped while another is left; otherwise the previews decide. One rule for the Pay tool and the project pay card (`bestPayRoute`, `pickPayRoute` in `src/pay-preview.js`; `runUserPay`, `isExecutionRevert` in `src/pay-prepare.js`), the hand port of the SDK's `prepareBestUserPay` with `simulateFrom`.
- [x] J10c Old-pool position move. A position left in a pool the project's buyback has moved off shows "Move to new pool" in Your LP positions: one `modifyLiquidities` unlock burns it and mints the same band in the current pool, funded only by the burn (`prepareMoveToCurrentPool`, `openLpPoolMove` in `src/discover.js`), the hand port of juicebox.money's `liquidityMovePlan`. `test/lp-pool-move.test.js` pins the unlock to that function's output for the same inputs. Refused when the current pool is unopened, priced more than 1% from the old pool, or not the same pair, fee and spacing.
- [x] J10f Position edit. "Edit" on a position in the current pool sets what it should hold and the range it covers, in one transaction: increase, decrease, re-band (the burn funds the mint), or remove (`src/lp-edit.js`, loaded on first use). It is the hand port of juicebox.money's `buildEditLiquidityPlan`; `test/lp-edit.test.js` pins all four kinds, on a native pair and an ERC-20 pair, to that function's output (`test/fixtures/lp-edit-vectors.json`). It replaces the band-only "Move". The position and the price are read again at Review and right before sending.
- [x] J10g The two-sided market (`src/lp-market.js`, loaded on first use), a hand port of juicebox.money's `src/lib/market-liquidity.ts` pinned to its output (`test/lp-market.test.js`, fixtures from that module). The add form opens on "Make the market" when the project has a floor and a ceiling: two single-sided mints in one call. Two positions in the current pool whose bands meet get "Edit market": each side's amount on its own, and a re-fit of both to the floor and ceiling as they stand, one call. Reviews list approvals and the Safe batch through the add form's helpers; every edit is sent through `runAddLiquidityTxs` (Safe queue guard, a re-read after approvals). Review fixes carried here: a re-band is refused when the burn no longer covers the mint at the live price (also juicebox.money #194).
  - Evidence: on a local anvil fork of Base (projects 3 ETH pair, 6 USDC pair, a fresh funded key) the market mint, a market edit, a market re-fit, and a position increase, decrease, move with new capital, move with the same holdings and removal all executed, with onchain liquidity equal to each plan, pulls within the reviewed funding and returns above the floors. The first runs reverted with viem's bare gas estimate; with a gas limit they pass. Juicescan's sender pads its estimate (`contractGasWithHeadroom`).
  - Not run: the old-pool move (needs a position in a retired pool), anything through a Safe, and the dialogs themselves in a browser.
  - Left out on purpose: claiming both sides' fees in one call. Each position keeps its own Claim fees.
- [x] J10h Raised by chain on hover, and the issuance price preview in Create.
- [x] J10j Claim both sides of a market in one call (jango, 2026-11-15: "i want it"). Small and obvious: `prepareCollectLpFees` takes `pos.claimIds` and encodes one zero-liquidity decrease per position plus one TAKE_PAIR, the bytes juicebox.money's `buildCollectMarketFeesUnlockData` builds; the same review and sender as a single claim; "Claim market fees" on the selling side's row. Test in `test/open-first-bridge.test.js`.
- [x] J10k A re-band's reviewed cap is enforced onchain (jango, 2026-11-15: "yeah built it, sounds right"). A move (`lpEditPlan`) and a market re-fit (`lpMarketEdit`) end in `SETTLE` of each reviewed cap from the caller plus `TAKE_PAIR` (`lpCappedClose`) in place of `CLOSE_CURRENCY` x2: the PositionManager's `_getFullCredit` reverts when a currency is still owed, so the wallet cannot pay more than "Authorizes up to". Same bytes as juicebox.money (fixtures regenerated from its builders) and revnet.money. Fork evidence: Base projects 3 and 6, re-bands funded in ETH, USDC and project token execute with the unused part of the cap returned, market re-fits execute, and the same plans with caps cut to a tenth revert with `DeltaNotPositive` (0x4c085bf1).
- [ ] J10i Asked of jango: Sticky split recipient (Juicescan has no pinned source for Sticky's addresses), the deployment check dialog, paying by card.
- [x] J10d Other items are split into J10h (built) and J10i (asked).

## Plan refinement
- **Objective:** Juicescan can do what juicebox.money does for the remaining owner and creator actions, each as its own pull request.
- **System fit:** The relay guard stays in `relayr.js` (one new journal option, `replaces`); the launch rule in `launch-retry.js`; the create flow only wires them. No SDK.
- **Reuse and simplicity:** J10a reuses the existing bundle, payment and receipt code. The proof that a chain launched is the destination transaction itself (forwarder, signer, exact call), so no Relayr record is trusted. The nonce rule is one line: a request of the same action, signer, chain and nonce may replace the saved one.
- **Evidence and unknowns:** OpenZeppelin's `ERC2771Forwarder.execute` reverts as a whole when the inner call fails, so a used nonce means a request at it ran. Two requests at one nonce cannot both run. Not run against the live Relayr service.
- **Verification:** Unit tests for the outcome rule, the saved calls, the launch proof and the guard's replacement path (refusal restores the paid receipt; another action's reservation is never replaced); the full `npm run check`; Codex until clean.
- **Resource budget:** One pull request per item.
- **Authority and recovery:** Pull requests; jango said "merge all" for round 9 only. The paid receipt is archived under `jb-relayr-retired-v1:` before it gives way. One commit per item.
- **Agent-system impact:** None.
- J10b evidence: the predicted address equals the SDK's own test vector. Read-only checks on Ethereum, Base, Arbitrum, Optimism and their Sepolia testnets show the pinned Safe 1.4.1 code hashes hold and a simulated creation returns the predicted address, the same on all eight. On a local Base fork, a project (one chain, and one leg of two) and a revnet (same two shapes) launched through the batch with the gas a wallet estimates; the Safe verified afterwards and `JBProjects.ownerOf` is the Safe. A second run of the same batch is accepted as "already there"; another policy at that address is refused.
- J10b not done: not run through Relayr, not sent on a live chain, not rendered with a wallet. A relayed launch does not confirm the Safe after it lands (the direct path does); the check before signing covers it.
- J10b new copy for jango: "Create a multisig so its signers approve decisions together." / "Use your wallet or an existing multisig." / "Create a multisig" / "Already have an owner in mind?" / "+ Add signer" / "Approval policy" / "The multisig is created in the launch, at the same address on every chain." The first six mirror juicebox.money; the last is new.
- J10b review: Codex `gpt-6.1-sol` four passes. Fixed: the Deploy summary named the wallet as operator; a resumed direct launch skipped the Safe confirmation; a resumed review showed only the encoded batch (it now names the Safe, its signers and the launch inside). Pass 4 CLEAN. Full check green: 2650 unit tests, 148 browser tests. Total budget 2,151,000 B gzip, measured 2,149,531.
- J10e evidence: unit tests for the choice, the run and the revert reading (seven node answers through viem's own error handling). Not run against a live chain.

## 2026-11-15: Sticky split recipient and the deployment check (J11)

jango, 2026-11-15: "1. add to juicescan. 2. lets add to juicescan."

- [x] J11a Sticky recipient, shown. A split whose hook is the chain's StickyDistributor reads "Sticky holders stuck 4 to 52 weeks → SYMBOL" in the split lists, shop item routing, the activity feed, the edit review and the decoded call (`src/sticky.js`).
- [x] J11b Sticky recipient, edited. The split editor's Hook type offers Sticky (token, all holders or holders stuck N weeks, optional maximum). Before anything is signed, each chain is checked the way the distributor checks it (`PROJECT_ID()` then `StickyHook.tokenOf`), and reserved tokens need the project's ERC-20 there.
- [x] J11c Sticky recipient, launched and queued. Create and the queue form offer Sticky for payouts and reserved tokens (never shop items). A new custom project's reserved tokens are refused with juicebox.money's sentence, since it has no ERC-20 at launch. `.jb` files carry it as `to: "sticky"`, both ways.
- [x] J11d Deployment check. Extras gains a "Deployment" card whose "Check deployment" dialog runs read-only checks of the chosen chain's wiring at one block (project, controller, revnet configuration, hook routing, shop hook bindings, store, factory, pricing, an optional operator's shop powers) and, apart from them, of the indexer's record. `src/deployment-check.js` (loaded on first use) is a hand port of the SDK's checker, pinned to that checker's own reports for 27 scenarios (`test/fixtures/deployment-check-vectors.json`).

## Plan refinement
- **Objective:** Juicescan names, edits and launches Sticky recipients the way juicebox.money does, and gains its deployment check.
- **System fit:** One module, `src/sticky.js`, owns the addresses, the group rule, the labels and the pre-sign check. The forms keep a Sticky row as the hook row it is onchain (hook: distributor, address: token, project id: group), so encoding, drafts and recovery are unchanged.
- **Reuse and simplicity:** No new record type and no new encoder path. A slot holding per-chain values is never Sticky, so one token is checked on every chain. No SDK.
- **Evidence and unknowns:** Addresses are hand-pinned from the Sticky repository (Sticky is not in deploy-all); `cast code` on Base and Ethereum shows both contracts have code. Group rule and labels follow the SDK's `v6/sticky`. Not sent on any chain.
- **Verification:** Unit and DOM tests (`test/sticky.test.js`, `create-sticky.test.js`, `splits-edit-sticky.test.js`, `.jb` round trip), Create rendered locally with live services blocked, the full `npm run check`, Codex until clean.
- **Resource budget:** One pull request for Sticky, one for the deployment check.
- **Authority and recovery:** Pull requests only; no merge word for this round yet.
- **Agent-system impact:** None.
- J11d kept as the SDK has it: a project on a retired controller generation reads "Custom / unsupported". Not run against a live chain; the dialog was not rendered in a browser (it needs a live project), its DOM test covers it.
- J11 not built: a different Sticky token per chain in one row (the row is refused per-chain values, as juicebox.money refuses them in a file). The split editor row was not rendered in a browser (it needs a live project); its DOM test covers it.

## 2026-11-15: Wallet balance gate in the position and market editors (J12)

- [x] J12a Review refuses a position or market edit the wallet cannot fund: gated on what the pool pulls, and on the whole cap when the edit burns to mint (the capped close settles the cap). One rule (`lpBalanceProblem`) for both editors, the wording juicebox.money uses.

## Plan refinement

- **Objective:** A re-band or re-fit the wallet cannot cover is refused at Review instead of reverting onchain.
- **System fit:** One rule, lpBalanceProblem in src/lp-edit.js, read by both editors; balances come from the existing readWalletTokenBalance.
- **Reuse and simplicity:** No new reader and no new dialog state; the refusal uses the editors' existing error path and juicebox.money's wording.
- **Evidence and unknowns:** juicebox.money EditPositionPanel and MarketEditPanel gate the same way (paysCap). Not gated: gas on a native pair, and a balance that drops between Review and send (the call then reverts).
- **Verification:** Unit test of the rule on both branches and on a failed read; full check.
- **Resource budget:** One small pull request.
- **Authority and recovery:** Pull request; jango asked for the gate, no merge word for it yet.
- **Agent-system impact:** None.
