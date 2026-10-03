import { requireValue, AppError, validDate } from './store.mjs';

export async function registryLookup({ kind, identifier, date, test = false }, fetchImpl = fetch) {
  requireValue(['krs', 'vat'].includes(kind) && typeof identifier === 'string' && /^\d{10}$/.test(identifier), 'INVALID_REGISTRY_QUERY');
  requireValue(validDate(date), 'INVALID_DATE');
  const url = kind === 'krs' ? `https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${identifier}?rejestr=P&format=json`
    : `https://${test ? 'wl-test' : 'wl-api'}.mf.gov.pl/api/search/nip/${identifier}?date=${date}`;
  let response;
  try { response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } }); }
  catch { throw new AppError(502, 'REGISTRY_UNAVAILABLE'); }
  requireValue(response.ok, response.status === 404 ? 'REGISTRY_NOT_FOUND' : 'REGISTRY_UNAVAILABLE', response.status === 404 ? 404 : 502);
  const reader = response.body.getReader(), parts = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      requireValue(size <= 2 * 1024 * 1024, 'REGISTRY_RESPONSE_LIMIT', 502); parts.push(Buffer.from(value)); }
  } catch (error) { await reader.cancel(); throw error; }
  let data; try { data = JSON.parse(Buffer.concat(parts).toString()); } catch { throw new AppError(502, 'REGISTRY_INVALID_RESPONSE'); }
  let summary;
  if (kind === 'vat') {
    const subject = data.result?.subject; requireValue(subject, 'REGISTRY_NOT_FOUND', 404);
    summary = { name: subject.name, nip: subject.nip, regon: subject.regon, krs: subject.krs,
      status_vat: subject.statusVat, address: subject.workingAddress || subject.residenceAddress, request_id: data.result.requestId, as_of: date };
  } else {
    const record = data.odpis, entity = record?.dane?.dzial1?.danePodmiotu; requireValue(entity, 'REGISTRY_INVALID_RESPONSE', 502);
    summary = { name: entity.nazwa, nip: entity.identyfikatory?.nip, regon: entity.identyfikatory?.regon,
      krs: record.naglowekA?.numerKRS || identifier, form: entity.formaPrawna, address: record.dane.dzial1.siedzibaIAdres,
      as_of: record.naglowekA?.stanZDnia || 'odpis aktualny w chwili pobrania' };
  }
  requireValue(typeof summary.name === 'string', 'REGISTRY_INVALID_RESPONSE', 502);
  return { kind, identifier, test: test === true, url, fetched_at: new Date().toISOString(), summary };
}
