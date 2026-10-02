import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createAppServer } from '../src/app-server.mjs';
import { Application } from '../src/app/application.mjs';
import { Store, uid } from '../src/app/store.mjs';
import { claimFields, addSource, putFacts, controls, draftSections, reviewSummary, emptyCase, publicCase } from '../src/app/domain.mjs';
import { readDocument, saveFile, safeFile } from '../src/app/files.mjs';
import { makeBackup, verifyBackup } from '../scripts/backup.mjs';
import { renderDraft } from '../src/app/pdf.mjs';

const password = 'test-only-password-that-is-long-enough';
const env = { CASECHECK_ADMIN_PASSWORD: password, OPENAI_API_KEY: 'test-key-not-live', CASECHECK_PUBLIC_ORIGIN: 'https://casecheck.example.invalid' };
const unknown = field => ({ field, type: 'unknown', text_value: null, boolean_value: null, minor_units: null,
  currency: null, as_of: null, precision: 'unknown', source_id: null, quote: null });
const textFact = (field, value, source) => ({ ...unknown(field), type: 'text', text_value: value, precision: 'exact', source_id: source.id, quote: source.text });
const money = (field, amount, date = '2026-09-30', currency = 'PLN') => ({ ...unknown(field), type: 'money', minor_units: amount,
  currency, as_of: date, precision: 'exact', source_id: 'test-source', quote: 'synthetic amount' });
const mock = async ({ requested_fields, sources }) => ({ output: { facts: requested_fields.map(field => field === 'client_name'
  ? textFact(field, 'Osoba Testowa', sources[0]) : unknown(field)), questions: [], warnings: [] }, model: 'mock', usage: {}, prompt_version: 'test' });
async function fixture(t, options = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'casecheck-app-test-'));
  const server = await createAppServer({ env, stateDir: directory, extract: mock, secure: false, ...options });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/casecheck/api`;
  const request = async (path, input, token, method = input === undefined ? 'GET' : 'POST', headers = {}) => {
    const response = await fetch(url + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(input !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  };
  const login = await request('/login', { email: 'admin@casecheck.local', password });
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(directory, { recursive: true, force: true }); });
  return { server, app: server.app, directory, request, token: login.body.token, actor: login.body.user, url };
}

test('accounts, tenant isolation, link scope and expiry are enforced', async t => {
  let clock = new Date('2026-10-02T12:00:00Z');
  const f = await fixture(t, { now: () => clock });
  const a = f.app.create(f.actor, { title: 'A', track: 'consumer', synthetic: true });
  const b = f.app.create(f.actor, { title: 'B', track: 'company', synthetic: true });
  const other = { tenant: uid(), id: uid(), role: 'admin' };
  assert.throws(() => f.app.store.get(other, a.id), { code: 'NOT_FOUND' });
  const link = f.app.store.link(f.actor, a.id), client = f.app.store.auth(link.token);
  assert.equal(client.case_id, a.id);
  assert.throws(() => f.app.store.get(client, b.id), { code: 'NOT_FOUND' });
  assert.equal((await f.request('/cases', undefined, link.token)).status, 403);
  assert.equal((await f.request(`/cases/${a.id}/export`, undefined, link.token)).status, 403);
  f.app.store.revokeLinks(f.actor, a.id); assert.throws(() => f.app.store.auth(link.token), { code: 'UNAUTHORIZED' });
  const fresh = f.app.store.link(f.actor, a.id); clock = new Date('2026-10-10T12:00:00Z');
  assert.throws(() => f.app.store.auth(fresh.token), { code: 'UNAUTHORIZED' });
});
test('staff cannot approve facts, drafts or legal deadlines; disabling removes sessions', async t => {
  const f = await fixture(t);
  const staff = await f.app.store.addUser(f.actor, { email: 'staff@example.invalid', name: 'Pracownik Testowy', role: 'staff', password });
  const login = await f.app.store.login(staff.email, password), actor = login.user;
  const state = f.app.create(actor, { title: 'Kontrola roli', track: 'consumer', synthetic: true });
  assert.throws(() => f.app.reviewFact(actor, state.id, { revision: state.revision }), { code: 'LAWYER_REQUIRED' });
  assert.throws(() => f.app.task(actor, state.id, { revision: state.revision, kind: 'legal' }), { code: 'LEGAL_DEADLINE_REVIEW_REQUIRED' });
  await assert.rejects(f.app.store.addUser(actor, { email: 'other@example.invalid' }), { code: 'FORBIDDEN' });
  f.app.store.disableUser(f.actor, actor.id); assert.throws(() => f.app.store.auth(login.token), { code: 'UNAUTHORIZED' });
});
test('chat persists, extracts a cited fact, asks missing question and resumes after reopening', async t => {
  const f = await fixture(t);
  let state = f.app.create(f.actor, { title: 'Wywiad', track: 'consumer', synthetic: true });
  state = f.app.consent(f.actor, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
  state = await f.app.chat(f.actor, state.id, { revision: state.revision, text: 'Nazywam się Osoba Testowa.', field: 'client_name', analyze: true });
  assert.equal(state.messages.length, 2); assert.equal(state.facts.find(f => f.current && f.field === 'client_name').text_value, 'Osoba Testowa');
  assert.match(state.messages.at(-1).text, /adres/);
  assert.equal(f.app.store.budget().used, 1);
  const reopened = new Store(f.directory); assert.equal(reopened.get(f.actor, state.id).messages.length, 2); reopened.close();
});
test('failed API leaves the message and job, and consumes only one reservation', async t => {
  const f = await fixture(t, { extract: async () => { throw Object.assign(new Error(), { code: 'API_TIMEOUT' }); } });
  let state = f.app.create(f.actor, { title: 'Błąd', track: 'consumer', synthetic: true });
  state = f.app.consent(f.actor, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
  state = await f.app.chat(f.actor, state.id, { revision: state.revision, text: 'Odpowiedź Testowa', field: 'client_name', analyze: true });
  assert.equal(state.messages[0].text, 'Odpowiedź Testowa'); assert.equal(state.jobs[0].status, 'failed');
  assert.match(state.messages[1].text, /ponownego odczytu/); assert.equal(f.app.store.budget().used, 1);
});
test('late AI cannot overwrite a correction and revision conflicts reject edits', async t => {
  let finish, started; const ready = new Promise(r => started = r);
  const f = await fixture(t, { extract: args => { started(); return new Promise(r => finish = () => r(mock(args))); } });
  let state = f.app.create(f.actor, { title: 'Wyścig', track: 'consumer', synthetic: true });
  state = f.app.consent(f.actor, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
  state = f.app.message(f.actor, state.id, { revision: state.revision, text: 'Stara odpowiedź' });
  const pending = f.app.analyze(f.actor, state.id, { revision: state.revision, kind: 'intake', fields: ['client_name'] });
  await ready;
  const latest = f.app.store.get(f.actor, state.id);
  const corrected = f.app.correction(f.actor, state.id, { revision: latest.revision, note: 'Korekta potwierdzona przez klienta',
    fact: { ...unknown('client_name'), type: 'text', text_value: 'Nowa odpowiedź', precision: 'exact' } });
  assert.throws(() => f.app.stage(f.actor, state.id, { revision: latest.revision, stage: 'review' }), { code: 'VERSION_CONFLICT' });
  finish(); const result = await pending;
  assert.equal(result.jobs.at(-1).status, 'discarded'); assert.equal(result.facts.find(f => f.current).text_value, 'Nowa odpowiedź');
  assert.equal(corrected.facts.length, 1);
});
test('repeating extraction of one document keeps one active claim and normalizes absent text', async t => {
  const f = await fixture(t, { extract: async ({ requested_fields, sources }) => ({ output: {
    facts: requested_fields.map(field => field === 'security_description' ? textFact(field, 'brak danych', sources[0]) : unknown(field)),
    questions: [], warnings: [] }, model: 'mock', usage: {} }) });
  let state = f.app.create(f.actor, { title: 'Powtórny odczyt', track: 'consumer', synthetic: true });
  state = await f.app.upload(f.actor, state.id, state.revision, Buffer.from('Informacja o zabezpieczeniu: brak danych. Materiał testowy.'), 'test.txt');
  state = f.app.consent(f.actor, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
  const input = { kind: 'claim', source_ids: state.sources.map(s => s.id) };
  state = await f.app.analyze(f.actor, state.id, { revision: state.revision, ...input });
  state = await f.app.analyze(f.actor, state.id, { revision: state.revision, ...input });
  assert.equal(state.claims.filter(c => !c.merged_into).length, 1); assert.equal(state.claims.length, 2);
  assert.equal(state.claims.at(-1).facts.find(f => f.field === 'security_description').type, 'unknown');
});
test('unknown never erases an existing value and previous facts are retained', () => {
  const state = { facts: [] }; const source = { id: 'x', text: 'Testowa' };
  putFacts(state, [textFact('client_name', 'Testowa', source)]); putFacts(state, [unknown('client_name')]);
  assert.equal(state.facts.find(f => f.current).text_value, 'Testowa');
  putFacts(state, [textFact('client_name', 'Nowa', source)]);
  assert.equal(state.facts.length, 3); assert.equal(state.facts.filter(f => f.current).length, 1);
});
test('duplicate agreements exclude both sums until a lawyer links them; dates and currencies stay separate', () => {
  const claim = (id, agreement, amount, date, currency) => ({ id, review: 'confirmed', merged_into: null, source_ids: ['x'], facts: [
    textFact('agreement_number', agreement, { id: 'x', text: agreement }), money('total_amount', amount, date, currency)] });
  const state = { track: 'consumer', facts: [], claims: [claim('a', 'UM/1', 5000000), claim('b', 'UM/1', 5320000),
    claim('c', 'UM/2', 620000, '2026-09-30', 'EUR'), claim('d', 'UM/3', 2700000, '2026-08-31', 'PLN')] };
  const checked = controls(state); assert.deepEqual(checked.candidates, [['a', 'b']]); assert.equal(checked.totals.length, 2);
  state.claims[0].merged_into = 'b'; assert.equal(controls(state).totals.length, 3);
});
test('PDF parsing reads real Polish text and image PDF stays empty; unsupported bytes rejected', async t => {
  const directory = mkdtempSync(resolve(tmpdir(), 'casecheck-reader-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const doc = saveFile(directory, readFileSync('tests/full-fixtures/documents/S01-D01.pdf'), 'wezwanie.pdf');
  const output = await readDocument(directory, doc); assert.equal(output.pages.length, 1); assert.match(output.pages[0].text, /50 000,00 PLN/);
  const scan = saveFile(directory, readFileSync('tests/full-fixtures/documents/S11-D01-scan.pdf'), 'skan.pdf');
  assert.equal((await readDocument(directory, scan)).pages[0].text, '');
  assert.throws(() => saveFile(directory, Buffer.from('<script>unsafe</script>'), 'fake.pdf'), { code: 'UNSUPPORTED_FILE' });
  assert.throws(() => safeFile(directory, '../private'), { code: 'INVALID_FILE' });
});
test('upload, OCR source pages and budget work without reading scan oracle text', async t => {
  const f = await fixture(t, { ocr: async () => ({ pages: [{ page: 1, text: 'Syntetyczny tekst OCR. Łącznie: 9876,54 PLN.' }], model: 'mock-vision', usage: {} }) });
  let state = f.app.create(f.actor, { title: 'Skan', track: 'consumer', synthetic: true });
  state = await f.app.upload(f.actor, state.id, state.revision, readFileSync('tests/full-fixtures/documents/S11-D01-scan.pdf'), 'skan.pdf');
  assert.equal(state.documents[0].status, 'ocr_required'); assert.equal(state.sources[0].text, '');
  state = f.app.consent(f.actor, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
  state = await f.app.runOCR(f.actor, state.id, { revision: state.revision, document_id: state.documents[0].id });
  assert.equal(state.sources.length, 2); assert.equal(state.sources[1].read_method, 'ai_ocr_requires_image_review'); assert.equal(f.app.store.budget().used, 1);
});
test('draft approval belongs to a reviewed version and corrections invalidate it', async t => {
  const f = await fixture(t); const lawyer = { ...f.actor, role: 'lawyer', name: 'Prawnik Testowy' };
  let state = f.app.create(f.actor, { title: 'Projekt', track: 'company', synthetic: true });
  state = f.app.draft(lawyer, state.id, { revision: state.revision, template: 'preliminary_plan' });
  assert.match(state.drafts[0].sections.map(s => s.text).join(' '), /30 dni/);
  state = f.app.approveDraft(lawyer, state.id, { revision: state.revision, draft_id: state.drafts[0].id });
  assert.equal(state.drafts[0].status, 'approved');
  state = f.app.task(f.actor, state.id, { revision: state.revision, title: 'Sprawdzenie robocze', kind: 'administrative' });
  assert.equal(state.drafts[0].status, 'approved');
  state = f.app.draft(lawyer, state.id, { revision: state.revision, template: 'creditor_list' });
  assert.equal(state.drafts[0].status, 'approved');
  state = f.app.message(f.actor, state.id, { revision: state.revision, text: 'Korekta przychodów' });
  assert.equal(state.drafts[0].status, 'stale');
  assert.throws(() => f.app.approveDraft(lawyer, state.id, { revision: state.revision, draft_id: state.drafts[0].id }), { code: 'DRAFT_OUTDATED' });
});
test('claim letter uses the recorded recipient address and keeps other creditors private', async t => {
  const f = await fixture(t);
  let state = f.app.create(f.actor, { title: 'Adresat pisma', track: 'consumer', synthetic: true });
  state = f.app.store.update(f.actor, state.id, state.revision, 'test_claims', s => {
    for (const [name, address] of [['Bank Wybrany', null], ['Inny Wierzyciel', 'Adres drugiego wierzyciela']]) {
      const source = addSource(s, { text: name + (address ? ': ' + address : '') });
      s.claims.push({ id: uid(), document_id: uid(), source_ids: [source.id], review: 'pending', merged_into: null,
        facts: [textFact('creditor_name', name, source), address ? textFact('creditor_address', address, source) : unknown('creditor_address')] });
    }
  });
  const claimId = state.claims[0].id;
  const create = options => f.app.draft(f.actor, state.id, { revision: state.revision, template: 'claim_clarification', options: { claim_id: claimId, ...options } });
  state = create();
  assert.match(state.drafts.at(-1).sections.find(s => s.heading === 'Adresat').text, /DO UZUPEŁNIENIA/);
  state = f.app.correctClaim(f.actor, state.id, { revision: state.revision, claim_id: claimId,
    fact: { ...unknown('creditor_address'), type: 'text', text_value: 'ul. Testowa 7, Miasto Fikcyjne', precision: 'exact' },
    note: 'Adres z fikcyjnego dokumentu: ul. Testowa 7, Miasto Fikcyjne' });
  state = create();
  const letter = state.drafts.at(-1);
  assert.equal(letter.sections.find(s => s.heading === 'Adresat').text, 'Bank Wybrany\nul. Testowa 7, Miasto Fikcyjne');
  assert.doesNotMatch(letter.sections.map(s => s.text).join('\n'), /Inny Wierzyciel|Adres drugiego wierzyciela/);
  state = create({ recipient_address: 'Inny adres do korespondencji' });
  assert.equal(state.drafts.at(-1).sections.find(s => s.heading === 'Adresat').text, 'Bank Wybrany\nInny adres do korespondencji');
});
test('PDF footer stays on the content page and process lock prevents competing workers', async t => {
  const f = await fixture(t);
  assert.throws(() => new Application({ env, stateDir: f.directory }), { code: 'APP_ALREADY_RUNNING' });
  let state = f.app.create(f.actor, { title: 'Pismo testowe', track: 'company', synthetic: true });
  state = f.app.draft(f.actor, state.id, { revision: state.revision, template: 'preliminary_plan' });
  const bytes = await renderDraft(state.drafts[0], state), file = saveFile(f.directory, bytes, 'wynik.pdf');
  const parsed = await readDocument(f.directory, file);
  assert.equal(parsed.pages.length, 1); assert.match(parsed.pages[0].text, /Szkic wstępnego planu/); assert.match(parsed.pages[0].text, /1\/1/);
});
test('real cases require knowledge approval, consent and bounded budgets persist', async t => {
  const f = await fixture(t, { env: { ...env, CASECHECK_DAILY_REQUEST_LIMIT: '1' } });
  let state = f.app.create(f.actor, { title: 'Nie test', track: 'consumer', synthetic: false });
  state = f.app.message(f.actor, state.id, { revision: state.revision, text: 'Fikcyjna wiadomość do testu blokady' });
  await assert.rejects(f.app.analyze(f.actor, state.id, { revision: state.revision, kind: 'intake', fields: ['client_name'], provider: 'openai' }), { code: 'CONSENT_REQUIRED' });
  state = f.app.consent(f.actor, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
  await assert.rejects(f.app.analyze(f.actor, state.id, { revision: state.revision, kind: 'intake', fields: ['client_name'] }), { code: 'KNOWLEDGE_REVIEW_REQUIRED' });
  f.app.store.reserve(); assert.throws(() => f.app.store.reserve(), { code: 'DAILY_LIMIT' });
  const reopened = new Store(f.directory, { limit: 1 }); assert.equal(reopened.budget().remaining, 0); reopened.close();
});
test('private backup restores database and files; case deletion removes linked versions and links', async t => {
  const f = await fixture(t); const backupRoot = mkdtempSync(resolve(tmpdir(), 'casecheck-backup-test-'));
  t.after(() => rmSync(backupRoot, { recursive: true, force: true }));
  let state = f.app.create(f.actor, { title: 'Kopia', track: 'consumer', synthetic: true });
  state = await f.app.upload(f.actor, state.id, state.revision, Buffer.from('Dokument fikcyjny z polskimi znakami: ąęłóśźż'), 'test.txt');
  const link = f.app.store.link(f.actor, state.id);
  const target = resolve(backupRoot, 'snapshot'); assert.equal((await makeBackup(f.directory, target)).files, 1); assert.equal(verifyBackup(target).ok, true);
  const restored = resolve(backupRoot, 'restored'); cpSync(target, restored, { recursive: true });
  const store = new Store(restored); assert.equal(store.get(f.actor, state.id).documents.length, 1); store.close();
  f.app.store.delete(f.actor, state.id); assert.equal(f.app.store.db.prepare('SELECT COUNT(*) AS count FROM versions WHERE case_id=?').get(state.id).count, 0);
  assert.throws(() => f.app.store.auth(link.token), { code: 'UNAUTHORIZED' });
});
test('origin checks, anonymous API rejection and client response omit review history', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/config')).status, 401);
  assert.equal((await f.request('/cases', undefined, f.token, 'GET', { Origin: 'https://other.example.invalid' })).status, 403);
  const state = f.app.create(f.actor, { title: 'Zakres', track: 'consumer', synthetic: true }); const link = f.app.store.link(f.actor, state.id);
  const response = await f.request(`/cases/${state.id}`, undefined, link.token);
  assert.equal(response.status, 200); for (const key of ['sources', 'facts', 'jobs', 'drafts', 'claims', 'tasks']) assert.equal(Object.hasOwn(response.body, key), false);
});


test('team directory is scoped, active-only and excludes email, password and client access', async t => {
  const f = await fixture(t);
  const staff = await f.app.store.addUser(f.actor, { email: 'team-staff@example.invalid', name: 'Zofia Testowa', role: 'staff', password });
  const lawyer = await f.app.store.addUser(f.actor, { email: 'team-lawyer@example.invalid', name: 'Anna Testowa', role: 'lawyer', password });
  const disabled = await f.app.store.addUser(f.actor, { email: 'disabled@example.invalid', name: 'Nieaktywna', role: 'staff', password });
  f.app.store.disableUser(f.actor, disabled.id);
  await f.app.store.addUser({ role: 'admin', tenant: uid() }, { email: 'foreign@example.invalid', name: 'Inna kancelaria', role: 'lawyer', password });
  const login = await f.app.store.login(staff.email, password);
  const response = await f.request('/team', undefined, login.token);
  assert.equal(response.status, 200);
  assert.ok(response.body.team.some(u => u.id === lawyer.id && u.name === 'Anna Testowa'));
  assert.equal(response.body.team.length, 3);
  for (const member of response.body.team) assert.deepEqual(Object.keys(member).sort(), ['id', 'name', 'role']);
  const state = f.app.create(f.actor, { title: 'Zakres linku', track: 'consumer', synthetic: true });
  const link = f.app.store.link(f.actor, state.id);
  assert.equal((await f.request('/team', undefined, link.token)).status, 403);
  assert.equal((await f.request('/team')).status, 401);
  assert.throws(() => f.app.task(login.user, state.id, { revision: state.revision, title: 'Zadanie', kind: 'administrative', assignee: disabled.id }), { code: 'INVALID_ASSIGNEE' });
});

test('workspace summaries include own cases and never extend the client response', async t => {
  const f = await fixture(t);
  let state = f.app.create(f.actor, { title: 'Podsumowanie', track: 'company', synthetic: true });
  state = f.app.task(f.actor, state.id, { revision: state.revision, title: 'Uzupełnić dokument', kind: 'administrative' });
  const other = { id: uid(), role: 'admin', tenant: uid() };
  f.app.create(other, { title: 'Obca sprawa', track: 'consumer', synthetic: true });
  const response = await f.request('/cases', undefined, f.token);
  assert.equal(response.body.cases.length, 1);
  assert.equal(response.body.cases[0].summary.open_tasks, 1);
  const link = f.app.store.link(f.actor, state.id);
  const client = await f.request('/cases/' + state.id, undefined, link.token);
  assert.equal('review_summary' in client.body, false);
  assert.equal('tasks' in client.body, false);
});

test('review counters distinguish absent, rejected, pending and reviewed fields without a readiness claim', () => {
  const state = emptyCase({ title: 'Stan danych', track: 'consumer', synthetic: true });
  state.data_revision = 7;
  putFacts(state, [textFact('client_name', 'Osoba', { id: 'x', text: 'Osoba' })]);
  putFacts(state, [textFact('address', 'Adres', { id: 'y', text: 'Adres' })], { review: 'rejected' });
  putFacts(state, [money('monthly_income', 390000)], { review: 'confirmed' });
  putFacts(state, [unknown('assets')]);
  state.drafts = [{ status: 'approved', source_revision: 7 }, { status: 'approved', source_revision: 6 }, { status: 'stale', source_revision: 7 }];
  state.tasks = [{ status: 'open', due: '2026-10-02' }, { status: 'open', due: '2026-10-03' }, { status: 'done', due: '2026-10-01' }];
  const summary = reviewSummary(state, '2026-10-03');
  assert.equal(summary.known_fields, 2); assert.equal(summary.confirmed_fields, 1);
  assert.equal(summary.pending_facts, 1); assert.equal(summary.missing_fields, summary.field_count - 2);
  assert.equal(summary.current_drafts, 1); assert.equal(summary.approved_drafts, 1);
  assert.equal(summary.open_tasks, 2); assert.equal(summary.overdue_tasks, 1);
  assert.equal('legally_ready' in summary, false);
});

// Deterministic adapter fixtures exercise the full HTTP workflow. They are not LLM accuracy measurements.
const scenarios = [
  { name: 'S01 amount discrepancy', declared: 12000000, amounts: [5000000, 4000000, 2000000], agreements: ['A1', 'B1', 'C1'], expected: 11000000 },
  { name: 'S02 assignment keeps both sources and one balance', amounts: [5000000, 5320000], agreements: ['CESJA-1', 'CESJA-1'], expected: 5320000, merge: true },
  { name: 'S04 disputed claim remains a disputed reading', amounts: [1900000], agreements: ['SPOR-1'], expected: 1900000, disputed: true },
  { name: 'S06 currency and balance dates remain separate', amounts: [800000, 300000, 200000], agreements: ['PLN-1', 'EUR-1', 'PLN-OLD'], currencies: ['PLN', 'EUR', 'PLN'], dates: ['2026-09-30', '2026-09-30', '2026-08-31'], groups: 3 },
  { name: 'Unknown security does not become a negative assertion', amounts: [2500000], agreements: ['BRAK-1'], expected: 2500000 },
];
for (const scenario of scenarios) test('HTTP workflow: ' + scenario.name, async t => {
  const f = await fixture(t, { extract: async ({ requested_fields, sources }) => {
    const source = sources[0], index = Number(/Document (\d+)/.exec(source.text)?.[1] || 0);
    const facts = requested_fields.map(field => {
      if (field === 'declared_total') return { ...money(field, scenario.declared), source_id: source.id, quote: source.text };
      if (field === 'creditor_name') return textFact(field, 'Wierzyciel Testowy ' + index, source);
      if (field === 'agreement_number') return textFact(field, scenario.agreements[index], source);
      if (field === 'total_amount') return { ...money(field, scenario.amounts[index], scenario.dates?.[index] || '2026-09-30', scenario.currencies?.[index] || 'PLN'), source_id: source.id, quote: source.text };
      if (field === 'disputed' && scenario.disputed) return { ...unknown(field), type: 'boolean', boolean_value: true, precision: 'exact', source_id: source.id, quote: source.text };
      return unknown(field);
    });
    return { output: { facts, questions: [], warnings: [] }, model: 'deterministic-test-adapter', usage: {}, prompt_version: 'test-only' };
  } });
  const account = await f.app.store.addUser(f.actor, { email: 'workflow-lawyer@example.invalid', name: 'Przegląd Testowy', role: 'lawyer', password });
  const login = await f.app.store.login(account.email, password);
  let r = await f.request('/cases', { title: scenario.name, track: 'consumer', synthetic: true }, login.token), state = r.body;
  const post = async (action, input) => { const result = await f.request('/cases/' + state.id + '/' + action, { revision: state.revision, ...input }, login.token); assert.equal(result.status, 200, result.body.error); state = result.body; return state; };
  await post('consent', { accepted: true, provider: 'openai' });
  if (scenario.declared) {
    await post('messages', { text: 'Deklaruję 120000 PLN, saldo 2026-09-30.', analyze: false });
    await post('analyze', { kind: 'intake', fields: ['declared_total'], source_ids: [state.sources.find(s => s.kind === 'message').id] });
    await post('review-fact', { fact_id: state.current_facts.declared_total.id, review: 'confirmed' });
  }
  for (let i = 0; i < scenario.amounts.length; i++) {
    const content = 'Document ' + i + '\nFikcyjny dokument. Umowa ' + scenario.agreements[i] + '. Kwota w groszach ' + scenario.amounts[i] + '. Saldo ' + (scenario.dates?.[i] || '2026-09-30') + '. Waluta ' + (scenario.currencies?.[i] || 'PLN') + '. Informacja testowa ' + (scenario.disputed ? 'sporne' : 'brak danych o zabezpieczeniu') + '.';
    const response = await fetch(f.url + '/cases/' + state.id + '/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + login.token, 'X-Case-Revision': String(state.revision), 'X-File-Name': 'dokument-testowy-' + i + '.txt' }, body: content });
    assert.equal(response.status, 201); state = await response.json();
    const doc = state.documents.at(-1);
    await post('analyze', { kind: 'claim', source_ids: state.sources.filter(s => s.document_id === doc.id).map(s => s.id) });
    assert.equal(state.jobs.at(-1).status, 'completed');
    await post('review-claim', { claim_id: state.claims.at(-1).id, review: 'confirmed' });
  }
  if (scenario.merge) {
    assert.equal(state.controls.excluded_claims, 2); assert.equal(state.controls.totals.length, 0);
    const [a, b] = state.claims;
    await post('merge', { from: a.id, into: b.id, note: 'Test: cesja tej samej umowy; nowsze saldo wymaga przeglądu.' });
    assert.equal(state.claims[1].source_ids.length, 2);
    await post('review-claim', { claim_id: b.id, review: 'confirmed' });
    assert.equal(state.review_summary.duplicate_pairs, 0);
  }
  if (scenario.expected) assert.equal(state.controls.totals[0].minor_units, scenario.expected);
  if (scenario.groups) assert.equal(state.controls.totals.length, scenario.groups);
  if (scenario.declared) assert.equal(state.controls.difference.minor_units, 1000000);
  if (scenario.disputed) { assert.equal(state.review_summary.disputed_claims, 1); assert.ok(state.controls.issues.some(i => i.code === 'disputed')); }
  assert.equal(state.claims.at(-1).facts.find(f => f.field === 'security_description').type, 'unknown');
  await post('drafts', { template: 'case_card' });
  await post('approve-draft', { draft_id: state.drafts.at(-1).id });
  const approved = state.drafts.at(-1), dataRevision = state.data_revision;
  const pdf = await fetch(f.url + '/cases/' + state.id + '/pdf/' + approved.id, { headers: { Authorization: 'Bearer ' + login.token } });
  assert.equal(pdf.status, 200); assert.ok(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).equals(Buffer.from('%PDF-')));
  await post('tasks', { title: 'Wyjaśnić brakujące dane - test', kind: 'administrative', assignee: account.id });
  assert.equal(state.data_revision, dataRevision); assert.equal(state.review_summary.approved_drafts, 1);
  await post('messages', { text: 'Nowa informacja klienta - wymaga przeglądu.', analyze: false });
  assert.equal(state.review_summary.approved_drafts, 0); assert.equal(state.drafts.at(-1).status, 'stale');
  assert.ok((await f.request('/cases/' + state.id + '/history', undefined, login.token)).body.history.length > 5);
});
