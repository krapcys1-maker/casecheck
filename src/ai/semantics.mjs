// Conservative guards for common extraction mistakes, not a legal assessment.
// Manual corrections are never passed through these AI-only guards.
export function guardCreditorAddress(output, sources, creditorName) {
  const fact = output.facts.find(f => f.field === 'creditor_address');
  if (!fact || fact.type !== 'text') return [];
  const normalize = value => String(value || '').replace(/\s+/gu, ' ').trim();
  const literal = value => normalize(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = normalize(sources.find(s => s.id === fact.source_id)?.text);
  // An address existing in a quote does not establish whose address it is.
  // Accept only an explicit adjacent entity/address pair for the chosen creditor.
  // Other layouts remain unknown for a human to resolve; never use sender proximity.
  const pair = creditorName && new RegExp(`(?:^|[\\s.;])(?:Nadawca|Wierzyciel(?: wskazany w dokumencie)?|Aktualny wierzyciel|Nabywca)\\s*:\\s*${literal(creditorName)}[.,;]?\\s*(?:Adres(?: siedziby| wierzyciela)?\\s*:\\s*)?${literal(fact.text_value)}(?=$|[\\s.;,])`, 'iu');
  if (pair && pair.test(source)) return [];
  Object.assign(fact, { type: 'unknown', text_value: null, boolean_value: null, minor_units: null, currency: null, as_of: null, precision: 'unknown' });
  output.warnings.push('creditor_address: nie potwierdzono przypisania adresu do aktualnego wierzyciela; sprawdź źródło.');
  return [{ field: 'creditor_address', code: 'CREDITOR_ADDRESS_ROLE_UNVERIFIED' }];
}

export function guardClaimSemantics(output, sources) {
  const flags = [];
  const unknown = fact => Object.assign(fact, { type: 'unknown', text_value: null, boolean_value: null,
    minor_units: null, currency: null, as_of: null, precision: 'unknown' });
  for (const fact of output.facts) {
    if (['creditor_name', 'original_creditor'].includes(fact.field) && fact.type === 'text') fact.text_value = fact.text_value.replace(/\s+/gu, ' ').trim();
    if (fact.field === 'security_description' && fact.type === 'text') {
      const quote = (fact.quote || '').replace(/\s+/gu, ' ').trim();
      const source = (sources.find(s => s.id === fact.source_id)?.text || quote).replace(/\s+/gu, ' ');
      // A real provider shortened "brak danych" to "brak", falsely asserting no security.
      // Anchor the guard to the cited statement, not an unrelated missing detail elsewhere.
      const missingLabel = /(?:informacj[ae] o zabezpieczeniu|zabezpieczeni[aeou])\s*:\s*(?:brak (?:danych|informacji)|nieznane|nieczytelne)(?:[.;]|$)/iu;
      const absentInformation = /^(?:brak (?:danych|informacji)|nieznane|nieczytelne)[.!]?$/iu.test(quote) || missingLabel.test(quote) ||
        /^(?:brak(?: zabezpieczenia)?|bez zabezpieczenia)[.!]?$/iu.test(fact.text_value.trim()) && missingLabel.test(source);
      if (absentInformation) { unknown(fact); flags.push({ field: fact.field, code: 'NO_SECURITY_INFORMATION' }); }
    }
    if (fact.field === 'disputed' && fact.type === 'boolean' && fact.boolean_value === false) {
      const quote = (fact.quote || '').replace(/\s+/gu, ' ').trim();
      const source = sources.find(s => s.id === fact.source_id)?.text || quote;
      const affirmative = /(?:^|[.!?:;]\s*)(?:Nie kwestionuj[ęe] (?:tego |całego )?(?:roszczenia|długu|dlugu|zobowiązania)|(?:To )?(?:roszczenie|dług|dlug) (?:nie jest sporn|jest bezsporn)|Nie ma sporu|Uznaj[ęe] (?:to |ten )?(?:roszczenie|dług|dlug) (?:w całości|bez zastrzeżeń))/iu.test(quote);
      // A quotation cropped to the principal must not hide a dispute about interest.
      const remainder = source.replace(/nie\s+kwestionuj[ęe]/giu, '').replace(/nie\s+jest\s+sporn\p{L}*/giu, '').replace(/(?:bezsporn|niesporn)\p{L}*/giu, '');
      const contrary = /kwestionuj[ęe]|kwestionuje|nie\s+uznaj[ęe]|odmawiam|sporn[aeoy]|nie\s+jest\s+prawdą|jeżeli|jeśli|jednak|\bale\b/iu.test(remainder);
      if (!affirmative || contrary) {
        unknown(fact); flags.push({ field: fact.field, code: 'NO_EXPLICIT_NON_DISPUTE_STATEMENT' });
      }
    }
    if (fact.field === 'original_creditor' && fact.type === 'text' &&
      !sources.some(s => /cesj|przelew|naby[łl]|nabyci|pierwotn|poprzedn/iu.test(s.text) &&
        !/(?:do\s+cesji\s+nie\s+doszło|cesj[ai]\s+nie\s+(?:nastąpiła|doszła)|nie\s+było\s+cesji)/iu.test(s.text))) {
      unknown(fact); flags.push({ field: fact.field, code: 'NO_ORIGINAL_CREDITOR_CONTEXT' });
    }
  }
  return flags;
}
