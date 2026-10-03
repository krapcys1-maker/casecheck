import test from 'node:test';
import assert from 'node:assert/strict';
import { registryLookup } from '../src/app/registries.mjs';

test('registry query rejection is distinct from missing record and upstream outage', async () => {
  const query = { kind: 'krs', identifier: '0000000000', date: '2026-10-03' };
  for (const [status, code, appStatus] of [[400, 'REGISTRY_QUERY_REJECTED', 400], [404, 'REGISTRY_NOT_FOUND', 404], [503, 'REGISTRY_UNAVAILABLE', 502]]) {
    await assert.rejects(registryLookup(query, async () => new Response('{}', { status })), { code, status: appStatus });
  }
});

test('a KRS lookup in a fictional case is not mislabeled as the MF test environment', async () => {
  const result = await registryLookup({ kind: 'krs', identifier: '0000026438', date: '2026-10-03', test: true }, async () => Response.json({
    odpis: { naglowekA: { numerKRS: '0000026438' }, dane: { dzial1: { danePodmiotu: { nazwa: 'TESTOWY PODMIOT' }, siedzibaIAdres: {} } } }
  }));
  assert.equal(result.test, false);
  assert.ok(result.url.startsWith('https://api-krs.ms.gov.pl/'));
});
