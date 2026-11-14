import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDraftObject, exportDraftFile, newCreateDraftState, parseCreateDraftJson, shopMediaUploadIssue } from '../src/create-flow.js';

describe('.jb draft interchange', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('blocks deployment while shop media is uploading or after its upload fails', () => {
    expect(shopMediaUploadIssue({ shopEnabled: true, nfts: [{ _mediaBusy: true }] })).toMatch(/still uploading/i);
    expect(shopMediaUploadIssue({ shopEnabled: true, nfts: [{ _mediaError: 'network failed' }] })).toMatch(/upload failed/i);
    expect(shopMediaUploadIssue({ shopEnabled: true, nfts: [{ imageUri: 'ipfs://video', mediaType: 'video/mp4' }] })).toBe('');
    expect(shopMediaUploadIssue({ shopEnabled: false, nfts: [{ _mediaError: 'stale error' }] })).toBe('');
  });

  it('keeps the synthetic export anchor alive until the browser starts the download', () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const revoke = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:project-draft'),
      revokeObjectURL: revoke,
    });
    const state = newCreateDraftState();
    state.details.name = 'After launch';

    exportDraftFile(state);

    const anchor = document.querySelector('a[download="after-launch.jb"]');
    expect(click).toHaveBeenCalledOnce();
    expect(anchor).not.toBeNull();
    expect(revoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(document.querySelector('a[download="after-launch.jb"]')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:project-draft');
  });
});

describe('.jb import, accounting and base currency (PriceFeedNotFound guard)', () => {
  function usdcDraft(edit) {
    const state = newCreateDraftState();
    state.projectType = 'custom';
    state.network = 'mainnet';
    state.chainIds = [1];
    state.details.name = 'Imported';
    state.accepts = ['usdc'];
    state.storePricingCurrency = 2;
    Object.assign(state.stages[0], { baseCurrency: 2, payoutCurrency: 2, surplusAllowanceCurrency: 2 });
    if (edit) edit(state);
    return createDraftObject(state);
  }

  it('refuses ETH-priced issuance on a USDC-only file instead of re-pricing it', () => {
    // There is no USDC to ETH feed by default: such a launch reverts every payment with PriceFeedNotFound.
    const file = usdcDraft();
    file.stages[0].baseCurrency = 'eth';
    expect(() => parseCreateDraftJson(file)).toThrow('issuance not counted in USD while USDC is accepted');
  });

  it('refuses a revnet priced in ETH with USDC accepted the same way', () => {
    const file = usdcDraft((state) => { state.projectType = 'revnet'; state.revBaseCurrency = 2; });
    file.stages[0].baseCurrency = 'eth';
    expect(() => parseCreateDraftJson(file)).toThrow('issuance not counted in USD while USDC is accepted');
  });

  it('leaves a consistent USDC draft alone (no notice)', () => {
    const imported = parseCreateDraftJson(usdcDraft());
    expect(imported.stages[0].baseCurrency).toBe(2);
    expect(imported.storePricingCurrency).toBe(2);
    expect(imported._importNotice).toBeUndefined();
  });

  it('keeps the user choice of USD issuance on an ETH-only draft (ETH to USD has a default feed)', () => {
    const state = newCreateDraftState();
    state.projectType = 'custom';
    state.chainIds = [1];
    state.network = 'mainnet';
    state.accepts = ['eth'];
    state.stages[0].baseCurrency = 2;
    const imported = parseCreateDraftJson(JSON.stringify(createDraftObject(state)));
    expect(imported.stages[0].baseCurrency).toBe(2);
    expect(imported._importNotice).toBeUndefined();
  });
});
