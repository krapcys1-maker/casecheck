import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from '../src/app/domain.mjs';
import { extractClaimFacts } from '../src/ai/hybrid.mjs';
import { scoreExtended, summarizeExtended, sha } from '../src/ai/extended-bench.mjs';
const directory = resolve(root, 'data/local/extended-bench'), fixtureDir = resolve(root, 'tests/extended-fixtures');
const corpus = JSON.parse(readFileSync(resolve(fixtureDir, 'cases.json'))), runs = [], replay = [], replayResults = [];
const usage = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
for (const name of ['baseline-dev', 'corrected-dev', 'hybrid-dev', 'final-holdout']) {
  const dir = resolve(directory, name), report = JSON.parse(readFileSync(resolve(dir, 'report.json')));
  const responseFiles = readdirSync(dir).filter(f => f.endsWith('.response.json'));
  for (const path of responseFiles) { const data = JSON.parse(readFileSync(resolve(dir,path))); for (const key of Object.keys(usage)) usage[key] += data.usage?.[key] || 0; }
  runs.push({ name, generated_at: report.generated_at, dataset_sha256: report.dataset_sha256, code_sha256: report.code_sha256,
    prompt: report.prompt, model: report.model, hybrid: report.hybrid || false, summary: report.summary, api_calls: responseFiles.length,
    reserved_usd: report.reserved_usd,
    results: report.results.map(r => ({ id: r.id, family: r.family, error: r.error, correct: r.checks.filter(c => c.correct).length,
      fields: r.checks.length, mismatches: r.checks.filter(c => !c.correct), llm_called: r.llm_called,
      deterministic_fields: r.deterministic_fields, usage: r.usage, elapsed_ms: r.elapsed_ms, input_sha256: r.input_sha256, source_sha256: r.source_sha256 })) });
}
for (const c of corpus.cases) {
  const name = c.split === 'dev' ? 'hybrid-dev' : 'final-holdout';
  const path = resolve(directory, name, `${c.id}.response.json`);
  const response = existsSync(path) ? JSON.parse(readFileSync(path)) : null;
  // No API request identifiers, headers, keys or personal records in the public fixture.
  const safe = response ? { model: response.model, choices: response.choices.map(choice => ({ finish_reason: choice.finish_reason,
    message: { content: choice.message.content } })), usage: response.usage } : null;
  replay.push({ id: c.id, source_sha256: c.source_sha256, response: safe });
  let calls = 0;
  const result = await extractClaimFacts({ provider: 'deepseek', sources: [{ id: c.id, kind: 'document', page: 1, text: readFileSync(resolve(fixtureDir,c.source_path), 'utf8') }],
    requested_fields: corpus.fields, env: { DEEPSEEK_API_KEY: 'offline-replay-no-network', DEEPSEEK_MODEL: 'deepseek-flash' }, maxOutputTokens: 2000,
    fetchImpl: async () => { calls++; if (!safe) throw new Error('REPLAY_MISSING'); return { ok: true, json: async () => structuredClone(safe) }; } });
  if (calls !== (safe ? 1 : 0)) throw new Error('REPLAY_PLAN_CHANGED');
  replayResults.push({ id: c.id, checks: scoreExtended(result.output.facts, c.expected), field_abstentions: result.field_abstentions,
    deterministic_fields: result.deterministic_fields.length, llm_called: result.llm_called });
}
const fixture = { schema: 'casecheck-synthetic-response-replay-v1', synthetic: true,
  notice: 'Recorded synthetic responses. Offline regression only, not new model calls or independent legal annotations.', records: replay };
writeFileSync(resolve(fixtureDir, 'responses.json'), JSON.stringify(fixture, null, 2) + '\n');
const summary = { schema: 'casecheck-extended-evaluation-v1', generated_at: new Date().toISOString(), unique_documents: 200, families: 40,
  scope: corpus.scope, annotation: corpus.annotation, api_calls: runs.reduce((s,r) => s+r.api_calls, 0), document_runs: 400, usage,
  cost: { currency: 'USD', estimated_offpeak_with_cache: (usage.prompt_cache_hit_tokens * .003 + usage.prompt_cache_miss_tokens * .15 + usage.completion_tokens * .6) / 1e6,
    conservative_peak_without_cache: (usage.prompt_tokens * .3 + usage.completion_tokens * 1.2) / 1e6,
    reserved_usd: runs.reduce((s,r) => s+r.reserved_usd,0), cap_usd: 3, tariff_date: '2026-10-03', billing_verified: false,
    pricing_url: 'https://api-docs.deepseek.com/quick_start/pricing/' },
  runs, offline_final_replay: { summary: summarizeExtended(replayResults), response_fixture_sha256: sha(JSON.stringify(fixture)),
    incomplete: replayResults.filter(r => r.checks.some(c => !c.correct)).map(r => ({ id: r.id, checks: r.checks.filter(c => !c.correct) })),
    local_fields: replayResults.reduce((s,r) => s+r.deterministic_fields, 0), local_only_documents: replayResults.filter(r => !r.llm_called).length } };
writeFileSync(resolve(root, 'docs/extended-evaluation-2026-10-03.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ calls: summary.api_calls, cost: summary.cost, final_replay: summary.offline_final_replay }));
