import { requireValue } from './store.mjs';

export function validDraftContent(sections) {
  return Array.isArray(sections) && sections.length > 0 && sections.length <= 30 && sections.every(p =>
    p && typeof p.heading === 'string' && p.heading.trim().length > 0 && p.heading.length <= 200 &&
    typeof p.text === 'string' && p.text.trim().length > 0 && p.text.length <= 20000) && JSON.stringify(sections).length <= 100000;
}
export function validateDraftContent(sections) { requireValue(validDraftContent(sections), 'INVALID_DRAFT_CONTENT'); }
