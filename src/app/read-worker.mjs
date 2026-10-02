import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';

try {
  const buffer = readFileSync(workerData.path);
  if (workerData.kind === 'pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false,
      useSystemFonts: false, disableFontFace: true, verbosity: 0 });
    const document = await loading.promise;
    if (document.numPages > 20) throw new Error('PAGE_LIMIT');
    const pages = [];
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent();
      const text = content.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('').trim();
      if (text.length > 20000 || pages.reduce((n, p) => n + p.text.length, 0) + text.length > 80000) throw new Error('TEXT_LIMIT');
      pages.push({ page, text });
    }
    await loading.destroy();
    parentPort.postMessage({ pages });
  } else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).trim();
    if (text.length > 20000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('INVALID_TEXT');
    parentPort.postMessage({ pages: [{ page: 1, text }] });
  }
} catch (error) {
  parentPort.postMessage({ error: ['PAGE_LIMIT', 'TEXT_LIMIT', 'INVALID_TEXT', 'PasswordException'].includes(error.message || error.name)
    ? error.message || error.name : 'DOCUMENT_UNREADABLE' });
}
