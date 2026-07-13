import { describe, expect, it } from 'vitest';
import { buildQueueRulesetConfigs, renderNfts, __test } from '../src/create-flow.js';

const { initState, itemDraft } = __test;

describe('shop item editor', () => {
  it('keeps split sales enabled when a positive price changes to another positive price', () => {
    const state = initState();
    const item = itemDraft();
    item.priceEth = '0.0001';
    item.splitOn = true;
    item.splitRecipients = [{ pct: '100', recip: '11', benef: '0x1111111111111111111111111111111111111111' }];
    state.shopEnabled = true;
    state.nfts = [item];

    let renders = 0;
    const root = renderNfts(state, () => { renders += 1; });
    const priceField = Array.from(root.querySelectorAll('.create-field')).find((field) => /Price/.test(field.textContent));
    const price = priceField.querySelector('input');
    price.value = '0.0002';
    price.dispatchEvent(new Event('input', { bubbles: true }));
    price.dispatchEvent(new Event('change', { bubbles: true }));

    expect(item.priceEth).toBe('0.0002');
    expect(item.splitOn).toBe(true);
    expect(item.splitRecipients).toHaveLength(1);
    expect(renders).toBe(0);
  });

  it('preserves add-to-balance payout splits in queued ruleset calldata', () => {
    const state = initState();
    state.chainIds = [1];
    state.accepts = ['eth'];
    state.stages[0].payoutMode = 'unlimited';
    state.stages[0].payoutRecipients = [{
      type: 'project', projectId: 11, address: '', percent: 100, preferAddToBalance: true,
    }];

    const [config] = buildQueueRulesetConfigs(state, 1, 0);
    const split = config.splitGroups.flatMap((group) => group.splits)[0];
    expect(split.projectId).toBe(11);
    expect(split.preferAddToBalance).toBe(true);
    expect(split.beneficiary).toBe('0x0000000000000000000000000000000000000000');
  });
});
