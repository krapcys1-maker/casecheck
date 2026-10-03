import { Document, Packer, Paragraph, TextRun, HeadingLevel, Footer, PageNumber, AlignmentType } from 'docx';
import { draftReady } from './portal.mjs';

export async function renderDraftDocx(draft, state) {
  const approved = draftReady(draft, state);
  const body = [new Paragraph({ text: state.synthetic ? 'MATERIAŁ TESTOWY — WSZYSTKIE DANE SĄ FIKCYJNE' : 'DOKUMENT SPRAWY — DOSTĘP OGRANICZONY', spacing: { after: 200 } }),
    new Paragraph({ text: draft.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Data projektu: ${draft.created_at.slice(0, 10)} · wersja danych: ${draft.source_revision} · ${approved ? 'Zatwierdzono: ' + draft.approved_by : 'PROJEKT — wymaga przeglądu'}`, spacing: { after: 200 } }),
    new Paragraph({ text: 'Edytowalna kopia pomocnicza. Zmiana treści w Wordzie wymaga ponownego przeglądu; oznaczenie zatwierdzenia dotyczy wersji zapisanej w CaseCheck. Dokument nie jest podpisany ani wysłany.', spacing: { after: 240 } })];
  for (const section of draft.sections) {
    body.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 240, after: 120 } }));
    for (const paragraph of section.text.split('\n\n')) body.push(new Paragraph({ spacing: { after: 160, line: 276 }, widowControl: true, keepLines: true,
      children: paragraph.split('\n').flatMap((line, i) => [new TextRun({ text: line, ...(i ? { break: 1 } : {}) })]) }));
  }
  const doc = new Document({ creator: 'CaseCheck', title: draft.title, description: 'Edytowalna kopia dokumentu sprawy',
    styles: { default: { document: { run: { font: 'Calibri', size: 22, color: '000000' }, paragraph: { spacing: { after: 160 } } },
      title: { run: { font: 'Calibri', size: 36, bold: true, color: '000000' }, paragraph: { spacing: { after: 220 }, keepNext: true } },
      heading1: { run: { font: 'Calibri', size: 26, bold: true, color: '000000' } } },
      paragraphStyles: [{ id: 'Metadata', name: 'Metadata', basedOn: 'Normal', run: { size: 17, color: '555555' } }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: { default: new Footer({ children: [
        new Paragraph({ text: `Wzór: ${draft.template_version}`, style: 'Metadata', spacing: { after: 30 } }),
        new Paragraph({ text: `SHA-256 treści w CaseCheck: ${draft.content_hash}`, style: 'Metadata', spacing: { after: 60 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'CaseCheck · ', size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18 })] })] }) }, children: body }] });
  return Packer.toBuffer(doc);
}
