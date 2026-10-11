import { getProjectNftInventory } from '@bananapus/nana-sdk-core/v6';

export function isNativeInventory(inventory) { return !!inventory && inventory.protocol === 'defifa'; }
export function nativeMarketUrl(chainId, projectId) { return 'https://metalog.money/markets/' + Number(chainId) + '/' + BigInt(projectId); }

// One SDK owner recognizes protocols. Keep every page at the first page's block;
// store category ordering is not necessarily numeric tier-ID ordering.
export async function readProjectNftInventory(client, args) {
  var first = await getProjectNftInventory(client, args);
  if (!first) return null;
  var tiers = first.tiers.slice(), cursor = first.nextStartingId, cursors = new Set(), ids = new Set(tiers.map(function (tier) { return tier.id; }));
  while (cursor != null) {
    if (cursors.has(String(cursor)) || tiers.length >= 4096) throw new Error('NFT inventory pagination exceeded its bound or repeated a cursor.');
    cursors.add(String(cursor));
    var page = await getProjectNftInventory(client, Object.assign({}, args, { startingId: cursor, blockNumber: first.blockNumber }));
    if (!page || page.protocol !== first.protocol || page.hook !== first.hook || page.blockNumber !== first.blockNumber) throw new Error('NFT inventory identity changed while reading its pages.');
    page.tiers.forEach(function (tier) {
      if (ids.has(tier.id)) throw new Error('NFT inventory returned a duplicate tier.');
      ids.add(tier.id); tiers.push(tier);
    });
    cursor = page.nextStartingId;
  }
  return Object.assign({}, first, { tiers: tiers, nextStartingId: null });
}

export async function requireGenericInventory(client, args, capability) {
  // Defifa markets cannot be revnets; keep revnet-only writer paths unchanged.
  if (args.isRevnet) return null;
  var inventory = await getProjectNftInventory(client, Object.assign({}, args, { tierLimit: 1 }));
  if (inventory && !inventory.capabilities[capability]) throw new Error('Use Metalog for this market: ' + nativeMarketUrl(args.chainId, args.projectId));
  return inventory;
}

export function renderNativeInventory(inventory, chainId, projectId, formatPrice, metadataUrl) {
  var wrap = document.createElement('div'); wrap.className = 'detail-card-body';
  var phase = document.createElement('p'); phase.textContent = ['Countdown', 'Entry open', 'Refund period', 'Scoring', 'Complete', 'No contest'][inventory.phase]; wrap.appendChild(phase);
  var link = document.createElement('a'); link.href = nativeMarketUrl(chainId, projectId); link.textContent = 'Open market in Metalog →'; wrap.appendChild(link);
  if (/^https?:\/\//.test(metadataUrl || '')) { var meta = document.createElement('a'); meta.href = metadataUrl; meta.textContent = 'Market metadata'; var paragraph = document.createElement('p'); paragraph.appendChild(meta); wrap.appendChild(paragraph); }
  var table = document.createElement('table'); table.className = 'native-nft-inventory';
  var caption = document.createElement('caption'); caption.textContent = 'Onchain ranges · block ' + inventory.blockNumber; table.appendChild(caption);
  var head = document.createElement('thead'), headRow = document.createElement('tr');
  ['Tier', 'Range', 'Price per NFT', 'Current NFTs'].forEach(function (label) { var cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; headRow.appendChild(cell); });
  head.appendChild(headRow); table.appendChild(head);
  var body = document.createElement('tbody');
  inventory.tiers.forEach(function (tier) {
    var row = document.createElement('tr');
    [tier.id, tier.name, formatPrice(tier.price), tier.currentSupply].forEach(function (value) { var cell = document.createElement('td'); cell.textContent = String(value); row.appendChild(cell); });
    body.appendChild(row);
  });
  table.appendChild(body); wrap.appendChild(table);
  var addr = document.createElement('p'); addr.textContent = 'Collection: ' + inventory.hook; addr.className = 'shop-collection-addr'; wrap.appendChild(addr);
  return wrap;
}
