import { beforeEach, vi } from 'vitest';

function requestedUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return String(input);
}

function blockedNetworkConstructor(transport) {
  return class {
    constructor(url) {
      throw new Error(
        `Unexpected ${transport} connection in unit test: ${requestedUrl(url ?? 'unknown URL')}`,
      );
    }
  };
}

// Unit tests are deterministic and offline by default. Tests which exercise a
// transport boundary must install an explicit fetch stub in their own setup.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((input) => Promise.reject(
    new Error(`Unexpected network request in unit test: ${requestedUrl(input)}`),
  )));
  vi.stubGlobal('XMLHttpRequest', blockedNetworkConstructor('XMLHttpRequest'));
  vi.stubGlobal('WebSocket', blockedNetworkConstructor('WebSocket'));
  vi.stubGlobal('EventSource', blockedNetworkConstructor('EventSource'));
});
