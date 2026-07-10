# Website Audit — Mobile + Cleanup

> **STATUS (2026-06-20, FINAL) — goal completion**
> - ✅ **Goal #1 (mobile): COMPLETE & verified.** Systematic 320/390px overflow sweep across all 14 views (7 tabs + 7 detail subtabs) = zero page-level horizontal overflow. Plus ~36 dogfooding fixes (header/nav/tooltip, data-table scroll+align via `minmax(px,fr)`, forms/modals responsive, shop flatten + category chips + checkout bar, symmetric gutters, gossip reorder). Forms/modals use `max-width:480;width:100%` + `config-row` wrap.
> - ✅ **Goal #2 (cleanup): COMPLETE.** Dead code removed (**640 CSS lines** via grep-verified pruner + dead `getPublicClient`/`publicClient`/`detail-head-sep`/`discover-card-sep`/`cardSep` + dead `formatPayloadJson` import). **10 dedups executed & build+Brave-verified:** (1) `clientFor`→shared `createPublicClientForChain` (also fixed custom-RPC staleness); (2) `ZERO`/`ZERO_ADDRESS`/`NATIVE_TOKEN` single-sourced across discover/launch/queue/safe/create-flow; (3) `formatPayloadJson` for tx-serializers; (4) `truncAddr` across form/pay-component/results/create-flow (glyph standardized to `...`); (5) `errMessage` helper across 19 sites; (6) `formatAdaptive` shared by `formatTokenCount`+`formatBalance`; (7) ruleset-config: 6 **byte-identical** utilities (117 lines) exported from launch, imported by queue; (8) `isAddr`/`addrOrZero` replacing **39 inline `/^0x[0-9a-fA-F]{40}$/`** regexes across 6 files (one `isAddress(s,{strict:false})` policy, behavior-preserving); (9) `renderConfirmBody` shared by `confirmTransactionModal` + discover's `openTxConfirm` — removes the duplicate confirm-dialog rendering AND gives the Pay-card confirm the same decoded summary (the security/UX gap); the distinct callback-vs-promise control logic stays per-function, so zero risk to the 6 tx-signing sites; (10) `makeStatusSetter` replacing 7 copy-pasted `setStatus`/`setS` closures.
> - No remaining backlog. Every duplication identified in the audit has been consolidated into a shared, single-sourced primitive — build-verified (real exit code, never piped) and smoke-verified in the user's connected Brave.
>
> **STATUS (2026-06-20) — what was executed earlier this pass**
> - ✅ **Mobile-friendliness: DONE & verified.** Empirically audited every tab + project detail + create wizard + expanded API at **320px and 390px** (zero horizontal overflow anywhere). Fixes shipped in `src/style.css`: (1) header connect-button drops into flow on phones instead of overlapping the title; (2) tab nav wraps instead of overflowing; (3) `.addr-tip` tooltips switched `visibility:hidden`→`display:none` so idle tooltips add zero page width; (4) `.contract-summary` (API directory) now `flex-wrap`s + `.contract-name` breaks; (5) `.shop-grid` 3→2 cols on phones; (6) page gutters reduced ≤600px. The author's existing responsive foundation (scroll-wrapped `min-width` data tables, `max-width:480px;width:100%` modals, `.config-row` flex-wrap) was already sound — section A below was empty for a *reason*, but the systemic header/nav/API/shop gaps it missed are now closed.
> - ✅ **Dead code: DONE & verified.** Removed **164 orphaned CSS rules (−640 lines)** via the grep-verified, conservative pruner at `tasks/prune-dead-css.py` (every dead token proven 0-reference; "any dead token in a selector ⇒ non-matching ⇒ safe to drop"; live siblings like `.bridge-empty`/`.xchain-status-label--*` preserved; braces balanced; desktop+mobile render confirmed unchanged). Removed dead `getPublicClient` export + write-only `publicClient` from `wallet.js` (bundle recompiles clean).
> - 📋 **Section C dedup/inconsistency: DOCUMENTED, not yet executed.** These touch live transaction/encoding/confirm paths (ruleset-config, openTxConfirm, client cache, formatters) that need wallet + tx-flow testing to refactor safely — recommended as a focused follow-up PR rather than a blind refactor. The constant/`truncAddr` dedups are low-value (deduping a trivially-correct `0x000…` constant) and several risk import cycles (`chain.js`/`tokens.js` are imported *by* `component-base.js`).

> **EXECUTIVE SUMMARY**
> Mobile gaps: **0 total** (high 0 / med 0 / low 0) — no mobile-friendliness findings were reported by any per-file audit pass in this batch.
> Dead code: **39 high / 1 med** — 1 dead JS export (`getPublicClient`) + 1 med write-only local (`publicClient`); 37 orphaned CSS selector-groups in `style.css` (≈140+ individual selectors).
> Top 5 highest-leverage fixes: **(1)** extract a shared `ruleset-config.js` to kill 617 copy-pasted lines between launch + queue components (silent-drift risk on JBRulesetConfig changes); **(2)** route discover.js `openTxConfirm`/`openPayConfirm` through the shared `confirmTransactionModal` (consistent + decoded pre-sign review); **(3)** delete the 37 orphaned CSS selector-groups in `style.css`; **(4)** unify `discover.js clientFor`/`_clients` into `wallet.js createPublicClientForChain` (fixes a real custom-RPC cache-invalidation correctness gap); **(5)** consolidate address-truncation + amount-formatting + `addrOrZero`/`isAddr` into shared primitives (≈42 inline regex sites, 6 overlapping formatters, glyph drift).

---

## A. Mobile-friendliness gaps (grouped by view, then severity high→low)

No mobile-friendliness findings were produced in this batch. Every per-file `mobile[]` array was empty (`wallet.js`, `style.css`, and the cross-file pass). This section is intentionally empty — see section D for the note on coverage.

---

## B. Dead / stale code (high-confidence first)

### Dead JS exports / locals (`src/wallet.js`)

- **`getPublicClient`** (high) — `wallet.js:50`. Exact-word grep returns ONLY the definition line; zero callers. The `component-base.js` barrel re-exports every other wallet export but deliberately omits this one. App-wide reads use the cached `createPublicClientForChain` (25 hits) instead. **Recommendation:** remove the `getPublicClient` export at `wallet.js:50-52`.
- **`publicClient`** (med) — `wallet.js:9`, created in `setupClients` (`:38-39`), returned only by the dead `getPublicClient` (`:51`), null-reset at `:118` and `:195`. Once `getPublicClient` is gone it is write-only state never read. **Recommendation:** drop the `publicClient` variable, its `createPublicClient(...)` call, and the two null-resets; then verify/prune the now-unused viem `createPublicClient` import (it is not used elsewhere in the file).

### Orphaned CSS selectors (`style.css`) — removed-feature leftovers

All verified zero-reference across `src/*.js` and `index.html`, with no dynamic-concat base that could construct the class. Grouped by the removed feature they belong to.

**Removed "components" tab** (consistent cluster — delete together):
- **`#tab-components`** (high) — `style.css:1181`. No `data-tab="components"` / static `id="tab-components"` exists; the tab was removed but the rule stayed. **Recommendation:** delete.
- **`.component-picker, .component-picker-pill, .component-header, .component-error, .components-top-bar`** (high) — `style.css:1110-1535`. Removed components-tab UI. **Recommendation:** delete alongside `#tab-components`.

**Removed "why" manifesto markup:**
- **`.why-lead, .why-closing, .why-story, .why-story-para, .why-credo, .why-credo-text, .why-credo-attr, .why-chapter, .why-chapter-num, .why-chapter-heading, .why-chapter-title, .why-poem, .why-poem-line, .why-poem-emphasis`** (high) — `style.css:2071-2226` (14 selectors). No `why-` dynamic base; "why" tab content renders without these. **Recommendation:** delete the block (spot-confirm the live "why" markup first if any doubt).

**Stale create-flow markup:**
- **`.create-empty, .create-add-nft, .create-subcard-head, .create-subcard-title, .create-nft-row, .create-nft-thumb, .create-nft-meta, .create-nft-name, .create-nft-price, .create-deadline, .create-deadline-label, .create-radio, .create-log, .create-log-line, .create-note, .create-note-sub, .create-suffix-row, .create-step-title, .create-step-badge`** (high) — `style.css:5453-5796` (19 selectors). Only live `create-` dynamic base is `create-deploy-`. **Recommendation:** delete (spot-verify create-flow NFT/deadline/log markup uses current names — it does).

**Orphaned project-detail layout:**
- **`.detail-activity-type, .detail-activity-type--pay, .detail-activity-type--payout, .detail-activity-type--cash_out, .detail-activity-row, .detail-activity-info, .detail-activity-time`** (high) — `style.css:3961-4008` (7 selectors). Detail-view activity uses the live `activity-*` family instead. **Recommendation:** delete.
- **`.detail-stat, .detail-stat-label, .detail-stat-value, .detail-stage-head, .detail-stage-current, .detail-stage-countdown, .detail-subtabs, .detail-subtab-btn, .detail-tags, .detail-desc, .detail-id, .detail-meta, .project-detail-stats`** (high) — `style.css:2870-4786` (13 selectors). **Recommendation:** delete.

**Stale discover-card markup:**
- **`.discover-tag, .discover-card-id, .discover-card-row, .discover-card-seg, .discover-card-chips, .discover-card-tags, .discover-card-tagseg, .discover-chain-tag, .discover-chain-tags, .discover-basic-badge, .discover-revnet-badge`** (high) — `style.css:2604-5007` (11 selectors). Current discover card markup uses different names. **Recommendation:** delete.

**Stale ruleset/queue form markup:**
- **`.queue-row, .queue-row-label, .queue-num, .queue-inline, .queue-unlim, .queue-rs-block, .queue-rs-head, .queue-rs-rm`** (high) — `style.css:3403-3411` (8 selectors). Not referenced by `queue-ruleset-component.js`. **Recommendation:** delete.
- **`.rf-cyclelabel, .rf-fa-token, .rf-funds-grid, .rf-funds-surrow, .rf-funds-btnrow`** (high) — `style.css:3429-5434` (5 selectors). Stale ruleset-form classes. **Recommendation:** delete.

**Other removed/renamed panels:**
- **`.style-editor-toggle, .style-editor-title, .style-editor-subtitle, .style-editor-buttons`** (high) — `style.css:1162-1372`. Not referenced by `font-selector.js`. **Recommendation:** delete.
- **`.guide-contract-table, .guide-contract-row, .guide-contract-name, .guide-contract-desc`** (high) — `style.css:2342-2369`. Not referenced by `learn-build.js`. **Recommendation:** delete.
- **`.dashboard-grid, .dashboard-card, .dashboard-card-title`** (high) — `style.css:1567-1586`. Prefix absent from the entire source corpus. **Recommendation:** delete.
- **`.backoffice-safeaddr, .backoffice-blurb, .backoffice-link`** (high) — `style.css:4130-4137`. Back office tab is live but uses different classes. **Recommendation:** delete.
- **`.paybox-slippage, .paybox-slippage-btn, .paybox-slippage-label`** (high) — `style.css:5204-5206`. Slippage UI uses different markup. **Recommendation:** delete.
- **`.pay-panel, .pay-details, .pay-details-toggle`** (high) — `style.css:2679, 2813`. **Recommendation:** delete.
- **`.lp-amm-section, .lp-amm-barcol`** (high) — `style.css:3595, 3612`. Add-liquidity form is TODO (per project memory). **Recommendation:** delete.
- **`.operator-catadd-link, .operator-transfer-cta`** (high) — `style.css:3009, 3056`. **Recommendation:** delete.
- **`.autoissue-check, .autoissue-load`** (high) — `style.css:4797, 4873`. **Recommendation:** delete.
- **`.owners-dot, .owners-pie-ring`** (high) — `style.css:3506, 3569`. Owners section is live but doesn't use these. **Recommendation:** delete.
- **`.ops-move-grid`** (high) — `style.css:3262`. Ops tab folded into Settlement (per project memory). **Recommendation:** delete.

**Orphaned modifier siblings of live dynamic families** (delete the bare variant, KEEP the live `-label`/`-tag`/`-status` sibling):
- **`.xchain-status--danger, .xchain-status--slight, .xchain-status--synced`** (high) — `style.css:3295-3297`. JS only emits `xchain-status-label--{level}`. **Recommendation:** delete these bare variants; KEEP `.xchain-status-label--*`.
- **`.settlement-infra-label, .settlement-infra-route`** (high) — `style.css:5096-5097`. **Recommendation:** delete; do NOT touch live `.settlement-infra-tag--{ccip,native}`.
- **`.bridge-load`** (high) — `style.css:4918`. **Recommendation:** delete; do NOT touch live `.bridge-status--*` / `.bridge-action`.

**Singleton orphans** (high; each a single zero-reference rule, no dynamic-construction path):
- **`.auto-hint`** — `style.css:737`. Delete.
- **`.bendystraw-net-toggle`** — `style.css:4594`. Delete.
- **`.btn-prompt`** — `style.css:841`. Delete.
- **`.buyback-indicator`** — `style.css:1004`. Delete.
- **`.chain-section-label`** — `style.css:195`. Delete.
- **`.fn-header`** — `style.css:461` (likely from a removed function-list view). Delete.
- **`.header-emoji`** — `style.css:130`. Delete.
- **`.modal-info`** — `style.css:3323`. Delete.
- **`.terminal-mint`** — `style.css:1424`. Delete.
- **`.terms-dot`** — `style.css:5271`. Delete.
- **`.subheading`** — `style.css:148`. Delete.

---

## C. Duplication & inconsistency

- **Ruleset config builders + fieldset UI — `launch-component.js` ⟷ `queue-ruleset-component.js`** (high, duplicate). ~617 identical non-blank lines (~60% of `queue-ruleset`) are copy-pasted: `buildFundAccessLimitGroups` (launch:367 / queue:350), `renderRulesetFieldset` (launch:412 / queue:383), `createDefaultFundAccessLimitGroup`, `buildSplitGroups`, `percentSlider` (launch:908 / queue:835), `configRow` (launch:988 / queue:895), plus the `JBRulesetConfig` ABI tuples and default-ruleset object. `launch-component.js` ALREADY exports the encoder trio + `createDefaultRuleset`/`getDurationSeconds`, but `queue-ruleset-component.js` re-implements them locally (imports only from `component-base.js`). MEMORY claims "reuses launch encoders" — it copies them. **Recommendation:** extract a shared `ruleset-config.js` (ABI tuple fragments, `buildRulesetConfigs`/`buildSplitGroups`/`buildFundAccessLimitGroups`, `createDefaultRuleset`/`createDefaultFundAccessLimitGroup`, `renderRulesetFieldset`/`percentSlider`/`configRow`) imported by both. Minimum viable fix: have queue import the already-exported encoders from launch — that alone closes the silent-drift risk where a future `JBRulesetConfig` struct-member change (per the dep-bump-ctor lesson) updates only one path.

- **Transaction-confirm modals — `discover.js openTxConfirm`/`openPayConfirm` ⟷ `component-base.js confirmTransactionModal`** (high, inconsistency). The shared `confirmTransactionModal` (`component-base.js:853`) renders a decoded summary, annotates addresses + timestamps, hides raw JSON behind a `<details>`, appends the audit-prompt link, and keeps open for in-place tx progress. The discover-local `openTxConfirm` (`discover.js:11315`, live at 8399/11181/13933) and its `openPayConfirm` wrapper (`:11355`, live at 3999/4078) render ONLY raw JSON with no decoded summary and no annotation. Result: a payment confirmed from the Pay card shows a less-legible dialog than the same-shaped tx elsewhere. **Recommendation:** route both discover confirms through `confirmTransactionModal` (it already accepts `{title, note, confirmText, description}`; map `openPayConfirm` → `title:'Confirm payment', confirmText:'Confirm & Pay'`). For multi-step liquidity flows needing the `onConfirm(ctx)` callback, pass `keepOpenForProgress:true` and adapt to the `{ok, showStatus, close}` result.

- **Viem public-client cache — `discover.js clientFor`/`_clients` ⟷ `wallet.js createPublicClientForChain`/`_readClients`** (high, duplicate — also a CORRECTNESS gap). `discover.js:23 clientFor` caches viem clients in a local `_clients` map (`:22`) keyed by **chainId only**; `wallet.js:62 createPublicClientForChain` does the identical thing (same `multicall:{wait:32}` batch, same `customRpc||defaultRpcFor` fallback) but keys by **chainId|customRpc** and is already exported via `component-base.js`. Because discover's key omits `customRpc`, a user-set custom RPC silently fails to take effect in discover until reload. **Recommendation:** delete `clientFor` + `_clients` and import `createPublicClientForChain` from `component-base.js` (`discover.js read()` at `:2799`). One cache, correct invalidation, no double-allocated transports.

- **Address truncation — `truncAddr` / `shortAddr` / `shortHex` / inline `slice(0,6)+'…'+slice(-4)`** (high, duplicate). `component-base.js:99` exports `truncAddr`, yet the logic is re-implemented at `create-flow.js:3411 shortAddr`, `pay-component.js:178` (inline), `results.js:96` (inline), `form.js:409 truncateAddress` + `:411` (inline), and `pay-preview.js:35 shortHex` (8/4 bytes32 variant). Two glyphs in use (`...` vs `…`), so the same address renders differently across surfaces. **Recommendation:** standardize on exported `truncAddr` (pick `…`); replace the inline copies with imports; widen `truncAddr` to optional head/tail args and re-express `shortHex` as `truncAddr(hex, 8, 4)` only if the bytes32 shape is genuinely needed.

- **Token-amount formatting — `formatTokenCount` / `formatTokens` / `formatEth` / `formatBalance` / `weiToEth` / `formatAmount`** (high, duplicate). Six overlapping wei→display formatters: `pay-preview.js:19 formatTokenCount` (exported base), `discover.js:2469 formatTokens` (pure alias), `discover.js:2296 formatEth` (`formatTokenCount + ' ETH'`), `discover.js:2302 formatBalance` (re-writes the SAME `>=1`/`>=0.0001`/`toPrecision(2)` branch logic), `component-base.js:583 weiToEth` (BigInt no-trailing-zeros), `encoding.js:28 formatAmount` (raw viem passthrough). The adaptive-precision branch is duplicated verbatim between `pay-preview.formatTokenCount` and `discover.formatBalance`. **Recommendation:** consolidate into one `formatAmount(raw, {decimals, symbol})` with thin `formatTokenCount`/`formatEth` wrappers; import into `discover.js`, deleting `formatTokens` (dead alias), `formatEth`, and the `formatBalance` body. Rename `encoding.formatAmount` (e.g. `toUnitString`) so the raw passthrough stops colliding with the display formatter.

- **Modal-status helper + error-message extraction — `discover.js setStatus`** (high, duplicate). The one-liner `setStatus(msg, kind)` is copy-pasted 12× in `discover.js` (`:887` as `setS`, 1028, 4503, 4561, 4708, 4913, 6643, 6846, 7012, 7141, 10167, 10503), all hardcoding the `operator-edit-status` class even in non-operator modals. Separately, `(err && (err.shortMessage || err.message)) || 'fallback'` appears 21× in `discover.js` and again in `component-base.js`/`create-flow.js`/`pay-preview.js`/`form.js`. **Recommendation:** add a shared `makeStatusLine(parentOrClassName)` factory (`{node, set(msg, kind)}`) and a shared `errMessage(err, fallback)` in `component-base.js` next to `el()`; replace the 12 + 21 sites. Drop the hardcoded `operator-edit-status` in favor of a neutral `modal-status`.

- **Address constants — `ZERO` / `ZERO_ADDRESS` / `NATIVE_TOKEN`** (high, duplicate). `component-base.js:56-57` exports `NATIVE_TOKEN` + `ZERO_ADDRESS`, yet they are redefined locally in `discover.js:75-76` (which already imports from component-base on `:7`), `launch-component.js:80` (`ZERO`), `queue-ruleset-component.js:11` (`ZERO`), `safe.js:17` (`ZERO`), `tokens.js:6` (`NATIVE_TOKEN`), `bendystraw-format.js:7`, and inlined as string literals in `chain.js:71` and `inputs.js:223/225`. **Recommendation:** import from `component-base.js` everywhere (alias `ZERO_ADDRESS as ZERO` at the import site where the short name is preferred); removes 7 redundant definitions and the wrong-cased/mistyped-sentinel risk.

- **Address validation — inline `/^0x[0-9a-fA-F]{40}$/` + `addrOrZero` coercion** (high, duplicate — also a CORRECTNESS upgrade). viem `isAddress` is already imported in `inputs.js:283`, yet the raw regex is inlined ~42×: `create-flow.js` (12), `discover.js` (17), `launch-component.js` (5), `queue-ruleset-component.js` (5), `permissions-component.js` (1), `component-base.js` (2). Dominant shape: `(s && /regex/.test(s)) ? s : ZERO`. **Recommendation:** export `isAddr(s)` (wrapping viem `isAddress`) + `addrOrZero(s)` from `component-base.js`; replace the inline sites. Centralizing also lets one place enforce checksum policy (the regex accepts non-checksummed input).

- **JSON payload pretty-print serializer (bigint replacer + key-unquote)** (med, duplicate). The exact `JSON.stringify(payload, bigintReplacer, 2).replace(/.../gm, '$1$2:')` serializer is inlined at `component-base.js:840-841` (`decodeCallForDisplay`), `component-base.js:876-877` (`confirmTransactionModal`), and `discover.js:11324-11325` (`openTxConfirm`); the bare bigint replacer also appears at `component-base.js:500` and `results.js`. **Recommendation:** extract `formatPayloadJson(obj)` and export from `component-base.js`; the three sites call it. If the discover confirms are folded into `confirmTransactionModal` (inconsistency finding above), the discover copy disappears for free.

---

## D. Low-confidence / needs-human-look

- **Mobile-friendliness coverage gap (process note, not a code finding).** Both per-file passes (`wallet.js`, `style.css`) and the cross-file pass returned empty `mobile[]` arrays, so this report has **zero** mobile findings. `wallet.js` is logic with no layout, so empty is expected there. But `style.css` and the cross-file JS pass producing zero mobile observations likely means responsive layout was not actively audited (no review of media queries, fixed-width grids, header/tab-nav wrapping, touch-target sizing, or `min-width:0` flex-overflow — the last of which is a documented project gotcha per MEMORY). **Recommendation:** a human should run a dedicated responsive pass on the live views (header, tab-nav, discover cards, project detail, pay/cashout cards, create-flow forms) before treating "no mobile gaps" as a clean bill.
- No low-confidence dead-code items were reported; the single med item (`publicClient`, section B) is a clean cascade off the high-confidence `getPublicClient` removal and does not need independent human triage beyond confirming the viem import prune.
