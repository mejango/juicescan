# Transaction coverage — JB V6 web app vs the v6 contracts

Gauges how completely the app's transactions are exercised by tests, and which v6 contract each maps to.
Contracts: `nana-core-v6/src`, `revnet-core-v6/src`, `nana-suckers-v6/src`, `nana-721-hook-v6`, univ4 LP hook.

Legend: **U** = unit/encoding test (vitest, round-trips through the contract ABI); **S** = UI-smoke covered;
**—** = not yet under automated test (manual/CDP only).

## Core money path (JBMultiTerminal — nana-core-v6)
| App action | Contract fn | Test |
|---|---|---|
| Pay a project | `pay(projectId, token, amount, beneficiary, minReturnedTokens, memo, metadata)` | — (encoder inline in pay-component; **arg-builder extraction + test recommended**) |
| Cash out | `cashOutTokensOf(holder, projectId, cashOutCount, tokenToReclaim, minTokensReclaimed, beneficiary, metadata)` | — (**note: `minTokensReclaimed` is sent as `0` — verify slippage intent**) |
| Add to balance | `addToBalanceOf(...)` | — |

## Project lifecycle (JBController / JBOmnichainDeployer)
| App action | Contract fn | Test |
|---|---|---|
| Launch project | `launchProjectFor(owner, projectUri, rulesetConfigurations, terminalConfigurations, memo)` | **U** (`buildLaunchArgs` round-trip; baseCurrency; terminal contexts; custom-token decimals) + **S** |
| Launch w/ 721 store | `JB721TiersHookProjectDeployer.launchProjectFor(...)` | U (ABI round-trip via buildLaunchArgs 721 branch) |
| Queue rulesets | `queueRulesetsOf(...)` / omnichain deployer | — (parity with launch encoders — **dedup candidate**) |
| Mint / burn tokens | `mintTokensOf(...)` / `burnTokensOf(...)` | — |
| Deploy ERC-20 | `deployERC20For(...)` | — |
| Send payouts / reserved | `sendPayoutsOf(...)` / `sendReservedTokensToSplitsOf(...)` | — |

## Revnet (REVDeployer / REVLoans — revnet-core-v6)
| App action | Contract fn | Test |
|---|---|---|
| Deploy revnet | `deployFor(revnetId, REVConfig, accountingContextsToAccept[], suckerDeploymentConfig[, 721])` | **U** (`buildRevnetArgs` round-trip; multi-token ETH+USDC accept; baseCurrency=custom id) + **S** |
| Borrow / repay | `REVLoans.borrowFrom(...)` / `repayLoan(...)` | — |
| Auto-issue | `autoIssueFor(...)` | — |

## Suckers / omnichain (nana-suckers-v6) and permissions
| App action | Contract fn | Test |
|---|---|---|
| Bridge / move tokens | `JBSucker.prepare(...)` / claim | — |
| Sync accounting | `syncAccountingData` path | — |
| Set operator / permissions | `JBPermissions.setPermissionsForOperator(...)` (IDs 1-23) | — |
| Safe owner txs | `GnosisSafe.execTransaction(...)` (safe.js) | — |

## Pure encoding invariants (always-on guards)
- Custom-token currency id `== uint32(uint160(token)) == BigInt & 0xffffffff` across baseCurrency / payout / surplus / shop / terminal context. **U**
- `splitState` JBSplit shape for wallet / project / lphook / customhook; per-chain projectId override. **U**
- Reserved/payout split groups sum to one `SPLITS_TOTAL` (`fillSplits`). **U**
- Recipient preflight (no funds to `0x0`) + over-100% split gate. **U**
- `parseAmount`/`formatAmount` decimals (6 vs 18) + `addrOrZero`/`isAddr` recipient safety. **U**
- Deterministic `deploySalt` (omnichain address consistency). **U**

## Next test priorities (transaction-focused)
1. Extract pay/cashout/mint/burn arg-builders → unit-test arg encoding + the cashout `minTokensReclaimed` slippage choice.
2. Queue-ruleset encoder parity with launch (shared encoder → one test covers both).
3. Sucker `prepare`/move amount cap (uint128) + beneficiary; Safe `execTransaction` to/value/data.
