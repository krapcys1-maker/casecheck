import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { extractFacts, providerConfig, evaluateFacts, reconcileMoney, KEY_NAMES, ExtractionError } from './ai/extraction.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const integerConfig = (value, fallback, min, max) => {
  const number = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error('INVALID_SERVER_CONFIG');
  return number;
};

// One process owns this small persistent counter. Reserve before sending any paid request.
function requestBudget(directory, limit, now) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, 'request-budget.json');
  let state = { day: now().toISOString().slice(0, 10), count: 0 };
  try {
    const text = readFileSync(path, 'utf8');
    if (text.length > 1024) throw new Error('INVALID_BUDGET_STATE');
    state = JSON.parse(text);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.day) || !Number.isSafeInteger(state.count) || state.count < 0) {
      throw new Error('INVALID_BUDGET_STATE');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('INVALID_BUDGET_STATE'); }
  const current = () => {
    const day = now().toISOString().slice(0, 10);
    if (state.day !== day) state = { day, count: 0 };
    return { day: state.day, used: state.count, limit, remaining: Math.max(0, limit - state.count) };
  };
  return {
    current,
    reserve() {
      if (!current().remaining) throw new HttpError(429, 'DAILY_LIMIT');
      const next = { day: state.day, count: state.count + 1 };
      try {
        writeFileSync(path + '.tmp', JSON.stringify(next) + '\n', { mode: 0o600 });
        renameSync(path + '.tmp', path);
      } catch { throw new HttpError(503, 'BUDGET_UNAVAILABLE'); }
      state = next;
    },
  };
}

function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'JSON_REQUIRED');
  }
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > 4096) { settled = true; reject(new HttpError(413, 'BODY_TOO_LARGE')); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'INVALID_JSON')); }
    });
    request.on('error', () => { if (!settled) { settled = true; reject(new HttpError(400, 'REQUEST_ERROR')); } });
    request.on('aborted', () => { if (!settled) { settled = true; reject(new HttpError(400, 'REQUEST_ERROR')); } });
  });
}

export function createCasecheckServer({ env = process.env, extract = extractFacts,
  stateDir = env.CASECHECK_STATE_DIR || resolve(root, 'data/local'), now = () => new Date() } = {}) {
  const token = env.CASECHECK_ACCESS_TOKEN;
  if (typeof token !== 'string' || token.length < 32 || token.length > 256 || /\s/.test(token)) {
    throw new Error('ACCESS_TOKEN_REQUIRED');
  }
  const tokenHash = createHash('sha256').update(token).digest();
  const base = env.CASECHECK_BASE_PATH ?? '/casecheck';
  if (!/^\/[a-zA-Z0-9_-]+$/.test(base)) throw new Error('INVALID_BASE_PATH');
  const origin = env.CASECHECK_PUBLIC_ORIGIN || null;
  if (origin && new URL(origin).origin !== origin) throw new Error('INVALID_PUBLIC_ORIGIN');
  const limit = integerConfig(env.CASECHECK_DAILY_REQUEST_LIMIT, 20, 1, 100);
  const budget = requestBudget(stateDir, limit, now);
  const dataset = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/cases.json'), 'utf8'));
  if (dataset.synthetic !== true) throw new Error('SYNTHETIC_DATASET_REQUIRED');
  const cases = dataset.cases.filter(item => item.kind === 'extraction');
  const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ].map(([path, [file, type]]) => [path, { body: readFileSync(resolve(root, 'web', file)), type }]));
  const secrets = Object.entries(env).filter(([key, value]) => /KEY|TOKEN|PASSWORD|SECRET/i.test(key) &&
    typeof value === 'string' && value.length >= 16).map(([, value]) => value);
  const serialize = object => {
    let text = JSON.stringify(object);
    for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
    return text;
  };
  let active = false;
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000 }, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(serialize(data)); };
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.search) throw new HttpError(400, 'QUERY_NOT_ALLOWED');
      if (url.pathname === base && ['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(308, { Location: base + '/' }); response.end(); return;
      }
      if (!url.pathname.startsWith(base + '/')) throw new HttpError(404, 'NOT_FOUND');
      const path = url.pathname.slice(base.length);
      if (path === '/healthz' && request.method === 'GET') { send(200, { ok: true }); return; }
      if (assets.has(path) && ['GET', 'HEAD'].includes(request.method)) {
        const asset = assets.get(path);
        response.writeHead(200, { 'Content-Type': asset.type });
        response.end(request.method === 'HEAD' ? undefined : asset.body); return;
      }
      if (!path.startsWith('/api/')) throw new HttpError(404, 'NOT_FOUND');
      const auth = request.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ') || auth.length > 300 ||
          !timingSafeEqual(tokenHash, createHash('sha256').update(auth.slice(7)).digest())) {
        throw new HttpError(401, 'UNAUTHORIZED');
      }
      if (request.headers.origin && origin && request.headers.origin !== origin) throw new HttpError(403, 'FOREIGN_ORIGIN');
      if (path === '/api/config' && request.method === 'GET') {
        const providers = Object.keys(KEY_NAMES).flatMap(provider => {
          try { return [{ provider, model: providerConfig(provider, env).model }]; } catch { return []; }
        });
        send(200, { providers, budget: budget.current(), busy: active, synthetic: true }); return;
      }
      if (path === '/api/cases' && request.method === 'GET') {
        send(200, { cases: cases.map(({ id, title, sources, expected }) => ({
          id, title, sources, requested_fields: expected.facts.map(fact => fact.field),
        })) }); return;
      }
      if (path !== '/api/extract' || request.method !== 'POST') throw new HttpError(404, 'NOT_FOUND');
      const input = await readJson(request);
      if (!input || Array.isArray(input) || typeof input !== 'object' ||
          Object.keys(input).length !== 2 || !Object.hasOwn(input, 'provider') || !Object.hasOwn(input, 'case_id') ||
          !Object.hasOwn(KEY_NAMES, input.provider)) throw new HttpError(400, 'INVALID_SELECTION');
      const item = cases.find(item => item.id === input.case_id);
      if (!item) throw new HttpError(400, 'INVALID_CASE');
      try { providerConfig(input.provider, env); } catch { throw new HttpError(503, 'PROVIDER_UNAVAILABLE'); }
      if (active) throw new HttpError(429, 'REQUEST_IN_PROGRESS');
      active = true;
      try {
        budget.reserve();
        const result = await extract({ provider: input.provider, sources: item.sources,
          requested_fields: item.expected.facts.map(fact => fact.field), env, maxOutputTokens: 1200 });
        const checks = evaluateFacts(result.output, item.expected.facts);
        let arithmetic = null;
        if (item.id === 'C01' && checks.every(check => check.correct)) {
          const byField = new Map(result.output.facts.map(fact => [fact.field, fact]));
          arithmetic = reconcileMoney(byField.get('declared_total'),
            ['claim_A.amount', 'claim_B.amount', 'claim_C.amount'].map(field => byField.get(field)));
        }
        send(200, { case_id: item.id, result, checks, arithmetic, budget: budget.current() });
      } finally { active = false; }
    } catch (error) {
      if (response.writableEnded || response.destroyed) return;
      if (error instanceof HttpError) send(error.status, { error: error.code });
      else if (error instanceof ExtractionError) send(502, { error: error.code, budget: budget.current() });
      else send(500, { error: 'SERVER_ERROR' });
    }
  });
  server.maxConnections = 32;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    try { loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('ENV_LOAD_FAILED'); }
    const port = integerConfig(process.env.CASECHECK_PORT, 8860, 1024, 65535);
    const server = createCasecheckServer();
    server.on('error', () => { console.error('CaseCheck: server failed. No configuration values logged.'); process.exit(1); });
    server.listen(port, '127.0.0.1', () => console.log(`CaseCheck listening on loopback port ${port}.`));
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 50000).unref();
    });
  } catch { console.error('CaseCheck: invalid configuration or state. Check deployment instructions.'); process.exit(1); }
}
