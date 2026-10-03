import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { Application } from './app/application.mjs';
import { AppError, requireValue } from './app/store.mjs';
import { root, publicCase, reviewSummary, knowledge } from './app/domain.mjs';
import { safeFile, deleteFile } from './app/files.mjs';
import { renderDraft } from './app/pdf.mjs';
import { reviewPackage } from './app/review-package.mjs';
import { documentReview } from './app/document-review.mjs';
import { renderDraftDocx } from './app/docx.mjs';
import { templateFields } from './app/firm-templates.mjs';
import { clientFileVisible, releaseAvailable } from './app/portal.mjs';
import { KEY_NAMES, providerConfig, ExtractionError } from './ai/extraction.mjs';
import { Spend } from './ai/spend.mjs';

export function readBody(request, max = 512 * 1024, json = true) {
  if (json) requireValue(/^application\/json(?:;|$)/i.test(request.headers['content-type'] || ''), 'JSON_REQUIRED', 415);
  return new Promise((resolveBody, reject) => {
    const chunks = []; let length = 0, settled = false;
    request.on('data', chunk => {
      if (settled) return;
      length += chunk.length;
      if (length > max) { settled = true; reject(new AppError(413, 'BODY_LIMIT')); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return; settled = true;
      const buffer = Buffer.concat(chunks);
      if (!json) { resolveBody(buffer); return; }
      try {
        const input = JSON.parse(buffer.toString());
        requireValue(input && !Array.isArray(input) && typeof input === 'object'); resolveBody(input);
      } catch { reject(new AppError(400, 'INVALID_JSON')); }
    });
    for (const event of ['error', 'aborted']) request.on(event, () => { if (!settled) { settled = true; reject(new AppError(400, 'REQUEST_ERROR')); } });
  });
}

export async function createAppServer({ env = process.env, stateDir = env.CASECHECK_APP_STATE_DIR || resolve(root, 'data/local/app'),
  now, extract, conversation, ocr, reader, secure = true } = {}) {
  const limit = Number(env.CASECHECK_DAILY_REQUEST_LIMIT || 20);
  requireValue(Number.isInteger(limit) && limit >= 0 && limit <= 100 && (limit !== 0 || Number(env.CASECHECK_AI_USD_LIMIT) > 0), 'INVALID_CONFIG');
  const app = new Application({ env, stateDir, now, extract, conversation, ocr, reader, limit: limit === 0 ? Infinity : limit });
  const caseResponse = (state, actor) => publicCase(actor.role === 'client' ? state : {
    ...state, recoverable_jobs: app.store.pendingJobResults(actor, state.id),
    document_reviews: (state.documents || []).map(d => documentReview(state, d)).filter(Boolean) }, actor);
  await app.store.bootstrap(env.CASECHECK_ADMIN_EMAIL || 'admin@casecheck.local', env.CASECHECK_ADMIN_PASSWORD || env.CASECHECK_ACCESS_TOKEN);
  const base = env.CASECHECK_APP_BASE_PATH || '/casecheck';
  requireValue(base === '' || /^\/[a-zA-Z0-9_-]+$/.test(base), 'INVALID_CONFIG');
  const origin = env.CASECHECK_PUBLIC_ORIGIN;
  if (origin) requireValue(new URL(origin).origin === origin, 'INVALID_CONFIG');
  const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/document-review.js', ['document-review.js', 'text/javascript; charset=utf-8']],
    ['/workspace.js', ['workspace.js', 'text/javascript; charset=utf-8']],
    ['/form-state.js', ['form-state.js', 'text/javascript; charset=utf-8']],
    ['/conversation.js', ['conversation.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']]].map(([path, [name, type]]) => [path, { body: readFileSync(resolve(root, 'web-app', name)), type }]));
  for (const name of ['pdf.mjs', 'pdf.worker.mjs']) assets.set('/' + name, {
    body: readFileSync(resolve(root, 'node_modules/pdfjs-dist/build', name)), type: 'text/javascript; charset=utf-8' });
  const secrets = Object.entries(env).filter(([key, val]) => /KEY|TOKEN|PASSWORD|SECRET/.test(key) && typeof val === 'string' && val.length >= 16).map(([, v]) => v);
  const serialize = object => { let output = JSON.stringify(object); for (const secret of secrets) output = output.split(secret).join('[REDACTED]'); return output; };
  let loginWindow = Date.now(), loginAttempts = 0, loginActive = 0;
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 80000, headersTimeout: 10000 }, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY'); response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; font-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const send = (status, object) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(serialize(object)); };
    try {
      const url = new URL(request.url, 'http://localhost'); requireValue(!url.search, 'QUERY_NOT_ALLOWED');
      if (url.pathname === base && ['GET', 'HEAD'].includes(request.method)) { response.writeHead(308, { Location: base + '/' }); response.end(); return; }
      requireValue(url.pathname.startsWith(base + '/'), 'NOT_FOUND', 404);
      const path = url.pathname.slice(base.length);
      if (path === '/healthz' && request.method === 'GET') { send(200, { ok: true, edition: 'intake-v1' }); return; }
      if (assets.has(path) && ['GET', 'HEAD'].includes(request.method)) {
        const asset = assets.get(path); response.writeHead(200, { 'Content-Type': asset.type }); response.end(request.method === 'HEAD' ? undefined : asset.body); return;
      }
      requireValue(path.startsWith('/api/'), 'NOT_FOUND', 404);
      if (request.headers.origin && origin) requireValue(request.headers.origin === origin, 'FOREIGN_ORIGIN', 403);
      if (path === '/api/login' && request.method === 'POST') {
        if (Date.now() - loginWindow > 60000) { loginWindow = Date.now(); loginAttempts = 0; }
        requireValue(++loginAttempts <= 10 && loginActive < 2, 'LOGIN_RATE_LIMIT', 429);
        const input = await readBody(request, 4096); loginActive++;
        try { send(200, await app.store.login(input.email, input.password)); } finally { loginActive--; }
        return;
      }
      const auth = request.headers.authorization || '';
      requireValue(auth.startsWith('Bearer ') && auth.length <= 300, 'UNAUTHORIZED', 401);
      const token = auth.slice(7), actor = app.store.auth(token), staff = actor.role !== 'client';
      if (path === '/api/me' && request.method === 'GET') { send(200, { user: actor }); return; }
      if (path === '/api/activity' && request.method === 'GET') { send(200, app.activity.feed(actor)); return; }
      if (path === '/api/activity/read' && request.method === 'POST') { send(200, app.activity.markRead(actor, await readBody(request, 8192))); return; }
      if (path === '/api/logout' && request.method === 'POST') { app.store.logout(token); send(200, { ok: true }); return; }
      if (path === '/api/config' && request.method === 'GET') {
        const providers = Object.keys(KEY_NAMES).flatMap(provider => { try { return [{ provider, model: providerConfig(provider, env).model }]; } catch { return []; } });
        let spend = null;
        if (staff && env.CASECHECK_AI_USD_LIMIT !== undefined) { const ledger = new Spend(env); try { spend = ledger.state(); } finally { ledger.close(); } }
        send(200, { providers, budget: staff ? app.store.budget() : null, busy: app.busy,
          spend,
          knowledge: staff ? app.store.knowledge(actor, knowledge) : { intake: knowledge.intake },
          ...(staff ? { firm_templates: app.firmTemplates.list(actor), template_fields: templateFields } : {}),
          notice: 'Asystent przekazuje do DeepSeek V4.1 Flash Twoją wiadomość, do 12 poprzednich wiadomości tej rozmowy oraz zapisane, widoczne dla klienta ustalenia. Odczyt dokumentu przekazuje wybrane fragmenty, a OCR obrazy wszystkich stron wskazanego pliku do DeepSeek. Klucze pozostają na serwerze. W pilotażu używaj danych fikcyjnych.',
          app_mode: 'pilot', secure }); return;
      }
      if (path === '/api/users') {
        if (request.method === 'GET') { send(200, { users: app.store.users(actor) }); return; }
        if (request.method === 'POST') { send(201, await app.store.addUser(actor, await readBody(request, 4096))); return; }
      }
      if (path === '/api/team' && request.method === 'GET') { send(200, { team: app.store.team(actor) }); return; }
      if (path === '/api/users/disable' && request.method === 'POST') { const input = await readBody(request, 4096); app.store.disableUser(actor, input.user_id); send(200, { ok: true }); return; }
      if (path === '/api/knowledge/approve' && request.method === 'POST') { send(200, app.store.approveKnowledge(actor, knowledge)); return; }
      if (path === '/api/seed' && request.method === 'POST') { send(200, app.seed(actor)); return; }
      if (path === '/api/firm-templates' && request.method === 'POST') { send(200, app.firmTemplates.save(actor, await readBody(request, 100000))); return; }
      if (path === '/api/firm-templates/approve' && request.method === 'POST') { send(200, app.firmTemplates.approve(actor, await readBody(request, 4096))); return; }
      if (path === '/api/firm-templates/history' && request.method === 'POST') { const input = await readBody(request, 4096); send(200, { versions: app.firmTemplates.history(actor, input.id) }); return; }
      if (path === '/api/cases') {
        if (request.method === 'GET') { send(200, { cases: app.store.list(actor).map(c => ({ ...c,
          summary: reviewSummary(app.store.get(actor, c.id), app.store.now().toISOString().slice(0, 10)) })) }); return; }
        if (request.method === 'POST') { send(201, caseResponse(app.create(actor, await readBody(request, 4096)), actor)); return; }
      }
      const match = /^\/api\/cases\/([a-f0-9-]{36})(?:\/([a-z-]+)(?:\/([a-f0-9-]{36}))?)?$/.exec(path);
      requireValue(match, 'NOT_FOUND', 404);
      const [, id, action, resourceId] = match; const state = app.store.get(actor, id);
      if (!action && request.method === 'GET') { send(200, caseResponse(state, actor)); return; }
      if (!action && request.method === 'DELETE') {
        requireValue(Number(request.headers['x-case-revision']) === state.revision, 'VERSION_CONFLICT', 409);
        const removed = app.store.delete(actor, id); for (const doc of removed.documents || []) deleteFile(stateDir, doc.id);
        send(200, { ok: true }); return;
      }
      if (action === 'history' && request.method === 'GET') { send(200, { history: app.store.history(actor, id) }); return; }
      if (action === 'review-package' && request.method === 'GET') {
        requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
        send(200, reviewPackage(state, app.store.now().toISOString())); return;
      }
      if (action === 'export' && request.method === 'GET') { requireValue(staff, 'FORBIDDEN', 403); send(200, { schema: 'casecheck-export-v1', case: state }); return; }
      if (action === 'files' && resourceId && request.method === 'GET') {
        const doc = state.documents?.find(d => d.id === resourceId); requireValue(doc, 'NOT_FOUND', 404);
        requireValue(staff || clientFileVisible(doc), 'NOT_FOUND', 404);
        response.writeHead(200, { 'Content-Type': { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', text: 'text/plain; charset=utf-8' }[doc.kind],
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}` });
        response.end(readFileSync(safeFile(stateDir, doc.id))); return;
      }
      if (action === 'pdf' && resourceId && request.method === 'GET') {
        requireValue(staff, 'FORBIDDEN', 403); const draft = state.drafts.find(d => d.id === resourceId); requireValue(draft, 'NOT_FOUND', 404);
        const pdf = await renderDraft(draft, state); response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="casecheck-projekt.pdf"' });
        response.end(pdf); return;
      }
      if (action === 'docx' && resourceId && request.method === 'GET') {
        requireValue(staff, 'FORBIDDEN', 403); const draft = state.drafts.find(d => d.id === resourceId); requireValue(draft, 'NOT_FOUND', 404);
        const bytes = await renderDraftDocx(draft, state); response.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="casecheck-projekt.docx"' });
        response.end(bytes); return;
      }
      if (action === 'client-pdf' && resourceId && request.method === 'GET') {
        const release = state.client_releases?.find(r => r.id === resourceId);
        requireValue(release && releaseAvailable(release, state), 'DOCUMENT_UNAVAILABLE', 409);
        const draft = state.drafts.find(d => d.id === release.draft_id), pdf = await renderDraft(draft, state);
        response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="casecheck-dokument.pdf"' }); response.end(pdf); return;
      }
      if (action === 'upload' && request.method === 'POST') {
        const body = await readBody(request, 8 * 1024 * 1024, false);
        let name; try { name = decodeURIComponent(request.headers['x-file-name'] || ''); } catch { throw new AppError(400, 'INVALID_FILENAME'); }
        send(201, caseResponse(await app.upload(actor, id, Number(request.headers['x-case-revision']), body, name), actor)); return;
      }
      requireValue(request.method === 'POST', 'NOT_FOUND', 404);
      const input = await readBody(request);
      const actions = {
        consent: () => app.consent(actor, id, input), messages: () => app.chat(actor, id, input),
        'assistant-message': () => app.assistantMessage(actor, id, input),
        'staff-reply': () => app.portal.reply(actor, id, input),
        'client-request': () => app.portal.request(actor, id, input),
        'request-response': () => app.portal.respond(actor, id, input),
        'request-review': () => app.portal.reviewRequest(actor, id, input),
        'share-draft': () => app.portal.share(actor, id, input),
        'revoke-release': () => app.portal.revoke(actor, id, input),
        'acknowledge-release': () => app.portal.acknowledge(actor, id, input),
        'file-visibility': () => app.portal.fileVisibility(actor, id, input),
        analyze: () => { requireValue(staff, 'FORBIDDEN', 403); return app.analyze(actor, id, input); },
        'recover-job': () => app.recoverJob(actor, id, input),
        'review-ocr-page': () => app.reviewOCRPage(actor, id, input),
        'correct-ocr-page': () => app.correctOCRPage(actor, id, input),
        ocr: () => app.runOCR(actor, id, input), 'review-fact': () => app.reviewFact(actor, id, input),
        correction: () => app.correction(actor, id, input), 'review-claim': () => app.reviewClaim(actor, id, input),
        'correct-claim': () => app.correctClaim(actor, id, input),
        merge: () => app.merge(actor, id, input), drafts: () => app.draft(actor, id, input),
        'edit-draft': () => app.editDraft(actor, id, input), 'approve-draft': () => app.approveDraft(actor, id, input),
        tasks: () => app.task(actor, id, input), stage: () => app.stage(actor, id, input),
        registry: () => app.registry(actor, id, input),
      };
      if (action === 'preview') { requireValue(staff, 'FORBIDDEN', 403); send(200, app.preview(actor, id, input)); return; }
      if (action === 'link') { send(201, app.store.link(actor, id)); return; }
      if (action === 'revoke-links') { app.store.revokeLinks(actor, id); send(200, { ok: true }); return; }
      requireValue(Object.hasOwn(actions, action), 'NOT_FOUND', 404);
      send(200, caseResponse(await actions[action](), actor));
    } catch (error) {
      if (response.writableEnded || response.destroyed) return;
      send(error instanceof AppError ? error.status : error instanceof ExtractionError ? 400 : 500,
        { error: error instanceof AppError || error instanceof ExtractionError ? error.code : 'SERVER_ERROR' });
    }
  });
  server.maxConnections = 32; server.keepAliveTimeout = 5000; server.app = app;
  server.on('close', () => { app.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    try { loadEnvFile(resolve(root, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const port = Number(process.env.CASECHECK_APP_PORT || 8861);
    requireValue(Number.isInteger(port) && port >= 1024 && port <= 65535, 'INVALID_CONFIG');
    const server = await createAppServer();
    server.listen(port, '127.0.0.1', () => console.log(`CaseCheck intake v1 listening on loopback port ${port}.`));
    server.on('error', () => { console.error('CaseCheck startup failed. Configuration values are not logged.'); process.exit(1); });
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 65000).unref(); });
  } catch { console.error('CaseCheck configuration or state is invalid. See deployment instructions.'); process.exit(1); }
}
