import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from '../src/app/domain.mjs';
import { buildTask, createRequest } from '../src/ai/extraction.mjs';
import { sha, reserveCost, scoreExtended, summarizeExtended } from '../src/ai/extended-bench.mjs';

test('200 traceable fixtures separate development and holdout by semantic family', () => {
  const directory = resolve(root, 'tests/extended-fixtures');
  const corpus = JSON.parse(readFileSync(resolve(directory, 'cases.json')));
  assert.equal(corpus.synthetic, true); assert.equal(corpus.cases.length, 200);
  assert.equal(new Set(corpus.cases.map(c => c.id)).size, 200);
  const dev = new Set(corpus.cases.filter(c => c.split === 'dev').map(c => c.family));
  const holdout = new Set(corpus.cases.filter(c => c.split === 'holdout').map(c => c.family));
  assert.equal(dev.size, 20); assert.equal(holdout.size, 20);
  assert.equal([...holdout].some(f => dev.has(f)), false);
  for (const c of corpus.cases) {
    const bytes = readFileSync(resolve(directory, c.source_path));
    assert.equal(sha(bytes), c.source_sha256);
    assert.match(bytes.toString('utf8'), /DANE FIKCYJNE/);
    assert.deepEqual(Object.keys(c.expected), corpus.fields);
    const task = buildTask({ sources: [{ id: c.id, text: bytes.toString('utf8'), expected: c.expected }], requested_fields: corpus.fields, expected: c.expected });
    assert.equal(Object.hasOwn(task.input.sources[0], 'expected'), false);
    assert.equal(Object.hasOwn(task.input, 'expected'), false);
  }
});
test('budget reserves full non-cached peak price before any request', () => {
  const task = buildTask({ sources: [{ id: 's', text: 'Źródło: żółć, 1000 PLN.' }], requested_fields: ['total_amount'] });
  const body = createRequest({ provider: 'deepseek', model: 'deepseek-flash', key: 'fake' }, task, 2000).body;
  const cost = reserveCost(body);
  assert.ok(cost >= (Buffer.byteLength(JSON.stringify(body)) * .3 + 2000 * 1.2) / 1e6);
  assert.throws(() => reserveCost({ ...body, model: 'another-model' }));
  assert.throws(() => reserveCost({ ...body, thinking: { type: 'enabled' } }));
  assert.throws(() => reserveCost({ ...body, max_tokens: 2001 }));
});
test('scoring keeps blocked and wrong known values in the denominator', () => {
  const expected = { disputed: { type: 'unknown' }, total_amount: { type: 'money', minor_units: 1000 } };
  const blocked = scoreExtended([], expected, 'INVALID_EVIDENCE');
  const wrong = scoreExtended([{ field: 'disputed', type: 'boolean', boolean_value: false }, { field: 'total_amount', type: 'unknown' }], expected);
  const summary = summarizeExtended([{ error: 'INVALID_EVIDENCE', checks: blocked }, { checks: wrong }]);
  assert.equal(summary.fields, 4); assert.equal(summary.correct, 0);
  assert.equal(summary.blocked_fields, 2); assert.equal(summary.abstained, 1); assert.equal(summary.incorrect_value, 1);
  assert.equal(summary.complete_documents, 0);
});
