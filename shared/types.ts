export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; state?: 'streaming' | 'stopped' | 'failed' }
export interface AppStatus { chatReady: boolean; missing: string[] }
export interface ChatResult { content: string }
