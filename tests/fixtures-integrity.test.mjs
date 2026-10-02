import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registryLookup } from '../src/app/registries.mjs';
import { claimFields } from '../src/app/domain.mjs';

test('18 full synthetic cases contain usable documents, quoted oracles and four holdouts', () => {
  const dataset = JSON.parse(readFileSync('tests/full-fixtures/cases.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('tests/full-fixtures/manifest.json', 'utf8'));
  assert.equal(dataset.synthetic, true); assert.equal(dataset.cases.length, 18);
  assert.equal(dataset.cases.filter(c => c.track === 'consumer').length, 12);
  assert.equal(dataset.cases.filter(c => c.split === 'holdout').length, 4);
  assert.equal(manifest.files.length, 48);
  for (const file of manifest.files) {
    assert.equal(createHash('sha256').update(readFileSync('tests/full-fixtures/' + file.path)).digest('hex'), file.sha256);
  }
  for (const c of dataset.cases) {
    assert.equal(c.synthetic, true); assert.match(c.contact_email, /@example\.invalid$/);
    for (const d of c.documents) if (d.expected.quote_total) {
      assert.ok(d.text.includes(d.expected.quote_total));
      if (!d.text.includes('kwestionuję podstawę')) assert.equal(d.expected.disputed, null);
    }
  }
});
test('registry adapters use only fixed official hosts and preserve query date and request id', async () => {
  let called;
  const fetchImpl = async url => { called = url; return new Response(JSON.stringify({ result: { subject: {
    name: 'Firma Fikcyjna', nip: '3245174504', statusVat: 'Czynny' }, requestId: 'test-request-id' } }), { status: 200 }); };
  const result = await registryLookup({ kind: 'vat', identifier: '3245174504', date: '2026-10-02', test: true }, fetchImpl);
  assert.equal(called, 'https://wl-test.mf.gov.pl/api/search/nip/3245174504?date=2026-10-02');
  assert.equal(result.summary.request_id, 'test-request-id'); assert.equal(result.summary.as_of, '2026-10-02');
  await assert.rejects(registryLookup({ kind: 'vat', identifier: 'https://private.invalid', date: '2026-10-02' }, fetchImpl), { code: 'INVALID_REGISTRY_QUERY' });
  await assert.rejects(registryLookup({ kind: 'vat', identifier: '3245174504', date: '2026-02-30' }, fetchImpl), { code: 'INVALID_DATE' });
});
