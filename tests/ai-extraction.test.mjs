import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTask, validateExtraction, evaluateFacts, reconcileMoney,
  createRequest, decodeResponse, extractFacts,
} from '../src/ai/extraction.mjs';

const sources = [{ id: 'm1', kind: 'message', text: 'Mam 100,01 PLN długu na 2026-10-01. Nie znam zabezpieczenia.' }];
const field = 'balance';
const moneyFact = () => ({
  field, type: 'money', text_value: null, boolean_value: null,
  minor_units: 10001, currency: 'PLN', as_of: '2026-10-01', precision: 'exact',
  source_id: 'm1', quote: '100,01 PLN',
});
const output = fact => ({ facts: [fact], questions: [], warnings: [] });
const input = { sources, requested_fields: [field] };
const expectCode = code => error => error?.code === code;
const amount = (value, extras = {}) => ({ minor_units: value, currency: 'PLN', as_of: '2026-10-01', precision: 'exact', ...extras });

test('API context excludes fixture expectations and environment values', () => {
  const task = buildTask({ ...input, expected: { secret: 'do-not-send-this' }, api_key: 'private-test-value' });
  assert.deepEqual(Object.keys(task.input).sort(), ['requested_fields', 'sources']);
  assert.ok(!task.user.includes('do-not-send-this'));
  assert.ok(!task.user.includes('private-test-value'));
  assert.equal(task.input_sha256.length, 64);
});

test('valid monetary fact preserves exact minor units and evidence', () => {
  assert.deepEqual(validateExtraction(output(moneyFact()), input).facts[0], moneyFact());
});

test('fabricated quote and source outside the case are rejected', () => {
  assert.throws(() => validateExtraction(output({ ...moneyFact(), quote: '101,00 PLN' }), input), expectCode('INVALID_EVIDENCE'));
  assert.throws(() => validateExtraction(output({ ...moneyFact(), source_id: 'other-case' }), input), expectCode('INVALID_EVIDENCE'));
});

test('floating point amount and unsafe integer are rejected', () => {
  for (const minor_units of [100.01, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateExtraction(output({ ...moneyFact(), minor_units }), input), expectCode('INVALID_VALUE_VARIANT'));
  }
});

test('unknown stays unknown and cannot carry false or zero', () => {
  const fact = { ...moneyFact(), type: 'unknown', minor_units: null, currency: null, as_of: null,
    precision: 'unknown', quote: 'Nie znam zabezpieczenia.' };
  assert.equal(validateExtraction(output(fact), input).facts[0].type, 'unknown');
  assert.throws(() => validateExtraction(output({ ...fact, boolean_value: false }), input), expectCode('INVALID_VALUE_VARIANT'));
  assert.throws(() => validateExtraction(output({ ...fact, minor_units: 0 }), input), expectCode('INVALID_VALUE_VARIANT'));
});

test('new unrequested action, duplicate field and omitted field are rejected', () => {
  assert.throws(() => validateExtraction({ ...output(moneyFact()), approve: true }, input), expectCode('UNEXPECTED_OUTPUT_KEY'));
  assert.throws(() => validateExtraction(output({ ...moneyFact(), field: 'approve' }), input), expectCode('INVALID_OUTPUT_FIELD'));
  assert.throws(() => validateExtraction({ facts: [moneyFact(), moneyFact()], questions: [], warnings: [] }, input), expectCode('INVALID_OUTPUT_FIELD'));
  assert.throws(() => validateExtraction({ facts: [], questions: [], warnings: [] }, input), expectCode('MISSING_REQUESTED_FIELD'));
});

test('invalid calendar date and known value without evidence are rejected', () => {
  assert.throws(() => validateExtraction(output({ ...moneyFact(), as_of: '2026-02-30' }), input), expectCode('INVALID_DATE'));
  assert.throws(() => validateExtraction(output({ ...moneyFact(), source_id: null, quote: null }), input), expectCode('INVALID_VALUE_VARIANT'));
});

test('reconciliation uses integer arithmetic and refuses unlike currency/date/precision', () => {
  assert.deepEqual(reconcileMoney(amount(30), [amount(10), amount(20)]), {
    listed_total_minor: 30, difference_minor: 0, currency: 'PLN',
  });
  assert.deepEqual(reconcileMoney(amount(12000000), [amount(5000000), amount(4000000), amount(2000000)]), {
    listed_total_minor: 11000000, difference_minor: 1000000, currency: 'PLN',
  });
  for (const extras of [{ currency: 'EUR' }, { as_of: '2026-09-30' }, { as_of: null }, { precision: 'approximate' }]) {
    assert.throws(() => reconcileMoney(amount(30), [amount(10, extras)]), expectCode('INCOMPARABLE_AMOUNTS'));
  }
  assert.throws(() => reconcileMoney(amount(Number.MAX_SAFE_INTEGER), [amount(Number.MAX_SAFE_INTEGER), amount(1)]), expectCode('MONEY_OVERFLOW'));
});

test('correct JSON is insufficient when the value is wrong', () => {
  const results = evaluateFacts(output(moneyFact()), [{ field, source_id: 'm1', value: { minor_units: 10002, currency: 'PLN' } }]);
  assert.equal(results[0].correct, false);
});

test('provider requests target official APIs and bound generation', () => {
  const task = buildTask(input);
  const expected = { openai: 'api.openai.com', anthropic: 'api.anthropic.com', deepseek: 'api.deepseek.com' };
  for (const [provider, host] of Object.entries(expected)) {
    const request = createRequest({ provider, key: 'fake-key-for-test', model: 'test-model' }, task);
    assert.equal(new URL(request.url).hostname, host);
    assert.equal(request.body.max_output_tokens ?? request.body.max_tokens, 1200);
    assert.ok(!JSON.stringify(request.body).includes('fake-key-for-test'));
  }
  assert.equal(createRequest({ provider: 'openai', key: 'fake', model: 'test' }, task).body.store, false);
});

test('refusal, truncated output, malformed JSON and unexpected tool are failures', () => {
  assert.throws(() => decodeResponse('openai', { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }), expectCode('MODEL_REFUSAL'));
  assert.throws(() => decodeResponse('openai', { status: 'incomplete' }), expectCode('INCOMPLETE_RESPONSE'));
  assert.throws(() => decodeResponse('deepseek', { choices: [{ finish_reason: 'length' }] }), expectCode('INCOMPLETE_RESPONSE'));
  assert.throws(() => decodeResponse('deepseek', { choices: [{ finish_reason: 'stop', message: { content: '{' } }] }), expectCode('INVALID_JSON'));
  assert.throws(() => decodeResponse('anthropic', { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'send_email' }] }), expectCode('INVALID_TOOL_RESPONSE'));
});

test('HTTP error never includes provider response body or credential in error', async () => {
  let bodyRead = false;
  await assert.rejects(extractFacts({ provider: 'deepseek', ...input,
    env: { DEEPSEEK_API_KEY: 'fake-sensitive-test-key' },
    fetchImpl: async () => ({ ok: false, status: 401, json() { bodyRead = true; return { message: 'fake-sensitive-test-key' }; } }),
  }), error => error.code === 'HTTP_ERROR' && error.status === 401 && !String(error).includes('fake-sensitive'));
  assert.equal(bodyRead, false);
});

test('successful request returns validated facts and usage without credentials', async () => {
  const result = await extractFacts({ provider: 'deepseek', ...input,
    env: { DEEPSEEK_API_KEY: 'fake-sensitive-test-key' },
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      return { ok: true, json: async () => ({ status: 'completed', model: 'test-model', usage: { input_tokens: 100, output_tokens: 50 },
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output(moneyFact())) } }] }) };
    },
  });
  assert.equal(result.output.facts[0].minor_units, 10001);
  assert.equal(result.usage.input_tokens, 100);
  assert.ok(!JSON.stringify(result).includes('fake-sensitive-test-key'));
});

test('transport failure yields a safe code, without implicit retries', async () => {
  let attempts = 0;
  await assert.rejects(extractFacts({ provider: 'deepseek', ...input,
    env: { DEEPSEEK_API_KEY: 'fake' }, fetchImpl: async () => {
      attempts++; const error = new Error('unsafe network details'); error.name = 'TimeoutError'; throw error;
    },
  }), expectCode('API_TIMEOUT'));
  assert.equal(attempts, 1);
});
