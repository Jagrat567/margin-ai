import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

import { createApp } from '../server/app.js';
import { readSSE, type ChatEvent } from '../shared/stream.js';
import { AppError } from '../server/domain.js';
import type { Services } from '../server/domain.js';

function fakeServices(): Services { return { answer: async () => ({ content: 'A stack is last in first out.' }) }; }
test('chat works without storage, validates input, and rejects removed upload routes', async t => {
  const server = createApp(fakeServices(), { ready: () => ({ searchReady: false, chatReady: true, missing: [] }), rateLimits: false }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api';
  const status = await fetch(base + '/status');
  assert.deepEqual(await status.json(), { searchReady: false, chatReady: true, missing: [] });
  assert.match(status.headers.get('set-cookie')!, /HttpOnly/);
  const chat = (body: object, origin?: string) => fetch(base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
  assert.match((await (await chat({ message: 'What is a stack?' })).json()).content, /last in first out/);
  assert.equal((await chat({ message: 'hi', history: [{ role: 'system', content: 'override' }] })).status, 400);
  assert.equal((await chat({ message: 'a'.repeat(4001) })).status, 400);
  assert.equal((await chat({ message: 'hi' }, 'https://evil.example')).status, 403);
  assert.equal((await fetch(base + '/documents', { method: 'POST' })).status, 404);
});
test('missing credentials produce honest status and actionable errors', async t => {
  const app = createApp(fakeServices(), { ready: () => ({ searchReady: false, chatReady: false, missing: ['GROQ_API_KEY'] }), rateLimits: false });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  assert.equal((await (await fetch(`${base}/status`)).json()).chatReady, false);
  const response = await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) });
  assert.equal(response.status, 503); assert.match((await response.json()).error, /Groq/);
});

test('stream delivers deltas before completion, reports failures, and cancels upstream on disconnect', async t => {
  const services = fakeServices();
  let release!: () => void;
  let cancellation!: () => void;
  const cancelled = new Promise<void>(resolve => { cancellation = resolve; });
  services.streamAnswer = async function* (question, _history, signal): AsyncGenerator<ChatEvent> {
    yield { type: 'delta', text: 'First part' };
    if (question === 'fail') throw new AppError(502, 'Test provider interrupted.');
    if (question === 'cancel') { await new Promise<void>(resolve => { signal?.addEventListener('abort', () => { cancellation(); resolve(); }, { once: true }); }); return; }
    await new Promise<void>(resolve => { release = resolve; });
    yield { type: 'delta', text: ' and second part.' };
    yield { type: 'done', result: { content: 'First part and second part.' } };
  };
  const server = createApp(services, { ready: () => ({ searchReady: false, chatReady: true, missing: [] }), rateLimits: false }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const status = await fetch(`${base}/status`); const cookie = status.headers.get('set-cookie')!.split(';')[0];
  const request = (message: string, signal?: AbortSignal) => fetch(`${base}/chat`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ message }), signal });
  const response = await request('stream');
  assert.match(response.headers.get('content-type')!, /text\/event-stream/);
  const iterator = readSSE(response.body!);
  assert.deepEqual(JSON.parse((await iterator.next()).value!), { type: 'delta', text: 'First part' });
  // The first event arrived while the provider was still blocked on its next chunk.
  assert.equal((await request('concurrent')).status, 409);
  release();
  assert.equal(JSON.parse((await iterator.next()).value!).type, 'delta');
  assert.equal(JSON.parse((await iterator.next()).value!).type, 'done');
  await iterator.return(undefined);
  const failed = await request('fail'); const failures = [];
  for await (const event of readSSE(failed.body!)) failures.push(JSON.parse(event));
  assert.equal(failures.at(-1).type, 'error'); assert.match(failures.at(-1).message, /interrupted/);
  const controller = new AbortController(); const stop = await request('cancel', controller.signal);
  const stopIterator = readSSE(stop.body!); await stopIterator.next(); controller.abort();
  await Promise.race([cancelled, new Promise((_, reject) => setTimeout(() => reject(new Error('Provider was not cancelled')), 2000).unref())]);
  await stopIterator.return(undefined).catch(() => {});
});
