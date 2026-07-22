import { beforeEach, describe, expect, it, vi } from 'vitest';

const payState = vi.hoisted(() => ({
  NATIVE: '0x000000000000000000000000000000000000eeee',
  ROUTER: '0x1111111111111111111111111111111111111111',
  TERMINAL: '0x2222222222222222222222222222222222222222',
  BENEFICIARY: '0x3333333333333333333333333333333333333333',
  execute: vi.fn(),
  preview: vi.fn(),
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
  formatTokenCount: value => String(value),
  renderRoutingTag: () => document.createElement('span'),
  renderAmmSub: () => null,
}));

import { buildPayArgs, renderPayComponent, resolveBestPayRoute } from '../src/pay-component.js';

const { BENEFICIARY, NATIVE, ROUTER, TERMINAL } = payState;

function quote(received, reserved = 0n) {
  return { received, reserved, unavailable: false, routing: 'issuance' };
}

describe('pay route trust boundary', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    payState.execute.mockReset();
    payState.preview.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: text => ({ width: String(text).length * 8 }),
    });
  });

  it('selects the best verified route and prefers direct when quotes tie', async () => {
    payState.preview.mockImplementation(({ terminal }) => Promise.resolve(
      terminal === ROUTER ? quote(100n, 50n) : quote(101n, 0n),
    ));
    await expect(resolveBestPayRoute({
      chainId: 1,
      projectId: '7',
      token: NATIVE,
      amount: 1n,
      beneficiary: BENEFICIARY,
    })).resolves.toMatchObject({ address: TERMINAL, contractName: 'JBMultiTerminal', viaRouter: false });

    payState.preview.mockResolvedValue(quote(100n, 5n));
    await expect(resolveBestPayRoute({
      chainId: 1,
      projectId: '7',
      token: NATIVE,
      amount: 1n,
      beneficiary: BENEFICIARY,
    })).resolves.toMatchObject({ address: TERMINAL, viaRouter: false });
  });

  it('never converts unavailable, rejected, negative, or missing quotes into a zero slippage floor', async () => {
    payState.preview.mockRejectedValue(new Error('RPC unavailable'));
    await expect(resolveBestPayRoute({
      chainId: 1, projectId: '7', token: NATIVE, amount: 1n, beneficiary: BENEFICIARY,
    })).resolves.toBeNull();

    payState.preview.mockResolvedValue({ received: -1n, reserved: 0n, unavailable: false });
    await expect(resolveBestPayRoute({
      chainId: 1, projectId: '7', token: NATIVE, amount: 1n, beneficiary: BENEFICIARY,
    })).resolves.toBeNull();
    expect(() => buildPayArgs({
      chainId: 1, projectId: '7', token: NATIVE, amount: 1n, beneficiary: BENEFICIARY, route: null,
    })).toThrow(/live pay preview/i);
  });

  it('re-resolves immediately before submit and sends only the reviewed route and slippage floor', async () => {
    payState.preview.mockImplementation(({ terminal }) => Promise.resolve(
      terminal === TERMINAL ? quote(120n, 3n) : quote(100n, 1n),
    ));
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
    expect(request.args).toEqual([7n, NATIVE, 10n ** 18n, BENEFICIARY, 118n, '', '0x']);
  });
});
