import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseMoneyLiteral, parseDateLiteral, planClaimExtraction, extractClaimFacts, verifyNumericEvidence } from '../src/ai/hybrid.mjs';
import { completeUnusedNulls, isolateInvalidFacts } from '../src/ai/normalization.mjs';
import { validateExtraction } from '../src/ai/extraction.mjs';
import { Application } from '../src/app/application.mjs';
import { root } from '../src/app/domain.mjs';
import { scoreExtended } from '../src/ai/extended-bench.mjs';
const fields = ['creditor_name', 'agreement_number', 'total_amount', 'balance_date', 'disputed'];
const structured = 'Wierzyciel: Bank Testowy\nUmowa: TEST/12\nSaldo całkowite na 12.09.2026: -12\u00a0345,67 EUR.';
const input = text => ({ sources: [{ id: 's', kind: 'document', text }], requested_fields: fields });

test('money parser preserves sign and cents without floating point or ambiguous notation', () => {
  assert.deepEqual(parseMoneyLiteral('-12\u00a0345,67', 'EUR'), { minor_units: -1234567, currency: 'EUR' });
  assert.deepEqual(parseMoneyLiteral('0,01', 'zł'), { minor_units: 1, currency: 'PLN' });
  for (const n of ['12,345', '1,2', '1 23,45', '1.23', '90071992547409999', 'około 100']) assert.equal(parseMoneyLiteral(n, 'PLN'), null);
  assert.equal(parseMoneyLiteral('100', 'JPY'), null);
  assert.equal(parseDateLiteral('29.02.2024'), '2024-02-29'); assert.equal(parseDateLiteral('29.02.2026'), null);
});
test('closed labelled document extracts without an API, key, or oracle', async () => {
  const result = await extractClaimFacts({ ...input(structured), env: {}, extractImpl: () => { throw new Error('MUST_NOT_CALL_API'); } });
  assert.equal(result.llm_called, false); assert.equal(result.deterministic_fields.length, fields.length);
  assert.equal(result.output.facts.find(f => f.field === 'total_amount').minor_units, -1234567);
  assert.equal(result.output.facts.find(f => f.field === 'disputed').type, 'unknown');
});
test('corrections, duplicate labels and extra narratives cannot use a closed-format shortcut', () => {
  for (const addition of ['\nKorekta: kwota wynosi 200 PLN.', '\nSaldo całkowite na 12.09.2026: 300 PLN.', '\nHistoria: inne saldo.']) {
    const plan = planClaimExtraction(input(structured + addition));
    assert.ok(plan.unresolved.includes('total_amount'));
  }
  assert.ok(planClaimExtraction(input(structured + '\nKlient kwestionuje roszczenie.')).unresolved.includes('disputed'));
  assert.ok(planClaimExtraction(input(structured + '\nUmowa: TEST/13')).unresolved.includes('agreement_number'));
});
test('LLM receives only unresolved fields while retaining full original sources', async () => {
  const task = input(structured + '\nInformacja dodatkowa: nie ustalono stanowiska klienta.');
  const result = await extractClaimFacts({ ...task, extractImpl: async actual => {
    assert.deepEqual(actual.requested_fields, ['disputed']); assert.deepEqual(actual.sources, task.sources);
    return { output: { facts: [{ field: 'disputed', type: 'unknown', text_value: null, boolean_value: null,
      minor_units: null, currency: null, as_of: null, precision: 'unknown', source_id: null, quote: null }], questions: [], warnings: [] } };
  } });
  assert.equal(result.output.facts.length, 5); assert.equal(result.llm_fields.length, 1);
});
test('matching quotation with invented cents/currency becomes unknown', () => {
  for (const values of [{ minor_units: 9999, currency: 'PLN' }, { minor_units: 10000, currency: 'EUR' }]) {
    const fact = { field: 'total_amount', type: 'money', ...values, source_id: 's', quote: 'Saldo: 100,00 PLN.' };
    assert.equal(verifyNumericEvidence({ facts: [fact] }).length, 1); assert.equal(fact.type, 'unknown'); assert.equal(fact.source_id, 's');
  }
});
test('null completion cannot invent missing active values or overwrite conflicting values', () => {
  const fact = { field: 'disputed', type: 'boolean', boolean_value: true, minor_units: 99 };
  completeUnusedNulls({ facts: [fact] }); assert.equal(fact.text_value, null); assert.equal(fact.minor_units, 99);
  const missing = { type: 'money' }; completeUnusedNulls({ facts: [missing] }); assert.equal(Object.hasOwn(missing, 'minor_units'), false);
});
test('one invalid model field becomes unknown while valid evidence survives; malformed envelope still fails', () => {
  const task = input(structured), output = { facts: planClaimExtraction(task).facts, questions: [], warnings: [] };
  const disputed = output.facts.find(f => f.field === 'disputed');
  Object.assign(disputed, { type: 'boolean', boolean_value: null, precision: 'exact', source_id: 's', quote: 'Bank Testowy' });
  const repairs = isolateInvalidFacts(output, task, validateExtraction);
  assert.deepEqual(repairs.map(r => r.field), ['disputed']); assert.equal(disputed.boolean_value, null);
  assert.equal(output.facts.find(f => f.field === 'disputed').type, 'unknown');
  assert.equal(output.facts.find(f => f.field === 'total_amount').minor_units, -1234567);
  assert.equal(isolateInvalidFacts({ ...output, approve: true }, task, validateExtraction), null);
  assert.equal(isolateInvalidFacts({ ...output, facts: output.facts.slice(1) }, task, validateExtraction), null);
});
test('deterministic fields are correct on every development fixture before model evaluation', () => {
  const dir = resolve(root, 'tests/extended-fixtures'), corpus = JSON.parse(readFileSync(resolve(dir, 'cases.json')));
  let known = 0;
  for (const c of corpus.cases.filter(c => c.split === 'dev')) {
    const plan = planClaimExtraction({ sources: [{ id: c.id, text: readFileSync(resolve(dir, c.source_path), 'utf8') }], requested_fields: corpus.fields });
    const expected = Object.fromEntries(plan.facts.map(f => [f.field, c.expected[f.field]]));
    assert.ok(scoreExtended(plan.facts, expected).every(c => c.correct), c.id); known += plan.facts.length;
  }
  assert.ok(known > 200);
});
test('production application stores local extraction pending review with no API budget use', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'casecheck-hybrid-')), app = new Application({ stateDir: dir, env: {}, limit: 0 });
  const actor = { tenant: 'test', id: 'operator', role: 'admin' };
  try {
    let state = app.create(actor, { title: 'Synthetic rules test', track: 'consumer', synthetic: true });
    state = await app.upload(actor, state.id, state.revision, Buffer.from(structured), 'test.txt');
    state = await app.analyze(actor, state.id, { revision: state.revision, kind: 'claim', fields, source_ids: state.sources.map(s => s.id) });
    assert.equal(state.jobs.at(-1).status, 'completed'); assert.equal(state.jobs.at(-1).llm_called, false);
    assert.equal(state.claims.at(-1).review, 'pending'); assert.equal(app.store.budget().remaining, 0);
  } finally { app.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('200 recorded responses replay offline without wrong known values, preserving three review cases', async () => {
  const dir = resolve(root, 'tests/extended-fixtures'), corpus = JSON.parse(readFileSync(resolve(dir, 'cases.json')));
  const records = JSON.parse(readFileSync(resolve(dir, 'responses.json'))).records;
  const abstained = []; let checked = 0;
  for (const c of corpus.cases) {
    const response = records.find(r => r.id === c.id).response; let calls = 0;
    const result = await extractClaimFacts({ provider: 'deepseek', sources: [{ id: c.id, kind: 'document', text: readFileSync(resolve(dir, c.source_path), 'utf8') }],
      requested_fields: corpus.fields, env: { DEEPSEEK_API_KEY: 'offline-no-network', DEEPSEEK_MODEL: 'deepseek-flash' },
      fetchImpl: async () => { calls++; assert.ok(response); return { ok: true, json: async () => structuredClone(response) }; } });
    assert.equal(calls, response ? 1 : 0);
    for (const check of scoreExtended(result.output.facts, c.expected)) {
      checked++; assert.notEqual(check.category, 'incorrect_value', `${c.id}/${check.field}`);
      if (!check.correct) abstained.push(`${c.id}/${check.field}`);
    }
  }
  assert.equal(checked, 1400); assert.deepEqual(abstained, ['E014/disputed', 'E018/disputed', 'E193/disputed']);
});
