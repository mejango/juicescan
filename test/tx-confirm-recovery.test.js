import { afterEach, describe, expect, it } from 'vitest';
import { openTxConfirm } from '../src/discover.js';

afterEach(() => {
  document.querySelectorAll('dialog.modal-dialog').forEach((node) => node.remove());
});

describe('project-page transaction confirmation recovery', () => {
  it('can be dismissed once receipt tracking gives up on a submitted payment', () => {
    let ctx = null;
    openTxConfirm({
      action: 'Pay project',
      chain: 'Base Sepolia',
      chainId: 84532,
      contract: 'JBMultiTerminal',
      address: '0x1111111111111111111111111111111111111111',
      function: 'pay',
      args: { projectId: 9 },
      value: 0n,
    }, (confirmCtx) => { ctx = confirmCtx; }, { closeOnConfirm: false });
    const dialog = document.querySelector('dialog.modal-dialog');
    const confirm = dialog.querySelector('.create-modal-foot .create-btn.primary');
    const cancel = dialog.querySelector('.create-modal-foot .create-btn.ghost');
    confirm.click();
    expect(cancel.disabled).toBe(true);

    const hash = '0x' + 'ab'.repeat(32);
    ctx.showStatus('Payment processing', 'pending', { phase: 'receipt', hash, chainId: 84532 });
    expect(cancel.disabled).toBe(true);
    ctx.showStatus('Transaction submitted; confirmation tracking is temporarily unavailable.', 'pending', { phase: 'receipt', hash, chainId: 84532, trackingError: true });
    expect(cancel.disabled).toBe(false);
    expect(cancel.textContent).toBe('Close');

    dialog.querySelector('.modal-close').click();
    expect(document.body.contains(dialog)).toBe(false);
  });

  it('can be dismissed after a locked send reports its failure through showStatus', () => {
    let ctx = null;
    openTxConfirm({ action: 'Claim', chain: 'Base', chainId: 8453, function: 'claim', args: {}, value: 0n }, (confirmCtx) => { ctx = confirmCtx; }, { closeOnConfirm: false });
    const dialog = document.querySelector('dialog.modal-dialog');
    const cancel = dialog.querySelector('.create-modal-foot .create-btn.ghost');
    dialog.querySelector('.create-modal-foot .create-btn.primary').click();
    ctx.showStatus('Transaction rejected by wallet', 'error');
    expect(cancel.disabled).toBe(false);
    expect(cancel.textContent).toBe('Close');
  });
});
