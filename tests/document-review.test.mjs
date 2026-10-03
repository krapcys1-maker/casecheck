import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createAppServer } from '../src/app-server.mjs';
import { digest, uid } from '../src/app/store.mjs';
import { documentSources, documentReview, ocrReviewIssues } from '../src/app/document-review.mjs';
import { controls, draftSections, missing, reviewSummary, putFacts } from '../src/app/domain.mjs';
import { reviewPackage } from '../src/app/review-package.mjs';
import { renderDraft } from '../src/app/pdf.mjs';
import { readDocument, saveFile, safeFile } from '../src/app/files.mjs';

const password = 'document-review-test-password-only';
const text = 'Wierzyciel: Firma Testowa. Łącznie: 9876,54 PLN. Saldo na 2026-09-30.';
const unknown = field => ({ field, type: 'unknown', text_value: null, boolean_value: null, minor_units: null,
  currency: null, as_of: null, precision: 'unknown', source_id: null, quote: null });
const extract = async ({ requested_fields, sources }) => ({ model: 'mock', output: {
  facts: requested_fields.map(field => field === 'total_amount' ? { ...unknown(field), type: 'money',
    minor_units: sources[0].text.includes('9000,00') ? 900000 : 987654, currency: 'PLN', as_of: '2026-09-30',
    precision: 'exact', source_id: sources[0].id, quote: sources[0].text } : unknown(field)), questions: [], warnings: [] } });

async function fixture(t, { pages = 1, ...options } = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'casecheck-page-review-'));
  const server = await createAppServer({ stateDir: directory, secure: false,
    env: { CASECHECK_ADMIN_PASSWORD: password, OPENAI_API_KEY: 'test-key-not-live' }, extract,
    reader: async () => ({ pages: Array.from({ length: pages }, (_, i) => ({ page: i + 1, text: '' })) }),
    ocr: async () => ({ model: 'mock', pages: Array.from({ length: pages }, (_, i) => ({ page: i + 1, text: i ? 'Druga strona dokumentu.' : text })) }), ...options });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(directory, { recursive: true, force: true }); });
  const app = server.app, login = await app.store.login('admin@casecheck.local', password), actor = login.user;
  const lawyerAccount = await app.store.addUser(actor, { name: 'Prawnik Testowy', email: 'page-lawyer@example.invalid', role: 'lawyer', password });
  const lawyerLogin = await app.store.login(lawyerAccount.email, password), lawyer = lawyerLogin.user;
  let state = app.create(actor, { title: 'Test przeglądu skanu', track: 'consumer', synthetic: true });
  state = app.consent(actor, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
  state = await app.upload(actor, state.id, state.revision, readFileSync('tests/full-fixtures/documents/S11-D01-scan.pdf'), 'skan.pdf');
  state = await app.runOCR(actor, state.id, { revision: state.revision, document_id: state.documents[0].id });
  const request = async (action, input, token = lawyerLogin.token, caseId = state.id) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/casecheck/api/cases/${caseId}${action ? '/' + action : ''}`, {
      method: input === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  };
  return { app, actor, lawyer, state, directory, request, staffToken: login.token };
}
const review = (f, state, source, status = 'confirmed') => f.app.reviewOCRPage(f.lawyer, state.id,
  { revision: state.revision, source_id: source.id, review: status, note: status === 'rejected' ? 'Błąd odczytu cyfry.' : 'Porównano z oryginałem — test.' });
const analyze = (f, state, fields = ['total_amount']) => f.app.analyze(f.actor, state.id, {
  revision: state.revision, kind: 'claim', fields, source_ids: documentSources(state, state.documents[0].id).map(s => s.id) });

test('each OCR page requires explicit review before claim confirmation, draft approval and reviewed export', async t => {
  const f = await fixture(t, { pages: 2 }); let state = await analyze(f, f.state);
  const claim = state.claims.at(-1), [first, second] = documentSources(state, state.documents[0].id);
  assert.throws(() => f.app.reviewClaim(f.lawyer, state.id, { revision: state.revision, claim_id: claim.id, review: 'confirmed' }), { code: 'SOURCE_REVIEW_REQUIRED' });
  state = f.app.draft(f.actor, state.id, { revision: state.revision, template: 'case_card' });
  assert.throws(() => f.app.approveDraft(f.lawyer, state.id, { revision: state.revision, draft_id: state.drafts.at(-1).id }), { code: 'SOURCE_REVIEW_REQUIRED' });
  assert.equal(reviewPackage(state, 'test').blockers.filter(b => b.code === 'ocr_page_requires_review').length, 2);
  state = review(f, state, first); assert.equal(state.documents[0].status, 'ocr_review');
  assert.equal(ocrReviewIssues(state).length, 1);
  state = review(f, state, second); assert.equal(state.documents[0].status, 'ocr_verified');
  state = f.app.reviewClaim(f.lawyer, state.id, { revision: state.revision, claim_id: claim.id, review: 'confirmed' });
  state = f.app.draft(f.actor, state.id, { revision: state.revision, template: 'case_card' });
  state = f.app.approveDraft(f.lawyer, state.id, { revision: state.revision, draft_id: state.drafts.at(-1).id });
  const pack = reviewPackage(state, 'test'); assert.equal(pack.blockers.length, 0); assert.equal(pack.approved_drafts.length, 1);
  assert.equal(pack.sources.find(s => s.id === first.id).page_review.status, 'confirmed');
  assert.equal(f.app.store.budget().used, 2); // OCR + extraction; reviews do not call AI.
});

test('correction preserves the original and quoted history, invalidates values, and full re-extraction can be approved', async t => {
  const f = await fixture(t); let state = await analyze(f, f.state);
  const original = documentSources(state, state.documents[0].id)[0], claimId = state.claims.at(-1).id;
  state = review(f, state, original);
  state = f.app.reviewClaim(f.lawyer, state.id, { revision: state.revision, claim_id: claimId, review: 'confirmed' });
  state = f.app.draft(f.actor, state.id, { revision: state.revision, template: 'case_card' });
  state = f.app.approveDraft(f.lawyer, state.id, { revision: state.revision, draft_id: state.drafts.at(-1).id });
  const used = f.app.store.budget().used;
  state = f.app.correctOCRPage(f.actor, state.id, { revision: state.revision, source_id: original.id, text: text.replace('9876,54', '9000,00'), note: 'Symulowany błąd cyfr OCR.' });
  const corrected = documentSources(state, state.documents[0].id)[0];
  assert.equal(state.sources.find(s => s.id === original.id).text, text); assert.equal(corrected.supersedes, original.id);
  assert.equal(state.claims.find(c => c.id === claimId).facts[0].quote, text);
  assert.equal(state.claims.find(c => c.id === claimId).facts[0].source_invalidated, true);
  assert.equal(controls(state).totals.length, 0); assert.equal(state.drafts.at(-1).status, 'stale');
  assert.ok(!JSON.stringify(draftSections(state, 'creditor_list')).includes('9876'));
  assert.equal(f.app.store.budget().used, used);
  assert.equal(digest(readFileSync(safeFile(f.directory, state.documents[0].id))), state.documents[0].sha256);
  assert.throws(() => f.app.preview(f.actor, state.id, { kind: 'claim', fields: ['total_amount'], source_ids: [original.id] }), { code: 'SOURCE_SUPERSEDED' });
  state = review(f, state, corrected);
  assert.throws(() => f.app.reviewClaim(f.lawyer, state.id, { revision: state.revision, claim_id: claimId, review: 'confirmed' }), { code: 'SOURCE_REVIEW_REQUIRED' });
  state = await analyze(f, state); const current = state.claims.find(c => !c.merged_into);
  assert.equal(current.facts[0].minor_units, 900000); assert.deepEqual(current.source_ids, [corrected.id]);
  state = f.app.reviewClaim(f.lawyer, state.id, { revision: state.revision, claim_id: current.id, review: 'confirmed' });
  assert.equal(reviewPackage(state, 'test').blockers.length, 0); assert.equal(controls(state).totals[0].minor_units, 900000);
});

test('rejecting a page revokes dependent confirmation and excludes it from further extraction without spending budget', async t => {
  const f = await fixture(t); let state = await analyze(f, f.state);
  const source = documentSources(state, state.documents[0].id)[0]; state = review(f, state, source);
  state = f.app.reviewClaim(f.lawyer, state.id, { revision: state.revision, claim_id: state.claims.at(-1).id, review: 'confirmed' });
  state = review(f, state, source, 'rejected');
  assert.equal(state.claims.at(-1).review, 'pending'); assert.equal(controls(state).totals.length, 0);
  assert.ok(reviewPackage(state, 'test').blockers.some(b => b.code === 'ocr_page_rejected'));
  await assert.rejects(analyze(f, state), { code: 'OCR_PAGE_REJECTED' }); assert.equal(f.app.store.budget().used, 2);
  state = review(f, state, source); assert.equal(state.claims.at(-1).review, 'pending');
});

test('HTTP page review enforces roles, tenant isolation, revision and hides review data from clients', async t => {
  const f = await fixture(t), state = f.state, source = documentSources(state, state.documents[0].id)[0];
  const input = { revision: state.revision, source_id: source.id, review: 'confirmed' };
  assert.equal((await f.request('review-ocr-page', input, f.staffToken)).status, 403);
  const link = f.app.store.link(f.actor, state.id);
  assert.equal((await f.request('review-ocr-page', input, link.token)).status, 403);
  assert.equal((await f.request('correct-ocr-page', { ...input, text: 'Zmieniono', note: 'Test' }, link.token)).status, 403);
  const other = await f.app.store.addUser({ tenant: uid(), role: 'admin' }, { name: 'Inna kancelaria', email: 'other-page@example.invalid', role: 'lawyer', password });
  const otherToken = (await f.app.store.login(other.email, password)).token;
  assert.equal((await f.request('review-ocr-page', input, otherToken)).status, 404);
  const approved = await f.request('review-ocr-page', input); assert.equal(approved.status, 200);
  assert.equal(approved.body.document_reviews[0].pages[0].status, 'confirmed');
  assert.equal((await f.request('review-ocr-page', input)).status, 409);
  const client = (await f.request('', undefined, link.token)).body;
  assert.equal(client.document_reviews, undefined); assert.equal(client.sources, undefined);
});

test('a failed correction transaction leaves transcription, reviews and data version unchanged', async t => {
  const f = await fixture(t); const before = f.state, source = documentSources(before, before.documents[0].id)[0];
  f.app.store.db.exec("CREATE TRIGGER fail_ocr_correction BEFORE INSERT ON audit WHEN NEW.event='ocr_page_corrected' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.throws(() => f.app.correctOCRPage(f.actor, before.id, { revision: before.revision, source_id: source.id, text: 'Nowy tekst', note: 'Test korekty' }));
  assert.deepEqual(f.app.store.get(f.actor, before.id), before);
  assert.equal(f.app.store.budget().used, 1);
});

test('a late extraction from a corrected OCR page is discarded and cannot resurrect the previous amount', async t => {
  let finish, started;
  const waiting = new Promise(r => { started = r; });
  const f = await fixture(t, { extract: args => { started(); return new Promise(r => { finish = async () => r(await extract(args)); }); } });
  const pending = analyze(f, f.state); await waiting;
  let state = f.app.store.get(f.actor, f.state.id), source = documentSources(state, state.documents[0].id)[0];
  state = f.app.correctOCRPage(f.actor, state.id, { revision: state.revision, source_id: source.id, text: 'Łącznie: 9000,00 PLN.', note: 'Poprawiono kwotę podczas oczekiwania.' });
  await finish(); state = await pending;
  assert.equal(state.jobs.at(-1).status, 'discarded'); assert.equal(state.claims.length, 0);
  assert.equal(documentSources(state, state.documents[0].id)[0].text, 'Łącznie: 9000,00 PLN.');
});

test('legacy OCR approvals are blocked, PDF is marked as draft, and review hashes bind the exact text and original file', async t => {
  const f = await fixture(t); let state = await analyze(f, f.state);
  state = f.app.draft(f.actor, state.id, { revision: state.revision, template: 'case_card' });
  // Simulate an older database which allowed claim/document approval without page review.
  state.claims.at(-1).review = 'confirmed'; state.drafts.at(-1).status = 'approved'; state.drafts.at(-1).approved_by = 'Old review';
  assert.equal(reviewSummary(state).pending_claims, 1); assert.equal(reviewSummary(state).approved_drafts, 0);
  assert.equal(reviewPackage(state, 'test').approved_drafts.length, 0); assert.equal(reviewPackage(state, 'test').claims.length, 0);
  const buffer = await renderDraft(state.drafts.at(-1), state), file = saveFile(f.directory, buffer, 'legacy.pdf');
  const parsed = await readDocument(f.directory, file);
  assert.match(parsed.pages.map(p => p.text).join('\n'), /PROJEKT — wymaga przeglądu/);
  state = f.app.store.get(f.actor, state.id); const source = documentSources(state, state.documents[0].id)[0];
  state = review(f, state, source); assert.equal(ocrReviewIssues(state).length, 0);
  state.sources.find(s => s.id === source.id).text += ' Changed'; assert.equal(ocrReviewIssues(state).length, 1);
  state.sources.find(s => s.id === source.id).text = source.text; state.documents[0].sha256 = 'changed-original';
  assert.equal(ocrReviewIssues(state).length, 1);
  assert.equal(documentReview(state, state.documents[0]).pages[0].status, 'pending');
});

test('invalidated intake is missing, cannot affect comparisons or recipient address, and unknown can replace stale value', async t => {
  const f = await fixture(t); let state = await analyze(f, f.state);
  const source = documentSources(state, state.documents[0].id)[0];
  state = review(f, state, source);
  state = f.app.reviewClaim(f.lawyer, state.id, { revision: state.revision, claim_id: state.claims.at(-1).id, review: 'confirmed' });
  state.facts.push({ ...state.claims.at(-1).facts[0], id: 'declared', field: 'declared_total', current: true, review: 'confirmed', source_invalidated: true });
  assert.ok(missing(state).some(f => f.key === 'declared_total'));
  assert.equal(reviewSummary(state).known_fields, 0); assert.equal(reviewSummary(state).pending_facts, 1);
  assert.equal(controls(state).difference, null);
  state.claims.at(-1).facts.push({ ...unknown('creditor_address'), type: 'text', text_value: 'Nieaktualny adres 123', source_invalidated: true });
  assert.ok(!JSON.stringify(draftSections(state, 'claim_clarification', { claim_id: state.claims.at(-1).id })).includes('Nieaktualny adres 123'));
  putFacts(state, [unknown('declared_total')]);
  assert.equal(state.facts.find(f => f.current && f.field === 'declared_total').type, 'unknown');
});
