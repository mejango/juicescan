// One byte-reading boundary for untrusted fetched documents and images.
export async function boundedResponseBytes(response, maximum) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maximum) throw new Error('response too large');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximum) throw new Error('response too large');
  return bytes;
}

