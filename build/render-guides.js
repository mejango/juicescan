// Render the existing browser guides at build time so IPFS readers need no JS.
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

async function renderGuides(dist) {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/learn-build.js')],
    bundle: true,
    format: 'iife',
    globalName: 'Guides',
    write: false,
  });
  for (const guide of ['learn', 'build']) {
    const title = guide === 'learn' ? 'Learn Juicebox' : 'Build with Juicebox';
    const dom = new JSDOM(`<!doctype html><html lang="en"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} | Juicescan</title><link rel="stylesheet" href="style.css">
      </head><body class="guide-static"><a href="#main">Skip to guide</a><main id="main" tabindex="-1">
      <h1>${title}</h1><p><a href="./#${guide}">Open the interactive guide</a></p>
      <section id="tab-${guide}"></section></main></body></html>`, { runScripts: 'outside-only' });
    try {
      // Only our local guide module runs here; no network or application bundle.
      dom.window.eval(result.outputFiles[0].text);
      dom.window.Guides[guide === 'learn' ? 'renderLearnTab' : 'renderBuildTab']();
      const document = dom.window.document;
      // Clipboard controls require JS. Keep the readable guide and native links.
      document.querySelectorAll('button').forEach((button) => button.remove());
      document.querySelector('.guide-agent-prompt')?.remove();
      document.querySelector(`a[href="${guide}.html"]`)?.parentElement.remove();
      for (const link of document.querySelectorAll('a[href^="#"]')) {
        const href = link.getAttribute('href');
        if (!document.getElementById(href.slice(1))) link.setAttribute('href', './' + href);
      }
      fs.writeFileSync(path.join(dist, guide + '.html'), dom.serialize());
    } finally {
      dom.window.close();
    }
  }
}

module.exports = { renderGuides };
