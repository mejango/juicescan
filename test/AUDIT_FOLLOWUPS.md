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

## discover.js money-surface review (run 2026-06-21, branch audit-fixes-tx-security-and-tests)

A 4-area adversarial review (loans / move / Safe+claim / cash-out previews) confirmed 6 findings.

### Fixed
- **H-01** borrow `minBorrow` slippage floor was denominated wrong (base-currency 18-dec preview vs the
  contract's source-token-decimals check) → every USDC-revnet loan reverted + native loans floored 46–93%.
  Reverted to `minBorrow = 0n` (the preview can't be safely floored without a source-token-denominated
  borrowable). *A correct floor needs `borrowableAmountFrom` read in the source token's own decimals+currency.*
- **M-01** Composition "Total" row referenced an undeclared `totBalance` → `ReferenceError` blanked the whole
  table for any zero-balance project. Now `formatBalance(0n, …)`.
- **L-01 (modal)** cash-out modal read raw `balanceOf` as surplus (overstated when a payout limit exists →
  could push the fallback min-reclaimed floor above the real reclaim → revert). Now reads `currentSurplusOf`.
- **L-02** cross-chain cash-out "Total" raw-summed heterogeneous accounting tokens (ETH 18-dec + USDC 6-dec)
  and labeled with chain[0]'s token. Now renders `—` when held chains hold different accounting tokens.

### Deferred (documented for the next pass / `/code-review ultra`)
- **L-01 (other displays)** the "You" table cash-out value (`discover.js:~10852`) and Composition "Unit value"
  (`~14056`) still pass `balanceOf` as surplus to `currentReclaimableSurplusOf` — display-only overstatement
  for non-revnet projects with a payout limit (binding tx uses `previewCashOutFrom`, so no fund mis-move).
  Fix: same `currentSurplusOf(pid, [], [acct], decimals, currency)` swap.
- **L-03** Safe execute drops `APPROVED_HASH` (on-chain `approveHash`, null-signature) confirmations during
  signature concatenation (`safe.js:execSignatures`) → "enough signatures" execute reverts (GS026/GS020).
  Non-default (only when an owner approves on-chain). Fix: synthesize the v=1 pre-validated sig bytes
  (32B left-padded owner ‖ 32 zero bytes ‖ `0x01`) for those confirmations + count only usable sigs in `nconf`.
- **L-04** Safe queue Sign/Execute omits `operation` (DELEGATECALL) + ETH `value` and skips a confirm modal
  (`discover.js:6410-6447`). Defense-in-depth WYSIWYS gap. Fix: show `confirmTransactionModal` with value +
  operation, RED-warn/block on `operation===1`, and badge DELEGATECALL / "sends X ETH" in the row label.
