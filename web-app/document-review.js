const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statuses = { pending: 'Do sprawdzenia', confirmed: 'Zgodność potwierdzona', rejected: 'Odczyt odrzucony', missing: 'Brak odczytu strony' };
let cleanup = () => {};

export async function openDocumentReview({ state, documentId, page = 1, modal, onSave, token, assetBase, isLawyer }) {
  cleanup();
  const dialog = document.querySelector('#modal'), doc = state.documents.find(d => d.id === documentId);
  let alive = true, objectUrl, pdf, loadingTask, bytes, busy = false, renderVersion = 0;
  cleanup = () => { alive = false; renderVersion++; if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (loadingTask) loadingTask.destroy().catch(() => {}); dialog.classList.remove('document-review'); };
  dialog.addEventListener('close', cleanup, { once: true });
  const sources = () => {
    const pages = state.document_reviews?.find(d => d.document_id === doc.id)?.pages;
    return pages || state.sources.filter(s => s.document_id === doc.id && !s.superseded_by).map(s => ({ page: s.page, source_id: s.id, status: 'not_required' }));
  };
  function showError(error) { if (alive) dialog.querySelector('[data-ocr-error]').textContent = error.message || 'Nie udało się wykonać działania.'; }
  async function draw() {
    if (!alive) return;
    const version = ++renderVersion;
    const item = sources().find(p => p.page === page), source = state.sources.find(s => s.id === item?.source_id);
    const reviewable = item && item.status !== 'not_required', editable = reviewable && source;
    const history = state.sources.filter(s => s.document_id === doc.id && s.page === page && s.id !== source?.id);
    modal(`Oryginał i odczyt — ${doc.name}`, `<p class="small">Porównaj kwoty, waluty, daty, nazwy oraz negacje. Nieczytelne miejsca pozostaw jako [NIECZYTELNE]. Potwierdzasz zgodność transkrypcji z obrazem; fakty wymagają osobnego przeglądu.</p>
      <div class="row"><button type="button" data-ocr-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Poprzednia</button><strong>Strona ${page} z ${doc.pages}</strong><button type="button" data-ocr-page="${page + 1}" ${page >= doc.pages ? 'disabled' : ''}>Następna</button></div>
      <p data-ocr-error role="alert"></p><div class="ocr-columns"><section><h3>Oryginał</h3><button type="button" class="quiet" data-ocr-zoom>Powiększ / dopasuj</button><div class="ocr-original" data-ocr-original>Wczytywanie strony…</div><p class="small">Obraz można przewijać. Oryginalny plik pozostaje bez zmian.</p></section>
      <section><h3>Odczyt ${reviewable ? '· ' + escape(statuses[item.status]) : ''}</h3>
      ${source?.correction ? `<p class="small">Korekta: ${escape(source.correction.actor)} · ${escape(source.correction.at)}<br>${escape(source.correction.note)}</p>` : ''}
      ${source?.page_review ? `<p class="small">${escape(source.page_review.reviewed_by)} · ${escape(source.page_review.reviewed_at)}<br>${escape(source.page_review.note)}</p>` : ''}
      <form data-ocr-form><label for="ocr-text">Tekst tej strony</label><textarea id="ocr-text" maxlength="20000" ${editable ? '' : 'readonly'}>${escape(source?.text || '')}</textarea>
      ${editable ? `<label for="ocr-note">Uzasadnienie korekty lub odrzucenia</label><textarea id="ocr-note" maxlength="2000" placeholder="Opisz zauważoną różnicę albo nieczytelność"></textarea><div class="row"><button type="submit">Zapisz poprawiony tekst</button>${isLawyer ? '<button type="button" data-ocr-review="confirmed">Potwierdź zgodność z oryginałem</button><button type="button" class="danger" data-ocr-review="rejected">Odrzuć odczyt</button>' : ''}</div><p class="small">Korekta zachowuje poprzedni tekst i kieruje zależne dane do ponownego przeglądu. Zgodność potwierdza konto z rolą prawnika.</p>` : ''}</form>
      ${history.length ? `<details><summary>Wcześniejsze odczyty tej strony (${history.length})</summary>${history.map(s => `<p class="small">${escape(s.read_method)}</p><pre class="source">${escape(s.text || 'Brak tekstu')}</pre>`).join('')}</details>` : ''}</section></div>`);
    dialog.classList.add('document-review');
    dialog.querySelector('[data-ocr-zoom]').addEventListener('click', () => dialog.querySelector('[data-ocr-original]').classList.toggle('zoomed'));
    for (const button of dialog.querySelectorAll('[data-ocr-page]')) button.addEventListener('click', async () => {
      const next = Number(button.dataset.ocrPage); if (busy || next < 1 || next > doc.pages) return;
      busy = true; page = next; try { await draw(); } catch (e) { showError(e); } finally { busy = false; }
    });
    const save = async (action, input) => {
      if (busy) return;
      busy = true; dialog.querySelectorAll('[data-ocr-form] button, [data-ocr-page]').forEach(b => b.disabled = true);
      try { state = await onSave(action, input); await draw(); }
      catch (error) { showError(error); }
      finally { busy = false; dialog.querySelectorAll('[data-ocr-form] button').forEach(b => b.disabled = false);
        for (const b of dialog.querySelectorAll('[data-ocr-page]')) b.disabled = Number(b.dataset.ocrPage) < 1 || Number(b.dataset.ocrPage) > doc.pages; }
    };
    dialog.querySelector('[data-ocr-form]').addEventListener('submit', event => {
      event.preventDefault(); event.stopPropagation();
      save('correct-ocr-page', { source_id: source.id, text: dialog.querySelector('#ocr-text').value, note: dialog.querySelector('#ocr-note').value });
    });
    for (const button of dialog.querySelectorAll('[data-ocr-review]')) button.addEventListener('click', () => {
      if (dialog.querySelector('#ocr-text').value !== source.text) { showError(new Error('Najpierw zapisz zmieniony tekst.')); return; }
      save('review-ocr-page', { source_id: source.id, review: button.dataset.ocrReview, note: dialog.querySelector('#ocr-note').value });
    });
    if (!bytes) {
      const response = await fetch(`${assetBase}/api/cases/${state.id}/files/${doc.id}`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit' });
      if (!response.ok) throw new Error('Nie można pobrać oryginału. Sprawdź dostęp do sprawy.');
      bytes = await response.arrayBuffer();
    }
    if (!alive || version !== renderVersion) return;
    const target = dialog.querySelector('[data-ocr-original]'); target.textContent = '';
    if (doc.kind === 'pdf') {
      if (!pdf) {
        const pdfjs = await import(`${assetBase}/pdf.mjs`);
        pdfjs.GlobalWorkerOptions.workerSrc = `${assetBase}/pdf.worker.mjs`;
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false, useSystemFonts: true });
        pdf = await loadingTask.promise;
      }
      if (!alive || version !== renderVersion) return;
      const pdfPage = await pdf.getPage(page), viewport = pdfPage.getViewport({ scale: 1.5 });
      // Protect the UI against enormous page dimensions in an untrusted PDF.
      const scale = Math.min(1, 2000 / Math.max(viewport.width, viewport.height));
      const fitted = pdfPage.getViewport({ scale: 1.5 * scale });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(fitted.width); canvas.height = Math.ceil(fitted.height);
      canvas.setAttribute('aria-label', `Oryginał, strona ${page}`); target.append(canvas);
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: fitted }).promise;
    } else if (['png', 'jpeg'].includes(doc.kind)) {
      if (!objectUrl) objectUrl = URL.createObjectURL(new Blob([bytes], { type: `image/${doc.kind}` }));
      const img = document.createElement('img'); img.src = objectUrl; img.alt = `Oryginał ${doc.name}`; target.append(img);
    } else {
      const pre = document.createElement('pre'); pre.textContent = new TextDecoder().decode(bytes); target.append(pre);
    }
  }
  try { await draw(); } catch (error) { showError(error); }
}
