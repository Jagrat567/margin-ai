import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Chunk } from './domain.js';
env.cacheDir = path.resolve('.cache/models');
env.allowLocalModels = false;
let loading: Promise<FeatureExtractionPipeline> | undefined;
const createExtractor = pipeline as unknown as (task: 'feature-extraction', model: string, options: { dtype: 'q8' }) => Promise<FeatureExtractionPipeline>;
export function getEmbedder() {
  if (!loading) loading = createExtractor('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' }).catch(error => { loading = undefined; throw error; });
  return loading;
}
export async function embed(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data, Number);
}
// MiniLM has a short input window. Split by actual tokenizer length before indexing.
export async function fitChunks(chunks: Chunk[]): Promise<Chunk[]> {
  const extractor = await getEmbedder();
  const result: Chunk[] = [];
  async function fit(chunk: Chunk): Promise<void> {
    const tokens = await extractor.tokenizer(chunk.content, { truncation: false });
    if (tokens.input_ids.dims[1] <= 240) { result.push({ ...chunk, ordinal: result.length }); return; }
    const middle = Math.floor(chunk.content.length / 2);
    let split = chunk.content.lastIndexOf(' ', middle);
    if (split < middle / 2) split = middle;
    await fit({ ...chunk, content: chunk.content.slice(0, split) });
    await fit({ ...chunk, id: randomUUID(), content: chunk.content.slice(split).trim() });
  }
  for (const chunk of chunks) await fit(chunk);
  return result;
}
