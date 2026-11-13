// Rules Juicescan shares with juicebox.money. Each must give the same result in both clients.
import { describe, it, expect } from 'vitest';
import { cashOutTaxValue, omnichainTokenSalt } from '../src/encoding.js';
import { keccak256, toHex } from 'viem';
import { chainList } from '../src/chain.js';

describe('cash out tax value', () => {
  it('reads a rate out of 10,000 as the 0 to 1 value', () => {
    expect(cashOutTaxValue(1000)).toBe('0.1');
    expect(cashOutTaxValue(9999)).toBe('0.9999');
    expect(cashOutTaxValue(0)).toBe('0');
    expect(cashOutTaxValue(10000n)).toBe('1');
  });
});

describe('chain order', () => {
  it('lists Ethereum, Base, Arbitrum, Optimism, then their testnets in the same order', () => {
    expect(chainList().map(c => Number(c.id))).toEqual([1, 8453, 42161, 10, 11155111, 84532, 421614, 11155420]);
  });
});

describe('ERC-20 deploy salt', () => {
  it('is keccak256("jb-erc20:<name>:<symbol>") with both trimmed, as juicebox.money derives it', () => {
    expect(omnichainTokenSalt(' My Token ', 'MTK ')).toBe(keccak256(toHex('jb-erc20:My Token:MTK')));
    expect(omnichainTokenSalt('My Token', 'MTK')).toBe('0x' + keccak256(toHex('jb-erc20:My Token:MTK')).slice(2));
  });
});
