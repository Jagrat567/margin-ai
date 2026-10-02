import type { WebSource } from '../shared/types.js';
import { AppError } from './domain.js';

export async function searchWeb(query: string, key: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<(WebSource & { content: string })[]> {
  if (!key.trim()) throw new AppError(503, 'Web search is not configured. Turn off Web to chat without search.');
  const news = /\b(news|headlines|current events)\b/i.test(query);
  const today = /\b(today|latest|breaking)\b/i.test(query);
  let response: Response;
  try {
    response = await fetcher('https://api.tavily.com/search', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.slice(0, 400), search_depth: 'basic', max_results: 5, topic: news ? 'news' : 'general', ...(news && today ? { time_range: 'day' } : {}), include_published_date: true, include_answer: false, include_raw_content: false, auto_parameters: false }),
      signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]),
    });
  } catch {
    signal?.throwIfAborted();
    throw new AppError(503, 'Web search took too long. Try again or turn off Web.');
  }
  if ([429, 432, 433].includes(response.status)) throw new AppError(429, 'The web search quota is busy or used up. Try later or turn off Web.');
  if (!response.ok) throw new AppError(503, 'Web search is unavailable. Try later or turn off Web.');
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data?.results)) throw new AppError(502, 'Web search returned an invalid response. Please try again.');
  const seen = new Set<string>();
  const sources: (WebSource & { content: string })[] = [];
  for (const result of data.results) {
    if (!result || typeof result.url !== 'string' || typeof result.content !== 'string' || !result.content.trim()) continue;
    let url: URL;
    try { url = new URL(result.url); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) continue;
    seen.add(url.href);
    sources.push({ url: url.href, title: typeof result.title === 'string' ? result.title.slice(0, 200) : url.hostname, content: result.content.slice(0, 1800), ...(typeof result.published_date === 'string' ? { publishedDate: result.published_date.slice(0, 40) } : {}) });
    if (sources.length === 5) break;
  }
  return sources;
}
