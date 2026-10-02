import { readSSE, type ChatEvent } from '../shared/stream';
import type { ChatResult } from '../shared/types';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: 'same-origin', headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers } });
  const data = await response.json().catch(() => ({ error: 'The server returned an unexpected response.' }));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}
export async function streamChat(payload: unknown, signal: AbortSignal, onDelta: (text: string) => void): Promise<ChatResult> {
  const response = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(payload), signal });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Unable to start the answer. Please try again.'); }
  if (!response.body) throw new Error('Streaming is unavailable. Please try again.');
  for await (const frame of readSSE(response.body)) {
    const event = JSON.parse(frame) as ChatEvent;
    if (event.type === 'delta') {
      // Pace the display independently of Groq's fast token delivery.
      // Code points keep emoji/surrogate pairs together; completion waits for display.
      const characters = Array.from(event.text);
      for (let i = 0; i < characters.length; i += 3) {
        signal.throwIfAborted();
        onDelta(characters.slice(i, i + 3).join(''));
        await new Promise<void>((resolve, reject) => {
          const stop = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 45);
          signal.addEventListener('abort', stop, { once: true });
          if (signal.aborted) stop();
        });
      }
    }
    else if (event.type === 'error') throw new Error(event.message);
    else if (event.type === 'done') return event.result;
  }
  throw new Error('The connection ended before the answer was complete. Please try again.');
}
