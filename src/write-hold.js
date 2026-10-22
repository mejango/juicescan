// A lean local copy of the SDK's write hold (nana-sdk-core review/writeRecovery: createBrowserWriteRecovery,
// readReviewedWriteNonce, checkReviewedWrite, findTransactionAtNonce). One record per account, chain, target
// and function, saved before the wallet opens. Only an explicit wallet rejection drops it before a receipt; any
// other outcome keeps the action held, across reloads, until a receipt or the user's own wallet check ends it.
var PREFIX = 'juicescan-write-hold-v1:';
// Browser storage when it can be written; this tab's memory when it can't (private mode, sandboxed frames).
var memory = new Map();
var busy = new Set();

function getItem(key) {
  if (memory.has(key)) return memory.get(key);
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function setItem(key, raw) {
  try { localStorage.setItem(key, raw); if (localStorage.getItem(key) === raw) { memory.delete(key); return; } } catch (_) {}
  memory.set(key, raw);
}
function removeItem(key) {
  memory.delete(key);
  try { localStorage.removeItem(key); } catch (_) {}
}
function newId() {
  try { return crypto.randomUUID(); } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
}

export function writeHold(chainId, account, call) {
  var key = PREFIX + String(account).toLowerCase() + ':' + chainId + ':' + String(call.to).toLowerCase() + ':' + call.functionName;
  // An unreadable record still holds: it names no call, so only the user's check can end it.
  function read() {
    var raw = getItem(key);
    if (raw == null) return null;
    try { var record = JSON.parse(raw); return record && typeof record === 'object' ? record : {}; } catch (_) { return {}; }
  }
  // Only the record `expected` names is touched, so a stale callback never ends a newer attempt.
  function update(expected, fields) {
    var current = read();
    if (!current || current.id !== expected.id) return current;
    var next = Object.assign({}, current, fields);
    setItem(key, JSON.stringify(next));
    return next;
  }
  return {
    chainId: chainId,
    account: account,
    read: read,
    reserve: function (evidence) {
      if (read()) throw new Error('An earlier transaction for this action is not settled. Check it before sending again.');
      var record = { id: newId(), chainId: chainId, account: String(account).toLowerCase(), to: String(call.to).toLowerCase(), data: String(call.data).toLowerCase(), value: String(call.value || 0n) };
      if (evidence) { record.nonce = String(evidence.nonce); record.fromBlock = String(evidence.blockNumber); }
      setItem(key, JSON.stringify(record));
      return record;
    },
    submitted: function (expected, hash) { return update(expected, { hash: String(hash).toLowerCase() }); },
    release: function (expected) {
      var current = read();
      if (current && current.id === expected.id) removeItem(key);
    },
    // The user's exit after checking their wallet, or a settled check.
    abandon: function () { removeItem(key); },
    // One send or check per action at a time, across tabs when Web Locks exist.
    withLock: function (work) {
      var refused = function () { return Promise.reject(new Error('This wallet action is already open in another window.')); };
      if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
        return navigator.locks.request(key, { ifAvailable: true }, function (lock) { return lock ? work() : refused(); });
      }
      if (busy.has(key)) return refused();
      busy.add(key);
      return Promise.resolve().then(work).finally(function () { busy.delete(key); });
    },
  };
}

// The account's next nonce (pending included) and the block it was read at, read before the wallet opens.
export async function readWriteNonce(client, account) {
  try {
    // Read together: a block read after the nonce only lowers the search, never hides the nonce's transaction.
    var reads = await Promise.all([client.getBlockNumber(), client.getTransactionCount({ address: account, blockTag: 'pending' })]);
    var blockNumber = reads[0], nonce = reads[1];
    return { nonce: BigInt(nonce), blockNumber: BigInt(blockNumber) };
  } catch (_) { return null; }
}

// What the chain shows of a held write: `sent` with the hash to read the receipt of, or `pending`.
// `usedBy`: another transaction took the nonce (it may still have run the call inside it, so it proves nothing).
export async function findHeldWrite(client, record) {
  if (record.hash) {
    var tx = await client.getTransaction({ hash: record.hash }).catch(function () { return null; });
    if (tx && String(tx.from).toLowerCase() === record.account && tx.blockNumber != null) return { status: 'sent', hash: record.hash };
    return { status: 'pending' };
  }
  if (record.nonce == null || record.fromBlock == null) return { status: 'pending' };
  var nonce = BigInt(record.nonce);
  var count = async function (blockNumber) { return BigInt(await client.getTransactionCount({ address: record.account, blockNumber: blockNumber })); };
  // ponytail: searches up to `latest`, not a finalized block; a reorg after the match is caught by the receipt read.
  var high = BigInt(await client.getBlockNumber()), low = BigInt(record.fromBlock);
  if (high <= low || (await count(high)) <= nonce || (await count(low)) > nonce) return { status: 'pending' };
  while (high - low > 1n) {
    var middle = (low + high) / 2n;
    if ((await count(middle)) > nonce) high = middle; else low = middle;
  }
  var block = await client.getBlock({ blockNumber: high, includeTransactions: true });
  var used = (block.transactions || []).find(function (t) { return String(t.from).toLowerCase() === record.account && BigInt(t.nonce) === nonce; });
  if (!used) return { status: 'pending' };
  if (String(used.to).toLowerCase() === record.to && String(used.input).toLowerCase() === record.data && BigInt(used.value || 0) === BigInt(record.value)) {
    return { status: 'sent', hash: used.hash };
  }
  return { status: 'pending', usedBy: used.hash };
}
