import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkCases, benchmarkSource, scoreBenchmark } from '../src/ai/quality-bench.mjs';
import { buildTask } from '../src/ai/extraction.mjs';

test('semantic benchmark catches a wrong creditor role despite valid evidence', () => {
  const expected = { original_creditor: { type: 'unknown' }, total_amount: { type: 'money', minor_units: 1900000, currency: 'PLN', precision: 'exact', as_of: '2026-09-30' } };
  const checks = scoreBenchmark([{ field: 'original_creditor', type: 'text', text_value: 'Finanse Testowe Epsilon', quote: 'Finanse Testowe Epsilon' },
    { field: 'total_amount', type: 'money', minor_units: 1900000, currency: 'PLN', precision: 'exact', as_of: '2026-10-01' }], expected);
  assert.ok(checks.every(c => !c.correct));
});
test('benchmark requests exclude answer keys and missing-date variant retains the letter date', () => {
  const tasks = benchmarkCases(); assert.equal(tasks.length, 7); assert.equal(tasks.filter(t => t.split === 'holdout').length, 2);
  const source = benchmarkSource('Miasto, 1 października 2026 r. Stan zobowiązania na dzień 2026-09-30.', 'missing_balance_date');
  assert.match(source, /1 października/); assert.doesNotMatch(source, /2026-09-30/);
  const input = buildTask({ sources: [{ id: 'x', text: source }], requested_fields: ['total_amount'], expected: { total_minor: 6403500 } }).input;
  assert.equal(Object.hasOwn(input, 'expected'), false); assert.doesNotMatch(JSON.stringify(input), /6403500|total_minor/);
});
