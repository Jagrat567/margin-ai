import type { ChatResult } from './types.js';
export type ChatEvent = { type: 'delta'; text: string } | { type: 'done'; result: ChatResult } | { type: 'error'; message: string };

// Both the provider and our API use SSE. Network reads can split anywhere,
// including inside UTF-8 characters, JSON strings, and CRLF boundaries.
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  function data(frame: string) { return frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n'); }
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index); buffer = buffer.slice(boundary.index + boundary[0].length);
        const payload = data(frame); if (payload) yield payload;
      }
      if (done) { const payload = data(buffer); if (payload) yield payload; break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

