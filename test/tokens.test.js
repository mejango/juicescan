import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentChainId } from '../src/chain.js';
import { renderTokenSelect } from '../src/tokens.js';

describe('token quick select', () => {
  beforeEach(() => {
    setCurrentChainId(1);
    document.body.innerHTML = '';
  });

  it('selects a known token or the explicit custom-token path', () => {
    const onSelect = vi.fn();
    const selector = renderTokenSelect(onSelect);
    document.body.appendChild(selector);
    const pills = [...selector.querySelectorAll('button')];

    expect(pills.length).toBeGreaterThan(1);
    expect(pills[0].classList.contains('selected')).toBe(true);
    pills[1].click();
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ symbol: pills[1].textContent }));
    expect(pills[1].classList.contains('selected')).toBe(true);
    expect(pills[0].classList.contains('selected')).toBe(false);

    pills.at(-1).click();
    expect(pills.at(-1).textContent).toBe('custom');
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('rerenders its choices when the app chain changes', () => {
    const selector = renderTokenSelect(vi.fn());
    const ethereumLabels = [...selector.querySelectorAll('button')].map(button => button.textContent);
    setCurrentChainId(8453);
    const baseLabels = [...selector.querySelectorAll('button')].map(button => button.textContent);

    expect(baseLabels[0]).toBe('ETH (native)');
    expect(baseLabels).not.toEqual(ethereumLabels);
    expect(selector.querySelectorAll('.selected')).toHaveLength(1);
  });
});
