import 'dotenv/config';
import { randomBytes } from 'node:crypto';
export const config = {
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0),
  port: Number(process.env.PORT || 3001),
  origin: process.env.APP_ORIGIN || 'http://127.0.0.1:5173',
  production: process.env.NODE_ENV === 'production',
  secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  groqKey: process.env.GROQ_API_KEY || '',
  model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
};
export function readiness() {
  const missing = ['GROQ_API_KEY'].filter(key => !process.env[key]?.trim());
  return { chatReady: !missing.includes('GROQ_API_KEY'), missing };
}
if (config.production && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Production requires a SESSION_SECRET of at least 32 characters.');
