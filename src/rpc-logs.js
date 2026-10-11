// Center accepts at most 500 blocks per log request. Keep the complete range,
// its filters and failures; a partial history must never look complete.
export const RPC_LOG_WINDOW = 500n;

export function boundedLogClient(client) {
  function partitionable(params) {
    return params && !params.blockHash && params.fromBlock != null && params.toBlock != null
      && params.fromBlock !== 'pending' && params.toBlock !== 'pending';
  }
  async function range(params, read, raw) {
    var head;
    async function block(value) {
      if (value == null || value === 'latest') {
        if (head == null) head = BigInt(await client.getBlockNumber());
        return head;
      }
      if (value === 'earliest') return 0n;
      if (value === 'safe' || value === 'finalized') return BigInt((await client.getBlock({ blockTag: value })).number);
      return BigInt(value);
    }
    var from = await block(params.fromBlock), to = await block(params.toBlock);
    if (from < 0n || to < from) throw new Error('Invalid log scan bounds.');
    var logs = [];
    for (var lo = from; lo <= to; lo += RPC_LOG_WINDOW) {
      var hi = lo + RPC_LOG_WINDOW - 1n;
      if (hi > to) hi = to;
      var encode = function (n) { return raw ? '0x' + n.toString(16) : n; };
      logs.push(...await read(Object.assign({}, params, { fromBlock: encode(lo), toBlock: encode(hi) })));
    }
    return logs;
  }
  return Object.assign({}, client, {
    getLogs: function (params) {
      if (!partitionable(params)) return client.getLogs(params);
      return range(params, function (part) { return client.getLogs(part); }, false);
    },
    request: function (args) {
      if (args.method !== 'eth_getLogs') return client.request(args);
      if (!partitionable(args.params?.[0])) return client.request(args);
      return range(args.params[0], function (part) {
        return client.request(Object.assign({}, args, { params: [part] }));
      }, true);
    },
  });
}
