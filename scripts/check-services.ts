import { config, readiness } from '../server/config.js';
import { LiveServices } from '../server/services.js';
const missing = readiness().missing;
if (missing.length) { console.error(`Missing environment values: ${missing.join(', ')}`); process.exit(1); }
const services = new LiveServices();
const checks = [
  ['Groq model access', async () => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${config.groqKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 8 }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}; check key/model/quotas`);
  }],
  ['Pinecone index', async () => {
    const stats = await services.pinecone('describe_index_stats', {});
    if (stats.dimension !== 384) throw new Error('Index must have 384 dimensions.');
  }],
  ['Supabase schema', async () => {
    for (const table of ['documents', 'chunks']) { const { error } = await services.db().from(table).select('id').limit(1); if (error) throw new Error(`Cannot read ${table}; run supabase/schema.sql.`); }
  }],
  ['Private PDF bucket', async () => {
    const { data, error } = await services.db().storage.getBucket(config.bucket);
    if (error || !data) throw new Error('Bucket missing or inaccessible.');
    if (data.public) throw new Error('The PDF bucket must be private.');
  }],
] as const;
let failed = false;
for (const [label, check] of checks) { try { await check(); console.log(`PASS ${label}`); } catch (e) { failed = true; console.error(`FAIL ${label}: ${(e as Error).message}`); } }
if (failed) process.exitCode = 1;
