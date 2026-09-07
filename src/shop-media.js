import { isAddress } from 'viem';

export var SHOP_MEDIA_METADATA_ABI = [{ type: 'function', name: 'setMetadata', stateMutability: 'nonpayable',
  inputs: [{ name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'baseUri', type: 'string' },
    { name: 'contractUri', type: 'string' }, { name: 'tokenUriResolver', type: 'address' },
    { name: 'encodedIpfsUriTierId', type: 'uint256' }, { name: 'encodedIpfsUri', type: 'bytes32' }], outputs: [] }];

export function shopMediaMetadataArgs(hook, tierId, encodedUri) {
  if (!isAddress(hook, { strict: false }) || !Number.isSafeInteger(Number(tierId)) || Number(tierId) < 1
      || Number(tierId) > 0xffffffff || !/^0x[0-9a-f]{64}$/i.test(encodedUri) || /^0x0{64}$/i.test(encodedUri)) {
    throw new Error('The replacement item metadata is invalid.');
  }
  // The hook's own address is the contract-defined sentinel that leaves its URI resolver unchanged.
  return ['', '', '', '', hook, BigInt(tierId), encodedUri];
}

export function canonicalShopMetadata(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalShopMetadata).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + canonicalShopMetadata(value[key]);
  }).join(',') + '}';
}

export function shopMetadataName(metadata) {
  var name = metadata && (metadata.productName || metadata.name);
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('The existing item name could not be verified.');
  return name.trim().normalize('NFC');
}

export function mergeShopMediaMetadata(metadata, edits) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || JSON.stringify(metadata).length > 65536) {
    throw new Error('The existing item metadata is missing, malformed, or too large to preserve.');
  }
  shopMetadataName(metadata);
  var result = JSON.parse(JSON.stringify(metadata));
  if (Object.prototype.hasOwnProperty.call(edits, 'name')) {
    var name = String(edits.name || '').trim();
    if (!name || name.length > 200) throw new Error('Enter an item name of at most 200 characters.');
    if (Object.prototype.hasOwnProperty.call(result, 'productName')) result.productName = name;
    if (Object.prototype.hasOwnProperty.call(result, 'name') || !Object.prototype.hasOwnProperty.call(result, 'productName')) result.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(edits, 'description')) {
    var description = String(edits.description || '');
    if (description.length > 20000) throw new Error('The item description is too long.');
    if (Object.prototype.hasOwnProperty.call(result, 'productDescription')) result.productDescription = description;
    if (Object.prototype.hasOwnProperty.call(result, 'description') || !Object.prototype.hasOwnProperty.call(result, 'productDescription')) result.description = description;
  }
  if (edits.mediaUri) {
    if (!/^(ipfs:\/\/|https:\/\/)[^\s]+$/i.test(edits.mediaUri)) throw new Error('Use an ipfs:// or https:// replacement media URI.');
    result.mediaType = edits.mediaType || 'image';
    if (result.mediaType.indexOf('image') === 0) {
      result.image = edits.mediaUri;
      if (Object.prototype.hasOwnProperty.call(result, 'imageUri')) result.imageUri = edits.mediaUri;
      delete result.animation_url; delete result.animationUrl;
    } else {
      result.animation_url = edits.mediaUri;
      if (Object.prototype.hasOwnProperty.call(result, 'animationUrl')) result.animationUrl = edits.mediaUri;
    }
  }
  if (JSON.stringify(result).length > 65536) throw new Error('The replacement metadata is too large.');
  return result;
}

// Validate every chain before uploading. One file upload serves the whole selection; metadata is shared only
// when the complete preserved JSON is identical. Local attributes, descriptions and custom fields stay local.
export async function prepareShopMediaMetadata(rows, edits, services) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Select at least one chain.');
  if (edits.file && edits.mediaUri) throw new Error('Choose a replacement file or image URI, not both.');
  if (!edits.file && !edits.mediaUri && !Object.prototype.hasOwnProperty.call(edits, 'name')
      && !Object.prototype.hasOwnProperty.call(edits, 'description')) throw new Error('Choose media or an optional metadata field to change.');
  var name = shopMetadataName(rows[0].metadata);
  rows.forEach(function (row) {
    if (shopMetadataName(row.metadata) !== name) throw new Error('The selected tiers have different item names. Select one chain to edit its item separately.');
    mergeShopMediaMetadata(row.metadata, edits);
  });
  var applied = Object.assign({}, edits);
  if (edits.file) {
    if (!Number.isFinite(edits.file.size) || edits.file.size <= 0 || edits.file.size > 25 * 1024 * 1024) throw new Error('Choose a media file between 1 byte and 25 MB.');
    applied.mediaUri = await services.pinFile(edits.file, name);
    applied.mediaType = edits.mediaType || 'application/octet-stream';
  }
  var prepared = rows.map(function (row) {
    var metadata = mergeShopMediaMetadata(row.metadata, applied), key = canonicalShopMetadata(metadata);
    if (key === canonicalShopMetadata(row.metadata)) throw new Error('The selected replacement does not change the item on ' + row.chainName + '.');
    return { row: row, metadata: metadata, key: key };
  });
  var pinned = new Map(), updates = [];
  for (var entry of prepared) {
    var row = entry.row, metadata = entry.metadata, key = entry.key, uri = pinned.get(key);
    if (!uri) { uri = await services.pinJson(metadata, shopMetadataName(metadata)); pinned.set(key, uri); }
    updates.push(Object.assign({}, row, { metadata: metadata, uri: uri, encodedUri: services.encodeUri(uri) }));
  }
  return updates;
}
