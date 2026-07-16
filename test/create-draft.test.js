import { describe, expect, it } from 'vitest';
import { createDraftObject, newCreateDraftState, parseCreateDraftJson } from '../src/create-flow.js';

describe('.jb draft interchange', () => {
  it('round-trips the existing plain .jb state into an editable, unconfirmed draft', () => {
    const state = newCreateDraftState();
    state.projectType = 'custom';
    state.network = 'testnet';
    state.chainIds = [84532];
    state.details.name = 'Clone me';
    state.details.ticker = 'CLONE';
    state.details.owner = '0x1111111111111111111111111111111111111111';
    state.stages[0].reservedRecipients = [{
      type: 'project', projectId: 8, address: '0x2222222222222222222222222222222222222222',
      percent: 25, amountEth: '', preferAddToBalance: false, lockedUntil: 0,
    }];
    state.tos = true;
    state.step = 4;

    const exported = createDraftObject(state);
    expect(exported.schema).toBeUndefined();
    expect(exported.details.name).toBe('Clone me');

    const imported = parseCreateDraftJson(JSON.stringify(exported));
    expect(imported.details).toMatchObject({ name: 'Clone me', ticker: 'CLONE' });
    expect(imported.chainIds).toEqual([84532]);
    expect(imported.stages[0].reservedRecipients[0]).toMatchObject({ type: 'project', projectId: 8, percent: 25 });
    expect(imported.step).toBe(0);
    expect(imported.tos).toBe(false);
  });

  it('imports legacy .jb items whose price field was named priceEth', () => {
    const state = newCreateDraftState();
    state.shopEnabled = true;
    const exported = createDraftObject(state);
    exported.nfts = [{ name: 'Old item', priceEth: '1.5' }];

    const imported = parseCreateDraftJson(JSON.stringify(exported));
    expect(imported.nfts[0].price).toBe('1.5');
    expect(imported.nfts[0].priceEth).toBeUndefined();
  });

  it('accepts the same .jb JSON from a fenced paste and strips unknown/transient fields', () => {
    const state = newCreateDraftState();
    state.details.name = 'Fenced';
    const raw = createDraftObject(state);
    raw.unknownRoot = 'do not import';
    raw._close = 'do not import';
    raw.details.unknownDetail = 'do not import';
    raw.deploying = true;
    raw.done = true;
    raw.deployed = { projectId: 99 };

    const imported = parseCreateDraftJson(`Review this draft:\n\n\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``);
    expect(imported.details.name).toBe('Fenced');
    expect(imported.unknownRoot).toBeUndefined();
    expect(imported._close).toBeUndefined();
    expect(imported.details.unknownDetail).toBeUndefined();
    expect(imported.deploying).toBe(false);
    expect(imported.done).toBe(false);
    expect(imported.deployed).toBeUndefined();
  });

  it('normalizes unsafe selections and rejects transaction JSON masquerading as a draft', () => {
    const state = createDraftObject(newCreateDraftState());
    state.network = 'mainnet';
    state.chainIds = [8453, 8453, 999999];
    state.accepts = ['eth', 'eth', 'not-a-token'];
    const imported = parseCreateDraftJson(state);
    expect(imported.chainIds).toEqual([8453]);
    expect(imported.accepts).toEqual(['eth']);

    expect(() => parseCreateDraftJson(JSON.stringify({
      action: 'Launch project', transactions: [{ address: '0x1111111111111111111111111111111111111111', calldata: '0x1234' }],
    }))).toThrow(/\.jb draft/);
  });
});
