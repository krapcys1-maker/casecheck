import { createHash } from 'node:crypto';
import { buildTask, extractFacts, validateExtraction } from './extraction.mjs';
import { guardClaimSemantics } from './semantics.mjs';

export const RULES_VERSION = 'claim-rules-v2';
const DATE = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{2}\\.\\d{2}\\.\\d{4})';
const AMOUNT = '-?(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:,\\d{2})?';
const CURRENCY = '(?:PLN|EUR|CHF|USD|GBP|CZK|NOK|SEK|DKK|CAD|AUD|zł)';
export function parseMoneyLiteral(value, currency) {
  if (!new RegExp(`^${AMOUNT}$`, 'u').test(value) || !new RegExp(`^${CURRENCY}$`, 'u').test(currency)) return null;
  const cleaned = value.replace(/[ \u00a0\u202f]/gu, ''), [whole, fraction = '00'] = cleaned.replace(/^-/, '').split(',');
  const amount = (BigInt(whole) * 100n + BigInt(fraction)) * (cleaned.startsWith('-') ? -1n : 1n);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return { minor_units: Number(amount), currency: currency === 'zł' ? 'PLN' : currency };
}
export function parseDateLiteral(value) {
  const iso = /^\d{2}\.\d{2}\.\d{4}$/.test(value) ? value.split('.').reverse().join('-') : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
const empty = field => ({ field, type: 'unknown', text_value: null, boolean_value: null, minor_units: null,
  currency: null, as_of: null, precision: 'unknown', source_id: null, quote: null });
const candidate = (field, source, quote, values) => ({ ...empty(field), precision: 'exact', source_id: source.id, quote, ...values });

export function planClaimExtraction(input) {
  const task = buildTask(input).input, found = [], recognized = new Set();
  const joined = task.sources.map(s => s.text).join('\n');
  // Corrections and transfer narratives need interpretation of the whole document.
  const complex = /korekt|zastępuj|sprzeczn|różnic|cesj|poprzedn|przeniósł|naby[łl]|history|histori/iu.test(joined);
  for (const source of task.sources) {
    const lines = source.text.split(/\r?\n/u); let lineNo = 0;
    for (const quote of lines) {
      const line = quote.trim(), key = `${source.id}:${lineNo++}`;
      if (!line || line === 'DANE FIKCYJNE — TEST PROGRAMU — NIE WYSYŁAĆ') { recognized.add(key); continue; }
      let match;
      if ((match = /^(?:Wierzyciel)[:\t]\s*(.{2,150}?)\s*$/u.exec(line))) {
        found.push(candidate('creditor_name', source, quote, { type: 'text', text_value: match[1].replace(/\s+/gu, ' ') })); recognized.add(key);
      } else if ((match = /^(?:Numer umowy|Umowa)[:\t]\s*([\p{L}\d/_.-]{1,100})\s*$/u.exec(line))) {
        found.push(candidate('agreement_number', source, quote, { type: 'text', text_value: match[1] })); recognized.add(key);
      } else if ((match = new RegExp(`^Saldo całkowite na (${DATE}):\\s*(${AMOUNT})\\s+(${CURRENCY})[.]?$`, 'u').exec(line))) {
        const date = parseDateLiteral(match[1]), money = parseMoneyLiteral(match[2], match[3]);
        if (date && money) { found.push(candidate('total_amount', source, quote, { type: 'money', ...money, as_of: date }));
          found.push(candidate('balance_date', source, quote, { type: 'date', text_value: date })); recognized.add(key); }
      }
    }
  }
  const allRecognized = task.sources.every(s => s.text.split(/\r?\n/u).every((_line,i) => recognized.has(`${s.id}:${i}`)));
  const facts = [], methods = [];
  for (const field of task.requested_fields) {
    const values = found.filter(f => f.field === field);
    const unique = new Set(values.map(f => JSON.stringify([f.type, f.text_value, f.minor_units, f.currency, f.as_of])));
    let fact;
    // Never choose between repeated labels; never take an old amount before a correction.
    const occurrenceSafe = field === 'agreement_number' ? (joined.match(/\bumow[ayę]\b/giu) || []).length === values.length :
      ['total_amount', 'balance_date'].includes(field) ? (joined.match(/\bsaldo\b/giu) || []).length === found.filter(f => f.field === 'total_amount').length : true;
    if (!complex && occurrenceSafe && unique.size === 1 && values.length === 1) fact = values[0];
    else if (allRecognized && !values.length) fact = empty(field);
    if (fact) { facts.push(fact); methods.push({ field, method: fact.type === 'unknown' ? 'absent_in_closed_format' : 'explicit_label', version: RULES_VERSION }); }
  }
  return { facts, methods, unresolved: task.requested_fields.filter(f => !facts.some(v => v.field === f)), closed_format: allRecognized };
}

// Literal evidence must support the numeric value, not merely exist somewhere.
export function verifyNumericEvidence(output) {
  const flags = [];
  for (const fact of output.facts) if (fact.type === 'money') {
    const matches = [...(fact.quote || '').matchAll(new RegExp(`(?<![\\d.,-])(${AMOUNT})\\s+(${CURRENCY})(?![A-Z])`, 'gu'))];
    const supported = matches.some(m => { const n = parseMoneyLiteral(m[1], m[2]); return n && n.minor_units === fact.minor_units && n.currency === fact.currency; });
    if (!supported) {
      const { field, source_id, quote } = fact; Object.assign(fact, empty(field), { source_id, quote });
      flags.push({ field, code: 'AMOUNT_NOT_SUPPORTED_BY_QUOTE' });
    }
  }
  return flags;
}

export async function extractClaimFacts(options) {
  const task = buildTask(options), plan = planClaimExtraction(task.input), start = performance.now();
  let result = { output: { facts: [], questions: [], warnings: [] }, model: RULES_VERSION, usage: null, provider: 'local', evidence_repairs: [] };
  if (plan.unresolved.length) result = await (options.extractImpl || extractFacts)({ ...options, requested_fields: plan.unresolved, allowPartial: true });
  const byField = new Map([...result.output.facts, ...plan.facts].map(f => [f.field, f]));
  result.output.facts = task.input.requested_fields.map(f => byField.get(f));
  validateExtraction(result.output, task.input);
  const flags = [...guardClaimSemantics(result.output, task.input.sources), ...verifyNumericEvidence(result.output)];
  result.output.warnings.push(...flags.map(f => `${f.field}: ${f.code}; wymagany przegląd źródła.`));
  return { ...result, semantic_flags: flags, elapsed_ms: Math.round(performance.now() - start), input_sha256: task.input_sha256,
    rules_version: RULES_VERSION, deterministic_fields: plan.methods, llm_fields: plan.unresolved, llm_called: plan.unresolved.length > 0,
    pipeline_sha256: createHash('sha256').update(JSON.stringify({ version: RULES_VERSION, methods: plan.methods, remaining: plan.unresolved, request: result.request_contract_sha256 })).digest('hex') };
}
