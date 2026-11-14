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

  it('refuses a file holding what this form cannot express, whole', () => {
    const cant = (what) => "Juicescan can't launch this file: it has " + what + '.';
    const project = (patch, stagePatch) => {
      const file = createDraftObject(projectState());
      Object.assign(file, patch);
      if (stagePatch) Object.assign(file.stages[0], stagePatch);
      return () => parseCreateDraftJson(file);
    };
    const row = (extra) => Object.assign({ to: 'address', share: '10', address: ALICE }, extra);
    expect(project({ safe: { signers: [ALICE], threshold: 1 } })).toThrow(cant('a new Safe as the owner'));
    expect(project({ chains: [] })).toThrow(cant('no chain chosen'));
    expect(project({ chains: [137], ownerPerChain: {} })).toThrow(cant('a chain this site does not launch on'));
    expect(project({ chains: [1, 84532] })).toThrow(cant('mainnets and testnets together'));
    expect(project({ linkChains: false })).toThrow(cant('chains that are not linked'));
    expect(project({ ownerPerChain: { 1: BOB } })).toThrow(cant('a value for a chain it does not launch on'));
    expect(project({}, { reserved: [row({ to: 'sticky', sticky: { group: 'all', minWeeks: '', maxWeeks: '' } })] })).toThrow(cant('a Sticky split'));
    expect(project({}, { duration: 0, reserved: [row({ lockedUntil: 2200000000 })], payouts: [{ token: 'eth', mode: 'none', currency: 'eth', splits: [] }] }))
      .toThrow(cant('a locked split in a stage with no cycle'));
    expect(project({}, { cashOutTax: '1.5' })).toThrow(cant('a cash out tax above 1'));
    const later = createDraftObject(projectState());
    later.stages[1].issuance = '';
    expect(() => parseCreateDraftJson(later)).toThrow(cant('a later stage that keeps the issuance before it'));
    const voting = createDraftObject(projectState());
    voting.shop.items[0].votingUnits = '5';
    expect(() => parseCreateDraftJson(voting)).toThrow(cant('a shop item with voting units'));
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
    expect(revnet((file) => { file.safe = { signers: [ALICE], threshold: 1 }; })).toThrow(cant('a new Safe as the operator'));
    expect(revnet((file) => { file.stages[0].reserved[0].lockedUntil = 2200000000; })).toThrow(cant('a locked split'));
    expect(revnet((file) => { file.stages[1].startAfterDays = '0.5'; })).toThrow(cant('a later stage that starts less than a day after the one before'));
    expect(revnet((file) => { file.stages[0].autoIssuances[0].chainId = 10; })).toThrow(cant('an auto issuance on a chain it does not launch on'));
    expect(revnet((file) => { file.shop.issueTokensForSplits = true; })).toThrow(cant('shop splits that issue tokens'));
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
    const state = newCreateDraftState();
    state.network = 'mainnet'; state.chainIds = [1]; state.accepts = ['custom'];
    Object.assign(state.customToken, { address: TOKEN, symbol: 'TKN', decimals: 6, status: 'ok' });
    const id = Number(BigInt(TOKEN) & 0xffffffffn);
    state.storePricingCurrency = id;
    Object.assign(state.stages[0], { baseCurrency: id, payoutCurrency: id, surplusAllowanceCurrency: id, allowAddPriceFeed: true });
    state.stages[0].payoutByKind = { custom: { mode: 'limited', recipients: [wallet({ amountEth: '5' })] } };
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
