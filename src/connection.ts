import type { AppStatus } from '../shared/types';

// Retry only readiness checks, never a chat POST (which could generate twice).
export async function waitForBackend(signal: AbortSignal, options: {
  fetcher?: typeof fetch; attempts?: number; timeoutMs?: number; delayMs?: number;
} = {}): Promise<AppStatus> {
  const { fetcher = fetch, attempts = 12, timeoutMs = 10000, delayMs = 2000 } = options;
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal.throwIfAborted();
    let permanentError: Error | undefined;
    try {
      const response = await fetcher('/api/status', {
        credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.chatReady === 'boolean' && Array.isArray(data.missing)) return data;
      } else if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        permanentError = new Error(response.status === 429 ? 'Too many connection attempts. Please wait a minute and reconnect.' : 'Unable to connect to Margin. Please try reconnecting.');
      }
    } catch { signal.throwIfAborted(); }
    if (permanentError) throw permanentError;
    if (attempt < attempts - 1) await new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, delayMs);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }
  throw new Error('Margin could not connect yet. Your question is saved below. Check your connection and try again.');
}
