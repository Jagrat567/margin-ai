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
    if (event.type === 'delta') onDelta(event.text);
    else if (event.type === 'error') throw new Error(event.message);
    else if (event.type === 'done') return event.result;
  }
  throw new Error('The connection ended before the answer was complete. Please try again.');
}
