import { describe, expect, it } from 'vitest';
import { payPreviewCanSubmit } from '../src/discover.js';

describe('pay submission quote gate', () => {
  it('allows a verified zero-token payment without requiring an NFT', () => {
    expect(payPreviewCanSubmit('ready', { received: 0n, reserved: 0n, unavailable: false })).toBe(true);
  });

  it('still blocks incomplete, malformed, and unavailable previews', () => {
    expect(payPreviewCanSubmit('loading', { received: 1n, unavailable: false })).toBe(false);
    expect(payPreviewCanSubmit('ready', { received: 1n, unavailable: true })).toBe(false);
    expect(payPreviewCanSubmit('ready', { received: null, unavailable: false })).toBe(false);
    expect(payPreviewCanSubmit('ready', { received: 'nope', unavailable: false })).toBe(false);
  });

  it('allows a verified positive token quote without an NFT selection', () => {
    expect(payPreviewCanSubmit('ready', { received: 1n, unavailable: false })).toBe(true);
  });
});
