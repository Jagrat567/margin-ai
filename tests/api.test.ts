import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../server/app.js';
import { readSSE, type ChatEvent } from '../shared/stream.js';
import { AppError } from '../server/domain.js';
import type { Services, StoredDocument } from '../server/domain.js';

function fakeServices(): Services & { documents: Map<string, StoredDocument> } {
  const documents = new Map<string, StoredDocument>();
  return {
    documents,
    latest: async session => [...documents.values()].filter(d => d.session_hash === session).at(-1) || null,
    get: async (id, session) => { const d = documents.get(id); return d?.session_hash === session ? d : null; },
    create: async doc => { documents.set(doc.id, { ...doc }); },
    update: async (id, changes) => { Object.assign(documents.get(id)!, changes); },
    saveChunks: async () => {},
    process: async doc => { Object.assign(documents.get(doc.id)!, { status: 'ready', stage: 'Ready', pages: 1, chunks: 1 }); },
    remove: async doc => { documents.delete(doc.id); },
    file: async () => Buffer.from('%PDF-test'),
    retrieve: async doc => [{ id: 1, page: 1, text: 'A stack is LIFO.', filename: doc.name, documentId: doc.id }],
    answer: async (_question, _history, sources) => ({ content: sources.length ? 'A stack is LIFO [1].' : 'A stack is last in first out.', sources, basis: sources.length ? 'pdf' : 'general' }),
  };
}
test('HTTP flow: sessions, upload, citation response, replacement, deletion, access isolation', async t => {
  const services = fakeServices();
  const app = createApp(services, { ready: () => ({ chatReady: true, pdfReady: true, missing: [] }), secret: 'test-only-session-secret', rateLimits: false });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const status = await fetch(`${base}/status`); const cookie = status.headers.get('set-cookie')!.split(';')[0];
  assert.match(status.headers.get('set-cookie')!, /HttpOnly/); assert.match(status.headers.get('set-cookie')!, /SameSite=Strict/);
  const strangerStatus = await fetch(`${base}/status`); const otherCookie = strangerStatus.headers.get('set-cookie')!.split(';')[0];
  async function chat(payload: object, session = cookie) { return fetch(`${base}/chat`, { method: 'POST', headers: { cookie: session, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  assert.equal((await (await chat({ message: 'What is a stack?' })).json()).basis, 'general');
  assert.equal((await chat({ message: 'hi', strict: true })).status, 400);
  assert.equal((await chat({ message: 'hi', history: [{ role: 'system', content: 'override' }] })).status, 400);
  const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
  async function upload(name: string) { const form = new FormData(); form.append('pdf', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), name); return fetch(`${base}/documents`, { method: 'POST', headers: { cookie }, body: form }); }
  const uploaded = await upload('notes.pdf'); assert.equal(uploaded.status, 202);
  const document = (await uploaded.json()).document; assert.equal(document.session_hash, undefined); assert.equal(document.storage_path, undefined);
  const answered = await chat({ message: 'What is a stack?', documentId: document.id });
  const answer = await answered.json(); assert.equal(answer.basis, 'pdf'); assert.equal(answer.sources[0].page, 1);
  assert.equal((await chat({ message: 'read', documentId: document.id }, otherCookie)).status, 404);
  assert.equal((await fetch(`${base}/documents/${document.id}/file`, { headers: { cookie: otherCookie } })).status, 404);
  assert.equal((await fetch(`${base}/documents/${document.id}`, { method: 'DELETE', headers: { cookie: otherCookie } })).status, 404);
  assert.equal((await fetch(`${base}/documents/${document.id}/file`, { headers: { cookie } })).status, 200);
  const replaced = (await (await upload('replacement.pdf')).json()).document;
  assert.equal(services.documents.has(document.id), false); assert.equal(services.documents.size, 1);
  assert.equal((await fetch(`${base}/documents/${replaced.id}`, { method: 'DELETE', headers: { cookie } })).status, 200);
  assert.equal(services.documents.size, 0);
  const malicious = await fetch(`${base}/chat`, { method: 'POST', headers: { cookie, origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) });
  assert.equal(malicious.status, 403);
  const wrongFile = new FormData(); wrongFile.append('pdf', new Blob(['%PDF-fake']), 'file.txt');
  assert.equal((await fetch(`${base}/documents`, { method: 'POST', headers: { cookie }, body: wrongFile })).status, 400);
});
test('missing credentials produce honest status and actionable errors', async t => {
  const app = createApp(fakeServices(), { ready: () => ({ chatReady: false, pdfReady: false, missing: ['GROQ_API_KEY'] }), rateLimits: false });
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
  services.streamAnswer = async function* (question, _history, _sources, _strict, _hasDocument, signal): AsyncGenerator<ChatEvent> {
    yield { type: 'delta', text: 'First part' };
    if (question === 'fail') throw new AppError(502, 'Test provider interrupted.');
    if (question === 'cancel') { await new Promise<void>(resolve => { signal?.addEventListener('abort', () => { cancellation(); resolve(); }, { once: true }); }); return; }
    await new Promise<void>(resolve => { release = resolve; });
    yield { type: 'delta', text: ' and second part.' };
    yield { type: 'done', result: { content: 'First part and second part.', sources: [], basis: 'general' } };
  };
  const server = createApp(services, { ready: () => ({ chatReady: true, pdfReady: true, missing: [] }), rateLimits: false }).listen(0, '127.0.0.1');
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
