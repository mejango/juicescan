import { describe, it, expect } from 'vitest';
import { renderInput, renderUintInput, renderBytesInput, toFixedPoint } from '../src/inputs.js';

describe('generic ABI fixed-point inputs', () => {
  it('scales whole and fractional human values identically', () => {
    expect(toFixedPoint('1', 18)).toBe(10n ** 18n);
    expect(toFixedPoint('1.0', 18)).toBe(10n ** 18n);
    expect(toFixedPoint('1.25', 6)).toBe(1250000n);
    expect(() => toFixedPoint('1.0000001', 6)).toThrow(/decimal places/i);
  });

  it('uses the selected decimal scale even when the input has no decimal point', () => {
    const field = renderUintInput({ name: 'amount', type: 'uint256' }, {});
    const amount = field.querySelector('.numeric-field');
    amount.value = '1';
    expect(field.getValue()).toBe(10n ** 18n);

    const decimals = field.querySelector('.decimal-input');
    decimals.value = '6';
    decimals.dispatchEvent(new Event('input'));
    expect(field.getValue()).toBe(1000000n);
    expect(field.validate()).toBeNull();
  });
});

describe('generic ABI bounds and byte lengths', () => {
  it('accepts signed integers and rejects values outside the ABI width', () => {
    const blank = renderUintInput({ name: 'count', type: 'uint256' }, {});
    expect(blank.validate()).toMatch(/value required/i);
    blank.querySelector('input').value = '0';
    expect(blank.validate()).toBeNull();

    const signed = renderUintInput({ name: 'tick', type: 'int24' }, {});
    signed.querySelector('input').value = '-60';
    expect(signed.getValue()).toBe(-60n);
    expect(signed.validate()).toBeNull();

    const small = renderUintInput({ name: 'count', type: 'uint8' }, {});
    small.querySelector('input').value = '256';
    expect(small.validate()).toMatch(/outside the range/i);
    small.querySelector('input').value = '-1';
    expect(small.validate()).toMatch(/outside the range/i);
  });

  it('requires whole bytes and exact bytesN length', () => {
    const field = renderBytesInput({ name: 'salt', type: 'bytes32' });
    const input = field.querySelector('textarea');
    input.value = '0x123';
    expect(field.validate()).toMatch(/whole bytes/i);
    input.value = '0x12';
    expect(field.validate()).toMatch(/exactly 32 bytes/i);
    input.value = '0x' + 'ab'.repeat(32);
    expect(field.validate()).toBeNull();
  });

  it('renders fixed-size ABI arrays as the exact number of typed entries', () => {
    const field = renderInput({ name: 'values', type: 'uint8[2]' }, {}, 0);
    const inputs = field.querySelectorAll('input');
    expect(inputs).toHaveLength(2);
    expect(field.querySelector('.array-controls')).toBeNull();
    inputs[0].value = '1'; inputs[1].value = '2';
    expect(field.validate()).toBeNull();
    expect(field.getValue()).toEqual([1n, 2n]);
  });
});
