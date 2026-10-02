export interface WebSource { title: string; url: string; publishedDate?: string }
export interface ChatMessage { sources?: WebSource[]; id: string; role: 'user' | 'assistant'; content: string; state?: 'streaming' | 'stopped' | 'failed' }
export interface AppStatus { chatReady: boolean; searchReady?: boolean; missing: string[] }
export interface ChatResult { content: string; sources?: WebSource[] }
