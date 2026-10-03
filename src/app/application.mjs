import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractFacts, providerConfig, validateExtraction } from '../ai/extraction.mjs';
import { Store, AppError, uid, text, requireValue, digest, validDate } from './store.mjs';
import { root, emptyCase, knowledge, currentFacts, fieldSet, addSource, putFacts, validateManualFact,
  claimFields, extraClaimFields, templates, draftSections, nextQuestion, controls, validateFieldTypes } from './domain.mjs';
import { saveFile, readDocument, ocrDocument, deleteFile } from './files.mjs';
import { registryLookup } from './registries.mjs';
import { guardClaimSemantics } from '../ai/semantics.mjs';

export class Application {
  constructor({ env = process.env, stateDir, now, extract = extractFacts, ocr = ocrDocument, reader = readDocument, limit = 20 }) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    this.lockPath = resolve(stateDir, 'app.lock');
    try { writeFileSync(this.lockPath, String(process.pid), { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(this.lockPath, 'utf8'));
      requireValue(Number.isInteger(pid) && pid > 0, 'INVALID_PROCESS_LOCK', 503);
      try { process.kill(pid, 0); throw new AppError(503, 'APP_ALREADY_RUNNING'); }
      catch (e) { if (e.code !== 'ESRCH') throw e; }
      unlinkSync(this.lockPath); writeFileSync(this.lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
    }
    this.env = env; this.store = new Store(stateDir, { now, limit }); this.extract = extract; this.ocr = ocr; this.reader = reader;
    this.busy = false;
    // No job is silently retried after a crash, so a retry cannot spend twice invisibly.
    for (const row of this.store.db.prepare('SELECT tenant,state FROM cases').all()) {
      const state = JSON.parse(row.state);
      if (state.jobs.some(j => j.status === 'running') || (state.documents || []).some(d => d.status === 'reading')) {
        this.store.update({ tenant: row.tenant, id: 'system', role: 'admin' }, state.id, state.revision, 'interrupted_jobs', s => {
          s.jobs.filter(j => j.status === 'running').forEach(j => { j.status = 'interrupted'; j.error = 'RETRY_REQUIRED'; });
          (s.documents || []).filter(d => d.status === 'reading').forEach(d => { d.status = 'read_failed'; d.error = 'RETRY_REQUIRED'; });
        });
      }
    }
  }
  close() { this.store.close(); unlinkSync(this.lockPath); }
  create(actor, input) { return this.store.insert(actor, emptyCase(input)); }
  consent(actor, id, input) {
    requireValue(input.accepted === true && ['openai', 'anthropic', 'deepseek'].includes(input.provider), 'CONSENT_REQUIRED');
    providerConfig(input.provider, this.env);
    return this.store.update(actor, id, input.revision, 'ai_consent', state => {
      state.consent = { provider: input.provider, notice_version: 'external-api-v1', at: this.store.now().toISOString(), actor: actor.id };
    });
  }
  message(actor, id, input) {
    return this.store.update(actor, id, input.revision, 'client_message', state => {
      requireValue(state.messages.length < 400, 'MESSAGE_LIMIT', 413);
      if (input.field) requireValue(fieldSet(state).some(f => f.key === input.field), 'INVALID_FIELD');
      const content = text(input.text, 12000), source = addSource(state, { text: content, title: `Wiadomość ${state.messages.length + 1}` });
      state.messages.push({ id: uid(), role: 'user', text: content, source_id: source.id, field: input.field || null, at: this.store.now().toISOString() });
      requireValue(input.request_handoff === undefined || typeof input.request_handoff === 'boolean');
      if (input.request_handoff === true || /(?:człowie[kc]|czlowie[kc]|prawnik|konsultant)\p{L}*/iu.test(content) &&
        /rozmow|rozmaw|kontakt|połącz|polacz|prosz/i.test(content)) {
        state.handoff = true;
        if (!state.tasks.some(t => t.purpose === 'client_handoff' && t.status === 'open')) state.tasks.push({ id: uid(),
          title: 'Kontakt z klientem: prośba o obsługę przez człowieka', purpose: 'client_handoff', kind: 'administrative', due: null, status: 'open', assignee: null });
      }
    });
  }
  botReply(actor, id, revision, prefix = '') {
    return this.store.update(actor, id, revision, 'bot_question', state => {
      state.messages.push({ id: uid(), role: 'assistant', text: prefix + nextQuestion(state), at: this.store.now().toISOString() });
    }, { invalidate: false });
  }
  checkAI(actor, state, provider) {
    requireValue(state.consent?.provider === provider, 'CONSENT_REQUIRED', 403);
    providerConfig(provider, this.env);
    const kb = this.store.knowledge(actor, knowledge);
    requireValue(state.synthetic || kb.approved_at, 'KNOWLEDGE_REVIEW_REQUIRED', 403);
    requireValue(!this.busy, 'REQUEST_IN_PROGRESS', 429);
  }
  preview(actor, id, input) {
    const state = this.store.get(actor, id);
    requireValue(['intake', 'claim'].includes(input.kind));
    const sources = input.source_ids ? state.sources.filter(s => input.source_ids.includes(s.id))
      : state.sources.filter(s => s.kind === 'message').slice(-3);
    requireValue(sources.length > 0 && sources.length <= 20 && (!input.source_ids || sources.length === input.source_ids.length), 'INVALID_SOURCES');
    requireValue(sources.reduce((n, s) => n + s.text.length, 0) <= 80000, 'SOURCE_LIMIT');
    if (input.kind === 'claim') requireValue(sources.every(s => s.document_id && s.document_id === sources[0].document_id), 'SINGLE_DOCUMENT_REQUIRED');
    const fields = input.kind === 'claim' ? input.fields || claimFields : input.fields;
    requireValue(Array.isArray(fields) && fields.length > 0 && fields.length <= 12 && new Set(fields).size === fields.length &&
      (input.kind === 'claim' ? fields.every(f => [...claimFields, ...extraClaimFields].includes(f)) : fields.every(f => fieldSet(state).some(s => s.key === f))), 'INVALID_FIELDS');
    return { sources: sources.map(s => ({ id: s.id, text: s.text, kind: s.kind, page: s.page })), requested_fields: fields };
  }
  async analyze(actor, id, input) {
    const state = this.store.get(actor, id); requireValue(state.revision === input.revision, 'VERSION_CONFLICT', 409);
    const provider = input.provider || state.consent?.provider, task = this.preview(actor, id, input);
    this.checkAI(actor, state, provider);
    const job = { id: uid(), kind: input.kind, provider, status: 'running', requested_fields: task.requested_fields,
      source_ids: task.sources.map(s => s.id), input_sha256: digest(JSON.stringify(task)), started_at: this.store.now().toISOString() };
    const started = this.store.update(actor, id, state.revision, 'ai_started', s => { s.jobs.push(job); }, { invalidate: false, reserveAI: true });
    this.busy = true;
    let result, failure, failureDetails;
    try {
      result = await this.extract({ provider, ...task, env: this.env, maxOutputTokens: 2000 });
      result.normalized_absence_fields = [];
      for (const fact of result.output.facts) if (fact.type === 'text' && /^(brak danych|nie wiem|nieznane|nieczytelne)[.!]?$/i.test(fact.text_value.trim())) {
        result.normalized_absence_fields.push(fact.field); fact.type = 'unknown'; fact.text_value = null; fact.precision = 'unknown';
      }
      validateExtraction(result.output, task);
      validateFieldTypes(state, result.output.facts, input.kind);
      result.semantic_flags = input.kind === 'claim' ? guardClaimSemantics(result.output, task.sources) : [];
    }
    catch (error) {
      failure = /^[A-Z_]{3,60}$/.test(error.code || '') ? error.code : 'AI_FAILED';
      failureDetails = { usage: error.usage || null, prompt_version: error.prompt_version || null,
        model: error.model || null, elapsed_ms: error.elapsed_ms || null, diagnostics: error.diagnostics || null };
    }
    finally { this.busy = false; }
    let current;
    try { current = this.store.get(actor, id); } catch { throw new AppError(409, 'CASE_REMOVED_DURING_JOB'); }
    return this.store.update(actor, id, current.revision, 'ai_finished', s => {
      const saved = s.jobs.find(j => j.id === job.id);
      saved.finished_at = this.store.now().toISOString();
      if (failure) { saved.status = 'failed'; saved.error = failure; Object.assign(saved, failureDetails); return; }
      saved.model = result.model; saved.usage = result.usage; saved.prompt_version = result.prompt_version;
      saved.elapsed_ms = result.elapsed_ms; saved.request_contract_sha256 = result.request_contract_sha256;
      saved.normalized_absence_fields = result.normalized_absence_fields;
      saved.evidence_repairs = result.evidence_repairs || [];
      saved.semantic_flags = result.semantic_flags;
      if (current.data_revision !== started.data_revision) { saved.status = 'discarded'; saved.error = 'STALE_CASE_VERSION'; return; }
      saved.status = 'completed'; saved.warnings = result.output.warnings;
      if (input.kind === 'intake') putFacts(s, result.output.facts);
      else {
        const documentId = s.sources.find(source => source.id === task.sources[0].id).document_id;
        const existing = s.claims.find(c => c.document_id === documentId && !c.merged_into);
        if (existing) existing.review = 'superseded';
        s.claims.push({ id: uid(), document_id: documentId, source_ids: [...new Set([...(existing?.source_ids || []), ...job.source_ids])], facts: result.output.facts,
          review: 'pending', merged_into: null, supersedes: existing?.id || null });
        if (existing) s.claims.at(-1).facts = [...existing.facts.filter(f => !task.requested_fields.includes(f.field)), ...result.output.facts];
        if (existing?.fact_history) s.claims.at(-1).fact_history = existing.fact_history;
        if (existing) existing.merged_into = s.claims.at(-1).id;
      }
    }, { invalidate: !failure && current.data_revision === started.data_revision });
  }
  async chat(actor, id, input) {
    let state = this.message(actor, id, input), warning = '';
    if (input.analyze === true && !state.handoff) {
      const current = currentFacts(state);
      const fields = [...new Set([input.field, ...fieldSet(state).filter(f => !current[f.key] || current[f.key].type === 'unknown').map(f => f.key)]
        .filter(Boolean))].slice(0, 5);
      if (fields.length) {
        try {
          state = await this.analyze(actor, id, { revision: state.revision, kind: 'intake', fields, provider: state.consent?.provider });
          if (state.jobs.at(-1).status !== 'completed') warning = 'Odpowiedź zapisano, ale dane wymagają ponownego odczytu lub ręcznego przeglądu. ';
        } catch (error) {
          if (error.code === 'VERSION_CONFLICT') throw error;
          warning = 'Odpowiedź zapisano. Analiza AI jest obecnie niedostępna; możesz kontynuować wywiad lub poprosić o przegląd. ';
          state = this.store.get(actor, id);
        }
      }
    }
    return this.botReply(actor, id, state.revision, warning);
  }
  async upload(actor, id, revision, buffer, name) {
    const current = this.store.get(actor, id); requireValue(current.revision === revision, 'VERSION_CONFLICT', 409);
    requireValue((current.documents || []).length < 40, 'FILE_COUNT_LIMIT', 413);
    const doc = saveFile(this.store.directory, buffer, name);
    try { this.store.update(actor, id, revision, 'file_uploaded', s => { s.documents ||= []; s.documents.push({ ...doc, status: 'reading' }); }); }
    catch (error) { deleteFile(this.store.directory, doc.id); throw error; }
    let output, error;
    try { output = await this.reader(this.store.directory, doc); }
    catch (e) { error = e.code || 'DOCUMENT_UNREADABLE'; }
    let latest;
    try { latest = this.store.get(actor, id); }
    catch { deleteFile(this.store.directory, doc.id); throw new AppError(409, 'CASE_REMOVED_DURING_JOB'); }
    if (!error && latest.sources.length + output.pages.length > 240) error = 'SOURCE_LIMIT';
    return this.store.update(actor, id, latest.revision, 'file_read', s => {
      const saved = s.documents.find(d => d.id === doc.id);
      if (error) { saved.status = 'read_failed'; saved.error = error; return; }
      saved.pages = output.pages.length;
      saved.status = output.pages.some(p => p.text.length < 40) ? 'ocr_required' : 'read';
      for (const page of output.pages) addSource(s, { text: page.text, title: name, page: page.page, kind: 'document', document_id: doc.id });
    });
  }
  async runOCR(actor, id, input) {
    const state = this.store.get(actor, id); requireValue(state.revision === input.revision, 'VERSION_CONFLICT', 409);
    const document = state.documents?.find(d => d.id === input.document_id);
    requireValue(document && document.status === 'ocr_required', 'OCR_NOT_REQUIRED');
    requireValue(['pdf', 'png', 'jpeg'].includes(document.kind) && document.size <= 3 * 1024 * 1024 && document.pages <= 5, 'OCR_FILE_LIMIT', 413);
    this.checkAI(actor, state, 'openai');
    const job = { id: uid(), kind: 'ocr', provider: 'openai', status: 'running', document_id: document.id, started_at: this.store.now().toISOString() };
    const started = this.store.update(actor, id, state.revision, 'ocr_started', s => { s.jobs.push(job); }, { invalidate: false, reserveAI: true });
    this.busy = true;
    let result, error;
    try { result = await this.ocr(this.store.directory, document, this.env); } catch (e) { error = e.code || 'OCR_FAILED'; }
    finally { this.busy = false; }
    const latest = this.store.get(actor, id);
    if (!error && latest.sources.length + result.pages.length > 240) error = 'SOURCE_LIMIT';
    return this.store.update(actor, id, latest.revision, 'ocr_finished', s => {
      const saved = s.jobs.find(j => j.id === job.id); saved.finished_at = this.store.now().toISOString();
      if (error) { saved.status = 'failed'; saved.error = error; return; }
      if (latest.data_revision !== started.data_revision) { saved.status = 'discarded'; saved.error = 'STALE_CASE_VERSION'; return; }
      saved.status = 'completed'; saved.model = result.model; saved.usage = result.usage;
      s.documents.find(d => d.id === document.id).status = 'ocr_review';
      // Original text pages remain available; the OCR transcription is a separate source.
      for (const page of result.pages) addSource(s, { text: page.text, title: document.name, page: page.page,
        kind: 'document', document_id: document.id, read_method: 'ai_ocr_requires_image_review' });
    }, { invalidate: !error && latest.data_revision === started.data_revision });
  }
  reviewFact(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'fact_reviewed', state => {
      const fact = state.facts.find(f => f.id === input.fact_id && f.current);
      requireValue(fact && ['confirmed', 'rejected'].includes(input.review));
      fact.review = input.review; fact.reviewed_by = actor.name;
      fact.reviewed_at = this.store.now().toISOString();
    });
  }
  correction(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'fact_corrected', s => {
      const source = addSource(s, { text: text(input.note, 4000), title: `Korekta: ${actor.name}`, kind: 'review' });
      const fact = { ...input.fact, source_id: source.id, quote: source.text };
      validateManualFact(s, fact); putFacts(s, [fact], { method: 'manual', actor: actor.name });
    });
  }
  reviewClaim(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'claim_reviewed', s => {
      const claim = s.claims.find(c => c.id === input.claim_id && !c.merged_into);
      requireValue(claim && ['confirmed', 'rejected', 'pending'].includes(input.review));
      claim.review = input.review; claim.reviewed_by = actor.name;
      claim.reviewed_at = this.store.now().toISOString();
    });
  }
  correctClaim(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'claim_corrected', s => {
      const claim = s.claims.find(c => c.id === input.claim_id && !c.merged_into); requireValue(claim, 'NOT_FOUND', 404);
      requireValue([...claimFields, ...extraClaimFields].includes(input.fact?.field), 'INVALID_FIELD');
      const source = addSource(s, { text: text(input.note, 4000), title: `Korekta roszczenia: ${actor.name}`, kind: 'review' });
      const fact = { ...input.fact, source_id: source.id, quote: source.text };
      validateExtraction({ facts: [fact], questions: [], warnings: [] }, { requested_fields: [fact.field], sources: s.sources });
      validateFieldTypes(s, [fact], 'claim');
      claim.fact_history ||= []; claim.fact_history.push(...claim.facts.filter(f => f.field === fact.field));
      claim.facts = [...claim.facts.filter(f => f.field !== fact.field), fact]; claim.source_ids.push(source.id); claim.review = 'pending';
    });
  }
  merge(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    requireValue(typeof input.note === 'string' && input.note.trim().length > 5, 'REVIEW_NOTE_REQUIRED');
    return this.store.update(actor, id, input.revision, 'claims_linked', s => {
      const older = s.claims.find(c => c.id === input.from), selected = s.claims.find(c => c.id === input.into);
      requireValue(older && selected && older.id !== selected.id && !older.merged_into && !selected.merged_into, 'INVALID_MERGE');
      older.merged_into = selected.id; selected.source_ids = [...new Set([...selected.source_ids, ...older.source_ids])];
      selected.review = 'pending'; selected.link_note = text(input.note, 1000); selected.linked_by = actor.name;
    });
  }
  draft(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'draft_created', s => {
      requireValue(s.drafts.length < 50, 'DRAFT_LIMIT', 413);
      const { template, sections } = draftSections(s, input.template, input.options);
      s.drafts.push({ id: uid(), template: template.id, title: template.title, sections, status: 'draft',
        source_revision: s.data_revision, template_version: templates.version, content_hash: digest(JSON.stringify(sections)),
        synthetic: s.synthetic, created_at: this.store.now().toISOString(), legal_sources: template.source_ids });
    }, { invalidate: false });
  }
  editDraft(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'draft_edited', s => {
      const draft = s.drafts.find(d => d.id === input.draft_id); requireValue(draft, 'NOT_FOUND', 404);
      requireValue(Array.isArray(input.sections) && input.sections.length <= 30 && input.sections.every(p =>
        typeof p.heading === 'string' && p.heading.length <= 200 && typeof p.text === 'string' && p.text.length <= 20000));
      draft.sections = input.sections; draft.status = 'draft'; draft.source_revision = s.data_revision;
      draft.content_hash = digest(JSON.stringify(input.sections)); delete draft.approved_by; delete draft.approved_at;
    }, { invalidate: false });
  }
  approveDraft(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'draft_approved', s => {
      const draft = s.drafts.find(d => d.id === input.draft_id);
      requireValue(draft && draft.status === 'draft' && draft.source_revision === s.data_revision, 'DRAFT_OUTDATED', 409);
      requireValue(s.synthetic || this.store.knowledge(actor, knowledge).approved_at, 'KNOWLEDGE_REVIEW_REQUIRED', 403);
      requireValue(!s.facts.some(f => f.current && f.type !== 'unknown' && f.review === 'pending') &&
        !s.claims.some(c => !c.merged_into && c.review === 'pending') && !controls(s).candidates.length, 'UNREVIEWED_FACTS', 409);
      draft.status = 'approved';
      draft.approved_by = actor.name; draft.approved_at = this.store.now().toISOString();
    }, { invalidate: false });
  }
  task(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'task_changed', s => {
      if (input.task_id) {
        const task = s.tasks.find(t => t.id === input.task_id); requireValue(task && ['open', 'done'].includes(input.status));
        task.status = input.status; return;
      }
      requireValue(['administrative', 'legal'].includes(input.kind));
      if (input.kind === 'legal') requireValue(actor.role === 'lawyer' && input.basis?.trim() && input.start_date?.trim(), 'LEGAL_DEADLINE_REVIEW_REQUIRED', 403);
      for (const date of [input.due, input.start_date].filter(Boolean)) requireValue(validDate(date), 'INVALID_DATE');
      if (input.assignee) requireValue(this.store.db.prepare('SELECT id FROM users WHERE tenant=? AND id=? AND active=1').get(actor.tenant, input.assignee), 'INVALID_ASSIGNEE');
      s.tasks.push({ id: uid(), title: text(input.title, 200), kind: input.kind, due: input.due || null, status: 'open',
        basis: input.kind === 'legal' ? text(input.basis, 1000) : null, start_date: input.start_date || null,
        assignee: input.assignee || null, confirmed_by: input.kind === 'legal' ? actor.name : null });
    }, { invalidate: false });
  }
  stage(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    requireValue(['intake', 'review', 'documents', 'closed'].includes(input.stage));
    return this.store.update(actor, id, input.revision, 'stage_changed', s => {
      if (input.stage === 'closed') requireValue(actor.role === 'lawyer' && !s.tasks.some(t => t.status === 'open'), 'OPEN_TASKS_OR_ROLE', 409);
      s.stage = input.stage; if (input.resume === true) s.handoff = false;
    }, { invalidate: false });
  }
  seed(actor) {
    requireValue(actor.role === 'admin', 'FORBIDDEN', 403);
    const data = JSON.parse(readFileSync(resolve(root, 'tests/full-fixtures/cases.json'), 'utf8'));
    requireValue(data.synthetic === true);
    const existing = this.store.list(actor);
    let imported = 0;
    for (const fixture of data.cases) {
      if (existing.some(c => c.title.startsWith(fixture.id + ' '))) continue;
      const state = emptyCase({ title: fixture.id + ' ' + fixture.title, track: fixture.track, synthetic: true });
      for (const content of fixture.conversation) {
        const source = addSource(state, { text: content, title: 'Syntetyczna rozmowa klienta' });
        state.messages.push({ id: uid(), role: 'user', text: content, source_id: source.id, at: this.store.now().toISOString() });
      }
      state.documents = [];
      for (const doc of fixture.documents) {
        const filePath = doc.scan_path || doc.pdf_path;
        const saved = saveFile(this.store.directory, readFileSync(resolve(root, 'tests/full-fixtures', filePath)), filePath.split('/').at(-1));
        saved.pages = 1; saved.status = doc.scan_path ? 'ocr_required' : 'read'; state.documents.push(saved);
        // Fixture text is a supplied source, never a claimed AI result. Scans are read only through OCR.
        addSource(state, { text: doc.scan_path ? '' : doc.text, title: doc.title, page: 1, kind: 'document', document_id: saved.id,
          read_method: doc.scan_path ? 'scan_unread' : 'synthetic_supplied_text' });
      }
      state.messages.push({ id: uid(), role: 'assistant', text: 'Dane są fikcyjne. Uruchom odczyt AI, aby sprawdzić wywiad i dokumenty.', at: this.store.now().toISOString() });
      this.store.insert(actor, state); imported++;
    }
    return { imported };
  }
  async registry(actor, id, input, lookup = registryLookup) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    const state = this.store.get(actor, id);
    requireValue(state.track === 'company' && state.revision === input.revision, 'VERSION_CONFLICT', 409);
    requireValue(['krs', 'vat'].includes(input.kind) && /^\d{10}$/.test(input.identifier || ''), 'INVALID_REGISTRY_QUERY');
    const date = input.date || this.store.now().toISOString().slice(0, 10);
    requireValue(validDate(date), 'INVALID_DATE');
    requireValue(!this.registryBusy, 'REGISTRY_BUSY', 429);
    const day = this.store.now().toISOString().slice(0, 10);
    const used = this.store.db.prepare('SELECT count FROM registry_budget WHERE day=?').get(day)?.count || 0;
    requireValue(used < 20, 'REGISTRY_DAILY_LIMIT', 429);
    this.store.db.prepare('INSERT INTO registry_budget VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1').run(day);
    this.registryBusy = true;
    let result;
    try { result = await lookup({ kind: input.kind, identifier: input.identifier, date, test: state.synthetic }); }
    finally { this.registryBusy = false; }
    const latest = this.store.get(actor, id);
    return this.store.update(actor, id, latest.revision, 'registry_checked', s => {
      const source = addSource(s, { text: JSON.stringify(result.summary, null, 2), title: `${input.kind.toUpperCase()} — ${input.identifier}`, kind: 'registry' });
      s.registry_checks ||= []; s.registry_checks.push({ ...result, source_id: source.id });
    });
  }
}
