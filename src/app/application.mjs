import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractFacts, providerConfig, validateExtraction } from '../ai/extraction.mjs';
import { Store, AppError, uid, text, requireValue, digest, validDate } from './store.mjs';
import { root, emptyCase, knowledge, currentFacts, fieldSet, addSource, putFacts, validateManualFact,
  claimFields, extraClaimFields, templates, draftSections, nextQuestion, controls, validateFieldTypes, quarantineFieldTypes,
  invalidateClaimDependents } from './domain.mjs';
import { validateDraftContent } from './draft-content.mjs';
import { saveFile, readDocument, ocrDocument, validateOCRPages, deleteFile } from './files.mjs';
import { registryLookup } from './registries.mjs';
import { guardClaimSemantics, guardCreditorAddress } from '../ai/semantics.mjs';
import { extractClaimFacts, planClaimExtraction } from '../ai/hybrid.mjs';
import { documentSources, documentReview, isOCRSource, sourceProblem, claimSourceProblem, hasSourceReviewBlockers } from './document-review.mjs';
import { Portal, clientFileVisible } from './portal.mjs';
import { FirmTemplates, fillFirmTemplate } from './firm-templates.mjs';

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
    this.portal = new Portal(this.store); this.firmTemplates = new FirmTemplates(this.store);
    this.busy = false;
    // Saved results need explicit recovery; an interrupted request never calls AI again automatically.
    for (const row of this.store.db.prepare('SELECT tenant,state FROM cases').all()) {
      const state = JSON.parse(row.state);
      if (state.jobs.some(j => j.status === 'running') || (state.documents || []).some(d => d.status === 'reading')) {
        this.store.update({ tenant: row.tenant, id: 'system', role: 'admin' }, state.id, state.revision, 'interrupted_jobs', s => {
          const pending = new Set(this.store.pendingJobResults({ tenant: row.tenant, role: 'admin' }, state.id).map(r => r.job_id));
          s.jobs.filter(j => j.status === 'running').forEach(j => {
            j.status = 'interrupted'; j.error = pending.has(j.id) ? 'SAVED_RESULT_AVAILABLE' : 'RETRY_REQUIRED';
          });
          (s.documents || []).filter(d => d.status === 'reading').forEach(d => { d.status = 'read_failed'; d.error = 'RETRY_REQUIRED'; });
        }, { invalidate: false });
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
    requireValue(!this.store.hasPendingJobResults(actor, state.id), 'RESULT_SAVED_RECOVERY_REQUIRED', 409);
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
    requireValue(sources.every(s => !s.document_id || documentSources(state, s.document_id).some(current => current.id === s.id)), 'SOURCE_SUPERSEDED', 409);
    requireValue(sources.every(s => sourceProblem(state, s.id) !== 'ocr_page_rejected'), 'OCR_PAGE_REJECTED', 409);
    if (input.kind === 'claim') requireValue(sources.every(s => s.document_id && s.document_id === sources[0].document_id), 'SINGLE_DOCUMENT_REQUIRED');
    const fields = input.kind === 'claim' ? input.fields || claimFields : input.fields;
    requireValue(Array.isArray(fields) && fields.length > 0 && fields.length <= 12 && new Set(fields).size === fields.length &&
      (input.kind === 'claim' ? fields.every(f => [...claimFields, ...extraClaimFields].includes(f)) : fields.every(f => fieldSet(state).some(s => s.key === f))), 'INVALID_FIELDS');
    const task = { sources: sources.map(s => ({ id: s.id, text: s.text, kind: s.kind, page: s.page })), requested_fields: fields };
    if (input.kind === 'claim') {
      const plan = planClaimExtraction(task);
      task.read_plan = { local_fields: plan.methods.map(m => m.field), api_fields: plan.unresolved, api_required: plan.unresolved.length > 0 };
    }
    return task;
  }
  async analyze(actor, id, input) {
    const state = this.store.get(actor, id); requireValue(state.revision === input.revision, 'VERSION_CONFLICT', 409);
    requireValue(!this.store.hasPendingJobResults(actor, id), 'RESULT_SAVED_RECOVERY_REQUIRED', 409);
    const provider = input.provider || state.consent?.provider, task = this.preview(actor, id, input);
    const plan = input.kind === 'claim' && this.extract === extractFacts ? planClaimExtraction(task) : null;
    const needsAI = !plan || plan.unresolved.length > 0;
    if (needsAI) this.checkAI(actor, state, provider);
    else {
      requireValue(state.synthetic || this.store.knowledge(actor, knowledge).approved_at, 'KNOWLEDGE_REVIEW_REQUIRED', 403);
      requireValue(!this.busy, 'REQUEST_IN_PROGRESS', 429);
    }
    const job = { id: uid(), kind: input.kind, provider: needsAI ? provider : 'local', status: 'running', requested_fields: task.requested_fields,
      source_ids: task.sources.map(s => s.id), input_sha256: digest(JSON.stringify(task)), data_revision: state.data_revision,
      started_at: this.store.now().toISOString() };
    const started = this.store.update(actor, id, state.revision, 'ai_started', s => { s.jobs.push(job); }, { invalidate: false, reserveAI: needsAI });
    this.busy = true;
    let result, failure, failureDetails;
    try {
      result = await (plan ? extractClaimFacts : this.extract)({ provider, ...task, env: this.env, maxOutputTokens: 2000 });
      result.normalized_absence_fields = [];
      for (const fact of result.output.facts) if (fact.type === 'text' && /^(brak danych|nie wiem|nieznane|nieczytelne)[.!]?$/i.test(fact.text_value.trim())) {
        result.normalized_absence_fields.push(fact.field); fact.type = 'unknown'; fact.text_value = null; fact.precision = 'unknown';
      }
      validateExtraction(result.output, task);
      result.field_abstentions = [...(result.field_abstentions || []), ...quarantineFieldTypes(state, result.output, input.kind)];
      validateFieldTypes(state, result.output.facts, input.kind);
      result.semantic_flags = [...(result.semantic_flags || []), ...(input.kind === 'claim' ? guardClaimSemantics(result.output, task.sources) : [])];
      if (input.kind === 'claim') {
        const docId = state.sources.find(s => s.id === task.sources[0].id)?.document_id;
        const existing = state.claims.find(c => c.document_id === docId && !c.merged_into);
        const name = result.output.facts.find(f => f.field === 'creditor_name') || existing?.facts.find(f => f.field === 'creditor_name');
        const creditorName = name?.type === 'text' && !name.source_invalidated ? name.text_value : null;
        result.semantic_flags.push(...guardCreditorAddress(result.output, task.sources, creditorName));
        result.address_guard_version = 'creditor-address-v1';
      }
    }
    catch (error) {
      failure = /^[A-Z_]{3,60}$/.test(error.code || '') ? error.code : 'AI_FAILED';
      failureDetails = { usage: error.usage || result?.usage || null, prompt_version: error.prompt_version || result?.prompt_version || null,
        model: error.model || result?.model || null, elapsed_ms: error.elapsed_ms || result?.elapsed_ms || null, diagnostics: error.diagnostics || null };
    }
    finally { this.busy = false; }
    const savedResult = failure ? null : { output: result.output, metadata: {
      model: result.model, usage: result.usage, prompt_version: result.prompt_version, elapsed_ms: result.elapsed_ms,
      request_contract_sha256: result.request_contract_sha256, normalized_absence_fields: result.normalized_absence_fields,
      evidence_repairs: result.evidence_repairs || [], structure_repairs: result.structure_repairs || [],
      field_abstentions: result.field_abstentions || [], rules_version: result.rules_version || null,
      deterministic_fields: result.deterministic_fields || [], llm_fields: result.llm_fields || task.requested_fields,
      llm_called: result.llm_called ?? true, pipeline_sha256: result.pipeline_sha256 || null, semantic_flags: result.semantic_flags,
      address_guard_version: result.address_guard_version || null } };
    return this.captureJobResult(actor, id, job, started, { task, result: savedResult, failure, failure_details: failureDetails });
  }

  captureJobResult(actor, id, job, started, outcome) {
    try { this.store.get(actor, id); } catch { throw new AppError(409, 'CASE_REMOVED_DURING_JOB'); }
    this.store.saveJobResult(actor, id, job.id, { schema: 'casecheck-job-result-v1', job_id: job.id, kind: job.kind,
      data_revision: started.data_revision, input_sha256: job.input_sha256, finished_at: this.store.now().toISOString(), ...outcome });
    try { return this.finishSavedJob(actor, id, job.id); }
    catch { throw new AppError(503, 'RESULT_SAVED_RECOVERY_REQUIRED'); }
  }

  recoverJob(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    const state = this.store.get(actor, id);
    requireValue(state.revision === input.revision, 'VERSION_CONFLICT', 409);
    try { return this.finishSavedJob(actor, id, input.job_id, { recovered: true }); }
    catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'RESULT_SAVED_RECOVERY_REQUIRED');
    }
  }

  finishSavedJob(actor, id, jobId, { recovered = false } = {}) {
    const current = this.store.get(actor, id), job = current.jobs.find(j => j.id === jobId);
    requireValue(job, 'NOT_FOUND', 404);
    // A repeated recovery cannot duplicate facts, claims, OCR pages or history.
    if (['completed', 'failed', 'discarded'].includes(job.status)) return current;
    requireValue(['running', 'interrupted'].includes(job.status), 'JOB_NOT_RECOVERABLE', 409);
    const { payload, sha256 } = this.store.jobResult(actor, id, jobId);
    requireValue(payload?.schema === 'casecheck-job-result-v1' && payload.job_id === job.id && payload.kind === job.kind &&
      payload.data_revision === job.data_revision && payload.input_sha256 === job.input_sha256 &&
      digest(JSON.stringify(payload.task)) === job.input_sha256, 'SAVED_RESULT_INVALID', 409);
    const stale = current.data_revision !== payload.data_revision;
    let failure = payload.failure;
    const result = payload.result, task = payload.task;
    if (!failure) {
      try {
        if (job.kind === 'ocr') {
          const document = current.documents.find(d => d.id === job.document_id);
          requireValue(document && document.sha256 === task.sha256, 'SAVED_RESULT_INVALID', 409);
          validateOCRPages(result.pages, document);
          if (current.sources.length + result.pages.length > 240) failure = 'SOURCE_LIMIT';
        } else {
          validateExtraction(result.output, task);
          validateFieldTypes(current, result.output.facts, job.kind);
        }
      } catch { throw new AppError(409, 'SAVED_RESULT_INVALID'); }
    }
    return this.store.update(actor, id, current.revision, recovered ? 'job_result_recovered' : `${job.kind === 'ocr' ? 'ocr' : 'ai'}_finished`, s => {
      const saved = s.jobs.find(j => j.id === jobId);
      saved.finished_at = payload.finished_at; saved.result_sha256 = sha256; delete saved.error;
      if (recovered) { saved.recovered_at = this.store.now().toISOString(); saved.recovered_by = actor.id; }
      if (result) Object.assign(saved, result.metadata);
      if (failure) { saved.status = 'failed'; saved.error = failure; Object.assign(saved, payload.failure_details); return; }
      if (stale) { saved.status = 'discarded'; saved.error = 'STALE_CASE_VERSION'; return; }
      saved.status = 'completed';
      if (job.kind === 'ocr') {
        const document = s.documents.find(d => d.id === job.document_id); document.status = 'ocr_review';
        // Keep original image/text sources and add the transcription for human review.
        for (const page of result.pages) {
          const previous = documentSources(s, document.id).find(p => p.page === page.page);
          const source = addSource(s, { text: page.text, title: document.name, page: page.page,
            kind: 'document', document_id: document.id, read_method: 'ai_ocr_requires_image_review' });
          if (previous) previous.superseded_by = source.id;
        }
        this.invalidateDocumentSources(s, document.id);
      } else {
        saved.warnings = result.output.warnings;
        if (job.kind === 'intake') putFacts(s, result.output.facts);
        else {
          const documentId = s.sources.find(source => source.id === task.sources[0].id).document_id;
          const existing = s.claims.find(c => c.document_id === documentId && !c.merged_into);
          if (existing) existing.review = 'superseded';
          const currentIds = (existing?.source_ids || []).filter(id => {
            const source = s.sources.find(p => p.id === id);
            return source && (!source.document_id || documentSources(s, source.document_id).some(p => p.id === id));
          });
          s.claims.push({ id: uid(), document_id: documentId, source_ids: [...new Set([...currentIds, ...job.source_ids])],
            facts: result.output.facts, review: 'pending', merged_into: null, supersedes: existing?.id || null });
          if (existing) s.claims.at(-1).facts = [...structuredClone(existing.facts.filter(f => !task.requested_fields.includes(f.field))), ...result.output.facts];
          if (existing?.fact_history) s.claims.at(-1).fact_history = structuredClone(existing.fact_history);
          if (existing) {
            const flags = invalidateClaimDependents(s.claims.at(-1), existing.facts, task.requested_fields);
            saved.semantic_flags = [...(saved.semantic_flags || []), ...flags];
            saved.warnings.push(...flags.map(f => `${f.field}: zmieniono ${f.changed_field}; poprzednia wartość wymaga ponownego ustalenia.`));
          }
          if (existing) existing.merged_into = s.claims.at(-1).id;
        }
      }
    }, { invalidate: !failure && !stale, consumeResult: jobId });
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
          warning = error.code === 'RESULT_SAVED_RECOVERY_REQUIRED'
            ? 'Odpowiedź zapisano. Wynik odczytu oczekuje na odzyskanie przez pracownika, bez kolejnego wywołania API. '
            : 'Odpowiedź zapisano. Analiza AI jest obecnie niedostępna; możesz kontynuować wywiad lub poprosić o przegląd. ';
          state = this.store.get(actor, id);
        }
      }
    }
    return this.botReply(actor, id, state.revision, warning);
  }
  async upload(actor, id, revision, buffer, name) {
    const current = this.store.get(actor, id); requireValue(current.revision === revision, 'VERSION_CONFLICT', 409);
    requireValue((current.documents || []).length < 40, 'FILE_COUNT_LIMIT', 413);
    const doc = { ...saveFile(this.store.directory, buffer, name), uploaded_by_role: actor.role, client_visible: actor.role === 'client' };
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
    requireValue(actor.role !== 'client' || document && clientFileVisible(document), 'NOT_FOUND', 404);
    requireValue(document && document.status === 'ocr_required', 'OCR_NOT_REQUIRED');
    requireValue(['pdf', 'png', 'jpeg'].includes(document.kind) && document.size <= 3 * 1024 * 1024 && document.pages <= 5, 'OCR_FILE_LIMIT', 413);
    this.checkAI(actor, state, 'openai');
    const task = { document_id: document.id, sha256: document.sha256, pages: document.pages, kind: document.kind };
    const job = { id: uid(), kind: 'ocr', provider: 'openai', status: 'running', document_id: document.id,
      input_sha256: digest(JSON.stringify(task)), data_revision: state.data_revision, started_at: this.store.now().toISOString() };
    const started = this.store.update(actor, id, state.revision, 'ocr_started', s => { s.jobs.push(job); }, { invalidate: false, reserveAI: true });
    this.busy = true;
    let result, error;
    try { result = await this.ocr(this.store.directory, document, this.env); validateOCRPages(result.pages, document); }
    catch (e) { error = /^[A-Z_]{3,60}$/.test(e.code || '') ? e.code : 'OCR_FAILED'; }
    finally { this.busy = false; }
    return this.captureJobResult(actor, id, job, started, { task, failure: error,
      result: error ? null : { pages: result.pages, metadata: { model: result.model, usage: result.usage } } });
  }
  invalidateDocumentSources(state, documentId) {
    const affected = fact => state.sources.find(s => s.id === fact.source_id)?.document_id === documentId;
    for (const fact of state.facts.filter(f => f.current && affected(f))) {
      if (fact.review !== 'rejected') fact.review = 'pending';
      if (sourceProblem(state, fact.source_id) === 'superseded_source') fact.source_invalidated = true;
      delete fact.reviewed_by; delete fact.reviewed_at;
    }
    for (const claim of state.claims.filter(c => !c.merged_into && (c.document_id === documentId ||
      c.source_ids.some(id => state.sources.find(s => s.id === id)?.document_id === documentId)))) {
      if (claim.review !== 'rejected') claim.review = 'pending';
      for (const fact of claim.facts.filter(affected)) if (sourceProblem(state, fact.source_id) === 'superseded_source') fact.source_invalidated = true;
      delete claim.reviewed_by; delete claim.reviewed_at;
    }
  }
  reviewOCRPage(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    requireValue(['confirmed', 'rejected'].includes(input.review), 'INVALID_REVIEW');
    return this.store.update(actor, id, input.revision, 'ocr_page_reviewed', state => {
      const source = state.sources.find(s => s.id === input.source_id);
      requireValue(isOCRSource(source), 'OCR_SOURCE_REQUIRED');
      requireValue(documentSources(state, source.document_id).some(s => s.id === source.id), 'SOURCE_SUPERSEDED', 409);
      const document = state.documents.find(d => d.id === source.document_id);
      const note = input.review === 'rejected' ? text(input.note, 2000) : text(input.note || '', 2000, true);
      source.page_review = { status: input.review, note, text_sha256: digest(source.text), document_sha256: document.sha256,
        reviewed_by: actor.name, actor_id: actor.id, reviewed_at: this.store.now().toISOString() };
      if (input.review === 'rejected') this.invalidateDocumentSources(state, document.id);
      document.status = documentReview(state, document).pages.every(p => p.status === 'confirmed') ? 'ocr_verified' : 'ocr_review';
    });
  }
  correctOCRPage(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'ocr_page_corrected', state => {
      const previous = state.sources.find(s => s.id === input.source_id);
      requireValue(isOCRSource(previous), 'OCR_SOURCE_REQUIRED');
      requireValue(documentSources(state, previous.document_id).some(s => s.id === previous.id), 'SOURCE_SUPERSEDED', 409);
      const content = text(input.text, 20000, true), note = text(input.note, 2000);
      requireValue(content !== previous.text, 'OCR_TEXT_UNCHANGED');
      const source = addSource(state, { text: content, kind: 'document', document_id: previous.document_id,
        title: previous.title, page: previous.page, read_method: 'human_corrected_ocr' });
      source.supersedes = previous.id; previous.superseded_by = source.id;
      source.correction = { note, actor_id: actor.id, actor: actor.name, at: this.store.now().toISOString(), previous_text_sha256: digest(previous.text) };
      state.documents.find(d => d.id === previous.document_id).status = 'ocr_review';
      this.invalidateDocumentSources(state, previous.document_id);
    });
  }
  reviewFact(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'fact_reviewed', state => {
      const fact = state.facts.find(f => f.id === input.fact_id && f.current);
      requireValue(fact && ['confirmed', 'rejected'].includes(input.review));
      if (input.review === 'confirmed' && fact.type !== 'unknown') requireValue(!fact.source_invalidated && !sourceProblem(state, fact.source_id), 'SOURCE_REVIEW_REQUIRED', 409);
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
      if (input.review === 'confirmed') requireValue(!claimSourceProblem(s, claim), 'SOURCE_REVIEW_REQUIRED', 409);
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
      const previousFacts = structuredClone(claim.facts);
      claim.fact_history ||= []; claim.fact_history.push(...claim.facts.filter(f => f.field === fact.field));
      claim.facts = [...claim.facts.filter(f => f.field !== fact.field), fact]; claim.source_ids.push(source.id); claim.review = 'pending';
      invalidateClaimDependents(claim, previousFacts, [fact.field]);
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
      if (input.firm_template_id) {
        const template = this.firmTemplates.get(actor, input.firm_template_id);
        const filled = fillFirmTemplate(template, s, this.store.now().toISOString().slice(0, 10));
        s.drafts.push({ id: uid(), template: 'firm_template', title: template.title, sections: filled.sections, status: 'draft',
          source_revision: s.data_revision, template_version: `kancelaria:${template.id}:v${template.revision}`, content_hash: digest(JSON.stringify(filled.sections)),
          synthetic: s.synthetic, created_at: this.store.now().toISOString(), legal_sources: [], firm_template_id: template.id,
          firm_template_revision: template.revision, firm_template_hash: template.content_hash, template_missing: filled.missing, field_evidence: filled.evidence });
        return;
      }
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
      requireValue(draft.source_revision === s.data_revision && draft.status !== 'stale', 'DRAFT_OUTDATED', 409);
      validateDraftContent(input.sections);
      draft.generated_content_hash ||= draft.content_hash;
      draft.manually_edited = true;
      draft.sections = input.sections; draft.status = 'draft'; draft.source_revision = s.data_revision;
      draft.content_hash = digest(JSON.stringify(input.sections)); delete draft.approved_by; delete draft.approved_at;
    }, { invalidate: false });
  }
  approveDraft(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'draft_approved', s => {
      const draft = s.drafts.find(d => d.id === input.draft_id);
      requireValue(draft && draft.status === 'draft' && draft.source_revision === s.data_revision, 'DRAFT_OUTDATED', 409);
      validateDraftContent(draft.sections);
      if (draft.firm_template_id) {
        requireValue(this.firmTemplates.matches(actor, draft), 'TEMPLATE_OUTDATED', 409);
        requireValue(!draft.template_missing?.length, 'TEMPLATE_FIELDS_MISSING', 409);
      }
      requireValue(s.synthetic || this.store.knowledge(actor, knowledge).approved_at, 'KNOWLEDGE_REVIEW_REQUIRED', 403);
      requireValue(!hasSourceReviewBlockers(s), 'SOURCE_REVIEW_REQUIRED', 409);
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
      if (input.stage === 'closed') requireValue(actor.role === 'lawyer' && !s.tasks.some(t => t.status === 'open') &&
        !(s.client_requests || []).some(r => r.status !== 'accepted'), 'OPEN_TASKS_OR_ROLE', 409);
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
