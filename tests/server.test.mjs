import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createCasecheckServer } from '../src/server.mjs';
import { ExtractionError } from '../src/ai/extraction.mjs';

const token = 'synthetic-panel-password-for-local-tests-only';
const apiKey = 'synthetic-provider-key-for-local-tests-only';
const dataset = JSON.parse(readFileSync(new URL('./fixtures/cases.json', import.meta.url), 'utf8'));
const unknown = dataset.cases.find(item => item.id === 'C07').expected.facts[0];
const result = () => ({ provider: 'openai', model: 'test-model', elapsed_ms: 1, prompt_version: 'test',
  output: { facts: [{ field: unknown.field, type: 'unknown', text_value: null, boolean_value: null,
    minor_units: null, currency: null, as_of: null, precision: 'unknown',
    source_id: unknown.source_id, quote: unknown.quote ?? null }], questions: [], warnings: [] } });

async function app(t, options = {}) {
  const directory = options.stateDir ?? mkdtempSync(join(tmpdir(), 'casecheck-test-'));
  if (!options.stateDir) t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { CASECHECK_ACCESS_TOKEN: token, CASECHECK_PUBLIC_ORIGIN: 'https://casecheck.example',
    OPENAI_API_KEY: apiKey, ...options.env };
  const server = createCasecheckServer({ extract: async () => result(), ...options, env, stateDir: directory });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/casecheck`;
  const close = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  t.after(close);
  return { server, directory, close, base, request: (path, init = {}) => fetch(base + path, {
    ...init, headers: { Authorization: 'Bearer ' + token, ...init.headers },
  }) };
}
const post = (body, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const selection = { provider: 'openai', case_id: 'C07' };

test('startup requires a strong token and refuses corrupt persistent budget', () => {
  assert.throws(() => createCasecheckServer({ env: {} }), /ACCESS_TOKEN_REQUIRED/);
  const directory = mkdtempSync(join(tmpdir(), 'casecheck-bad-state-'));
  try {
    writeFileSync(join(directory, 'request-budget.json'), '{broken');
    assert.throws(() => createCasecheckServer({ env: { CASECHECK_ACCESS_TOKEN: token }, stateDir: directory }), /INVALID_BUDGET_STATE/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('public health and login shell do not expose provider keys or private files', async t => {
  const { base } = await app(t);
  const health = await fetch(base + '/healthz');
  assert.deepEqual(await health.json(), { ok: true });
  const page = await fetch(base + '/');
  const html = await page.text();
  assert.equal(page.status, 200); assert.ok(html.includes('CaseCheck'));
  assert.ok(!html.includes(token) && !html.includes(apiKey));
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/src/server.mjs')).status, 404);
});

test('API requires authorization and rejects credential query strings', async t => {
  const { base, request } = await app(t);
  assert.equal((await fetch(base + '/api/config')).status, 401);
  assert.equal((await request('/api/config', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await request('/api/config?password=' + token)).status, 400);
  const config = await request('/api/config');
  const text = await config.text();
  assert.ok(!text.includes(token) && !text.includes(apiKey));
  assert.equal(JSON.parse(text).providers[0].provider, 'openai');
});

test('only built-in extraction cases are exposed without expected answers', async t => {
  const { request } = await app(t);
  const data = await (await request('/api/cases')).json();
  assert.equal(data.cases.length, 14);
  assert.ok(data.cases.every(item => !Object.hasOwn(item, 'expected')));
});

test('external text, foreign origin, malformed JSON and oversized body cannot trigger AI', async t => {
  let calls = 0;
  const { request } = await app(t, { extract: async () => { calls++; return result(); } });
  assert.equal((await request('/api/extract', post({ ...selection, sources: [{ text: 'real data' }] }))).status, 400);
  assert.equal((await request('/api/extract', post({ ...selection, case_id: 'C15' }))).status, 400);
  assert.equal((await request('/api/extract', post(selection, { Origin: 'https://foreign.example' }))).status, 403);
  assert.equal((await request('/api/extract', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await request('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await request('/api/extract', post({ ...selection, text: 'a'.repeat(5000) }))).status, 413);
  assert.equal(calls, 0);
});

test('successful extraction whitelists inputs and consumes a persistent daily reservation', async t => {
  let task;
  const first = await app(t, { env: { CASECHECK_DAILY_REQUEST_LIMIT: '1' }, extract: async input => { task = input; return result(); } });
  const response = await first.request('/api/extract', post(selection));
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.checks[0].correct, true);
  assert.equal(data.budget.used, 1); assert.equal(data.budget.remaining, 0);
  assert.equal(task.maxOutputTokens, 1200); assert.ok(!Object.hasOwn(task, 'expected'));
  assert.equal((await first.request('/api/extract', post(selection))).status, 429);
  await first.close();
  const restarted = await app(t, { stateDir: first.directory, env: { CASECHECK_DAILY_REQUEST_LIMIT: '1' } });
  assert.equal((await restarted.request('/api/extract', post(selection))).status, 429);
});

test('a provider failure consumes a reservation and never sends sensitive diagnostics', async t => {
  const { request } = await app(t, { extract: async () => { throw new ExtractionError('HTTP_ERROR', { status: 403, diagnostics: { key: apiKey } }); } });
  const response = await request('/api/extract', post(selection));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.ok(!text.includes(apiKey)); assert.equal(JSON.parse(text).budget.used, 1);
});

test('only one paid request can be in flight and a new UTC day resets the allowance', async t => {
  let release;
  let notify;
  const started = new Promise(resolve => { notify = resolve; });
  let time = new Date('2026-10-02T23:59:00Z');
  const { request } = await app(t, { env: { CASECHECK_DAILY_REQUEST_LIMIT: '1' }, now: () => time,
    extract: async () => { notify(); await new Promise(resolve => { release = resolve; }); return result(); } });
  const pending = request('/api/extract', post(selection));
  await started;
  assert.equal((await request('/api/extract', post(selection))).status, 429);
  release(); assert.equal((await pending).status, 200);
  time = new Date('2026-10-03T00:01:00Z');
  const config = await (await request('/api/config')).json();
  assert.equal(config.budget.used, 0); assert.equal(config.budget.remaining, 1);
});
