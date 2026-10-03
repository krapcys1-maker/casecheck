import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Application } from '../src/app/application.mjs';
import { createAppServer } from '../src/app-server.mjs';
import { digest, uid } from '../src/app/store.mjs';
import { makeBackup, verifyBackup } from '../scripts/backup.mjs';

const password = 'test-recovery-password-with-enough-characters';
const env = { DEEPSEEK_API_KEY: 'not-a-live-key', CASECHECK_ADMIN_PASSWORD: password };
const unknown = field => ({ field, type: 'unknown', text_value: null, boolean_value: null, minor_units: null,
  currency: null, as_of: null, precision: 'unknown', source_id: null, quote: null });
const response = ({ requested_fields, sources }) => ({ model: 'mock-recovery', usage: { input_tokens: 10, output_tokens: 5 },
  prompt_version: 'test-recovery', output: { facts: requested_fields.map(field => ['client_name', 'creditor_name', 'creditor_address'].includes(field)
    ? { ...unknown(field), type: 'text', text_value: sources[0].text, precision: 'exact', source_id: sources[0].id, quote: sources[0].text }
    : unknown(field)), warnings: [], questions: [] } });

async function fixture(t, options = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'casecheck-recovery-'));
  const config = { env, stateDir: directory, extract: async args => response(args), ...options };
  let app = new Application(config);
  await app.store.bootstrap('recovery@example.invalid', password);
  const actor = (await app.store.login('recovery@example.invalid', password)).user;
  const close = () => { if (app) { app.close(); app = null; } };
  t.after(() => { close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, actor, get app() { return app; }, close,
    reopen() { close(); app = new Application(config); return app; } };
}

function intake(f) {
  let state = f.app.create(f.actor, { title: 'Fikcyjna sprawa odzyskiwania', track: 'consumer', synthetic: true });
  state = f.app.message(f.actor, state.id, { revision: state.revision, text: 'Osoba Testowa' });
  return f.app.consent(f.actor, state.id, { revision: state.revision, accepted: true, provider: 'deepseek' });
}
const analyze = (f, state, extra = {}) => f.app.analyze(f.actor, state.id,
  { revision: state.revision, kind: 'intake', fields: ['client_name'], ...extra });
const pending = (f, id) => f.app.store.pendingJobResults(f.actor, id);
const recover = (f, state) => f.app.recoverJob(f.actor, state.id, { revision: state.revision, job_id: state.jobs.at(-1).id });
function breakFinalWrite(app) {
  app.store.db.exec(`CREATE TRIGGER fail_final_audit BEFORE INSERT ON audit
    WHEN NEW.event IN ('ai_finished','ocr_finished','job_result_recovered')
    BEGIN SELECT RAISE(ABORT, 'simulated final write failure'); END;`);
}
const fixFinalWrite = app => app.store.db.exec('DROP TRIGGER fail_final_audit');

test('a rolled-back final write retains one result, blocks another paid call and recovers exactly once', async t => {
  let calls = 0;
  const f = await fixture(t, { extract: async args => { calls++; return response(args); } });
  let state = intake(f);
  const lawyer = { ...f.actor, role: 'lawyer' };
  state = f.app.draft(lawyer, state.id, { revision: state.revision, template: 'case_card' });
  state = f.app.approveDraft(lawyer, state.id, { revision: state.revision, draft_id: state.drafts[0].id });
  const dataRevision = state.data_revision;
  breakFinalWrite(f.app);
  await assert.rejects(analyze(f, state), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  state = f.app.store.get(f.actor, state.id);
  assert.equal(state.jobs[0].status, 'running'); assert.equal(state.facts.length, 0);
  assert.equal(state.drafts[0].status, 'approved'); assert.equal(state.data_revision, dataRevision);
  assert.equal(pending(f, state.id).length, 1); assert.equal(f.app.busy, false);
  await assert.rejects(analyze(f, state), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  assert.throws(() => recover(f, state), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  assert.equal(pending(f, state.id).length, 1); assert.equal(f.app.store.get(f.actor, state.id).facts.length, 0);
  fixFinalWrite(f.app);
  // Administrative work must not invalidate the original response.
  state = f.app.task(f.actor, state.id, { revision: state.revision, title: 'Telefon', kind: 'administrative' });
  state = recover(f, state);
  assert.equal(state.jobs[0].status, 'completed'); assert.equal(state.jobs[0].model, 'mock-recovery');
  assert.deepEqual(state.jobs[0].usage, { input_tokens: 10, output_tokens: 5 });
  assert.equal(state.jobs[0].recovered_by, f.actor.id); assert.match(state.jobs[0].result_sha256, /^[a-f0-9]{64}$/);
  assert.equal(state.facts.length, 1); assert.equal(state.facts[0].review, 'pending');
  assert.equal(state.tasks.length, 1); assert.equal(state.drafts[0].status, 'stale');
  assert.equal(pending(f, state.id).length, 0); assert.equal(calls, 1); assert.equal(f.app.store.budget().used, 1);
  const revision = state.revision, historyLength = f.app.store.history(f.actor, state.id).length;
  state = recover(f, state);
  assert.equal(state.revision, revision); assert.equal(state.facts.length, 1);
  assert.equal(f.app.store.history(f.actor, state.id).length, historyLength);
});

test('a hard process exit after receipt commit survives restart without a second provider call', async t => {
  const f = await fixture(t, { extract: async () => { throw new Error('Recovery must not call the provider'); } });
  let state = intake(f), dataRevision = state.data_revision;
  f.close();
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { Application } from './src/app/application.mjs';
    const { directory, actor, state } = JSON.parse(process.argv[1]);
    const app = new Application({ stateDir: directory, env: { DEEPSEEK_API_KEY: 'not-a-live-key' },
      extract: async ({ sources }) => ({ model: 'crash-mock', usage: {}, output: { warnings: [], questions: [], facts: [{
        field: 'client_name', type: 'text', text_value: 'Osoba Testowa', boolean_value: null, minor_units: null,
        currency: null, as_of: null, precision: 'exact', source_id: sources[0].id, quote: sources[0].text }] } }) });
    const update = app.store.update.bind(app.store);
    app.store.update = (...args) => { if (args[3] === 'ai_finished') process.exit(77); return update(...args); };
    await app.analyze(actor, state.id, { revision: state.revision, kind: 'intake', fields: ['client_name'] });
  `, JSON.stringify({ directory: f.directory, actor: f.actor, state })], { cwd: resolve('.'), timeout: 15000, encoding: 'utf8' });
  assert.equal(child.error, undefined); assert.equal(child.status, 77, child.stderr);
  f.reopen(); state = f.app.store.get(f.actor, state.id);
  assert.equal(state.data_revision, dataRevision); assert.equal(state.jobs[0].status, 'interrupted');
  assert.equal(state.jobs[0].error, 'SAVED_RESULT_AVAILABLE'); assert.equal(pending(f, state.id).length, 1);
  assert.equal(f.app.store.budget().used, 1);
  state = recover(f, state);
  assert.equal(state.jobs[0].status, 'completed'); assert.equal(state.facts[0].text_value, 'Osoba Testowa');
  assert.equal(f.app.store.budget().used, 1); assert.equal(pending(f, state.id).length, 0);
});

test('recovery discards a stale response without overwriting a correction or invalidating newer approval', async t => {
  const f = await fixture(t); let state = intake(f);
  breakFinalWrite(f.app); await assert.rejects(analyze(f, state), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  fixFinalWrite(f.app); state = f.app.store.get(f.actor, state.id);
  state = f.app.correction(f.actor, state.id, { revision: state.revision, note: 'Poprawiona Osoba',
    fact: { ...unknown('client_name'), type: 'text', text_value: 'Poprawiona Osoba', precision: 'exact' } });
  const lawyer = { ...f.actor, role: 'lawyer' };
  state = f.app.reviewFact(lawyer, state.id, { revision: state.revision, fact_id: state.facts.find(f => f.current).id, review: 'confirmed' });
  state = f.app.draft(lawyer, state.id, { revision: state.revision, template: 'case_card' });
  state = f.app.approveDraft(lawyer, state.id, { revision: state.revision, draft_id: state.drafts[0].id });
  const dataRevision = state.data_revision;
  f.reopen(); state = f.app.store.get(f.actor, state.id);
  assert.equal(state.data_revision, dataRevision); assert.equal(state.drafts[0].status, 'approved');
  state = recover(f, state);
  assert.equal(state.jobs[0].status, 'discarded'); assert.equal(state.jobs[0].error, 'STALE_CASE_VERSION');
  assert.equal(state.facts.find(f => f.current).text_value, 'Poprawiona Osoba');
  assert.equal(state.drafts[0].status, 'approved'); assert.equal(state.data_revision, dataRevision);
  assert.equal(pending(f, state.id).length, 0); assert.equal(f.app.store.budget().used, 1);
});

test('claim recovery preserves prior manual evidence and creates only one active claim', async t => {
  const f = await fixture(t); let state = intake(f);
  state = await f.app.upload(f.actor, state.id, state.revision, Buffer.from('Fikcyjny Bank, adres testowy.'), 'test.txt');
  const sources = state.sources.filter(s => s.document_id).map(s => s.id);
  state = await analyze(f, state, { kind: 'claim', source_ids: sources, fields: ['creditor_name'] });
  state = f.app.correctClaim(f.actor, state.id, { revision: state.revision, claim_id: state.claims[0].id,
    fact: { ...unknown('creditor_name'), type: 'text', text_value: 'Poprawiony Bank', precision: 'exact' }, note: 'Poprawiony Bank' });
  const manualSource = state.sources.at(-1).id;
  breakFinalWrite(f.app);
  await assert.rejects(analyze(f, state, { kind: 'claim', source_ids: sources, fields: ['creditor_address'] }), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  fixFinalWrite(f.app); f.reopen(); state = recover(f, f.app.store.get(f.actor, state.id));
  const active = state.claims.filter(c => !c.merged_into);
  assert.equal(active.length, 1); assert.equal(active[0].facts.find(f => f.field === 'creditor_name').text_value, 'Poprawiony Bank');
  assert.ok(active[0].source_ids.includes(manualSource)); assert.equal(active[0].fact_history.length, 1);
  const revision = state.revision;
  state = recover(f, state); assert.equal(state.revision, revision); assert.equal(state.claims.length, 2);
  assert.equal(f.app.store.budget().used, 2);
});

test('OCR recovery preserves the original, adds pages once and retains image-review status', async t => {
  let calls = 0;
  const f = await fixture(t, { reader: async () => ({ pages: [{ page: 1, text: '' }] }),
    ocr: async () => { calls++; return { pages: [{ page: 1, text: 'Fikcyjny tekst OCR, 100,00 PLN.' }], model: 'mock-vision', usage: { input_tokens: 20 } }; } });
  let state = intake(f);
  state = await f.app.upload(f.actor, state.id, state.revision, readFileSync('tests/full-fixtures/documents/S11-D01-scan.pdf'), 'skan.pdf');
  const original = state.sources.at(-1), fileHash = state.documents[0].sha256;
  breakFinalWrite(f.app);
  await assert.rejects(f.app.runOCR(f.actor, state.id, { revision: state.revision, document_id: state.documents[0].id }), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  fixFinalWrite(f.app); f.reopen(); state = recover(f, f.app.store.get(f.actor, state.id));
  assert.equal(state.jobs[0].status, 'completed'); assert.equal(state.documents[0].status, 'ocr_review');
  assert.equal(state.documents[0].sha256, fileHash);
  assert.deepEqual(state.sources.find(s => s.id === original.id), { ...original, superseded_by: state.sources.at(-1).id });
  assert.equal(state.sources.at(-1).read_method, 'ai_ocr_requires_image_review'); assert.equal(state.sources.length, 3);
  state = recover(f, state); assert.equal(state.sources.length, 3); assert.equal(calls, 1); assert.equal(f.app.store.budget().used, 1);
});

test('failed provider outcomes are recoverable without invalidating approved data or retrying AI', async t => {
  let calls = 0;
  const f = await fixture(t, { extract: async () => { calls++; throw Object.assign(new Error(),
    { code: 'API_TIMEOUT', model: 'failure-mock', usage: { input_tokens: 10 } }); } });
  let state = intake(f); const lawyer = { ...f.actor, role: 'lawyer' };
  state = f.app.draft(lawyer, state.id, { revision: state.revision, template: 'case_card' });
  state = f.app.approveDraft(lawyer, state.id, { revision: state.revision, draft_id: state.drafts[0].id });
  const dataRevision = state.data_revision;
  breakFinalWrite(f.app); await assert.rejects(analyze(f, state), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  fixFinalWrite(f.app); f.reopen(); state = recover(f, f.app.store.get(f.actor, state.id));
  assert.equal(state.jobs[0].status, 'failed'); assert.equal(state.jobs[0].error, 'API_TIMEOUT');
  assert.equal(state.jobs[0].usage.input_tokens, 10); assert.equal(state.drafts[0].status, 'approved');
  assert.equal(state.data_revision, dataRevision); assert.equal(calls, 1); assert.equal(f.app.store.budget().used, 1);
});

test('corrupted or invalid saved output cannot change facts, versions or budget', async t => {
  const f = await fixture(t); let state = intake(f);
  breakFinalWrite(f.app); await assert.rejects(analyze(f, state), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  fixFinalWrite(f.app); state = f.app.store.get(f.actor, state.id);
  const id = state.jobs[0].id, row = f.app.store.db.prepare('SELECT payload,sha256 FROM job_results WHERE job_id=?').get(id);
  f.app.store.db.prepare('UPDATE job_results SET payload=? WHERE job_id=?').run(row.payload + ' ', id);
  assert.throws(() => recover(f, state), { code: 'SAVED_RESULT_INVALID' });
  const invalid = JSON.parse(row.payload); invalid.result.output.facts[0].field = 'not_requested';
  const payload = JSON.stringify(invalid);
  f.app.store.db.prepare('UPDATE job_results SET payload=?,sha256=? WHERE job_id=?').run(payload, digest(payload), id);
  assert.throws(() => recover(f, state), { code: 'SAVED_RESULT_INVALID' });
  assert.equal(f.app.store.get(f.actor, state.id).revision, state.revision);
  assert.equal(f.app.store.get(f.actor, state.id).facts.length, 0); assert.equal(f.app.store.budget().used, 1);
  f.app.store.db.prepare('UPDATE job_results SET payload=?,sha256=? WHERE job_id=?').run(row.payload, row.sha256, id);
  state = recover(f, state); assert.equal(state.jobs[0].status, 'completed');
});

test('pending results survive private backup and cascade away when their case is deleted', async t => {
  const f = await fixture(t); const backupRoot = mkdtempSync(resolve(tmpdir(), 'casecheck-recovery-backup-'));
  t.after(() => rmSync(backupRoot, { recursive: true, force: true }));
  let state = intake(f);
  breakFinalWrite(f.app); await assert.rejects(analyze(f, state), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  fixFinalWrite(f.app);
  const snapshot = resolve(backupRoot, 'snapshot'); await makeBackup(f.directory, snapshot); assert.equal(verifyBackup(snapshot).ok, true);
  const restoredPath = resolve(backupRoot, 'restored'); cpSync(snapshot, restoredPath, { recursive: true });
  const restored = new Application({ env: {}, stateDir: restoredPath, extract: async () => { throw new Error('No API during recovery'); } });
  try {
    state = restored.store.get(f.actor, state.id);
    assert.equal(restored.store.pendingJobResults(f.actor, state.id).length, 1);
    state = restored.recoverJob(f.actor, state.id, { revision: state.revision, job_id: state.jobs[0].id });
    assert.equal(state.jobs[0].status, 'completed'); assert.equal(restored.store.budget().used, 1);
  } finally { restored.close(); }
  f.app.store.delete(f.actor, state.id);
  assert.equal(f.app.store.db.prepare('SELECT COUNT(*) AS count FROM job_results').get().count, 0);
});

test('failure while consuming a receipt rolls back applied facts and remains recoverable', async t => {
  const f = await fixture(t); let state = intake(f);
  f.app.store.db.exec("CREATE TRIGGER fail_consume BEFORE DELETE ON job_results BEGIN SELECT RAISE(ABORT, 'simulated receipt failure'); END;");
  await assert.rejects(analyze(f, state), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  state = f.app.store.get(f.actor, state.id);
  assert.equal(state.facts.length, 0); assert.equal(state.jobs[0].status, 'running');
  assert.equal(pending(f, state.id).length, 1);
  assert.equal(f.app.store.history(f.actor, state.id).some(h => h.event === 'ai_finished'), false);
  f.app.store.db.exec('DROP TRIGGER fail_consume');
  assert.throws(() => f.app.recoverJob(f.actor, state.id, { revision: state.revision - 1, job_id: state.jobs[0].id }), { code: 'VERSION_CONFLICT' });
  assert.equal(pending(f, state.id).length, 1);
  state = recover(f, state); assert.equal(state.facts.length, 1); assert.equal(f.app.store.budget().used, 1);
});

test('interrupted jobs without a receipt keep their data revision and never retry automatically', async t => {
  let calls = 0;
  const f = await fixture(t, { extract: async args => { calls++; return response(args); } });
  let state = intake(f);
  const lawyer = { ...f.actor, role: 'lawyer' };
  state = f.app.draft(lawyer, state.id, { revision: state.revision, template: 'case_card' });
  state = f.app.approveDraft(lawyer, state.id, { revision: state.revision, draft_id: state.drafts[0].id });
  state = f.app.store.update(f.actor, state.id, state.revision, 'test_legacy_job', s => {
    s.jobs.push({ id: uid(), kind: 'intake', provider: 'deepseek', status: 'running' });
  }, { invalidate: false, reserveAI: true });
  const version = state.data_revision;
  f.reopen(); state = f.app.store.get(f.actor, state.id);
  assert.equal(state.jobs[0].status, 'interrupted'); assert.equal(state.jobs[0].error, 'RETRY_REQUIRED');
  assert.equal(state.data_revision, version); assert.equal(state.drafts[0].status, 'approved');
  assert.equal(pending(f, state.id).length, 0); assert.equal(calls, 0); assert.equal(f.app.store.budget().used, 1);
  assert.throws(() => recover(f, state), { code: 'SAVED_RESULT_NOT_FOUND' });
});

test('HTTP recovery is scoped to staff of the same tenant and never exposes saved output to clients', async t => {
  const directory = mkdtempSync(resolve(tmpdir(), 'casecheck-recovery-http-'));
  let calls = 0;
  const server = await createAppServer({ env, stateDir: directory, secure: false, extract: async args => { calls++; return response(args); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(directory, { recursive: true, force: true }); });
  const request = async (path, token, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/casecheck/api` + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const login = await server.app.store.login('admin@casecheck.local', password);
  const f = { app: server.app, actor: login.user }; let state = intake(f);
  breakFinalWrite(f.app);
  const failed = await request(`/cases/${state.id}/analyze`, login.token, { revision: state.revision, kind: 'intake', fields: ['client_name'] });
  assert.equal(failed.status, 503); assert.equal(failed.body.error, 'RESULT_SAVED_RECOVERY_REQUIRED');
  fixFinalWrite(f.app); state = f.app.store.get(f.actor, state.id);
  const client = f.app.store.link(f.actor, state.id), ownView = await request(`/cases/${state.id}`, login.token);
  assert.equal(ownView.body.recoverable_jobs.length, 1);
  assert.deepEqual(Object.keys(ownView.body.recoverable_jobs[0]).sort(), ['captured_at', 'job_id', 'sha256']);
  const clientView = await request(`/cases/${state.id}`, client.token);
  assert.equal(Object.hasOwn(clientView.body, 'recoverable_jobs'), false);
  assert.equal((await request(`/cases/${state.id}/recover-job`, client.token, { revision: state.revision, job_id: state.jobs[0].id })).status, 403);
  await f.app.store.addUser({ role: 'admin', tenant: uid() }, { email: 'other@example.invalid', name: 'Inna kancelaria', role: 'staff', password });
  const foreign = await f.app.store.login('other@example.invalid', password);
  assert.equal((await request(`/cases/${state.id}`, foreign.token)).status, 404);
  assert.equal((await request(`/cases/${state.id}/recover-job`, foreign.token, { revision: state.revision, job_id: state.jobs[0].id })).status, 404);
  const otherCase = f.app.create(f.actor, { title: 'Druga własna sprawa', track: 'consumer', synthetic: true });
  assert.equal((await request(`/cases/${otherCase.id}/recover-job`, login.token, { revision: otherCase.revision, job_id: state.jobs[0].id })).status, 404);
  const recovered = await request(`/cases/${state.id}/recover-job`, login.token, { revision: state.revision, job_id: state.jobs[0].id });
  assert.equal(recovered.status, 200); assert.equal(recovered.body.jobs[0].status, 'completed');
  assert.equal(recovered.body.recoverable_jobs.length, 0); assert.equal(calls, 1); assert.equal(f.app.store.budget().used, 1);
});
