# What Juicescan assumes and what it cannot prove

## Which deployment generation a project uses

Juicescan generates its contract registry from the pinned deployment artifacts. Successful receipts and constructor identities establish the recorded deployment generation; they do not prove a project's current registry selection. Mainnet capabilities remain on their recorded generation until executed artifacts are distributed and the site is regenerated. OP Sepolia's ratio feed does not imply a hook, router, or gateway deployment.

Read `JBRouterTerminalRegistry.terminalOf(projectId)` for the actual payment path and resolve a selected gateway's `ROUTER`. Existing projects can retain historical routers or hooks. Chain-specific ABIs and retired addresses must remain available for transaction forms, activity decoding, and migration previews. When deployed source references conflict, omit the ambiguous source body instead of presenting another generation's implementation.

## Operator batches

Operator presets and mirrored batches must validate the destination chain's recorded deployment, deployed code, live registry allowances, and hook/pool dependency order. Failed contract reads remain errors; they cannot establish an empty pool or an allowed migration. Revalidate the prepared batch before submission because registry selections and allowances can change after preview.

## Payments held by the gateway

An eligible failed gateway route can leave original input tokens in custody while its outer transaction succeeds. `pendingCallCount` counts issued IDs, not outstanding calls. Reconcile commitments, failure information, and lifecycle events. Qualified finalization refunds source-project accounting rather than paying the user directly, and does not restore core fee-free surplus.

The pending-payment panel queries every indexed page by source project, version, and chain, including payments retained by a recognized historical gateway. Original calldata must match both its indexed hash and the gateway's live commitment. Eligibility and process-versus-finalize selection come from live failure state and block time. Custody is excluded from project balances. Incomplete reads block batching; each ready call receives a separate reviewed transaction, with a maximum of 256 calls per saved action and no silent truncation. Retry gas uses the gateway's qualified budget within the live block limit and 2^24 transaction ceiling; these calls use direct transactions or the connected Safe rather than a Relayr forwarder. An unsigned round can refresh after another keeper acts, but wallet, relay, and Safe publication records preserve their original recovery. A successful outer receipt completes an attempt only after its matching gateway lifecycle event is verified; it may still leave the payment pending.

## Safe proposals for held payments

A known Safe proposal whose original gateway commitment is proven consumed can be marked obsolete, independently of execution. Its exact hash and nonce are archived for cancellation, and other pending calls can continue. A changed failure count alone never invalidates a signed proposal; it stays in the Safe queue for deliberate cancellation or replacement. Unknown wallet or Safe publication remains blocked for inspection. Missing fee preview data is neither a fee exemption nor proof of refund.

## Buyback quote format

Buyback quote encoding follows the project's live hook generation. The newest format is three words, `(amountToSwapWith, minimumSwapAmountOut, skipSplits)`, and falls back to minting below its derived TWAP floor. Earlier hooks keep their deployed formats and behavior. Ratio-feed availability also depends on the underlying feeds and the live `JBPrices` selection.

## What the checks prove

The static build's artifact, encoding, browser, and accessibility checks validate the generated interface. They do not execute production migrations or establish live RPC availability, current project authority, or settlement of a particular pending call.

## Fee-token return estimates

Fee-token return reviews simulate the exact fee-bearing call with `eth_simulateV1` at a pinned block. Only Pay events from recorded terminals and known fee payers, buyback Mint/Swap events from recorded hook generations, and beneficiary receipts from recorded controllers determine the estimate. A hook Mint without Swap signals issuance fallback; ordinary issuance and partial swaps are distinguished. Estimates refresh on new blocks and on confirmation; a new fallback or unavailable result requires another explicit choice. Waiting never submits automatically. Unsupported simulation RPCs, prerequisites not yet mined, unrecognized deployments, or a multi-call review without a single executable context remain unavailable, not “Buyback ready.” The estimate is advisory. The transaction preflight and the explicit minimums still apply, and the result can change between review and execution.

Fee reviews include every recognized fee payment, including tokens credited to a beneficiary other than the connected account. Receipts show that beneficiary and only matching controller receipts count toward its return. Terminal-paid payments need a matching `ProcessFee` event from their payer, beneficiary, and source project metadata; an ordinary project payout is not a fee, even when it pays project #1. Repeated fees are identified by their terminal, project, beneficiary, and occurrence within that identity, so unrelated fee changes do not prevent readiness after recovery. Hook activity makes an estimate unavailable until its controller receipt is verified, even when the payment also issued tokens directly. The disappearance of a previously affected fee, or a shrinking group of otherwise indistinguishable fees, still cannot establish recovery.
