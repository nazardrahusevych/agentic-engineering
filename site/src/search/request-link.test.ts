import { describe, expect, it } from 'vitest';
import { emptyFilters } from './browse.ts';
import { requestIssueUrl } from './request-link.ts';

describe('requestIssueUrl (AC-17)', () => {
  it('points to the issue form with the encoded query and filters', () => {
    const url = requestIssueUrl('owner/repo', {
      q: 'terraform drift',
      filters: { ...emptyFilters(), type: ['skill', 'agent'], plugin: ['beta'] },
    });
    expect(url).toBe(
      'https://github.com/owner/repo/issues/new?template=artifact-request.yml&title=Request%3A+terraform+drift' +
        '&query=terraform+drift&filters=type%3A+skill%2C+agent%3B+plugin%3A+beta',
    );
    const params = new URL(url).searchParams;
    expect(params.get('filters')).toBe('type: skill, agent; plugin: beta');
  });

  it('keeps HTML in the query as an encoded parameter', () => {
    const url = requestIssueUrl('owner/repo', { q: '<img src=x onerror=alert(1)>', filters: emptyFilters() });
    expect(url).not.toContain('<');
    expect(url).not.toContain('>');
    expect(new URL(url).searchParams.get('query')).toBe('<img src=x onerror=alert(1)>');
    expect(new URL(url).searchParams.get('filters')).toBe('');
  });
});
