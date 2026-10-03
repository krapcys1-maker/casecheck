import { requireValue, digest, validDate } from './store.mjs';

const staffEvents = {
  client_message: ['Nowa wiadomość w wywiadzie', 'chat'], staff_reply: ['Odpowiedź kancelarii', 'chat'],
  client_request_answered: ['Klient odpowiedział na prośbę', 'portal'], client_document_read: ['Klient potwierdził odbiór pisma', 'portal'],
  client_request_created: ['Nowa prośba do klienta', 'portal'], client_request_reviewed: ['Sprawdzono odpowiedź klienta', 'portal'],
  draft_shared_with_client: ['Udostępniono pismo klientowi', 'portal'], client_release_revoked: ['Wycofano udostępnienie pisma', 'portal'],
  file_uploaded: ['Dodano załącznik', 'docs'], task_changed: ['Zmieniono zadania', 'tasks'], stage_changed: ['Zmieniono etap sprawy', 'overview'],
  ai_finished: ['Zakończono odczyt AI — sprawdź wynik', 'history'], ocr_finished: ['Zakończono OCR — sprawdź wynik', 'history'],
  audio_finished: ['Zakończono transkrypcję — sprawdź wynik', 'docs'], job_result_recovered: ['Odzyskano zapisany wynik', 'history'],
};
// Never derive client notifications from private documents, jobs, tasks or internal reviews.
const clientEvents = Object.fromEntries(['staff_reply', 'client_request_created', 'client_request_reviewed',
  'draft_shared_with_client', 'client_release_revoked', 'stage_changed'].map(key => [key, staffEvents[key]]));

export class Activity {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS notification_reads(
      recipient TEXT NOT NULL, notification_id TEXT NOT NULL, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL, PRIMARY KEY(recipient,notification_id));
      CREATE INDEX IF NOT EXISTS audit_case_order ON audit(case_id,at);
      INSERT OR IGNORE INTO schema_version VALUES(4);`);
  }
  recipient(actor) { return actor.role === 'client' ? 'client:' + actor.case_id : 'user:' + actor.id; }
  entries(actor) {
    const client = actor.role === 'client', events = client ? clientEvents : staffEvents;
    const rows = this.store.db.prepare(`SELECT id,revision,state FROM cases WHERE tenant=? ${client ? 'AND id=?' : ''}`)
      .all(...[actor.tenant, ...(client ? [actor.case_id] : [])]);
    const states = new Map(rows.map(r => [r.id, JSON.parse(r.state)]));
    const audit = this.store.db.prepare(`SELECT a.id,a.case_id,a.event,a.at FROM audit a JOIN cases c ON c.id=a.case_id
      WHERE c.tenant=? ${client ? 'AND c.id=?' : ''} AND a.actor<>? AND a.event IN (${Object.keys(events).map(() => '?').join(',')})
      ORDER BY a.rowid DESC LIMIT 200`).all(actor.tenant, ...(client ? [actor.case_id] : []), actor.id, ...Object.keys(events));
    const items = audit.map(row => ({ id: row.id, case_id: row.case_id, case_title: states.get(row.case_id).title,
      title: events[row.event][0], tab: client && row.event === 'stage_changed' ? 'portal' : events[row.event][1], at: row.at, kind: 'event' }));
    const today = this.store.now().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    for (const state of states.values()) {
      if (state.stage === 'closed') continue;
      const dueItems = client ? (state.client_requests || []).filter(r => r.status === 'open') : state.tasks.filter(t =>
        t.status === 'open' && (!t.assignee || t.assignee === actor.id));
      for (const item of dueItems) {
        const due = client ? item.target_date : item.due;
        if (!validDate(due) || due > tomorrow) continue;
        const phase = due < today ? 'po dacie docelowej' : due === today ? 'data docelowa dzisiaj' : 'data docelowa jutro';
        items.push({ id: 'due-' + digest([state.id, item.id, due, today].join(':')), case_id: state.id, case_title: state.title,
          title: `${client ? 'Prośba' : 'Zadanie'}: ${item.title} — ${phase} (${due}, UTC)`, tab: client ? 'portal' : 'tasks',
          at: today + 'T00:00:00.000Z', kind: 'reminder' });
      }
    }
    const read = new Set(this.store.db.prepare('SELECT notification_id FROM notification_reads WHERE recipient=?')
      .all(this.recipient(actor)).map(r => r.notification_id));
    return { cases: rows.map(({ id, revision }) => ({ id, revision })), items: items.map(i => ({ ...i, read: read.has(i.id) })) };
  }
  feed(actor) {
    const result = this.entries(actor);
    // A bounded inbox: unread items first, reminders first, newest events first.
    result.items.sort((a, b) => Number(a.read) - Number(b.read) || Number(b.kind === 'reminder') - Number(a.kind === 'reminder') || b.at.localeCompare(a.at));
    const total = result.items.length;
    result.items = result.items.slice(0, 50);
    return { ...result, unread: result.items.filter(i => !i.read).length, truncated: total > 50,
      checked_at: this.store.now().toISOString() };
  }
  markRead(actor, input) {
    const ids = input.ids;
    requireValue(Array.isArray(ids) && ids.length > 0 && ids.length <= 50 && ids.every(id => typeof id === 'string' && id.length <= 80));
    return this.store.tx(() => {
      const allowed = new Map(this.entries(actor).items.map(i => [i.id, i.case_id]));
      requireValue(ids.every(id => allowed.has(id)), 'NOTIFICATION_UNAVAILABLE', 404);
      const statement = this.store.db.prepare('INSERT OR IGNORE INTO notification_reads VALUES(?,?,?,?)');
      for (const id of new Set(ids)) statement.run(this.recipient(actor), id, allowed.get(id), this.store.now().toISOString());
      return this.feed(actor);
    });
  }
}
