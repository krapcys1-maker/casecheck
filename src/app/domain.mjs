import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { uid, requireValue, text } from './store.mjs';
import { validateExtraction } from '../ai/extraction.mjs';
import { claimSourceProblem, ocrReviewIssues, sourceProblem, hasSourceReviewBlockers } from './document-review.mjs';
import { portalView, clientFileVisible } from './portal.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const intake = JSON.parse(readFileSync(new URL('../../legal/intake.json', import.meta.url), 'utf8'));
export const templates = JSON.parse(readFileSync(new URL('../../legal/templates.json', import.meta.url), 'utf8'));
export const legalSources = JSON.parse(readFileSync(new URL('../../legal/sources.json', import.meta.url), 'utf8'));
export const knowledge = { intake, templates, legalSources };
export const claimFields = ['creditor_name', 'agreement_number', 'original_creditor', 'principal_amount', 'interest_amount',
  'costs_amount', 'total_amount', 'balance_date', 'due_date', 'security_description', 'disputed'];
export const extraClaimFields = ['creditor_address', 'security_creation_date', 'disputed_scope', 'assignment_date'];
export const emptyCase = input => {
  requireValue(['consumer', 'company'].includes(input.track));
  return { title: text(input.title, 150), track: input.track, stage: 'intake', synthetic: input.synthetic === true,
    sources: [], messages: [], facts: [], claims: [], drafts: [], tasks: [], jobs: [], consent: null, handoff: false };
};
export const fieldSet = state => intake.fields.filter(field => field.tracks.includes(state.track));
export const currentFacts = state => Object.fromEntries(state.facts.filter(f => f.current).map(f => [f.field, f]));
export function missing(state) {
  const facts = currentFacts(state);
  return fieldSet(state).filter(field => !facts[field.key] || facts[field.key].type === 'unknown' ||
    facts[field.key].review === 'rejected' || facts[field.key].source_invalidated);
}
export function nextQuestion(state) {
  if (state.handoff) return 'Zgłoszenie przekazano do obsługi przez człowieka. Możesz nadal dodać dokumenty lub informacje.';
  return missing(state)[0]?.question || 'Wywiad jest zapisany. Prawnik sprawdzi źródła i poprosi o ewentualne uzupełnienia.';
}
export function addSource(state, { text: content, kind = 'message', title = 'Wiadomość', page = null, document_id = null, read_method = 'text' }) {
  requireValue(state.sources.length < 240, 'SOURCE_LIMIT', 413);
  const source = { id: uid(), text: text(content, 20000, true), kind, title: text(title, 200), page, document_id, read_method };
  state.sources.push(source); return source;
}
export function putFacts(state, facts, { method = 'ai', review = 'pending', actor = null } = {}) {
  for (const fact of facts) {
    if (method !== 'manual' && fact.type === 'unknown' && currentFacts(state)[fact.field]?.type !== 'unknown' && currentFacts(state)[fact.field] && !currentFacts(state)[fact.field].source_invalidated) {
      state.facts.push({ ...fact, id: uid(), current: false, method, review, actor }); continue;
    }
    for (const previous of state.facts.filter(f => f.field === fact.field && f.current)) previous.current = false;
    state.facts.push({ ...fact, id: uid(), current: true, method, review, actor });
  }
}
export function validateManualFact(state, fact) {
  requireValue(fieldSet(state).some(field => field.key === fact.field), 'INVALID_FIELD');
  validateExtraction({ facts: [fact], questions: [], warnings: [] }, { requested_fields: [fact.field], sources: state.sources });
  validateFieldTypes(state, [fact], 'intake');
}
export function validateFieldTypes(state, facts, kind) {
  for (const fact of facts) {
    const type = kind === 'intake' ? fieldSet(state).find(f => f.key === fact.field)?.type : fact.field.endsWith('_amount') ? 'money'
      : fact.field.endsWith('_date') ? 'date' : fact.field === 'disputed' ? 'boolean' : 'text';
    requireValue(fact.type === 'unknown' || fact.type === type, 'INVALID_FIELD_TYPE', 422);
  }
}
// Quarantine a mistyped API field without guessing a conversion or discarding valid siblings.
// Manual edits and saved receipts still use strict validateFieldTypes.
export function quarantineFieldTypes(state, output, kind) {
  const abstentions = [];
  for (const fact of output.facts) {
    try { validateFieldTypes(state, [fact], kind); }
    catch (error) {
      if (error.code !== 'INVALID_FIELD_TYPE') throw error;
      abstentions.push({ field: fact.field, returned_type: fact.type, method: 'invalid_field_abstention', code: error.code });
      Object.assign(fact, { type: 'unknown', text_value: null, boolean_value: null, minor_units: null,
        currency: null, as_of: null, precision: 'unknown' });
      output.warnings.push(`${fact.field}: niepoprawny typ odczytu; wartość pozostaje nieznana. Wymagany przegląd źródła.`);
    }
  }
  return abstentions;
}
export const factValue = fact => {
  if (!fact || fact.type === 'unknown' || fact.review === 'rejected' || fact.source_invalidated) return '[DO UZUPEŁNIENIA]';
  if (fact.type === 'money') return `${fact.precision === 'approximate' ? 'około ' : ''}${(fact.minor_units / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${fact.currency}${fact.as_of ? ' (saldo ' + fact.as_of + ')' : ''}`;
  if (fact.type === 'boolean') return fact.boolean_value ? 'tak' : 'nie';
  return fact.text_value;
};
export const claimFact = (claim, field) => claim.facts.find(f => f.field === field);
// Partial updates must not carry an address or dispute scope across a changed subject.
// Freshly supplied dependent fields are independently validated; retained ones need review again.
export function invalidateClaimDependents(claim, previousFacts, replacedFields) {
  const invalidated = [];
  const signature = f => JSON.stringify([f?.type, f?.text_value?.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('pl'), f?.boolean_value]);
  for (const [parent, dependent] of [['creditor_name', 'creditor_address'], ['disputed', 'disputed_scope'], ['security_description', 'security_creation_date']]) {
    if (!replacedFields.includes(parent) || replacedFields.includes(dependent) ||
      signature(previousFacts.find(f => f.field === parent)) === signature(claimFact(claim, parent))) continue;
    const fact = claimFact(claim, dependent);
    if (!fact || fact.type === 'unknown') continue;
    claim.fact_history ||= []; claim.fact_history.push({ ...fact });
    Object.assign(fact, { type: 'unknown', text_value: null, boolean_value: null, minor_units: null, currency: null, as_of: null,
      precision: 'unknown', invalidated_by_field: parent });
    invalidated.push({ field: dependent, changed_field: parent, code: 'RELATED_FIELD_CHANGED' });
  }
  return invalidated;
}

export function controls(state) {
  const candidates = [], sums = new Map(), issues = [];
  const active = state.claims.filter(claim => !claim.merged_into && claim.review !== 'rejected');
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = claimFact(active[i], 'agreement_number')?.text_value, b = claimFact(active[j], 'agreement_number')?.text_value;
    if (a && b && a.trim().toLowerCase() === b.trim().toLowerCase()) candidates.push([active[i].id, active[j].id]);
  }
  const ambiguous = new Set(candidates.flat());
  for (const claim of active) {
    const total = claimFact(claim, 'total_amount');
    if (claim.review !== 'confirmed' || ambiguous.has(claim.id) || total?.precision !== 'exact' || !total.as_of || claimSourceProblem(state, claim)) {
      issues.push({ claim_id: claim.id, code: ambiguous.has(claim.id) ? 'possible_duplicate' : 'amount_requires_review' }); continue;
    }
    const key = `${total.currency}/${total.as_of}`, prev = sums.get(key) || 0n;
    sums.set(key, prev + BigInt(total.minor_units));
    const parts = ['principal_amount', 'interest_amount', 'costs_amount'].map(field => claimFact(claim, field));
    if (parts.every(p => p?.type === 'money' && p.precision === 'exact' && p.currency === total.currency && p.as_of === total.as_of) &&
      parts.reduce((n, p) => n + BigInt(p.minor_units), 0n) !== BigInt(total.minor_units)) issues.push({ claim_id: claim.id, code: 'components_mismatch' });
    if (claimFact(claim, 'disputed')?.boolean_value) issues.push({ claim_id: claim.id, code: 'disputed' });
  }
  const totals = [...sums].map(([key, value]) => {
    requireValue(value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER), 'MONEY_OVERFLOW');
    const [currency, as_of] = key.split('/'); return { currency, as_of, minor_units: Number(value) };
  });
  const declared = currentFacts(state).declared_total;
  const comparable = totals.find(t => declared?.type === 'money' && declared.precision === 'exact' && t.currency === declared.currency && t.as_of === declared.as_of);
  const excluded = issues.filter(i => ['possible_duplicate', 'amount_requires_review'].includes(i.code)).length;
  const reasons = [];
  if (!comparable || declared.review === 'rejected' || declared.source_invalidated || sourceProblem(state, declared.source_id)) reasons.push('declaration_not_comparable');
  if (totals.length > 1) reasons.push('mixed_balance_groups');
  if (excluded) reasons.push('excluded_claims');
  if (!active.length) reasons.push('no_claims');
  let difference = null;
  if (!reasons.length) {
    const minor = BigInt(declared.minor_units) - BigInt(comparable.minor_units);
    requireValue(minor <= BigInt(Number.MAX_SAFE_INTEGER) && minor >= BigInt(Number.MIN_SAFE_INTEGER), 'MONEY_OVERFLOW');
    difference = { ...comparable, minor_units: Number(minor) };
  }
  return { candidates, totals, issues, excluded_claims: excluded, difference, comparison_reasons: reasons,
    missing_fields: missing(state).map(({ key, label, question }) => ({ key, label, question })) };
}
// Operational counts, not a legal assessment or an AI confidence score.
export function reviewSummary(state, today = new Date().toISOString().slice(0, 10)) {
  const checks = controls(state), facts = Object.values(currentFacts(state));
  const known = facts.filter(f => f.type !== 'unknown' && f.review !== 'rejected' && !f.source_invalidated);
  const active = state.claims.filter(c => !c.merged_into);
  const open = state.tasks.filter(t => t.status === 'open');
  const currentDrafts = state.drafts.filter(d => d.source_revision === state.data_revision && d.status !== 'stale');
  return { field_count: fieldSet(state).length, known_fields: known.length,
    confirmed_fields: known.filter(f => f.review === 'confirmed' && !sourceProblem(state, f.source_id)).length,
    pending_facts: facts.filter(f => f.type !== 'unknown' && f.review !== 'rejected' && (f.review === 'pending' || f.source_invalidated || sourceProblem(state, f.source_id))).length, missing_fields: checks.missing_fields.length,
    active_claims: active.length, pending_claims: active.filter(c => c.review !== 'rejected' && (c.review === 'pending' || claimSourceProblem(state, c))).length,
    duplicate_pairs: checks.candidates.length,
    disputed_claims: active.filter(c => claimFact(c, 'disputed')?.boolean_value === true).length,
    unread_documents: (state.documents || []).filter(d => !['read', 'ocr_review', 'ocr_verified'].includes(d.status)).length,
    ocr_documents: new Set(ocrReviewIssues(state).map(p => p.document_id)).size,
    ocr_pages_pending: ocrReviewIssues(state).length,
    difference: checks.difference, open_tasks: open.length,
    overdue_tasks: open.filter(t => t.due && t.due < today).length,
    client_requests_open: (state.client_requests || []).filter(r => r.status === 'open').length,
    client_responses_pending: (state.client_requests || []).filter(r => r.status === 'submitted').length,
    current_drafts: currentDrafts.length, approved_drafts: hasSourceReviewBlockers(state) ? 0 : currentDrafts.filter(d => d.status === 'approved').length };
}
export function publicCase(state, actor) {
  const checks = controls(state);
  if (actor.role === 'client') return { id: state.id, title: state.title, track: state.track, synthetic: state.synthetic,
    stage: state.stage, revision: state.revision, messages: state.messages, consent: state.consent, handoff: state.handoff,
    documents: (state.documents || []).filter(clientFileVisible), portal: portalView(state), next_question: nextQuestion(state), missing: checks.missing_fields };
  return { ...state, portal: portalView(state), controls: checks, review_summary: reviewSummary(state), current_facts: currentFacts(state), next_question: nextQuestion(state) };
}
export function draftSections(state, templateId, options = {}) {
  const facts = currentFacts(state), value = key => factValue(facts[key]);
  const reviewLabel = value => ({ confirmed: 'potwierdzone', pending: 'do przeglądu', rejected: 'odrzucone' }[value] || value);
  const template = templates.templates.find(t => t.id === templateId && t.tracks.includes(state.track));
  requireValue(template, 'INVALID_TEMPLATE');
  const sections = [{ heading: templateId === 'claim_clarification' ? 'Nadawca' : 'Dane sprawy', text: templateId === 'claim_clarification'
    ? `${value('client_name')}\n${value('address')}` : `Sprawa: ${state.title}\nOsoba lub firma: ${value('client_name')}\nAdres: ${value('address')}\nŚcieżka: ${state.track === 'consumer' ? 'konsumencka' : 'firmowa'}` }];
  if (templateId === 'claim_clarification') sections.unshift({ heading: 'Miejscowość i data', text: `[DO UZUPEŁNIENIA: miejscowość], ${new Date().toISOString().slice(0, 10)}` });
  const listed = state.claims.filter(c => !c.merged_into && c.review !== 'rejected').map((claim, i) => `${i + 1}. ${factValue(claimFact(claim, 'creditor_name'))}; adres: ${factValue(claimFact(claim, 'creditor_address'))}; umowa: ${factValue(claimFact(claim, 'agreement_number'))}; kwota: ${factValue(claimFact(claim, 'total_amount'))}; termin wymagalności: ${factValue(claimFact(claim, 'due_date'))}; zabezpieczenie: ${factValue(claimFact(claim, 'security_description'))}; data ustanowienia: ${factValue(claimFact(claim, 'security_creation_date'))}; spór: ${factValue(claimFact(claim, 'disputed'))}; zakres sporu: ${factValue(claimFact(claim, 'disputed_scope'))}; przegląd: ${reviewLabel(claim.review)}.`).join('\n\n') || '[DO UZUPEŁNIENIA: wierzyciele i dokumenty]';
  if (templateId === 'case_card') {
    sections.push({ heading: 'Informacje z wywiadu', text: fieldSet(state).map(f => `${f.label}: ${value(f.key)}${facts[f.key] ? ' [' + reviewLabel(facts[f.key].review) + ']' : ''}`).join('\n\n') });
    sections.push({ heading: 'Zobowiązania', text: listed });
  } else if (templateId === 'creditor_list') {
    sections.push({ heading: 'Pomocniczy wykaz', text: listed });
    sections.push({ heading: 'Dane do uzupełnienia', text: 'Dla każdego wierzyciela należy sprawdzić adres, kwotę, datę salda i termin zapłaty; osobno ustalić zakres sporu oraz zabezpieczenia i daty ich ustanowienia. Niepotwierdzone pozycje nie zostały uznane przez klienta. Wykaz nie zastępuje spisu wierzytelności sporządzanego w postępowaniu restrukturyzacyjnym.' });
  } else if (templateId === 'missing_documents') {
    sections.push({ heading: 'Prośba o uzupełnienie', text: 'Prosimy o przekazanie poniższych informacji i związanych z nimi dokumentów. Jeżeli informacja jest nieznana lub dokument jest niedostępny, prosimy to wskazać.\n\n' + missing(state).map((f, i) => `${i + 1}. ${f.question}`).join('\n\n') });
  } else if (templateId === 'claim_clarification') {
    const claim = state.claims.find(c => c.id === options.claim_id && !c.merged_into);
    requireValue(claim, 'CLAIM_REQUIRED');
    requireValue(claim.review !== 'rejected', 'CLAIM_REJECTED', 409);
    const creditor = claimFact(claim, 'creditor_name');
    const address = claimFact(claim, 'creditor_address');
    const recipientAddress = options.recipient_address || factValue(address);
    sections.push({ heading: 'Adresat', text: `${factValue(creditor)}\n${text(recipientAddress, 500)}` });
    sections.push({ heading: 'Prośba o wyjaśnienie roszczenia', text: `W związku z informacją dotyczącą umowy lub dokumentu ${factValue(claimFact(claim, 'agreement_number'))} proszę o przedstawienie podstawy dochodzonego roszczenia, kopii umowy oraz szczegółowego rozliczenia kapitału, odsetek i kosztów, z uwzględnieniem wpłat i daty salda.\n\nJeżeli wierzytelność została nabyta od innego podmiotu, proszę również o dokumenty lub informacje pozwalające ustalić następstwo prawne i zidentyfikować wierzytelność objętą przelewem.\n\nNiniejsza prośba służy wyjaśnieniu danych i nie stanowi oświadczenia o uznaniu długu ani jego wysokości. Jej treść należy ocenić w świetle okoliczności konkretnej sprawy przed wysłaniem.\n\n[Podpis osoby uprawnionej — po zatwierdzeniu projektu]` });
  } else if (templateId === 'preliminary_plan') {
    sections.push({ heading: '1. Przyczyny trudnej sytuacji ekonomicznej', text: value('causes') });
    sections.push({ heading: '2. Wstępny opis środków i kosztów restrukturyzacji', text: value('recovery_measures') });
    sections.push({ heading: '3. Wstępny harmonogram wdrożenia', text: value('recovery_schedule') });
    sections.push({ heading: '4. Sprawozdanie finansowe albo przyczyny jego braku', text: value('financial_statements') + '\nDo sprawdzenia: sprawozdanie finansowe sporządzone na dzień przypadający w okresie 30 dni przed złożeniem wniosku; w przypadku jego braku wskazanie przyczyn.' });
    sections.push({ heading: 'Zakres', text: 'Szkic porządkuje elementy wstępnego planu z art. 9 Prawa restrukturyzacyjnego. Pełny plan z art. 10 wymaga dalszych analiz, w tym prognoz i scenariuszy. Nie rozstrzygnięto rodzaju postępowania ani zdolności do jego prowadzenia.' });
  }
  if (!['claim_clarification', 'missing_documents'].includes(templateId)) sections.push({ heading: 'Źródła informacji', text: state.sources.filter(s => state.facts.some(f => f.current && f.source_id === s.id) || state.claims.some(c => !c.merged_into && c.source_ids.includes(s.id)))
    .map((s, i) => `${i + 1}. ${s.title}${s.page ? ', strona ' + s.page : ''} (oznaczenie ${s.id.slice(0, 8)})`).join('\n') || 'Brak źródeł przypisanych do ustaleń.' });
  return { template, sections };
}
