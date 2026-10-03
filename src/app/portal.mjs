import { uid, text, requireValue, validDate, digest } from './store.mjs';
import { hasSourceReviewBlockers } from './document-review.mjs';
import { validDraftContent } from './draft-content.mjs';

export const draftReady = (draft, state) => Boolean(draft && validDraftContent(draft.sections) && draft.status === 'approved' && draft.source_revision === state.data_revision &&
  draft.content_hash === digest(JSON.stringify(draft.sections)) && !hasSourceReviewBlockers(state));
export const clientFileVisible = doc => Boolean(doc && doc.client_visible !== false);
export function releaseAvailable(release, state) {
  const draft = state.drafts.find(d => d.id === release.draft_id);
  return release.status === 'active' && draftReady(draft, state) && release.content_hash === draft.content_hash && release.source_revision === draft.source_revision;
}
export function portalView(state) {
  return { requests: state.client_requests || [], releases: (state.client_releases || []).map(r => ({
    id: r.id, title: r.title, shared_at: r.shared_at, shared_by: r.shared_by, read_at: r.read_at || null,
    content_hash: r.content_hash, source_revision: r.source_revision, available: releaseAvailable(r, state),
    status: r.status === 'revoked' ? 'revoked' : releaseAvailable(r, state) ? 'available' : 'outdated' })) };
}

export class Portal {
  constructor(store) { this.store = store; }
  reply(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'staff_reply', state => {
      requireValue(state.messages.length < 400, 'MESSAGE_LIMIT', 413);
      state.messages.push({ id: uid(), role: 'staff', author: actor.name, text: text(input.text, 12000), at: this.store.now().toISOString() });
    }, { invalidate: false });
  }
  request(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'client_request_created', state => {
      state.client_requests ||= []; requireValue(state.client_requests.length < 100, 'REQUEST_LIMIT', 413);
      requireValue(!input.target_date || validDate(input.target_date), 'INVALID_DATE');
      state.client_requests.push({ id: uid(), title: text(input.title, 200), description: text(input.description || '', 4000, true),
        target_date: input.target_date || null, status: 'open', created_at: this.store.now().toISOString(), created_by: actor.name, responses: [] });
    }, { invalidate: false });
  }
  respond(actor, id, input) {
    requireValue(actor.role === 'client', 'CLIENT_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'client_request_answered', state => {
      const request = state.client_requests?.find(r => r.id === input.request_id);
      requireValue(request && request.status !== 'accepted', 'REQUEST_NOT_OPEN', 409);
      const content = text(input.text || '', 4000, true), documentIds = input.document_ids || [];
      requireValue(Array.isArray(documentIds) && documentIds.length <= 20 && new Set(documentIds).size === documentIds.length);
      requireValue(content || documentIds.length, 'RESPONSE_REQUIRED');
      requireValue(documentIds.every(docId => state.documents?.some(d => d.id === docId && clientFileVisible(d))), 'INVALID_DOCUMENTS');
      requireValue(request.responses.length < 50 && state.messages.length < 400, 'MESSAGE_LIMIT', 413);
      let source;
      if (content) {
        requireValue(state.sources.length < 240, 'SOURCE_LIMIT', 413);
        source = { id: uid(), text: content, kind: 'message', title: `Odpowiedź na prośbę: ${request.title}`, page: null, document_id: null, read_method: 'text' };
        state.sources.push(source);
      }
      const at = this.store.now().toISOString();
      request.responses.push({ id: uid(), text: content, document_ids: documentIds, source_id: source?.id || null, at });
      request.status = 'submitted'; delete request.review_note; delete request.reviewed_at; delete request.reviewed_by;
      state.messages.push({ id: uid(), role: 'user', text: content || `Przekazano ${documentIds.length} dokumentów: ${request.title}`,
        request_id: request.id, source_id: source?.id || null, at });
    });
  }
  reviewRequest(actor, id, input) {
    requireValue(actor.role !== 'client', 'FORBIDDEN', 403);
    return this.store.update(actor, id, input.revision, 'client_request_reviewed', state => {
      const request = state.client_requests?.find(r => r.id === input.request_id);
      requireValue(request && ['accepted', 'open'].includes(input.status), 'INVALID_REQUEST_REVIEW');
      requireValue(input.status !== 'accepted' || request.status === 'submitted', 'REQUEST_NOT_SUBMITTED', 409);
      request.review_note = text(input.note || '', 2000, input.status === 'accepted');
      request.status = input.status; request.reviewed_by = actor.name; request.reviewed_at = this.store.now().toISOString();
    }, { invalidate: false });
  }
  share(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'draft_shared_with_client', state => {
      const draft = state.drafts.find(d => d.id === input.draft_id);
      requireValue(draftReady(draft, state), 'DRAFT_NOT_SHAREABLE', 409);
      state.client_releases ||= []; requireValue(state.client_releases.length < 100, 'RELEASE_LIMIT', 413);
      requireValue(!state.client_releases.some(r => r.draft_id === draft.id && releaseAvailable(r, state)), 'ALREADY_SHARED', 409);
      state.client_releases.push({ id: uid(), draft_id: draft.id, title: draft.title, content_hash: draft.content_hash,
        source_revision: draft.source_revision, shared_at: this.store.now().toISOString(), shared_by: actor.name, status: 'active' });
    }, { invalidate: false });
  }
  revoke(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'client_release_revoked', state => {
      const release = state.client_releases?.find(r => r.id === input.release_id); requireValue(release, 'NOT_FOUND', 404);
      release.status = 'revoked'; release.revoked_at = this.store.now().toISOString(); release.revoked_by = actor.name;
    }, { invalidate: false });
  }
  acknowledge(actor, id, input) {
    requireValue(actor.role === 'client', 'CLIENT_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'client_document_read', state => {
      const release = state.client_releases?.find(r => r.id === input.release_id);
      requireValue(release && releaseAvailable(release, state), 'DOCUMENT_UNAVAILABLE', 409);
      release.read_at ||= this.store.now().toISOString();
    }, { invalidate: false });
  }
  fileVisibility(actor, id, input) {
    requireValue(actor.role === 'lawyer', 'LAWYER_REQUIRED', 403);
    return this.store.update(actor, id, input.revision, 'file_client_visibility', state => {
      const doc = state.documents?.find(d => d.id === input.document_id);
      requireValue(doc && typeof input.visible === 'boolean', 'INVALID_DOCUMENTS');
      requireValue(doc.uploaded_by_role !== 'client' || input.visible, 'CLIENT_FILE_VISIBILITY');
      doc.client_visible = input.visible;
    }, { invalidate: false });
  }
}
