import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';

try {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const loading = getDocument({ data: new Uint8Array(readFileSync(workerData.path)), isEvalSupported: false,
    useSystemFonts: false, verbosity: 0 });
  const doc = await loading.promise;
  try {
    if (doc.numPages < 1 || doc.numPages > 5 || doc.numPages !== workerData.pages) throw new Error('OCR_FILE_LIMIT');
    const images = []; let bytes = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), original = page.getViewport({ scale: 1 });
      if (![original.width, original.height].every(v => Number.isFinite(v) && v > 0 && v <= 14400)) throw new Error('OCR_FILE_LIMIT');
      const viewport = page.getViewport({ scale: Math.min(2, 2000 / original.width, 2000 / original.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white' }).promise;
      const png = canvas.toBuffer('image/png'); bytes += png.length;
      if (bytes > 12 * 1024 * 1024) throw new Error('OCR_FILE_LIMIT');
      images.push(`data:image/png;base64,${png.toString('base64')}`);
      page.cleanup();
    }
    parentPort.postMessage({ images });
  } finally { await loading.destroy(); }
} catch (error) {
  parentPort.postMessage({ error: error.message === 'OCR_FILE_LIMIT' ? 'OCR_FILE_LIMIT' : 'OCR_RENDER_FAILED' });
}
