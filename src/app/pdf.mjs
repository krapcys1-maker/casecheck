import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { draftReady } from './portal.mjs';

export async function renderDraft(draft, state) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 55, left: 48, right: 48 },
      bufferPages: true, info: { Title: draft.title, Author: 'CaseCheck', Subject: 'Projekt do przeglądu' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.font(fileURLToPath(new URL('../../assets/DejaVuSans.ttf', import.meta.url)));
    const approved = draftReady(draft, state);
    doc.fontSize(9).fillColor('#943d32').text(state.synthetic ? 'MATERIAŁ TESTOWY — WSZYSTKIE DANE SĄ FIKCYJNE' : 'DOKUMENT SPRAWY — DOSTĘP OGRANICZONY');
    doc.moveDown().fontSize(18).fillColor('#182d27').text(draft.title);
    doc.moveDown(0.5).fontSize(9).fillColor('#606a66').text(`Data projektu: ${draft.created_at.slice(0, 10)} | Wersja danych: ${draft.source_revision} | ${approved ? 'Zatwierdzono: ' + draft.approved_by : 'PROJEKT — wymaga przeglądu'}`);
    doc.moveDown().fontSize(10).fillColor('#222222').text('Dokument pomocniczy. Nie jest urzędowym formularzem ani automatycznie złożonym pismem. Pola do uzupełnienia pozostają oznaczone.');
    for (const section of draft.sections) {
      doc.moveDown();
      if (doc.y > 720) doc.addPage();
      doc.fontSize(12).fillColor('#182d27').text(section.heading);
      doc.moveDown(0.4).fontSize(10).fillColor('#222222');
      for (const paragraph of section.text.split('\n\n')) {
        const height = doc.heightOfString(paragraph, { width: 499, lineGap: 3 });
        if (doc.y + height > doc.page.height - doc.page.margins.bottom && height < 720) doc.addPage();
        doc.text(paragraph, { lineGap: 3 }); doc.moveDown(0.5);
      }
    }
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page++) {
      doc.switchToPage(page);
      const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
      doc.fontSize(7).fillColor('#606a66').text(`Wzór: ${draft.template_version}. Identyfikator wersji treści: ${draft.content_hash.slice(0, 16)}`, 48, 791,
        { lineBreak: false, width: 499 });
      doc.fontSize(8).fillColor('#777777').text(`CaseCheck | ${approved ? 'Zatwierdzona wersja' : 'Projekt'} | ${page + 1}/${range.count}`, 48, 805,
        { lineBreak: false, width: 490 });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
