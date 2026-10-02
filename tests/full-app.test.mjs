import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createAppServer } from '../src/app-server.mjs';
import { Application } from '../src/app/application.mjs';
import { Store, uid } from '../src/app/store.mjs';
import { claimFields, addSource, putFacts, controls, draftSections } from '../src/app/domain.mjs';
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
