import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForBackend } from '../src/connection.js';

test('wake-up retries gateway errors and HTML startup pages until status is ready', async () => {
  const responses = [new Response('Sleeping', { status: 502 }), new Response('<html>Starting</html>'), Response.json({ chatReady: true, missing: [] })];
  let calls = 0;
  const result = await waitForBackend(new AbortController().signal, { delayMs: 1, fetcher: (async () => { calls++; return responses.shift()!; }) as typeof fetch });
  assert.equal(result.chatReady, true); assert.equal(calls, 3);
});
test('wake-up has bounded retries and respects cancellation', async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; throw new TypeError('offline'); }) as typeof fetch;
  await assert.rejects(waitForBackend(new AbortController().signal, { fetcher, attempts: 2, delayMs: 1 }), /could not connect/);
  assert.equal(calls, 2);
  const controller = new AbortController();
  const pending = waitForBackend(controller.signal, { fetcher, delayMs: 1000 });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
test('missing Groq configuration and rate limits are not treated as sleeping', async () => {
  const result = await waitForBackend(new AbortController().signal, { fetcher: (async () => Response.json({ chatReady: false, missing: ['GROQ_API_KEY'] })) as typeof fetch });
  assert.equal(result.chatReady, false);
  let calls = 0;
  await assert.rejects(waitForBackend(new AbortController().signal, { fetcher: (async () => { calls++; return new Response('', { status: 429 }); }) as typeof fetch }), /Too many connection/);
  assert.equal(calls, 1);
});
