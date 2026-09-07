import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionResult } from 'viem';

const runtime = vi.hoisted(() => ({ saved: false, prepared: null, reads: [], metadata: {}, tiers: {}, resolvers: {}, pids: {}, pricing: {}, denied: {}, pinned: [], files: [] }));
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const HOOK_BASE = '0x2222222222222222222222222222222222222222';
const HOOK_OP = '0x3333333333333333333333333333333333333333';
const STORE = '0x4444444444444444444444444444444444444444';
const ZERO = '0x0000000000000000000000000000000000000000';

vi.mock('../src/component-base.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual,
    getAccount: () => '0x1111111111111111111111111111111111111111',
    getEffectiveAccount: () => '0x1111111111111111111111111111111111111111',
    getViewAs: () => null, isSafeConnected: () => false,
    createPublicClientForChain: cid => ({
      request: async request => {
        runtime.reads.push({ cid, ...request });
        return encodeFunctionResult({ abi: getABI('JB721TiersHookStore'), functionName: 'tiersOf', result: runtime.tiers[cid] ? [runtime.tiers[cid]] : [] });
      },
      readContract: async request => {
        runtime.reads.push({ cid, ...request });
        if (request.functionName === 'tiered721HookOf') return cid === 8453 ? '0x2222222222222222222222222222222222222222' : '0x3333333333333333333333333333333333333333';
        if (request.functionName === 'STORE') return '0x4444444444444444444444444444444444444444';
        if (request.functionName === 'pricingContext') return runtime.pricing[cid] || [1n, 18n];
        if (request.functionName === 'projectId') return BigInt(runtime.pids[cid]);
        if (request.functionName === 'tokenUriResolverOf') return runtime.resolvers[cid];
        if (request.functionName === 'owner') return runtime.denied[cid] ? '0x4444444444444444444444444444444444444444' : '0x1111111111111111111111111111111111111111';
        if (request.functionName === 'hasPermission') return false;
        throw new Error('Unexpected read ' + request.functionName);
      },
    }),
  };
});
vi.mock('../src/ipfs-pin.js', async importOriginal => ({
  ...await importOriginal(), hasPinata: () => true,
  pinFile: async file => { runtime.files.push(file); return 'ipfs://uploaded-file'; },
  pinJson: async json => { runtime.pinned.push(json); return encodedIpfsCandidates(`0x${String(runtime.pinned.length + 40).repeat(32)}`)[0]; },
}));
// Exercise the real editor and selected-call adapter, stopping at the durable-plan boundary.
vi.mock('../src/action-plan.js', () => ({
  hasSavedActionPlan: () => runtime.saved,
  acknowledgeSavedActionPlan: () => { runtime.saved = false; },
  runSavedActionPlan: async options => {
    if (runtime.saved) return { completed: true, resumed: true, rounds: 1, results: [{ relayr: true, session: { expectedCount: 2, records: [] } }] };
    runtime.prepared = await options.prepare();
    return { cancelled: true };
  },
}));

import { getABI } from '../src/abi-registry.js';
import { assertShopMediaSelection, encodedIpfsCandidates, openShopMediaEditor, readShopMediaState, reverifyShopMediaCalls } from '../src/discover.js';

const project = { id: 12, chainId: 8453, idByChain: { 8453: 12, 10: 99 }, isRevnet: true, operator: ACCOUNT,
  chains: [{ id: 8453, name: 'Base' }, { id: 10, name: 'Optimism' }] };
const tier = (encodedByte = 'ab') => ({ id: 7, price: 1000n, remainingSupply: 8, initialSupply: 10, votingUnits: 0n,
  reserveFrequency: 0, reserveBeneficiary: ZERO, encodedIpfsUri: `0x${encodedByte.repeat(32)}`, category: 1,
  discountPercent: 20, splitPercent: 0, resolvedUri: '', flags: { allowOwnerMint: false, transfersPausable: false,
    cantBeRemoved: false, cantIncreaseDiscountPercent: false, cantBuyWithCredits: false } });
const field = name => document.querySelector(`[aria-label="${name}"]`);
const submit = () => document.querySelector('.shop-media-editor .operator-cta');
const status = () => document.querySelector('.shop-media-editor .operator-edit-status').textContent;
async function review() {
  openShopMediaEditor(project, tier());
  field('Or replacement image URI').value = 'https://example.com/replacement.png';
  submit().click();
  await vi.waitFor(() => expect(runtime.prepared).not.toBeNull());
  return runtime.prepared.rounds[0];
}

beforeEach(() => {
  document.body.innerHTML = ''; localStorage.clear();
  runtime.saved = false; runtime.prepared = null; runtime.reads = []; runtime.pinned = []; runtime.files = [];
  runtime.tiers = { 8453: tier(), 10: tier('cd') }; runtime.resolvers = { 8453: ZERO, 10: ZERO };
  runtime.pids = { 8453: 12, 10: 99 }; runtime.pricing = {}; runtime.denied = {};
  runtime.metadata = {};
  for (const cid of [8453, 10]) runtime.metadata[encodedIpfsCandidates(runtime.tiers[cid].encodedIpfsUri)[0].slice(7)] = {
    name: 'Matching item', image: `https://example.com/${cid}.png`, description: `Keep ${cid} description`,
    attributes: [{ trait_type: 'Local chain', value: cid }], custom: { chain: cid },
  };
  vi.stubGlobal('fetch', vi.fn(async url => {
    const key = Object.keys(runtime.metadata).find(candidate => String(url).includes(candidate));
    if (!key) throw new Error('Unexpected metadata URL ' + url);
    return { ok: true, json: async () => runtime.metadata[key] };
  }));
});

describe('shop media editor', () => {
  it('shows selected chain checkboxes and each current media preview and encoded metadata URI', async () => {
    openShopMediaEditor(project, tier());
    await vi.waitFor(() => expect(document.querySelectorAll('.shop-media-current img')).toHaveLength(2));
    expect(field('Update media on Base').checked).toBe(true); expect(field('Update media on Optimism').checked).toBe(true);
    for (const cid of [8453, 10]) expect(document.body.textContent).toContain(encodedIpfsCandidates(runtime.tiers[cid].encodedIpfsUri)[0]);
    expect(field('New item name').disabled).toBe(true);
    field('Change item name').click(); expect(field('New item name').disabled).toBe(false);
    expect(field('New item description').disabled).toBe(true);
    field('Change item description').click(); expect(field('New item description').disabled).toBe(false);
  });

  it('prepares exact local hooks, project IDs and distinct preserved metadata, allowing old media to differ', async () => {
    const calls = await review();
    expect(calls.map(call => [call.chainId, call.to, call.args.slice(0, 6)])).toEqual([
      [8453, HOOK_BASE, ['', '', '', '', HOOK_BASE, 7n]], [10, HOOK_OP, ['', '', '', '', HOOK_OP, 7n]],
    ]);
    expect(calls.map(call => call.validation.projectId)).toEqual(['12', '99']);
    expect(calls[0].args[6]).not.toBe(calls[1].args[6]);
    expect(runtime.pinned).toEqual([8453, 10].map(cid => ({ name: 'Matching item', image: 'https://example.com/replacement.png',
      mediaType: 'image', description: `Keep ${cid} description`, attributes: [{ trait_type: 'Local chain', value: cid }], custom: { chain: cid } })));
  });

  it('omits a deselected chain and leaves optional name and description untouched', async () => {
    openShopMediaEditor(project, tier()); field('Update media on Base').checked = false;
    field('Or replacement image URI').value = 'ipfs://new-image'; submit().click();
    await vi.waitFor(() => expect(runtime.prepared).not.toBeNull());
    expect(runtime.prepared.rounds[0]).toHaveLength(1);
    expect(runtime.prepared.rounds[0][0]).toMatchObject({ chainId: 10, to: HOOK_OP });
    expect(runtime.pinned[0]).toMatchObject({ name: 'Matching item', description: 'Keep 10 description' });
  });

  it('previews a local replacement and uploads its file once for all selected chains', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:local-selected-file');
    URL.revokeObjectURL = vi.fn();
    openShopMediaEditor(project, tier());
    const file = new File(['png'], 'new.png', { type: 'image/png' });
    Object.defineProperty(field('Replacement file (up to 25 MB)'), 'files', { value: [file] });
    field('Replacement file (up to 25 MB)').dispatchEvent(new Event('change'));
    expect(document.querySelector('.shop-media-replacement-preview img').src).toBe('blob:local-selected-file');
    submit().click();
    expect(field('Or replacement image URI').disabled).toBe(true);
    await vi.waitFor(() => expect(runtime.prepared).not.toBeNull());
    expect(runtime.files).toEqual([file]);
    expect(runtime.pinned.map(json => json.image)).toEqual(['ipfs://uploaded-file', 'ipfs://uploaded-file']);
  });

  it('checks every selected permission before uploading any replacement metadata', async () => {
    runtime.denied[10] = true;
    openShopMediaEditor(project, tier()); field('Or replacement image URI').value = 'ipfs://new-image';
    submit().click();
    await vi.waitFor(() => expect(status()).toContain('SET_721_METADATA permission'));
    expect(runtime.prepared).toBeNull(); expect(runtime.pinned).toEqual([]); expect(runtime.files).toEqual([]);
  });

  it('resumes a saved plan with empty/changed fields without fetching metadata, repinning, or preparing new calls', async () => {
    runtime.saved = true; openShopMediaEditor(project, tier());
    expect(submit().textContent).toBe('Resume saved media update');
    field('Update media on Base').checked = false; field('Update media on Optimism').checked = false;
    field('Or replacement image URI').value = 'invalid changed input'; submit().click();
    await vi.waitFor(() => expect(runtime.saved).toBe(false));
    expect(runtime.prepared).toBeNull(); expect(runtime.reads).toEqual([]);
    expect(runtime.pinned).toEqual([]); expect(runtime.files).toEqual([]); expect(fetch).not.toHaveBeenCalled();
    expect(status()).toBe('The saved media update is confirmed.');
  });

  it('rejects a live custom resolver before fetching or pinning misleading encoded metadata', async () => {
    runtime.resolvers[10] = STORE;
    await expect(readShopMediaState(project, project.chains[1], 7)).rejects.toThrow(/custom token URI resolver/);
    expect(fetch).not.toHaveBeenCalled(); expect(runtime.pinned).toEqual([]);
  });

  it('rejects a hook linked to a different local project', async () => {
    runtime.pids[10] = 12;
    await expect(readShopMediaState(project, project.chains[1], 7)).rejects.toThrow(/different project/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[9007199254740993n, 18n], [1n, 78n]])('rejects unrepresentable pricing currency %s / decimals %s before fetching metadata', async (currency, decimals) => {
    runtime.pricing[10] = [currency, decimals];
    await expect(readShopMediaState(project, project.chains[1], 7)).rejects.toThrow(/pricing identity/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an empty encoded URI with a useful recovery message', async () => {
    runtime.tiers[10].encodedIpfsUri = `0x${'00'.repeat(32)}`;
    await expect(readShopMediaState(project, project.chains[1], 7)).rejects.toThrow(/no encoded IPFS metadata/);
  });

  it('rejects unrelated conceptual names or immutable terms before uploads', async () => {
    const rows = await Promise.all(project.chains.map(chain => readShopMediaState(project, chain, 7)));
    expect(() => assertShopMediaSelection(rows, tier())).not.toThrow();
    expect(() => assertShopMediaSelection([rows[0], { ...rows[1], terms: 'different' }], tier())).toThrow(/different item/);
    expect(() => assertShopMediaSelection([rows[0], { ...rows[1], metadata: { name: 'Unrelated item' } }], tier())).toThrow(/different item/);
    expect(runtime.pinned).toEqual([]);
  });

  it('rechecks only the remaining direct leg after an earlier destination changed its media', async () => {
    const calls = await review(); runtime.tiers[8453].encodedIpfsUri = calls[0].args[6]; runtime.reads = [];
    await expect(reverifyShopMediaCalls(project, calls, 10, ACCOUNT)).resolves.toBeUndefined();
    expect(runtime.reads.every(read => read.cid === 10)).toBe(true);
    await expect(reverifyShopMediaCalls(project, calls, undefined, ACCOUNT)).rejects.toThrow(/no longer matches/);
  });

  it('rechecks live SET_721_METADATA permission on every selected destination', async () => {
    const calls = await review(); runtime.denied[10] = true;
    await expect(reverifyShopMediaCalls(project, calls, undefined, ACCOUNT)).rejects.toThrow(/SET_721_METADATA permission/);
    const permission = runtime.reads.find(read => read.functionName === 'hasPermission');
    expect(permission.args).toEqual([ACCOUNT, STORE, 99n, 25n, true, true]);
  });

  it('blocks malformed saved calldata and resolver changes before sending', async () => {
    const calls = await review();
    await expect(reverifyShopMediaCalls(project, [{ ...calls[0], data: '0x' }], 8453, ACCOUNT)).rejects.toThrow(/no longer matches/);
    runtime.resolvers[8453] = STORE;
    await expect(reverifyShopMediaCalls(project, calls, 8453, ACCOUNT)).rejects.toThrow(/custom token URI resolver/);
  });
});
