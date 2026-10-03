// Complete only fields which the selected type requires to be null. Never infer
// a value, precision, field name, source or quote; the strict validator still runs.
export function completeUnusedNulls(output) {
  const repairs = [];
  const unused = { money: ['text_value', 'boolean_value'], text: ['boolean_value', 'minor_units', 'currency', 'as_of'],
    date: ['boolean_value', 'minor_units', 'currency', 'as_of'], boolean: ['text_value', 'minor_units', 'currency', 'as_of'],
    unknown: ['text_value', 'boolean_value', 'minor_units', 'currency', 'as_of'] };
  if (!Array.isArray(output?.facts)) return repairs;
  for (const fact of output.facts) for (const key of unused[fact?.type] || []) if (!Object.hasOwn(fact, key)) {
    fact[key] = null; repairs.push({ field: fact.field, key, method: 'unused_null' });
  }
  return repairs;
}

export function isolateInvalidFacts(output, input, validate) {
  if (!Array.isArray(output?.facts)) return null;
  const empty = field => ({ field, type: 'unknown', text_value: null, boolean_value: null, minor_units: null,
    currency: null, as_of: null, precision: 'unknown', source_id: null, quote: null });
  // Validate the envelope and the exact field set first. Extra fields, duplicate
  // fields or missing requested fields remain whole-response failures.
  try { validate({ ...output, facts: output.facts.map(f => empty(f?.field)) }, input); } catch { return null; }
  const repairs = [];
  const facts = output.facts.map(f => {
    try { validate({ facts: [f], questions: [], warnings: [] }, { ...input, requested_fields: [f.field] }); return f; }
    catch (error) {
      repairs.push({ field: f.field, method: 'invalid_field_abstention', code: error.code });
      const replacement = empty(f.field), source = input.sources.find(s => s.id === f.source_id);
      if (source && typeof f.quote === 'string' && f.quote && source.text.includes(f.quote)) Object.assign(replacement, { source_id: f.source_id, quote: f.quote });
      return replacement;
    }
  });
  if (!repairs.length) return null;
  output.facts = facts;
  output.warnings.push(...repairs.map(r => `${r.field}: wadliwy odczyt pola; wartość nieznana, wymagany przegląd źródła.`));
  validate(output, input);
  return repairs;
}
