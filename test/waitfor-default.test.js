import { expect, it, vi } from 'vitest';

it('gives vi.waitFor a default timeout above one second and keeps an explicit one', async () => {
  let ready = false;
  setTimeout(() => { ready = true; }, 1500);
  await vi.waitFor(() => expect(ready).toBe(true));
  const started = Date.now();
  await expect(vi.waitFor(() => { throw new Error('never'); }, { timeout: 200 })).rejects.toThrow('never');
  expect(Date.now() - started).toBeLessThan(1000);
});
