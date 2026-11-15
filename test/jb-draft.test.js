// The shared .jb file (version 2) to and from the launch form. The strongest check here is the launch itself:
// a draft exported and read back must build, for every chain, exactly the call the form would have sent.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __test, createDraftObject, createStage, newCreateDraftState, parseCreateDraftJson } from '../src/create-flow.js';
import { shiftDecimal } from '../src/jb-draft.js';

const { buildLaunchArgs, buildRevnetArgs, itemDraft, pcAddrSet } = __test;
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const CAROL = '0x4444444444444444444444444444444444444444';
const TOKEN = '0x3333333333333333333333333333333333333333';
const SALT = '0x' + '00'.repeat(32);
const vectors = JSON.parse(readFileSync('test/fixtures/jb-draft-vectors.json', 'utf8'));
const example = (name) => structuredClone(vectors.find((vector) => vector.name === name).file);

const plain = (value) => JSON.stringify(value, (_, entry) => (typeof entry === 'bigint' ? entry.toString() + 'n' : entry));
const launchOf = (state) => plain(state.chainIds.map((chainId) => (state.projectType === 'revnet' ? buildRevnetArgs : buildLaunchArgs)(
  state, chainId, ALICE, 'ipfs://x', SALT, 2000000000).args));
const roundTrip = (state) => parseCreateDraftJson(JSON.stringify(createDraftObject(state)));

function wallet(extra) { return Object.assign({ type: 'wallet', address: ALICE, projectId: 0, percent: 0, amountEth: '' }, extra); }

function projectState() {
  const s = newCreateDraftState();
  s.projectType = 'custom'; s.network = 'testnet'; s.chainIds = [11155111, 84532];
  s.accepts = ['eth']; s.suckerType = 'both'; s.afterMode = 'terminal'; s.swapRouter = false;
  Object.assign(s.details, {
    name: 'Max', ticker: 'MAX', tagline: 'tag', description: 'desc', logoUri: 'ipfs://logo', coverImageUri: 'ipfs://cover',
    website: 'https://x.yz', twitter: 'x', discord: 'd', telegram: 't', instagram: 'i', whatsapp: 'w', tags: ['Art', 'DAO'],
    payDisclosure: 'Read this', owner: ALICE,
  });
  const first = createStage();
  Object.assign(first, {
    durationSeconds: 2592000, weight: '5000', weightCutPercent: 12.5, cashOutEnabled: true, cashOutTaxRate: 40,
    baseCurrency: 2, payoutMode: 'limited', payoutCurrency: 2, deadline: '3days', holdFees: true, allowOwnerMinting: true,
    pauseTransfers: true, pause721Transfers: true, allowSetTerminals: true, allowAddPriceFeed: true,
    surplusAllowanceOn: true, surplusAllowanceAmount: '3', surplusAllowanceCurrency: 1,
    scheduleOn: true, schedule: '2100000000',
  });
  first.payoutRecipients = [
    wallet({ amountEth: '1.5', lockedUntil: 2200000000 }),
    { type: 'project', projectId: 7, address: BOB, percent: 0, amountEth: '2', preferAddToBalance: true, lockedUntil: 0 },
  ];
  first.reservedRecipients = [
    wallet({ percent: 10 }),
    { type: 'customhook', projectId: 3, address: BOB, percent: 5.5, hookAddress: CAROL, lockedUntil: 0 },
    { type: 'lphook', address: '', projectId: 0, percent: 2, lockedUntil: 0 },
  ];
  const second = createStage();
  Object.assign(second, {
    durationSeconds: 3 * 3600, durationCustom: true, customDurVal: '3', customDurUnit: 'hours', weight: '100',
    startMode: 'date', startDate: '2300000000', payoutMode: 'unlimited', deadline: 'none', tokenMode: 'custom',
  });
  second.payoutRecipients = [wallet({ percent: 60 })];
  const third = createStage();
  Object.assign(third, { durationSeconds: 604800, tokenMode: 'none', startMode: 'cycles', startCycles: '2', pausePay: true });
  s.stages = [first, second, third];

  const item = itemDraft();
  Object.assign(item, {
    name: 'Thing', description: 'A thing', imageUri: 'ipfs://img', mediaType: 'image/png', price: '2', limited: true, supply: '100',
    category: 3, splitOn: true, splitRecipients: [{ pct: '10', recip: BOB, benef: '' }], discountOn: true, discountPct: '25',
    reserveOn: true, reserveFrequency: '10', reserveBeneficiary: ALICE,
    flags: { allowOwnerMint: true, transfersPausable: true, cantBeRemoved: true, allowCredits: false, ownerCanEditDiscount: false },
  });
  const second721 = itemDraft();
  Object.assign(second721, { name: 'Other', price: '1' });
  s.shopEnabled = true; s.nfts = [item, second721]; s.storeCategories = [{ id: 3, name: 'Rares' }];
  Object.assign(s.collection, { name: 'Col', symbol: 'COL', nameTouched: true, symbolTouched: true, preventOverspending: true, issueTokensForSplits: true });

  pcAddrSet(s, 84532, 'owner', BOB);
  pcAddrSet(s, 84532, 'p:0:0', BOB);
  pcAddrSet(s, 84532, 'ppid:0:1', '12');
  pcAddrSet(s, 84532, 'pamt:0:0', '2.5');
  pcAddrSet(s, 84532, 'r:0:0', CAROL);
  pcAddrSet(s, 84532, 'rpid:0:1', '9');
  pcAddrSet(s, 84532, 'isup:0', '7');
  pcAddrSet(s, 84532, 'rb:0', BOB);
  pcAddrSet(s, 84532, 'is:0:0', CAROL);
  s.perChain[8453].items[1] = { include: false };
  return s;
}

function tokenProjectState() {
  const s = newCreateDraftState();
  s.projectType = 'custom'; s.network = 'mainnet'; s.chainIds = [1, 8453]; s.accepts = ['eth', 'usdc'];
  Object.assign(s.details, { name: 'Two tokens', ticker: 'TWO', owner: ALICE });
  s.storePricingCurrency = 2;
  const stage = createStage();
  Object.assign(stage, { durationSeconds: 604800, baseCurrency: 2, payoutCurrency: 2, surplusAllowanceCurrency: 2, surplusAllowanceOn: true });
  stage.payoutByKind = {
    eth: { mode: 'limited', recipients: [wallet({ amountEth: '1.5' })] },
    usdc: { mode: 'unlimited', recipients: [wallet({ address: BOB, percent: 40 })] },
  };
  s.stages = [stage];
  pcAddrSet(s, 8453, 'pkamt:eth:0', '4');
  pcAddrSet(s, 8453, 'pk:usdc:0', CAROL);
  return s;
}

const TOKEN_ID = Number(BigInt(TOKEN) & 0xffffffffn);
function customTokenState() {
  const state = newCreateDraftState();
  state.network = 'mainnet'; state.chainIds = [1]; state.accepts = ['custom'];
  Object.assign(state.customToken, { address: TOKEN, symbol: 'TKN', decimals: 6, status: 'ok' });
  state.storePricingCurrency = TOKEN_ID;
  Object.assign(state.stages[0], { baseCurrency: TOKEN_ID, payoutCurrency: TOKEN_ID, surplusAllowanceCurrency: TOKEN_ID, allowAddPriceFeed: true });
  state.stages[0].payoutByKind = { custom: { mode: 'limited', recipients: [wallet({ amountEth: '5' })] } };
  return state;
}

function revnetState() {
  const s = newCreateDraftState();
  s.projectType = 'revnet'; s.network = 'mainnet'; s.chainIds = [1, 8453]; s.accepts = ['eth']; s.revBaseCurrency = 2;
  Object.assign(s.details, { name: 'Rev', ticker: 'REV' });
  s.revOperator = ALICE;
  const first = createStage();
  Object.assign(first, { weight: '1000', issuanceCutOn: true, weightCutPercent: 10, cutFreqDays: '30', cashOutTaxRate: 12.34 });
  first.reservedRecipients = [wallet({ percent: 30 })];
  first.autoIssuances = [{ count: '600', address: ALICE, chainId: 1 }, { count: '400', address: BOB, chainId: 8453 }];
  const second = createStage();
  Object.assign(second, { weight: '', issuanceCutOn: false, cashOutTaxRate: 50, startDaysAfter: '90' });
  s.stages = [first, second];
  pcAddrSet(s, 8453, 'op', BOB);
  pcAddrSet(s, 8453, 'r:0:0', CAROL);
  pcAddrSet(s, 8453, 'ai:0:1', CAROL);
  Object.assign(s.collection, { opCanMint: false });
  return s;
}

describe('the shared .jb file on Juicescan', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(1900000000000)); });
  afterEach(() => { vi.useRealTimers(); });

  it.each([
    ['a project with every rule', projectState],
    ['a project paying out by token', tokenProjectState],
    ['a revnet', revnetState],
  ])('%s launches the same after export and import', (_, build) => {
    const state = build();
    const back = roundTrip(state);
    expect(launchOf(back)).toBe(launchOf(state));
    // Read and written again, the file says the same thing.
    expect(createDraftObject(back)).toEqual(createDraftObject(state));
    expect(back.step).toBe(0);
    expect(back.tos).toBe(false);
  });

  it('writes plain units: a 0 to 1 tax, percents, seconds, real chain ids', () => {
    const file = createDraftObject(projectState());
    expect(file).toMatchObject({
      v: 2, kind: 'project', name: 'Max', ticker: 'MAX', chains: [11155111, 84532], bridge: 'both', anyToken: false,
      owner: ALICE, ownerPerChain: { 84532: BOB }, afterMode: 'terminal',
      links: { instagram: 'i', whatsapp: 'w' },
    });
    expect(file.stages[0]).toMatchObject({
      startAt: 2100000000, duration: 2592000, issuance: '5000', baseCurrency: 'usd', cutPercent: '12.5', cashOutTax: '0.4',
      approval: '3days', surplusAllowance: { mode: 'limited', amount: '3', currency: 'eth' },
    });
    expect(file.stages[0].payouts[0]).toMatchObject({ token: 'eth', mode: 'amounts', currency: 'usd' });
    expect(file.stages[0].payouts[0].splits[0]).toMatchObject({
      to: 'address', amount: '1.5', amountPerChain: { 84532: '2.5' }, addressPerChain: { 84532: BOB }, lockedUntil: 2200000000,
    });
    expect(file.stages[0].reserved.map((row) => row.to)).toEqual(['address', 'hook', 'fundMarket']);
    expect(file.stages[1]).toMatchObject({ startAt: 2300000000, startAfterCycles: '', duration: 10800 });
    expect(file.stages[2]).toMatchObject({ startAfterCycles: '2', issuance: '0', cashOutTax: '1' });
    expect(file.shop.items[0]).toMatchObject({ supply: '100', supplyPerChain: { 84532: '7' }, reserveEvery: '10' });
    expect(file.shop.items[1].excludedChains).toEqual([84532]);

    const revnet = createDraftObject(revnetState());
    expect(revnet).toMatchObject({ kind: 'revnet', owner: ALICE, ownerPerChain: { 8453: BOB } });
    expect(revnet.stages[0]).toMatchObject({ cutPercent: '10', cutDays: '30', cashOutTax: '0.1234', baseCurrency: 'usd' });
    expect(revnet.stages[0].autoIssuances).toEqual([
      { count: '600', address: ALICE, chainId: 1 },
      { count: '400', address: CAROL, chainId: 8453 },
    ]);
    expect(revnet.stages[1]).toMatchObject({ startAfterDays: '90', issuance: '', cutDays: '' });
  });

  it('reads the examples the other two sites publish', () => {
    const project = parseCreateDraftJson(example("juicebox.money's example"));
    expect(project).toMatchObject({ projectType: 'custom', network: 'mainnet', chainIds: [8453] });
    expect(project.stages[0]).toMatchObject({ weight: '10000', cashOutEnabled: true, cashOutTaxRate: 10, deadline: '1day' });
    const revnet = parseCreateDraftJson(example("revnet.money's example"));
    expect(revnet).toMatchObject({ projectType: 'revnet', chainIds: [8453] });
    expect(revnet.stages.map((stage) => stage.cashOutTaxRate)).toEqual([20, 50, 50]);
    expect(revnet.stages[1]).toMatchObject({ weight: '', startDaysAfter: '365', cutFreqDays: '90', weightCutPercent: 5 });
    expect(revnet.stages[2]).toMatchObject({ weight: '0', issuanceCutOn: false });
  });

  it('reads a fenced paste, and refuses older files and other JSON by name', () => {
    const file = createDraftObject(projectState());
    expect(parseCreateDraftJson('Review this:\n\n```json\n' + JSON.stringify(file) + '\n```').details.name).toBe('Max');
    const older = 'This .jb file was saved in a format this site no longer reads. Export it again from the site it came from.';
    expect(() => parseCreateDraftJson(JSON.stringify({ projectType: 'custom', details: {}, stages: [], chainIds: [] }))).toThrow(older);
    expect(() => parseCreateDraftJson(JSON.stringify({ v: 1, flavor: 'revnet', name: 'X', chains: [1], stages: [{}] }))).toThrow(older);
    expect(() => parseCreateDraftJson(JSON.stringify({ action: 'Launch project', transactions: [{ calldata: '0x1234' }] }))).toThrow(older);
    expect(() => parseCreateDraftJson('not json')).toThrow('No Juicebox V6 .jb draft was found');
    expect(() => parseCreateDraftJson('')).toThrow('Paste .jb JSON first.');
    expect(() => parseCreateDraftJson(JSON.stringify({ ...file, unknownRoot: 1 }))).toThrow("draft.unknownRoot isn't valid");
  });

  it('writes what the launch sends where the launch overrides the form', () => {
    const state = projectState();
    Object.assign(state.stages[1], { cashOutEnabled: true, cashOutTaxRate: 20 });
    Object.assign(state.stages[2], { durationSeconds: 4294967295, deadline: '3days' });
    const file = createDraftObject(state);
    expect(file.stages[1].cashOutTax).toBe('1');
    expect(file.stages[2].approval).toBe('none');
    expect(launchOf(parseCreateDraftJson(JSON.stringify(file)))).toBe(launchOf(state));
    const custom = customTokenState();
    custom.stages[0].allowAddPriceFeed = false;
    expect(createDraftObject(custom).stages[0].powers.addPriceFeed).toBe(true);
    state.stages[0].weight = '1e3';
    expect(() => createDraftObject(state)).toThrow("This draft has a number a .jb file can't hold: 1e3.");
  });

  it('gives each reserved item its own beneficiary', () => {
    const state = projectState();
    const tiers = __test.build721Config(state, 'ipfs://x', 11155111).tiersConfig.tiers;
    expect(tiers.length).toBeGreaterThan(0);
    expect(tiers.every((tier) => tier.flags.useReserveBeneficiaryAsDefault === false)).toBe(true);
  });

  it('launches no items once the shop is switched off, as the file says', () => {
    const state = projectState();
    state.shopEnabled = false;
    expect(createDraftObject(state).shop.items).toEqual([]);
    expect(__test.build721Config(state, 'ipfs://x', 11155111).tiersConfig.tiers).toEqual([]);
    expect(launchOf(roundTrip(state))).toBe(launchOf(state));
    // Item cash outs chosen before the shop was switched off no longer reach the launch either.
    state.collection.useForRedemptions = true;
    Object.assign(state.stages[0], { cashOutEnabled: true, cashOutTaxRate: 20 });
    expect(launchOf(state)).not.toContain('"useDataHookForCashOut":true');
    expect(launchOf(roundTrip(state))).toBe(launchOf(state));
  });

  it('refuses an amount finer than a custom token holds, never rounds it', () => {
    const state = customTokenState();
    state.stages[0].payoutByKind.custom.recipients[0].amountEth = '0.0000015';
    expect(() => buildLaunchArgs(state, 1, ALICE, 'ipfs://x', SALT, 2000000000)).toThrow('0.0000015 has more decimal places than its token holds.');
  });

  it('carries a Sticky split as the distributor hook, its token and its group', () => {
    const DISTRIBUTOR = '0x489d011dc34983eb2e219a5010806caa418cb46b';
    const state = revnetState();
    // The fixture gives the first reserved slot a per-chain address, and a slot that differs by chain is never Sticky.
    state.stages[0].reservedRecipients = [
      wallet({ type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 0, percent: 1 }),
      wallet({ type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 4052, percent: 10 }),
      wallet({ type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 0, percent: 5 }),
      // A group the distributor would reroute is not a Sticky row: it stays the hook row it is.
      wallet({ type: 'customhook', hookAddress: DISTRIBUTOR, address: TOKEN, projectId: 52004, percent: 5 }),
    ];
    const rows = createDraftObject(state).stages[0].reserved;
    expect(rows[0].to).toBe('hook');
    expect(rows.slice(1).map((row) => [row.to, row.address, row.hook, row.projectId, row.sticky])).toEqual([
      ['sticky', TOKEN, '', '', { group: 'tenure', minWeeks: '4', maxWeeks: '52' }],
      ['sticky', TOKEN, '', '', { group: 'all', minWeeks: '', maxWeeks: '' }],
      ['hook', TOKEN, DISTRIBUTOR, '52004', null],
    ]);
    const back = roundTrip(state);
    expect(back.stages[0].reservedRecipients.slice(1).map((row) => [row.type, row.hookAddress, row.address, row.projectId])).toEqual([
      ['customhook', DISTRIBUTOR, TOKEN, 4052], ['customhook', DISTRIBUTOR, TOKEN, 0], ['customhook', DISTRIBUTOR, TOKEN, 52004],
    ]);
    expect(launchOf(back)).toBe(launchOf(state));
    expect(launchOf(state)).toContain(DISTRIBUTOR);
    // Weeks the form refused are written as typed, so the file is refused, never read as the last valid group.
    state.stages[0].reservedRecipients[1] = Object.assign(state.stages[0].reservedRecipients[1], { projectId: 4000, stickyError: 'Maximum weeks can\'t be less than minimum weeks.', stickyWeeks: { tenure: true, min: '4', max: '2', hasMax: true } });
    expect(createDraftObject(state).stages[0].reserved[1].sticky).toEqual({ group: 'tenure', minWeeks: '4', maxWeeks: '2' });
    expect(() => roundTrip(state)).toThrow("Juicescan can't launch this file: it has a Sticky split whose weeks are not a group.");
  });

  it('refuses a file holding what this form cannot express, whole', () => {
    const cant = (what) => "Juicescan can't launch this file: it has " + what + '.';
    const project = (patch, stagePatch) => {
      const file = createDraftObject(projectState());
      Object.assign(file, patch);
      if (stagePatch) Object.assign(file.stages[0], stagePatch);
      return () => parseCreateDraftJson(file);
    };
    const row = (extra) => Object.assign({ to: 'address', share: '10', address: ALICE }, extra);
    expect(project({ chains: [] })).toThrow(cant('no chain chosen'));
    expect(project({ chains: [137], ownerPerChain: {} })).toThrow(cant('a chain this site does not launch on'));
    expect(project({ chains: [1, 84532] })).toThrow(cant('mainnets and testnets together'));
    expect(project({ linkChains: false })).toThrow(cant('chains that are not linked'));
    expect(project({ ownerPerChain: { 1: BOB } })).toThrow(cant('a value for a chain it does not launch on'));
    expect(project({}, { payouts: [{ token: 'eth', mode: 'all', currency: 'eth', splits: [row({ to: 'sticky', sticky: { group: 'tenure', minWeeks: '52', maxWeeks: '4' } })] }] }))
      .toThrow(cant('a Sticky split whose weeks are not a group'));
    expect(project({}, { duration: 0, reserved: [row({ lockedUntil: 2200000000 })], payouts: [{ token: 'eth', mode: 'none', currency: 'eth', splits: [] }] }))
      .toThrow(cant('a locked split in a stage with no cycle'));
    expect(project({}, { duration: 4294967295 })).toThrow(cant('an approval rule on a stage that never ends'));
    expect(project({}, { payouts: [{ token: 'eth', mode: 'all', currency: 'eth', splits: [] }], surplusAllowance: { mode: 'none', amount: '', currency: 'eth' } }))
      .toThrow(cant('a cash out tax under 1 beside payouts of everything'));
    const feedless = createDraftObject(customTokenState());
    feedless.stages[0].powers.addPriceFeed = false;
    expect(() => parseCreateDraftJson(feedless)).toThrow(cant('a custom token without the power to add price feeds'));
    const staged = createDraftObject(tokenProjectState());
    staged.stages.push({ ...structuredClone(staged.stages[0]), startAfterCycles: '1' });
    expect(() => parseCreateDraftJson(structuredClone(staged))).not.toThrow();
    staged.stages[1].payouts[0].splits[0].amountPerChain = { 8453: '5' };
    expect(() => parseCreateDraftJson(staged)).toThrow(cant('per-chain payout values that differ by stage'));
    const later = createDraftObject(projectState());
    later.stages[1].issuance = '';
    expect(() => parseCreateDraftJson(later)).toThrow(cant('a later stage that keeps the issuance before it'));
    const voting = createDraftObject(projectState());
    voting.shop.items[0].votingUnits = '5';
    expect(() => parseCreateDraftJson(voting)).toThrow(cant('a shop item with voting units'));
    const item = (edit) => { const file = createDraftObject(projectState()); edit(file.shop.items[0], file); return () => parseCreateDraftJson(file); };
    expect(item((entry) => { entry.metadataUri = 'ipfs://meta'; })).toThrow(cant('a shop item with its own metadata file'));
    expect(item((entry) => { entry.splits = [row({ address: '', addressPerChain: { 84532: ALICE } })]; }))
      .toThrow(cant('a shop item split with no address for every chain'));
    expect(item((entry) => { entry.splits = [row({ address: 'vitalik.eth' })]; })).toThrow(cant('a shop item split given as a name'));
    const oneChain = createDraftObject(customTokenState());
    Object.assign(oneChain.shop, { collectionName: 'Shop', collectionSymbol: 'SHOP', items: [{ name: 'Item', price: '1', splits: [{ to: 'project', share: '10', projectId: '7', address: 'vitalik.eth' }] }] });
    expect(() => parseCreateDraftJson(oneChain)).toThrow(cant('a shop item split given as a name'));
    expect(item((entry, file) => { file.shop.itemsRedeem = true; file.shop.items.forEach((each) => { each.excludedChains = [84532]; }); }))
      .toThrow(cant('shop items that cash out on a chain with no items'));
    expect(project({}, { reserved: [row({ addressPerChain: { 84532: 'vitalik.eth' } })] })).toThrow(cant('a per-chain address given as a name'));
    const perChain = createDraftObject(projectState());
    perChain.shop.items[0].supplyPerChain = { 84532: 'unlimited' };
    expect(() => parseCreateDraftJson(perChain)).toThrow(cant('a shop item unlimited on one chain only'));

    // With USDC accepted everything counts in USD, so the form would re-price this file. It is refused instead.
    const usdc = createDraftObject(Object.assign(tokenProjectState(), {}));
    usdc.stages[0].baseCurrency = 'eth';
    expect(() => parseCreateDraftJson(usdc)).toThrow(cant('issuance not counted in USD while USDC is accepted'));
    const byToken = createDraftObject(tokenProjectState());
    byToken.stages[0].payouts[0].currency = 'usd';
    expect(() => parseCreateDraftJson(byToken)).toThrow(cant('payouts counted in another currency than their token'));
    byToken.stages[0].payouts[0].currency = 'eth';
    byToken.stages[0].surplusAllowance = { mode: 'limited', amount: '1', currency: 'usd' };
    expect(() => parseCreateDraftJson(byToken)).toThrow(cant('a limited owner allowance beside payouts by token'));

    const revnet = (edit) => { const file = createDraftObject(revnetState()); edit(file); return () => parseCreateDraftJson(file); };
    expect(revnet((file) => { file.stages[0].reserved[0].lockedUntil = 2200000000; })).toThrow(cant('a locked split'));
    expect(revnet((file) => { file.stages[1].startAfterDays = '0.5'; })).toThrow(cant('a later stage that starts less than a day after the one before'));
  });

  it('shows a cycle length that is no preset as a custom one', () => {
    const file = createDraftObject(projectState());
    file.stages[0].duration = 5 * 86400;
    file.stages[1].duration = 90061;
    const back = parseCreateDraftJson(file);
    expect(back.stages[0]).toMatchObject({ durationSeconds: 432000, durationCustom: true, customDurVal: '5', customDurUnit: 'days' });
    expect(back.stages[1]).toMatchObject({ durationSeconds: 90061, durationCustom: true, customDurUnit: 'hours' });
    expect(createDraftObject(back).stages.map((stage) => stage.duration)).toEqual([432000, 90061, 604800]);
  });

  it('reads a custom token by its address only', () => {
    const state = customTokenState();
    const id = TOKEN_ID;
    const file = createDraftObject(state);
    expect(file).toMatchObject({ accepts: ['custom'], customToken: TOKEN, shop: { currency: 'token' } });
    expect(file.stages[0]).toMatchObject({ baseCurrency: 'token', payouts: [{ token: 'custom', mode: 'amounts', currency: 'token' }] });
    const back = parseCreateDraftJson(file);
    expect(back.stages[0].baseCurrency).toBe(id);
    expect(back.customToken.address).toBe(TOKEN);
    expect(createDraftObject(back)).toEqual(file);
    expect(() => parseCreateDraftJson({ ...file, customToken: 'token.eth' }))
      .toThrow('a custom token named by something other than its address');
  });

  it('moves a decimal point without a float', () => {
    expect(shiftDecimal('20', -2)).toBe('0.2');
    expect(shiftDecimal('12.34', -2)).toBe('0.1234');
    expect(shiftDecimal('0.1234', 2)).toBe('12.34');
    expect(shiftDecimal('100', -2)).toBe('1');
    expect(shiftDecimal('0', 2)).toBe('0');
  });
});

describe('a new Safe as the owner or operator', () => {
  const withSafe = (state) => {
    state.authoritySafe = { on: true, signers: [ALICE, BOB, CAROL], threshold: 2 };
    if (state.projectType === 'revnet') state.revOperator = ''; else state.details.owner = '';
    return state;
  };

  it('is written in place of an address, and read back as the same signers and approvals', () => {
    for (const make of [projectState, revnetState]) {
      const file = createDraftObject(withSafe(make()));
      expect(file.safe).toEqual({ signers: [ALICE, BOB, CAROL], threshold: 2 });
      expect(file.owner).toBe('');
      expect(file.ownerPerChain).toEqual({});
      const back = parseCreateDraftJson(JSON.stringify(file));
      expect(back.authoritySafe).toEqual({ on: true, signers: [ALICE, BOB, CAROL], threshold: 2 });
      expect(createDraftObject(back).safe).toEqual(file.safe);
    }
  });

  it('is not written when the owner is switched off, and a file without one turns it off', () => {
    const off = withSafe(projectState());
    off.details.owner = '0xdead000000000000000000000000000000000000';
    expect(createDraftObject(off).safe).toBe(null);
    expect(roundTrip(projectState()).authoritySafe.on).toBe(false);
  });

  it('launches with the Safe as owner on every chain, over a per-chain owner', () => {
    const SAFE = '0x5555555555555555555555555555555555555555';
    const project = withSafe(projectState());
    pcAddrSet(project, project.chainIds[1], 'owner', BOB);
    project.chainIds.forEach((chainId) => {
      expect(buildLaunchArgs(project, chainId, SAFE, 'ipfs://x', SALT, 2000000000).args[0]).toBe(SAFE);
    });
    const revnet = withSafe(revnetState());
    pcAddrSet(revnet, revnet.chainIds[0], 'op', BOB);
    revnet.chainIds.forEach((chainId) => {
      expect(buildRevnetArgs(revnet, chainId, SAFE, 'ipfs://x', SALT, 2000000000).args[1].operator).toBe(SAFE);
    });
  });
});
