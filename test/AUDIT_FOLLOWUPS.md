# Audit follow-ups — applied vs deferred

Source: the 9-agent transaction/security/dedup audit (run 2026-06-21). The fund-safety, security, and crash
defects are fixed and regression-tested. No deferred items from this pass remain open.

## Applied (this commit)
- **M1 follow-up** queue fund-access defaults now reuse launch's shared payout/surplus row factories, so newly
  added payout-limit and surplus-allowance rows default to currency `1` (ETH) instead of encoding invalid `0`.
  *Test: discover-tx.*
- **M4 follow-up** shared split encoding now drops zero-percent rows before launch/queue transaction encoding,
  avoiding `JBSplits_ZeroSplitPercent` reverts for blank rows that still have a beneficiary/project filled in.
  *Test: discover-tx.*
- **L1 follow-up** ruleset issuance weight parsing is now shared and clamps to the protocol's `uint112` max
  before launch/queue ABI encoding; negative or invalid input encodes as `0`. *Test: discover-tx.*
- **L2 follow-up** 721 shop tiers now sort by ascending category before launch/new-shop deployer encoding,
  matching the hook store's category-order requirement. *Test: queue-new-shop.*
- **M7 follow-up** the standalone payouts component now exposes the payout-limit currency instead of deriving
  it only from the payout token, supporting token-derived, ETH(1), USD(2), and custom currency ids.
  *Test: components-tx.*
- **L9** removed the proven-dead `safeTxLink` import plus the remaining zero-use named imports in `discover.js`,
  `app.js`, and `encoding.js`; the source-wide named-import scan now reports none.
- **L4/L5 partial** the loan modal now waits for the selected chain's accounting token to resolve before
  building `REVLoans.borrowFrom`, so a USDC-accounting revnet cannot accidentally fall back to native ETH.
  Chain/prepaid inputs are snapshotted at submit time. *Test: discover-tx.*
- **L6/L7** approval-hook deadline options now live in a leaf `deadline-options.js`, and Bendystraw's
  18-decimal scaled-USD conversion is shared through `bendystraw-format.js`. *Test: views + approval-and-lock.*
- **L4** borrow `minBorrowAmount` now uses a fresh `borrowableAmountFrom` read in the selected source token's
  own `JBAccountingContext` decimals/currency and floors at 99%, matching REVLoans' internal comparison units.
  *Test: discover-tx.*
- **H8 / M1/M2/M3 drift-prevention** ruleset defaults, encoding, and editor UI now live in `ruleset-config.js`
  / `ruleset-ui.js` leaf modules imported by launch and queue; queue execution uses the shared
  `buildRulesetConfigs`, and the shared editor keeps custom `uint32` fund-access currencies. 721 tier tuple
  construction/sorting/supply/discount helpers now live in `nft721-build.js` and are imported by create-flow
  and Discover's post-launch add-tier path. *Test: discover-tx + queue-new-shop + nft721-build.*
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

## Deferred
None from this audit pass remain open.

## discover.js money-surface review (run 2026-06-21, branch audit-fixes-tx-security-and-tests)

A 4-area adversarial review (loans / move / Safe+claim / cash-out previews) confirmed 6 findings.

### Fixed
- **H-01** borrow `minBorrow` slippage floor was denominated wrong (base-currency 18-dec preview vs the
  contract's source-token-decimals check) → every USDC-revnet loan reverted + native loans floored 46–93%.
  Now floors at 99% of a fresh `borrowableAmountFrom` read in the source token's own decimals+currency.
  *Test: discover-tx.*
- **M-01** Composition "Total" row referenced an undeclared `totBalance` → `ReferenceError` blanked the whole
  table for any zero-balance project. Now `formatBalance(0n, …)`.
- **L-01** cash-out previews/displays read `currentSurplusOf` before calling `currentReclaimableSurplusOf`
  instead of passing raw `balanceOf` as surplus. This covers the transaction-binding modal, the "You" table,
  and Composition "Unit value" display, avoiding payout-limit overstatement.
- **L-02** cross-chain cash-out "Total" raw-summed heterogeneous accounting tokens (ETH 18-dec + USDC 6-dec)
  and labeled with chain[0]'s token. Now renders `—` when held chains hold different accounting tokens.
- **L-03** Safe execution now preserves on-chain `approveHash` confirmations by synthesizing Safe's
  prevalidated `v=1` signature bytes and counting only confirmations that can be serialized. *Test: components-tx.*
- **L-04** Safe queue rows and Sign/Execute review surface `operation` and ETH `value`; Sign/Execute now go
  through the decoded confirm modal, with DELEGATECALL and unrecognized target warnings.

### Deferred
None from this money-surface review remain open.
