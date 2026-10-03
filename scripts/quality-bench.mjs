import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { Application } from '../src/app/application.mjs';
import { root } from '../src/app/domain.mjs';
import { benchmarkCases, benchmarkFields, benchmarkSource, scoreBenchmark } from '../src/ai/quality-bench.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || args.some(a => !['--run', '--dry-run'].includes(a))) {
  console.error('Usage: node scripts/quality-bench.mjs [--dry-run|--run]'); process.exit(1);
}
const tasks = benchmarkCases();
console.log(`Synthetic PDF benchmark: ${tasks.length} requests, ${tasks.length * benchmarkFields.length} selected field checks; OpenAI only.`);
if (!args.includes('--run')) { console.log('Dry run: no keys required, no API calls. --run is paid and limited to 9 attempts per UTC day.'); process.exit(0); }
try { loadEnvFile(resolve(root, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const app = new Application({ env: process.env, stateDir: resolve(root, 'data/local/quality-bench'), limit: 9 });
const actor = { tenant: '879695a8-6313-4b1c-8c24-fba34e2c1a7', id: 'synthetic-benchmark', name: 'Test inżynierski', role: 'admin' };
const results = [], generatedAt = new Date().toISOString();
try {
  if (app.store.budget().remaining < tasks.length) throw Object.assign(new Error(), { code: 'BENCH_DAILY_LIMIT' });
  for (const task of tasks) {
    let state = app.create(actor, { title: `${task.id} / ${task.variant} / benchmark`, track: 'consumer', synthetic: true });
    state = await app.upload(actor, state.id, state.revision, readFileSync(resolve(root, 'tests/full-fixtures', task.document.pdf_path)), `${task.id}.pdf`);
    if (task.variant !== 'original') state = app.store.update(actor, state.id, state.revision, 'synthetic_benchmark_variant', s => {
      for (const source of s.sources) source.text = benchmarkSource(source.text, task.variant);
    });
    state = app.consent(actor, state.id, { revision: state.revision, accepted: true, provider: 'openai' });
    state = await app.analyze(actor, state.id, { revision: state.revision, kind: 'claim', fields: benchmarkFields,
      source_ids: state.sources.map(s => s.id), provider: 'openai' });
    const job = state.jobs.at(-1);
    const checks = job.status === 'completed' ? scoreBenchmark(state.claims.at(-1).facts, task.expected) : [];
    const passed = job.status === 'completed' && checks.every(c => c.correct);
    results.push({ id: task.id, split: task.split, variant: task.variant, status: passed ? 'pass' : 'mismatch',
      error: job.error || null, checks, model: job.model || null, prompt_version: job.prompt_version || null,
      diagnostics: job.diagnostics || null,
      input_sha256: job.input_sha256, source_pdf_sha256: state.documents[0].sha256,
      elapsed_ms: job.elapsed_ms || null, usage: job.usage || null });
    console.log(`${task.id} ${task.variant}: ${passed ? 'PASS' : 'MISMATCH'} (${checks.filter(c => c.correct).length}/${benchmarkFields.length})`);
    if (['HTTP_ERROR', 'MISSING_API_KEY', 'NETWORK_ERROR', 'API_TIMEOUT'].includes(job.error)) break;
  }
} catch (e) { console.error(/^[A-Z_]+$/.test(e.code || '') ? e.code : 'BENCH_LOCAL_ERROR'); process.exitCode = 1; }
finally { app.close(); }
const checks = results.flatMap(r => r.checks), times = results.map(r => r.elapsed_ms).filter(Number.isFinite).sort((a,b) => a-b);
const report = { schema: 'casecheck-quality-bench-v1', generated_at: generatedAt, synthetic: true,
  annotation_status: 'Engineering annotations; not independent lawyer review. Selected synthetic PDFs; excludes OCR and conversational intake.',
  planned_requests: tasks.length, executed_requests: results.length, planned_fields: tasks.length * benchmarkFields.length,
  checked_fields: checks.length, correct_fields: checks.filter(c => c.correct).length,
  passed_documents: results.filter(r => r.status === 'pass').length,
  median_elapsed_ms: times.length ? times[Math.floor(times.length / 2)] : null, results };
const directory = resolve(root, 'reports/local'); mkdirSync(directory, { recursive: true });
let output = JSON.stringify(report, null, 2);
for (const [key, value] of Object.entries(process.env)) if (/KEY|TOKEN|PASSWORD|SECRET/.test(key) && typeof value === 'string' && value.length >= 16) output = output.split(value).join('[REDACTED]');
const path = resolve(directory, `quality-bench-${generatedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(path, output + '\n'); console.log(`Report: ${path}`);
if (results.length !== tasks.length || results.some(r => r.status !== 'pass')) process.exitCode = 1;
