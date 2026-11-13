// On the buyback pool route the enforced floor lives in hook metadata and the terminal argument is 0. The review's
// Minimum row must show the enforced floor (route.minimum), never the terminal argument.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('cash out review minimum', () => {
  for (const file of ['src/discover.js', 'src/cashout-component.js']) {
    it(file + ' shows route.minimum', () => {
      const rows = readFileSync(file, 'utf8').split('\n').filter(line => line.includes("['Minimum',") && line.includes('preparedRoute'));
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach(line => { expect(line).toContain('preparedRoute.minimum'); expect(line).not.toContain('terminalMinimum'); });
    });
  }
});
