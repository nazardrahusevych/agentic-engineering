import { FILTER_KEYS } from './browse.ts';
import type { UrlState } from './url-state.ts';

/** File name of the issue form in `.github/ISSUE_TEMPLATE/`. */
export const REQUEST_TEMPLATE = 'artifact-request.yml';

/** `type: skill, agent; plugin: beta` — the active filters as one line of text. */
export function describeFilters(state: UrlState): string {
  return FILTER_KEYS.filter((key) => state.filters[key].length > 0)
    .map((key) => `${key}: ${state.filters[key].join(', ')}`)
    .join('; ');
}

/**
 * The new-issue URL of the request form, pre-filled with the query and the filters (AC-17). Everything is
 * encoded as URL parameters; nothing from the query becomes markup.
 */
export function requestIssueUrl(repo: string, state: UrlState): string {
  const q = state.q.trim();
  const params = new URLSearchParams({
    template: REQUEST_TEMPLATE,
    title: `Request: ${q}`,
    query: q,
    filters: describeFilters(state),
  });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}
