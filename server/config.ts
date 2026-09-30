import 'dotenv/config';
import { randomBytes } from 'node:crypto';
export const requiredPdfKeys = ['PINECONE_API_KEY', 'PINECONE_INDEX_HOST', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
export const config = {
  port: Number(process.env.PORT || 3001),
  origin: process.env.APP_ORIGIN || 'http://127.0.0.1:5173',
  production: process.env.NODE_ENV === 'production',
  secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  groqKey: process.env.GROQ_API_KEY || '',
  model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  pineconeKey: process.env.PINECONE_API_KEY || '',
  pineconeHost: (process.env.PINECONE_INDEX_HOST || '').replace(/\/$/, ''),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  bucket: process.env.SUPABASE_STORAGE_BUCKET || 'study-pdfs',
};
export function readiness() {
  const missing = ['GROQ_API_KEY', ...requiredPdfKeys].filter(key => !process.env[key]?.trim());
  return { chatReady: !missing.includes('GROQ_API_KEY'), pdfReady: requiredPdfKeys.every(key => !missing.includes(key)), missing };
}
if (config.production && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Production requires a SESSION_SECRET of at least 32 characters.');
