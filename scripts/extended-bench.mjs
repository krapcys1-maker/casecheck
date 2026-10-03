import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync, appendFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { buildTask, createRequest, extractFacts, PROMPT_VERSION } from '../src/ai/extraction.mjs';
import { guardClaimSemantics } from '../src/ai/semantics.mjs';
import { extractClaimFacts, planClaimExtraction } from '../src/ai/hybrid.mjs';
import { saveFile, readDocument } from '../src/app/files.mjs';
import { root } from '../src/app/domain.mjs';
import { sha, reserveCost, prices, scoreExtended, summarizeExtended } from '../src/ai/extended-bench.mjs';

const args = process.argv.slice(2), options = { split: 'dev', run: false, label: 'baseline', limit: 100, hybrid: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--run') options.run = true;
  else if (args[i] === '--hybrid') options.hybrid = true;
  else if (args[i] === '--dry-run') options.run = false;
  else if (['--split', '--label', '--limit'].includes(args[i]) && args[i+1]) options[args[i].slice(2)] = args[++i];
  else throw new Error('Usage: --run|--dry-run --split dev|holdout --label NAME --limit 1..100');
}
options.limit = Number(options.limit);
if (!['dev', 'holdout'].includes(options.split) || !/^[a-z0-9-]{1,40}$/.test(options.label) || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error('INVALID_OPTIONS');
const corpusPath = resolve(root, 'tests/extended-fixtures'), corpusBytes = readFileSync(resolve(corpusPath, 'cases.json'));
const corpus = JSON.parse(corpusBytes); if (corpus.synthetic !== true) throw new Error('SYNTHETIC_ONLY');
const selected = corpus.cases.filter(c => c.split === options.split).slice(0, options.limit);
const directory = resolve(root, 'data/local/extended-bench'), runDir = resolve(directory, `${options.label}-${options.split}`);
const config = { provider: 'deepseek', key: 'REDACTED', model: 'deepseek-flash' };
const tasks = selected.map(c => {
  const bytes = readFileSync(resolve(corpusPath, c.source_path)); if (sha(bytes) !== c.source_sha256) throw new Error('CORPUS_CHANGED');
  const task = buildTask({ sources: [{ id: c.id, kind: 'document', page: 1, text: bytes.toString('utf8') }], requested_fields: corpus.fields });
  const remaining = options.hybrid ? planClaimExtraction(task.input).unresolved : corpus.fields;
  const apiTask = remaining.length ? buildTask({ sources: task.input.sources, requested_fields: remaining }) : null;
  return { ...c, bytes, reservation: apiTask ? reserveCost(createRequest(config, apiTask, 2000).body) : 0 };
});
console.log(JSON.stringify({ split: options.split, requests: tasks.length, model: config.model, prompt: PROMPT_VERSION,
  max_reserved_usd: tasks.reduce((s,t) => s+t.reservation, 0), cumulative_cap_usd: 3, concurrency: 3, hybrid: options.hybrid, mode: options.run ? 'paid' : 'dry-run' }));
if (!options.run) process.exit(0);
try { loadEnvFile(resolve(root, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('MISSING_API_KEY');
mkdirSync(runDir, { recursive: true, mode: 0o700 });
const lockPath = resolve(directory, 'runner.lock');
const lock = openSync(lockPath, 'wx', 0o600); writeFileSync(lock, String(process.pid));
const ledgerPath = resolve(directory, 'reservations.jsonl');
const readLedger = () => existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const runKey = `${options.label}-${options.split}`;
const contract = { schema: 'casecheck-extended-eval-v1', run_key: runKey, dataset_sha256: sha(corpusBytes), prompt: PROMPT_VERSION,
  code_sha256: sha(['src/ai/extraction.mjs', 'src/ai/evidence.mjs', 'src/ai/semantics.mjs', 'src/ai/normalization.mjs', 'src/ai/hybrid.mjs', 'src/ai/extended-bench.mjs', 'scripts/extended-bench.mjs'].map(p => readFileSync(resolve(root,p), 'utf8').replaceAll('\r\n', '\n')).join('\n')),
  model: 'deepseek-flash', fields: corpus.fields, ids: tasks.map(t => t.id), hybrid: options.hybrid, prices, cap_usd: 3 };
let stop = false, index = 0;
try {
  const manifestPath = resolve(runDir, 'manifest.json');
  if (existsSync(manifestPath) && readFileSync(manifestPath, 'utf8') !== JSON.stringify(contract, null, 2) + '\n') throw new Error('RUN_CONTRACT_CHANGED_USE_NEW_LABEL');
  writeFileSync(manifestPath, JSON.stringify(contract, null, 2) + '\n', { mode: 0o600 });
  async function worker() {
    while (!stop && index < tasks.length) {
      const t = tasks[index++], path = resolve(runDir, `${t.id}.json`);
      if (existsSync(path)) continue;
      const ledger = readLedger();
      // Reserved-but-unfinished calls never retry automatically, even after a crash.
      if (ledger.some(r => r.run === runKey && r.id === t.id)) {
        writeFileSync(path, JSON.stringify({ id: t.id, family: t.family, error: 'INTERRUPTED_NO_RETRY', checks: scoreExtended([], t.expected, 'INTERRUPTED_NO_RETRY') })); continue;
      }
      if (ledger.reduce((s,r) => s + r.reserved_usd, 0) + t.reservation > 3 || ledger.length >= 400) { stop = true; console.log('BUDGET_LIMIT'); break; }
      // Use the production UTF-8 reader, including its limits and validation.
      const document = saveFile(runDir, t.bytes, `${t.id}.txt`), parsed = await readDocument(runDir, document);
      const sources = parsed.pages.map(p => ({ id: t.id, kind: 'document', page: p.page, text: p.text }));
      // Recheck after awaiting the parser, before the synchronous reservation.
      const current = readLedger();
      if (current.reduce((s,r) => s + r.reserved_usd, 0) + t.reservation > 3 || current.length >= 400) { stop = true; break; }
      appendFileSync(ledgerPath, JSON.stringify({ run: runKey, id: t.id, reserved_usd: t.reservation, at: new Date().toISOString() }) + '\n', { mode: 0o600, flush: true });
      const started = performance.now(); let result, error = null;
      const fetchCapture = async (url, init) => {
        const response = await fetch(url, init);
        // Only successful responses to this synthetic corpus; never request headers or error bodies.
        if (response.ok) writeFileSync(resolve(runDir, `${t.id}.response.json`), await response.clone().text(), { mode: 0o600, flush: true });
        return response;
      };
      try {
        result = await (options.hybrid ? extractClaimFacts : extractFacts)({ provider: 'deepseek', sources, requested_fields: corpus.fields,
          env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL: 'deepseek-flash' }, fetchImpl: fetchCapture, maxOutputTokens: 2000, timeoutMs: 60000 });
        result.semantic_flags = [...(result.semantic_flags || []), ...guardClaimSemantics(result.output, sources)];
      } catch (e) {
        error = /^[A-Z_]+$/.test(e.code || '') ? e.code : 'BENCH_ERROR';
        result = { model: e.model, usage: e.usage, diagnostics: e.diagnostics, http_status: e.status };
        if (['HTTP_ERROR', 'MISSING_API_KEY', 'NETWORK_ERROR', 'API_TIMEOUT'].includes(error)) stop = true;
      }
      const record = { id: t.id, split: t.split, family: t.family, source_sha256: t.source_sha256,
        error, elapsed_ms: Math.round(performance.now() - started), ...result, checks: scoreExtended(result.output?.facts, t.expected, error) };
      writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flush: true });
      console.log(`${t.id} ${t.family}: ${error || `${record.checks.filter(c => c.correct).length}/${record.checks.length}`}`);
    }
  }
  const workers = await Promise.allSettled([worker(), worker(), worker()]);
  if (workers.some(w => w.status === 'rejected')) { console.error('LOCAL_WORKER_ERROR'); process.exitCode = 1; }
  const results = tasks.map(t => existsSync(resolve(runDir, `${t.id}.json`)) ? JSON.parse(readFileSync(resolve(runDir, `${t.id}.json`))) :
    { id: t.id, family: t.family, error: 'NOT_EXECUTED', checks: scoreExtended([], t.expected, 'NOT_EXECUTED') });
  const report = { ...contract, generated_at: new Date().toISOString(), synthetic: true,
    annotation: corpus.annotation, scope: corpus.scope, summary: summarizeExtended(results),
    reserved_usd: readLedger().filter(r => r.run === runKey).reduce((s,r) => s+r.reserved_usd, 0), results };
  writeFileSync(resolve(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report.summary));
} finally { closeSync(lock); unlinkSync(lockPath); }
