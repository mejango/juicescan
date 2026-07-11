// UI smoke tests — exercise the live app's critical UX paths so future changes can't silently break them.
// Requires the dev environment used throughout this repo:
//   1. a static server for dist/ on http://localhost:8799 (the brave-cdp harness serves it), and
//   2. Brave running with --remote-debugging-port=9222 --remote-allow-origins=*  (the connected wallet).
// Run: NODE_PATH=$(cat /tmp/pwc_path.txt) node test/ui-smoke.mjs    (or: npm run test:ui)
// Exits non-zero if any scenario fails, so it can gate changes in CI/pre-push.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8799/index.html';
let pass = 0, fail = 0;
const results = [];
function check(name, ok, info) { (ok ? pass++ : fail++); results.push((ok ? 'PASS ' : 'FAIL ') + name + (info && !ok ? '  → ' + info : '')); }

async function freshCreateFlow(page, r) {
  await page.goto(BASE + '?r=' + r + '#discover', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => { try { localStorage.removeItem('jb-create-draft'); localStorage.setItem('jb-network', 'mainnet'); } catch (e) {} });
  await page.goto(BASE + '?r=' + (r + 1) + '#discover', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a,.tab')].find(x => /New project/i.test(x.textContent || '')); if (b) b.click(); });
  await page.waitForTimeout(1100);
}
const Q = (page, fn) => page.evaluate(new Function('return (' + fn + ')()'));

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('localhost:8799')) || ctx.pages()[0] || await ctx.newPage();
  await page.setViewportSize({ width: 1100, height: 1000 });

  try {
    // 1. Discover renders project cards.
    await page.goto(BASE + '?r=500#discover', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const cards = await Q(page, '() => document.querySelectorAll(".project-card, .discover-card, [class*=card]").length');
    check('discover renders project cards', cards > 0, 'cards=' + cards);

    // 2. Create flow opens with all five steps.
    await freshCreateFlow(page, 501);
    const steps = await Q(page, '() => [...document.querySelectorAll(".create-step-label")].map(s=>s.textContent.trim())');
    check('create flow shows 5 steps (Flavor/Basics/Rulesets/Shop/Deploy)',
      steps.length === 5 && steps.includes('Flavor') && steps.includes('Basics') && steps.includes('Deploy'), JSON.stringify(steps));

    // 2b. The paste action consumes the same plain JSON stored in/exported by a .jb file.
    await Q(page, '() => { [...document.querySelectorAll(".create-head button")].find(b=>/paste JSON/i.test(b.textContent)).click(); return 1; }');
    await page.waitForTimeout(250);
    const pasteImported = await Q(page, '() => { const ta=document.querySelector(".create-json-import-input"); const draft=JSON.parse(localStorage.getItem("jb-create-draft")); draft.details.name="Imported .jb"; ta.value=JSON.stringify(draft); ta.dispatchEvent(new Event("input",{bubbles:true})); [...document.querySelectorAll(".create-json-import-actions button")].find(b=>/Use this JSON/i.test(b.textContent)).click(); return JSON.parse(localStorage.getItem("jb-create-draft")).details.name; }');
    await page.waitForTimeout(250);
    check('create flow pastes the existing .jb JSON format', pasteImported === 'Imported .jb', pasteImported);

    // 3. Accounting offers ETH / USDC / Custom; custom is exclusive.
    const pills = await Q(page, '() => [...document.querySelectorAll(".create-pill")].map(p=>p.textContent.trim())');
    check('accounting offers ETH/USDC/Custom pills', ['ETH', 'USDC', 'Custom'].every(x => pills.includes(x)), JSON.stringify(pills));
    await Q(page, '() => { [...document.querySelectorAll(".create-pill")].find(p=>p.textContent.trim()==="Custom").click(); return 1; }');
    await page.waitForTimeout(400);
    const customExclusive = await Q(page, '() => { const sel=[...document.querySelectorAll(".create-pill.selected")].map(p=>p.textContent.trim()); const addr=[...document.querySelectorAll(".create-step input")].some(i=>/ERC-20 token address/.test(i.placeholder||"")); return { sel, addr }; }');
    check('selecting Custom is exclusive + shows the token-address field', customExclusive.sel.length === 1 && customExclusive.sel[0] === 'Custom' && customExclusive.addr, JSON.stringify(customExclusive));

    // 4. Revnet accounting is multi-select (ETH + USDC).
    await freshCreateFlow(page, 503);
    await Q(page, '() => { const s=document.querySelector(".create-step select"); s.value="revnet"; s.dispatchEvent(new Event("change",{bubbles:true})); return 1; }');
    await page.waitForTimeout(600);
    await Q(page, '() => { [...document.querySelectorAll(".create-pill")].find(p=>p.textContent.trim()==="USDC").click(); return 1; }');
    await page.waitForTimeout(400);
    const revMulti = await Q(page, '() => [...document.querySelectorAll(".create-pill.selected")].map(p=>p.textContent.trim())');
    check('revnet accounting is multi-select (ETH+USDC)', revMulti.includes('ETH') && revMulti.includes('USDC'), JSON.stringify(revMulti));

    // 5. Deploy step spells out the disabled reasons for a fresh project.
    await freshCreateFlow(page, 505);
    await Q(page, '() => { const d=[...document.querySelectorAll(".create-step-label")].find(x=>/Deploy/i.test(x.textContent||"")); if(d)d.click(); return 1; }');
    await page.waitForTimeout(1100);
    const deployNotes = await Q(page, '() => { const launch=[...document.querySelectorAll(".create-step button")].find(b=>/^Launch|^Deploy/.test(b.textContent)); const hasExport=[...document.querySelectorAll(".create-step button")].some(b=>b.textContent.trim()==="Export .jb"); const notes=[...document.querySelectorAll(".create-step .create-hint, .create-step .create-banner")].map(h=>h.textContent.trim()).filter(Boolean); return { disabled: launch?launch.disabled:null, hasExport, hasNameReason: notes.some(n=>/project name/i.test(n)), hasTosReason: notes.some(n=>/box above/i.test(n)) }; }');
    check('deploy launch button disabled with explained reasons + pre-deploy .jb export', deployNotes.disabled === true && deployNotes.hasExport && deployNotes.hasNameReason && deployNotes.hasTosReason, JSON.stringify(deployNotes));

    // 6. Ruleset approval condition: renamed, offers a Custom address shown inline beside the dropdown.
    await freshCreateFlow(page, 507);
    await Q(page, '() => { [...document.querySelectorAll(".create-step-label")].find(s=>/Ruleset/i.test(s.textContent)).click(); return 1; }');
    await page.waitForTimeout(700);
    const approval = await Q(page, '() => { const lbl=[...document.querySelectorAll(".create-label")].some(l=>/Ruleset approval condition/.test(l.textContent)); const sel=[...document.querySelectorAll(".create-step select")].find(s=>[...s.options].some(o=>/Custom address/.test(o.textContent))); return { lbl, hasCustom: !!sel }; }');
    check('ruleset approval condition renamed + offers Custom address', approval.lbl && approval.hasCustom, JSON.stringify(approval));
    await Q(page, '() => { const s=[...document.querySelectorAll(".create-step select")].find(x=>[...x.options].some(o=>/Custom address/.test(o.textContent))); s.value="custom"; s.dispatchEvent(new Event("change",{bubbles:true})); return 1; }');
    await page.waitForTimeout(400);
    const inlineAddr = await Q(page, '() => { const row=document.querySelector(".create-approval-row"); return !!(row && row.querySelector(".create-approval-addr")); }');
    check('custom approval address renders inline beside the dropdown', inlineAddr);

    // 7. Split lock shows only when the ruleset has a fixed duration (hidden for Flexible).
    await Q(page, '() => { [...document.querySelectorAll(".create-stage-head, .create-stage-title")].find(e=>/Ruleset #1/.test(e.textContent)).click(); return 1; }');
    await page.waitForTimeout(500);
    await Q(page, '() => { const d=[...document.querySelectorAll(".create-stage-card select")].find(s=>[...s.options].some(o=>/Flexible/.test(o.textContent))); d.value="2419200"; d.dispatchEvent(new Event("change",{bubbles:true})); return 1; }');
    await page.waitForTimeout(400);
    await Q(page, '() => { const a=[...document.querySelectorAll(".create-stage-card a, .create-stage-card button")].find(e=>/Add split/i.test(e.textContent)); if(a)a.click(); return 1; }');
    await page.waitForTimeout(400);
    const lockShown = await Q(page, '() => document.querySelectorAll(".create-split-lock").length');
    await Q(page, '() => { const d=[...document.querySelectorAll(".create-stage-card select")].find(s=>[...s.options].some(o=>/Flexible/.test(o.textContent))); d.value="0"; d.dispatchEvent(new Event("change",{bubbles:true})); return 1; }');
    await page.waitForTimeout(400);
    const lockHidden = await Q(page, '() => document.querySelectorAll(".create-split-lock").length');
    check('split lock shows for fixed duration, hidden for Flexible', lockShown >= 1 && lockHidden === 0, 'shown=' + lockShown + ' hidden=' + lockHidden);

  } catch (e) {
    check('smoke run completed without throwing', false, (e.message || String(e)).split('\n')[0]);
  } finally {
    await browser.close();
  }

  console.log('\n' + results.join('\n'));
  console.log('\nUI smoke: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL ' + (e.message || e)); process.exit(1); });
