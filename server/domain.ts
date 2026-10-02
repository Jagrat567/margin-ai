import type { ChatResult } from '../shared/types.js';
import type { ChatEvent } from '../shared/stream.js';
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface HistoryMessage { role: 'user' | 'assistant'; content: string }
export interface Services {
  answer(question: string, history: HistoryMessage[], signal?: AbortSignal, webSearch?: boolean): Promise<ChatResult>;
  streamAnswer?(question: string, history: HistoryMessage[], signal?: AbortSignal, webSearch?: boolean): AsyncGenerator<ChatEvent>;
}
export function validateChat(body: unknown): { message: string; history: HistoryMessage[]; webSearch: boolean } {
  if (!body || typeof body !== 'object') throw new AppError(400, 'Please enter a question.');
  const value = body as Record<string, unknown>;
  if (typeof value.message !== 'string' || !value.message.trim() || value.message.length > 4000) throw new AppError(400, 'Questions must contain between 1 and 4,000 characters.');
  if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > 8)) throw new AppError(400, 'Conversation history is too long.');
  const history = (value.history || []) as unknown[];
  for (const item of history) {
    if (!item || typeof item !== 'object') throw new AppError(400, 'Invalid conversation history.');
    const m = item as Record<string, unknown>;
    if (!['user', 'assistant'].includes(String(m.role)) || typeof m.content !== 'string' || m.content.length > 6000) throw new AppError(400, 'Invalid conversation history.');
  }
  if (value.webSearch !== undefined && typeof value.webSearch !== 'boolean') throw new AppError(400, 'Invalid web search setting.');
  return { webSearch: value.webSearch === true, message: value.message.trim(), history: history as HistoryMessage[] };
}
