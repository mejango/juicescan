import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedMetadataJson, boundedResponseBytes, MAX_METADATA_BYTES } from '../src/bounded-response.js';

const encode = value => new TextEncoder().encode(value);
function streamed(chunks, declared) {
  const cancel = vi.fn();
  let at = 0;
  const body = new ReadableStream({
    pull(controller) { if (at < chunks.length) controller.enqueue(chunks[at++]); else controller.close(); },
    cancel,
  });
  return { body, headers: new Headers(declared === undefined ? {} : { 'content-length': String(declared) }), cancel };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('bounded streamed responses', () => {
  it.each([undefined, 1, 'invalid'])('counts actual bytes despite content-length %s and cancels before buffering the remainder', async declared => {
    const response = streamed([encode('1234'), encode('56'), encode('unread')], declared);
    await expect(boundedResponseBytes(response, 5)).rejects.toThrow('response too large');
    expect(response.cancel).toHaveBeenCalledOnce();
    expect(response.body.locked).toBe(false);
  });

  it('accepts the exact byte limit with Unicode split between chunks', async () => {
    const bytes = encode(JSON.stringify({ name: '🧃é' }));
    const response = streamed([bytes.slice(0, 12), bytes.slice(12, 14), bytes.slice(14)]);
    const result = await boundedResponseBytes(response, bytes.length);
    expect(JSON.parse(new TextDecoder().decode(result))).toEqual({ name: '🧃é' });
    expect(response.cancel).not.toHaveBeenCalled();
    expect(response.body.locked).toBe(false);
  });

  it('accepts Center-supported metadata at exactly 2 MiB and rejects one byte more', async () => {
    const overhead = JSON.stringify({ description: '' }).length;
    const text = JSON.stringify({ description: 'x'.repeat(MAX_METADATA_BYTES - overhead) });
    await expect(boundedMetadataJson(new Response(text))).resolves.toHaveProperty('description', 'x'.repeat(MAX_METADATA_BYTES - overhead));
    await expect(boundedMetadataJson(new Response(text + ' '))).rejects.toThrow('response too large');
  });

  it('rejects an oversized declared body without reading it', async () => {
    const response = streamed([encode('valid')], 6);
    await expect(boundedResponseBytes(response, 5)).rejects.toThrow('response too large');
    expect(response.cancel).toHaveBeenCalledOnce();
    expect(response.body.locked).toBe(false);
  });

  it('cancels a stalled body when its request is aborted and releases the reader', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const controller = new AbortController();
    const result = boundedResponseBytes(new Response(body), 10, controller.signal);
    const rejection = expect(result).rejects.toThrow('metadata fetch timed out');
    controller.abort(new Error('metadata fetch timed out'));
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('cleans up on a body error and rejects malformed JSON', async () => {
    const body = new ReadableStream({ start(controller) { controller.error(new Error('connection lost')); } });
    await expect(boundedResponseBytes(new Response(body), 10)).rejects.toThrow('connection lost');
    expect(body.locked).toBe(false);
    await expect(boundedMetadataJson(new Response('{'))).rejects.toThrow();
  });

  it('rejects an already aborted request without acquiring a reader', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const response = new Response('{}');
    await expect(boundedResponseBytes(response, 10, controller.signal)).rejects.toThrow('cancelled');
    expect(response.body.locked).toBe(false);
  });
});
