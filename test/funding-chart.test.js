// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fundingChartNote, fundingChartPoints, renderFundingChart } from '../src/funding-chart.js';

const usd = n => String(BigInt(n) * 10n ** 18n);
const NOW = 1_000_000;

const ETH = '0x000000000000000000000000000000000000EEEe';
const eth = n => String(BigInt(n) * 10n ** 18n);

describe('funding chart series', () => {
  const moments = [
    { timestamp: NOW - 900, volumeUsd: usd(100) },
    { timestamp: NOW - 450, volumeUsd: usd(300) },
  ];
  const adds = [{ timestamp: NOW - 100, amountUsd: usd(25) }];
  // 2 ETH on Base when ETH was 1000, 500 USDC, then 1 ETH after a payout when ETH was 4000.
  const held = [
    { chainId: 8453, projectId: 7, token: ETH, decimals: 18, balance: eth(2), timestamp: NOW - 900, tokenUsdRate: usd(1000) },
    { chainId: 8453, projectId: 7, token: '0xusdc', decimals: 6, balance: '500000000', timestamp: NOW - 450, tokenUsdRate: usd(1) },
    { chainId: 8453, projectId: 7, token: ETH, decimals: 18, balance: eth(1), timestamp: NOW - 100, tokenUsdRate: usd(4000) },
  ];
  const data = { moments, adds, held, rates: { ['8453:' + ETH.toLowerCase()]: 3000 } };

  it('volume is cumulative payments plus direct additions and never falls', () => {
    const points = fundingChartPoints(data, 'volume', 0, NOW);
    expect(points).toHaveLength(45);
    expect(points[0].valueUsd).toBe(100);
    expect(points[44].valueUsd).toBe(325);
    points.forEach((p, i) => { if (i) expect(p.valueUsd).toBeGreaterThanOrEqual(points[i - 1].valueUsd); });
  });

  it('balance values every past holding at today’s price', () => {
    const points = fundingChartPoints(data, 'balance', 0, NOW);
    // 2 ETH at today's 3000, not the 1000 it was worth then.
    expect(points[0].valueUsd).toBe(6000);
    // USDC has no live price here, so its newest indexed rate stands in.
    expect(points[44].valueUsd).toBe(3500);
    // With no live price at all, the newest indexed rate prices the whole history.
    expect(fundingChartPoints({ held }, 'balance', 0, NOW)[0].valueUsd).toBe(8000);
  });

  it('says when Balance is not every holding at a live price, and withholds it when a chain failed to load', () => {
    const live = { ['8453:' + ETH.toLowerCase()]: 3000, '8453:0xusdc': 1 };
    expect(fundingChartNote({ held, rates: live }, 'balance')).toBeNull();
    expect(fundingChartNote(data, 'balance')).toBe('Some prices are recent, not live.');
    const unpriced = held.concat([{ chainId: 1, projectId: 7, token: '0xdai', decimals: 18, balance: eth(100), timestamp: NOW - 50, tokenUsdRate: null }]);
    expect(fundingChartNote({ held: unpriced, rates: live }, 'balance')).toBe('Leaves out tokens with no dollar price.');
    expect(fundingChartNote(data, 'volume')).toBeNull();
    // 100 on one chain and a failed read of the other must not read as a balance of 100.
    const failed = Object.assign({}, data, { heldFailed: true });
    expect(fundingChartPoints(failed, 'balance', 0, NOW)).toEqual([]);
    expect(fundingChartNote(failed, 'balance')).toBe('Balance could not be loaded.');
    expect(fundingChartPoints(failed, 'volume', 0, NOW)).toHaveLength(45);
  });

  it('a short window opens on the state standing before it', () => {
    const points = fundingChartPoints(data, 'volume', 200, NOW);
    expect(points[0].valueUsd).toBe(300);
    expect(points[44].valueUsd).toBe(325);
  });

  it('has no points without history', () => {
    expect(fundingChartPoints({ moments: [], adds, held: [] }, 'balance', 0, NOW)).toEqual([]);
  });
});

describe('funding chart card', () => {
  it('stays hidden with no history or a failed read, and draws bars with a total otherwise', async () => {
    const empty = renderFundingChart(() => Promise.resolve({ moments: [], adds: [] }));
    const failed = renderFundingChart(() => Promise.reject(new Error('indexer down')));
    const now = Math.floor(Date.now() / 1000);
    const card = renderFundingChart(() => Promise.resolve({
      moments: [{ timestamp: now - 60, volumeUsd: usd(12) }], adds: [],
      held: [{ chainId: 1, projectId: 2, token: '0xusdc', decimals: 6, balance: '7000000', timestamp: now - 60, tokenUsdRate: usd(1) }],
    }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(empty.style.display).toBe('none');
    expect(failed.style.display).toBe('none');
    expect(card.style.display).toBe('');
    expect(card.querySelectorAll('rect')).toHaveLength(45);
    expect(card.querySelector('.market-chart-price').textContent).toBe('$12.00');
    // The newest bar is read out; the arrow keys move the readout without a pointer.
    const svg = card.querySelector('svg'), readout = () => card.querySelector('.funding-chart-readout').textContent;
    expect(svg.getAttribute('tabindex')).toBe('0');
    expect(readout()).toContain('$12.00');
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    const first = readout();
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(readout()).not.toBe(first);
    expect(card.querySelectorAll('rect.is-inspected')).toHaveLength(1);
    const metric = card.querySelector('select');
    metric.value = 'balance'; metric.dispatchEvent(new Event('change'));
    expect(card.querySelector('.market-chart-price').textContent).toBe('$7.00');
  });
});
