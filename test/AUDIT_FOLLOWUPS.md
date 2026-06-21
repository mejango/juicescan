# Audit follow-ups — applied vs deferred

Source: the 9-agent transaction/security/dedup audit (run 2026-06-21). The fund-safety, security, and crash
defects are fixed and regression-tested. The remaining items are dedup/normalization (larger, drift-prevention)
or low-severity edges caught at on-chain simulation — deferred to a focused follow-up pass.

## Applied (this commit)
- **H1** payouts dead — `sendPayoutsOf` currency `uint32`→`uint256` (selector `0xcfaf5839`). *Test: abi-selectors.*
- **H2** queue ruleset dead — `JBSplit` tuple field order fixed to canonical. *Test: abi-selectors.*
- **H3** queue weight `Math.floor(Number*1e18)` (drift >9M / `BigInt('0.5')` crash) → `parseEther` try/catch.
- **H4** `pay()` slippage floor = 99% of previewed output (was `0`).
- **H5** `cashOutTokensOf()` slippage floor = 95% of `previewCashOutFrom` reclaim (was `0`).
- **H6** standalone Launch component now fetches `JBProjects.creationFee()` and passes `value` + ABI `payable`.
- **H7** ETH+USDC (custom project or revnet) forces base currency to USD(2) so USDC payments resolve. *Test: validation.*
- **M5** custom cash-out tax clamped strictly `< 100%`.
- **M8** permission ids 34/35/36 corrected to `SET_SUCKER_PEER / SUCKER_SAFETY / SET_SUCKER_DEPRECATION`
  (checking "SUCKER_SAFETY" had granted the more dangerous `SET_SUCKER_PEER`); bogus `HIDE_TOKENS` removed.
- **Feature** revnets can hold ETH + USDC (multi-context `revnetAccept`); custom token is exclusive.
- **L8** removed 20 dead functions across 10 modules (verified single-hit).

## Deferred (real, but larger or sim-caught)
- **H8 / M1 / M2 / M3 — single-source the ruleset/721 encoders.** queue-ruleset-component duplicates
  launch-component's default factories, fund-access editor, and ~8 UI helpers; create-flow's `build721Config`
  duplicates discover's `submitAddTiers`. Extract a **new leaf module** (`nft721-build.js`, shared ruleset-ui)
  imported by both — **never** add a create-flow↔discover or queue↔launch cycle (discover already imports
  create-flow; queue already imports launch). This is the mechanism by which H1/H2/H3 drifted onto one copy;
  fixing it prevents recurrence. Largest remaining item.
- **M1** queue `createDefaultPayoutLimit` currency `''`→ encodes `0` (invalid JB currency) — single-source the
  default factory with launch (pick `1`/ETH).
- **M4** blank/zero-percent payout rows encode `percent:0` → `JBSplits_ZeroSplitPercent` revert. Filter them
  (mirror the reserved path's `origIdx`-preserving filter so per-chain keys stay aligned). Caught at simulation.
- **M7** payouts component hardcodes payout currency to the token-derived id — let the user pick / read the
  project's configured payout-limit currency (blocked behind H1 until that feature was dead).
- **L1** clamp custom-path ruleset weight to `UINT112_MAX` (fails at encode today, no fund risk).
- **L2** sort 721 tiers by category before encoding (fold into H8's extraction; sim-caught).
- **L4/L5** borrow `minBorrowAmount:0` slippage floor + guard `loanToken` until the accounting token resolves.
- **L6/L7** single-source `DEADLINE_OPTIONS` and the scaled-USD converter (leaf constants / bendystraw-format).
- **L9** trim remaining dead imports (`safeTxLink`, `registry`, a few discover import-list entries).
