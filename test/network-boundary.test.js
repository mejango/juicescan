import { describe, expect, it } from 'vitest';

describe('unit network boundary', () => {
  it('fails closed when a test has not installed an explicit fetch stub', async () => {
    await expect(fetch('https://example.com/should-not-run')).rejects.toThrow(
      'Unexpected network request in unit test: https://example.com/should-not-run',
    );
    expect(() => new XMLHttpRequest()).toThrow(
      'Unexpected XMLHttpRequest connection in unit test',
    );
    expect(() => new WebSocket('wss://example.com/should-not-run')).toThrow(
      'Unexpected WebSocket connection in unit test',
    );
    expect(() => new EventSource('https://example.com/should-not-run')).toThrow(
      'Unexpected EventSource connection in unit test',
    );
  });
});
