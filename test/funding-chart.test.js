// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fundingChartPoints, renderFundingChart } from '../src/funding-chart.js';

const usd = n => String(BigInt(n) * 10n ** 18n);
const NOW = 1_000_000;

describe('funding chart series', () => {
  const moments = [
    { timestamp: NOW - 900, volumeUsd: usd(100), balanceUsd: usd(100) },
    { timestamp: NOW - 450, volumeUsd: usd(300), balanceUsd: usd(50) },
  ];
  const adds = [{ timestamp: NOW - 100, amountUsd: usd(25) }];

  it('volume is cumulative payments plus direct additions and never falls', () => {
    const points = fundingChartPoints(moments, adds, 'volume', 0, NOW);
    expect(points).toHaveLength(45);
    expect(points[0].valueUsd).toBe(100);
    expect(points[44].valueUsd).toBe(325);
    points.forEach((p, i) => { if (i) expect(p.valueUsd).toBeGreaterThanOrEqual(points[i - 1].valueUsd); });
  });

  it('balance follows what the project holds and ignores additions', () => {
    const points = fundingChartPoints(moments, adds, 'balance', 0, NOW);
    expect(points[0].valueUsd).toBe(100);
    expect(points[44].valueUsd).toBe(50);
  });

  it('a short window opens on the state standing before it', () => {
    const points = fundingChartPoints(moments, adds, 'volume', 200, NOW);
    expect(points[0].valueUsd).toBe(300);
    expect(points[44].valueUsd).toBe(325);
  });

  it('floors a flow-accrued balance that price moves pushed below zero', () => {
    const points = fundingChartPoints([{ timestamp: NOW - 10, volumeUsd: usd(2000), balanceUsd: '-' + usd(1000) }], [], 'balance', 0, NOW);
    expect(points[44].valueUsd).toBe(0);
  });

  it('has no points without history', () => {
    expect(fundingChartPoints([], adds, 'balance', 0, NOW)).toEqual([]);
  });
});

describe('funding chart card', () => {
  it('stays hidden with no history or a failed read, and draws bars with a total otherwise', async () => {
    const empty = renderFundingChart(() => Promise.resolve({ moments: [], adds: [] }));
    const failed = renderFundingChart(() => Promise.reject(new Error('indexer down')));
    const now = Math.floor(Date.now() / 1000);
    const card = renderFundingChart(() => Promise.resolve({ moments: [{ timestamp: now - 60, volumeUsd: usd(12), balanceUsd: usd(7) }], adds: [] }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(empty.style.display).toBe('none');
    expect(failed.style.display).toBe('none');
    expect(card.style.display).toBe('');
    expect(card.querySelectorAll('rect')).toHaveLength(45);
    expect(card.querySelector('.market-chart-price').textContent).toBe('$12.00');
    const metric = card.querySelector('select');
    metric.value = 'balance'; metric.dispatchEvent(new Event('change'));
    expect(card.querySelector('.market-chart-price').textContent).toBe('$7.00');
  });
});
