// src/ipfs-pin.js
// IPFS pinning for the project-create flow, via Pinata.
//
// A SCOPED, PUBLIC Pinata key is baked in at build time (from `PINATA_PUBLIC_JWT` via esbuild's
// `__PINATA_JWT__` define) so the Create flow pins on users' behalf without per-user setup. It is public/
// extractable by design — must be scoped to pinFileToIPFS + pinJSONToIPFS and rate-limited. A user's own JWT
// in localStorage ('jb-pinata-jwt', set via the create-flow inline field) still takes precedence if present.
//
// Endpoints (classic Pinata API, scoped-key friendly):
//   POST https://api.pinata.cloud/pinning/pinFileToIPFS   (multipart, for logo / NFT images)
//   POST https://api.pinata.cloud/pinning/pinJSONToIPFS   (json, for project + NFT metadata)
// Classic endpoints returned { IpfsHash: "Qm…", PinSize, Timestamp }; the v3 endpoint usually returns
// { data: { cid: "baf…" } }. We surface either as "ipfs://<cid>".

import { bytesToHex } from 'viem';

var JWT_KEY = 'jb-pinata-jwt';
// v3 uploads API (the only one a scoped `pinataKey`/JWT works on — the legacy /pinning endpoints return
// 403 NO_SCOPES_FOUND for these keys). Multipart `file` + `network: public`; response is { data: { cid } }.
var UPLOAD_URL = 'https://uploads.pinata.cloud/v3/files';

// No baked-in JWT in the public bundle (see header). Defined empty by esbuild; kept guarded for safety.
var BUILTIN_JWT = (typeof __PINATA_JWT__ === 'string' && __PINATA_JWT__) ? __PINATA_JWT__ : '';

export function getPinataJwt() {
  try { var v = localStorage.getItem(JWT_KEY); if (v) return v; } catch (_) { /* private mode — fall through */ }
  return BUILTIN_JWT;
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
// Pin a File/Blob. Returns "ipfs://<cid>". Throws on misconfig or HTTP error (caller shows the message).
export async function pinFile(file, name) {
  var jwt = getPinataJwt();
  if (!jwt) throw new Error('No Pinata JWT set — add one in settings, or paste an ipfs:// hash.');
  var fname = (file && file.name) || name || 'upload';
  var form = new FormData();
  form.append('file', file, fname);
  form.append('network', 'public');
  form.append('name', name || fname);
  var res = await fetch(UPLOAD_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, body: form });
  return await readPinResponse(res);
}

// Pin a JSON object. Returns "ipfs://<cid>". (v3 is file-based, so the JSON is uploaded as a .json file.)
export async function pinJson(obj, name) {
  var jwt = getPinataJwt();
  if (!jwt) throw new Error('No Pinata JWT set — add one in settings, or paste an ipfs:// hash.');
  var base = name || obj.name || 'metadata';
  var blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  var form = new FormData();
  form.append('file', blob, base + '.json');
  form.append('network', 'public');
  form.append('name', base);
  var res = await fetch(UPLOAD_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, body: form });
  return await readPinResponse(res);
}

async function readPinResponse(res) {
  var text = '';
  try { text = (await res.text()) || ''; } catch (_) { text = ''; }
  if (!res.ok) throw new Error('Pinata HTTP ' + res.status + (text ? (': ' + text.slice(0, 200)) : ''));
  var body; try { body = JSON.parse(text); } catch (_) { body = null; }
  // v3 uploads API returns { data: { cid } }; tolerate the legacy { IpfsHash } shape too.
  var cid = body && ((body.data && body.data.cid) || body.IpfsHash);
  if (!cid) throw new Error('Pinata returned no CID');
  return 'ipfs://' + cid;
}

// --- CID helpers ---

var B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
var B32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

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

// Decode a CIDv1 base32 multibase string ("baf…") to bytes.
function base32Decode(str) {
  var s = String(str || '').trim();
  if (!s || s[0].toLowerCase() !== 'b') throw new Error('Unsupported CIDv1 multibase: ' + s.slice(0, 8) + '…');
  s = s.slice(1).toLowerCase().replace(/=+$/, '');
  var out = [];
  var bits = 0, value = 0;
  for (var i = 0; i < s.length; i++) {
    var idx = B32_ALPHABET.indexOf(s[i]);
    if (idx === -1) throw new Error('Invalid base32 character: ' + s[i]);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function readVarint(bytes, offset) {
  var value = 0, shift = 0;
  for (var i = offset; i < bytes.length; i++) {
    var b = bytes[i];
    value += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) return { value: value, offset: i + 1 };
    shift += 7;
    if (shift > 49) throw new Error('CID varint is too large');
  }
  throw new Error('Truncated CID varint');
}

function cidV1DigestBytes(cid) {
  var raw = base32Decode(cid);
  var v = readVarint(raw, 0);
  if (v.value !== 1) throw new Error('Unsupported CID version: ' + v.value);
  // Codec is intentionally read and discarded. The 721 hook stores only a sha2-256 multihash digest and the
  // on-chain resolver reconstructs a CIDv0-style URL from that digest, so the codec cannot be preserved.
  var codec = readVarint(raw, v.offset);
  var mhCode = readVarint(raw, codec.offset);
  var mhLen = readVarint(raw, mhCode.offset);
  if (mhCode.value !== 0x12 || mhLen.value !== 32) {
    throw new Error('Only sha2-256/32-byte IPFS hashes are supported; got multihash 0x' + mhCode.value.toString(16) + '/' + mhLen.value);
  }
  if (mhLen.offset + mhLen.value !== raw.length) throw new Error('Unexpected CIDv1 multihash length');
  return raw.slice(mhLen.offset, mhLen.offset + mhLen.value);
}

// Strip "ipfs://" / gateway prefixes and any path, returning the bare CID.
function bareCid(uri) {
  if (!uri) return '';
  var s = String(uri).trim();
  if (s.indexOf('ipfs://') === 0) s = s.slice('ipfs://'.length);
  else if (/^https?:\/\//i.test(s)) {
    try {
      var u = new URL(s);
      var m = u.pathname.match(/\/ipfs\/([^/?#]+)/i);
      if (m) return m[1];
      var sub = (u.hostname || '').split('.')[0];
      if (/^(Qm|ba)/i.test(sub)) return sub;
    } catch (_) {}
  }
  var slash = s.indexOf('/');
  if (slash !== -1) s = s.slice(0, slash);
  return s;
}

// Encode an IPFS URI into the bytes32 the 721 hook stores (JB721TierConfig.encodedIpfsUri).
// CIDv0 = base58(0x12 0x20 <32-byte sha256 digest>); CIDv1 = multibase + multicodec + the same multihash.
// In both cases the hook stores only the 32-byte sha2-256 digest and reconstructs a CIDv0-style URL on-chain.
export function encodeIpfsUriToBytes32(uri) {
  var cid = bareCid(uri);
  if (!cid) return '0x0000000000000000000000000000000000000000000000000000000000000000';
  var digest;
  if (cid.slice(0, 2) === 'Qm') {
    var raw = base58Decode(cid);
    if (raw.length !== 34 || raw[0] !== 0x12 || raw[1] !== 0x20) {
      throw new Error('Unexpected CIDv0 multihash for: ' + cid.slice(0, 8) + '…');
    }
    digest = raw.slice(2);
  } else if (cid[0] && cid[0].toLowerCase() === 'b') {
    digest = cidV1DigestBytes(cid);
  } else {
    throw new Error('Only CIDv0 (Qm…) or CIDv1 base32 (baf…) IPFS hashes are supported; got: ' + cid.slice(0, 8) + '…');
  }
  return bytesToHex(digest); // 32-byte sha256 digest → 0x…
}
