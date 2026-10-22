// src/hook-metadata.js
// JBMetadataResolver envelopes: lookup ids, packing, and the confirm-dialog reading of a hook metadata argument.
// Lean mirror of nana-sdk-core 3.4.1 utils/hook.ts and review/decode.ts#describeJBHookMetadata; the golden vectors in
// test/fixtures/sdk-3.4.1/hook-metadata.json pin identical output.

import { bytesToHex, decodeAbiParameters, encodeAbiParameters, keccak256, toBytes, zeroAddress } from 'viem';
import { getAddress as registryAddress } from './abi-registry.js';

// bytes4(bytes20(target) ^ bytes20(keccak256(purpose))): the id a hook resolves with JBMetadataResolver.getId.
export function hookMetadataId(target, purpose) {
  var targetBytes = toBytes(target).slice(0, 20);
  var purposeBytes = toBytes(keccak256(toBytes(purpose))).slice(0, 20);
  return bytesToHex(targetBytes.map(function (byte, i) { return byte ^ purposeBytes[i]; }).slice(0, 4));
}

var WORD_SIZE = 32;
var TOTAL_ID_SIZE = 5;
var MAX_OFFSET = 255;
var WORD_CHARS = WORD_SIZE * 2;

function hexBody(value, label) {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(value)) throw new Error(label + ' must be a 0x-prefixed hex string of whole bytes');
  return value.slice(2).toLowerCase();
}

// JBMetadataResolver.createMetadata: a reserved word, a word-padded (bytes4 id, uint8 wordOffset) table, then each
// payload padded to whole words. Empty input packs to 0x.
export function createHookMetadata(ids, metadatas) {
  if (ids.length !== metadatas.length) throw new Error('LENGTH_MISMATCH');
  if (ids.length === 0) return '0x';
  var payloads = metadatas.map(function (metadata, i) {
    var body = hexBody(metadata, 'metadatas[' + i + ']');
    if (body.length === 0) throw new Error('metadatas[' + i + '] cannot be empty');
    return body.padEnd(Math.ceil(body.length / WORD_CHARS) * WORD_CHARS, '0');
  });
  var offset = 1 + Math.ceil((ids.length * TOTAL_ID_SIZE) / WORD_SIZE);
  var table = '';
  for (var i = 0; i < ids.length; i++) {
    var id = hexBody(ids[i], 'ids[' + i + ']');
    if (id.length !== 8) throw new Error('ids[' + i + '] must be 4 bytes');
    table += id + offset.toString(16).padStart(2, '0');
    offset += payloads[i].length / WORD_CHARS;
    if (offset > MAX_OFFSET) throw new Error('METADATA_TOO_LONG');
  }
  var paddedTable = table.padEnd(Math.ceil(table.length / WORD_CHARS) * WORD_CHARS, '0');
  return '0x' + '0'.repeat(WORD_CHARS) + paddedTable + payloads.join('');
}

// Strict decode and byte-exact re-encode, else null.
function roundTripDecode(types, payload) {
  try {
    var decoded = decodeAbiParameters(types, payload);
    return encodeAbiParameters(types, decoded).toLowerCase() === payload.toLowerCase() ? decoded : null;
  } catch (_) {
    return null;
  }
}

// The envelope exactly as getDataFor reads it: offsets strictly increase and the segments tile the bytes.
function parseHookMetadataEnvelope(value) {
  if (typeof value !== 'string' || !/^0x([0-9a-fA-F]{2})+$/.test(value)) return null;
  var body = value.slice(2).toLowerCase();
  if (body.length % 64 !== 0) return null;
  var totalWords = body.length / 64;
  if (totalWords < 3) return null;
  var firstOffset = parseInt(body.slice(64 + 8, 64 + 10), 16);
  var tableWords = firstOffset - 1;
  if (tableWords < 1 || firstOffset >= totalWords) return null;
  var tableArea = body.slice(64, 64 + tableWords * 64);
  var entries = [];
  var cursor = 0;
  while (cursor + 10 <= tableArea.length) {
    var chunk = tableArea.slice(cursor, cursor + 10);
    if (/^0+$/.test(chunk)) break;
    var id = chunk.slice(0, 8);
    var offset = parseInt(chunk.slice(8, 10), 16);
    if (/^0+$/.test(id) || entries.some(function (entry) { return entry.id === '0x' + id; })) return null;
    entries.push({ id: '0x' + id, offset: offset });
    cursor += 10;
  }
  if (!/^0*$/.test(tableArea.slice(cursor))) return null;
  if (Math.ceil((entries.length * 5) / 32) !== tableWords) return null;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].offset >= totalWords) return null;
    if (i > 0 && entries[i].offset <= entries[i - 1].offset) return null;
  }
  var segments = entries.map(function (entry, k) {
    var start = entry.offset * 64;
    var end = k + 1 < entries.length ? entries[k + 1].offset * 64 : body.length;
    return { id: entry.id, payload: '0x' + body.slice(start, end) };
  });
  return { reserved: '0x' + body.slice(0, 64), entries: segments };
}

// Repeated tier ids as "2× #4", in first-seen order.
function tierIdCounts(tierIds) {
  var counts = new Map();
  tierIds.forEach(function (id) { counts.set(id, (counts.get(id) || 0) + 1); });
  return Array.from(counts.entries())
    .map(function (pair) { return pair[1] > 1 ? pair[1] + '× #' + pair[0] : '#' + pair[0]; })
    .join(', ');
}

// A lookup id names payload semantics, not provenance: the Defifa hook implementations' "pay" id.
var DEFIFA_CHAINS = [1, 10, 8453, 42161, 11155111, 11155420, 84532, 421614];
function isDefifaPayLookupId(id) {
  var wanted = id.toLowerCase();
  return DEFIFA_CHAINS.some(function (chainId) {
    var implementation = registryAddress('DefifaHook', chainId);
    return implementation !== null && hookMetadataId(implementation, 'pay').toLowerCase() === wanted;
  });
}

// A pay / addToBalanceOf / cashOutTokensOf metadata argument as confirm-dialog steps, or null when it is not an
// envelope. A payload matching several shapes is reported as ambiguous instead of picking one.
export function describeJBHookMetadata(context, value) {
  var envelope = parseHookMetadataEnvelope(value);
  if (!envelope) return null;
  var steps = [];
  if (!/^0x0+$/.test(envelope.reserved)) {
    steps.push({ title: 'Protocol-reserved word (nonzero)', rows: [['Value', envelope.reserved]] });
  }
  envelope.entries.forEach(function (entry) {
    var payloadWords = (entry.payload.length - 2) / 64;
    var base = [['Hook lookup id', entry.id]];
    var readings = [];
    if (context === 'pay') {
      var isDefifa = isDefifaPayLookupId(entry.id);
      var nativeMint = isDefifa ? roundTripDecode([{ type: 'address' }, { type: 'uint16[]' }], entry.payload) : null;
      if (nativeMint) {
        readings.push({
          title: 'Defifa mint instructions',
          rows: base.concat([
            ['Tier IDs to mint', nativeMint[1].length ? tierIdCounts(nativeMint[1]) : 'none (native mint reverts)'],
            ['Attestation delegate', nativeMint[0] === zeroAddress ? 'Game default, or the beneficiary when no default is configured' : nativeMint[0]],
            ['Delegation effect', 'Self-payments update all existing holdings in selected tiers; gifts preserve recipient delegation'],
            ['Interpretation', 'Known native lookup ID; contract identity requires separate verification'],
          ]),
        });
      }
      var mint = isDefifa ? null : roundTripDecode([{ type: 'bool' }, { type: 'uint16[]' }], entry.payload);
      if (mint) {
        readings.push({
          title: '721 shop mint instructions',
          rows: base.concat([
            ['Tier IDs to mint', mint[1].length ? tierIdCounts(mint[1]) : 'none (credits only)'],
            ['Allow overspending', mint[0] ? 'yes — excess becomes pay credits' : 'no — any excess reverts'],
          ]),
        });
      }
      if (!isDefifa && payloadWords === 3) {
        var buyback = roundTripDecode([{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }], entry.payload);
        if (buyback) {
          readings.push({
            title: 'Buyback hook swap instructions',
            rows: base.concat([
              ['Amount to swap', buyback[0].toString()],
              ['Minimum swap output', buyback[1] + ' — reverts below this'],
              ['Skip splits on swapped tokens', buyback[2] ? 'yes' : 'no'],
            ]),
          });
        }
      }
    } else {
      if (payloadWords === 2) {
        var cashOut = roundTripDecode([{ type: 'uint256' }, { type: 'bool' }], entry.payload);
        if (cashOut) {
          readings.push({
            title: 'Buyback hook cash-out routing',
            rows: base.concat([
              ['Minimum swap output', cashOut[0].toString()],
              ['Force the direct terminal path', cashOut[1] ? 'yes — never route through the pool' : 'no'],
            ]),
          });
        }
      }
      var redeem = roundTripDecode([{ type: 'uint256[]' }], entry.payload);
      if (redeem) {
        readings.push({
          title: '721 shop items to redeem',
          rows: base.concat([
            ['Token IDs', redeem[0].length ? redeem[0].map(function (id) { return '#' + id; }).join(', ') : 'none'],
          ]),
        });
      }
    }
    if (readings.length === 1) {
      steps.push(readings[0]);
    } else if (readings.length > 1) {
      steps.push({
        title: 'Payload matches multiple known shapes — verify against the raw bytes',
        rows: base.concat(readings.map(function (reading, i) {
          return ['Reading ' + (i + 1), reading.title + ': ' + reading.rows.slice(base.length)
            .map(function (row) { return row[0].toLowerCase() + ': ' + row[1]; }).join('; ')];
        })),
      });
    } else {
      steps.push({
        title: 'Unrecognized hook payload (' + payloadWords + ' word' + (payloadWords === 1 ? '' : 's') + ')',
        rows: base.concat([['Payload', entry.payload]]),
      });
    }
  });
  return steps;
}
