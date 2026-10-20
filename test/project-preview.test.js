import { describe, expect, it } from 'vitest';
import {
  formatPreviewBalance,
  injectProjectPreviewMeta,
  parseProjectReference,
  projectPreviewSlogan,
  renderProjectPreviewPng,
} from '../src/project-preview-server.mjs';

describe('project link previews', () => {
  it('parses supported project share references', () => {
    expect(parseProjectReference('base:6')).toMatchObject({
      chainId: 8453,
      projectId: 6,
      key: 'base:6',
      network: 'mainnet',
    });
    expect(parseProjectReference('basesep:6')).toMatchObject({
      chainId: 84532,
      network: 'testnet',
    });
    expect(parseProjectReference('base:0')).toBeNull();
    expect(parseProjectReference('base:6/owners')).toBeNull();
  });

  it('keeps different accounting tokens separate', () => {
    const ETH = '0x000000000000000000000000000000000000eeee';
    expect(
      formatPreviewBalance([
        { chainId: 8453, projectTokenBalances: { items: [
          { token: ETH, balance: '1500000000000000000', decimals: 18, tokenSymbol: 'ETH' },
          { token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', balance: '0', decimals: 6, tokenSymbol: 'USDC' },
        ] } },
        { chainId: 10, projectTokenBalances: { items: [{ token: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', balance: '2500000', decimals: 6, tokenSymbol: null }] } },
      ]),
    ).toBe('1.5 ETH + 2.5 USDC');
    expect(formatPreviewBalance([
      { chainId: 1, projectTokenBalances: { items: [{ token: ETH, balance: '0', decimals: 18, tokenSymbol: 'ETH' }, { token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', balance: '1', decimals: 6, tokenSymbol: 'USDC' }] } },
    ])).toBe('0 USDC');
    expect(formatPreviewBalance([{ chainId: 1, projectTokenBalances: { items: [{ token: ETH, balance: '0', decimals: 18, tokenSymbol: 'ETH' }] } }])).toBe('0 ETH');
    expect(formatPreviewBalance([{ balance: '1', decimals: 18, tokenSymbol: 'ETH' }])).toBe('Unavailable');
  });

  it('never merges lookalike tokens and counts unnamed ones in USD', () => {
    const lookalikes = [{ chainId: 8453, projectTokenBalances: { items: [
      { token: '0x1111111111111111111111111111111111111111', balance: '1000000', decimals: 6, tokenSymbol: 'USD' },
      { token: '0x2222222222222222222222222222222222222222', balance: '9000000', decimals: 6, tokenSymbol: 'USD' },
    ] } }];
    expect(formatPreviewBalance(lookalikes)).toBe('1 USD + 9 USD');
    expect(formatPreviewBalance([{ chainId: 8453, projectTokenBalances: { items: [
      { token: '0x000000000000000000000000000000000000eeee', balance: '0', decimals: 18, tokenSymbol: 'ETH' },
      { token: '0x3333333333333333333333333333333333333333', balance: '7', decimals: null, tokenSymbol: null, balanceUsd: '5000000000000000000' },
    ] } }])).toBe('$5.00');
  });

  it('uses a plain-text description when a project has no tagline', () => {
    expect(projectPreviewSlogan(null, '<p>Join our <b>creative</b> mission.</p>')).toBe(
      'Join our creative mission.',
    );
  });

  it('injects crawler metadata ahead of the static defaults', () => {
    const html = injectProjectPreviewMeta('<html><head><meta property="og:title" content="Default" data-default-preview><title>Default</title></head></html>', {
      name: 'Artizen',
      tagline: 'Fund the arts.',
    }, {
      pageUrl: 'https://scan.example/?project=base%3A6',
      imageUrl: 'https://scan.example/project-og.png?project=base%3A6',
    });
    expect(html.indexOf('Artizen — Juice Scan')).toBeLessThan(html.indexOf('<title>Default</title>'));
    expect(html).toContain('property="og:image"');
    expect(html).toContain('summary_large_image');
    expect(html).not.toContain('content="Default" data-default-preview');
  });

  it('renders a crawler-compatible PNG card without a project logo', async () => {
    const image = await renderProjectPreviewPng({
      name: 'Artizen',
      tagline: 'Fund the arts.',
      logoUri: null,
      balance: '4 USDC',
      paymentsCount: 12,
    }, null);
    expect(image.subarray(1, 4).toString()).toBe('PNG');
  });
});
