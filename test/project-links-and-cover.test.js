// The project's About links cover the same six juicebox.money shows, under the same rules.
import { describe, it, expect } from 'vitest';
import { renderProjectLinks } from '../src/discover.js';

const links = (project) => {
  const row = renderProjectLinks(project);
  return row ? Array.from(row.querySelectorAll('.about-link-row')).map(item => [item.querySelector('.about-link-key').textContent, item.querySelector('a').href]) : null;
};

describe('project links', () => {
  it('adds WhatsApp as an https link and Instagram from a handle', () => {
    expect(links({ whatsapp: 'https://chat.whatsapp.com/abc', instagram: '@juice.box' })).toEqual([
      ['WhatsApp:', 'https://chat.whatsapp.com/abc'],
      ['Instagram:', 'https://instagram.com/juice.box'],
    ]);
  });
  it('drops a WhatsApp value that is not https and an Instagram value that is not a handle', () => {
    expect(links({ whatsapp: 'javascript:alert(1)', instagram: 'https://evil.example/x' })).toBeNull();
    expect(links({ whatsapp: 'http://chat.whatsapp.com/abc' })).toBeNull();
  });
});

describe('a background metadata refresh', () => {
  it('carries every link the About row shows, so a changed handle replaces the old one', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/discover.js', 'utf8');
    const list = source.slice(source.indexOf('var PROJECT_DISPLAY_FIELDS'), source.indexOf('function applyProjectDisplayRefresh'));
    for (const field of ['infoUri', 'twitter', 'farcaster', 'discord', 'telegram', 'whatsapp', 'instagram', 'coverImageUri']) {
      expect(list).toContain(`'${field}'`);
    }
  });
});
