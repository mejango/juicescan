import { beforeEach, describe, expect, it, vi } from 'vitest';

const payState = vi.hoisted(() => ({
  NATIVE: '0x000000000000000000000000000000000000eeee',
  ROUTER: '0x1111111111111111111111111111111111111111',
  TERMINAL: '0x2222222222222222222222222222222222222222',
  BENEFICIARY: '0x3333333333333333333333333333333333333333',
  execute: vi.fn(),
  preview: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('../src/component-base.js', () => ({
  el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  },
  parseHashDefaults: () => ({ projectId: '7', chain: '1', amount: '1' }),
  discoverChains: (_projectId, callback) => callback([1]),
  createProjectAndChainInput: () => {
    const node = document.createElement('div');
    node.className = 'project-chain-input';
    return node;
  },
  createComponentWrapper: title => {
    const wrapper = document.createElement('section');
    const body = document.createElement('div');
    wrapper.dataset.title = title;
    wrapper.appendChild(body);
    return { wrapper, body };
  },
  executeTransaction: payState.execute,
  getBeneficiaryAddress: () => payState.BENEFICIARY,
  firstChainForNetwork: () => 1,
  createPublicClientForChain: () => ({ readContract: vi.fn().mockRejectedValue(new Error('no contexts')) }),
  getChainTokens: () => [
    { address: payState.NATIVE, symbol: 'ETH', decimals: 18 },
    { address: '0x4444444444444444444444444444444444444444', symbol: 'USDC', decimals: 6 },
  ],
  parseAmount: value => BigInt(value) * 10n ** 18n,
  renderError: message => {
    const node = document.createElement('div');
    node.className = 'error-box';
    node.textContent = message;
    return node;
  },
  getAddress: (name) => name === 'JBRouterTerminalRegistry' ? payState.ROUTER : payState.TERMINAL,
  NATIVE_TOKEN: payState.NATIVE,
  erc20DecimalsAbi: [],
  truncAddr: value => value,
}));

vi.mock('../src/pay-preview.js', () => ({
  computePayPreview: payState.preview,
  prepareCardPay: payState.prepare,
  formatTokenCount: value => String(value),
  renderRoutingTag: () => Object.assign(document.createElement('span'), { className: 'pay-routing-tag' }),
  renderAmmSub: () => null,
}));

import { buildPayArgs, payRouteLabels, renderPayComponent, resolveBestPayRoute } from '../src/pay-component.js';

const { BENEFICIARY, NATIVE, ROUTER, TERMINAL } = payState;

function quote(received, reserved = 0n) {
  return { received, reserved, minReturnedTokens: received * 99n / 100n, metadata: '0xaa', unavailable: false };
}

describe('pay route trust boundary', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    payState.execute.mockReset();
    payState.prepare.mockReset();
    payState.preview.mockReset().mockResolvedValue({ routing: 'amm', amm: null });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: text => ({ width: String(text).length * 8 }),
    });
  });

  it('selects the best verified route and prefers direct when quotes tie', async () => {
    payState.prepare.mockImplementation(({ terminal }) => Promise.resolve(
      terminal === ROUTER ? quote(100n, 50n) : quote(101n, 0n),
    ));
    await expect(resolveBestPayRoute({
      chainId: 1,
      projectId: '7',
      token: NATIVE,
      amount: 1n,
      beneficiary: BENEFICIARY,
    })).resolves.toMatchObject({ address: TERMINAL, contractName: 'JBMultiTerminal', viaRouter: false });

    payState.prepare.mockResolvedValue(quote(100n, 5n));
    await expect(resolveBestPayRoute({
      chainId: 1,
      projectId: '7',
      token: NATIVE,
      amount: 1n,
      beneficiary: BENEFICIARY,
    })).resolves.toMatchObject({ address: TERMINAL, viaRouter: false });
  });

  it('never converts unavailable, rejected, negative, or missing quotes into a zero slippage floor', async () => {
    payState.prepare.mockRejectedValue(new Error('RPC unavailable'));
    await expect(resolveBestPayRoute({
      chainId: 1, projectId: '7', token: NATIVE, amount: 1n, beneficiary: BENEFICIARY,
    })).resolves.toBeNull();

    // A known revert keeps its plain reason, still with no route to send.
    payState.prepare.mockResolvedValue({ received: null, reserved: null, unavailable: true, explained: true, reason: 'This project is not accepting payments right now.' });
    await expect(resolveBestPayRoute({
      chainId: 1, projectId: '7', token: NATIVE, amount: 1n, beneficiary: BENEFICIARY,
    })).resolves.toEqual({ unavailable: true, reason: 'This project is not accepting payments right now.' });

    payState.prepare.mockResolvedValue({ received: -1n, reserved: 0n, unavailable: false });
    await expect(resolveBestPayRoute({
      chainId: 1, projectId: '7', token: NATIVE, amount: 1n, beneficiary: BENEFICIARY,
    })).resolves.toBeNull();
    expect(() => buildPayArgs({
      chainId: 1, projectId: '7', token: NATIVE, amount: 1n, beneficiary: BENEFICIARY, route: null,
    })).toThrow(/live pay preview/i);
  });

  it('re-resolves immediately before submit and sends only the reviewed route and slippage floor', async () => {
    payState.prepare.mockImplementation(({ terminal }) => Promise.resolve(
      terminal === TERMINAL ? quote(120n, 3n) : quote(100n, 1n),
    ));
    payState.preview.mockReturnValue(new Promise(() => {})); // a stalled display-only read never holds up the payment
    const component = renderPayComponent();
    document.body.appendChild(component);

    component.querySelector('.pay-btn').click();
    await vi.waitFor(() => expect(payState.execute).toHaveBeenCalledOnce());
    const request = payState.execute.mock.calls[0][0];
    expect(request).toMatchObject({
      chainId: 1,
      address: TERMINAL,
      contractName: 'JBMultiTerminal',
      functionName: 'pay',
      value: 10n ** 18n,
      tokenAddr: null,
      spenderAddr: null,
    });
    expect(request.args).toEqual([7n, NATIVE, 10n ** 18n, BENEFICIARY, 118n, '', '0xaa']);
  });

  it('reads the routing tag for the prepared metadata, and shows none when that read fails', async () => {
    const opts = { chainId: 1, projectId: '7', token: NATIVE, amount: 1n, beneficiary: BENEFICIARY };
    const route = { address: TERMINAL, preview: quote(120n, 3n) };
    await expect(payRouteLabels(opts, route)).resolves.toEqual({ routing: 'amm', amm: null });
    expect(payState.preview).toHaveBeenCalledWith(expect.objectContaining({ terminal: TERMINAL, metadata: '0xaa' }));
    payState.preview.mockRejectedValue(new Error('RPC unavailable'));
    await expect(payRouteLabels(opts, route)).resolves.toBeNull();
  });

  it('drops a routing tag read for other metadata when the payment is prepared again', async () => {
    payState.prepare.mockResolvedValue(quote(120n));
    const component = renderPayComponent();
    document.body.appendChild(component);
    const amount = component.querySelector('.pay-amount-input');
    amount.value = '2'; amount.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(component.querySelector('.pay-routing-tag')).toBeTruthy());
    payState.prepare.mockResolvedValue({ ...quote(120n), metadata: '0xbb' });
    payState.execute.mockImplementation(tx => tx.onStatus('Confirm in your wallet.'));
    component.querySelector('.pay-btn').click();
    await vi.waitFor(() => expect(payState.execute).toHaveBeenCalledOnce());
    expect(payState.execute.mock.calls[0][0].args[6]).toBe('0xbb');
    expect(component.querySelector('.pay-routing-tag')).toBeFalsy();
  });

  it('sends nothing when the amount changes while the route is prepared', async () => {
    const pending = [];
    payState.prepare.mockImplementation(() => new Promise(resolve => pending.push(() => resolve(quote(120n)))));
    const component = renderPayComponent();
    document.body.appendChild(component);
    component.querySelector('.pay-btn').click();
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    const amount = [...component.querySelectorAll('input')].find(input => input.value === '1');
    amount.value = '2'; amount.dispatchEvent(new Event('input', { bubbles: true }));
    pending.splice(0).forEach(finish => finish());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(payState.execute).not.toHaveBeenCalled();
    expect(component.textContent).toContain('The payment details changed. Review and try again.');
    // Let the new amount's scheduled preview run inside this test.
    await new Promise(resolve => setTimeout(resolve, 450));
  });
});
