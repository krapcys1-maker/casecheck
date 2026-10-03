export function portalPanel({ state, client, lawyer, escape: e, button: b }) {
  const status = { open: 'Do uzupełnienia', submitted: 'Odpowiedź czeka na sprawdzenie', accepted: 'Przyjęto' };
  return `<div class="panels"><div class="card"><h3>${client ? 'Czego potrzebujemy od Ciebie' : 'Prośby do klienta'}</h3>
    ${!client ? `<form id="client-request-form"><label for="request-title">Potrzebny dokument lub informacja</label><input id="request-title" required maxlength="200"><label for="request-description">Wyjaśnienie dla klienta</label><textarea id="request-description" maxlength="4000"></textarea><label for="request-date">Oczekiwana data odpowiedzi (organizacyjna)</label><input id="request-date" type="date"><p class="small">Ta data nie wyznacza terminu prawnego.</p><button>Dodaj prośbę do portalu</button></form>` : '<p class="small">Załączniki dodaj w zakładce Załączniki, a następnie dołącz je do odpowiedniej prośby.</p>'}
    ${(state.portal?.requests || []).map(r => `<article class="document"><h3>${e(r.title)}</h3><p class="article">${e(r.description)}</p><p class="small">${e(status[r.status])}${r.target_date ? ' · oczekiwana odpowiedź: ' + e(r.target_date) : ''}</p>
      ${r.responses.map(a => `<div class="quote"><p class="article">${e(a.text)}</p><p class="small">${e(a.at)}</p>${a.document_ids.map(id => { const doc = state.documents.find(d => d.id === id); return doc ? b('Załącznik: ' + doc.name, 'download-file', id) : '<p class="small">Plik niedostępny</p>'; }).join('')}</div>`).join('')}
      ${r.review_note ? `<p class="small">Uwagi kancelarii: ${e(r.review_note)}</p>` : ''}
      <div class="row">${client && r.status !== 'accepted' ? b('Odpowiedz / dołącz pliki', 'request-answer', r.id) : ''}${!client && r.status === 'submitted' ? b('Przyjmij odpowiedź', 'request-accept', r.id) : ''}${!client && r.status !== 'open' ? b('Poproś o uzupełnienie', 'request-reopen', r.id) : ''}</div></article>`).join('') || '<p class="small">Nie ma jeszcze próśb o uzupełnienie.</p>'}</div>
    <div class="card"><h3>Pisma udostępnione klientowi</h3><p class="small">Dostępna jest wyłącznie aktualna, zatwierdzona wersja. Potwierdzenie zapoznania się nie jest podpisem elektronicznym.</p>
    ${(state.portal?.releases || []).slice().reverse().map(r => `<article class="document"><h3>${e(r.title)}</h3><p class="small">Udostępniono: ${e(r.shared_at)} · wersja danych ${r.source_revision}</p>
      <p>${r.available ? 'Gotowe do przeczytania' : r.status === 'revoked' ? 'Udostępnienie odwołano' : 'Dane lub wzór zmieniły się — oczekuje na ponowny przegląd'}</p>
      <div class="row">${r.available ? b('Pobierz sprawdzony PDF', 'download-release', r.id) : ''}${client && r.available && !r.read_at ? b('Potwierdzam zapoznanie się', 'acknowledge-release', r.id) : ''}${lawyer && r.status !== 'revoked' ? b('Odwołaj udostępnienie', 'revoke-release', r.id) : ''}</div>${r.read_at ? `<p class="small">Klient potwierdził zapoznanie się: ${e(r.read_at)}</p>` : ''}</article>`).join('') || '<p class="small">Kancelaria nie udostępniła jeszcze pisma.</p>'}</div></div>`;
}

export function responseForm(request, documents, e) {
  return `<form id="request-answer-form" data-request="${e(request.id)}"><p>${e(request.description)}</p><label for="request-answer">Odpowiedź</label><textarea id="request-answer" maxlength="4000"></textarea><p class="small">Dołącz wcześniej dodane pliki:</p>${documents.map(d => `<label><input type="checkbox" name="response-document" value="${e(d.id)}"> ${e(d.name)}</label>`).join('') || '<p class="small">Najpierw dodaj plik w zakładce Załączniki albo wpisz odpowiedź.</p>'}<button>Przekaż do sprawdzenia</button></form>`;
}

export function templateManager(templates, lawyer, e, b) {
  return `<p>Wzory kancelarii mogą zawierać pola sprawy. Każda zmiana wymaga zatwierdzenia wzoru przez prawnika i ponownego przeglądu zależnych pism.</p>${b('Nowy wzór kancelarii', 'template-edit')}${templates.map(t => `<article class="document"><h3>${e(t.title)}</h3><p class="small">Wersja ${t.revision} · ${t.status === 'approved' ? 'Zatwierdzony przez: ' + e(t.approved_by) : 'Oczekuje na przegląd'} · ${t.tracks.map(v => v === 'consumer' ? 'Konsument' : 'Firma').join(', ')}</p><div class="row">${b('Przeczytaj', 'template-view', t.id)}${b('Edytuj wzór', 'template-edit', t.id)}${b('Historia wersji', 'template-history', t.id)}${lawyer && t.status === 'draft' ? b('Zatwierdź wzór', 'template-approve', t.id) : ''}</div></article>`).join('')}`;
}

export function templateEditor(template, fields, e) {
  const content = template?.sections.map(s => `## ${s.heading}\n${s.text}`).join('\n\n') || '## Informacje o sprawie\nSprawa: {{case.title}}\nData przygotowania: {{today}}\n\n## Informacje do uzupełnienia\n{{missing.list}}';
  return `<form id="firm-template-form" data-template="${e(template?.id || '')}" data-revision="${template?.revision || ''}"><label for="firm-title">Nazwa wzoru</label><input id="firm-title" value="${e(template?.title || '')}" required maxlength="150"><label for="firm-track">Rodzaj spraw</label><select id="firm-track">${[['both', 'Obie ścieżki'], ['consumer', 'Konsumenckie'], ['company', 'Firmowe']].map(([v, l]) => `<option value="${v}" ${template?.tracks.length === 1 && template.tracks[0] === v ? 'selected' : ''}>${l}</option>`).join('')}</select><label for="firm-content">Treść wzoru — nagłówki zaczynaj od ##</label><textarea id="firm-content" rows="16" required maxlength="60000">${e(content)}</textarea><details><summary>Dostępne pola sprawy</summary><p class="small">Pola są uzupełniane wyłącznie potwierdzonymi wartościami. Brak wymaganego pola zablokuje zatwierdzenie pisma.</p>${fields.map(f => `<p class="small"><code>{{${e(f.key)}}}</code> — ${e(f.label)}</p>`).join('')}</details><button>Zapisz wzór do przeglądu</button></form>`;
}

export function parseTemplateText(content) {
  const sections = []; let current;
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('## ')) { current = { heading: line.slice(3).trim(), text: '' }; sections.push(current); }
    else if (current) current.text += (current.text ? '\n' : '') + line;
    else if (line.trim()) throw new Error('Zacznij wzór od nagłówka: ## Nazwa sekcji');
  }
  if (!sections.length || sections.some(s => !s.heading || !s.text.trim())) throw new Error('Każda sekcja musi mieć nagłówek i treść.');
  return sections.map(s => ({ heading: s.heading, text: s.text.trim() }));
}
