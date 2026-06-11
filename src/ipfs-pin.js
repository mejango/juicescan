// src/ipfs-pin.js
// IPFS pinning for the project-create flow, via Pinata.
//
// The JWT is supplied by the user and stored in localStorage ('jb-pinata-jwt') — it is NEVER baked
// into the bundle. The settings field (see app/data settings) writes it; everything here reads it at
// call time. With no JWT set, the create flow falls back to letting the user paste a pre-pinned
// ipfs:// hash by hand.
//
// Endpoints (classic Pinata API, scoped-key friendly):
//   POST https://api.pinata.cloud/pinning/pinFileToIPFS   (multipart, for logo / NFT images)
//   POST https://api.pinata.cloud/pinning/pinJSONToIPFS   (json, for project + NFT metadata)
// Both return { IpfsHash: "Qm…", PinSize, Timestamp }; we surface it as "ipfs://Qm…".

import { bytesToHex } from 'viem';

var JWT_KEY = 'jb-pinata-jwt';
var PIN_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
var PIN_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

export function getPinataJwt() {
  try { return localStorage.getItem(JWT_KEY) || ''; } catch (_) { return ''; }
}

export function setPinataJwt(value) {
  try {
    if (value) localStorage.setItem(JWT_KEY, value.trim());
    else localStorage.removeItem(JWT_KEY);
  } catch (_) { /* private mode / sandboxed — ignore */ }
}

export function hasPinata() { return !!getPinataJwt(); }

// Settings strip for the DATA tab — mirrors renderBendystrawSettings. Lets the user paste a Pinata
// JWT used by the Create flow to pin logos/metadata. Stored in this browser only.
export function renderPinataSettings() {
  var panel = document.createElement('div');
  panel.className = 'bendystraw-settings';
  var note = document.createElement('div');
  note.className = 'bendystraw-settings-note';
  note.innerHTML = 'IPFS pinning for the <b>+ Create</b> flow (project logo + metadata). '
    + 'Paste a <a href="https://app.pinata.cloud/developers/api-keys" target="_blank" rel="noopener">Pinata JWT</a> '
    + 'with pinFileToIPFS + pinJSONToIPFS scopes. Stored only in this browser.';
  panel.appendChild(note);
  var row = document.createElement('div');
  row.className = 'bendystraw-settings-row';
  var input = document.createElement('input');
  input.type = 'password';
  input.className = 'field bendystraw-key-input';
  input.placeholder = 'pinata JWT (for project creation)';
  input.value = getPinataJwt();
  input.autocomplete = 'off';
  input.spellcheck = false;
  var t = null;
  input.addEventListener('input', function () {
    if (t) clearTimeout(t);
    t = setTimeout(function () { setPinataJwt(input.value.trim()); }, 250);
  });
  row.appendChild(input);
  panel.appendChild(row);
  return panel;
}

// Pin a File/Blob. Returns "ipfs://<cid>". Throws on misconfig or HTTP error (caller shows the message).
export async function pinFile(file, name) {
  var jwt = getPinataJwt();
  if (!jwt) throw new Error('No Pinata JWT set — add one in settings, or paste an ipfs:// hash.');
  var form = new FormData();
  form.append('file', file, (file && file.name) || name || 'upload');
  form.append('pinataMetadata', JSON.stringify({ name: name || (file && file.name) || 'upload' }));
  var res = await fetch(PIN_FILE_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + jwt },
    body: form,
  });
  return await readPinResponse(res);
}

// Pin a JSON object. Returns "ipfs://<cid>".
export async function pinJson(obj, name) {
  var jwt = getPinataJwt();
  if (!jwt) throw new Error('No Pinata JWT set — add one in settings, or paste an ipfs:// hash.');
  var res = await fetch(PIN_JSON_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinataContent: obj, pinataMetadata: { name: name || obj.name || 'metadata' } }),
  });
  return await readPinResponse(res);
}

async function readPinResponse(res) {
  if (!res.ok) {
    var detail = '';
    try { detail = (await res.text()) || ''; } catch (_) { detail = ''; }
    throw new Error('Pinata HTTP ' + res.status + (detail ? (': ' + detail.slice(0, 200)) : ''));
  }
  var body = await res.json();
  if (!body || !body.IpfsHash) throw new Error('Pinata returned no IpfsHash');
  return 'ipfs://' + body.IpfsHash;
}

// --- CID helpers ---

var B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Decode a base58 (Bitcoin alphabet) string to a Uint8Array.
function base58Decode(str) {
  var bytes = [0];
  for (var i = 0; i < str.length; i++) {
    var value = B58_ALPHABET.indexOf(str[i]);
    if (value === -1) throw new Error('Invalid base58 character: ' + str[i]);
    var carry = value;
    for (var j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  // Leading '1's in base58 are leading zero bytes.
  for (var k = 0; k < str.length && str[k] === '1'; k++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

// Strip "ipfs://" / gateway prefixes and any path, returning the bare CID.
function bareCid(uri) {
  if (!uri) return '';
  var s = String(uri).trim();
  if (s.indexOf('ipfs://') === 0) s = s.slice('ipfs://'.length);
  var slash = s.indexOf('/');
  if (slash !== -1) s = s.slice(0, slash);
  return s;
}

// Encode a CIDv0 ("Qm…") IPFS URI into the bytes32 the 721 hook stores (JB721TierConfig.encodedIpfsUri).
// CIDv0 = base58(0x12 0x20 <32-byte sha256 digest>); we drop the 2-byte multihash prefix and keep the
// 32-byte digest. CIDv1 ("b…") isn't supported here (Pinata returns CIDv0 by default).
export function encodeIpfsUriToBytes32(uri) {
  var cid = bareCid(uri);
  if (!cid) return '0x0000000000000000000000000000000000000000000000000000000000000000';
  if (cid[0] !== 'Q') {
    throw new Error('Only CIDv0 (Qm…) NFT image hashes are supported; got: ' + cid.slice(0, 8) + '…');
  }
  var raw = base58Decode(cid);
  if (raw.length !== 34 || raw[0] !== 0x12 || raw[1] !== 0x20) {
    throw new Error('Unexpected CIDv0 multihash for: ' + cid.slice(0, 8) + '…');
  }
  return bytesToHex(raw.slice(2)); // 32-byte sha256 digest → 0x…
}
