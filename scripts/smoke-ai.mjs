import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFacts, providerConfig, evaluateFacts, reconcileMoney, ExtractionError, KEY_NAMES, buildTask } from '../src/ai/extraction.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try { loadEnvFile(resolve(root, '.env')); }
catch (error) {
  if (error.code !== 'ENOENT') { console.error('Cannot load .env; check its syntax. Contents were not logged.'); process.exit(1); }
}

const args = process.argv.slice(2);
const options = { providers: Object.keys(KEY_NAMES), cases: ['C01', 'C07', 'C13'], dryRun: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') options.dryRun = true;
  else if (args[i] === '--providers' && args[i + 1]) options.providers = args[++i].split(',');
  else if (args[i] === '--cases' && args[i + 1]) options.cases = args[++i].split(',');
  else { console.error('Usage: node scripts/smoke-ai.mjs [--dry-run] [--providers openai,anthropic,deepseek] [--cases C01,C07,C13]'); process.exit(1); }
}
if (!options.providers.length || new Set(options.providers).size !== options.providers.length ||
    options.providers.some(name => !Object.hasOwn(KEY_NAMES, name)) ||
    !options.cases.length || new Set(options.cases).size !== options.cases.length ||
    options.providers.length * options.cases.length > 9) {
  console.error('Invalid selection; each run allows at most 9 API requests.'); process.exit(1);
}
const dataset = JSON.parse(await readFile(resolve(root, 'tests/fixtures/cases.json'), 'utf8'));
if (dataset.synthetic !== true) { console.error('This runner accepts only the synthetic project dataset.'); process.exit(1); }
const cases = options.cases.map(id => dataset.cases.find(item => item.id === id));
if (cases.some(item => !item || item.kind !== 'extraction')) {
  console.error('Only existing extraction scenarios are supported; workflow requires a separate backend test.'); process.exit(1);
}
const configured = [];
for (const provider of options.providers) {
  try { const { model } = providerConfig(provider); configured.push(provider); console.log(`${provider}: configured (${model})`); }
  catch { console.log(`${provider}: missing API key`); }
}
if (!configured.length) { console.error('No configured AI providers.'); process.exit(1); }

for (const item of cases) {
  buildTask({ sources: item.sources, requested_fields: item.expected.facts.map(fact => fact.field) });
}
console.log(`Plan: ${configured.length * cases.length} requests, max 1200 output tokens/request, no automatic retries.`);
if (options.dryRun) { console.log('Dry run: no network requests and no API charges.'); process.exit(0); }

const results = [];
// One in-flight request per provider, providers independent; stop a provider on account/config/limit errors.
await Promise.allSettled(configured.map(async provider => {
  for (const item of cases) {
    try {
      const result = await extractFacts({ provider, sources: item.sources,
        requested_fields: item.expected.facts.map(fact => fact.field) });
      const checks = evaluateFacts(result.output, item.expected.facts);
      let arithmetic = null;
      if (item.id === 'C01' && checks.every(check => check.correct)) {
        const byField = new Map(result.output.facts.map(fact => [fact.field, fact]));
        arithmetic = reconcileMoney(byField.get('declared_total'),
          ['claim_A.amount', 'claim_B.amount', 'claim_C.amount'].map(field => byField.get(field)));
      }
      const arithmeticCorrect = item.id !== 'C01' ||
        (arithmetic?.listed_total_minor === item.expected.computations.listed_total_minor &&
         arithmetic?.difference_minor === item.expected.computations.difference_minor &&
         arithmetic?.currency === item.expected.computations.currency);
      const passed = checks.every(check => check.correct) && arithmeticCorrect;
      results.push({ case_id: item.id, status: passed ? 'pass' : 'mismatch', ...result, checks, arithmetic });
      console.log(`${provider} ${item.id}: ${passed ? 'PASS' : 'MISMATCH'} (${checks.filter(check => check.correct).length}/${checks.length} fields, ${result.elapsed_ms} ms)`);
    } catch (error) {
      const safe = error instanceof ExtractionError ? error : new ExtractionError('LOCAL_ERROR');
      results.push({ case_id: item.id, provider, status: 'error', error_code: safe.code,
        http_status: safe.status, usage: safe.usage, diagnostics: safe.diagnostics ?? null });
      console.log(`${provider} ${item.id}: ${safe.code}${safe.status ? ` HTTP ${safe.status}` : ''}`);
      if (safe.code === 'MISSING_API_KEY' || safe.code === 'HTTP_ERROR') break;
    }
  }
}));

results.sort((a, b) => a.provider.localeCompare(b.provider) || a.case_id.localeCompare(b.case_id));
const report = { created_at: new Date().toISOString(), synthetic: true,
  scope: 'Connection and selected-field extraction smoke test. No lawyer review, workflow validation, or general accuracy estimate.',
  planned_requests: configured.length * cases.length, executed_requests: results.length,
  max_output_tokens_per_request: 1200, results };
let serialized = JSON.stringify(report, null, 2);
// Last line of defence against accidental credential inclusion in generated responses.
for (const [name, value] of Object.entries(process.env)) {
  if (/KEY|TOKEN|PASSWORD|SECRET/.test(name) && typeof value === 'string' && value.length >= 16) {
    serialized = serialized.split(value).join('[REDACTED]');
  }
}
const directory = resolve(root, 'reports/local');
await mkdir(directory, { recursive: true });
const path = resolve(directory, `ai-smoke-${report.created_at.replace(/[:.]/g, '-')}.json`);
await writeFile(path, serialized + '\n', 'utf8');
console.log(`Report: ${path}`);
if (results.length !== report.planned_requests || results.some(result => result.status !== 'pass')) process.exitCode = 1;
