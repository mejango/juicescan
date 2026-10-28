// One byte-reading boundary for untrusted fetched documents and images.
export async function boundedResponseBytes(response, maximum, signal) {
  if (signal && signal.aborted) throw signal.reason || new Error('response aborted');
  var body = response.body;
  if (Number(response.headers && response.headers.get('content-length')) > maximum) {
    if (body) body.cancel().catch(function () {});
    throw new Error('response too large');
  }
  if (!body) return new Uint8Array();
  var reader = body.getReader(), chunks = [], size = 0;
  var cancel = function () { reader.cancel(signal && signal.reason).catch(function () {}); };
  if (signal) signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      var result = await reader.read();
      if (signal && signal.aborted) throw signal.reason || new Error('response aborted');
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximum) { cancel(); throw new Error('response too large'); }
      chunks.push(result.value);
    }
  } finally {
    if (signal) signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  var output = new Uint8Array(size), offset = 0;
  chunks.forEach(function (chunk) { output.set(chunk, offset); offset += chunk.byteLength; });
  return output;
}

// Matches Center's supported JSON pin size, including existing project extensions and inline artwork.
export var MAX_METADATA_BYTES = 2 * 1024 * 1024;

export async function boundedMetadataJson(response, signal) {
  return JSON.parse(new TextDecoder().decode(await boundedResponseBytes(response, MAX_METADATA_BYTES, signal)));
}
