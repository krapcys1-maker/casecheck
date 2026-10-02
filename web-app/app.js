const base = new URL('.', location.href).pathname.replace(/\/$/, '');
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const labels = { intake: 'Wywiad', review: 'Przegląd', documents: 'Dokumenty', closed: 'Zamknięta', pending: 'Do przeglądu', confirmed: 'Potwierdzone',
  rejected: 'Odrzucone', draft: 'Projekt', approved: 'Zatwierdzone', stale: 'Nieaktualne', read: 'Tekst odczytany', ocr_required: 'Wymaga OCR',
  ocr_review: 'OCR do sprawdzenia', read_failed: 'Błąd odczytu', reading: 'Odczytywanie', completed: 'Wykonano', failed: 'Błąd', discarded: 'Wynik starej wersji',
  possible_duplicate: 'Możliwy drugi dokument tego samego długu', amount_requires_review: 'Kwota lub data wymaga przeglądu', components_mismatch: 'Składniki nie zgadzają się z sumą', disputed: 'Roszczenie sporne' };
const errors = { LOGIN_FAILED: 'Nieprawidłowy adres konta lub hasło.', UNAUTHORIZED: 'Zaloguj się ponownie lub otwórz aktualny link do sprawy.',
  VERSION_CONFLICT: 'Sprawa zmieniła się w trakcie pracy. Odświeżam jej aktualną wersję.', DAILY_LIMIT: 'Wykorzystano dzisiejszy limit wywołań AI.',
  REQUEST_IN_PROGRESS: 'Trwa inny odczyt AI. Spróbuj po jego zakończeniu.', CONSENT_REQUIRED: 'Najpierw zaakceptuj przekazanie danych do wybranego dostawcy.',
  LAWYER_REQUIRED: 'To działanie wymaga konta z rolą prawnika.', KNOWLEDGE_REVIEW_REQUIRED: 'Prawnik musi zatwierdzić pytania i wzory przed analizą rzeczywistych danych.',
  UNREVIEWED_FACTS: 'Przed zatwierdzeniem projektu sprawdź fakty, roszczenia i możliwe duplikaty.', DRAFT_OUTDATED: 'Ten projekt dotyczy wcześniejszej wersji danych. Utwórz aktualny projekt.',
  PASSWORD_LENGTH: 'Hasło powinno mieć od 16 do 256 znaków.', UNSUPPORTED_FILE: 'Obsługiwane pliki: PDF, PNG, JPEG i TXT.', LOGIN_RATE_LIMIT: 'Odczekaj minutę przed kolejną próbą logowania.' };
const claimLabels = { creditor_name: 'Wierzyciel', creditor_address: 'Adres wierzyciela', agreement_number: 'Numer umowy lub faktury',
  original_creditor: 'Poprzedni wierzyciel', principal_amount: 'Kapitał', interest_amount: 'Odsetki', costs_amount: 'Koszty', total_amount: 'Łączna kwota',
  balance_date: 'Data salda', due_date: 'Termin zapłaty', security_description: 'Zabezpieczenie', security_creation_date: 'Data ustanowienia zabezpieczenia',
  disputed: 'Czy roszczenie jest sporne', disputed_scope: 'Zakres sporu', assignment_date: 'Data cesji' };
let token = '', user = null, config = null, cases = [], team = [], selected = null, tab = 'overview', locked = false;
const isClient = () => user?.role === 'client';
const isLawyer = () => user?.role === 'lawyer';
const button = (title, action, value = '', kind = 'secondary') => `<button type="button" class="${kind}" data-action="${action}" data-value="${escape(value)}">${escape(title)}</button>`;
const badge = (status, warn = false) => `<span class="badge ${warn ? 'warn' : ''}">${escape(labels[status] || status)}</span>`;
const fieldLabel = key => config?.knowledge.intake.fields.find(f => f.key === key)?.label || key;
const valueOf = f => !f || f.type === 'unknown' ? 'Brak danych' : f.type === 'money' ?
  `${f.precision === 'approximate' ? 'około ' : ''}${(f.minor_units / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${f.currency}${f.as_of ? ' · ' + f.as_of : ''}` :
  f.type === 'boolean' ? f.boolean_value ? 'Tak' : 'Nie' : f.text_value;
function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
async function api(path, input, { method = input === undefined ? 'GET' : 'POST', raw = false, headers = {} } = {}) {
  const response = await fetch(base + '/api' + path, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(input !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers,
  }, body: input === undefined ? undefined : raw ? input : JSON.stringify(input), credentials: 'omit' });
  if (!response.ok) {
    let code = 'NETWORK_ERROR'; try { code = (await response.json()).error; } catch {}
    const error = new Error(errors[code] || `Działanie nie zostało wykonane (${code}).`); error.code = code; throw error;
  }
  return response.json();
}
async function download(path, name) {
  const response = await fetch(base + '/api' + path, { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit' });
  if (!response.ok) throw new Error('Nie można pobrać pliku.');
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = name;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function modal(title, html) {
  $('#modal-content').innerHTML = `<h2>${escape(title)}</h2>${html}`;
  if (!$('#modal').open) $('#modal').showModal();
}
function renderList() {
  const query = $('#search').value.toLowerCase();
  const filter = $('#case-filter').value;
  const visible = cases.filter(c => c.title.toLowerCase().includes(query) && (filter === 'all' ||
    filter === c.track || filter === 'review' && (c.summary.pending_facts + c.summary.pending_claims > 0) ||
    filter === 'tasks' && c.summary.open_tasks > 0));
  $('#case-count').textContent = `${visible.length} z ${cases.length} spraw`;
  $('#case-list').innerHTML = visible.map(c =>
    `<button class="case-item ${selected?.id === c.id ? 'active' : ''}" data-action="open-case" data-value="${c.id}">${escape(c.title)}<small>${c.track === 'consumer' ? 'Konsument' : 'Firma'} · ${escape(labels[c.stage])}${c.synthetic ? ' · fikcyjne dane' : ''}</small></button>`).join('') || '<p class="small">Nie ma jeszcze spraw.</p>';
  const sum = key => cases.reduce((n, c) => n + c.summary[key], 0);
  $('#workspace-summary').innerHTML = `<div><strong>${cases.length}</strong><span>Spraw w kartotece</span></div><div><strong>${sum('pending_facts') + sum('pending_claims')}</strong><span>Odczytów do przeglądu</span></div><div><strong>${sum('open_tasks')}</strong><span>Otwartych zadań · ${sum('overdue_tasks')} po dacie docelowej (UTC)</span></div>`;
}
async function refreshConfig() {
  config = await api('/config');
  if (config.budget) $('#budget').textContent = `AI dziś: ${config.budget.used}/${config.budget.limit}`;
}
async function openCase(id) { selected = await api('/cases/' + id); render(); }
async function refresh() {
  await refreshConfig();
  if (isClient()) { selected = await api('/cases/' + user.case_id); render(); return; }
  cases = (await api('/cases')).cases;
  team = (await api('/team')).team;
  if (selected) selected = await api('/cases/' + selected.id);
  renderList(); render();
}
function welcomePanel() {
  const examples = [['S01', 'Rozbieżność salda', 'Deklaracja klienta i trzy dokumenty. Przejdź od różnicy kwot do źródeł i zadań.'],
    ['S02', 'Cesja i drugi dokument', 'Dwie informacje o tej samej umowie. Właściwy wierzyciel i saldo wymagają przeglądu.'],
    ['S04', 'Roszczenie sporne', 'Oddziel odczyt dokumentu od stanowiska klienta. Zachowaj zakres sporu.']];
  return `<div class="card welcome"><p class="eyebrow">OD ŹRÓDŁA DO PRZEGLĄDU</p><h2>Uporządkowana sprawa.<br>Świadoma decyzja.</h2><p>Otwórz sprawę, porównaj odczyt z dokumentem i zobacz, co wymaga uzupełnienia. Panel pokazuje rzeczywisty stan zapisanych danych.</p><div class="demo-cards">${examples.map(([code, title, text]) => { const c = cases.find(c => c.synthetic && c.title.startsWith(code + ' ')); return `<article><span class="eyebrow">${code} / FIKCYJNE DANE</span><h3>${title}</h3><p class="small">${text}</p>${c ? button('Otwórz scenariusz', 'open-case', c.id) : '<p class="small">Administrator może wczytać materiały testowe.</p>'}</article>`; }).join('')}</div><p class="small">Import materiałów testowych dodaje źródła. Wyniki AI pojawiają się po osobnym odczycie; przegląd testowy pozostaje wyraźnie oznaczony.</p></div>`;
}
function overviewPanel() {
  const s = selected.review_summary, checks = selected.controls;
  const points = [];
  if (checks.difference?.minor_units) points.push(['claims', 'Rozbieżność salda', `Deklaracja klienta różni się od dokumentów o ${valueOf({ ...checks.difference, type: 'money', precision: 'exact' })}. Wyjaśnij różnicę przed dalszą pracą.`]);
  if (s.duplicate_pairs) points.push(['claims', 'Możliwe dokumenty tego samego długu', `${s.duplicate_pairs} par do powiązania. System pomija je w sumie do czasu przeglądu.`]);
  if (s.disputed_claims) points.push(['claims', 'Roszczenia sporne', `${s.disputed_claims} pozycji ze sporem. Potwierdzenie odczytu nie oznacza uznania długu.`]);
  if (s.pending_facts + s.pending_claims) points.push(['facts', 'Odczyty czekają na człowieka', `${s.pending_facts} pól wywiadu i ${s.pending_claims} roszczeń do przeglądu źródeł.`]);
  if (s.unread_documents || s.ocr_documents) points.push(['docs', 'Sprawdź załączniki', `${s.unread_documents} plików bez zakończonego odczytu; ${s.ocr_documents} odczytów OCR do porównania z obrazem.`]);
  if (s.missing_fields) points.push(['chat', 'Uzupełnij wywiad', `${s.missing_fields} obszarów bez danych. Brak informacji pozostaje widoczny.`]);
  if (selected.handoff) points.unshift(['chat', 'Klient prosi o kontakt', 'Przejmij rozmowę i ustal następny krok.']);
  const open = selected.tasks.filter(t => t.status === 'open');
  return `<div class="review-metrics"><div class="stat"><strong>${s.known_fields} / ${s.field_count}</strong><span>Uzupełnione pola wywiadu · ${s.confirmed_fields} po przeglądzie</span></div><div class="stat"><strong>${s.active_claims}</strong><span>Aktywne roszczenia · ${s.pending_claims} do przeglądu</span></div><div class="stat"><strong>${s.approved_drafts}</strong><span>Aktualne projekty po przeglądzie</span></div></div><div class="panels"><div class="card"><p class="eyebrow">NASTĘPNE KROKI</p><h3>Co wymaga uwagi</h3>${points.map(([key, title, text]) => `<div class="review-point"><div><strong>${escape(title)}</strong><p class="small">${escape(text)}</p></div>${button('Sprawdź', 'tab', key)}</div>`).join('') || '<p>Dane przeszły bieżące kontrole techniczne. Dalszy krok ustala osoba prowadząca sprawę.</p>'}</div><div class="review-side"><div class="card"><p class="eyebrow">KONTROLA SALD</p><h3>Kwoty mają kontekst</h3>${checks.totals.map(t => `<p class="balance"><strong>${escape(valueOf({ ...t, type: 'money', precision: 'exact' }))}</strong><span>Potwierdzony odczyt · ${escape(t.as_of)}</span></p>`).join('') || '<p class="small">Suma pojawi się po przeglądzie kwot, dat i duplikatów.</p>'}<p class="small">Pominięte pozycje: ${checks.excluded_claims}. Waluty i daty salda pozostają osobno.</p>${button('Otwórz zobowiązania', 'tab', 'claims')}</div><div class="card"><p class="eyebrow">ODPOWIEDZIALNOŚĆ</p><h3>Otwarte zadania: ${open.length}</h3>${open.slice(0, 3).map(t => `<p class="small"><strong>${escape(t.title)}</strong><br>${escape(team.find(u => u.id === t.assignee)?.name || (t.assignee ? 'Konto nieaktywne' : 'Bez przypisania'))} · ${escape(t.due || 'bez daty')}</p>`).join('')}${button('Zadania i etap', 'tab', 'tasks')}</div></div></div>`;
}
async function enter() {
  $('#login').hidden = true; $('#identity').textContent = isClient() ? 'Wywiad klienta' : `${user.name} · ${user.role === 'admin' ? 'administrator' : user.role === 'lawyer' ? 'prawnik' : 'pracownik'}`;
  $('#logout').hidden = false; $('#workspace').hidden = isClient(); $('#client-workspace').hidden = !isClient();
  $('#seed').hidden = user.role !== 'admin'; $('#settings-button').hidden = !['admin', 'lawyer'].includes(user.role);
  await refresh();
}
function consentPanel() {
  return `<div class="privacy"><p>${escape(config.notice)}</p><label for="provider">Dostawca odczytu AI</label><select id="provider">${config.providers.map(p => `<option value="${p.provider}" ${selected.consent?.provider === p.provider ? 'selected' : ''}>${p.provider} · ${escape(p.model)}</option>`).join('')}</select><p class="small">${selected.consent ? 'Przekazanie danych zaakceptowano: ' + escape(selected.consent.provider) : 'Przed pierwszym odczytem potwierdź zakres przekazania danych.'}</p>${button('Akceptuję przekazanie wybranych danych', 'consent')}</div>`;
}
function chatPanel() {
  const fields = config.knowledge.intake.fields.filter(f => f.tracks.includes(selected.track));
  const missing = selected.missing || selected.controls.missing_fields;
  return `<div class="panels"><div class="card"><h3>Rozmowa</h3><div class="chat-log">${selected.messages.map(m => `<div class="message ${m.role}"><small>${m.role === 'user' ? 'Klient / informacja' : 'CaseCheck'}</small>${escape(m.text)}</div>`).join('')}</div><form id="message-form"><label for="answer-field">Informacja, którą podajesz lub poprawiasz</label><select id="answer-field">${fields.map(f => `<option value="${f.key}" ${missing[0]?.key === f.key ? 'selected' : ''}>${escape(f.label)}</option>`).join('')}</select><label for="answer">Twoja odpowiedź</label><textarea id="answer" placeholder="Opisz sytuację własnymi słowami…" required maxlength="12000"></textarea><label><input id="use-ai" type="checkbox" ${selected.consent ? 'checked' : ''}> Odczytaj tę odpowiedź przez wybrane API</label><button type="submit">Zapisz i kontynuuj</button></form></div><div><div class="card"><p class="eyebrow">NASTĘPNE PYTANIE</p><h3>${escape(selected.next_question)}</h3><p class="small">Możesz poprawić wcześniejszą odpowiedź, wybierając odpowiednie pole. Nieznana informacja pozostanie do uzupełnienia.</p>${button('Proszę o kontakt z człowiekiem', 'handoff')}</div>${consentPanel()}</div></div>`;
}
function docsPanel() {
  return `<div class="panels"><div class="card"><h3>Załączniki</h3><form id="upload-form"><label for="file">PDF, skan PNG/JPEG lub tekst</label><input id="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required><p class="small">Do 8 MB i 20 stron. OCR: do 3 MB i 5 stron, przekazanie całego pliku do OpenAI po osobnym uruchomieniu.</p><button type="submit">Dodaj dokument</button></form>${(selected.documents || []).map(d => `<div class="document"><p>${escape(d.name)} ${badge(d.status, d.status.includes('required') || d.status.includes('failed'))}</p><p class="small">${d.pages} stron · ${(d.size / 1024).toFixed(1)} KB</p><div class="row">${button('Pobierz oryginał', 'download-file', d.id)}${!isClient() ? button('Pokaż odczyt', 'document-text', d.id) : ''}${d.status === 'ocr_required' ? button('Uruchom OCR OpenAI', 'ocr', d.id) : ''}${!isClient() && ['read', 'ocr_review'].includes(d.status) ? button('Odczytaj roszczenie AI', 'analyze-claim', d.id) : ''}</div>${d.error ? `<p class="small">${escape(d.error)}</p>` : ''}</div>`).join('')}</div><div class="card"><p class="eyebrow">PRZEGLĄD PLIKÓW</p><h3>Oryginał pozostaje źródłem</h3><p class="small">Odczyt wskazuje stronę i fragment. Wynik OCR wymaga porównania z obrazem. Pismo wierzyciela nie potwierdza automatycznie uznania długu przez klienta.</p>${consentPanel()}</div></div>`;
}
function factsPanel() {
  const fields = config.knowledge.intake.fields.filter(f => f.tracks.includes(selected.track));
  return `<div class="card"><div class="row"><h3>Dane z wywiadu</h3>${button('Odczytaj wybrane pola AI', 'analyze-intake')}</div><p class="small">Wartości mają fragment źródła i osobny status przeglądu. Korekta tworzy nowy zapis.</p>${fields.map(field => {
    const fact = selected.current_facts[field.key];
    return `<div class="fact"><div class="fact-title">${escape(field.label)}</div><div class="value">${escape(valueOf(fact))}</div>${fact ? badge(fact.review, fact.review !== 'confirmed') : badge('Do uzupełnienia', true)}${fact?.quote ? `<div class="quote">${escape(fact.quote)}</div>` : ''}<div class="row">${fact?.source_id ? button('Źródło', 'source', fact.source_id) : ''}${isLawyer() && fact ? button('Potwierdź', 'confirm-fact', fact.id) + button('Odrzuć', 'reject-fact', fact.id) : ''}${button('Uzupełnij / popraw', 'correct-fact', field.key)}</div></div>`;
  }).join('')}</div>`;
}
function claimsPanel() {
  const checks = selected.controls;
  return `<div class="card"><h3>Wierzyciele i zobowiązania</h3><p class="small">Suma obejmuje potwierdzone kwoty w tej samej walucie i na tę samą datę. Podejrzane duplikaty wymagają ręcznego powiązania.</p><div class="summary-grid">${checks.totals.map(t => `<div class="stat"><strong>${escape(valueOf({ ...t, type: 'money', precision: 'exact' }))}</strong><span>Potwierdzone dokumenty</span></div>`).join('') || '<div class="stat"><strong>—</strong><span>Brak pełnej, potwierdzonej sumy</span></div>'}<div class="stat"><strong>${checks.excluded_claims}</strong><span>Pozycje pominięte w sumie</span></div>${checks.difference ? `<div class="stat"><strong>${escape(valueOf({ ...checks.difference, type: 'money', precision: 'exact' }))}</strong><span>Różnica względem deklaracji klienta</span></div>` : ''}</div>${checks.candidates.map(pair => `<div class="privacy"><p>Możliwe dokumenty tego samego długu. Wybierz dokument z właściwym wierzycielem i saldem; zachowamy oba źródła.</p>${isLawyer() ? button('Sprawdź i powiąż', 'merge', pair.join('|')) : '<p class="small">Powiązanie wymaga prawnika.</p>'}</div>`).join('')}${selected.claims.filter(c => !c.merged_into).map(c => `<div class="claim"><div class="row"><h3>${escape(valueOf(c.facts.find(f => f.field === 'creditor_name')))}</h3>${badge(c.review, c.review !== 'confirmed')}</div>${Object.keys(claimLabels).map(key => { const f = c.facts.find(f => f.field === key); return `<p class="small"><strong>${escape(claimLabels[key])}</strong>: ${escape(valueOf(f))} ${f?.source_id ? button('Fragment', 'source', f.source_id, 'quiet') : ''}</p>`; }).join('')}<div class="row">${isLawyer() ? button('Potwierdź po sprawdzeniu', 'confirm-claim', c.id) + button('Odrzuć', 'reject-claim', c.id) : ''}${button('Uzupełnij / popraw pole', 'correct-claim', c.id)}${button('Odczytaj adres i szczegóły AI', 'extra-claim-ai', c.id)}${button('Wyjaśnienie roszczenia — projekt', 'clarification', c.id)}</div>${checks.issues.filter(i => i.claim_id === c.id).map(i => `<p class="small">${escape(labels[i.code])}</p>`).join('')}</div>`).join('') || '<p class="muted">Dodaj dokument i uruchom odczyt roszczenia w zakładce Załączniki.</p>'}</div>`;
}
function draftsPanel() {
  const current = selected.drafts.filter(d => d.source_revision === selected.data_revision && d.status !== 'stale');
  const previous = selected.drafts.filter(d => !current.includes(d));
  const cards = drafts => drafts.slice().reverse().map(d => `<div class="draft"><h3>${escape(d.title)}</h3>${badge(d.status, d.status !== 'approved')}<p class="small">Dane w wersji ${d.source_revision} · ${escape(d.created_at.slice(0, 10))}${d.approved_by ? ' · przegląd: ' + escape(d.approved_by) : ''}</p><div class="row">${button('Przeczytaj', 'view-draft', d.id)}${button('Edytuj projekt', 'edit-draft', d.id)}${button('Pobierz PDF', 'download-pdf', d.id)}${isLawyer() && d.status === 'draft' && d.source_revision === selected.data_revision ? button('Zatwierdź wersję', 'approve-draft', d.id) : ''}</div></div>`).join('');
  return `<div class="card"><h3>Projekty dokumentów</h3><form id="draft-form"><label for="template">Wzór</label><div class="row"><select id="template">${config.knowledge.templates.templates.filter(t => t.tracks.includes(selected.track) && t.id !== 'claim_clarification').map(t => `<option value="${t.id}">${escape(t.title)}</option>`).join('')}</select><button>Utwórz projekt</button></div></form><p class="small">Wzory pomocnicze zachowują brakujące dane. Wniosek sądowy przygotowuje się na właściwym formularzu i w odpowiednim trybie.</p><h3>Aktualna wersja danych</h3>${cards(current) || '<p class="small">Utwórz projekt na podstawie aktualnych danych.</p>'}${previous.length ? `<details class="draft-history"><summary>Poprzednie wersje · ${previous.length} projektów</summary>${cards(previous)}</details>` : ''}</div>`;
}
function tasksPanel() {
  return `<div class="card"><h3>Etap i zadania</h3><form id="stage-form"><label for="stage">Etap</label><div class="row"><select id="stage">${['intake', 'review', 'documents', 'closed'].map(s => `<option value="${s}" ${selected.stage === s ? 'selected' : ''}>${labels[s]}</option>`).join('')}</select><button>Zapisz etap</button></div></form><form id="task-form"><label for="task-title">Nowe zadanie</label><input id="task-title" required maxlength="200"><div class="row"><div><label for="task-kind">Rodzaj terminu</label><select id="task-kind"><option value="administrative">Administracyjny</option>${isLawyer() ? '<option value="legal">Prawny — ręczne potwierdzenie</option>' : ''}</select></div><div><label for="task-due">Data docelowa</label><input id="task-due" type="date"></div></div>${isLawyer() ? '<label for="task-basis">Podstawa prawna / sposób obliczenia (dla terminu prawnego)</label><input id="task-basis"><label for="task-start">Potwierdzona data początku biegu</label><input id="task-start" type="date">' : ''}<label for="task-assignee">Osoba odpowiedzialna</label><select id="task-assignee"><option value="">Bez przypisania</option>${team.map(u => `<option value="${u.id}">${escape(u.name)} · ${escape({admin: "administrator", lawyer: "prawnik", staff: "pracownik"}[u.role])}</option>`).join('')}</select><button>Dodaj zadanie</button></form>${selected.tasks.map(t => `<div class="task"><strong>${escape(t.title)}</strong><p class="small">${t.kind === 'legal' ? 'Termin prawny · ' + escape(t.basis) : 'Termin administracyjny'} · ${escape(t.due || 'bez daty')} · ${t.status === 'done' ? 'wykonane' : 'otwarte'}${t.assignee ? ' · ' + escape(team.find(u => u.id === t.assignee)?.name || 'Konto nieaktywne') : ''}</p>${button(t.status === 'done' ? 'Otwórz ponownie' : 'Oznacz jako wykonane', 'toggle-task', t.id)}</div>`).join('')}</div>`;
}
function historyPanel() {
  return `<div class="card"><h3>Historia danych i odczytów</h3>${button('Pokaż dziennik zmian', 'audit')} ${button('Eksport sprawy JSON', 'export')}<h3>Wywołania API</h3>${selected.jobs.slice().reverse().map(j => `<p class="small">${escape(j.kind)} · ${escape(j.provider)} · ${escape(labels[j.status] || j.status)} · ${escape(j.model || '')} ${j.error ? ' · ' + escape(j.error) : ''}</p>`).join('') || '<p class="small">Nie uruchamiano AI.</p>'}<h3>Wcześniejsze wartości</h3>${selected.facts.filter(f => !f.current).map(f => `<div class="fact"><strong>${escape(fieldLabel(f.field))}</strong><p>${escape(valueOf(f))}</p>${f.quote ? `<div class="quote">${escape(f.quote)}</div>` : ''}</div>`).join('') || '<p class="small">Nie ma jeszcze wcześniejszych wartości.</p>'}</div>`;
}
function registryPanel() {
  return `<div class="card"><h3>Sprawdzenie danych firmy</h3><p class="small">KRS i wykaz VAT służą sprawdzeniu tożsamości oraz danych rejestrowych. Nie podają pełnej listy długów. Dla fikcyjnej sprawy VAT używa środowiska testowego MF.</p><form id="registry-form"><label for="registry-kind">Rejestr</label><select id="registry-kind"><option value="krs">KRS — odpis aktualny</option><option value="vat">MF — wykaz VAT</option></select><label for="registry-id">Numer KRS lub NIP — 10 cyfr</label><input id="registry-id" inputmode="numeric" pattern="[0-9]{10}" required maxlength="10"><label for="registry-date">Dzień sprawdzenia VAT</label><input id="registry-date" type="date"><button>Pobierz dane z rejestru</button></form>${(selected.registry_checks || []).map(r => `<div class="document"><h3>${escape(r.summary.name)}</h3><p class="small">${escape(r.kind.toUpperCase())} · ${escape(r.fetched_at)}${r.test ? ' · środowisko testowe dla VAT' : ''}</p><pre class="source">${escape(JSON.stringify(r.summary, null, 2))}</pre><a class="source-link" href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">Źródło odpowiedzi</a></div>`).join('')}</div>`;
}
function render() {
  if (!config) return;
  if (!selected) { if (!isClient()) $('#case-view').innerHTML = welcomePanel(); return; }
  const tabs = isClient() ? [['chat', 'Rozmowa'], ['docs', 'Załączniki']] : [['overview', 'Podsumowanie'], ['chat', 'Rozmowa'], ['docs', 'Załączniki'], ['facts', 'Dane'], ['claims', 'Zobowiązania'], ['drafts', 'Projekty pism'], ['tasks', 'Zadania'], ['history', 'Historia']];
  if (!isClient() && selected.track === 'company') tabs.splice(6, 0, ['registry', 'Rejestry']);
  if (!tabs.some(([key]) => key === tab)) tab = 'chat';
  const target = isClient() ? $('#client-view') : $('#case-view');
  target.innerHTML = `<div class="case-top"><div><p class="eyebrow">${selected.track === 'consumer' ? 'SPRAWA KONSUMENCKA' : 'SPRAWA FIRMOWA'} · WERSJA ${selected.revision}</p><h2>${escape(selected.title)}</h2>${badge(labels[selected.stage])} ${selected.synthetic ? badge('Wszystkie dane fikcyjne') : badge('Dane rzeczywiste', true)}</div><div class="row">${!isClient() ? button('Link dla klienta', 'client-link') + button('Odwołaj linki', 'revoke-links', '', 'quiet') : ''}</div></div><nav class="tabs">${tabs.map(([key, title]) => button(title, 'tab', key, tab === key ? 'active' : '')).join('')}</nav>${({ overview: overviewPanel, chat: chatPanel, docs: docsPanel, facts: factsPanel, claims: claimsPanel, drafts: draftsPanel, tasks: tasksPanel, history: historyPanel, registry: registryPanel })[tab]()}`;
  $('.chat-log')?.scrollTo({ top: $('.chat-log').scrollHeight });
  if (!isClient()) renderList();
}
async function mutate(action, input) {
  selected = await api(`/cases/${selected.id}/${action}`, { revision: selected.revision, ...input });
  await refreshConfig(); if (!isClient()) cases = (await api('/cases')).cases; render();
}
async function run(fn) {
  if (locked) return; locked = true; notice('');
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await fn(); }
  catch (e) { notice(e.message || 'Nie udało się wykonać działania.'); if (e.code === 'VERSION_CONFLICT') await refresh().catch(() => {}); }
  finally { locked = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
function sourceModal(id) {
  const source = selected.sources.find(s => s.id === id); if (!source) return;
  modal(source.title, `<p class="small">${source.page ? 'Strona ' + source.page + ' · ' : ''}${escape(source.read_method)}</p><div class="source">${escape(source.text)}</div>`);
}
async function showSettings() {
  let html = '<h3>Pytania, przepisy i wzory</h3><p class="small">Wersja pytań: ' + escape(config.knowledge.intake.version) + '. ' +
    (config.knowledge.approved_at ? 'Przegląd: ' + escape(config.knowledge.approved_by) : 'Przed użyciem rzeczywistych danych wymaga zatwierdzenia przez prawnika.') + '</p>';
  html += config.knowledge.legalSources.sources.map(s => `<p class="small"><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a> · sprawdzono ${escape(s.checked_on)}</p>`).join('');
  html += '<details><summary>Pytania do przeglądu</summary>' + config.knowledge.intake.fields.map(f => `<p class="small">${escape(f.question)}</p>`).join('') + '</details>';
  if (isLawyer()) html += button('Zatwierdź obecną bazę pytań i wzorów', 'approve-knowledge');
  if (user.role === 'admin') {
    const accounts = (await api('/users')).users;
    html += '<h3>Konta kancelarii</h3><table><tr><th>Osoba</th><th>Rola</th><th>Dostęp</th></tr>' + accounts.map(u => `<tr><td>${escape(u.name)}<br>${escape(u.email)}<br><small>${escape(u.id)}</small></td><td>${escape(u.role)}</td><td>${u.active ? u.id !== user.id ? button('Wyłącz', 'disable-user', u.id, 'quiet') : 'aktywne' : 'wyłączone'}</td></tr>`).join('') + '</table>';
    html += '<form id="user-form"><h3>Dodaj konto</h3><label for="user-name">Imię i nazwisko</label><input id="user-name" required><label for="user-email">E-mail konta</label><input id="user-email" type="email" required><label for="user-role">Rola</label><select id="user-role"><option value="staff">Pracownik</option><option value="lawyer">Prawnik — przegląd i zatwierdzanie</option><option value="admin">Administrator</option></select><label for="user-password">Hasło, co najmniej 16 znaków</label><input id="user-password" type="password" minlength="16" required autocomplete="new-password"><button>Utwórz konto</button></form>';
  }
  modal('Konta i baza wiedzy', html);
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  run(async () => {
    const action = target.dataset.action, value = target.dataset.value;
    if (action === 'tab') { tab = value; render(); }
    else if (action === 'open-case') { tab = 'overview'; await openCase(value); }
    else if (action === 'consent') await mutate('consent', { accepted: true, provider: $('#provider').value });
    else if (action === 'handoff') await mutate('messages', { text: 'Proszę o kontakt z człowiekiem — prawnikiem.', analyze: false });
    else if (action === 'source') sourceModal(value);
    else if (action === 'download-file') await download(`/cases/${selected.id}/files/${value}`, selected.documents.find(d => d.id === value).name);
    else if (action === 'document-text') {
      const pages = selected.sources.filter(s => s.document_id === value);
      modal('Odczyt dokumentu', pages.map(s => `<h3>Strona ${s.page}</h3><p class="small">${escape(s.read_method)}</p><div class="source">${escape(s.text || 'Brak tekstu. Potrzebny OCR lub czytelniejszy dokument.')}</div>`).join(''));
    } else if (action === 'ocr') {
      const doc = selected.documents.find(d => d.id === value);
      modal('Odczyt skanu', `<p>Cały plik ${escape(doc.name)} zostanie przekazany do OpenAI. Odczyt zużyje jedno wywołanie z dziennego limitu. Wynik wymaga porównania z obrazem.</p>${button('Uruchom odczyt tego pliku', 'confirm-ocr', value)}`);
    } else if (action === 'confirm-ocr') { $('#modal').close(); await mutate('ocr', { document_id: value }); }
    else if (action === 'analyze-claim') {
      const ids = selected.sources.filter(s => s.document_id === value && s.text).map(s => s.id);
      const input = { kind: 'claim', source_ids: ids };
      const preview = await api(`/cases/${selected.id}/preview`, input);
      modal('Fragmenty przekazywane do API', `<pre>${escape(preview.sources.map(s => `Strona ${s.page}\n${s.text}`).join('\n\n'))}</pre>${button('Odczytaj roszczenie', 'confirm-claim-ai', value)}`);
    } else if (action === 'confirm-claim-ai') {
      $('#modal').close(); await mutate('analyze', { kind: 'claim', source_ids: selected.sources.filter(s => s.document_id === value && s.text).map(s => s.id) });
    } else if (action === 'analyze-intake') {
      modal('Wybierz pola do odczytu', `<form id="analyze-form"><p class="small">Do 5 pól w jednym odczycie. Wybrane źródło prześlemy do dostawcy zaakceptowanego dla sprawy.</p><label for="intake-source">Wiadomość</label><select id="intake-source">${selected.sources.filter(s => s.kind === 'message').map(s => `<option value="${s.id}">${escape(s.text.slice(0, 130))}</option>`).join('')}</select>${config.knowledge.intake.fields.filter(f => f.tracks.includes(selected.track)).map(f => `<label><input type="checkbox" name="ai-field" value="${f.key}"> ${escape(f.label)}</label>`).join('')}<button>Odczytaj zaznaczone pola</button></form>`);
    } else if (['confirm-fact', 'reject-fact'].includes(action)) await mutate('review-fact', { fact_id: value, review: action === 'confirm-fact' ? 'confirmed' : 'rejected' });
    else if (['confirm-claim', 'reject-claim'].includes(action)) await mutate('review-claim', { claim_id: value, review: action === 'confirm-claim' ? 'confirmed' : 'rejected' });
    else if (action === 'extra-claim-ai') { const claim = selected.claims.find(c => c.id === value); await mutate('analyze', { kind: 'claim', source_ids: claim.source_ids.filter(id => selected.sources.find(s => s.id === id)?.document_id === claim.document_id), fields: ['creditor_address', 'security_creation_date', 'disputed_scope', 'assignment_date'] }); }
    else if (action === 'correct-claim') modal('Uzupełnij dane roszczenia', `<form id="claim-correction-form" data-claim="${value}"><label for="claim-field">Pole</label><select id="claim-field">${Object.entries(claimLabels).map(([key, label]) => `<option value="${key}">${escape(label)}</option>`).join('')}</select><label for="claim-type">Rodzaj wartości</label><select id="claim-type"><option value="text">Opis</option><option value="money">Kwota</option><option value="date">Data RRRR-MM-DD</option><option value="boolean">Tak lub nie</option><option value="unknown">Nieznane / brak danych</option></select><label for="claim-value">Wartość — dla kwoty np. 50000,00; dla odpowiedzi: tak lub nie</label><input id="claim-value"><label for="claim-currency">Waluta (dla kwoty)</label><input id="claim-currency" value="PLN" maxlength="3"><label for="claim-as-of">Data salda (dla kwoty)</label><input id="claim-as-of" type="date"><label for="claim-note">Źródło i uzasadnienie korekty</label><textarea id="claim-note" required></textarea><button>Zapisz do przeglądu</button></form>`);
    else if (action === 'correct-fact') {
      const fact = selected.current_facts[value], money = config.knowledge.intake.fields.find(f => f.key === value).type === 'money';
      modal('Korekta: ' + fieldLabel(value), `<form id="correction-form" data-field="${escape(value)}" data-type="${money ? 'money' : 'text'}"><label for="correct-value">${money ? 'Kwota, np. 3900,00' : 'Wartość'}</label><input id="correct-value" value="${escape(money && fact?.type === 'money' ? (fact.minor_units / 100).toFixed(2).replace('.', ',') : fact?.text_value || '')}" required>${money ? `<label for="correct-currency">Waluta</label><input id="correct-currency" value="${escape(fact?.currency || 'PLN')}" maxlength="3"><label for="correct-date">Data salda — jeśli znana</label><input id="correct-date" type="date" value="${escape(fact?.as_of || '')}">` : ''}<label for="correct-note">Źródło i uzasadnienie ręcznej korekty</label><textarea id="correct-note" required></textarea><button>Zapisz do przeglądu</button></form>`);
    } else if (action === 'merge') {
      const ids = value.split('|');
      modal('Powiąż dokumenty jednego długu', `<form id="merge-form" data-ids="${escape(value)}"><label for="merge-selected">Dokument z właściwym saldem i wierzycielem</label><select id="merge-selected">${ids.map(id => {
        const c = selected.claims.find(c => c.id === id); return `<option value="${id}">${escape(valueOf(c.facts.find(f => f.field === 'creditor_name')))} · ${escape(valueOf(c.facts.find(f => f.field === 'total_amount')))}</option>`;
      }).join('')}</select><label for="merge-note">Dlaczego dokumenty dotyczą tego samego długu?</label><textarea id="merge-note" required minlength="6"></textarea><button>Powiąż i skieruj do przeglądu</button></form>`);
    } else if (action === 'clarification') {
      modal('Projekt prośby o wyjaśnienie', `<form id="clarification-form" data-claim="${value}"><label for="recipient-address">Adres wierzyciela, jeśli ustalony</label><textarea id="recipient-address"></textarea><button>Utwórz projekt</button></form>`);
    } else if (action === 'view-draft' || action === 'edit-draft') {
      const draft = selected.drafts.find(d => d.id === value);
      if (action === 'view-draft') modal(draft.title, `<p class="small">${escape(labels[draft.status])} · wersja ${draft.source_revision}</p>${draft.sections.map(s => `<h3>${escape(s.heading)}</h3><div class="article">${escape(s.text)}</div>`).join('')}`);
      else modal('Edycja projektu', `<form id="edit-draft-form" data-draft="${value}">${draft.sections.map((s, i) => `<label for="section-${i}">${escape(s.heading)}</label><textarea id="section-${i}" data-section="${i}">${escape(s.text)}</textarea>`).join('')}<button>Zapisz nową wersję projektu</button></form>`);
    } else if (action === 'download-pdf') await download(`/cases/${selected.id}/pdf/${value}`, `casecheck-${selected.drafts.find(d => d.id === value).template}.pdf`);
    else if (action === 'approve-draft') await mutate('approve-draft', { draft_id: value });
    else if (action === 'toggle-task') await mutate('tasks', { task_id: value, status: selected.tasks.find(t => t.id === value).status === 'open' ? 'done' : 'open' });
    else if (action === 'audit') { const history = (await api(`/cases/${selected.id}/history`)).history; modal('Dziennik zmian', `<table><tr><th>Wersja</th><th>Zdarzenie</th><th>Data</th></tr>${history.map(h => `<tr><td>${h.revision}</td><td>${escape(h.event)}</td><td>${escape(h.at)}</td></tr>`).join('')}</table>`); }
    else if (action === 'export') await download(`/cases/${selected.id}/export`, 'casecheck-sprawa.json');
    else if (action === 'client-link') {
      const link = await api(`/cases/${selected.id}/link`, {}); const address = `${location.origin}${base}/#client=${link.token}&case=${selected.id}`;
      modal('Link do wywiadu klienta', `<p class="small">Ważny 7 dni, do ${escape(link.expires)}. Daje dostęp do tej jednej sprawy. Przekaż go właściwej osobie.</p><p class="links-list"><a href="${escape(address)}" rel="noreferrer">${escape(address)}</a></p>`);
    } else if (action === 'revoke-links') { await api(`/cases/${selected.id}/revoke-links`, {}); notice('Dotychczasowe linki klienta zostały odwołane.'); }
    else if (action === 'approve-knowledge') { await api('/knowledge/approve', {}); await refreshConfig(); await showSettings(); }
    else if (action === 'disable-user') { await api('/users/disable', { user_id: value }); team = (await api('/team')).team; await showSettings(); }
  });
});
document.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target;
  run(async () => {
    if (form.id === 'login-form') { const login = await api('/login', { email: $('#email').value, password: $('#password').value }); token = login.token; user = login.user; $('#password').value = ''; await enter(); }
    else if (form.id === 'new-case-form') { selected = await api('/cases', { title: $('#case-title').value, track: $('#case-track').value, synthetic: $('#synthetic').checked }); $('#modal').close(); tab = 'chat'; await refresh(); }
    else if (form.id === 'message-form') await mutate('messages', { text: $('#answer').value, field: $('#answer-field').value, analyze: $('#use-ai').checked });
    else if (form.id === 'upload-form') { const file = $('#file').files[0]; if (!file) return; selected = await api(`/cases/${selected.id}/upload`, file, { raw: true, headers: { 'X-File-Name': encodeURIComponent(file.name), 'X-Case-Revision': String(selected.revision) } }); await refresh(); }
    else if (form.id === 'analyze-form') {
      const fields = [...document.querySelectorAll('[name="ai-field"]:checked')].map(i => i.value); if (!fields.length || fields.length > 5) throw new Error('Zaznacz od 1 do 5 pól.');
      const sourceId = $('#intake-source').value; $('#modal').close(); await mutate('analyze', { kind: 'intake', fields, source_ids: [sourceId] });
    } else if (form.id === 'correction-form') {
      const type = form.dataset.type, field = form.dataset.field, raw = $('#correct-value').value.trim();
      const fact = { field, type, text_value: type === 'text' ? raw : null, boolean_value: null, minor_units: null, currency: null, as_of: null,
        precision: 'exact', source_id: null, quote: null };
      if (type === 'money') { if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error('Podaj kwotę z maksymalnie dwoma miejscami po przecinku.');
        const [whole, cents = ''] = raw.replace(',', '.').split('.'); fact.minor_units = Number(BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0')));
        fact.currency = $('#correct-currency').value.toUpperCase(); fact.as_of = $('#correct-date').value || null; }
      const note = $('#correct-note').value; $('#modal').close(); await mutate('correction', { fact, note });
    } else if (form.id === 'merge-form') { const into = $('#merge-selected').value, from = form.dataset.ids.split('|').find(id => id !== into), note = $('#merge-note').value; $('#modal').close(); await mutate('merge', { from, into, note }); }
    else if (form.id === 'claim-correction-form') {
      const type = $('#claim-type').value, raw = $('#claim-value').value.trim();
      const fact = { field: $('#claim-field').value, type, text_value: ['text', 'date'].includes(type) ? raw : null, boolean_value: null, minor_units: null, currency: null, as_of: null, precision: type === 'unknown' ? 'unknown' : 'exact', source_id: null, quote: null };
      if (type === 'money') { if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error('Podaj kwotę z maksymalnie dwoma miejscami po przecinku.'); const [whole, cents = ''] = raw.replace(',', '.').split('.'); fact.minor_units = Number(BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0'))); fact.currency = $('#claim-currency').value.toUpperCase(); fact.as_of = $('#claim-as-of').value || null; }
      if (type === 'boolean') { if (!/^(tak|nie)$/i.test(raw)) throw new Error('Wpisz tak albo nie.'); fact.boolean_value = raw.toLowerCase() === 'tak'; }
      const note = $('#claim-note').value, claim_id = form.dataset.claim; $('#modal').close(); await mutate('correct-claim', { fact, note, claim_id });
    }
    else if (form.id === 'draft-form') await mutate('drafts', { template: $('#template').value });
    else if (form.id === 'clarification-form') { const claim_id = form.dataset.claim, recipient_address = $('#recipient-address').value; $('#modal').close(); await mutate('drafts', { template: 'claim_clarification', options: { claim_id, recipient_address } }); tab = 'drafts'; render(); }
    else if (form.id === 'edit-draft-form') { const draft = selected.drafts.find(d => d.id === form.dataset.draft), sections = draft.sections.map((s, i) => ({ ...s, text: $('#section-' + i).value })); $('#modal').close(); await mutate('edit-draft', { draft_id: draft.id, sections }); }
    else if (form.id === 'task-form') await mutate('tasks', { title: $('#task-title').value, kind: $('#task-kind').value, due: $('#task-due').value || null, basis: $('#task-basis')?.value, start_date: $('#task-start')?.value || null, assignee: $('#task-assignee').value || null });
    else if (form.id === 'stage-form') await mutate('stage', { stage: $('#stage').value, resume: true });
    else if (form.id === 'user-form') { await api('/users', { name: $('#user-name').value, email: $('#user-email').value, role: $('#user-role').value, password: $('#user-password').value }); team = (await api('/team')).team; await showSettings(); }
    else if (form.id === 'registry-form') await mutate('registry', { kind: $('#registry-kind').value, identifier: $('#registry-id').value, date: $('#registry-date').value || undefined });
  });
});
$('#search').addEventListener('input', renderList);
$('#case-filter').addEventListener('change', renderList);
$('#demo-guide').addEventListener('click', () => modal('Demo w 8 minut', `<p class="small">Samodzielny projekt portfolio. Scenariusze korzystają wyłącznie z fikcyjnych danych.</p><ol class="demo-guide"><li><strong>Problem / 1 minuta.</strong> Zbieranie informacji z rozmowy i kilku dokumentów utrudnia przekazanie sprawy kolejnej osobie.</li><li><strong>S01 / 3 minuty.</strong> Otwórz podsumowanie. Pokaż różnicę 10 tys. zł, zobowiązanie i jego źródło. Przejdź do zadań oraz aktualnych projektów pism.</li><li><strong>S02 i S04 / 2 minuty.</strong> Pokaż drugi dokument tej samej umowy oraz spór. Przed pokazem sprawdź, czy odczyty są zapisane. Import źródeł nie uruchamia AI.</li><li><strong>Kontrola / 1 minuta.</strong> Pokaż wcześniejsze wersje oraz rolę prawnika. Uzupełnienie danych wymaga nowego przeglądu projektu.</li><li><strong>Dalszy pilotaż / 1 minuta.</strong> Uzgodnij metryki: czas przygotowania i przeglądu, błędy kwot i odsetek, poprawność źródeł oraz odsetek ręcznych korekt.</li></ol><p class="small">Pełny opis projektu, architektura, testy i scenariusz prezentacji są w publicznym repozytorium.</p><a href="https://github.com/krapcys1-maker/casecheck" target="_blank" rel="noopener noreferrer">Otwórz dokumentację projektu →</a>`));
$('#close-modal').addEventListener('click', () => $('#modal').close());
$('#new-case').addEventListener('click', () => modal('Nowa sprawa', '<form id="new-case-form"><label for="case-title">Nazwa sprawy</label><input id="case-title" required maxlength="150"><label for="case-track">Ścieżka</label><select id="case-track"><option value="consumer">Konsumencka</option><option value="company">Firmowa</option></select><label><input type="checkbox" id="synthetic" checked> Wszystkie dane są fikcyjne</label><button>Rozpocznij wywiad</button></form>'));
$('#seed').addEventListener('click', () => run(async () => { const result = await api('/seed', {}); await refresh(); notice(`Wczytano ${result.imported} spraw testowych. Dane nie są wynikami AI — odczyt uruchamiasz osobno.`); }));
$('#settings-button').addEventListener('click', () => run(showSettings));
$('#logout').addEventListener('click', () => run(async () => { if (!isClient()) await api('/logout', {}); token = ''; user = null; location.reload(); }));
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('client')) {
  token = fragment.get('client'); history.replaceState(null, '', location.pathname);
  run(async () => { user = (await api('/me')).user; await enter(); });
}
