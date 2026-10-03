import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Conservative peak, cache-miss USD/1M rates verified 2026-10-03:
// https://api-docs.deepseek.com/quick_start/pricing/
const INPUT = 0.3, OUTPUT = 1.2;
const fail = code => { const error = new Error(code); error.code = code; throw error; };
export class Spend {
  constructor(env = process.env) {
    this.limit = Math.floor(Number(env.CASECHECK_AI_USD_LIMIT ?? 0) * 1e6);
    if (!Number.isSafeInteger(this.limit) || this.limit < 0 || this.limit > 10e6) fail('AI_BUDGET_CONFIG');
    const path = env.CASECHECK_AI_BUDGET_PATH || resolve('data/local/ai-spend.sqlite');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path); chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS spend(id TEXT PRIMARY KEY, at TEXT NOT NULL, upper_micros INTEGER NOT NULL,
        charged_micros INTEGER NOT NULL, status TEXT NOT NULL);`);
  }
  state() {
    const used = this.db.prepare('SELECT COALESCE(SUM(charged_micros),0) n FROM spend').get().n;
    return { limit_usd: this.limit / 1e6, accounted_usd: used / 1e6, remaining_usd: Math.max(0, this.limit - used) / 1e6,
      pricing: 'peak-cache-miss-upper-bound-2026-10-03' };
  }
  reserve(body) {
    if (body.model !== 'deepseek-flash') fail('MODEL_DISABLED');
    let images = 0;
    const content = JSON.stringify(body, (key, value) => {
      if (typeof value === 'string' && value.startsWith('data:image/')) { images++; return '[image]'; } return value;
    });
    if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 6000 || images > 5 || Buffer.byteLength(content) > 512000) fail('AI_REQUEST_LIMIT');
    // Two tokens per UTF-8 byte plus protocol slack; every image has <=1024 tokens.
    const upper = Math.ceil((Buffer.byteLength(content) * 2 + 8192 + images * 1024) * INPUT + body.max_tokens * OUTPUT);
    const id = randomUUID(); this.db.exec('BEGIN IMMEDIATE');
    try {
      if (Math.round(this.state().remaining_usd * 1e6) < upper) fail('AI_COST_LIMIT');
      this.db.prepare('INSERT INTO spend VALUES(?,?,?,?,?)').run(id, new Date().toISOString(), upper, upper, 'reserved');
      this.db.exec('COMMIT'); return id;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  settle(id, usage) {
    const input = usage?.prompt_tokens, output = usage?.completion_tokens;
    // Missing usage, errors and interrupted requests retain the full reservation.
    if (![input, output].every(n => Number.isSafeInteger(n) && n >= 0)) return;
    const cost = Math.ceil(input * INPUT + output * OUTPUT);
    const row = this.db.prepare('SELECT upper_micros,status FROM spend WHERE id=?').get(id);
    if (!row || row.status !== 'reserved') return;
    if (cost > row.upper_micros) {
      this.db.prepare("UPDATE spend SET charged_micros=?,status='unexpected_usage' WHERE id=?").run(Math.max(cost, this.limit), id);
      return;
    }
    this.db.prepare("UPDATE spend SET charged_micros=?,status='accounted' WHERE id=?").run(cost, id);
  }
  close() { this.db.close(); }
}

export async function fetchAI(url, options, env, fetchImpl = fetch) {
  if (url !== 'https://api.deepseek.com/chat/completions') fail('PROVIDER_DISABLED');
  const body = JSON.parse(options.body);
  if (body.model !== 'deepseek-flash') fail('MODEL_DISABLED');
  // Explicit test doubles are not network calls. Production callers use native fetch.
  if (fetchImpl !== fetch) return fetchImpl(url, options);
  const spend = new Spend(env); let id;
  try {
    id = spend.reserve(body);
    const response = await fetchImpl(url, options);
    if (!response.ok) return response;
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break;
      length += part.value.length; if (length > 2 * 1024 * 1024) fail('AI_RESPONSE_LIMIT'); chunks.push(Buffer.from(part.value)); }
    } catch (error) { await reader.cancel(); throw error; }
    const raw = Buffer.concat(chunks);
    let parsed; try { parsed = JSON.parse(raw.toString('utf8')); } catch { return new Response(raw, { status: response.status }); }
    spend.settle(id, parsed.usage);
    return new Response(raw, { status: response.status, headers: { 'Content-Type': 'application/json' } });
  } finally { spend.close(); }
}
