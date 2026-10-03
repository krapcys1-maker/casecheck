import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { Application } from '../src/app/application.mjs';
import { currentFacts, putFacts } from '../src/app/domain.mjs';
import { draftReady, portalView } from '../src/app/portal.mjs';
import { reviewPackage } from '../src/app/review-package.mjs';
import { digest } from '../src/app/store.mjs';

const unknown = field => ({ field, type: 'unknown', text_value: null, boolean_value: null, minor_units: null,
  currency: null, as_of: null, precision: 'unknown', source_id: null, quote: null });
const textFact = (field, value) => ({ ...unknown(field), type: 'text', text_value: value, precision: 'exact' });
const actor = { id: 'test-lawyer', tenant: 'test', role: 'lawyer', name: 'Test lawyer' };
function fixture(t, extract) {
  const parent = resolve(tmpdir()), directory = mkdtempSync(resolve(parent, 'casecheck-consistency-'));
  const app = new Application({ stateDir: directory, env: { DEEPSEEK_API_KEY: 'not-a-real-key' }, ...(extract ? { extract } : {}) });
  t.after(() => { app.close(); assert.ok(directory.startsWith(parent + sep)); rmSync(directory, { recursive: true, force: true }); });
  return { app, state: app.create(actor, { title: 'Correction test', track: 'consumer', synthetic: true }) };
}
async function claimFixture(app, state) {
  state = await app.upload(actor, state.id, state.revision, Buffer.from('FIKCYJNE. Wierzyciel: Bank Alfa. Adres: ul. Dawna 1. Umowa TEST-1.'), 'test.txt');
  return app.store.update(actor, state.id, state.revision, 'test_fixture', s => {
    const source = s.sources.at(-1);
    s.claims.push({ id: 'claim', document_id: s.documents[0].id, source_ids: [source.id], review: 'confirmed', merged_into: null,
      facts: [textFact('creditor_name', 'Bank Alfa'), textFact('creditor_address', 'ul. Dawna 1'),
        { ...unknown('disputed'), type: 'boolean', boolean_value: true, precision: 'exact' }, textFact('disputed_scope', 'Kwestionuję odsetki.')]
        .map(f => ({ ...f, source_id: source.id, quote: source.text })) });
  });
}
test('explicit manual unknown retires a confirmed wrong value while an AI omission preserves known data', t => {
  const { app, state: created } = fixture(t); let s = created;
  s = app.correction(actor, s.id, { revision: s.revision, fact: textFact('address', 'Stary adres'), note: 'Poprzedni adres.' });
  const previousId = currentFacts(s).address.id;
  s = app.reviewFact(actor, s.id, { revision: s.revision, fact_id: previousId, review: 'confirmed' });
  const aiCopy = structuredClone(s); putFacts(aiCopy, [unknown('address')]);
  assert.equal(currentFacts(aiCopy).address.text_value, 'Stary adres');
  s = app.correction(actor, s.id, { revision: s.revision, fact: unknown('address'), note: 'Poprzedni adres błędny, aktualny nieznany.' });
  assert.equal(currentFacts(s).address.type, 'unknown');
  assert.equal(s.facts.find(f => f.id === previousId).current, false);
  assert.equal(currentFacts(s).address.quote, 'Poprzedni adres błędny, aktualny nieznany.');
});
test('manual creditor and dispute changes invalidate dependent fields and preserve their history', async t => {
  const f = fixture(t); let s = await claimFixture(f.app, f.state);
  s = f.app.correctClaim(actor, s.id, { revision: s.revision, claim_id: 'claim', fact: textFact('creditor_name', 'Fundusz Beta'), note: 'Nowym wierzycielem jest Fundusz Beta.' });
  assert.equal(s.claims[0].facts.find(f => f.field === 'creditor_address').type, 'unknown');
  assert.ok(s.claims[0].fact_history.some(f => f.field === 'creditor_address' && f.text_value === 'ul. Dawna 1'));
  s = f.app.correctClaim(actor, s.id, { revision: s.revision, claim_id: 'claim', fact: { ...unknown('disputed'), type: 'boolean', boolean_value: false, precision: 'exact' }, note: 'Klient potwierdził brak sporu.' });
  assert.equal(s.claims[0].facts.find(f => f.field === 'disputed_scope').type, 'unknown');
  s = f.app.draft(actor, s.id, { revision: s.revision, template: 'claim_clarification', options: { claim_id: 'claim' } });
  assert.equal(s.drafts.at(-1).sections.find(s => s.heading === 'Adresat').text, 'Fundusz Beta\n[DO UZUPEŁNIENIA]');
});
test('a partial AI creditor change cannot silently retain the previous creditor address', async t => {
  let calls = 0;
  const f = fixture(t, async ({ sources }) => { calls++; return { output: { facts: [{ ...textFact('creditor_name', 'Fundusz Beta'), source_id: sources[0].id, quote: sources[0].text }], questions: [], warnings: [] }, model: 'controlled-response' }; });
  let s = await claimFixture(f.app, f.state);
  s = f.app.consent(actor, s.id, { revision: s.revision, provider: 'deepseek', accepted: true });
  s = await f.app.analyze(actor, s.id, { revision: s.revision, kind: 'claim', fields: ['creditor_name'], source_ids: [s.sources[0].id] });
  const claim = s.claims.find(c => !c.merged_into);
  assert.equal(claim.facts.find(f => f.field === 'creditor_address').type, 'unknown');
  assert.equal(s.claims.find(c => c.id === 'claim').facts.find(f => f.field === 'creditor_address').text_value, 'ul. Dawna 1');
  assert.ok(s.jobs.at(-1).semantic_flags.some(f => f.field === 'creditor_address' && f.code === 'RELATED_FIELD_CHANGED'));
  assert.equal(calls, 1);
});
test('empty or whitespace-only draft edits are rejected without changing an approved document', t => {
  const { app, state } = fixture(t);
  let s = app.draft(actor, state.id, { revision: state.revision, template: 'case_card' });
  s = app.approveDraft(actor, s.id, { revision: s.revision, draft_id: s.drafts[0].id });
  for (const sections of [[], [{ heading: ' ', text: 'Treść' }], [{ heading: 'Nagłówek', text: '\n  ' }]]) {
    assert.throws(() => app.editDraft(actor, s.id, { revision: s.revision, draft_id: s.drafts[0].id, sections }), { code: 'INVALID_DRAFT_CONTENT' });
    assert.equal(app.store.get(actor, s.id).revision, s.revision);
    assert.equal(app.store.get(actor, s.id).drafts[0].status, 'approved');
  }
});
test('legacy approved empty documents cannot be shared or reported as approved exports', t => {
  const { app, state } = fixture(t);
  const sections = [], content_hash = digest(JSON.stringify(sections));
  state.drafts.push({ id: 'old-empty', status: 'approved', source_revision: state.data_revision, sections, content_hash });
  state.client_releases = [{ id: 'old-release', draft_id: 'old-empty', status: 'active', source_revision: state.data_revision, content_hash }];
  assert.equal(draftReady(state.drafts[0], state), false);
  assert.equal(portalView(state).releases[0].available, false);
  assert.deepEqual(reviewPackage(state, '2026-10-03T12:00:00Z').approved_drafts, []);
});
