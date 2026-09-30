import type { ChatResult, Source, StudyDocument } from '../shared/types.js';
import type { ChatEvent } from '../shared/stream.js';
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface StoredDocument extends StudyDocument { session_hash: string; storage_path: string }
export interface Chunk { id: string; document_id: string; page: number; content: string; ordinal: number }
export interface HistoryMessage { role: 'user' | 'assistant'; content: string }
export interface Services {
  latest(session: string): Promise<StoredDocument | null>;
  get(id: string, session: string): Promise<StoredDocument | null>;
  create(doc: StoredDocument, bytes: Buffer): Promise<void>;
  update(id: string, changes: Partial<StudyDocument>): Promise<void>;
  saveChunks(chunks: Chunk[]): Promise<void>;
  process(doc: StoredDocument, bytes: Buffer): Promise<void>;
  remove(doc: StoredDocument): Promise<void>;
  file(doc: StoredDocument): Promise<Uint8Array>;
  retrieve(doc: StoredDocument, query: string): Promise<Source[]>;
  answer(question: string, history: HistoryMessage[], sources: Source[], strict: boolean, hasDocument: boolean): Promise<ChatResult>;
  streamAnswer?(question: string, history: HistoryMessage[], sources: Source[], strict: boolean, hasDocument: boolean, signal?: AbortSignal): AsyncGenerator<ChatEvent>;
}
export function publicDocument(doc: StoredDocument | null): StudyDocument | null {
  if (!doc) return null;
  const { session_hash: _, storage_path: __, ...result } = doc; return result;
}
export function validateChat(body: unknown): { message: string; history: HistoryMessage[]; documentId: string | null; strict: boolean } {
  if (!body || typeof body !== 'object') throw new AppError(400, 'Please enter a question.');
  const value = body as Record<string, unknown>;
  if (typeof value.message !== 'string' || !value.message.trim() || value.message.length > 4000) throw new AppError(400, 'Questions must contain between 1 and 4,000 characters.');
  if (value.documentId != null && (typeof value.documentId !== 'string' || !/^[a-f0-9-]{36}$/i.test(value.documentId))) throw new AppError(400, 'Invalid document.');
  if (value.strict !== undefined && typeof value.strict !== 'boolean') throw new AppError(400, 'Invalid answer mode.');
  if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > 8)) throw new AppError(400, 'Conversation history is too long.');
  const history = (value.history || []) as unknown[];
  for (const item of history) {
    if (!item || typeof item !== 'object') throw new AppError(400, 'Invalid conversation history.');
    const m = item as Record<string, unknown>;
    if (!['user', 'assistant'].includes(String(m.role)) || typeof m.content !== 'string' || m.content.length > 6000) throw new AppError(400, 'Invalid conversation history.');
  }
  return { message: value.message.trim(), history: history as HistoryMessage[], documentId: (value.documentId as string) || null, strict: value.strict === true };
}
export function normalizeAnswer(value: unknown, sources: Source[], strict: boolean): ChatResult {
  if (!value || typeof value !== 'object') throw new AppError(502, 'The AI returned an invalid answer. Please try again.');
  const v = value as Record<string, unknown>;
  if (typeof v.answer !== 'string' || !v.answer.trim()) throw new AppError(502, 'The AI returned an empty answer. Please try again.');
  let content = v.answer.slice(0, 18000);
  const valid = new Set(sources.map(s => s.id));
  const cited = new Set<number>();
  // Preserve array indices and code examples; only prose markers can be citations.
  content = content.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map(part => {
    if (part.startsWith('`')) return part;
    return part.replace(/(?<![\p{L}\p{N}_])\[(\d+)\]/gu, (match, id) => {
      if (!valid.has(Number(id))) return '';
      cited.add(Number(id)); return match;
    });
  }).join('');
  const usedSources = sources.filter(s => cited.has(s.id));
  if (strict && !usedSources.length) return { content: 'I couldn’t find enough evidence in your PDF to answer that. Try asking about a specific section, or turn off “PDF only” for a general explanation.', basis: 'insufficient', sources: [] };
  const basis = usedSources.length ? (v.basis === 'pdf' ? 'pdf' : 'mixed') : 'general';
  return { content, sources: usedSources, basis };
}
