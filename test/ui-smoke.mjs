// UI smoke tests — exercise the live app's critical UX paths so future changes can't silently break them.
// By default this serves dist/ on an ephemeral localhost port and launches an isolated headless Brave profile.
// Run: NODE_PATH=$(cat /tmp/pwc_path.txt) node test/ui-smoke.mjs    (or: npm run test:ui)
// Legacy live-browser mode is explicit: UI_SMOKE_LIVE_CDP=1 (expects the old localhost:8799 + Brave:9222 harness).
// Exits non-zero if any scenario fails, so it can gate changes in CI/pre-push.
import { createRequire } from 'module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

let BASE = 'http://localhost:8799/index.html';
let pass = 0, fail = 0;
const results = [];
function check(name, ok, info) { (ok ? pass++ : fail++); results.push((ok ? 'PASS ' : 'FAIL ') + name + (info && !ok ? '  → ' + info : '')); }

async function startIsolatedServer() {
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  const contentTypes = { '.css': 'text/css', '.gif': 'image/gif', '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      if (relative.split('/').includes('..')) { response.writeHead(403).end(); return; }
      const file = join(root, relative);
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': contentTypes[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch (_) {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

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
  const isolated = process.env.UI_SMOKE_LIVE_CDP !== '1';
  const staticServer = isolated ? await startIsolatedServer() : null;
  if (staticServer) BASE = 'http://127.0.0.1:' + staticServer.address().port + '/index.html';
  const browser = isolated
    ? await chromium.launch({
      headless: true,
      executablePath: process.env.UI_SMOKE_BROWSER || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    })
    : await chromium.connectOverCDP('http://localhost:9222');
  const ctx = isolated ? await browser.newContext() : browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('localhost:8799')) || ctx.pages()[0] || await ctx.newPage();
  await page.setViewportSize({ width: 1100, height: 1000 });

  try {
    // 1. Discover renders project cards.
    await page.goto(BASE + '?r=500#discover', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.discover-card:not(.discover-card--loading)', { timeout: 20000 });
    const cards = await Q(page, '() => document.querySelectorAll(".discover-card:not(.discover-card--loading)").length');
    check('discover renders project cards', cards > 0, 'cards=' + cards);

    // 1b. Payer-address copy names the exact direct-transfer and admin boundaries.
    await Q(page, '() => { document.querySelector(".discover-card:not(.discover-card--loading)").click(); return 1; }');
    await page.waitForTimeout(500);
    await Q(page, '() => { [...document.querySelectorAll(".detail-tab-btn")].find(b=>b.textContent.trim()==="Extras").click(); return 1; }');
    await page.waitForTimeout(250);
    const payerCopy = await Q(page, '() => { const card=document.querySelector(".extras-card"); const body=card.textContent; const editable=card.querySelector(".extras-editable-row input"); editable.click(); return { title:card.querySelector(".detail-card-title").textContent.trim(), body, admin:card.textContent }; }');
    check('payer address copy specifies native ETH, direct ERC-20, immutable defaults, and admin powers',
      payerCopy.title === 'Payer address' && payerCopy.body.includes('native token (ETH)')
        && payerCopy.body.includes('ERC-20 tokens directly') && payerCopy.body.includes('are permanent')
        && payerCopy.admin.includes('transfer or renounce the admin role') && payerCopy.admin.includes('does not receive payments or control either project'),
      JSON.stringify(payerCopy));

    // 2. Create flow opens with all five steps.
    await freshCreateFlow(page, 501);
    const steps = await Q(page, '() => [...document.querySelectorAll(".create-step-label")].map(s=>s.textContent.trim())');
    check('create flow shows 5 steps (Flavor/Basics/Rulesets/Shop/Deploy)',
      steps.length === 5 && steps.includes('Flavor') && steps.includes('Basics') && steps.includes('Deploy'), JSON.stringify(steps));

    // 2b. One import action owns the .jb input path; there is no competing paste-JSON affordance.
    const ioActions = await Q(page, '() => [...document.querySelectorAll(".create-head button")].map(b=>b.textContent.trim().toLowerCase())');
    check('create flow exposes one .jb import action without paste JSON', ioActions.includes('import') && !ioActions.includes('paste json'), JSON.stringify(ioActions));

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
    // Never close a user-owned browser reached over CDP. Process exit disconnects this client without touching it.
    if (isolated) await browser.close();
    if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
  }

  console.log('\n' + results.join('\n'));
  console.log('\nUI smoke: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL ' + (e.message || e)); process.exit(1); });
