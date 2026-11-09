import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ account: '0x3333333333333333333333333333333333333333' }));
vi.mock('../src/component-base.js', async (original) => ({ ...await original(),
  getAccount: () => h.account,
  createPublicClientForChain: () => ({ getBalance: async () => 10n ** 18n }),
  executeTransaction: (opts) => {
    opts.onStatus('Confirming onchain', 'pending', { phase: 'receipt', hash: '0x' + 'ab'.repeat(32), chainId: 8453 });
    opts.onStatus('Transaction submitted; confirmation tracking is temporarily unavailable.', 'pending', { phase: 'receipt', hash: '0x' + 'ab'.repeat(32), chainId: 8453, trackingError: true });
  },
}));

import { renderBridgeTransactionsTable } from '../src/discover.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('bridge Claim row', () => {
  it('can be dismissed once receipt tracking gives up on a claim', async () => {
    const tx = {
      status: 'claimable', chainId: 1, peerChainId: 8453, index: 0, sourceSucker: '0x' + '44'.repeat(20), peerSucker: '0x' + '55'.repeat(20),
      token: '0x000000000000000000000000000000000000EEEe', beneficiary: h.account, beneficiary32: '0x' + '00'.repeat(12) + h.account.slice(2),
      projectTokenCount: '1000', terminalTokenAmount: '1', metadata: '0x' + '00'.repeat(32), proof: Array(32).fill('0x' + '00'.repeat(32)), createdAt: 1,
    };
    const table = renderBridgeTransactionsTable([tx], { id: 7, tokenSymbol: 'TKN', chains: [] });
    document.body.appendChild(table);
    [...table.querySelectorAll('button')].find((button) => button.textContent === 'Claim').click();
    for (let i = 0; i < 50 && !document.querySelector('dialog.modal-dialog'); i++) await flush();
    const dialog = document.querySelector('dialog.modal-dialog');
    const cancel = dialog.querySelector('.create-modal-foot .create-btn.ghost');
    dialog.querySelector('.create-modal-foot .create-btn.primary').click();
    expect(cancel.disabled).toBe(false);
    expect(cancel.textContent).toBe('Close');
  });
});
