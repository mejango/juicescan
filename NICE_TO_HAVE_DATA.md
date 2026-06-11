# Nice-to-have on-chain data

Things that would be **nice to read directly from the V6 contracts but currently can't** — gaps where
the only source today is an off-chain indexer (event history / set enumeration). This is a candidate
list for small protocol additions, **not** a catalog of what the site already reads (that lives in the
code). Bendystraw now indexes V6 (the indexing/accounting, isRevnetOperator, RevLoans, and buyback-swap
PRs are live), so these are served by the indexer today — they remain here only as candidates for an
*on-chain* getter, since some are better served straight from chain (fewer moving parts, no indexer to
trust, always live).

If an item becomes readable on-chain (existing getter found, or a getter added), remove it from here.

## Could be exposed on-chain with a small getter (actionable)
These are genuinely missing on-chain today, but a one-line convenience getter would close the gap and
make the corresponding UI indexer-free. Low priority — alternatives exist — but worth flagging.

- **Auto-issuance beneficiary set.** Per-address auto-issuance already works fully on-chain (read
  `REVOwner.amountToAutoIssue(revnetId, stageId, beneficiary)`; distribute via `autoIssueFor`). The
  *only* missing piece is discovering *which* addresses have an allocation without scanning
  `StoreAutoIssuanceAmount` events. A getter like `REVOwner.autoIssuanceBeneficiariesOf(revnetId,
  stageId) → address[]` would expose the set on-chain. (Today: enter/connect an address to query it.)
- **Operator address.** `REVOwner.isOperatorOf(revnetId, addr)` is **check-only** (bool for a
  candidate), so to *display* "operator = 0x…" you need the `SetOperator` event. A trivial
  `REVOwner.operatorOf(revnetId) → address` getter would make it on-chain-readable.

## Inherently off-chain (an indexer is the right tool — listed so it's not re-proposed)
These want event history or full set-enumeration that the protocol shouldn't store on-chain (it would
mean tracking unbounded sets on every transfer/payment — expensive, not the protocol's job). Noted here
so nobody mistakes them for a missing getter.

- **Token holder set / ownership distribution** (owners list, balances, %, paid). ERC-20 + credits have
  no on-chain holder enumeration; derived from `Transfer` / credit events.
- **Per-holder paid / volume**, and **per-holder balances across chains** — from payment events.
- **Activity feed** (pay / cash-out / payout history) and **bridge-transaction history** (sucker
  transfers + statuses over time). A sucker's *current* root/state is on-chain; the historical list is
  not.

## Notes
- Per-stage decoded terms (reserved % / cash-out tax / base currency) are **not** a gap — they decode
  from the packed ruleset `metadata` uint that `JBRulesets.allOf` already returns, and the site reads
  them. They don't belong on this list.
