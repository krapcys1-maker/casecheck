import { controls, currentFacts } from './domain.mjs';
import { digest } from './store.mjs';
import { ocrReviewIssues, sourceProblem, claimSourceProblem } from './document-review.mjs';
import { draftReady } from './portal.mjs';

// Read-only integration boundary. A partial data review is not legal readiness.
export function reviewPackage(state, generatedAt) {
  const checks = controls(state), blockers = [], evidence = new Map();
  const sources = new Map(state.sources.map(s => [s.id, s]));
  const documents = new Map((state.documents || []).map(d => [d.id, d]));
  const keep = (fact, owner) => {
    if (fact.type === 'unknown') return false;
    const problem = sourceProblem(state, fact.source_id);
    if (fact.source_invalidated || problem && problem !== 'missing_evidence') {
      blockers.push({ code: problem || 'superseded_source', owner, field: fact.field, source_id: fact.source_id }); return false;
    }
    const source = sources.get(fact.source_id);
    if (!source || !fact.quote || !source.text.includes(fact.quote)) {
      blockers.push({ code: 'missing_evidence', owner, field: fact.field }); return false;
    }
    const document = documents.get(source.document_id);
    evidence.set(source.id, { id: source.id, title: source.title, kind: source.kind, page: source.page,
      read_method: source.read_method, text_sha256: digest(source.text), page_review: source.page_review || null, document: document ? {
        id: document.id, name: document.name, sha256: document.sha256 } : null });
    return true;
  };
  const facts = Object.values(currentFacts(state));
  for (const fact of facts.filter(f => f.type !== 'unknown' && f.review === 'pending')) blockers.push({ code: 'pending_fact', field: fact.field });
  const caseFacts = facts.filter(f => f.review === 'confirmed' && keep(f, 'case'));
  const active = state.claims.filter(c => !c.merged_into && c.review !== 'rejected');
  for (const claim of active.filter(c => c.review !== 'confirmed')) blockers.push({ code: 'pending_claim', claim_id: claim.id });
  for (const pair of checks.candidates) blockers.push({ code: 'possible_duplicate', claim_ids: pair });
  for (const job of state.jobs.filter(j => j.status === 'running')) blockers.push({ code: 'running_job', job_id: job.id });
  for (const doc of (state.documents || []).filter(d => !['read', 'ocr_review', 'ocr_verified'].includes(d.status))) blockers.push({ code: 'unread_document', document_id: doc.id });
  blockers.push(...ocrReviewIssues(state));
  for (const claim of active.filter(c => c.review === 'confirmed' && claimSourceProblem(state, c))) blockers.push({ code: 'claim_source_requires_review', claim_id: claim.id });
  const claims = active.filter(c => c.review === 'confirmed' && !claimSourceProblem(state, c)).map(c => ({ id: c.id,
    reviewed_by: c.reviewed_by || null, reviewed_at: c.reviewed_at || null,
    facts: c.facts.filter(f => keep(f, c.id)), source_ids: c.source_ids.filter(id => sources.has(id)) }));
  if (!caseFacts.length && !claims.some(c => c.facts.length)) blockers.push({ code: 'no_reviewed_values' });
  // Preserve supporting sources from linked documents and manual corrections too.
  for (const c of claims) for (const id of c.source_ids) {
    const source = sources.get(id), document = documents.get(source.document_id);
    if (!evidence.has(id)) evidence.set(id, { id, title: source.title, kind: source.kind, page: source.page,
      read_method: source.read_method, text_sha256: digest(source.text), page_review: source.page_review || null, document: document ? {
        id: document.id, name: document.name, sha256: document.sha256 } : null });
  }
  const payload = { schema: 'casecheck-reviewed-data-v1', generated_at: generatedAt,
    case_id: state.id, title: state.title, track: state.track, synthetic: state.synthetic,
    state_revision: state.revision, data_revision: state.data_revision,
    review_status: blockers.length ? 'blocked' : 'reviewed_partial', blockers,
    missing_fields: checks.missing_fields, case_facts: caseFacts, claims,
    totals: blockers.some(b => ['missing_evidence', 'superseded_source', 'ocr_page_requires_review', 'ocr_page_rejected', 'claim_source_requires_review'].includes(b.code)) ? [] : checks.totals,
    difference: blockers.some(b => ['missing_evidence', 'superseded_source', 'ocr_page_requires_review', 'ocr_page_rejected', 'claim_source_requires_review'].includes(b.code)) ? null : checks.difference,
    comparison_reasons: checks.comparison_reasons, issues: checks.issues,
    sources: [...evidence.values()],
    approved_drafts: state.drafts.filter(d => draftReady(d, state))
      .map(d => ({ id: d.id, template: d.template, content_hash: d.content_hash, approved_by: d.approved_by, approved_at: d.approved_at })),
    scope: 'Only reviewed values. Missing information remains missing; no automatic transmission or legal qualification.' };
  return { ...payload, payload_sha256: digest(JSON.stringify(payload)) };
}
