import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createAppServer } from '../src/app-server.mjs';
import { Store } from '../src/app/store.mjs';
import { Activity } from '../src/app/activity.mjs';

async function setup(t) {
  const directory = mkdtempSync(resolve(tmpdir(), 'casecheck-activity-'));
  const password = 'activity-test-only-password';
  let date = '2026-10-03T10:00:00Z';
  const server = await createAppServer({ stateDir: directory, secure: false, now: () => new Date(date), env: { CASECHECK_ADMIN_PASSWORD: password } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(directory, { recursive: true, force: true }); });
  const app = server.app, login = await app.store.login('admin@casecheck.local', password), admin = login.user;
  const lawyer = { ...admin, id: 'lawyer-review', role: 'lawyer' };
  const state = app.create(admin, { title: 'Fikcyjna sprawa', track: 'consumer', synthetic: true });
  const link = app.store.link(admin, state.id), client = app.store.auth(link.token);
  const request = async (path, body, token = link.token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/casecheck/api${path}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  };
  return { directory, app, admin, lawyer, client, state, request, login, advance: value => { date = value; } };
}

test('notification API isolates tenant and client case, and never publishes private events to the client', async t => {
  const f = await setup(t), { app, admin, lawyer } = f;
  const privateCase = app.create(admin, { title: 'Wewnętrzna inna sprawa', track: 'consumer', synthetic: true });
  app.portal.reply(admin, privateCase.id, { revision: privateCase.revision, text: 'Niewidoczne dla innego klienta' });
  let state = app.portal.reply(admin, f.state.id, { revision: f.state.revision, text: 'Jawna wiadomość' });
  state = await app.upload(admin, state.id, state.revision, Buffer.from('Poufna treść'), 'Poufny-plik.txt');
  state = app.task(admin, state.id, { revision: state.revision, title: 'Tajne zadanie', kind: 'administrative', due: '2026-10-03' });
  const client = await f.request('/activity');
  assert.equal(client.status, 200); assert.equal(client.body.cases.length, 1);
  assert.equal(client.body.cases[0].revision, state.revision);
  assert.equal(client.body.items.length, 1); assert.equal(client.body.items[0].title, 'Odpowiedź kancelarii');
  assert.doesNotMatch(JSON.stringify(client.body), /Poufn|Tajne|Wewnętrzna|Jawna wiadomość|actor|tenant/);
  const foreign = app.activity.feed({ ...lawyer, tenant: 'another-tenant' });
  assert.deepEqual(foreign.cases, []); assert.deepEqual(foreign.items, []);
  assert.equal((await f.request('/activity', undefined, 'invalid')).status, 401);
  app.store.revokeLinks(admin, state.id);
  assert.equal((await f.request('/activity')).status, 401);
});

test('read acknowledgements persist without changing the case or AI budget and cannot mark inaccessible notifications', async t => {
  const f = await setup(t), { app, admin, lawyer, client } = f;
  const state = app.portal.reply(admin, f.state.id, { revision: f.state.revision, text: 'Wiadomość testowa' });
  const beforeBudget = app.store.budget(), entry = app.activity.feed(client).items[0];
  assert.equal((await f.request('/activity/read', { ids: [entry.id] })).body.unread, 0);
  assert.equal((await f.request('/activity/read', { ids: [entry.id] })).body.unread, 0);
  assert.equal(app.store.get(admin, state.id).revision, state.revision); assert.deepEqual(app.store.budget(), beforeBudget);
  assert.equal(app.activity.feed(lawyer).items[0].read, false);
  assert.equal((await f.request('/activity/read', { ids: ['unavailable'] })).status, 404);
  assert.equal((await f.request('/activity/read', { ids: [] })).status, 400);
  const reopened = new Store(f.directory);
  try { assert.equal(new Activity(reopened).feed(client).items[0].read, true); } finally { reopened.close(); }
});

test('due reminders use UTC, stop after completion, and return on the next day; client requests stay separate', async t => {
  const f = await setup(t), { app, admin, client } = f;
  let state = app.task(admin, f.state.id, { revision: 1, title: 'Na jutro', kind: 'administrative', due: '2026-10-04' });
  const task = state.tasks.at(-1);
  state = app.task(admin, state.id, { revision: state.revision, title: 'Za tydzień', kind: 'administrative', due: '2026-10-10' });
  state = app.portal.request(admin, state.id, { revision: state.revision, title: 'Saldo klienta', target_date: '2026-10-03' });
  let feed = app.activity.feed(admin), reminders = feed.items.filter(n => n.kind === 'reminder');
  assert.equal(reminders.length, 1); assert.match(reminders[0].title, /jutro/);
  app.activity.markRead(admin, { ids: [reminders[0].id] });
  f.advance('2026-10-04T00:00:00Z'); feed = app.activity.feed(admin); reminders = feed.items.filter(n => n.kind === 'reminder');
  assert.equal(reminders.length, 1); assert.equal(reminders[0].read, false); assert.match(reminders[0].title, /dzisiaj/);
  state = app.task(admin, state.id, { revision: state.revision, task_id: task.id, status: 'done' });
  assert.equal(app.activity.feed(admin).items.filter(n => n.kind === 'reminder').length, 0);
  assert.match(app.activity.feed(client).items.find(n => n.kind === 'reminder').title, /po dacie docelowej/);
  app.portal.respond(client, state.id, { revision: state.revision, request_id: state.client_requests[0].id, text: 'Przesyłam odpowiedź' });
  assert.equal(app.activity.feed(client).items.filter(n => n.kind === 'reminder').length, 0);
});

test('unread count belongs to the bounded inbox and unread entries remain accessible after marking a page read', async t => {
  const f = await setup(t); let state = f.state;
  for (let i = 0; i < 60; i++) state = f.app.portal.reply(f.admin, state.id, { revision: state.revision, text: `Wiadomość ${i}` });
  const feed = f.app.activity.feed(f.client);
  assert.equal(feed.items.length, 50); assert.equal(feed.unread, 50); assert.equal(feed.truncated, true);
  const next = f.app.activity.markRead(f.client, { ids: feed.items.map(i => i.id) });
  assert.equal(next.unread, 10); assert.equal(next.items.filter(i => !i.read).length, 10);
});
