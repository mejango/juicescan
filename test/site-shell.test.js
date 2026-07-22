import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const html = await readFile(resolve(process.cwd(), 'src/index.html'), 'utf8');

describe('static security and accessibility shell', () => {
  it('keeps the browser security policy fail-closed', () => {
    const dom = new JSDOM(html);
    const policy = dom.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('keeps viewport, landmarks, image alternatives, and safe new-window links', () => {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('meta[name="viewport"]')?.content).toContain('width=device-width');
    expect(document.querySelectorAll('header, nav, main, footer')).toHaveLength(4);
    for (const image of document.querySelectorAll('img')) expect(image.hasAttribute('alt')).toBe(true);
    for (const link of document.querySelectorAll('a[target="_blank"]')) {
      expect(new Set((link.getAttribute('rel') || '').split(/\s+/))).toContain('noopener');
    }
  });

  it('keeps the production entry point free of inline executable code', () => {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    expect([...document.scripts].every(script => script.hasAttribute('src') && !script.textContent.trim())).toBe(true);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });
});
