# Thorough test coverage — transactions + views

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
