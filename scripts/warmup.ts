import { embed } from '../server/embeddings.js';
console.log('Downloading/caching the free embedding model. First run may take several minutes.');
const vector = await embed('A stack is a last-in-first-out data structure.');
if (vector.length !== 384 || vector.some(v => !Number.isFinite(v))) throw new Error('Unexpected embedding output.');
console.log(`Embedding model ready: ${vector.length} dimensions. No API key required.`);
