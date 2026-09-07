import { beforeEach, describe, expect, it } from 'vitest';
import { chooseRelayrPayment, relayrReceiptStateLabel, renderRelayrReceiptInto } from '../src/relayr-ui.js';
import { relayrPaymentOptions, RELAYR_NATIVE_TOKEN, RELAYR_PAYMENT_ADDRESS, RELAYR_PAYMENT_SELECTOR } from '../src/relayr.js';

function paymentQuote() {
  const bundleUuid = '01234567-89ab-cdef-0123-456789abcdef';
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  return { bundle_uuid: bundleUuid, expected_transactions: [{ chain: 1 }, { chain: 8453 }], payment_info: [
    { chain: 8453, amount: '2000000000000000' },
    { chain: 1, amount: '1000000000000000' },
    { chain: 10, amount: '1000000000000000' },
  ].map(payment => ({ ...payment, target: RELAYR_PAYMENT_ADDRESS, token: RELAYR_NATIVE_TOKEN,
    payment_deadline: String(deadline),
    calldata: RELAYR_PAYMENT_SELECTOR + bundleUuid.replace(/-/g, '').padEnd(64, '0') + BigInt(deadline).toString(16).padStart(64, '0'),
  })) };
}

describe('Relayr funding-chain choice', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('requires an explicit choice and preserves the selected exact quote independently of its input object', async () => {
    const quote = paymentQuote();
    const chosen = chooseRelayrPayment(quote);
    const select = document.querySelector('select[aria-label="Payment chain"]');
    const next = document.querySelector('.create-btn.primary');
    expect(next.disabled).toBe(true);
    expect(select.value).toBe('');
    expect([...select.options].map(option => option.textContent)).toEqual([
      'Choose a chain', 'Ethereum — 0.001 ETH', 'Optimism — 0.001 ETH', 'Base — 0.002 ETH',
    ]);
    next.dispatchEvent(new Event('click'));
    expect(document.querySelector('dialog')).not.toBeNull();
    select.value = '2'; select.dispatchEvent(new Event('change'));
    expect(next.disabled).toBe(false);
    quote.payment_info[0].amount = '999999999999999999';
    next.click();
    const payment = await chosen;
    expect(payment).toMatchObject({ chain: 8453, amount: '2000000000000000' });
    expect(Object.isFrozen(payment)).toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it.each(['Cancel', 'Close', 'Escape'])('cancels without choosing a payment through %s', async method => {
    const chosen = chooseRelayrPayment(paymentQuote());
    if (method === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else if (method === 'Close') document.querySelector('[aria-label="Close"]').click();
    else document.querySelector('.create-btn.ghost').click();
    await expect(chosen).resolves.toBeNull();
  });

  it('rejects invalid or absent options before showing a choice', () => {
    expect(() => chooseRelayrPayment({ payment_info: [] })).toThrow(/no payment option/);
    expect(() => relayrPaymentOptions(null)).toThrow(/no payment option/);
    const quote = paymentQuote(); quote.payment_info[0].target = '0x3333333333333333333333333333333333333333';
    expect(() => chooseRelayrPayment(quote)).toThrow(/unrecognized payment contract/);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it.each([
    [[11155111, 84532], [11155111, 84532]],
    [[1, 8453], [1]],
  ])('offers only funding in the destination network family %j', async (destinations, expected) => {
    const quote = paymentQuote();
    quote.expected_transactions = destinations.map(chain => ({ chain }));
    quote.payment_info = [1, 11155111, 84532].map((chain, index) => ({ ...quote.payment_info[0], chain, amount: String(index + 1) }));
    expect(relayrPaymentOptions(quote).map(payment => payment.chain)).toEqual(expected);
    const chosen = chooseRelayrPayment(quote);
    const select = document.querySelector('select[aria-label="Payment chain"]');
    expect(select.options).toHaveLength(expected.length + 1);
    expect(select.value).toBe('');
    document.querySelector('.create-btn.ghost').click();
    await expect(chosen).resolves.toBeNull();
  });

  it('rejects missing or mixed destinations and a testnet quote offering only real mainnet ETH', () => {
    const quote = paymentQuote();
    quote.expected_transactions = [{ chain: 11155111 }, { chain: 84532 }];
    expect(() => chooseRelayrPayment(quote)).toThrow(/no payment option in the destination network family/);
    quote.expected_transactions = [{ chain: 1 }, { chain: 84532 }];
    expect(() => chooseRelayrPayment(quote)).toThrow(/one supported network family/);
    delete quote.expected_transactions;
    expect(() => chooseRelayrPayment(quote)).toThrow(/identify destinations/);
    expect(document.querySelector('dialog')).toBeNull();
  });
});

describe('Relayr paid-receipt UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="receipt"></div>';
  });

  it('normalizes terminal and pending states without treating unknown states as success', () => {
    expect(relayrReceiptStateLabel({ status: { state: 'Success' } })).toEqual({ text: 'Relayr reported success — verifying', kind: 'pending' });
    expect(relayrReceiptStateLabel({ status: { state: 'Completed' } }, true)).toEqual({ text: 'Confirmed', kind: 'ok' });
    expect(relayrReceiptStateLabel({ status: { state: 'Failed' } })).toEqual({ text: 'Failed', kind: 'err' });
    expect(relayrReceiptStateLabel({ status: { state: 'Included' } })).toEqual({ text: 'Included', kind: 'pending' });
    expect(relayrReceiptStateLabel(null)).toEqual({ text: 'Waiting for Relayr', kind: 'pending' });
  });

  it('renders exact progress, safe links, chain fallbacks, and attacker-controlled text as text', () => {
    const panel = document.querySelector('#receipt');
    const paymentHash = `0x${'11'.repeat(32)}`;
    const destinationHash = `0x${'22'.repeat(32)}`;
    const progress = renderRelayrReceiptInto(panel, {
      bundleUuid: '<img src=x onerror=alert(1)>',
      paymentHash,
      paymentChainId: 8453,
      expectedCount: 3,
      chains: [
        { id: 8453, name: 'Base' },
        { id: 10 },
      ],
      records: [
        { status: { state: 'Success', data: { hash: destinationHash } } },
        { status: { state: 'Failed' } },
      ],
    }, {
      chainNameOf: id => `Chain ${id}`,
      noteText: '<script>unsafe()</script>',
    });

    expect(progress).toEqual({ confirmed: 1, failed: 1, pending: 1, total: 3, allFailed: false });
    expect(panel.querySelector('.relayr-pending-count').textContent).toBe('1/3 reported complete');
    expect(panel.querySelectorAll('.relayr-pending-chain')).toHaveLength(3);
    expect([...panel.querySelectorAll('.relayr-pending-chain > span:first-child')].map(node => node.textContent))
      .toEqual(['Base', 'Chain 10', 'Chain 3']);
    expect(panel.querySelector('code').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('.relayr-pending-note').textContent).toBe('<script>unsafe()</script>');
    for (const link of panel.querySelectorAll('a[target="_blank"]')) {
      expect(link.rel).toContain('noopener');
      expect(link.href).toMatch(/^https:\/\//);
    }
  });

  it('supports caller-specific state wording without creating a payment link on unknown chains', () => {
    const panel = document.querySelector('#receipt');
    renderRelayrReceiptInto(panel, {
      bundleUuid: 'bundle',
      paymentHash: `0x${'33'.repeat(32)}`,
      paymentChainId: 999999,
      records: [{ status: { state: 'Pending' } }],
      expectedCount: 1,
    }, {
      stateLabel: () => ({ text: 'Still executing', kind: 'pending' }),
    });

    expect(panel.querySelector('.relayr-pending-chain-state').textContent).toBe('Still executing');
    expect(panel.querySelector('.relayr-pending-meta a')).toBeNull();
  });
});
