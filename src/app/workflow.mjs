import { uid, requireValue, text, digest } from './store.mjs';
import { draftSections, templates } from './domain.mjs';

export const defaultWorkflow = () => ({
  review: { templates: ['case_card', 'creditor_list', 'missing_documents'], tasks: [
    { title: 'Sprawdź informacje i źródła z wywiadu', days: 2, assignee: null },
    { title: 'Uzgodnij wierzycieli z rozmowy i dokumentów', days: 2, assignee: null } ] },
  documents: { templates: ['case_card', 'creditor_list'], tasks: [
    { title: 'Przeczytaj i zatwierdź aktualne projekty pism', days: 2, assignee: null },
    { title: 'Sprawdź komplet załączników', days: 3, assignee: null } ] },
});

export function validateWorkflow(input, state, team) {
  requireValue(input && Object.keys(input).sort().join(',') === 'documents,review', 'INVALID_WORKFLOW');
  const result = {};
  for (const stage of ['review', 'documents']) {
    const rule = input[stage];
    requireValue(rule && Array.isArray(rule.templates) && rule.templates.length <= 4 &&
      new Set(rule.templates).size === rule.templates.length && rule.templates.every(id =>
        templates.templates.some(t => t.id === id && t.id !== 'claim_clarification' && t.tracks.includes(state.track))) &&
      Array.isArray(rule.tasks) && rule.tasks.length <= 5, 'INVALID_WORKFLOW');
    result[stage] = { templates: rule.templates, tasks: rule.tasks.map(task => {
      requireValue(Number.isInteger(task.days) && task.days >= 0 && task.days <= 30 &&
        (task.assignee === null || team.some(u => u.id === task.assignee)), 'INVALID_WORKFLOW');
      return { title: text(task.title, 200), days: task.days, assignee: task.assignee };
    }) };
  }
  return result;
}

// Called inside the case transaction. A retry cannot leave half a package or duplicate it.
export function applyWorkflow(state, stage, now, team) {
  const rule = (state.workflow_rules || defaultWorkflow())[stage];
  if (!rule) return;
  const date = now.toISOString().slice(0, 10), created = { drafts: [], tasks: [] };
  for (const id of rule.templates) {
    if (state.drafts.some(d => d.template === id && d.source_revision === state.data_revision && d.status !== 'stale')) continue;
    requireValue(state.drafts.length < 50, 'DRAFT_LIMIT', 413);
    const { template, sections } = draftSections(state, id);
    const draft = { id: uid(), template: template.id, title: template.title, sections, status: 'draft',
      source_revision: state.data_revision, template_version: templates.version, content_hash: digest(JSON.stringify(sections)),
      synthetic: state.synthetic, created_at: now.toISOString(), legal_sources: template.source_ids, workflow_stage: stage };
    state.drafts.push(draft); created.drafts.push(draft.id);
  }
  for (const task of rule.tasks) {
    const key = digest(JSON.stringify([stage, task.title, task.days, task.assignee]));
    if (state.tasks.some(t => t.workflow_key === key)) continue;
    requireValue(state.tasks.length < 200, 'TASK_LIMIT', 413);
    const id = uid(), due = new Date(Date.parse(date + 'T00:00:00Z') + task.days * 86400000).toISOString().slice(0, 10);
    state.tasks.push({ id, title: task.title, kind: 'administrative', due, status: 'open',
      assignee: team.some(u => u.id === task.assignee) ? task.assignee : null, workflow_key: key, workflow_stage: stage });
    created.tasks.push(id);
  }
  state.workflow_runs ||= [];
  if (created.drafts.length || created.tasks.length) state.workflow_runs.push({ stage, at: now.toISOString(),
    data_revision: state.data_revision, ...created });
}
