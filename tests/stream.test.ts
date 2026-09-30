import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleAnswer, answerClassification, readSSE } from '../shared/stream.js';

test('SSE decoder handles split UTF-8, CRLF, comments, and final frames', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\n\r\ndata: {"text":"你好 🌱"}\r\n\r\ndata: [DONE]\n\n');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events = []; for await (const event of readSSE(stream)) events.push(event);
  assert.deepEqual(events, ['{"text":"你好 🌱"}', '[DONE]']);
});
test('stream hides split metadata trailers and preserves code and Unicode', () => {
  const answer = 'Use "queues".\n```python\nprint(a[0])\n```\nPath: C:\\notes 🌱\n';
  const raw = answer + '<margin-meta>general</margin-meta>';
  let previous = '';
  for (let i = 0; i <= raw.length; i++) {
    const value = visibleAnswer(raw.slice(0, i));
    assert.ok(answer.startsWith(value), `invalid prefix: ${value}`);
    assert.ok(value.startsWith(previous)); previous = value;
  }
  assert.equal(previous, answer);
  assert.equal(answerClassification(raw), 'general');
  assert.equal(answerClassification('No metadata'), 'mixed');
  assert.equal(visibleAnswer('Use a < b.'), 'Use a < b.');
});
