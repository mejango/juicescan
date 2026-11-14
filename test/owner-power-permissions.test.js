// An operator the owner granted a power to must pass the gate for that power's action, as the contract lets
// them. The ids are JBPermissionIds: the contract checks exactly this id from the project's owner.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  POWER_SET_TERMINALS, POWER_SET_BUYBACK_HOOK, POWER_SET_ROUTER_TERMINAL, POWER_INIT_BUYBACK_POOL,
  POWER_SET_BUYBACK_POOL, POWER_SET_BUYBACK_TWAP,
} from '../src/discover.js';

const source = readFileSync('src/discover.js', 'utf8');

describe('owner powers name the permission that delegates them', () => {
  it('on every exported power', () => {
    expect([POWER_SET_TERMINALS, POWER_SET_BUYBACK_HOOK, POWER_SET_ROUTER_TERMINAL, POWER_INIT_BUYBACK_POOL,
      POWER_SET_BUYBACK_POOL, POWER_SET_BUYBACK_TWAP].map(power => [power.fn, power.permissionId])).toEqual([
      ['setTerminalsOf', 15], ['setHookFor', 30], ['setTerminalFor', 31],
      ['initializePoolFor', 29], ['setPoolFor', 29], ['setTwapWindowOf', 28],
    ]);
  });
  it('on the powers kept inside the module', () => {
    for (const [fn, id] of [['mintTokensOf', 10], ['setControllerOf', 14], ['migrateBalanceOf', 6], ['addPriceFeedFor', 20], ['setTokenFor', 9]]) {
      expect(source).toContain(`fn: '${fn}', permissionId: ${id},`);
    }
    expect(source).toContain("title: 'Add accounting token', gas: 300000n, permissionId: 21,");
  });
  it('and the runner passes it to the gate', () => {
    expect(source).toContain('gas: action.gas, permissionId: action.permissionId,');
  });
});
