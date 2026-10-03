// Offline evidence only: no model request, no automatic declaration of human review.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractClaimFacts } from '../src/ai/hybrid.mjs';
import { sha, scoreExtended, summarizeExtended } from '../src/ai/extended-bench.mjs';
const dir = resolve('tests/extended-fixtures');
const corpus = JSON.parse(readFileSync(resolve(dir, 'cases.json')));
const recorded = JSON.parse(readFileSync(resolve(dir, 'responses.json'))).records;
const records = [];
for (const c of corpus.cases) {
  const source = readFileSync(resolve(dir, c.source_path), 'utf8');
  const response = recorded.find(r => r.id === c.id).response;
  const result = await extractClaimFacts({ provider: 'deepseek', sources: [{ id: c.id, kind: 'document', page: 1, text: source }],
    requested_fields: corpus.fields, env: { DEEPSEEK_API_KEY: 'offline-no-network', DEEPSEEK_MODEL: 'deepseek-flash' },
    fetchImpl: async () => { if (!response) throw new Error('MISSING_RECORDED_RESPONSE'); return { ok: true, json: async () => structuredClone(response) }; } });
  records.push({ id: c.id, family: c.family, source, source_sha256: sha(source), output_sha256: sha(JSON.stringify(result.output)),
    facts: result.output.facts, checks: scoreExtended(result.output.facts, c.expected), warnings: result.output.warnings, abstentions: result.field_abstentions });
}
mkdirSync('reports/local/manual-review', { recursive: true });
writeFileSync('reports/local/manual-review/records.json', JSON.stringify({ synthetic: true, api_calls: 0, summary: summarizeExtended(records), records }, null, 2));
const value = f => f.type === 'money' ? `${f.minor_units}/100 ${f.currency} @${f.as_of || '?'} (${f.precision})` : f.type === 'unknown' ? '?' : f.type === 'boolean' ? String(f.boolean_value) : f.text_value;
for (let start = 0; start < records.length; start += 25) {
  writeFileSync(`reports/local/manual-review/batch-${start + 1}.txt`, records.slice(start, start + 25).map(c =>
    `${c.id} ${c.family}\n${c.source}\nODCZYT: ${c.facts.map(f => `${f.field}=${value(f)}`).join('; ')}\n${c.checks.filter(k => !k.correct).length ? 'RÓŻNICA: ' + JSON.stringify(c.checks.filter(k => !k.correct)) : ''}`).join('\n\n'));
}
console.log(JSON.stringify({ documents: records.length, summary: summarizeExtended(records), api_calls: 0 }));
