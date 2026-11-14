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
