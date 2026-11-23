import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter.ts';
import { markdownToText, renderMarkdown } from './markdown.ts';

const ctx = { repo: 'owner/repo', commit: 'abc1234', fileDir: 'plugins/beta/skills/unsafe-markdown' };
const unsafe = parseFrontmatter(
  readFileSync(resolve('test/fixtures/marketplace/plugins/beta/skills/unsafe-markdown/SKILL.md'), 'utf8'),
  'SKILL.md',
).body;

describe('renderMarkdown (Untrusted inputs, AC-27)', () => {
  const html = renderMarkdown(unsafe, ctx);

  it('drops scripts, event handlers, iframes and raw HTML', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son\w+=/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/<div/i);
    expect(html).not.toMatch(/alert\(/);
  });

  it('removes javascript: links but keeps their text', () => {
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('A javascript link');
  });

  it('turns images into links and never renders <img>', () => {
    expect(html).not.toMatch(/<img/i);
    expect(html).toMatch(/<a href="https:\/\/example\.com\/tracker\.png"[^>]*>External image<\/a>/);
  });

  it('rewrites relative links to GitHub at the commit', () => {
    expect(html).toContain(
      'href="https://github.com/owner/repo/blob/abc1234/plugins/beta/skills/unsafe-markdown/notes/guide.md"',
    );
  });

  it('opens external links with noopener noreferrer', () => {
    expect(html).toContain('<a href="https://example.com/docs" rel="noopener noreferrer" target="_blank">');
  });

  it('drops relative links that leave the repository', () => {
    const out = renderMarkdown('[up](../../../../../etc/passwd)', { ...ctx, fileDir: 'plugins/a' });
    expect(out).not.toContain('href');
  });

  it('renders GFM tables', () => {
    const out = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n', ctx);
    expect(out).toContain('<table>');
    expect(out).toContain('<td>1</td>');
  });
});

describe('markdownToText', () => {
  it('returns plain text with collapsed whitespace and no raw HTML', () => {
    expect(markdownToText('# Title\n\nSome **bold**\ntext.\n\n<script>x()</script>\n\n- item')).toBe(
      'Title Some bold text. item',
    );
  });
});
