import { createHash } from 'node:crypto';
import { scoreBenchmark } from './quality-bench.mjs';
export const sha = value => createHash('sha256').update(value).digest('hex');
// Peak, cache-miss prices on 2026-10-03, USD / 1M tokens. Reserve using UTF-8
// bytes (a conservative text token bound), plus an extra 1024 framing tokens.
export const prices = Object.freeze({ input: 0.3, output: 1.2, checked: '2026-10-03', url: 'https://api-docs.deepseek.com/quick_start/pricing/' });
export function reserveCost(requestBody) {
  if (requestBody.model !== 'deepseek-flash' || requestBody.thinking?.type !== 'disabled' || !Number.isInteger(requestBody.max_tokens) || requestBody.max_tokens < 1 || requestBody.max_tokens > 2000) throw new Error('UNBOUNDED_REQUEST');
  return ((Buffer.byteLength(JSON.stringify(requestBody), 'utf8') + 1024) * prices.input + requestBody.max_tokens * prices.output) / 1e6;
}
export function scoreExtended(facts, expected, error = null) {
  return scoreBenchmark(facts || [], expected).map(check => ({ ...check,
    category: error ? 'blocked' : check.correct ? 'correct' : check.actual?.type === 'unknown' ? 'abstained' : 'incorrect_value' }));
}
export function summarizeExtended(results) {
  const checks = results.flatMap(r => r.checks), times = results.map(r => r.elapsed_ms).filter(Number.isFinite).sort((a,b) => a-b);
  const by_field = {};
  for (const c of checks) { const s = by_field[c.field] ||= { total: 0, correct: 0, abstained: 0, incorrect_value: 0, blocked: 0 }; s.total++; s[c.category]++; }
  return { documents: results.length, fields: checks.length, correct: checks.filter(c => c.correct).length,
    abstained: checks.filter(c => c.category === 'abstained').length,
    incorrect_value: checks.filter(c => c.category === 'incorrect_value').length,
    blocked_fields: checks.filter(c => c.category === 'blocked').length,
    complete_documents: results.filter(r => r.checks.every(c => c.correct)).length,
    blocked_documents: results.filter(r => r.error).length,
    median_ms: times[Math.floor(times.length * .5)] ?? null, p95_ms: times[Math.min(times.length - 1, Math.ceil(times.length * .95) - 1)] ?? null,
    usage: results.reduce((s,r) => ({ input: s.input + (r.usage?.prompt_tokens || 0), output: s.output + (r.usage?.completion_tokens || 0) }), { input: 0, output: 0 }), by_field };
}
