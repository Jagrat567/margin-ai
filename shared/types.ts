export interface StudyDocument {
  id: string; name: string; status: 'processing' | 'ready' | 'failed';
  stage: string; pages: number; chunks: number; created_at: string;
  expires_at: string; error: string | null;
}
export interface Source { id: number; page: number; text: string; documentId: string; filename: string }
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; sources?: Source[]; basis?: 'pdf' | 'general' | 'mixed' | 'insufficient'; state?: 'streaming' | 'stopped' | 'failed' }
export interface AppStatus { chatReady: boolean; pdfReady: boolean; missing: string[]; document: StudyDocument | null }
export interface ChatResult { content: string; sources: Source[]; basis: NonNullable<ChatMessage['basis']> }
