import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchWeb } from '../server/search.js';
import { validateChat } from '../server/domain.js';

test('search is opt-in and validates the setting', () => {
  assert.equal(validateChat({ message: 'Hello' }).webSearch, false);
  assert.equal(validateChat({ message: 'Hello', webSearch: true }).webSearch, true);
  assert.throws(() => validateChat({ message: 'Hello', webSearch: 'true' }));
});
test('news uses one basic search and returns bounded safe sources', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(body.search_depth, 'basic');
    assert.equal(body.auto_parameters, false);
    assert.equal(body.topic, 'news');
    assert.equal(body.time_range, 'day');
    return Response.json({ results: [
      { url: 'javascript:alert(1)', content: 'unsafe' },
      { url: 'https://example.com/news', title: 'Story', content: 'a'.repeat(5000), published_date: '2026-10-02' },
      { url: 'https://example.com/news', content: 'duplicate' },
    ] });
  };
  const sources = await searchWeb('Today news', 'test-key', undefined, fetcher);
  assert.equal(calls, 1);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].content.length, 1800);
  assert.equal(sources[0].publishedDate, '2026-10-02');
});
test('missing key, quota, malformed results and cancellation fail explicitly', async () => {
  await assert.rejects(searchWeb('hello', '', undefined, async () => { throw new Error('must not call'); }), /not configured/);
  await assert.rejects(searchWeb('hello', 'test', undefined, async () => new Response('', { status: 432 })), /quota/);
  await assert.rejects(searchWeb('hello', 'test', undefined, async () => Response.json({})), /invalid response/);
  assert.deepEqual(await searchWeb('hello', 'test', undefined, async () => Response.json({ results: [] })), []);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchWeb('hello', 'test', controller.signal, async (_url, init) => { init!.signal!.throwIfAborted(); return Response.json({}); }), { name: 'AbortError' });
});
