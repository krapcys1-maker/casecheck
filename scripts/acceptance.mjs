// Bounded acceptance test of the real HTTP app. Fixture expectations never enter the model request.
import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, cpSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, basename } from 'node:path';
import { createAppServer } from '../src/app-server.mjs';
import { Application } from '../src/app/application.mjs';
import { digest } from '../src/app/store.mjs';
import { documentSources } from '../src/app/document-review.mjs';
import { readDocument, saveFile, safeFile } from '../src/app/files.mjs';
import { makeBackup, verifyBackup } from './backup.mjs';

const mode = process.argv[2] || '--plan';
const noApi = process.argv.includes('--no-api');
assert.ok(!noApi || mode === '--resume', '--no-api requires --resume');
assert.ok(['--plan', '--run', '--resume'].includes(mode), 'Use --plan, --run or --resume');
const selected = ['S01', 'S02', 'S04', 'S11', 'S12', 'S18'];
const retryCase = process.argv.includes('--retry-case') ? process.argv[process.argv.indexOf('--retry-case') + 1] : null;
assert.ok(!retryCase || mode === '--resume' && selected.includes(retryCase), 'Explicit retry requires --resume --retry-case Sxx');
const corpus = JSON.parse(readFileSync('tests/full-fixtures/cases.json', 'utf8'));
assert.equal(corpus.synthetic, true);
if (mode === '--plan') {
  console.log(JSON.stringify({ synthetic: true, cases: selected, maximum_new_calls: 16,
    persistent_daily_limit: 20, automatic_retries: false, providers: ['deepseek', 'anthropic', 'openai'],
    operations: ['HTTP login and roles', 'client interview', 'real PDF upload/parser', 'OCR', 'claim extraction',
      'review and correction', 'assignment and duplicates', 'paid-result recovery', 'all five PDF templates',
      'reviewed JSON export', 'task completion and closing', 'backup and restore'] }, null, 2));
  process.exit(0);
}
try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const directory = resolve('data/local/acceptance'), artifacts = resolve('reports/local/acceptance');
mkdirSync(directory, { recursive: true, mode: 0o700 }); mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const credentialsPath = resolve(directory, 'test-credentials.json');
const credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8'))
  : Object.fromEntries(['admin', 'lawyer', 'staff'].map(role => [role, { email: `acceptance-${role}@example.invalid`, password: randomBytes(32).toString('base64url') }]));
writeFileSync(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
const env = Object.fromEntries(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_MODEL', 'DEEPSEEK_MODEL']
  .filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { CASECHECK_ADMIN_EMAIL: credentials.admin.email, CASECHECK_ADMIN_PASSWORD: credentials.admin.password, CASECHECK_DAILY_REQUEST_LIMIT: '20' });
const refuseApi = async () => { throw new Error('API_DISABLED_FOR_RESUME'); };
const server = await createAppServer({ env, stateDir: directory, secure: false, ...(noApi ? { extract: refuseApi, ocr: refuseApi } : {}) });
const reviewedPages = JSON.parse(readFileSync('docs/ocr-reviewed-pages-2026-10-03.json', 'utf8')).pages;
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/casecheck/api`;
const report = { schema: 'casecheck-http-acceptance-v1', started_at: new Date().toISOString(), synthetic: true,
  source: noApi ? 'Actual HTTP, previously saved real API outputs; new API disabled. Test role simulation, no legal assessment.' : 'Actual HTTP requests, actual providers; test accounts simulate staff/lawyer review, no legal assessment',
  new_api_disabled: noApi,
  baseline_budget: server.app.store.budget(), cases: [], checks: [], pdfs: [], passed: false };
const reportPath = resolve(artifacts, 'report.json');
if (existsSync(reportPath)) copyFileSync(reportPath, resolve(artifacts, `report-before-${Date.now()}.json`));
const checkpoint = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const record = name => { report.checks.push(name); checkpoint(); };
let tokens = {}, users = {};
async function request(path, token, input, { expected, method, bytes = false, headers = {} } = {}) {
  const response = await fetch(base + path, { method: method || (input === undefined ? 'GET' : 'POST'),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(input && !Buffer.isBuffer(input) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: input === undefined ? undefined : Buffer.isBuffer(input) ? input : JSON.stringify(input), signal: AbortSignal.timeout(90000) });
  const body = bytes ? Buffer.from(await response.arrayBuffer()) : await response.json();
  assert.equal(response.status, expected || (input === undefined ? 200 : 200), `${path}: ${body.error || response.status}`);
  return body;
}
async function login(role) {
  const result = await request('/login', null, credentials[role]); tokens[role] = result.token; users[role] = result.user;
}
const norm = value => value?.replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
const fact = (state, field) => state.facts.find(f => f.current && f.field === field);
const claimFact = (claim, field) => claim.facts.find(f => f.field === field);
function verifyClaim(claim, expected, scanUnreadable = false) {
  const amount = claimFact(claim, 'total_amount');
  if (scanUnreadable) { assert.equal(amount.type, 'unknown', 'Unreadable amount must stay unknown'); return; }
  assert.equal(amount.minor_units, expected.total_minor, 'Total amount'); assert.equal(amount.currency, expected.currency, 'Currency');
  assert.equal(amount.as_of, expected.as_of, 'Amount balance date');
  assert.equal(norm(claimFact(claim, 'creditor_name').text_value), norm(expected.creditor), 'Current creditor');
  assert.equal(claimFact(claim, 'agreement_number').text_value, expected.agreement, 'Agreement');
  assert.equal(claimFact(claim, 'balance_date').text_value, expected.as_of, 'Balance date');
  if (expected.original_creditor) assert.equal(norm(claimFact(claim, 'original_creditor').text_value), norm(expected.original_creditor), 'Predecessor');
  if (expected.disputed === null) assert.equal(claimFact(claim, 'disputed').type, 'unknown', 'No invented acceptance of debt');
  else assert.equal(claimFact(claim, 'disputed').boolean_value, expected.disputed, 'Dispute');
  if (expected.security === null) assert.equal(claimFact(claim, 'security_description').type, 'unknown', 'No invented lack of security');
}

try {
  await login('admin');
  const accounts = (await request('/users', tokens.admin)).users;
  for (const role of ['lawyer', 'staff']) {
    if (!accounts.some(u => u.email === credentials[role].email)) await request('/users', tokens.admin,
      { ...credentials[role], name: `TEST ${role} — dane fikcyjne`, role }, { expected: 201 });
    await login(role);
  }
  record('HTTP login for administrator, staff and lawyer');
  for (const code of selected) {
    const fixture = corpus.cases.find(c => c.id === code), outcome = { code, checks: [], jobs: [], passed: false };
    report.cases.push(outcome);
    const title = `Akceptacja ${code} — ${fixture.title}`;
    let state, client;
    try {
      const existing = (await request('/cases', tokens.admin)).cases.find(c => c.title === title);
      assert.ok(!existing || mode === '--resume', 'Existing acceptance state: use --resume; never silently repeat paid work');
      state = existing ? await request(`/cases/${existing.id}`, tokens.staff)
        : await request('/cases', tokens.admin, { title, track: fixture.track, synthetic: true }, { expected: 201 });
      const path = action => `/cases/${state.id}/${action}`;
      const post = async (action, input, role = 'staff', options = {}) => {
        const result = await request(path(action), tokens[role] || role, { revision: state.revision, ...input }, options);
        if (result.id === state.id) state = result; return result;
      };
      const get = async () => { state = await request(`/cases/${state.id}`, tokens.staff); return state; };
      client = (await request(path('link'), tokens.staff, {}, { expected: 201 })).token;
      const provider = code === 'S04' ? 'anthropic' : code === 'S18' ? 'openai' : 'deepseek';
      const consent = async selectedProvider => { if (state.consent?.provider !== selectedProvider) await post('consent', { accepted: true, provider: selectedProvider }); };
      await consent(provider);
      if (!state.messages.some(m => m.role === 'user')) {
        await post('messages', { text: fixture.conversation.join('\n\n'), field: 'client_name', analyze: code === 'S01' }, client);
        await get();
      }
      if (['S01', 'S18'].includes(code)) {
        const fields = ['client_name', 'address', 'declared_total', 'monthly_income', 'monthly_expenses'];
        const missing = fields.filter(f => !fact(state, f) || fact(state, f).type === 'unknown');
        if (missing.length) await post('analyze', { kind: 'intake', fields: missing, source_ids: state.sources.filter(s => s.kind === 'message').map(s => s.id) });
        assert.equal(norm(fact(state, 'client_name').text_value), norm(fixture.client_name));
        assert.equal(fact(state, 'declared_total').minor_units, fixture.declared);
        assert.equal(fact(state, 'monthly_income').minor_units, fixture.income);
        assert.equal(fact(state, 'monthly_expenses').minor_units, fixture.expenses);
        outcome.checks.push('Conversation persists and financial intake matches source');
      }
      if (code === 'S18') {
        const planMessage = `Planowane działania: ${fixture.recovery}\nWstępny harmonogram: renegocjacje od października 2026 r.; sprzedaż zbędnych zapasów do grudnia 2026 r.\nSprawozdanie finansowe nie jest gotowe; księgowość kompletuje dokumenty.`;
        if (!state.messages.some(m => m.role === 'user' && m.text === planMessage)) {
          await post('messages', { text: planMessage, field: 'recovery_measures', analyze: false }, client);
          await get();
        }
        const fields = ['causes', 'recovery_measures', 'recovery_schedule', 'financial_statements'];
        const missing = fields.filter(f => !fact(state, f) || fact(state, f).type === 'unknown');
        if (missing.length) await post('analyze', { kind: 'intake', fields: missing,
          source_ids: state.sources.filter(s => s.kind === 'message').map(s => s.id) });
        for (const field of fields) {
          const value = fact(state, field); assert.equal(value.type, 'text', `Company plan: ${field}`);
          assert.ok(value.quote && state.sources.find(s => s.id === value.source_id)?.text.includes(value.quote));
        }
        assert.match(fact(state, 'causes').text_value, /utrat\p{L}* dużego kontraktu/iu);
        assert.match(fact(state, 'recovery_measures').text_value, /renegocjac/iu);
        assert.match(fact(state, 'recovery_schedule').text_value, /grudni\p{L}* 2026/iu);
        assert.match(fact(state, 'financial_statements').text_value, /nie jest gotowe|kompletuje dokumenty/iu);
        outcome.checks.push('Company follow-up: four plan fields extracted with evidence from two client messages');
      }
      for (const document of fixture.documents.filter(d => d.expected.agreement)) {
        const sourcePath = resolve('tests/full-fixtures', document.scan_path || document.pdf_path), name = basename(sourcePath);
        let doc = (state.documents || []).find(d => d.name === name);
        if (!doc) {
          state = await request(path('upload'), tokens.staff, readFileSync(sourcePath), { expected: 201,
            headers: { 'X-File-Name': encodeURIComponent(name), 'X-Case-Revision': String(state.revision) } });
          doc = state.documents.find(d => d.name === name);
        }
        const original = await request(path(`files/${doc.id}`), tokens.staff, undefined, { bytes: true });
        assert.equal(digest(original), digest(readFileSync(sourcePath)), 'Original download hash');
        if (doc.status === 'ocr_required') { await consent('openai'); await post('ocr', { document_id: doc.id }); doc = state.documents.find(d => d.id === doc.id); }
        assert.ok(['read', 'ocr_review', 'ocr_verified'].includes(doc.status), `Document read: ${doc.status}`);
        for (const page of state.document_reviews?.find(r => r.document_id === doc.id)?.pages || []) {
          if (page.status === 'confirmed') continue;
          const source = state.sources.find(s => s.id === page.source_id);
          const evidence = reviewedPages.find(r => r.document_sha256 === doc.sha256 && r.page === page.page && r.text_sha256 === digest(source?.text || ''));
          assert.ok(evidence, 'OCR output requires an actual page comparison and a matching review record; not auto-approved');
          await post('review-ocr-page', { source_id: source.id, review: 'confirmed', note: `Test roli na odczycie sprawdzonym przez agenta: ${evidence.note}` }, 'lawyer');
          outcome.checks.push(`${name} page ${page.page}: source and text hashes match agent visual review record`);
        }
        let claim = state.claims.find(c => c.document_id === doc.id && !c.merged_into) || state.claims.find(c => c.document_id === doc.id);
        if (retryCase === code) claim = null;
        if (!claim) {
          await consent(provider);
          const sources = documentSources(state, doc.id).filter(s => s.text);
          assert.ok(sources.length && sources.every(s => s.read_method !== 'synthetic_supplied_text'), 'Use parser/OCR, never the fixture oracle');
          const input = { kind: 'claim', source_ids: sources.map(s => s.id) };
          if (code === 'S04') {
            server.app.store.db.exec("CREATE TRIGGER acceptance_final_failure BEFORE INSERT ON audit WHEN NEW.event='ai_finished' BEGIN SELECT RAISE(ABORT,'acceptance final write failure'); END;");
            try { await post('analyze', input, 'staff', { expected: 503 }); }
            finally { server.app.store.db.exec('DROP TRIGGER acceptance_final_failure'); }
            await get(); assert.equal(state.recoverable_jobs.length, 1);
            const budget = server.app.store.budget().used;
            await post('recover-job', { job_id: state.recoverable_jobs[0].job_id });
            assert.equal(server.app.store.budget().used, budget);
            outcome.checks.push('Actual paid response recovered after failed final write without another API call');
          } else await post('analyze', input);
          claim = state.claims.find(c => c.document_id === doc.id && !c.merged_into);
        }
        assert.ok(claim, `No claim: ${state.jobs.at(-1)?.error || 'unknown error'}`);
        verifyClaim(claim, document.expected, code === 'S12');
        outcome.checks.push(`${name}: original hash, parsed evidence and expected claim fields`);
        if (!claim.merged_into && claim.review !== 'confirmed') await post('review-claim', { claim_id: claim.id, review: 'confirmed' }, 'lawyer');
      }
      if (code === 'S02' && state.claims.filter(c => !c.merged_into).length === 2) {
        assert.equal(state.controls.candidates.length, 1);
        const [from, into] = state.claims.filter(c => !c.merged_into);
        await post('merge', { from: from.id, into: into.id, note: 'Test: jedna umowa, cesja i późniejsze saldo.' }, 'lawyer');
        await post('review-claim', { claim_id: into.id, review: 'confirmed' }, 'lawyer');
        assert.equal(state.claims.filter(c => !c.merged_into).length, 1); assert.equal(state.controls.totals[0].minor_units, 5320000);
        outcome.checks.push('Assignment retains both sources, one active claim and one balance');
      }
      if (code === 'S01' && !state.facts.some(f => f.method === 'manual')) {
        const previous = fact(state, 'address');
        await post('correction', { note: 'Klient poprawił adres: ul. Skorygowana 1, 00-000 Miasto Testowe.', fact: {
          field: 'address', type: 'text', text_value: 'ul. Skorygowana 1, 00-000 Miasto Testowe', boolean_value: null,
          minor_units: null, currency: null, as_of: null, precision: 'exact' } });
        assert.ok(state.facts.some(f => f.id === previous.id && !f.current)); outcome.checks.push('Manual correction preserves previous value and evidence');
      }
      for (const value of state.facts.filter(f => f.current && f.type !== 'unknown' && f.review === 'pending'))
        await post('review-fact', { fact_id: value.id, review: 'confirmed' }, 'lawyer');
      if (code === 'S01') { assert.equal(state.controls.difference.minor_units, 1000000); outcome.checks.push('120000 PLN declared, 110000 PLN in documents: difference 10000 PLN'); }
      const templates = code === 'S01' ? ['case_card', 'creditor_list', 'missing_documents', 'claim_clarification']
        : code === 'S18' ? ['preliminary_plan'] : [];
      for (const template of templates) {
        let draft = state.drafts.find(d => d.template === template && d.source_revision === state.data_revision && d.status === 'approved');
        if (!draft) {
          await post('drafts', { template, options: { claim_id: state.claims.find(c => !c.merged_into)?.id } }); draft = state.drafts.at(-1);
          await post('approve-draft', { draft_id: draft.id }, 'staff', { expected: 403 });
          await post('approve-draft', { draft_id: draft.id }, 'lawyer');
        }
        const pdf = await request(path(`pdf/${draft.id}`), tokens.lawyer, undefined, { bytes: true });
        const outputPath = resolve(artifacts, `${code}-${template}.pdf`); writeFileSync(outputPath, pdf);
        const saved = saveFile(resolve(artifacts, 'pdf-qa'), pdf, `${template}.pdf`), read = await readDocument(resolve(artifacts, 'pdf-qa'), saved);
        const text = read.pages.map(p => p.text).join('\n'); assert.match(text, /Zatwierdzono/); assert.match(text, /FIKCYJNE/);
        if (code === 'S01' && ['case_card', 'creditor_list'].includes(template)) for (const name of ['Alfa', 'Beta', 'Gamma']) assert.ok(text.includes(name));
        if (template === 'preliminary_plan') {
          for (const field of ['causes', 'recovery_measures', 'recovery_schedule', 'financial_statements'])
            assert.ok(norm(text).includes(norm(fact(state, field).text_value)), `Company plan PDF: ${field}`);
          assert.equal(text.includes('[DO UZUPEŁNIENIA]'), false, 'Known plan sections must appear in the PDF');
        }
        report.pdfs.push({ case: code, template, path: outputPath, pages: read.pages.length, sha256: digest(pdf), text_verified: true });
      }
      const pack = await request(path('review-package'), tokens.lawyer);
      assert.ok(pack.claims.length); assert.equal(pack.blockers.length, 0, 'Export blockers');
      await request(path('review-package'), tokens.staff, undefined, { expected: 403 });
      const exported = await request(path('export'), tokens.staff); assert.equal(exported.case.id, state.id);
      writeFileSync(resolve(artifacts, `${code}-reviewed.json`), JSON.stringify(pack, null, 2));
      const clientView = await request(`/cases/${state.id}`, client);
      for (const key of ['facts', 'claims', 'jobs', 'drafts', 'recoverable_jobs']) assert.equal(Object.hasOwn(clientView, key), false);
      outcome.checks.push('Reviewed JSON export and client/staff permissions');
      if (code === 'S01' && state.stage !== 'closed') {
        if (!state.tasks.length) await post('tasks', { title: 'Test: wyjaśnienie różnicy', kind: 'administrative', assignee: users.staff.id });
        if (state.tasks.some(t => t.status === 'open')) await post('stage', { stage: 'closed' }, 'lawyer', { expected: 409 });
        for (const task of state.tasks.filter(t => t.status === 'open')) await post('tasks', { task_id: task.id, status: 'done' });
        await post('stage', { stage: 'closed' }, 'lawyer'); assert.equal(state.stage, 'closed');
        outcome.checks.push('Assigned tasks, blocked premature close, task completion and closing');
      }
      await post('revoke-links', {}); await request(`/cases/${state.id}`, client, undefined, { expected: 401 });
      outcome.passed = true;
    } catch (error) {
      outcome.error = { code: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'ACCEPTANCE_FAILED',
        message: String(error.message).slice(0, 180), expected: error.expected, actual: error.actual };
    }
    if (state) {
      const final = server.app.store.get(users.admin, state.id);
      outcome.jobs = final.jobs.map(({ id, kind, provider, status, error, model, usage, elapsed_ms, recovered_at, llm_called }) =>
        ({ id, kind, provider, status, error, model, usage, elapsed_ms, recovered_at, llm_called }));
    }
    checkpoint(); console.log(JSON.stringify({ case: code, passed: outcome.passed, error: outcome.error, budget_used: server.app.store.budget().used }));
  }
  const backupPath = resolve(artifacts, `backup-${Date.now()}`);
  await makeBackup(directory, backupPath); assert.equal(verifyBackup(backupPath).ok, true);
  record('Private backup contains verified database and original files');
  report.backup_path = backupPath;
  const restorePath = resolve(artifacts, `restored-${Date.now()}`); cpSync(backupPath, restorePath, { recursive: true });
  const restored = new Application({ stateDir: restorePath, env: {} });
  try {
    const { user } = await restored.store.login(credentials.lawyer.email, credentials.lawyer.password);
    const states = restored.store.list(user); assert.equal(states.length, selected.length);
    for (const entry of states) {
      const state = restored.store.get(user, entry.id);
      assert.equal(state.revision, server.app.store.get(users.admin, entry.id).revision);
      for (const document of state.documents || []) assert.equal(digest(readFileSync(safeFile(restorePath, document.id))), document.sha256);
    }
    assert.equal(restored.store.budget().used, server.app.store.budget().used);
    record('Restored separate application: lawyer login, six cases, revisions, every attachment hash and persistent budget');
  } finally { restored.close(); }
  report.restore_path = restorePath;
  report.passed = report.cases.every(c => c.passed);
} finally {
  report.finished_at = new Date().toISOString(); report.final_budget = server.app.store.budget(); checkpoint();
  await new Promise(r => server.close(r));
}
console.log(JSON.stringify({ passed: report.passed, report: reportPath, budget: report.final_budget }));
if (!report.passed) process.exitCode = 1;
