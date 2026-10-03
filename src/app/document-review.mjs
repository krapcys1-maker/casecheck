import { digest } from './store.mjs';

export const isOCRSource = source => ['ai_ocr_requires_image_review', 'human_corrected_ocr'].includes(source?.read_method);

// One effective transcription per page. Earlier sources stay immutable for citations/history.
// This also handles databases created before page review existed.
export function documentSources(state, documentId) {
  const pages = new Map();
  for (const source of state.sources.filter(s => s.document_id === documentId && !s.superseded_by)) {
    const previous = pages.get(source.page);
    if (!previous || isOCRSource(source) || !isOCRSource(previous)) pages.set(source.page, source);
  }
  return [...pages.values()].sort((a, b) => a.page - b.page);
}

export function pageReviewStatus(source, document) {
  if (!isOCRSource(source)) return 'not_required';
  const review = source.page_review;
  if (!review || review.text_sha256 !== digest(source.text) || review.document_sha256 !== document?.sha256) return 'pending';
  return review.status === 'confirmed' ? 'confirmed' : review.status === 'rejected' ? 'rejected' : 'pending';
}

export function documentReview(state, document) {
  const sources = documentSources(state, document.id);
  const needsReview = ['ocr_review', 'ocr_verified'].includes(document.status) || sources.some(isOCRSource);
  if (!needsReview) return null;
  return { document_id: document.id, pages: Array.from({ length: document.pages }, (_, i) => {
    const source = sources.find(s => s.page === i + 1 && isOCRSource(s));
    return { page: i + 1, source_id: source?.id || null,
      status: source ? pageReviewStatus(source, document) : 'missing',
      reviewed_by: source?.page_review?.reviewed_by || null, reviewed_at: source?.page_review?.reviewed_at || null };
  }) };
}

export function ocrReviewIssues(state, documentIds) {
  return (state.documents || []).filter(d => !documentIds || documentIds.includes(d.id)).flatMap(document => {
    const review = documentReview(state, document);
    return (review?.pages || []).filter(p => p.status !== 'confirmed').map(p => ({
      code: p.status === 'rejected' ? 'ocr_page_rejected' : 'ocr_page_requires_review', document_id: document.id,
      source_id: p.source_id, page: p.page }));
  });
}

export function sourceProblem(state, sourceId) {
  const source = (state.sources || []).find(s => s.id === sourceId);
  if (!source) return null; // Missing citations are validated separately by extraction/export.
  if (!source.document_id) return null;
  const document = state.documents?.find(d => d.id === source.document_id);
  if (!document) return null;
  if (!documentSources(state, document.id).some(s => s.id === source.id)) return 'superseded_source';
  const status = pageReviewStatus(source, document);
  return status === 'pending' ? 'ocr_page_requires_review' : status === 'rejected' ? 'ocr_page_rejected' : null;
}

export function claimSourceProblem(state, claim) {
  if (claim.facts.some(f => f.type !== 'unknown' && (f.source_invalidated || sourceProblem(state, f.source_id)))) return true;
  const documents = [...new Set([claim.document_id, ...(claim.source_ids || []).map(id => (state.sources || []).find(s => s.id === id)?.document_id)].filter(Boolean))];
  return ocrReviewIssues(state, documents).length > 0;
}
export function hasSourceReviewBlockers(state) {
  return ocrReviewIssues(state).length > 0 || (state.facts || []).some(f => f.current && f.type !== 'unknown' && f.review !== 'rejected' &&
    (f.source_invalidated || sourceProblem(state, f.source_id))) || (state.claims || []).some(c => !c.merged_into && c.review !== 'rejected' && claimSourceProblem(state, c));
}
