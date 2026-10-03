import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');

// A model may change PDF whitespace. Only a unique, character-identical match
// after collapsing whitespace can be anchored back to the ORIGINAL source.
// Digits, punctuation, case and words are never corrected or approximated.
function canonical(text) {
  let value = ''; const starts = [], ends = [];
  for (let i = 0; i < text.length; i++) {
    if (/\s/u.test(text[i])) {
      const first = i; while (i + 1 < text.length && /\s/u.test(text[i + 1])) i++;
      value += ' '; starts.push(first); ends.push(i + 1);
    } else { value += text[i]; starts.push(i); ends.push(i + 1); }
  }
  return { value, starts, ends };
}
export function anchorEvidence(output, sources) {
  if (!Array.isArray(output?.facts)) return [];
  const repairs = [];
  for (const fact of output.facts) {
    if (fact.type === 'unknown' && fact.quote === null && fact.source_id !== null) {
      fact.source_id = null; repairs.push({ field: fact.field, method: 'empty_unknown_reference_removed' }); continue;
    }
    const source = sources.find(s => s.id === fact.source_id);
    if (!source || typeof fact.quote !== 'string' || !fact.quote || source.text.includes(fact.quote)) continue;
    const needle = canonical(fact.quote).value.trim();
    if (needle.length < 12 || !/[\p{L}\p{N}]/u.test(needle)) continue;
    const hay = canonical(source.text), index = hay.value.indexOf(needle);
    if (index < 0 || hay.value.indexOf(needle, index + 1) >= 0) continue;
    const original = source.text.slice(hay.starts[index], hay.ends[index + needle.length - 1]);
    repairs.push({ field: fact.field, source_id: source.id, method: 'unique_whitespace_anchor',
      model_quote_sha256: hash(fact.quote), source_quote_sha256: hash(original) });
    fact.quote = original;
  }
  return repairs;
}
