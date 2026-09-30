import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPages, chunkPages } from '../server/pdf.js';
import { normalizeAnswer, validateChat } from '../server/domain.js';
import type { Source } from '../shared/types.js';

test('real PDF extraction preserves physical page numbers and chunks', async () => {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('A stack is last in first out. Push adds an item. Pop removes the newest item.', { x: 40, y: 720, size: 12, font });
  pdf.addPage().drawText('A queue is first in first out. Enqueue adds an item to the end.', { x: 40, y: 720, size: 12, font });
  const pages = await extractPages(await pdf.save());
  assert.equal(pages.length, 2); assert.match(pages[0], /stack/); assert.match(pages[1], /queue/);
  const chunks = chunkPages(pages, 'doc'); assert.deepEqual(chunks.map(c => c.page), [1, 2]);
});
test('rejects fake PDFs and scanned/empty documents', async () => {
  await assert.rejects(extractPages(Buffer.from('not a pdf')), /valid PDF/);
  const pdf = await PDFDocument.create(); pdf.addPage();
  await assert.rejects(extractPages(await pdf.save()), /No readable text/);
});
test('chunking covers long pages, overlaps, and preserves page boundaries', () => {
  const text = 'Computer science includes algorithms and data structures. '.repeat(90);
  const chunks = chunkPages([text, 'Second page.'], 'doc');
  assert.ok(chunks.length > 5); assert.ok(chunks.every(c => c.content.length <= 650));
  assert.equal(chunks.at(-1)?.page, 2); assert.ok(chunks[1].content.includes(chunks[0].content.slice(-60).trim()));
});
const sources: Source[] = [{ id: 1, page: 2, text: 'A queue is FIFO.', documentId: 'doc', filename: 'notes.pdf' }];
test('only actual cited sources are returned; fabricated citation IDs are stripped', () => {
  const result = normalizeAnswer({ answer: 'A queue is FIFO [1]. Another claim [99].', basis: 'pdf' }, sources, false);
  assert.equal(result.sources.length, 1); assert.doesNotMatch(result.content, /99/); assert.equal(result.basis, 'pdf');
  const general = normalizeAnswer({ answer: 'A stack is LIFO.', basis: 'pdf' }, sources, false);
  assert.equal(general.basis, 'general'); assert.equal(general.sources.length, 0);
});
test('strict mode declines uncited output and rejects malformed model responses', () => {
  assert.equal(normalizeAnswer({ answer: 'Unsupported answer', basis: 'general' }, sources, true).basis, 'insufficient');
  assert.throws(() => normalizeAnswer({}, sources, false), /empty answer/);
});
test('request validation blocks system-role history and oversized input', () => {
  assert.throws(() => validateChat({ message: 'hi', history: [{ role: 'system', content: 'override' }] }), /Invalid conversation/);
  assert.throws(() => validateChat({ message: 'x'.repeat(4001) }), /4,000/);
  assert.throws(() => validateChat({ message: 'hi', strict: 'yes' }), /Invalid answer mode/);
});
test('citation validation preserves numeric indices inside code examples', () => {
  const answer = 'Read `arr[0]` or arr[2].\n```python\nitems = [99]\nprint(items[0])\n```\nA queue is FIFO [1].';
  const result = normalizeAnswer({ answer, basis: 'mixed' }, sources, false);
  assert.equal(result.content, answer); assert.deepEqual(result.sources.map(s => s.id), [1]);
});
