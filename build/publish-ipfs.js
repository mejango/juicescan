#!/usr/bin/env node
// Publish the built `dist/` directory to IPFS via Filebase. Reads FILEBASE_KEY / FILEBASE_SECRET /
// FILEBASE_BUCKET from .env (never committed).
//
// Flow: local kubo (`ipfs`) builds the directory DAG (deterministic CID — identical input bytes give the
// identical CID Pinata used to return) and exports it as a CAR; Filebase's IPFS RPC imports + pins the CAR.
// Filebase announces pins to IPFS routing (DHT + IPNI) promptly, so browser-native gateways
// (inbrowser.link, check.ipfs.network) can find providers — the reason we switched from Pinata's v3
// uploads, which never announced ("No providers were found"). Pinata remains only for the in-app
// user-side pinning (src/ipfs-pin.js), which is a separate key.
//
// Usage: node build/publish-ipfs.js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function envVal(key) {
  if (process.env[key]) return process.env[key].trim();
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith(key + '='));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

// Filebase's IPFS RPC bearer token is base64("<key>:<secret>:<bucket>") — derivable, not console-minted.
function filebaseToken() {
  const key = envVal('FILEBASE_KEY');
  const secret = envVal('FILEBASE_SECRET');
  const bucket = envVal('FILEBASE_BUCKET');
  if (!key || !secret || !bucket) throw new Error('FILEBASE_KEY / FILEBASE_SECRET / FILEBASE_BUCKET not found in env or .env');
  return Buffer.from(`${key}:${secret}:${bucket}`).toString('base64');
}

// Guard against pinning non-runtime files (tests, source maps, editor litter) — users download the
// pinned set on every load. The bundle is intentionally NOT minified so the IPFS-loaded code stays
// inspectable (see the audit-prompt feature) — that's runtime, kept.
function isRuntimeFile(name) {
  if (name === '.DS_Store' || name.startsWith('.')) return false;
  return !/\.(test|spec)\.[cm]?js$|\.map$|\.bak$|\.ts$|\.md$/i.test(name);
}
function assertDistClean(dir, base) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    if (fs.statSync(full).isDirectory()) assertDistClean(full, rel);
    else if (!isRuntimeFile(name)) throw new Error(`non-runtime file in dist/: ${rel} — remove it before publishing`);
  }
}

async function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run `npm run build` first');
  assertDistClean(DIST, '');
  const token = filebaseToken();

  // Deterministic local DAG build. `--offline` works with or without a running daemon.
  console.log('Building the directory DAG with kubo…');
  const cid = execFileSync('ipfs', ['add', '-rQ', '--cid-version', '1', '--offline', DIST], { encoding: 'utf8' }).trim();
  const carPath = path.join(os.tmpdir(), `jb-directory-${cid}.car`);
  execFileSync('ipfs', ['dag', 'export', cid], { stdio: ['ignore', fs.openSync(carPath, 'w'), 'inherit'] });
  const carBytes = fs.statSync(carPath).size;
  console.log(`CID ${cid} (${(carBytes / 1e6).toFixed(1)} MB CAR)`);

  console.log('Importing + pinning on Filebase…');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(carPath)]), 'site.car');
  const res = await fetch('https://rpc.filebase.io/api/v0/dag/import?pin-roots=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Filebase ${res.status}: ${text}`);
  let imported;
  try { imported = JSON.parse(text.trim().split('\n')[0]); } catch (_) { throw new Error('Unexpected Filebase response: ' + text); }
  const rootCid = imported && imported.Root && imported.Root.Cid && imported.Root.Cid['/'];
  const pinError = imported && imported.Root && imported.Root.PinErrorMsg;
  if (rootCid !== cid) throw new Error(`Filebase pinned ${rootCid}, expected ${cid}`);
  if (pinError) throw new Error('Filebase pin error: ' + pinError);
  fs.unlinkSync(carPath);

  console.log('\n✅ Published');
  console.log(`CID:      ${cid}`);
  console.log(`ipfs.io:  https://ipfs.io/ipfs/${cid}/`);
  console.log(`dweb:     https://${cid}.ipfs.dweb.link/`);
  console.log(`sw:       https://${cid}.ipfs.inbrowser.link/`);

  // Filebase announces to routing, so gateways CAN find the content — warming just saves the first
  // visitor the ~50s cold retrieval of the 8MB app.js. Retries resume from partial gateway caches.
  console.log('\nWarming gateways…');
  const rels = [];
  (function walk(dir, base) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full, base ? base + '/' + name : name);
      else rels.push(base ? base + '/' + name : name);
    }
  })(DIST, '');
  for (const base of [`https://ipfs.io/ipfs/${cid}`, `https://${cid}.ipfs.dweb.link`]) {
    const name = base.includes('dweb') ? 'dweb   ' : 'ipfs.io';
    for (const rel of rels) {
      let status = 'failed';
      const started = Date.now();
      for (let attempt = 1; attempt <= 3 && status !== 200; attempt++) {
        try {
          const r = await fetch(`${base}/${rel}`, { signal: AbortSignal.timeout(90_000) });
          await r.arrayBuffer();
          status = r.status;
        } catch (e) { status = e.name; }
      }
      console.log(`  ${name} ${rel} ${status} ${((Date.now() - started) / 1000).toFixed(1)}s`);
    }
  }
  // Verify routing sees a provider (the property Pinata lacked). Informational — no hard fail.
  try {
    const r = await fetch(`https://delegated-ipfs.dev/routing/v1/providers/${cid}`, { signal: AbortSignal.timeout(20_000) });
    const providers = ((await r.json()).Providers || []).length;
    console.log(`\nRouting providers: ${providers}${providers ? '' : ' — announcement may take a few minutes'}`);
  } catch (_) { /* routing check is best-effort */ }
}

main().catch((e) => { console.error('\n❌ ' + e.message); process.exit(1); });
