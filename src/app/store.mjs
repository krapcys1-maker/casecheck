import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

const derive = promisify(scrypt);
export const uid = () => randomUUID();
export const digest = value => createHash('sha256').update(value).digest('hex');
export class AppError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const requireValue = (condition, code = 'INVALID_INPUT', status = 400) => {
  if (!condition) throw new AppError(status, code);
};
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function text(value, max = 4000, optional = false) {
  requireValue(typeof value === 'string' && value.length <= max && (optional || value.trim().length));
  return value.trim();
}
export async function hashPassword(password) {
  requireValue(typeof password === 'string' && password.length >= 16 && password.length <= 256, 'PASSWORD_LENGTH');
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${hash.toString('hex')}`;
}
async function matches(password, stored) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, hash] = stored.split(':');
  const candidate = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

export class Store {
  constructor(directory, { now = () => new Date(), limit = 20 } = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = directory; this.now = now; this.limit = limit;
    this.path = resolve(directory, 'casecheck.sqlite');
    this.db = new DatabaseSync(this.path);
    chmodSync(this.path, 0o600);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,revision INTEGER NOT NULL,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions(case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,revision INTEGER, state TEXT NOT NULL,
        PRIMARY KEY(case_id,revision));
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
        revision INTEGER,actor TEXT NOT NULL,event TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS links(hash TEXT PRIMARY KEY,case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
        expires TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS budget(day TEXT PRIMARY KEY,count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS registry_budget(day TEXT PRIMARY KEY,count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS knowledge(tenant TEXT PRIMARY KEY,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS job_results(job_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        captured_at TEXT NOT NULL,payload TEXT NOT NULL,sha256 TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO schema_version VALUES(1);
      INSERT OR IGNORE INTO schema_version VALUES(2);`);
  }
  tx(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async bootstrap(email, password) {
    if (this.db.prepare('SELECT id FROM users LIMIT 1').get()) return;
    await this.addUser({ tenant: uid(), role: 'admin' }, { email, password, name: 'Administrator', role: 'admin' });
  }
  async addUser(actor, input) {
    requireValue(actor.role === 'admin', 'FORBIDDEN', 403);
    const email = text(input.email, 200).toLowerCase();
    requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    requireValue(['admin', 'lawyer', 'staff'].includes(input.role));
    const name = text(input.name, 100), password = await hashPassword(input.password), id = uid();
    try { this.db.prepare('INSERT INTO users(id,tenant,email,name,role,password) VALUES(?,?,?,?,?,?)')
      .run(id, actor.tenant, email, name, input.role, password); }
    catch { throw new AppError(409, 'EMAIL_EXISTS'); }
    return { id, email, name, role: input.role };
  }
  users(actor) {
    requireValue(actor.role === 'admin', 'FORBIDDEN', 403);
    return this.db.prepare('SELECT id,email,name,role,active FROM users WHERE tenant=?').all(actor.tenant);
  }
  team(actor) {
    requireValue(['admin', 'lawyer', 'staff'].includes(actor.role), 'FORBIDDEN', 403);
    return this.db.prepare('SELECT id,name,role FROM users WHERE tenant=? AND active=1 ORDER BY name,id').all(actor.tenant);
  }
  disableUser(actor, id) {
    requireValue(actor.role === 'admin' && id !== actor.id, 'FORBIDDEN', 403);
    this.tx(() => {
      requireValue(this.db.prepare('UPDATE users SET active=0 WHERE id=? AND tenant=?').run(id, actor.tenant).changes, 'NOT_FOUND', 404);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    });
  }
  async login(email, password) {
    const user = typeof email === 'string' ? this.db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim()) : null;
    // A fixed dummy hash avoids a fast missing-account response.
    const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
    const correct = await matches(password, user?.password || dummy);
    requireValue(user?.active && correct, 'LOGIN_FAILED', 401);
    this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(this.now().toISOString());
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), user.id,
      new Date(this.now().getTime() + 8 * 60 * 60 * 1000).toISOString());
    return { token, user: { id: user.id, tenant: user.tenant, email: user.email, name: user.name, role: user.role } };
  }
  auth(token) {
    requireValue(typeof token === 'string' && token.length <= 256, 'UNAUTHORIZED', 401);
    const user = this.db.prepare(`SELECT u.id,u.tenant,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.hash=? AND s.expires>? AND u.active=1`).get(digest(token), this.now().toISOString());
    if (user) return user;
    const link = this.db.prepare(`SELECT l.case_id,c.tenant FROM links l JOIN cases c ON c.id=l.case_id
      WHERE hash=? AND revoked=0 AND expires>?`).get(digest(token), this.now().toISOString());
    requireValue(link, 'UNAUTHORIZED', 401);
    return { id: 'client', role: 'client', ...link };
  }
  logout(token) { this.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token)); }
  list(actor) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.db.prepare('SELECT state FROM cases WHERE tenant=? ORDER BY rowid DESC').all(actor.tenant)
      .map(row => JSON.parse(row.state)).map(({ id, title, track, stage, revision, synthetic, updated_at }) =>
        ({ id, title, track, stage, revision, synthetic, updated_at }));
  }
  get(actor, id) {
    if (actor.role === 'client') requireValue(actor.case_id === id, 'NOT_FOUND', 404);
    const row = this.db.prepare('SELECT state FROM cases WHERE id=? AND tenant=?').get(id, actor.tenant);
    requireValue(row, 'NOT_FOUND', 404);
    const state = JSON.parse(row.state); state.data_revision ??= state.revision; return state;
  }
  insert(actor, state) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    state.id ||= uid(); state.revision = 1; state.data_revision = 1; state.created_at = this.now().toISOString(); state.updated_at = state.created_at;
    this.tx(() => {
      this.db.prepare('INSERT INTO cases VALUES(?,?,?,?)').run(state.id, actor.tenant, 1, JSON.stringify(state));
      this.record(actor, state, 'case_created');
    });
    return state;
  }
  record(actor, state, event) {
    this.db.prepare('INSERT INTO versions VALUES(?,?,?)').run(state.id, state.revision, JSON.stringify(state));
    this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(uid(), state.id, state.revision, actor.id, event, this.now().toISOString());
  }
  update(actor, id, revision, event, mutate, { invalidate = true, reserveAI = false, consumeResult = null } = {}) {
    return this.tx(() => {
      const state = this.get(actor, id);
      requireValue(Number.isSafeInteger(revision) && state.revision === revision, 'VERSION_CONFLICT', 409);
      if (reserveAI) this.reserve({ inTransaction: true });
      if (invalidate) { for (const draft of state.drafts) draft.status = 'stale'; state.data_revision++; }
      mutate(state);
      state.revision++; state.updated_at = this.now().toISOString();
      requireValue(JSON.stringify(state).length <= 8 * 1024 * 1024, 'CASE_TOO_LARGE', 413);
      this.db.prepare('UPDATE cases SET revision=?,state=? WHERE id=? AND tenant=?')
        .run(state.revision, JSON.stringify(state), id, actor.tenant);
      this.record(actor, state, event);
      // Consuming the receipt and applying its facts must commit together.
      if (consumeResult) requireValue(this.db.prepare('DELETE FROM job_results WHERE job_id=? AND case_id=?')
        .run(consumeResult, id).changes === 1, 'SAVED_RESULT_NOT_FOUND', 409);
      return state;
    });
  }
  history(actor, id) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403); this.get(actor, id);
    return this.db.prepare('SELECT revision,actor,event,at FROM audit WHERE case_id=? ORDER BY rowid DESC LIMIT 200').all(id);
  }
  saveJobResult(actor, id, jobId, result) {
    return this.tx(() => {
      const state = this.get(actor, id), job = state.jobs.find(j => j.id === jobId);
      requireValue(job?.status === 'running', 'JOB_NOT_RUNNING', 409);
      const payload = JSON.stringify(result), sha256 = digest(payload);
      requireValue(payload.length <= 1024 * 1024, 'RESULT_TOO_LARGE', 413);
      // This transaction is independent of the later case/version/audit write.
      this.db.prepare('INSERT INTO job_results VALUES(?,?,?,?,?)')
        .run(jobId, id, this.now().toISOString(), payload, sha256);
      return sha256;
    });
  }
  jobResult(actor, id, jobId) {
    this.get(actor, id);
    const row = this.db.prepare('SELECT payload,sha256 FROM job_results WHERE job_id=? AND case_id=?').get(jobId, id);
    requireValue(row, 'SAVED_RESULT_NOT_FOUND', 404);
    requireValue(digest(row.payload) === row.sha256, 'SAVED_RESULT_INVALID', 409);
    let payload;
    try { payload = JSON.parse(row.payload); } catch { throw new AppError(409, 'SAVED_RESULT_INVALID'); }
    return { payload, sha256: row.sha256 };
  }
  hasPendingJobResults(actor, id) {
    this.get(actor, id);
    return Boolean(this.db.prepare('SELECT job_id FROM job_results WHERE case_id=? LIMIT 1').get(id));
  }
  pendingJobResults(actor, id) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403); this.get(actor, id);
    // Expose only recovery metadata, never a second copy of source text or output.
    return this.db.prepare('SELECT job_id,captured_at,sha256 FROM job_results WHERE case_id=? ORDER BY captured_at').all(id);
  }
  link(actor, id) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403); this.get(actor, id);
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(this.now().getTime() + 7 * 24 * 3600000).toISOString();
    this.db.prepare('INSERT INTO links(hash,case_id,expires) VALUES(?,?,?)').run(digest(token), id, expires);
    return { token, expires };
  }
  revokeLinks(actor, id) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403); this.get(actor, id);
    this.db.prepare('UPDATE links SET revoked=1 WHERE case_id=?').run(id);
  }
  delete(actor, id) {
    requireValue(actor.role === 'admin', 'FORBIDDEN', 403); const state = this.get(actor, id);
    this.db.prepare('DELETE FROM cases WHERE id=? AND tenant=?').run(id, actor.tenant);
    return state;
  }
  budget() {
    const day = this.now().toISOString().slice(0, 10);
    const used = this.db.prepare('SELECT count FROM budget WHERE day=?').get(day)?.count || 0;
    return { day, used, limit: Number.isFinite(this.limit) ? this.limit : null,
      remaining: Number.isFinite(this.limit) ? Math.max(0, this.limit - used) : Number.MAX_SAFE_INTEGER };
  }
  reserve({ inTransaction = false } = {}) {
    const reserve = () => {
      const state = this.budget(); requireValue(state.remaining, 'DAILY_LIMIT', 429);
      this.db.prepare('INSERT INTO budget VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1').run(state.day);
    };
    return inTransaction ? reserve() : this.tx(reserve);
  }
  knowledge(actor, base) {
    const row = this.db.prepare('SELECT state FROM knowledge WHERE tenant=?').get(actor.tenant);
    if (!row) return base;
    const saved = JSON.parse(row.state);
    return saved.hash === digest(JSON.stringify(base)) ? saved : {
      ...base, approval_stale: true, previously_approved_at: saved.approved_at || null };
  }
  approveKnowledge(actor, base) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    const state = { ...base, approved_by: actor.name, approved_at: this.now().toISOString(), hash: digest(JSON.stringify(base)) };
    this.db.prepare('INSERT INTO knowledge VALUES(?,?) ON CONFLICT(tenant) DO UPDATE SET state=excluded.state').run(actor.tenant, JSON.stringify(state));
    return state;
  }
  close() { this.db.close(); }
}
