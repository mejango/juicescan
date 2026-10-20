// build/bundle.js
// Bundles src/ → dist/ as static, CSP-friendly assets
// Minified: the readable source is this repo at the commit in the page footer, and `npm run bundle`
// reproduces the published bytes from it.

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const DIST = path.join(__dirname, '..', 'dist');
const ENV = loadEnvFile(path.join(__dirname, '..', '.env'));

async function build() {
  // A clean dist/ keeps chunks from earlier builds out of the published CID directory.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // ESM with code splitting: the entry and its static imports load at startup; everything behind an
  // import() is a hashed chunk in dist/chunks/, fetched on first use. Chunk imports are relative, so the
  // whole set resolves inside one CID directory on path and subdomain gateways alike.
  const jsResult = await esbuild.build({
    entryPoints: { app: path.join(SRC, 'app.js') },
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: DIST,
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    metafile: true,
    absWorkingDir: path.join(__dirname, '..'),
    write: false,
    minify: true,
    sourcemap: false,
    define: {
      __BENDYSTRAW_API_KEY__: JSON.stringify(process.env.BENDYSTRAW_API_KEY || ENV.BENDYSTRAW_API_KEY || ''),
      // Baked-in PUBLIC Pinata key so the Create flow pins logos/metadata on users' behalf (no per-user setup).
      // This bundle is public, so the baked value IS extractable — use ONLY a SCOPED (pinFileToIPFS +
      // pinJSONToIPFS only), rate-limited, rotatable key here. It is `PINATA_PUBLIC_JWT`, deliberately SEPARATE
      // from `PINATA_JWT` (the full-access publish key used only by build/publish-ipfs.js, never baked in).
      __PINATA_JWT__: JSON.stringify(process.env.PINATA_PUBLIC_JWT || ENV.PINATA_PUBLIC_JWT || ''),
    },
  });
  for (const file of jsResult.outputFiles) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.contents);
  }
  const outputs = jsResult.metafile.outputs;
  // Dynamic-import chunks carry an entryPoint too, so match the app entry by its source path.
  const entry = Object.keys(outputs).find(key => outputs[key].entryPoint === 'src/app.js');
  const startup = staticImportClosure(outputs, entry).map(key => path.relative(DIST, path.resolve(__dirname, '..', key)).split(path.sep).join('/'));

  // Read HTML shell
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

  // Fill build metadata. JS and CSS are emitted as same-origin files so IPFS
  // gateways with default-src 'self' CSP can still run the app.
  const final = html
    .replace('__APP_JS__', startup[0])
    .replace('<!--__MODULE_PRELOADS__-->', startup.slice(1).map(file => `<link rel="modulepreload" href="${file}">`).join('\n'))
    .replace('__BUILD_DATE__', getBuildDate())
    .replace('__GIT_HASH__', getGitHash())
    .replace('__IPFS_CID__', process.env.IPFS_CID || 'not pinned');

  fs.writeFileSync(path.join(DIST, 'index.html'), final);
  fs.copyFileSync(path.join(SRC, 'style.css'), path.join(DIST, 'style.css'));
  await require('./render-guides.js').renderGuides(DIST);

  // Copy static assets. manifest.json makes the site a recognizable Safe App (Safe fetches <root>/manifest.json
  // for name/description/icon before it will add a custom app).
  // llms.txt (llmstxt.org) tells an agent what is readable without running the bundle.
  for (const asset of ['jblogo.gif', 'jblogo-400.gif', 'favicon.svg', 'manifest.json', 'llms.txt', 'robots.txt']) {
    const src = path.join(SRC, asset);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, asset));
  }

  // pdf.js — lazy-loaded via dynamic import only when a shop item is a PDF. Same-origin copies keep the app
  // self-contained on IPFS. Official minified npm builds; verify against the pinned pdfjs-dist version.
  const PDFJS = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build');
  for (const asset of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
    fs.copyFileSync(path.join(PDFJS, asset), path.join(DIST, asset));
  }

  const startupBytes = startup.reduce((sum, file) => sum + fs.statSync(path.join(DIST, file)).size, 0);
  console.log(`Built dist/index.html, ${startup.length} startup modules (${(startupBytes / 1024).toFixed(0)} KB), ${jsResult.outputFiles.length} JS files in all`);
}

// The entry first, then every chunk it reaches through static imports: what the browser must fetch
// before the app runs. Dynamic import() targets are left out.
function staticImportClosure(outputs, entry) {
  const seen = [];
  (function walk(key) {
    if (seen.includes(key)) return;
    seen.push(key);
    for (const dep of outputs[key].imports || []) if (dep.kind === 'import-statement' && outputs[dep.path]) walk(dep.path);
  })(entry);
  return seen;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return env;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return env;
    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1).trim();
    env[key] = raw.replace(/^['"]|['"]$/g, '');
    return env;
  }, {});
}

function getGitHash() {
  try {
    return require('child_process').execSync('git rev-parse --short HEAD').toString().trim();
  } catch (_) {
    return 'unknown';
  }
}

// Rebuilding the same commit must produce the same HTML. Prefer an explicit
// reproducible-build input, then the commit date; never use the runner's clock.
function getBuildDate() {
  if (/^\d{4}-\d{2}-\d{2}$/.test(process.env.BUILD_DATE || '')) {
    return process.env.BUILD_DATE;
  }
  if (/^\d+$/.test(process.env.SOURCE_DATE_EPOCH || '')) {
    return new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString().slice(0, 10);
  }
  try {
    return require('child_process').execSync('git log -1 --format=%cs').toString().trim();
  } catch (_) {
    return 'unknown';
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
