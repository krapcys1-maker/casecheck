import { openDocumentReview } from './document-review.js';
import { portalPanel, responseForm, templateManager, templateEditor, parseTemplateText } from './workspace.js';
import { trackFormEdits, captureForms, restoreForms } from './form-state.js';
import { conversationPanel } from './conversation.js';
trackFormEdits(document);
const base = new URL('.', location.href).pathname.replace(/\/$/, '');
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const labels = { intake: 'Wywiad', review: 'Przegląd', documents: 'Dokumenty', closed: 'Zamknięta', pending: 'Do przeglądu', confirmed: 'Potwierdzone',
  rejected: 'Odrzucone', draft: 'Projekt', approved: 'Zatwierdzone', stale: 'Nieaktualne', read: 'Tekst odczytany', ocr_required: 'Wymaga OCR',
  ocr_review: 'OCR do sprawdzenia', ocr_verified: 'Strony OCR sprawdzone', read_failed: 'Błąd odczytu', reading: 'Odczytywanie', running: 'Odczytywanie', interrupted: 'Odczyt przerwany', completed: 'Wykonano', failed: 'Błąd', discarded: 'Wynik starej wersji',
  possible_duplicate: 'Możliwy drugi dokument tego samego długu', amount_requires_review: 'Kwota lub data wymaga przeglądu', components_mismatch: 'Składniki nie zgadzają się z sumą', disputed: 'Roszczenie sporne' };
const errors = { PROVIDER_DISABLED: 'Dozwolony jest wyłącznie DeepSeek V4.1 Flash.', MODEL_DISABLED: 'Dozwolony jest wyłącznie model deepseek-flash.', AI_COST_LIMIT: 'Wykorzystano przyznany budżet API. Zapisane dane pozostają dostępne.', LOGIN_FAILED: 'Nieprawidłowy adres konta lub hasło.', UNAUTHORIZED: 'Zaloguj się ponownie lub otwórz aktualny link do sprawy.',
  CONVERSATION_CONSENT_REQUIRED: 'Przed rozmową wybierz dostawcę i zaakceptuj przekazanie wiadomości oraz kontekstu do API.',
  REGISTRY_UNAVAILABLE: 'Nie udało się połączyć z rejestrem publicznym. Dane sprawy nie zostały zmienione. Spróbuj później.',
  REGISTRY_NOT_FOUND: 'Rejestr nie zwrócił podmiotu dla tego numeru. Sprawdź numer oraz wybrany rejestr.',
  REGISTRY_QUERY_REJECTED: 'Rejestr odrzucił zapytanie. Sprawdź numer, wybrany rejestr i datę. Nie zapisano danych.',
  REGISTRY_BUSY: 'Trwa zapytanie do rejestru. Poczekaj na jego wynik.',
  REGISTRY_DAILY_LIMIT: 'Wykorzystano dzisiejszy limit zapytań do rejestrów. Zapisane wyniki pozostają dostępne.',
  INVALID_REGISTRY_QUERY: 'Wybierz rejestr i wpisz numer KRS lub NIP składający się z 10 cyfr.',
  REGISTRY_INVALID_RESPONSE: 'Rejestr zwrócił odpowiedź, której nie można odczytać. Nie zapisano danych. Spróbuj później.',
  REGISTRY_RESPONSE_LIMIT: 'Odpowiedź rejestru przekroczyła dopuszczalny rozmiar. Nie zapisano danych.',
  INVALID_DATE: 'Podaj prawidłową datę w kalendarzu.',
  DRAFT_NOT_SHAREABLE: 'Udostępnienie wymaga zatwierdzenia aktualnej wersji pisma.', ALREADY_SHARED: 'Ta wersja pisma jest już udostępniona klientowi.',
  DOCUMENT_UNAVAILABLE: 'Pismo zmieniło się lub udostępnienie odwołano. Odśwież sprawę.', OPEN_TASKS_OR_ROLE: 'Zamknięcie sprawy wymaga prawnika i zakończenia zadań oraz próśb do klienta.',
  TEMPLATE_REVIEW_REQUIRED: 'Prawnik musi zatwierdzić wzór kancelarii.', TEMPLATE_OUTDATED: 'Wzór zmienił się. Utwórz pismo z aktualnego zatwierdzonego wzoru.',
  INVALID_DRAFT_CONTENT: 'Projekt musi zawierać co najmniej jedną sekcję; nagłówki i treść nie mogą być puste. Skróć zbyt długą treść.',
  TEMPLATE_FIELDS_MISSING: 'We wzorze brakuje potwierdzonych wartości. Uzupełnij dane sprawy i wygeneruj pismo ponownie.',
  UNKNOWN_TEMPLATE_FIELD: 'Wzór zawiera nieznane pole. Skorzystaj z listy dostępnych pól.', INVALID_TEMPLATE_SYNTAX: 'Sprawdź nawiasy pól we wzorze: {{nazwa_pola}}.',
  RELEASE_UNAVAILABLE: 'To udostępnienie nie jest już aktualne. Odśwież sprawę.', DRAFT_NOT_APPROVED: 'Najpierw zatwierdź aktualną wersję pisma.',
  RESPONSE_REQUIRED: 'Wpisz odpowiedź lub wybierz przynajmniej jeden załącznik.', CLIENT_REQUESTS_OPEN: 'Najpierw zakończ otwarte prośby do klienta.',
  VERSION_CONFLICT: 'Sprawa zmieniła się w trakcie pracy. Wpisane dane pozostają w formularzu. Odśwież sprawę, sprawdź zmiany i ponownie wybierz zapis.', DAILY_LIMIT: 'Wykorzystano dzisiejszy limit wywołań AI.',
  REQUEST_IN_PROGRESS: 'Trwa inny odczyt AI. Spróbuj po jego zakończeniu.', CONSENT_REQUIRED: 'Najpierw zaakceptuj przekazanie danych do wybranego dostawcy.',
  RESULT_SAVED_RECOVERY_REQUIRED: 'Zapis odczytu oczekuje na odzyskanie. Otwórz Historię i odzyskaj go bez kolejnego wywołania API.',
  SAVED_RESULT_NOT_FOUND: 'Brak zapisanego wyniku tego odczytu. Sprawdź aktualną historię sprawy.',
  SAVED_RESULT_INVALID: 'Nie można bezpiecznie zastosować zapisanego wyniku. Potrzebny jest przegląd przez administratora.',
  SOURCE_REVIEW_REQUIRED: 'Najpierw porównaj strony OCR z oryginałem. Po korekcie odczytaj ponownie zależne dane albo popraw je ręcznie.',
  SOURCE_SUPERSEDED: 'Ten odczyt zastąpiono nowszą wersją. Odśwież sprawę i wybierz aktualną stronę.',
  OCR_PAGE_REJECTED: 'Odczyt strony został odrzucony. Popraw tekst i sprawdź go z oryginałem.',
  OCR_TEXT_UNCHANGED: 'Nie zmieniono tekstu. Aby zaakceptować odczyt, wybierz potwierdzenie zgodności.',
  LAWYER_REQUIRED: 'To działanie wymaga konta z rolą prawnika.', KNOWLEDGE_REVIEW_REQUIRED: 'Prawnik musi zatwierdzić pytania i wzory przed analizą rzeczywistych danych.',
  UNREVIEWED_FACTS: 'Przed zatwierdzeniem projektu sprawdź fakty, roszczenia i możliwe duplikaty.', DRAFT_OUTDATED: 'Ten projekt dotyczy wcześniejszej wersji danych. Utwórz aktualny projekt.',
  PASSWORD_LENGTH: 'Hasło powinno mieć od 16 do 256 znaków.', UNSUPPORTED_FILE: 'Obsługiwane pliki: PDF, PNG, JPEG i TXT.', LOGIN_RATE_LIMIT: 'Odczekaj minutę przed kolejną próbą logowania.' };
const claimLabels = { creditor_name: 'Wierzyciel', creditor_address: 'Adres wierzyciela', agreement_number: 'Numer umowy lub faktury',
  original_creditor: 'Poprzedni wierzyciel', principal_amount: 'Kapitał', interest_amount: 'Odsetki', costs_amount: 'Koszty', total_amount: 'Łączna kwota',
  balance_date: 'Data salda', due_date: 'Termin zapłaty', security_description: 'Zabezpieczenie', security_creation_date: 'Data ustanowienia zabezpieczenia',
  disputed: 'Czy roszczenie jest sporne', disputed_scope: 'Zakres sporu', assignment_date: 'Data cesji' };
let token = '', user = null, config = null, cases = [], team = [], selected = null, tab = 'chat', locked = false;
let activity = null, activityTimer = null, activityPending = false;
const isClient = () => user?.role === 'client';
const isLawyer = () => user?.role === 'lawyer';
const button = (title, action, value = '', kind = 'secondary') => `<button type="button" class="${kind}" data-action="${action}" data-value="${escape(value)}">${escape(title)}</button>`;
const badge = (status, warn = false) => `<span class="badge ${warn ? 'warn' : ''}">${escape(labels[status] || status)}</span>`;
const fieldLabel = key => config?.knowledge.intake.fields.find(f => f.key === key)?.label || key;
const valueOf = f => f?.source_invalidated ? 'Nieaktualny odczyt — odczytaj ponownie lub popraw pole' : f?.invalidated_by_field && f.type === 'unknown' ? 'Do ponownego ustalenia po zmianie: ' + (claimLabels[f.invalidated_by_field] || fieldLabel(f.invalidated_by_field)) : !f || f.type === 'unknown' ? 'Brak danych' : f.type === 'money' ?
  `${f.precision === 'approximate' ? 'około ' : ''}${(f.minor_units / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${f.currency}${f.as_of ? ' · ' + f.as_of : ''}` :
  f.type === 'boolean' ? f.boolean_value ? 'Tak' : 'Nie' : f.text_value;
function notice(message) {
  $('#notice').textContent = message; $('#notice').hidden = !message;
  $('#modal-notice')?.remove();
  if (message && $('#modal').open) {
    const alert = document.createElement('p'); alert.id = 'modal-notice'; alert.className = 'privacy';
    alert.setAttribute('role', 'alert'); alert.textContent = message; $('#modal-content').prepend(alert); alert.scrollIntoView({ block: 'start' });
  }
}
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
    filter === c.track || filter === 'review' && (c.summary.pending_facts + c.summary.pending_claims + (c.summary.ocr_pages_pending || 0) + (c.summary.client_responses_pending || 0) > 0) ||
    filter === 'tasks' && c.summary.open_tasks > 0));
  $('#case-count').textContent = `${visible.length} z ${cases.length} spraw`;
  $('#case-list').innerHTML = visible.map(c =>
    `<button class="case-item ${selected?.id === c.id ? 'active' : ''}" data-action="open-case" data-value="${c.id}">${escape(c.title)}<small>${c.track === 'consumer' ? 'Konsument' : 'Firma'} · ${escape(labels[c.stage])}${c.synthetic ? ' · fikcyjne dane' : ''}</small></button>`).join('') || `<p class="small">${cases.length ? 'Brak wyników dla wybranych filtrów.' : 'Nie ma jeszcze spraw.'}</p>`;
  const sum = key => cases.reduce((n, c) => n + (c.summary[key] || 0), 0);
  $('#workspace-summary').innerHTML = `<div><strong>${cases.length}</strong><span>Spraw w kartotece</span></div><div><strong>${sum('pending_facts') + sum('pending_claims') + sum('ocr_pages_pending') + sum('client_responses_pending')}</strong><span>Odczytów, stron i odpowiedzi do przeglądu</span></div><div><strong>${sum('open_tasks')}</strong><span>Otwartych zadań · ${sum('overdue_tasks')} po dacie docelowej (UTC)</span></div>`;
}
async function refreshConfig() {
  config = await api('/config');
  if (config.budget) $('#budget').textContent = config.spend ? `Budżet API: ${config.spend.accounted_usd.toFixed(4)} / ${config.spend.limit_usd.toFixed(2)} USD · ${config.budget.used} wywołań dziś` : `AI dziś: ${config.budget.used}/${config.budget.limit ?? 'bez limitu liczby'}`;
}
async function openCase(id) { selected = await api('/cases/' + id); render(); renderActivity(); }
async function refresh({ preserveInput = false } = {}) {
  await refreshConfig();
  let freshCase = selected;
  if (isClient()) freshCase = await api('/cases/' + user.case_id);
  else {
    cases = (await api('/cases')).cases; team = (await api('/team')).team;
    if (selected) freshCase = await api('/cases/' + selected.id);
  }
  const forms = preserveInput ? captureForms(document) : [];
  selected = freshCase;
  if (!isClient()) renderList();
  render(); restoreForms(document, forms); renderActivity();
}
function renderActivity() {
  if (!user) return;
  $('#notifications-button').hidden = false;
  $('#notifications-button').textContent = `Powiadomienia${activity?.unread ? ' (' + activity.unread + ')' : ''}`;
  if (activity) {
    $('#notification-items').innerHTML = activity.items.map(n => `<article class="notification-item ${n.read ? '' : 'unread'}"><div><strong>${escape(n.title)}</strong><p class="small">${escape(n.case_title)} · ${escape(n.at.slice(0, 16).replace('T', ' '))} UTC</p></div><div class="row">${button('Otwórz sprawę', 'notification-open', n.id)}${n.read ? '<span class="small">Przeczytane</span>' : button('Oznacz jako przeczytane', 'notification-read', n.id, 'quiet')}</div></article>`).join('') || '<p class="small">Nie ma nowych powiadomień.</p>';
    $('#notification-scope').textContent = `Powiadomienia wewnątrz aplikacji. Sprawdzane co 10 sekund, gdy karta jest widoczna. Przypomnienia o wpisanych datach zadań pojawiają się dzień wcześniej i codziennie do zakończenia. Daty są liczone w UTC.${activity.truncated ? ' Pokazano 50 pozycji; po oznaczeniu ich jako przeczytane pojawią się kolejne.' : ''}`;
  }
  const remote = activity?.cases.find(c => c.id === selected?.id);
  $('#live-update').hidden = !remote || remote.revision <= selected.revision;
}
async function pollActivity() {
  if (!token || !user || activityPending || document.hidden || locked) return;
  const sessionToken = token;
  activityPending = true;
  try {
    const next = await api('/activity');
    if (sessionToken !== token) return;
    activity = next; renderActivity();
    $('#activity-connection').textContent = '';
  } catch (error) {
    if (sessionToken === token) $('#activity-connection').textContent = error.code === 'UNAUTHORIZED' ? 'Sesja wygasła — zaloguj się ponownie. Wpisana treść pozostaje w formularzu.' : 'Brak połączenia z powiadomieniami. Ponowimy sprawdzenie.';
    if (error.code === 'UNAUTHORIZED') { clearInterval(activityTimer); activityTimer = null; }
  } finally { activityPending = false; }
}
async function refreshKeepingInput() {
  // Dialogs hold a particular draft/source revision. Refresh their underlying state only after closing them.
  if ($('#modal').open && !$('#request-answer-form') && !$('#request-reopen-form')) { notice('Zamknij okno po skopiowaniu lub zapisaniu treści, a następnie odśwież sprawę. Dane otwartego formularza nie zostały zmienione.'); return; }
  await refresh({ preserveInput: true }); notice('Dane odświeżone. Zachowano wpisy w formularzach. Sprawdź zmiany przed wysłaniem.');
}
function welcomePanel() {
  const examples = [['S01', 'Rozbieżność salda', 'Deklaracja klienta i trzy dokumenty. Przejdź od różnicy kwot do źródeł i zadań.'],
    ['S02', 'Cesja i drugi dokument', 'Dwie informacje o tej samej umowie. Właściwy wierzyciel i saldo wymagają przeglądu.'],
    ['S04', 'Roszczenie sporne', 'Oddziel odczyt dokumentu od stanowiska klienta. Zachowaj zakres sporu.']];
  return `<div class="card welcome"><p class="eyebrow">OD ŹRÓDŁA DO PRZEGLĄDU</p><h2>Zacznij od rozmowy.</h2>${button('Rozpocznij nową rozmowę z asystentem', 'start-assistant')}<p class="small">Asystent jest też dostępny w każdej sprawie w zakładce Asystent AI.</p><p>Otwórz sprawę, porównaj odczyt z dokumentem i zobacz, co wymaga uzupełnienia. Panel pokazuje rzeczywisty stan zapisanych danych.</p><div class="demo-cards">${examples.map(([code, title, text]) => { const c = cases.find(c => c.synthetic && c.title.startsWith(code + ' ')); return `<article><span class="eyebrow">${code} / FIKCYJNE DANE</span><h3>${title}</h3><p class="small">${text}</p>${c ? button('Otwórz scenariusz', 'open-case', c.id) : '<p class="small">Administrator może wczytać materiały testowe.</p>'}</article>`; }).join('')}</div><p class="small">Import materiałów testowych dodaje źródła. Wyniki AI pojawiają się po osobnym odczycie; przegląd testowy pozostaje wyraźnie oznaczony.</p></div>`;
}
function overviewPanel() {
  const s = selected.review_summary, checks = selected.controls;
  const points = [];
  if (s.client_responses_pending) points.push(['portal', 'Klient odpowiedział', `${s.client_responses_pending} odpowiedzi na prośby czeka na sprawdzenie.`]);
  if (s.client_requests_open) points.push(['portal', 'Trwa uzupełnianie sprawy', `Niezakończone prośby do klienta: ${s.client_requests_open}.`]);
  if (selected.recoverable_jobs?.length) points.push(['history', 'Zapis odczytu czeka na odzyskanie', 'Odzyskaj zapisany wynik bez kolejnego wywołania API. Wynik wcześniejszej wersji danych zostanie odrzucony.']);
  if (checks.difference?.minor_units) points.push(['claims', 'Rozbieżność salda', `Deklaracja klienta różni się od dokumentów o ${valueOf({ ...checks.difference, type: 'money', precision: 'exact' })}. Wyjaśnij różnicę przed dalszą pracą.`]);
  if (checks.comparison_reasons.includes('mixed_balance_groups')) points.push(['claims', 'Salda wymagają wspólnego kontekstu', 'Dokumenty mają różne waluty lub daty salda. Różnica względem całej deklaracji klienta nie jest wyliczana.']);
  if (s.duplicate_pairs) points.push(['claims', 'Możliwe dokumenty tego samego długu', `Pary do powiązania: ${s.duplicate_pairs}. System pomija je w sumie do czasu przeglądu.`]);
  if (s.disputed_claims) points.push(['claims', 'Roszczenia sporne', `Pozycje ze sporem: ${s.disputed_claims}. Potwierdzenie odczytu nie oznacza uznania długu.`]);
  if (s.pending_facts + s.pending_claims) points.push(['facts', 'Odczyty czekają na człowieka', `Do przeglądu źródeł: ${s.pending_facts} pól wywiadu; roszczenia: ${s.pending_claims}.`]);
  if (s.unread_documents || s.ocr_documents) points.push(['docs', 'Sprawdź załączniki', `${s.unread_documents} plików bez zakończonego odczytu; ${s.ocr_pages_pending || 0} stron OCR do porównania z obrazem.`]);
  if (s.missing_fields) points.push(['chat', 'Uzupełnij wywiad', `${s.missing_fields} obszarów bez danych. Brak informacji pozostaje widoczny.`]);
  if (selected.handoff) points.unshift(['chat', 'Klient prosi o kontakt', 'Przejmij rozmowę i ustal następny krok.']);
  const open = selected.tasks.filter(t => t.status === 'open');
  return `<div class="review-metrics"><div class="stat"><strong>${s.known_fields} / ${s.field_count}</strong><span>Uzupełnione pola wywiadu · ${s.confirmed_fields} po przeglądzie</span></div><div class="stat"><strong>${s.active_claims}</strong><span>Aktywne roszczenia · ${s.pending_claims} do przeglądu</span></div><div class="stat"><strong>${s.approved_drafts}</strong><span>Aktualne projekty po przeglądzie</span></div></div><div class="panels"><div class="card"><p class="eyebrow">NASTĘPNE KROKI</p><h3>Co wymaga uwagi</h3>${points.map(([key, title, text]) => `<div class="review-point"><div><strong>${escape(title)}</strong><p class="small">${escape(text)}</p></div>${button('Sprawdź', 'tab', key)}</div>`).join('') || '<p>Dane przeszły bieżące kontrole techniczne. Dalszy krok ustala osoba prowadząca sprawę.</p>'}</div><div class="review-side"><div class="card"><p class="eyebrow">KONTROLA SALD</p><h3>Kwoty mają kontekst</h3>${checks.totals.map(t => `<p class="balance"><strong>${escape(valueOf({ ...t, type: 'money', precision: 'exact', as_of: null }))}</strong><span>Potwierdzony odczyt · ${escape(t.as_of)}</span></p>`).join('') || '<p class="small">Suma pojawi się po przeglądzie kwot, dat i duplikatów.</p>'}<p class="small">Pominięte pozycje: ${checks.excluded_claims}. Waluty i daty salda pozostają osobno.</p>${button('Otwórz zobowiązania', 'tab', 'claims')}</div><div class="card"><p class="eyebrow">ODPOWIEDZIALNOŚĆ</p><h3>Otwarte zadania: ${open.length}</h3>${open.slice(0, 3).map(t => `<p class="small"><strong>${escape(t.title)}</strong><br>${escape(team.find(u => u.id === t.assignee)?.name || (t.assignee ? 'Konto nieaktywne' : 'Bez przypisania'))} · ${escape(t.due || 'bez daty')}</p>`).join('')}${button('Zadania i etap', 'tab', 'tasks')}</div>${isLawyer() ? integrationPanel() : ''}</div></div>`;
}
function integrationPanel() {
  return `<div class="card"><p class="eyebrow">DANE DO DALSZEJ PRACY</p><h3>Pakiet po przeglądzie</h3><p class="small">Potwierdzone wartości, cytaty i źródła w jednym pliku. Braki oraz blokady są wymienione w pakiecie.</p>${button('Pobierz pakiet JSON', 'review-package')}</div>`;
}
async function enter() {
  $('#login').hidden = true; $('#identity').textContent = isClient() ? 'Portal klienta' : `${user.name} · ${user.role === 'admin' ? 'administrator' : user.role === 'lawyer' ? 'prawnik' : 'pracownik'}`;
  $('#logout').hidden = false; $('#workspace').hidden = isClient(); $('#client-workspace').hidden = !isClient();
  $('#seed').hidden = user.role !== 'admin'; $('#settings-button').hidden = !['admin', 'lawyer'].includes(user.role);
  await refresh();
  clearInterval(activityTimer); activityTimer = setInterval(pollActivity, 10000);
  setTimeout(pollActivity, 0);
}
function consentPanel() {
  return `<div class="privacy"><p>${escape(config.notice)}</p><label for="provider">Dostawca odczytu AI</label><select id="provider">${config.providers.map(p => `<option value="${p.provider}" ${(selected.consent?.provider || 'deepseek') === p.provider ? 'selected' : ''}>${p.provider} · ${escape(p.model)}</option>`).join('')}</select><p class="small">${selected.consent ? 'Przekazanie danych zaakceptowano: ' + escape(selected.consent.provider) : 'Przed pierwszym odczytem potwierdź zakres przekazania danych.'}</p>${button('Akceptuję przekazanie wybranych danych', 'consent')}</div>`;
}
function chatPanel() {
  return conversationPanel({ state: selected, fields: config.knowledge.intake.fields.filter(f => f.tracks.includes(selected.track)),
    client: isClient(), escape, button, valueOf, consentPanel });
}

function docsPanel() {
  return `<div class="panels"><div class="card"><h3>Załączniki</h3><form id="upload-form"><label for="file">PDF, skan PNG/JPEG lub tekst</label><input id="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required><p class="small">Do 8 MB i 20 stron. OCR: do 3 MB i 5 stron, przekazanie obrazów wszystkich stron do DeepSeek po osobnym uruchomieniu.</p><button type="submit">Dodaj dokument</button></form>${(selected.documents || []).map(d => `<div class="document"><p>${escape(d.name)} ${badge(d.status, d.status.includes('required') || d.status.includes('failed'))}</p><p class="small">${d.pages} stron · ${(d.size / 1024).toFixed(1)} KB${!isClient() ? d.client_visible === false ? ' · tylko kancelaria' : ' · widoczny dla klienta' : ''}</p><div class="row">${button('Pobierz oryginał', 'download-file', d.id)}${isLawyer() && d.uploaded_by_role !== 'client' ? button(d.client_visible === false ? 'Udostępnij klientowi' : 'Ukryj przed klientem', 'file-visibility', d.id) : ''}${!isClient() ? button('Porównaj z oryginałem', 'document-text', d.id) : ''}${d.status === 'ocr_required' ? button('Uruchom OCR DeepSeek', 'ocr', d.id) : ''}${!isClient() && ['read', 'ocr_review', 'ocr_verified'].includes(d.status) ? button('Odczytaj roszczenie', 'analyze-claim', d.id) : ''}</div>${d.error ? `<p class="small">${escape(d.error)}</p>` : ''}</div>`).join('')}</div><div class="card"><p class="eyebrow">PRZEGLĄD PLIKÓW</p><h3>Oryginał pozostaje źródłem</h3><p class="small">Odczyt wskazuje stronę i fragment. Wynik OCR wymaga porównania z obrazem. Pismo wierzyciela nie potwierdza automatycznie uznania długu przez klienta.</p>${consentPanel()}</div></div>`;
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
  const cards = drafts => drafts.slice().reverse().map(d => `<div class="draft"><h3>${escape(d.title)}</h3>${badge(d.status, d.status !== 'approved')}<p class="small">Dane w wersji ${d.source_revision} · ${escape(d.created_at.slice(0, 10))}${d.approved_by ? ' · przegląd: ' + escape(d.approved_by) : ''}</p>${d.template_missing?.length ? `<p class="privacy">Przed zatwierdzeniem uzupełnij potwierdzone dane: ${d.template_missing.map(k => escape(config.template_fields.find(f => f.key === k)?.label || k)).join(', ')}. Następnie wygeneruj projekt ponownie.</p>` : ''}<div class="row">${button('Przeczytaj', 'view-draft', d.id)}${d.status !== 'stale' && d.source_revision === selected.data_revision ? button('Edytuj projekt', 'edit-draft', d.id) : ''}${button('Pobierz PDF', 'download-pdf', d.id)}${button('Pobierz Word', 'download-docx', d.id)}${isLawyer() && d.status === 'approved' && d.source_revision === selected.data_revision ? button('Udostępnij klientowi', 'share-draft', d.id) : ''}${isLawyer() && d.status === 'draft' && d.source_revision === selected.data_revision ? button('Zatwierdź wersję', 'approve-draft', d.id) : ''}</div></div>`).join('');
  return `<div class="card"><div class="row"><h3>Projekty dokumentów</h3>${button('Wzory kancelarii', 'firm-templates')}</div><form id="draft-form"><label for="template">Wzór</label><div class="row"><select id="template">${(config.firm_templates || []).filter(t => t.status === 'approved' && t.tracks.includes(selected.track)).map(t => `<option value="firm:${t.id}">Kancelaria: ${escape(t.title)} · v${t.revision}</option>`).join('')}${config.knowledge.templates.templates.filter(t => t.tracks.includes(selected.track) && t.id !== 'claim_clarification').map(t => `<option value="${t.id}">${escape(t.title)}</option>`).join('')}</select><button>Utwórz projekt</button></div></form><p class="small">Wzory pomocnicze zachowują brakujące dane. Wniosek sądowy przygotowuje się na właściwym formularzu i w odpowiednim trybie.</p><h3>Aktualna wersja danych</h3>${cards(current) || '<p class="small">Utwórz projekt na podstawie aktualnych danych.</p>'}${previous.length ? `<details class="draft-history"><summary>Poprzednie wersje · ${previous.length} projektów</summary>${cards(previous)}</details>` : ''}</div>`;
}
function tasksPanel() {
  return `<div class="card"><h3>Etap i zadania</h3><form id="stage-form"><label for="stage">Etap</label><div class="row"><select id="stage">${['intake', 'review', 'documents', 'closed'].map(s => `<option value="${s}" ${selected.stage === s ? 'selected' : ''}>${labels[s]}</option>`).join('')}</select><button>Zapisz etap</button></div></form><form id="task-form"><label for="task-title">Nowe zadanie</label><input id="task-title" required maxlength="200"><div class="row"><div><label for="task-kind">Rodzaj terminu</label><select id="task-kind"><option value="administrative">Administracyjny</option>${isLawyer() ? '<option value="legal">Prawny — ręczne potwierdzenie</option>' : ''}</select></div><div><label for="task-due">Data docelowa</label><input id="task-due" type="date"></div></div>${isLawyer() ? '<label for="task-basis">Podstawa prawna / sposób obliczenia (dla terminu prawnego)</label><input id="task-basis"><label for="task-start">Potwierdzona data początku biegu</label><input id="task-start" type="date">' : ''}<label for="task-assignee">Osoba odpowiedzialna</label><select id="task-assignee"><option value="">Bez przypisania</option>${team.map(u => `<option value="${u.id}">${escape(u.name)} · ${escape({admin: "administrator", lawyer: "prawnik", staff: "pracownik"}[u.role])}</option>`).join('')}</select><button>Dodaj zadanie</button></form>${selected.tasks.map(t => `<div class="task"><strong>${escape(t.title)}</strong><p class="small">${t.kind === 'legal' ? 'Termin prawny · ' + escape(t.basis) : 'Termin administracyjny'} · ${escape(t.due || 'bez daty')} · ${t.status === 'done' ? 'wykonane' : 'otwarte'}${t.assignee ? ' · ' + escape(team.find(u => u.id === t.assignee)?.name || 'Konto nieaktywne') : ''}</p>${button(t.status === 'done' ? 'Otwórz ponownie' : 'Oznacz jako wykonane', 'toggle-task', t.id)}</div>`).join('')}</div>`;
}
function historyPanel() {
  const recovery = (selected.recoverable_jobs || []).map(r => `<div class="review-point"><div><strong>Zapis odczytu czeka na odzyskanie</strong><p class="small">Zapisano ${escape(r.captured_at)}. Odzyskanie nie wywołuje API. Dane nadal wymagają zwykłego przeglądu.</p></div>${button('Odzyskaj zapisany wynik', 'recover-job', r.job_id)}</div>`).join('');
  return `<div class="card"><h3>Historia danych i odczytów</h3>${button('Pokaż dziennik zmian', 'audit')} ${button('Eksport sprawy JSON', 'export')}${recovery}<h3>Odczyty dokumentów i AI</h3>${selected.jobs.slice().reverse().map(j => `<p class="small">${escape(j.kind)} · ${escape(j.provider)} · ${escape(labels[j.status] || j.status)} · ${escape(j.model || '')}${j.rules_version ? ` · lokalnie: ${j.deterministic_fields?.length || 0} pól · API: ${j.llm_fields?.length || 0} pól${j.llm_called === false ? ' · bez wysyłania do API' : ''}` : ''}${j.field_abstentions?.length ? ` · ${j.field_abstentions.length} wadliwych pól pozostawiono do przeglądu` : ''} ${j.error ? ' · ' + escape(j.error) : ''}${j.recovered_at ? ' · odzyskano ' + escape(j.recovered_at) : ''}</p>${j.warnings?.length ? `<details><summary>Ostrzeżenia tego odczytu</summary>${j.warnings.map(w => `<p class="small">${escape(w)}</p>`).join('')}</details>` : ''}`).join('') || '<p class="small">Nie uruchamiano AI.</p>'}<h3>Wcześniejsze wartości</h3>${selected.facts.filter(f => !f.current).map(f => `<div class="fact"><strong>${escape(fieldLabel(f.field))}</strong><p>${escape(valueOf(f))}</p>${f.quote ? `<div class="quote">${escape(f.quote)}</div>` : ''}</div>`).join('') || '<p class="small">Nie ma jeszcze wcześniejszych wartości.</p>'}</div>`;
}
function registryPanel() {
  return `<div class="card"><h3>Sprawdzenie danych firmy</h3><p class="small">KRS i wykaz VAT służą sprawdzeniu tożsamości oraz danych rejestrowych. Nie podają pełnej listy długów. Dla fikcyjnej sprawy VAT używa środowiska testowego MF.</p><form id="registry-form"><label for="registry-kind">Rejestr</label><select id="registry-kind"><option value="krs">KRS — odpis aktualny</option><option value="vat">MF — wykaz VAT</option></select><label for="registry-id">Numer KRS lub NIP — 10 cyfr</label><input id="registry-id" inputmode="numeric" pattern="[0-9]{10}" required maxlength="10"><label for="registry-date">Dzień sprawdzenia VAT</label><input id="registry-date" type="date"><button>Pobierz dane z rejestru</button></form>${(selected.registry_checks || []).map(r => `<div class="document"><h3>${escape(r.summary.name)}</h3><p class="small">${escape(r.kind.toUpperCase())} · ${escape(r.fetched_at)}${r.kind === 'vat' && r.test ? ' · środowisko testowe dla VAT' : ''}</p><pre class="source">${escape(JSON.stringify(r.summary, null, 2))}</pre><a class="source-link" href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">Źródło odpowiedzi</a></div>`).join('')}</div>`;
}
function render() {
  if (!config) return;
  if (!selected) { if (!isClient()) $('#case-view').innerHTML = welcomePanel(); return; }
  const tabs = isClient() ? [['chat', 'Asystent AI'], ['portal', 'Moja sprawa'], ['docs', 'Załączniki']] : [['overview', 'Podsumowanie'], ['chat', 'Asystent AI'], ['docs', 'Załączniki'], ['facts', 'Dane'], ['claims', 'Zobowiązania'], ['drafts', 'Projekty pism'], ['portal', 'Współpraca z klientem'], ['tasks', 'Zadania'], ['history', 'Historia']];
  if (!isClient() && selected.track === 'company') tabs.splice(6, 0, ['registry', 'Rejestry']);
  if (!tabs.some(([key]) => key === tab)) tab = isClient() ? 'portal' : 'chat';
  const target = isClient() ? $('#client-view') : $('#case-view');
  target.innerHTML = `<div class="case-top"><div><p class="eyebrow">${selected.track === 'consumer' ? 'SPRAWA KONSUMENCKA' : 'SPRAWA FIRMOWA'} · WERSJA ${selected.revision}</p><h2>${escape(selected.title)}</h2>${badge(labels[selected.stage])} ${selected.synthetic ? badge('Wszystkie dane fikcyjne') : badge('Dane rzeczywiste', true)}</div><div class="row">${button('Odśwież', 'refresh')}${!isClient() ? button('Link dla klienta', 'client-link') + button('Odwołaj linki', 'revoke-links', '', 'quiet') : ''}</div></div><nav class="tabs">${tabs.map(([key, title]) => button(title, 'tab', key, tab === key ? 'active' : '')).join('')}</nav>${({ portal: () => portalPanel({ state: selected, client: isClient(), lawyer: isLawyer(), escape, button }), overview: overviewPanel, chat: chatPanel, docs: docsPanel, facts: factsPanel, claims: claimsPanel, drafts: draftsPanel, tasks: tasksPanel, history: historyPanel, registry: registryPanel })[tab]()}`;
  $('.chat-log')?.scrollTo({ top: $('.chat-log').scrollHeight });
  if (!isClient()) renderList();
}
async function mutate(action, input) {
  selected = await api(`/cases/${selected.id}/${action}`, { revision: selected.revision, ...input });
  await refreshConfig(); if (!isClient()) cases = (await api('/cases')).cases; render();
  if (['analyze', 'ocr', 'recover-job', 'assistant-message'].includes(action)) {
    const job = action === 'recover-job' ? selected.jobs.find(j => j.id === input.job_id) : selected.jobs?.at(-1);
    if (job?.status === 'failed') notice(`Odczyt nie powiódł się (${job.error}). Poprzednie dane zachowano. Sprawdź Historię; nie uruchamiamy ponownej płatnej próby automatycznie.`);
    else if (job?.status === 'discarded') notice('W trakcie odpowiedzi zmieniono dane sprawy. Wynik dotyczył wcześniejszej wersji i nie został zastosowany. Wiadomość jest zapisana; odśwież dane przed dalszą rozmową.');
    else if (job?.field_abstentions?.length) notice(`Odczyt zapisano. ${job.field_abstentions.length} pól ma wadliwy wynik i pozostaje do ręcznego sprawdzenia; szczegóły w Historii.`);
    else if (job?.semantic_flags?.length) notice('Odczyt zapisano z zastrzeżeniami. Niepewne wartości pozostawiono do sprawdzenia; przeczytaj ostrzeżenia w Historii.');
  }
}
async function run(fn) {
  if (locked) return; locked = true; notice('');
  const buttons = [...document.querySelectorAll('button')].map(b => [b, b.disabled]);
  buttons.forEach(([b]) => b.disabled = true);
  try { await fn(); }
  catch (e) {
    notice(e.message || 'Nie udało się wykonać działania.');
    if (e.code === 'VERSION_CONFLICT' && ($('#request-answer-form') || $('#request-reopen-form'))) $('#modal-notice')?.insertAdjacentHTML('beforeend', '<br>' + button('Odśwież dane i zachowaj odpowiedź', 'refresh'));
    if (e.code === 'RESULT_SAVED_RECOVERY_REQUIRED' && !$('#modal').open) await refresh().catch(() => {});
  }
  finally { locked = false; buttons.forEach(([b, disabled]) => { if (b.isConnected) b.disabled = disabled; }); }
}
function sourceModal(id) {
  const source = selected.sources.find(s => s.id === id); if (!source) return;
  modal(source.title, `<p class="small">${source.page ? 'Strona ' + source.page + ' · ' : ''}${escape(source.read_method)}</p><div class="source">${escape(source.text)}</div>`);
}
function activeDocumentSourceIds(documentId) {
  const pages = selected.document_reviews?.find(d => d.document_id === documentId)?.pages;
  return pages ? pages.map(p => p.source_id).filter(id => selected.sources.find(s => s.id === id)?.text)
    : selected.sources.filter(s => s.document_id === documentId && !s.superseded_by && s.text).map(s => s.id);
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
    if (action === 'refresh') await refreshKeepingInput();
    else if (action === 'start-assistant') showNewConversation();
    else if (action === 'notifications-toggle') { $('#notifications-panel').hidden = !$('#notifications-panel').hidden; if (!$('#notifications-panel').hidden) { activity = await api('/activity'); renderActivity(); } }
    else if (action === 'notification-read') { activity = await api('/activity/read', { ids: [value] }); renderActivity(); }
    else if (action === 'notifications-read-all') { const ids = activity?.items.filter(n => !n.read).map(n => n.id) || []; if (ids.length) { activity = await api('/activity/read', { ids }); renderActivity(); } }
    else if (action === 'notification-open') { if (captureForms(document).length || $('#modal').open) { notice('Masz wpisaną odpowiedź. Dokończ jej zapis przed przejściem do powiadomienia.'); return; } const n = activity?.items.find(n => n.id === value); if (n) { tab = n.tab; if (selected?.id === n.case_id) await refreshKeepingInput(); else await openCase(n.case_id); activity = await api('/activity/read', { ids: [value] }); renderActivity(); $('#notifications-panel').hidden = true; } }
    else if (action === 'firm-templates') modal('Wzory kancelarii', templateManager(config.firm_templates || [], isLawyer(), escape, button));
    else if (action === 'template-edit') modal('Edycja wzoru kancelarii', templateEditor(config.firm_templates.find(t => t.id === value), config.template_fields, escape));
    else if (action === 'template-view') { const t = config.firm_templates.find(t => t.id === value); modal(t.title, t.sections.map(s => '<h3>' + escape(s.heading) + '</h3><div class="article">' + escape(s.text) + '</div>').join('')); }
    else if (action === 'template-history') { const result = await api('/firm-templates/history', { id: value }); modal('Historia wzoru', result.versions.map(t => '<h3>Wersja ' + t.revision + ' · ' + escape(labels[t.status]) + '</h3><p>' + escape(t.approved_by || t.updated_by) + '</p>' + t.sections.map(s => '<strong>' + escape(s.heading) + '</strong><div class="article">' + escape(s.text) + '</div>').join('')).join('')); }
    else if (action === 'template-approve') { const t = config.firm_templates.find(t => t.id === value); await api('/firm-templates/approve', { id: t.id, revision: t.revision }); await refresh(); modal('Wzory kancelarii', templateManager(config.firm_templates, isLawyer(), escape, button)); }
    else if (action === 'request-answer') modal('Odpowiedź na prośbę', responseForm(selected.portal.requests.find(r => r.id === value), selected.documents, escape));
    else if (action === 'request-accept') await mutate('request-review', { request_id: value, status: 'accepted' });
    else if (action === 'request-reopen') modal('Prośba o uzupełnienie', '<form id="request-reopen-form" data-request="' + escape(value) + '"><label for="request-note">Co należy uzupełnić?</label><textarea id="request-note" required maxlength="2000"></textarea><button>Przekaż klientowi</button></form>');
    else if (action === 'file-visibility') await mutate('file-visibility', { document_id: value, visible: selected.documents.find(d => d.id === value).client_visible === false });
    else if (action === 'share-draft') { await mutate('share-draft', { draft_id: value }); notice('Zatwierdzone pismo jest dostępne w portalu klienta.'); }
    else if (action === 'revoke-release' || action === 'acknowledge-release') await mutate(action, { release_id: value });
    else if (action === 'download-release') await download('/cases/' + selected.id + '/client-pdf/' + value, 'casecheck-sprawdzone-pismo.pdf');
    else if (action === 'download-docx') await download('/cases/' + selected.id + '/docx/' + value, 'casecheck-projekt.docx');
    else if (action === 'tab') { tab = value; render(); }
    else if (action === 'open-case') { tab = 'chat'; await openCase(value); }
    else if (action === 'consent') await mutate('consent', { accepted: true, provider: $('#provider').value });
    else if (action === 'handoff') await mutate('messages', { text: 'Proszę o kontakt z człowiekiem — prawnikiem.', analyze: false, request_handoff: true });
    else if (action === 'recover-job') await mutate('recover-job', { job_id: value });
    else if (action === 'review-package') await download(`/cases/${selected.id}/review-package`, 'casecheck-review-package.json');
    else if (action === 'source') sourceModal(value);
    else if (action === 'download-file') await download(`/cases/${selected.id}/files/${value}`, selected.documents.find(d => d.id === value).name);
    else if (action === 'document-text') {
      await openDocumentReview({ state: selected, documentId: value, modal, token, assetBase: base, isLawyer: isLawyer(),
        onSave: async (action, input) => { await mutate(action, input); return selected; } });
    } else if (action === 'ocr') {
      const doc = selected.documents.find(d => d.id === value);
      modal('Odczyt skanu', `<p>Cały plik ${escape(doc.name)} zostanie przekazany do DeepSeek. Odczyt zużyje budżet API. Wynik wymaga porównania z obrazem.</p>${button('Uruchom odczyt tego pliku', 'confirm-ocr', value)}`);
    } else if (action === 'confirm-ocr') { $('#modal').close(); await mutate('ocr', { document_id: value }); }
    else if (action === 'analyze-claim') {
      const ids = activeDocumentSourceIds(value);
      const input = { kind: 'claim', source_ids: ids };
      const preview = await api(`/cases/${selected.id}/preview`, input);
      modal(preview.read_plan?.api_required === false ? 'Odczyt lokalny dokumentu' : 'Zakres odczytu i przekazania do API', `<p>${preview.read_plan?.api_required === false ? 'Ten format odczytamy lokalnie, bez wysyłania do API i bez opłaty za model.' : `Lokalnie odczytamy ${preview.read_plan?.local_fields.length || 0} pól. Pozostałe pola przeanalizuje wybrany dostawca AI na podstawie poniższych fragmentów.`} Wynik będzie wymagał sprawdzenia.</p><pre>${escape(preview.sources.map(s => `Strona ${s.page}\n${s.text}`).join('\n\n'))}</pre>${button('Odczytaj roszczenie', 'confirm-claim-ai', value)}`);
    } else if (action === 'confirm-claim-ai') {
      $('#modal').close(); await mutate('analyze', { kind: 'claim', source_ids: activeDocumentSourceIds(value) });
    } else if (action === 'analyze-intake') {
      modal('Wybierz pola do odczytu', `<form id="analyze-form"><p class="small">Do 5 pól w jednym odczycie. Wybrane źródło prześlemy do dostawcy zaakceptowanego dla sprawy.</p><label for="intake-source">Wiadomość</label><select id="intake-source">${selected.sources.filter(s => s.kind === 'message').map(s => `<option value="${s.id}">${escape(s.text.slice(0, 130))}</option>`).join('')}</select>${config.knowledge.intake.fields.filter(f => f.tracks.includes(selected.track)).map(f => `<label><input type="checkbox" name="ai-field" value="${f.key}"> ${escape(f.label)}</label>`).join('')}<button>Odczytaj zaznaczone pola</button></form>`);
    } else if (['confirm-fact', 'reject-fact'].includes(action)) await mutate('review-fact', { fact_id: value, review: action === 'confirm-fact' ? 'confirmed' : 'rejected' });
    else if (['confirm-claim', 'reject-claim'].includes(action)) await mutate('review-claim', { claim_id: value, review: action === 'confirm-claim' ? 'confirmed' : 'rejected' });
    else if (action === 'extra-claim-ai') { const claim = selected.claims.find(c => c.id === value); await mutate('analyze', { kind: 'claim', source_ids: activeDocumentSourceIds(claim.document_id), fields: ['creditor_address', 'security_creation_date', 'disputed_scope', 'assignment_date'] }); }
    else if (action === 'correct-claim') modal('Uzupełnij dane roszczenia', `<form id="claim-correction-form" data-claim="${value}"><label for="claim-field">Pole</label><select id="claim-field">${Object.entries(claimLabels).map(([key, label]) => `<option value="${key}">${escape(label)}</option>`).join('')}</select><label for="claim-type">Rodzaj wartości</label><select id="claim-type"><option value="text">Opis</option><option value="money">Kwota</option><option value="date">Data RRRR-MM-DD</option><option value="boolean">Tak lub nie</option><option value="unknown">Nieznane / brak danych</option></select><label for="claim-value">Wartość — dla kwoty np. 50000,00; dla odpowiedzi: tak lub nie</label><input id="claim-value"><label for="claim-currency">Waluta (dla kwoty)</label><input id="claim-currency" value="PLN" maxlength="3"><label for="claim-as-of">Data salda (dla kwoty)</label><input id="claim-as-of" type="date"><label><input id="claim-approx" type="checkbox"> Kwota przybliżona / szacunkowa (tylko dla kwoty)</label><label for="claim-note">Źródło i uzasadnienie korekty</label><textarea id="claim-note" required></textarea><button>Zapisz do przeglądu</button></form>`);
    else if (action === 'correct-fact') {
      const fact = selected.current_facts[value], money = config.knowledge.intake.fields.find(f => f.key === value).type === 'money';
      modal('Korekta: ' + fieldLabel(value), `<form id="correction-form" data-field="${escape(value)}" data-type="${money ? 'money' : 'text'}"><label><input id="correct-unknown" type="checkbox"> Wartość nieznana — wycofaj poprzedni odczyt</label><label for="correct-value">${money ? 'Kwota, np. 3900,00' : 'Wartość'}</label><input id="correct-value" value="${escape(money && fact?.type === 'money' ? (fact.minor_units / 100).toFixed(2).replace('.', ',') : fact?.text_value || '')}" required>${money ? `<label for="correct-currency">Waluta</label><input id="correct-currency" value="${escape(fact?.currency || 'PLN')}" maxlength="3"><label for="correct-date">Data salda — jeśli znana</label><input id="correct-date" type="date" value="${escape(fact?.as_of || '')}"><label><input id="correct-approx" type="checkbox" ${fact?.precision === 'approximate' ? 'checked' : ''}> Kwota przybliżona / szacunkowa</label>` : ''}<label for="correct-note">Źródło i uzasadnienie ręcznej korekty</label><textarea id="correct-note" required></textarea><button>Zapisz do przeglądu</button></form>`);
    } else if (action === 'merge') {
      const ids = value.split('|');
      modal('Powiąż dokumenty jednego długu', `<form id="merge-form" data-ids="${escape(value)}"><label for="merge-selected">Dokument z właściwym saldem i wierzycielem</label><select id="merge-selected">${ids.map(id => {
        const c = selected.claims.find(c => c.id === id); return `<option value="${id}">${escape(valueOf(c.facts.find(f => f.field === 'creditor_name')))} · ${escape(valueOf(c.facts.find(f => f.field === 'total_amount')))}</option>`;
      }).join('')}</select><label for="merge-note">Dlaczego dokumenty dotyczą tego samego długu?</label><textarea id="merge-note" required minlength="6"></textarea><button>Powiąż i skieruj do przeglądu</button></form>`);
    } else if (action === 'clarification') {
      modal('Projekt prośby o wyjaśnienie', `<form id="clarification-form" data-claim="${value}"><label for="recipient-address">Adres wierzyciela, jeśli ustalony</label><textarea id="recipient-address"></textarea><button>Utwórz projekt</button></form>`);
    } else if (action === 'view-draft' || action === 'edit-draft') {
      const draft = selected.drafts.find(d => d.id === value);
      if (action === 'view-draft') modal(draft.title, `<p class="small">${escape(labels[draft.status])} · wersja ${draft.source_revision}</p>${draft.sections.map(s => `<h3>${escape(s.heading)}</h3><div class="article">${escape(s.text)}</div>`).join('')}${draft.manually_edited ? '<p class="privacy">Treść edytowano ręcznie. Przed zatwierdzeniem porównaj zmienione pismo z aktualnymi danymi i źródłami.</p>' : ''}${draft.field_evidence?.length ? `<details><summary>${draft.manually_edited ? 'Źródła danych przed ręczną edycją' : 'Źródła podstawionych danych'}</summary>${draft.field_evidence.map(f => `<p><strong>${escape(claimLabels[f.field] || fieldLabel(f.field))}</strong></p><div class="quote">${escape(f.quote || 'Korekta ręczna — sprawdź historię danych')}</div>${f.source_id ? button('Otwórz źródło', 'source', f.source_id) : ''}`).join('')}</details>` : ''}`);
      else modal('Edycja projektu', `<form id="edit-draft-form" data-draft="${value}">${draft.sections.map((s, i) => `<label for="section-${i}">${escape(s.heading)}</label><textarea id="section-${i}" data-section="${i}">${escape(s.text)}</textarea>`).join('')}<button>Zapisz nową wersję projektu</button></form>`);
    } else if (action === 'download-pdf') await download(`/cases/${selected.id}/pdf/${value}`, `casecheck-${selected.drafts.find(d => d.id === value).template}.pdf`);
    else if (action === 'approve-draft') await mutate('approve-draft', { draft_id: value });
    else if (action === 'toggle-task') await mutate('tasks', { task_id: value, status: selected.tasks.find(t => t.id === value).status === 'open' ? 'done' : 'open' });
    else if (action === 'audit') { const history = (await api(`/cases/${selected.id}/history`)).history; modal('Dziennik zmian', `<table><tr><th>Wersja</th><th>Zdarzenie</th><th>Data</th></tr>${history.map(h => `<tr><td>${h.revision}</td><td>${escape(h.event)}</td><td>${escape(h.at)}</td></tr>`).join('')}</table>`); }
    else if (action === 'export') await download(`/cases/${selected.id}/export`, 'casecheck-sprawa.json');
    else if (action === 'client-link') {
      const link = await api(`/cases/${selected.id}/link`, {}); const address = `${location.origin}${base}/#client=${link.token}&case=${selected.id}`;
      modal('Link do wywiadu klienta', `<p class="small">Ważny 7 dni, do ${escape(link.expires)}. Daje dostęp do tej jednej sprawy. Przekaż go właściwej osobie.</p><p class="links-list"><a href="${escape(address)}" target="_blank" rel="noopener noreferrer">${escape(address)}</a></p>`);
    } else if (action === 'revoke-links') { await api(`/cases/${selected.id}/revoke-links`, {}); notice('Dotychczasowe linki klienta zostały odwołane.'); }
    else if (action === 'approve-knowledge') { await api('/knowledge/approve', {}); await refreshConfig(); await showSettings(); }
    else if (action === 'disable-user') { await api('/users/disable', { user_id: value }); team = (await api('/team')).team; await showSettings(); }
  });
});
document.addEventListener('change', event => {
  if (event.target.id === 'correct-unknown') {
    const unknown = event.target.checked;
    for (const id of ['correct-value', 'correct-currency', 'correct-date', 'correct-approx']) if ($('#' + id)) $('#' + id).disabled = unknown;
    $('#correct-value').required = !unknown;
  }
});
document.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target;
  run(async () => {
    if (form.id === 'login-form') { const login = await api('/login', { email: $('#email').value, password: $('#password').value }); token = login.token; user = login.user; $('#password').value = ''; await enter(); }
    else if (form.id === 'new-case-form') { selected = await api('/cases', { title: $('#case-title').value, track: $('#case-track').value, synthetic: $('#synthetic').checked }); $('#modal').close(); tab = 'chat'; await refresh(); }
    else if (form.id === 'staff-reply-form') await mutate('staff-reply', { text: $('#staff-reply').value });
    else if (form.id === 'assistant-form') {
      const input = $('#assistant-input'); input.readOnly = true; $('#assistant-progress').hidden = false;
      try { await mutate('assistant-message', { text: input.value }); }
      finally { if (input.isConnected) { input.readOnly = false; $('#assistant-progress').hidden = true; } }
    }
    else if (form.id === 'client-request-form') await mutate('client-request', { title: $('#request-title').value, description: $('#request-description').value, target_date: $('#request-date').value || null });
    else if (form.id === 'request-answer-form') { const input = { request_id: form.dataset.request, text: $('#request-answer').value, document_ids: [...form.querySelectorAll('[name="response-document"]:checked')].map(i => i.value) }; await mutate('request-response', input); $('#modal').close(); }
    else if (form.id === 'request-reopen-form') { await mutate('request-review', { request_id: form.dataset.request, status: 'open', note: $('#request-note').value }); $('#modal').close(); }
    else if (form.id === 'firm-template-form') { const track = $('#firm-track').value; await api('/firm-templates', { ...(form.dataset.template ? { id: form.dataset.template, revision: Number(form.dataset.revision) } : {}), title: $('#firm-title').value, tracks: track === 'both' ? ['consumer', 'company'] : [track], sections: parseTemplateText($('#firm-content').value) }); await refresh(); modal('Wzory kancelarii', templateManager(config.firm_templates, isLawyer(), escape, button)); }
    else if (form.id === 'message-form') await mutate('messages', { text: $('#answer').value, field: $('#answer-field').value, analyze: $('#use-ai').checked });
    else if (form.id === 'upload-form') { const file = $('#file').files[0]; if (!file) return; selected = await api(`/cases/${selected.id}/upload`, file, { raw: true, headers: { 'X-File-Name': encodeURIComponent(file.name), 'X-Case-Revision': String(selected.revision) } }); await refresh(); }
    else if (form.id === 'analyze-form') {
      const fields = [...document.querySelectorAll('[name="ai-field"]:checked')].map(i => i.value); if (!fields.length || fields.length > 5) throw new Error('Zaznacz od 1 do 5 pól.');
      const sourceId = $('#intake-source').value; $('#modal').close(); await mutate('analyze', { kind: 'intake', fields, source_ids: [sourceId] });
    } else if (form.id === 'correction-form') {
      const type = $('#correct-unknown').checked ? 'unknown' : form.dataset.type, field = form.dataset.field, raw = $('#correct-value').value.trim();
      const fact = { field, type, text_value: type === 'text' ? raw : null, boolean_value: null, minor_units: null, currency: null, as_of: null,
        precision: type === 'unknown' ? 'unknown' : 'exact', source_id: null, quote: null };
      if (type === 'money') { if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error('Podaj kwotę z maksymalnie dwoma miejscami po przecinku.');
        const [whole, cents = ''] = raw.replace(',', '.').split('.'); fact.minor_units = Number(BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0')));
        fact.currency = $('#correct-currency').value.toUpperCase(); fact.as_of = $('#correct-date').value || null; fact.precision = $('#correct-approx').checked ? 'approximate' : 'exact'; }
      const note = $('#correct-note').value; $('#modal').close(); await mutate('correction', { fact, note });
    } else if (form.id === 'merge-form') { const into = $('#merge-selected').value, from = form.dataset.ids.split('|').find(id => id !== into), note = $('#merge-note').value; $('#modal').close(); await mutate('merge', { from, into, note }); }
    else if (form.id === 'claim-correction-form') {
      const type = $('#claim-type').value, raw = $('#claim-value').value.trim();
      const fact = { field: $('#claim-field').value, type, text_value: ['text', 'date'].includes(type) ? raw : null, boolean_value: null, minor_units: null, currency: null, as_of: null, precision: type === 'unknown' ? 'unknown' : 'exact', source_id: null, quote: null };
      if (type === 'money') { if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error('Podaj kwotę z maksymalnie dwoma miejscami po przecinku.'); const [whole, cents = ''] = raw.replace(',', '.').split('.'); fact.minor_units = Number(BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0'))); fact.currency = $('#claim-currency').value.toUpperCase(); fact.as_of = $('#claim-as-of').value || null; fact.precision = $('#claim-approx').checked ? 'approximate' : 'exact'; }
      if (type === 'boolean') { if (!/^(tak|nie)$/i.test(raw)) throw new Error('Wpisz tak albo nie.'); fact.boolean_value = raw.toLowerCase() === 'tak'; }
      const note = $('#claim-note').value, claim_id = form.dataset.claim; $('#modal').close(); await mutate('correct-claim', { fact, note, claim_id });
    }
    else if (form.id === 'draft-form') { const choice = $('#template').value; await mutate('drafts', choice.startsWith('firm:') ? { firm_template_id: choice.slice(5) } : { template: choice }); }
    else if (form.id === 'clarification-form') { const claim_id = form.dataset.claim, recipient_address = $('#recipient-address').value; $('#modal').close(); await mutate('drafts', { template: 'claim_clarification', options: { claim_id, recipient_address } }); tab = 'drafts'; render(); }
    else if (form.id === 'edit-draft-form') { const draft = selected.drafts.find(d => d.id === form.dataset.draft), sections = draft.sections.map((s, i) => ({ ...s, text: $('#section-' + i).value })); await mutate('edit-draft', { draft_id: draft.id, sections }); $('#modal').close(); }
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
function showNewConversation() {
  modal('Nowa rozmowa z asystentem', '<form id="new-case-form"><label for="case-title">Nazwa rozmowy lub sprawy</label><input id="case-title" required maxlength="150" placeholder="Np. rozmowa testowa"><label for="case-track">Kogo dotyczy rozmowa?</label><select id="case-track"><option value="consumer">Osoba fizyczna</option><option value="company">Firma</option></select><label><input type="checkbox" id="synthetic" checked> Wszystkie dane są fikcyjne</label><button>Otwórz asystenta</button></form>');
}
$('#new-case').addEventListener('click', showNewConversation);
$('#seed').addEventListener('click', () => run(async () => { const result = await api('/seed', {}); await refresh(); notice(`Wczytano ${result.imported} spraw testowych. Dane nie są wynikami AI — odczyt uruchamiasz osobno.`); }));
$('#settings-button').addEventListener('click', () => run(showSettings));
$('#logout').addEventListener('click', () => run(async () => { if (!isClient()) await api('/logout', {}); token = ''; user = null; location.reload(); }));
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('client')) {
  token = fragment.get('client'); history.replaceState(null, '', location.pathname);
  run(async () => { user = (await api('/me')).user; await enter(); });
}
