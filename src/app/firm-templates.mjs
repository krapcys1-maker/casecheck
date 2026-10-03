import { uid, text, requireValue, digest } from './store.mjs';
import { intake, currentFacts, factValue, controls } from './domain.mjs';
import { sourceProblem, claimSourceProblem } from './document-review.mjs';

export const templateFields = [...intake.fields.map(f => ({ key: f.key, label: f.label })),
  { key: 'case.title', label: 'Nazwa sprawy' }, { key: 'today', label: 'Data utworzenia' },
  { key: 'claims.list', label: 'Potwierdzone zobowiązania' }, { key: 'totals', label: 'Potwierdzone sumy według waluty i daty' },
  { key: 'missing.list', label: 'Brakujące informacje' }];
const allowed = new Set(templateFields.map(f => f.key));
const placeholders = value => [...value.matchAll(/\{\{\s*([a-z_][a-z_.]*)\s*\}\}/g)].map(m => m[1]);
export class FirmTemplates {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS firm_templates(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS firm_template_versions(template_id TEXT NOT NULL REFERENCES firm_templates(id),revision INTEGER NOT NULL,state TEXT NOT NULL,
      PRIMARY KEY(template_id,revision)); INSERT OR IGNORE INTO schema_version VALUES(3);`);
  }
  list(actor) { requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.db.prepare('SELECT state FROM firm_templates WHERE tenant=? ORDER BY rowid DESC').all(actor.tenant).map(r => JSON.parse(r.state)); }
  get(actor, id) { const template = this.list(actor).find(t => t.id === id); requireValue(template, 'NOT_FOUND', 404); return template; }
  save(actor, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    requireValue(Array.isArray(input.tracks) && input.tracks.length && input.tracks.every(t => ['consumer','company'].includes(t)), 'INVALID_TEMPLATE');
    requireValue(Array.isArray(input.sections) && input.sections.length > 0 && input.sections.length <= 30, 'INVALID_TEMPLATE');
    const sections = input.sections.map(s => ({ heading: text(s.heading, 200), text: text(s.text, 20000) }));
    requireValue(JSON.stringify(sections).length <= 60000, 'TEMPLATE_LIMIT', 413);
    for (const section of sections) for (const content of [section.heading, section.text]) {
      requireValue(placeholders(content).every(key => allowed.has(key)), 'UNKNOWN_TEMPLATE_FIELD');
      requireValue(!/[{}]/.test(content.replace(/\{\{\s*[a-z_][a-z_.]*\s*\}\}/g, '')), 'INVALID_TEMPLATE_SYNTAX');
    }
    return this.store.tx(() => {
      const previous = input.id ? this.get(actor, input.id) : null;
      requireValue(!previous || previous.revision === input.revision, 'VERSION_CONFLICT', 409);
      requireValue(previous || this.list(actor).length < 50, 'TEMPLATE_LIMIT', 413);
      const template = { id: previous?.id || uid(), title: text(input.title, 150), tracks: [...new Set(input.tracks)], sections,
        revision: (previous?.revision || 0) + 1, status: 'draft', content_hash: digest(JSON.stringify({ title: input.title.trim(), tracks: [...new Set(input.tracks)], sections })),
        updated_by: actor.name, updated_at: this.store.now().toISOString() };
      this.write(actor, template);
      // Atomically retire case drafts based on a changed firm template, including client downloads.
      if (previous) for (const row of this.store.db.prepare('SELECT state FROM cases WHERE tenant=?').all(actor.tenant)) {
        const state = JSON.parse(row.state); let changed = false;
        for (const draft of state.drafts.filter(d => d.firm_template_id === template.id && d.status !== 'stale')) { draft.status = 'stale'; changed = true; }
        if (changed) {
          state.revision++; state.updated_at = this.store.now().toISOString();
          this.store.db.prepare('UPDATE cases SET revision=?,state=? WHERE id=? AND tenant=?').run(state.revision, JSON.stringify(state), state.id, actor.tenant);
          this.store.record(actor, state, 'firm_template_changed');
        }
      }
      return template;
    });
  }
  write(actor, template) {
    const state = JSON.stringify(template);
    this.store.db.prepare('INSERT INTO firm_templates VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(template.id, actor.tenant, state);
    this.store.db.prepare('INSERT INTO firm_template_versions VALUES(?,?,?)').run(template.id, template.revision, state);
  }
  approve(actor, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.tx(() => {
      const template = this.get(actor, input.id); requireValue(template.revision === input.revision, 'VERSION_CONFLICT', 409);
      requireValue(template.status === 'draft', 'TEMPLATE_ALREADY_APPROVED', 409);
      template.revision++; template.status = 'approved'; template.approved_by = actor.name; template.approved_at = this.store.now().toISOString();
      this.write(actor, template); return template;
    });
  }
  history(actor, id) { this.get(actor, id); return this.store.db.prepare('SELECT state FROM firm_template_versions WHERE template_id=? ORDER BY revision DESC').all(id).map(r => JSON.parse(r.state)); }
  matches(actor, draft) {
    const template = this.get(actor, draft.firm_template_id);
    return template.status === 'approved' && template.revision === draft.firm_template_revision && template.content_hash === draft.firm_template_hash;
  }
}

export function fillFirmTemplate(template, state, today) {
  requireValue(template.status === 'approved', 'TEMPLATE_REVIEW_REQUIRED', 409);
  requireValue(template.tracks.includes(state.track), 'INVALID_TEMPLATE');
  const facts = currentFacts(state), missing = new Set(), evidence = [];
  const record = (f, claimId = null) => {
    if (f && f.type !== 'unknown' && !evidence.some(e => e.field === f.field && e.fact_id === (f.id || null) && e.claim_id === claimId))
      evidence.push({ field: f.field, fact_id: f.id || null, claim_id: claimId, source_id: f.source_id, quote: f.quote });
  };
  const value = key => {
    if (key === 'case.title') return state.title;
    if (key === 'today') return today;
    if (key === 'missing.list') return controls(state).missing_fields.map(f => f.question).join('\n') || 'Nie stwierdzono braków w polach wywiadu.';
    if (key === 'claims.list') {
      const claims = state.claims.filter(c => !c.merged_into && c.review === 'confirmed' && !claimSourceProblem(state, c));
      if (claims.length) return claims.map((c, i) => {
        const read = key => { const f = c.facts.find(f => f.field === key); record(f, c.id); return factValue(f); };
        return `${i + 1}. ${read('creditor_name')}; umowa: ${read('agreement_number')}; kwota z dokumentu: ${read('total_amount')}; stanowisko klienta o sporze: ${read('disputed')}${c.facts.some(f => f.field === 'disputed_scope' && f.type !== 'unknown') ? '; zakres sporu: ' + read('disputed_scope') : ''}. Potwierdzenie odczytu nie jest uznaniem długu.`;
      }).join('\n\n');
    } else if (key === 'totals') {
      const checks = controls(state);
      if (checks.totals.length && !checks.excluded_claims) {
        for (const c of state.claims.filter(c => !c.merged_into && c.review === 'confirmed')) record(c.facts.find(f => f.field === 'total_amount'), c.id);
        return checks.totals.map(t => factValue({ ...t, type: 'money', precision: 'exact' })).join('\n');
      }
    } else {
      const f = facts[key];
      if (f?.review === 'confirmed' && f.type !== 'unknown' && !f.source_invalidated && !sourceProblem(state, f.source_id)) {
        record(f); return factValue(f);
      }
    }
    missing.add(key); return `[DO UZUPEŁNIENIA: ${templateFields.find(f => f.key === key).label}]`;
  };
  const fill = content => content.replace(/\{\{\s*([a-z_][a-z_.]*)\s*\}\}/g, (_, key) => value(key));
  return { sections: template.sections.map(s => ({ heading: fill(s.heading), text: fill(s.text) })), missing: [...missing], evidence };
}
