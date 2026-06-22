// Drive the user's real Brave (with the connected wallet) over CDP for mobile testing.
// Brave must be launched with --remote-debugging-port=9222 --remote-allow-origins=*.
// Usage: NODE_PATH=$(cat /tmp/pwc_path.txt) node brave-cdp.js '<json-steps>'
//   steps: [{a:'viewport',w,h},{a:'goto',url},{a:'click',sel},{a:'wait',ms},
//           {a:'waitsel',sel},{a:'scan'},{a:'shot',file},{a:'eval',fn}]
const { chromium } = require('playwright-core');

const SCAN = `() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 && r.width > 4 && r.height > 0) {
      out.push({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,46), right: Math.round(r.right), w: Math.round(r.width) });
    }
  });
  const by = {}; out.forEach(o => { const k=o.tag+'.'+o.cls; if(!by[k]||by[k].right<o.right) by[k]=o; });
  return { vw, scrollW: document.documentElement.scrollWidth, horiz: document.documentElement.scrollWidth > vw, top: Object.values(by).sort((a,b)=>b.right-a.right).slice(0,12) };
}`;

(async () => {
  const steps = JSON.parse(process.argv[2] || '[]');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('localhost:8799')) || ctx.pages().find(p => !p.url().startsWith('chrome')) || ctx.pages()[0];
  if (!page) page = await ctx.newPage();
  await page.bringToFront().catch(()=>{});
  for (const s of steps) {
    try {
      if (s.a === 'viewport') await page.setViewportSize({ width: s.w, height: s.h });
      else if (s.a === 'goto') { await page.goto(s.url, { waitUntil: 'domcontentloaded' }); }
      else if (s.a === 'click') await page.click(s.sel, { timeout: 8000 });
      else if (s.a === 'wait') await page.waitForTimeout(s.ms);
      else if (s.a === 'waitsel') await page.waitForSelector(s.sel, { timeout: 10000 });
      else if (s.a === 'scan') console.log('SCAN ' + JSON.stringify(await page.evaluate('(' + SCAN + ')()')));
      else if (s.a === 'shot') { await page.screenshot({ path: s.file, fullPage: !!s.full }); console.log('SHOT ' + s.file); }
      else if (s.a === 'eval') console.log('EVAL ' + JSON.stringify(await page.evaluate(new Function('return (' + s.fn + ')()'))));
    } catch (e) { console.log('STEP_ERR ' + s.a + ': ' + (e.message||e).split('\n')[0]); }
  }
  console.log('URL ' + page.url());
  await browser.close(); // detaches CDP; does NOT close Brave
})().catch(e => { console.error('FATAL ' + (e.message||e).split('\n')[0]); process.exit(1); });
