// Uses a fresh session and only the generated sample PDF, never a student's files.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readSSE, type ChatEvent } from '../shared/stream.js';
const base = 'http://127.0.0.1:3001/api';
const response = await fetch(`${base}/status`);
const cookie = response.headers.get('set-cookie')!.split(';')[0];
const status = await response.json();
assert.ok(status.chatReady && status.pdfReady, 'Configure all services first.');
const bytes = await readFile('output/pdf/stacks-and-queues.pdf');
const form = new FormData(); form.append('pdf', new Blob([bytes], { type: 'application/pdf' }), 'streaming-smoke-test.pdf');
const uploaded = await fetch(`${base}/documents`, { method: 'POST', headers: { cookie }, body: form });
const data = await uploaded.json();
assert.equal(uploaded.status, 202, data.error);
const id = data.document.id;
let ready = false;
try {
  for (let attempt = 0; attempt < 90; attempt++) {
    const state = await (await fetch(`${base}/status`, { headers: { cookie } })).json();
    if (state.document?.status === 'failed') throw new Error(state.document.error);
    if (state.document?.status === 'ready') { ready = true; console.log(`PASS PDF ingestion: ${state.document.pages} page, ${state.document.chunks} chunks`); break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'PDF processing timed out.');
  const chat = await fetch(`${base}/chat`, { method: 'POST', headers: { cookie, Accept: 'text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'According to the PDF, why should I use deque instead of list.pop(0)?', documentId: id, strict: true }) });
  assert.equal(chat.status, 200);
  let deltas = 0; let final = false;
  for await (const payload of readSSE(chat.body!)) {
    const event = JSON.parse(payload) as ChatEvent;
    if (event.type === 'delta') deltas++;
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'done') {
      assert.ok(event.result.sources.length > 0, 'Missing PDF citation.');
      assert.ok(event.result.sources.every(s => s.page === 1 && s.documentId === id));
      assert.match(event.result.content, /O\(n\)/i);
      console.log(`PASS streamed PDF answer: ${deltas} deltas; ${event.result.sources.length} valid page citation(s)`); final = true;
    }
  }
  assert.ok(final && deltas > 1, 'Expected incremental answer and final event.');
} finally {
  if (ready) {
    const removed = await fetch(`${base}/documents/${id}`, { method: 'DELETE', headers: { cookie } });
    assert.ok(removed.ok, 'Test document cleanup failed.');
    console.log('PASS isolated test document cleaned up');
  } else console.log('Test document will expire automatically; processing did not reach ready.');
}
