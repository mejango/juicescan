// @vitest-environment jsdom
// Transferring ownership or the operator role hands over every power. The modal must not send until the
// acknowledgement for the address on screen is ticked.
import { describe, it, expect } from 'vitest';
import { openTransferAuthorityModal, transferAcknowledgement } from '../src/discover.js';

const OWNER = '0x' + '11'.repeat(20), NEXT = '0x' + '22'.repeat(20);
function open(isRevnet) {
  document.body.innerHTML = '';
  openTransferAuthorityModal({ id: '5', chainId: 1, isRevnet, owner: OWNER, operator: OWNER, idByChain: { 1: 5 }, chains: [{ id: 1, name: 'Ethereum' }] }, { authorityAddr: OWNER });
  return { ack: document.querySelector('.danger-confirm input'), text: document.querySelector('.danger-confirm span'),
    submit: document.querySelector('.operator-edit-submit'), address: document.querySelector('input.operator-edit-jwt'), status: document.querySelector('.operator-edit-status') };
}

describe('transfer acknowledgement', () => {
  it('words the acknowledgement for the action', () => {
    expect(transferAcknowledgement(false, NEXT)).toBe('I verified the new project owner. Transferring the project NFT hands over every owner-only power.');
    expect(transferAcknowledgement(true, NEXT)).toBe('I verified the new revnet operator. They receive every power attached to this role.');
    expect(transferAcknowledgement(true, '0x' + '00'.repeat(20))).toBe('I understand that relinquishing the revnet operator role is permanent.');
  });
  it('refuses to send until the box is ticked', () => {
    const m = open(false);
    expect(m.submit.classList.contains('cta-disabled')).toBe(true);
    m.address.value = NEXT; m.address.dispatchEvent(new Event('input'));
    m.submit.click();
    expect(m.status.textContent).toBe('Tick the confirmation box to proceed.');
  });
  it('clears the acknowledgement when the address changes', () => {
    const m = open(true);
    m.address.value = NEXT; m.address.dispatchEvent(new Event('input'));
    m.ack.checked = true; m.ack.dispatchEvent(new Event('change'));
    expect(m.submit.classList.contains('cta-disabled')).toBe(false);
    m.address.value = '0x' + '00'.repeat(20); m.address.dispatchEvent(new Event('input'));
    expect(m.ack.checked).toBe(false);
    expect(m.text.textContent).toMatch(/relinquishing/);
    expect(m.submit.classList.contains('cta-disabled')).toBe(true);
  });
});
