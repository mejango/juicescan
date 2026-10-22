// jsdom has no Web Locks, which held wallet writes (src/write-hold.js) require. Importing this installs one
// exclusive in-memory lock per name: `ifAvailable` refuses while held, otherwise requests queue in order.
const queues = new Map();
export const webLocks = { request(name, options, callback) {
  const tail = queues.get(name);
  if (tail && options && options.ifAvailable) return Promise.resolve().then(() => callback(null));
  const run = (tail || Promise.resolve()).then(() => callback({ name }));
  const settled = run.then(() => {}, () => {});
  queues.set(name, settled);
  settled.then(() => { if (queues.get(name) === settled) queues.delete(name); });
  return run;
} };
Object.defineProperty(navigator, 'locks', { configurable: true, value: webLocks });
