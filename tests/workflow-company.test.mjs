import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Application } from '../src/app/application.mjs';
import { currentFacts, publicCase } from '../src/app/domain.mjs';
import { defaultWorkflow } from '../src/app/workflow.mjs';
import { nipInText, companyValues } from '../src/app/company-intake.mjs';
import { Spend } from '../src/ai/spend.mjs';
import { makeBackup, verifyBackup } from '../scripts/backup.mjs';

const actor = { id: 'lawyer', tenant: 'test-tenant', role: 'lawyer', name: 'Test' };
const now = () => new Date('2026-10-03T12:00:00Z');
const fact = (source, value) => ({ field: 'registration', type: 'text', text_value: value, source_id: source.id,
  quote: source.text, boolean_value: null, minor_units: null, currency: null, as_of: null, precision: 'exact' });
function setup(t, { lookup = async q => ({ ...q, summary: { name: 'Nazwa Firmy 1', nip: q.identifier, krs: '0000026438',
  address: 'Adres testowy', status_vat: 'Czynny' }, fetched_at: now().toISOString() }), conversation } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'casecheck-flow-'));
  const args = { stateDir: dir, now, env: { DEEPSEEK_API_KEY: 'test-not-network' }, lookup,
    conversation: conversation || (async ({ task }) => ({ output: { reply: 'Dziękuję. Co się zmieniło w firmie?', next_field: 'causes',
      facts: [fact(task.sources[0], task.sources[0].text)], warnings: [] } })) };
  const f = { app: new Application(args), args };
  t.after(() => { f.app.close(); rmSync(dir, { recursive: true, force: true }); });
  f.state = f.app.create(actor, { title: 'Fikcyjny odbiór procesu', track: 'company', synthetic: true });
  f.state = f.app.consent(actor, f.state.id, { revision: f.state.revision, provider: 'deepseek', accepted: true });
  return f;
}
const enable = f => { f.state = f.app.registryAutomation(actor, f.state.id, { revision: f.state.revision, enabled: true }); };
const message = async (f, text = 'Moja firma ma NIP 3245174504') => { f.state = await f.app.assistantMessage(actor, f.state.id, { revision: f.state.revision, text }); return f.state; };

test('NIP requires a label, valid checksum and unambiguous number', () => {
  assert.equal(nipInText('NIP: 525-000-77-38'), '5250007738');
  for (const text of ['5250007738', 'NIP 0000000000', 'NIP 5250007739', 'NIP 5250007738 oraz NIP 5260250274', 'NIP 52500077381']) assert.equal(nipInText(text), null);
  assert.equal(nipInText('NIP 3245174504'), '3245174504');
});
test('malformed registry identifiers from the MF test fixture are not copied as valid KRS numbers', () => {
  const fields = companyValues([{ kind: 'vat', summary: { name: 'Nazwa Firmy 1', nip: '3245174504', krs: '123456789098765', regon: 'bad' } }]);
  assert.equal(fields.registration, 'NIP 3245174504');
});

test('company lookup is opt-in and only uses the current company registration fact, never an unrelated creditor message', async t => {
  let calls = 0;
  const f = setup(t, { lookup: async () => { calls++; throw new Error(); } });
  await message(f); assert.equal(calls, 0); enable(f);
  f.app.conversation = async () => ({ output: { reply: 'Zapisano wiadomość.', next_field: null, facts: [], warnings: [] } });
  await message(f, 'NIP wierzyciela 5250007738'); assert.equal(calls, 0);
  assert.equal(f.state.company_candidate, undefined);
});

test('automatic test MF result requires explicit company confirmation, creates sourced pending facts and does not call production KRS', async t => {
  const queries = [], f = setup(t); const original = f.app.registryLookup;
  f.app.registryLookup = async q => { queries.push(q); return original(q); }; enable(f); await message(f);
  assert.equal(queries.length, 1); assert.equal(queries[0].test, true);
  assert.equal(f.state.company_candidate.status, 'ready'); assert.equal(currentFacts(f.state).client_name, undefined);
  const client = { id: 'client', tenant: actor.tenant, role: 'client', case_id: f.state.id };
  f.state = f.app.confirmCompany(client, f.state.id, { revision: f.state.revision, candidate_id: f.state.company_candidate.id });
  const name = currentFacts(f.state).client_name;
  assert.equal(name.text_value, 'Nazwa Firmy 1'); assert.equal(name.review, 'pending'); assert.equal(name.method, 'registry');
  assert.ok(f.state.sources.find(s => s.id === name.source_id).text.includes(name.quote));
  assert.equal(publicCase(f.state, client).conversation_facts.find(f => f.field === 'client_name').text_value, name.text_value);
  assert.throws(() => f.app.confirmCompany(client, f.state.id, { revision: f.state.revision, candidate_id: f.state.company_candidate.id }), { code: 'COMPANY_CANDIDATE_STALE' });
});

test('registry confirmation preserves manually reviewed values, and a newer case revision invalidates the candidate', async t => {
  const f = setup(t); enable(f);
  f.state = f.app.store.update(actor, f.state.id, f.state.revision, 'fixture', s => {
    s.facts.push({ field: 'client_name', type: 'text', text_value: 'Nazwa zweryfikowana', current: true, review: 'confirmed', method: 'manual' });
  });
  await message(f);
  f.state = f.app.confirmCompany(actor, f.state.id, { revision: f.state.revision, candidate_id: f.state.company_candidate.id });
  assert.equal(currentFacts(f.state).client_name.text_value, 'Nazwa zweryfikowana');
  assert.deepEqual(f.state.company_candidate.skipped_fields, ['client_name']);
  f.state = await f.app.companyLookup(actor, f.state.id, { revision: f.state.revision });
  f.state = f.app.message(actor, f.state.id, { revision: f.state.revision, text: 'Zmiana danych firmy.' });
  assert.equal(publicCase(f.state, actor).company_candidate.status, 'stale');
  assert.throws(() => f.app.confirmCompany(actor, f.state.id, { revision: f.state.revision, candidate_id: f.state.company_candidate.id }), { code: 'COMPANY_CANDIDATE_STALE' });
});

test('production chain validates both registry identities and keeps partial MF result when KRS fails', async t => {
  const queries = [], f = setup(t, { lookup: async q => { queries.push(q); return { ...q, summary: {
    name: q.kind === 'vat' ? 'Publiczna firma' : 'BŁĘDNA FIRMA', nip: q.kind === 'vat' ? q.identifier : '0000000000', krs: '0000026438' } }; } });
  f.state = f.app.store.update(actor, f.state.id, f.state.revision, 'fixture', s => { s.synthetic = false; });
  f.app.store.approveKnowledge(actor, (await import('../src/app/domain.mjs')).knowledge);
  enable(f); await message(f, 'NIP 5250007738');
  assert.equal(queries.length, 2); assert.equal(f.state.company_candidate.status, 'ready');
  assert.equal(f.state.company_candidate.error, 'REGISTRY_IDENTITY_MISMATCH');
  assert.equal(f.state.company_candidate.results.length, 1);
  f.state = f.app.confirmCompany(actor, f.state.id, { revision: f.state.revision, candidate_id: f.state.company_candidate.id });
  assert.equal(currentFacts(f.state).client_name.text_value, 'Publiczna firma');
});

test('changed case during registry fetch discards the candidate and failed lookup does not retry on later conversation', async t => {
  const f = setup(t); enable(f);
  f.app.registryLookup = async q => { const s = f.app.store.get(actor, f.state.id);
    f.app.message(actor, s.id, { revision: s.revision, text: 'Sprostowanie w drugiej sesji.' });
    return { ...q, summary: { name: 'TEST', nip: q.identifier } }; };
  await message(f); assert.equal(f.state.company_candidate.status, 'stale');
  let count = 0; f.app.registryLookup = async () => { count++; throw Object.assign(new Error(), { code: 'REGISTRY_UNAVAILABLE' }); };
  f.state = await f.app.companyLookup(actor, f.state.id, { revision: f.state.revision });
  assert.equal(f.state.company_candidate.status, 'failed');
  await message(f); assert.equal(count, 1);
});

test('client completion creates reviewed-later drafts and tasks atomically, retries are idempotent, and private package is not leaked', async t => {
  const f = setup(t); await message(f);
  const client = { id: 'client', tenant: actor.tenant, role: 'client', case_id: f.state.id };
  f.state = f.app.finishIntake(client, f.state.id, { revision: f.state.revision });
  assert.equal(f.state.stage, 'review'); assert.equal(f.state.drafts.length, 3); assert.equal(f.state.tasks.length, 2);
  assert.ok(f.state.drafts.every(d => d.status === 'draft' && d.source_revision === f.state.data_revision));
  assert.ok(f.state.tasks.every(t => t.due === '2026-10-05' && t.kind === 'administrative'));
  assert.equal(f.state.drafts[1].sections[1].text, '[DO UZUPEŁNIENIA: wierzyciele i dokumenty]');
  const rev = f.state.revision; f.state = f.app.finishIntake(client, f.state.id, { revision: rev }); assert.equal(f.state.revision, rev);
  const visible = publicCase(f.state, client); assert.equal(visible.drafts, undefined); assert.equal(visible.tasks, undefined);
  assert.ok(f.app.activity.feed(actor).items.some(i => i.title.startsWith('Wywiad zakończony')));
  f.state = f.app.stage(actor, f.state.id, { revision: rev, stage: 'documents' });
  assert.equal(f.state.drafts.length, 3); assert.equal(f.state.tasks.length, 4);
  f.state = f.app.stage(actor, f.state.id, { revision: f.state.revision, stage: 'documents' });
  assert.equal(f.state.tasks.length, 4);
});

test('workflow uses configured dates and assignees, disallows foreign users and clients, preserves completed tasks and edited drafts', async t => {
  const f = setup(t); const rules = defaultWorkflow();
  f.app.store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run('team1', actor.tenant, 'test@example.invalid', 'Pracownik', 'staff', 'not-a-login');
  rules.review.tasks = [{ title: 'Sprawdź pliki', days: 4, assignee: 'team1' }]; rules.review.templates = ['case_card'];
  f.state = f.app.workflow(actor, f.state.id, { revision: f.state.revision, rules });
  const bad = structuredClone(rules); bad.review.tasks[0].assignee = 'foreign';
  assert.throws(() => f.app.workflow(actor, f.state.id, { revision: f.state.revision, rules: bad }), { code: 'INVALID_WORKFLOW' });
  assert.throws(() => f.app.workflow({ ...actor, role: 'client', case_id: f.state.id }, f.state.id, { revision: f.state.revision, rules }), { code: 'FORBIDDEN' });
  await message(f); f.state = f.app.finishIntake(actor, f.state.id, { revision: f.state.revision });
  assert.equal(f.state.tasks[0].due, '2026-10-07'); assert.equal(f.state.tasks[0].assignee, 'team1');
  f.state = f.app.task(actor, f.state.id, { revision: f.state.revision, task_id: f.state.tasks[0].id, status: 'done' });
  f.state = f.app.editDraft(actor, f.state.id, { revision: f.state.revision, draft_id: f.state.drafts[0].id, sections: [{ heading: 'Ręczna edycja', text: 'Zachowaj tę treść' }] });
  f.state = f.app.stage(actor, f.state.id, { revision: f.state.revision, stage: 'review' });
  assert.equal(f.state.drafts.length, 1); assert.equal(f.state.drafts[0].sections[0].text, 'Zachowaj tę treść');
  f.state = f.app.message(actor, f.state.id, { revision: f.state.revision, text: 'Nowe informacje.' });
  assert.equal(f.state.drafts[0].status, 'stale');
  f.state = f.app.finishIntake(actor, f.state.id, { revision: f.state.revision });
  assert.equal(f.state.drafts.length, 2); assert.equal(f.state.tasks.length, 1); assert.equal(f.state.tasks[0].status, 'done');
});

test('package creation rolls back entirely if draft capacity is exhausted; pending jobs block completion', async t => {
  const f = setup(t); await message(f);
  f.state = f.app.store.update(actor, f.state.id, f.state.revision, 'fixture', s => {
    s.drafts = Array.from({ length: 49 }, () => ({ template: 'other', status: 'stale' }));
  }, { invalidate: false });
  const rev = f.state.revision;
  assert.throws(() => f.app.finishIntake(actor, f.state.id, { revision: rev }), { code: 'DRAFT_LIMIT' });
  const saved = f.app.store.get(actor, f.state.id); assert.equal(saved.revision, rev); assert.equal(saved.stage, 'intake'); assert.equal(saved.drafts.length, 49);
  f.state = f.app.store.update(actor, f.state.id, rev, 'fixture', s => s.jobs.push({ status: 'running' }), { invalidate: false });
  assert.throws(() => f.app.finishIntake(actor, f.state.id, { revision: f.state.revision }), { code: 'INTAKE_JOB_PENDING' });
});

test('registry work interrupted by restart can be retried explicitly', t => {
  const f = setup(t);
  f.state = f.app.store.update(actor, f.state.id, f.state.revision, 'fixture', s => { s.company_candidate = { status: 'running', results: [] }; }, { invalidate: false });
  f.app.close(); f.app = new Application(f.args);
  assert.equal(f.app.store.get(actor, f.state.id).company_candidate.status, 'failed');
});
test('client registry lookup cannot expose a company number obtained only from a private document', async t => {
  const f = setup(t); enable(f); await message(f);
  f.state = f.app.store.update(actor, f.state.id, f.state.revision, 'fixture', s => {
    s.sources.find(source => source.id === currentFacts(s).registration.source_id).kind = 'document';
  });
  const client = { id: 'client', tenant: actor.tenant, role: 'client', case_id: f.state.id };
  await assert.rejects(f.app.companyLookup(client, f.state.id, { revision: f.state.revision }), { code: 'COMPANY_NIP_REQUIRED' });
});
test('backup includes the persistent dollar ledger and verifies it independently of case files', async t => {
  const f = setup(t), destination = f.args.stateDir + '-backup';
  t.after(() => rmSync(destination, { recursive: true, force: true }));
  const env = { CASECHECK_AI_USD_LIMIT: '10', CASECHECK_AI_BUDGET_PATH: resolve(f.args.stateDir, 'ai-spend.sqlite') };
  const ledger = new Spend(env);
  const reservation = ledger.reserve({ model: 'deepseek-flash', max_tokens: 10, messages: [] });
  ledger.settle(reservation, { prompt_tokens: 50, completion_tokens: 5 });
  const expected = ledger.state(); ledger.close();
  await makeBackup(f.args.stateDir, destination); assert.equal(verifyBackup(destination).ok, true);
  assert.ok(JSON.parse(readFileSync(resolve(destination, 'manifest.json'))).spending_sha256);
  const restored = new Spend({ ...env, CASECHECK_AI_BUDGET_PATH: resolve(destination, 'ai-spend.sqlite') });
  assert.deepEqual(restored.state(), expected); restored.close();
});
