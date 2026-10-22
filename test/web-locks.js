// jsdom has no Web Locks, which held wallet writes (src/write-hold.js) require. Importing this installs one
// exclusive in-memory lock per name with `ifAvailable` support.
const held = new Set();
export const webLocks = { async request(name, options, callback) {
  if (held.has(name)) { if (options && options.ifAvailable) return callback(null); throw new Error('Lock waits are unsupported in tests.'); }
  held.add(name);
  try { return await callback({ name }); } finally { held.delete(name); }
} };
Object.defineProperty(navigator, 'locks', { configurable: true, value: webLocks });
