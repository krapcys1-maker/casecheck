import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createAppServer } from '../src/app-server.mjs';
import { portalView } from '../src/app/portal.mjs';
import { renderDraftDocx } from '../src/app/docx.mjs';
import { fillFirmTemplate } from '../src/app/firm-templates.mjs';

async function fixture(t) {
  const dir = mkdtempSync(resolve(tmpdir(), 'casecheck-portal-'));
  const password = 'portal-only-test-password';
  const server = await createAppServer({ stateDir: dir, secure: false, env: { CASECHECK_ADMIN_PASSWORD: password } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  const app = server.app, admin = (await app.store.login('admin@casecheck.local', password)).user;
  await app.store.addUser(admin, { name: 'Prawnik TEST', email: 'lawyer@example.invalid', password, role: 'lawyer' });
  const login = await app.store.login('lawyer@example.invalid', password), lawyer = login.user;
  const state = app.create(admin, { title: 'Fikcyjna sprawa', track: 'consumer', synthetic: true });
  const link = app.store.link(admin, state.id), client = app.store.auth(link.token);
  const request = async (path, body, token = link.token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/casecheck/api${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, type: response.headers.get('content-type'), bytes: Buffer.from(await response.arrayBuffer()) };
  };
  return { app, admin, lawyer, client, state, request, lawyerToken: login.token };
}
const templateInput = { title: 'Wzór kancelarii', tracks: ['consumer'], sections: [{ heading: 'Sprawa', text: '{{case.title}} — {{today}}' }] };
test('firm claim lists preserve dispute and evidence for each field even when claim facts have no individual id', async t => {
  const f = await fixture(t), state = f.state;
  state.sources.push({ id: 'source', text: 'Firma Testowa. Umowa ABC. Saldo 100 PLN. Kwestionuję roszczenie.', kind: 'message' });
  const base = { type: 'text', review: 'confirmed', source_id: 'source', quote: 'Firma Testowa. Umowa ABC. Saldo 100 PLN. Kwestionuję roszczenie.', precision: 'exact' };
  state.claims.push({ id: 'claim', source_ids: ['source'], review: 'confirmed', facts: [
    { ...base, field: 'creditor_name', text_value: 'Firma Testowa' }, { ...base, field: 'agreement_number', text_value: 'ABC' },
    { ...base, field: 'total_amount', type: 'money', minor_units: 10000, currency: 'PLN', as_of: '2026-09-30' },
    { ...base, field: 'disputed', type: 'boolean', boolean_value: true }] });
  const filled = fillFirmTemplate({ ...templateInput, status: 'approved', sections: [{ heading: 'Lista', text: '{{totals}}\n{{claims.list}}' }] }, state, '2026-10-03');
  assert.match(filled.sections[0].text, /stanowisko klienta o sporze: tak/);
  assert.equal(filled.evidence.length, 4); assert.equal(new Set(filled.evidence.map(e => e.field)).size, 4);
});
function approvedDraft(f, state) {
  let template = f.app.firmTemplates.save(f.admin, templateInput);
  template = f.app.firmTemplates.approve(f.lawyer, { id: template.id, revision: template.revision });
  state = f.app.draft(f.admin, state.id, { revision: state.revision, firm_template_id: template.id });
  state = f.app.approveDraft(f.lawyer, state.id, { revision: state.revision, draft_id: state.drafts.at(-1).id });
  return { state, template, draft: state.drafts.at(-1) };
}

test('staff replies and request review never become client facts; client response invalidates drafts and stays auditable', async t => {
  const f = await fixture(t); let { state, draft } = approvedDraft(f, f.state);
  const rev = state.data_revision, sources = state.sources.length;
  state = f.app.portal.reply(f.admin, state.id, { revision: state.revision, text: 'Proszę dostarczyć aktualne saldo.' });
  assert.equal(state.data_revision, rev); assert.equal(state.sources.length, sources); assert.equal(state.messages.at(-1).role, 'staff');
  state = f.app.portal.request(f.admin, state.id, { revision: state.revision, title: 'Saldo', target_date: '2026-10-10' });
  const id = state.client_requests[0].id;
  assert.throws(() => f.app.stage(f.lawyer, state.id, { revision: state.revision, stage: 'closed' }), { code: 'OPEN_TASKS_OR_ROLE' });
  state = f.app.portal.respond(f.client, state.id, { revision: state.revision, request_id: id, text: 'Saldo wynosi 100 zł.' });
  assert.equal(state.data_revision, rev + 1); assert.equal(state.sources.at(-1).text, 'Saldo wynosi 100 zł.');
  assert.equal(state.drafts.find(d => d.id === draft.id).status, 'stale');
  state = f.app.portal.reviewRequest(f.admin, state.id, { revision: state.revision, request_id: id, status: 'open', note: 'Potrzebny dokument.' });
  assert.equal(state.data_revision, rev + 1); assert.equal(state.client_requests[0].responses.length, 1);
  assert.throws(() => f.app.portal.reviewRequest(f.client, state.id, { revision: state.revision, request_id: id, status: 'accepted' }), { code: 'FORBIDDEN' });
  assert.throws(() => f.app.portal.reply(f.client, state.id, { revision: state.revision, text: 'Podszycie pod kancelarię' }), { code: 'FORBIDDEN' });
});

test('private originals, unpublished PDF/DOCX and foreign cases remain unavailable to client tokens', async t => {
  const f = await fixture(t); let state = await f.app.upload(f.admin, f.state.id, f.state.revision, Buffer.from('Notatka wewnętrzna kancelarii.'), 'wewnetrzna.txt');
  const doc = state.documents.at(-1), path = `/cases/${state.id}`;
  assert.equal((await f.request(path + '/files/' + doc.id)).status, 404);
  assert.equal(JSON.parse((await f.request(path)).bytes).documents.length, 0);
  assert.throws(() => f.app.portal.respond(f.client, state.id, { revision: state.revision, request_id: 'bad', document_ids: [doc.id] }), { code: 'REQUEST_NOT_OPEN' });
  state = f.app.portal.fileVisibility(f.lawyer, state.id, { revision: state.revision, document_id: doc.id, visible: true });
  assert.equal((await f.request(path + '/files/' + doc.id)).status, 200);
  ({ state } = approvedDraft(f, state)); const draft = state.drafts.at(-1);
  assert.equal((await f.request(path + '/pdf/' + draft.id)).status, 403);
  assert.equal((await f.request(path + '/docx/' + draft.id)).status, 403);
  assert.equal((await f.request('/firm-templates', templateInput)).status, 403);
  const other = f.app.create(f.admin, { title: 'Inna sprawa', track: 'consumer', synthetic: true });
  assert.equal((await f.request('/cases/' + other.id)).status, 404);
});

test('shared PDF binds approval, content and data version; acknowledgements preserve validity, edits and new data revoke availability', async t => {
  const f = await fixture(t); let { state, draft } = approvedDraft(f, f.state);
  state = f.app.portal.share(f.lawyer, state.id, { revision: state.revision, draft_id: draft.id });
  const release = state.client_releases[0], path = `/cases/${state.id}/client-pdf/${release.id}`;
  const pdf = await f.request(path); assert.equal(pdf.status, 200); assert.equal(pdf.bytes.subarray(0,4).toString(), '%PDF');
  state = f.app.portal.acknowledge(f.client, state.id, { revision: state.revision, release_id: release.id });
  assert.equal(portalView(state).releases[0].available, true); assert.ok(portalView(state).releases[0].read_at);
  state = f.app.editDraft(f.admin, state.id, { revision: state.revision, draft_id: draft.id, sections: [{ heading: 'Zmiana', text: 'Nowa treść do sprawdzenia.' }] });
  assert.equal((await f.request(path)).status, 409);
  state = f.app.approveDraft(f.lawyer, state.id, { revision: state.revision, draft_id: draft.id });
  assert.equal((await f.request(path)).status, 409); // Old release cannot silently expose different text.
  state = f.app.portal.share(f.lawyer, state.id, { revision: state.revision, draft_id: draft.id });
  state = f.app.message(f.client, state.id, { revision: state.revision, text: 'Zmieniła się moja sytuacja.' });
  assert.equal(portalView(state).releases.every(r => !r.available), true);
  assert.throws(() => f.app.editDraft(f.admin, state.id, { revision: state.revision, draft_id: draft.id, sections: draft.sections }), { code: 'DRAFT_OUTDATED' });
});

test('template edit retires dependent releases atomically, keeps immutable versions, enforces tenant/role/revision and backup-compatible SQL', async t => {
  const f = await fixture(t); let { state, template, draft } = approvedDraft(f, f.state);
  state = f.app.portal.share(f.lawyer, state.id, { revision: state.revision, draft_id: draft.id });
  assert.throws(() => f.app.firmTemplates.approve(f.admin, { id: template.id, revision: template.revision }), { code: 'LAWYER_REQUIRED' });
  assert.throws(() => f.app.firmTemplates.get({ ...f.admin, tenant: 'foreign' }, template.id), { code: 'NOT_FOUND' });
  const originalRecord = f.app.store.record.bind(f.app.store);
  f.app.store.record = () => { throw new Error('Simulated disk failure'); };
  assert.throws(() => f.app.firmTemplates.save(f.admin, { ...templateInput, id: template.id, revision: template.revision }), /Simulated/);
  f.app.store.record = originalRecord;
  assert.equal(f.app.firmTemplates.get(f.admin, template.id).revision, template.revision);
  assert.equal(portalView(f.app.store.get(f.admin, state.id)).releases[0].available, true);
  const next = f.app.firmTemplates.save(f.admin, { ...templateInput, id: template.id, revision: template.revision, title: 'Nowy wzór' });
  assert.equal(next.status, 'draft'); assert.equal(f.app.firmTemplates.history(f.admin, template.id).length, 3);
  assert.equal(portalView(f.app.store.get(f.admin, state.id)).releases[0].available, false);
  assert.throws(() => f.app.firmTemplates.save(f.admin, { ...templateInput, id: template.id, revision: template.revision }), { code: 'VERSION_CONFLICT' });
});

test('unapproved templates, arbitrary placeholders and missing confirmed fields cannot produce approved client documents; DOCX is downloadable', async t => {
  const f = await fixture(t); let state = f.state;
  assert.throws(() => f.app.firmTemplates.save(f.admin, { ...templateInput, sections: [{ heading: 'Bad', text: '{{process.env}}' }] }), { code: 'UNKNOWN_TEMPLATE_FIELD' });
  let template = f.app.firmTemplates.save(f.admin, { ...templateInput, sections: [{ heading: 'Klient', text: '{{client_name}}' }] });
  assert.throws(() => f.app.draft(f.admin, state.id, { revision: state.revision, firm_template_id: template.id }), { code: 'TEMPLATE_REVIEW_REQUIRED' });
  template = f.app.firmTemplates.approve(f.lawyer, { id: template.id, revision: template.revision });
  state = f.app.draft(f.admin, state.id, { revision: state.revision, firm_template_id: template.id });
  const draft = state.drafts.at(-1); assert.deepEqual(draft.template_missing, ['client_name']);
  assert.throws(() => f.app.approveDraft(f.lawyer, state.id, { revision: state.revision, draft_id: draft.id }), { code: 'TEMPLATE_FIELDS_MISSING' });
  const bytes = await renderDraftDocx(draft, state); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  assert.equal((await f.request(`/cases/${state.id}/docx/${draft.id}`, undefined, f.lawyerToken)).status, 200);
});
