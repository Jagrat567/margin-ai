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

const metadataMarker = '<margin-meta>';
// Hide the small final classification trailer, even when its delimiter is split
// across chunks. The answer itself is ordinary text, so providers don't buffer JSON.
export function visibleAnswer(raw: string): string {
  const marker = raw.indexOf(metadataMarker);
  let text = marker >= 0 ? raw.slice(0, marker) : raw;
  if (marker < 0) {
    for (let length = metadataMarker.length - 1; length > 0; length--) {
      if (text.endsWith(metadataMarker.slice(0, length))) { text = text.slice(0, -length); break; }
    }
  }
  return /[\uD800-\uDBFF]$/.test(text) ? text.slice(0, -1) : text;
}
export function answerClassification(raw: string): 'general' | 'pdf' | 'mixed' {
  const match = /<margin-meta>\s*(general|pdf|mixed)\s*<\/margin-meta>/.exec(raw);
  return (match?.[1] as 'general' | 'pdf' | 'mixed') || 'mixed';
}
