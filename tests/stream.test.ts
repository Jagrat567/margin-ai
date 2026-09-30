import test from 'node:test';
import assert from 'node:assert/strict';
import { readSSE } from '../shared/stream.js';

test('SSE decoder handles split UTF-8, CRLF, comments, and final frames', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\n\r\ndata: {"text":"你好 🌱"}\r\n\r\ndata: [DONE]\n\n');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events = []; for await (const event of readSSE(stream)) events.push(event);
  assert.deepEqual(events, ['{"text":"你好 🌱"}', '[DONE]']);
});
