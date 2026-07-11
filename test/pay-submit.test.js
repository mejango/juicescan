import { describe, expect, it } from 'vitest';
import { payPreviewCanSubmit } from '../src/discover.js';

describe('pay submission quote gate', () => {
  it('allows an NFT-only payment with a verified zero fungible-token quote', () => {
    expect(payPreviewCanSubmit('ready', { received: 0n, unavailable: false }, 1)).toBe(true);
  });

  it('still blocks a plain zero-issuance pay and all unverified previews', () => {
    expect(payPreviewCanSubmit('ready', { received: 0n, unavailable: false }, 0)).toBe(false);
    expect(payPreviewCanSubmit('loading', { received: 1n, unavailable: false }, 1)).toBe(false);
    expect(payPreviewCanSubmit('ready', { received: 1n, unavailable: true }, 1)).toBe(false);
  });

  it('allows a verified positive token quote without an NFT selection', () => {
    expect(payPreviewCanSubmit('ready', { received: 1n, unavailable: false }, 0)).toBe(true);
  });
});
