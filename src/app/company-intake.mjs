import { uid, requireValue } from './store.mjs';
import { currentFacts, addSource, putFacts } from './domain.mjs';

export function nipInText(value) {
  const matches = [...String(value || '').matchAll(/\bNIP\s*:?\s*(?:PL\s*)?([0-9](?:[ -]?[0-9]){9})(?![ -]?[0-9])/giu)];
  const numbers = [...new Set(matches.map(m => m[1].replace(/[ -]/g, '')))];
  if (numbers.length !== 1) return null;
  const nip = numbers[0], sum = [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((n, w, i) => n + w * Number(nip[i]), 0) % 11;
  return sum < 10 && sum === Number(nip[9]) && !/^(\d)\1{9}$/.test(nip) ? nip : null;
}

export function proposedCompanyNip(state, sourceId) {
  if (state.track !== 'company' || !state.registry_auto) return null;
  const f = currentFacts(state).registration, source = state.sources.find(s => s.id === sourceId);
  if (!f || f.source_id !== sourceId || f.type !== 'text' || f.review === 'rejected' || !['message', 'registry'].includes(source?.kind)) return null;
  const nip = nipInText(f.text_value);
  return nip && nip === nipInText(source?.text) ? nip : null;
}

function addressText(value) {
  if (typeof value === 'string') return value.trim();
  const address = value?.adres;
  if (!address) return null;
  return [address.ulica, [address.nrDomu, address.nrLokalu].filter(Boolean).join('/'),
    address.kodPocztowy, address.miejscowosc, address.kraj].filter(v => typeof v === 'string' && v.trim()).join(' ');
}
export function companyValues(results) {
  const mf = results.find(r => r.kind === 'vat')?.summary;
  const krs = results.find(r => r.kind === 'krs')?.summary;
  const best = krs || mf;
  return { client_name: best.name, address: addressText(krs?.address) || addressText(mf?.address),
    registration: [krs?.form, mf?.nip && `NIP ${mf.nip}`, /^\d{10}$/.test(best.krs || '') && `KRS ${best.krs}`, /^(?:\d{9}|\d{14})$/.test(best.regon || '') && `REGON ${best.regon}`,
      mf?.status_vat && `VAT: ${mf.status_vat}`].filter(Boolean).join('; ') };
}
export function saveCompanyConfirmation(state, actor, now) {
  const candidate = state.company_candidate;
  // Store.update has already advanced data_revision for this atomic confirmation.
  requireValue(candidate?.status === 'ready' && candidate.data_revision + 1 === state.data_revision, 'COMPANY_CANDIDATE_STALE', 409);
  const values = companyValues(candidate.results), existing = currentFacts(state), skipped = [];
  const lines = Object.entries(values).filter(([, v]) => v).map(([key, v]) => `${key}: ${v}`);
  const source = addSource(state, { text: lines.join('\n'), kind: 'registry', title: `MF${candidate.results.some(r => r.kind === 'krs') ? ' + KRS' : ''} — NIP ${candidate.nip}${state.synthetic ? ' (test)' : ''}` });
  const facts = Object.entries(values).filter(([key, value]) => {
    if (!value) return false;
    if (existing[key] && (existing[key].method === 'manual' || existing[key].review === 'confirmed')) { skipped.push(key); return false; }
    return true;
  }).map(([field, value]) => ({ field, type: 'text', text_value: value, boolean_value: null, minor_units: null,
    currency: null, as_of: null, precision: 'exact', source_id: source.id, quote: `${field}: ${value}` }));
  putFacts(state, facts, { method: 'registry', actor: actor.id });
  candidate.status = 'confirmed'; candidate.confirmed_at = now.toISOString(); candidate.skipped_fields = skipped;
  state.registry_checks ||= [];
  state.registry_checks.push(...candidate.results.map(r => ({ ...r, source_id: source.id })));
  state.messages.push({ id: uid(), role: 'assistant', kind: 'service_notice', at: now.toISOString(),
    text: `Potwierdzono firmę: ${values.client_name}. Dane z rejestru zapisano do przeglądu.${skipped.length ? ' Wcześniejsze ręczne lub zatwierdzone wartości zachowano; porównaj je z rejestrem.' : ''}` });
}
