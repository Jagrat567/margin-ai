import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { randomUUID } from 'node:crypto';
import { AppError, type Chunk } from './domain.js';
export async function extractPages(bytes: Uint8Array): Promise<string[]> {
  if (Buffer.from(bytes.subarray(0, 1024)).indexOf('%PDF-') < 0) throw new AppError(400, 'This file is not a valid PDF.');
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  let pdf;
  try { pdf = await task.promise; }
  catch { await task.destroy(); throw new AppError(400, 'Could not read this PDF. Check that it is valid and not password-protected.'); }
  try {
    if (pdf.numPages > 80) throw new AppError(400, 'Please upload a PDF with 80 pages or fewer.');
    const pages: string[] = []; let total = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').replace(/[ \t]+/g, ' ').trim();
      total += text.length;
      if (total > 250000) throw new AppError(400, 'This PDF has too much text. Please split it into smaller chapters.');
      pages.push(text);
    }
    if (pages.join('').trim().length < 30) throw new AppError(400, 'No readable text was found. Please use a text-based PDF; scanned pages need OCR.');
    return pages;
  } finally { await task.destroy(); }
}
export function chunkPages(pages: string[], documentId: string): Chunk[] {
  const chunks: Chunk[] = [];
  pages.forEach((text, index) => {
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 650, text.length);
      if (end < text.length) { const boundary = text.lastIndexOf(' ', end); if (boundary > start + 350) end = boundary; }
      const content = text.slice(start, end).trim();
      if (content) chunks.push({ id: randomUUID(), document_id: documentId, page: index + 1, content, ordinal: chunks.length });
      if (end === text.length) break;
      start = Math.max(start + 1, end - 90);
    }
  });
  if (chunks.length > 500) throw new AppError(400, 'Please split this PDF into smaller chapters.');
  return chunks;
}
