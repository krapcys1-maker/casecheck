// Conservative guards for common extraction mistakes, not a legal assessment.
// Manual corrections are never passed through these AI-only guards.
export function guardClaimSemantics(output, sources) {
  const flags = [];
  const unknown = fact => Object.assign(fact, { type: 'unknown', text_value: null, boolean_value: null,
    minor_units: null, currency: null, as_of: null, precision: 'unknown' });
  for (const fact of output.facts) {
    if (['creditor_name', 'original_creditor'].includes(fact.field) && fact.type === 'text') fact.text_value = fact.text_value.replace(/\s+/gu, ' ').trim();
    if (fact.field === 'disputed' && fact.type === 'boolean' && fact.boolean_value === false &&
      !/(?:nie\s+kwestionuj[ęe]|nie\s+jest\s+sporn|nie\s+ma\s+sporu|bezsporn|niesporn|uznaj[ęe]\s+(?:to\s+)?(?:roszczenie|dług|dlug))/iu.test(fact.quote || '')) {
      unknown(fact); flags.push({ field: fact.field, code: 'NO_EXPLICIT_NON_DISPUTE_STATEMENT' });
    }
    if (fact.field === 'original_creditor' && fact.type === 'text' &&
      !sources.some(s => /cesj|przelew|naby[łl]|nabyci|pierwotn|poprzedn/iu.test(s.text))) {
      unknown(fact); flags.push({ field: fact.field, code: 'NO_ORIGINAL_CREDITOR_CONTEXT' });
    }
  }
  return flags;
}
