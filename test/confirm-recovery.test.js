import { afterEach, describe, expect, it } from 'vitest';
import { confirmTransactionModal } from '../src/component-base.js';

afterEach(() => {
  document.querySelectorAll('dialog.modal-dialog').forEach((node) => node.remove());
});

const payload = {
  action: 'Queue ruleset',
  chain: 'Base Sepolia',
  chainId: 84532,
  contract: 'JBController',
  address: '0x1111111111111111111111111111111111111111',
  function: 'queueRulesetsOf',
  args: { projectId: 9 },
  value: 0n,
};

async function confirmed() {
  const resultPromise = confirmTransactionModal(payload, { keepOpenForProgress: true });
  const dialog = document.querySelector('dialog.modal-dialog');
  const confirm = dialog.querySelector('.create-modal-foot .create-btn.primary');
  const cancel = dialog.querySelector('.create-modal-foot .create-btn.ghost');
  (b => b && !b.checked && b.click())(document.querySelector('dialog[open] .tx-confirm-agree input'));
  confirm.click();
  const result = await resultPromise;
  expect(result.ok).toBe(true);
  expect(cancel.disabled).toBe(true);
  return { dialog, confirm, cancel, result };
}

describe('transaction confirmation recovery', () => {
  it('can be dismissed after a simulation or send error', async () => {
    const { dialog, cancel, result } = await confirmed();
    result.showStatus('Deployment failed', 'error');
    expect(cancel.disabled).toBe(false);
    expect(cancel.textContent).toBe('Close');

    dialog.querySelector('.modal-close').click();
    expect(document.body.contains(dialog)).toBe(false);
  });

  it('can be dismissed once receipt tracking gives up on a submitted transaction', async () => {
    const { dialog, cancel, result } = await confirmed();
    result.showStatus('Confirming onchain', 'pending', { phase: 'receipt', hash: '0x' + 'ab'.repeat(32), chainId: 84532 });
    expect(cancel.disabled).toBe(true);
    result.showStatus('Transaction submitted; confirmation tracking is temporarily unavailable.', 'pending', { phase: 'receipt', hash: '0x' + 'ab'.repeat(32), chainId: 84532, trackingError: true });
    expect(cancel.disabled).toBe(false);
    expect(cancel.textContent).toBe('Close');

    dialog.querySelector('.modal-close').click();
    expect(document.body.contains(dialog)).toBe(false);
  });

  it('a step kept open after success can be dismissed until the next step is confirmed', async () => {
    const { dialog, confirm, cancel, result } = await confirmed();
    result.showStatus('Approved', 'success');
    expect(cancel.disabled).toBe(false);
    expect(cancel.textContent).toBe('Close');

    const next = result.showNext(payload, { confirmText: 'Open loan' });
    expect(cancel.textContent).toBe('Cancel');
    (b => b && !b.checked && b.click())(document.querySelector('dialog[open] .tx-confirm-agree input'));
    confirm.click();
    const second = await next;
    expect(second.ok).toBe(true);
    expect(cancel.disabled).toBe(true);
    dialog.querySelector('.modal-close').click();
    expect(document.body.contains(dialog)).toBe(true);
  });
});
