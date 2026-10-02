// Explicit, bounded paid workflow test. All inputs are the visibly synthetic fixtures.
import { loadEnvFile } from 'node:process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { Application } from '../src/app/application.mjs';
import { currentFacts } from '../src/app/domain.mjs';
import { renderDraft } from '../src/app/pdf.mjs';

try { loadEnvFile(resolve('.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const env = Object.fromEntries(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_MODEL', 'DEEPSEEK_MODEL']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
const mode = process.argv[2];
if (!['--prepare', '--run', '--resume'].includes(mode)) { console.error('Use --prepare (no API calls), --run or --resume (at most 8 paid requests).'); process.exit(1); }
mkdirSync('deploy/local', { recursive: true, mode: 0o700 }); mkdirSync('reports/local', { recursive: true, mode: 0o700 });
const credentialsPath = resolve('deploy/local/app-credentials.json');
const credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8')) : {
  admin_email: 'admin@casecheck.local', admin_password: randomBytes(32).toString('base64url'),
  lawyer_email: 'prawnik-testowy@casecheck.local', lawyer_password: randomBytes(32).toString('base64url'),
};
writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 });
const app = new Application({ env, stateDir: resolve('data/local/app'), limit: 20 });
await app.store.bootstrap(credentials.admin_email, credentials.admin_password);
const admin = (await app.store.login(credentials.admin_email, credentials.admin_password)).user;
if (!app.store.users(admin).some(u => u.email === credentials.lawyer_email)) await app.store.addUser(admin, {
  email: credentials.lawyer_email, password: credentials.lawyer_password, name: 'Prawnik Testowy — konto do fikcyjnych danych', role: 'lawyer' });
const lawyer = (await app.store.login(credentials.lawyer_email, credentials.lawyer_password)).user;
app.seed(admin);
if (mode === '--prepare') { console.log(JSON.stringify({ prepared_cases: app.store.list(admin).length, api_calls: 0 })); app.close(); process.exit(0); }
const fixtures = JSON.parse(readFileSync('tests/full-fixtures/cases.json', 'utf8')).cases;
const reports = []; let paid = 0;
const selectedCase = prefix => app.store.list(admin).find(c => c.title.startsWith(prefix + ' '));
async function analyze(state, input) {
  if (++paid > 8) throw new Error('SMOKE_LIMIT');
  const result = await app.analyze(admin, state.id, { revision: state.revision, ...input });
  const job = result.jobs.at(-1); reports.push({ case: result.title.split(' ')[0], kind: input.kind, status: job.status,
    error: job.error || null, model: job.model, usage: job.usage, elapsed_ms: job.elapsed_ms });
  console.log(JSON.stringify({ case: result.title.split(' ')[0], kind: input.kind, status: job.status, error: job.error || null }));
  if (job.status !== 'completed') throw new Error('WORKFLOW_AI_FAILED'); return result;
}
let passed = false;
try {
  let state = app.store.get(admin, selectedCase('S01').id);
  state = app.consent(admin, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
  if (mode !== '--resume' || !currentFacts(state).declared_total) state = await analyze(state, { kind: 'intake', fields: ['client_name', 'address', 'declared_total', 'monthly_income', 'monthly_expenses'],
    source_ids: state.sources.filter(s => s.kind === 'message').map(s => s.id) });
  const facts = currentFacts(state), fixture = fixtures.find(c => c.id === 'S01');
  if (facts.declared_total.minor_units !== fixture.declared || facts.monthly_income.minor_units !== fixture.income ||
    facts.monthly_expenses.minor_units !== fixture.expenses || facts.client_name.text_value !== fixture.client_name) throw new Error('INTAKE_MISMATCH');
  for (const doc of state.documents.filter(d => !d.name.includes('I01'))) {
    if (mode !== '--resume' || !state.claims.some(c => c.document_id === doc.id && !c.merged_into)) state = await analyze(state, { kind: 'claim', source_ids: state.sources.filter(s => s.document_id === doc.id).map(s => s.id) });
    const claim = state.claims.find(c => c.document_id === doc.id && !c.merged_into), oracle = fixture.documents.find(d => d.pdf_path.endsWith(doc.name)).expected;
    if (claim.facts.find(f => f.field === 'total_amount').minor_units !== oracle.total_minor ||
      claim.facts.find(f => f.field === 'agreement_number').text_value !== oracle.agreement) throw new Error('CLAIM_MISMATCH');
    state = app.reviewClaim(lawyer, state.id, { revision: state.revision, claim_id: claim.id, review: 'confirmed' });
  }
  for (const fact of state.facts.filter(f => f.current && f.type !== 'unknown')) state = app.reviewFact(lawyer, state.id,
    { revision: state.revision, fact_id: fact.id, review: 'confirmed' });
  const { controls } = await import('../src/app/domain.mjs');
  if (controls(state).difference?.minor_units !== 1000000) throw new Error('ARITHMETIC_MISMATCH');
  mkdirSync('output/pdf', { recursive: true });
  for (const template of ['case_card', 'creditor_list', 'missing_documents', 'claim_clarification']) {
    state = app.draft(lawyer, state.id, { revision: state.revision, template, options: { claim_id: state.claims.find(c => !c.merged_into)?.id } });
    state = app.approveDraft(lawyer, state.id, { revision: state.revision, draft_id: state.drafts.at(-1).id });
    writeFileSync(`output/pdf/test-${template}.pdf`, await renderDraft(state.drafts.at(-1), state));
  }
  let company = app.store.get(admin, selectedCase('S18').id);
  company = app.draft(admin, company.id, { revision: company.revision, template: 'preliminary_plan' });
  writeFileSync('output/pdf/test-preliminary_plan.pdf', await renderDraft(company.drafts.at(-1), company));
  for (const caseId of ['S11', 'S12']) {
    let scan = app.store.get(admin, selectedCase(caseId).id);
    scan = app.consent(admin, scan.id, { revision: scan.revision, accepted: true, provider: 'openai' });
    const doc = scan.documents.find(d => d.name.endsWith('-scan.pdf'));
    if (doc.status === 'ocr_required') {
      if (++paid > 8) throw new Error('SMOKE_LIMIT');
      scan = await app.runOCR(admin, scan.id, { revision: scan.revision, document_id: doc.id });
      const job = scan.jobs.at(-1); reports.push({ case: caseId, kind: 'ocr', status: job.status, model: job.model, usage: job.usage });
      console.log(JSON.stringify({ case: caseId, kind: 'ocr', status: job.status }));
      if (job.status !== 'completed') throw new Error('OCR_FAILED');
    }
    if (mode !== '--resume' || !scan.claims.some(c => c.document_id === doc.id && !c.merged_into)) scan = await analyze(scan, { kind: 'claim', source_ids: scan.sources.filter(s => s.document_id === doc.id && s.read_method.startsWith('ai_ocr')).map(s => s.id) });
    const total = scan.claims.find(c => c.document_id === doc.id && !c.merged_into).facts.find(f => f.field === 'total_amount');
    if (caseId === 'S11' ? total.minor_units !== 987654 : total.type !== 'unknown') throw new Error('SCAN_AMOUNT_MISMATCH');
    if (scan.drafts.some(d => d.status === 'approved')) throw new Error('UNTRUSTED_DOCUMENT_APPROVAL');
  }
  passed = true;
} catch (error) { console.error('Workflow check failed:', /^[A-Z_]+$/.test(error.message) ? error.message : 'SAFE_INTERNAL_ERROR'); }
finally {
  const verified_operations = app.store.list(admin).filter(c => ['S01', 'S11', 'S12'].some(id => c.title.startsWith(id + ' ')))
    .map(c => { const state = app.store.get(admin, c.id); return { case: c.title.split(' ')[0],
      jobs: state.jobs.map(({ kind, status, model, usage, error }) => ({ kind, status, model, usage, error })) }; });
  writeFileSync('reports/local/full-workflow.json', JSON.stringify({ at: new Date().toISOString(), synthetic: true,
    passed, paid_requests: paid, total_app_requests_today: app.store.budget().used, reports, verified_operations }, null, 2) + '\n', { mode: 0o600 });
  app.close();
}
if (!passed) process.exitCode = 1;
