import { describe, expect, it } from 'vitest';
import { dispatchWalletChangeListeners } from '../src/wallet.js';

describe('wallet change fan-out', () => {
  it('updates every subscriber even when an earlier detached view throws', () => {
    const state = { account: '0x1111111111111111111111111111111111111111', connected: true };
    const seen = [];
    const errors = [];

    dispatchWalletChangeListeners([
      () => { seen.push('header'); },
      () => { throw new Error('stale detached view'); },
      (next) => { seen.push(next.account); },
    ], state, (error) => { errors.push(error.message); });

    expect(seen).toEqual(['header', state.account]);
    expect(errors).toEqual(['stale detached view']);
  });

  it('uses a callback snapshot when subscriptions mutate during dispatch', () => {
    const callbacks = [];
    const seen = [];
    callbacks.push(() => { seen.push('first'); callbacks.push(() => { seen.push('late'); }); });
    callbacks.push(() => { seen.push('second'); });

    dispatchWalletChangeListeners(callbacks, { account: null, connected: false });

    expect(seen).toEqual(['first', 'second']);
  });
});
