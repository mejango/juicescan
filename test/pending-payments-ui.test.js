import { beforeEach, expect, it, vi } from 'vitest';
import { renderPendingPayments } from '../src/pending-payments-ui.js';

var gateway = '0x1111111111111111111111111111111111111111';
function row(id) { return { chainId: 1, gateway, pendingCallId: '0x' + String(id).padStart(64, '0'), projectId: 1, sourceProjectId: 7 }; }
function state(id, more = {}) { return { row: row(id), eligible: true, nextAttemptAt: 0n, ...more }; }
function options(states = []) {
  return { hasSaved: vi.fn(() => false), acknowledge: vi.fn(), chainName: () => 'Ethereum', describe: () => '1 ETH',
    loadRows: vi.fn(async () => states.map(state => state.row)), readState: vi.fn(async row => states.find(state => state.row.pendingCallId === row.pendingCallId)),
    run: vi.fn(async () => ({ completed: true })), onUpdated: vi.fn() };
}
beforeEach(() => { document.body.replaceChildren(); });

it('only shows the heading when pending payments exist', async () => {
  var empty = renderPendingPayments(options()); document.body.appendChild(empty); await empty._ready;
  expect(empty.hidden).toBe(true);
  var card = renderPendingPayments(options([state(1)])); document.body.appendChild(card); await card._ready;
  expect(card.hidden).toBe(false);
  expect(card.querySelector('h3').textContent).toBe('Payments awaiting routing');
  expect(card.textContent).toContain('Anyone can retry them');
});

it('sends a single form and all ready rows through the supplied transaction review', async () => {
  var config = options([state(1), state(2)]), card = renderPendingPayments(config);
  document.body.appendChild(card); await card._ready;
  card.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(config.run).toHaveBeenCalledTimes(1));
  expect(config.run.mock.calls[0][0]).toEqual([row(1)]);
  await vi.waitFor(() => expect(config.acknowledge).toHaveBeenCalled());
  card.querySelector('.pending-payments-batch').click();
  await vi.waitFor(() => expect(config.run).toHaveBeenCalledTimes(2));
  expect(config.run.mock.calls[1][0]).toEqual([row(1), row(2)]);
  expect(card.textContent).toContain('Payments may remain pending');
  expect(card.textContent).not.toContain('Payments settled');
});

it('shows cooldowns and finalization risk, and labels the partial batch accurately', async () => {
  var config = options([state(1, { eligible: false, nextAttemptAt: 1800000000n }), state(2, { finalizes: true })]);
  var card = renderPendingPayments(config); await card._ready;
  expect(card.textContent).toContain('Available');
  expect(card.textContent).toContain('return this payment to its source project');
  expect(card.querySelector('form button').disabled).toBe(true);
  expect(card.querySelector('.pending-payments-batch').textContent).toBe('Batch 1 ready');
  card.querySelector('.pending-payments-batch').click();
  await vi.waitFor(() => expect(config.run.mock.calls[0][0]).toEqual([row(2)]));
});

it('blocks the all-pending batch on unreadable rows while retaining individual verified forms', async () => {
  var config = options([state(1), state(2)]);
  config.readState.mockImplementation(async candidate => { if (candidate.pendingCallId === row(2).pendingCallId) throw new Error('RPC unavailable'); return state(1); });
  var card = renderPendingPayments(config); await card._ready;
  expect(card.querySelector('.pending-payments-batch').disabled).toBe(true);
  expect(card.querySelector('form button').disabled).toBe(false);
  expect(card.textContent).toContain('RPC unavailable');
});

it('keeps saved transaction recovery accessible when the indexer has no pending rows', async () => {
  var config = options(); config.hasSaved.mockReturnValue(true);
  config.run.mockResolvedValue({ completed: false, safePending: true });
  var card = renderPendingPayments(config); await card._ready;
  expect(card.hidden).toBe(false);
  expect(card.querySelector('.pending-payments-batch').textContent).toBe('Resume saved routing');
  card.querySelector('.pending-payments-batch').click();
  await vi.waitFor(() => expect(card.textContent).toContain('proposed to your Safe'));
  expect(config.run.mock.calls[0][0]).toEqual([]);
  expect(config.acknowledge).not.toHaveBeenCalled();
});

it('does not describe an indexer outage as zero pending payments', async () => {
  var config = options(); config.loadRows.mockRejectedValue(new Error('Indexer unavailable'));
  var card = renderPendingPayments(config); await card._ready;
  expect(card.hidden).toBe(false);
  expect(card.textContent).toContain('Could not load payments');
  expect(card.querySelector('h3').hidden).toBe(true);
  expect(card.querySelector('.pending-payments-batch').disabled).toBe(true);
});

it('keeps obsolete Safe hashes visible without claiming their queued transactions executed', async () => {
  var config = options();
  config.archived = () => [{ chain: 'Ethereum', hash: '0xold', url: 'https://app.safe.global/transactions/tx?safe=eth:0xsafe&id=old' }];
  var card = renderPendingPayments(config); await card._ready;
  expect(card.hidden).toBe(false);
  expect(card.querySelector('h3').hidden).toBe(true);
  expect(card.textContent).toContain('obsolete Safe proposals were not executed');
  expect(card.querySelector('a').textContent).toContain('0xold');
});
