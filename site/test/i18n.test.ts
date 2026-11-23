import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en.ts';

// SPEC-3 AC-2: every user-visible UI string comes from src/i18n/en.ts — components and pages hold no literal text.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx|astro)$/.test(name) ? [path] : [];
  });
}

/** The markup part of a component: Astro frontmatter, scripts, styles and comments removed. */
function markup(path: string, text: string): string {
  let out = text;
  if (path.endsWith('.astro')) out = out.replace(/^---[\s\S]*?\n---/, '');
  else out = out.slice(out.search(/return \(|=> \(/) === -1 ? 0 : out.search(/return \(|=> \(/));
  return out
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}|<!--[\s\S]*?-->/g, '');
}

/** Literal text between tags (outside `{…}`) and literal text attributes. */
export function literalTexts(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/>([^<>{}]+)</g)) {
    const text = match[1]!.trim();
    // Punctuation and separators between expressions ("·", "(", ")", ",") are not words; fragments with code
    // characters come from generics or ternaries between JSX expressions, not from markup.
    if (/[A-Za-z]{2,}/.test(text) && !/[;=?&|]|^\(/.test(text)) found.push(text);
  }
  for (const match of source.matchAll(/\b(aria-label|placeholder|title|alt)="([^"]*)"/g)) {
    if (/[A-Za-z]{2,}/.test(match[2]!)) found.push(`${match[1]}="${match[2]}"`);
  }
  return found;
}

describe('UI strings live in src/i18n/en.ts (SPEC-3 AC-2)', () => {
  const root = join(process.cwd(), 'src');
  const sources = [...files(join(root, 'components')), ...files(join(root, 'pages')), ...files(join(root, 'layouts'))];

  it('finds the component and page files', () => {
    expect(sources.length).toBeGreaterThanOrEqual(12);
  });

  for (const path of sources) {
    it(`${relative(root, path).replaceAll('\\', '/')} has no literal UI text`, () => {
      expect(literalTexts(markup(path, readFileSync(path, 'utf8')))).toEqual([]);
    });
  }

  it('the scanner catches literal text and attributes', () => {
    expect(literalTexts('<p>Hello there</p><input placeholder="Type here" /><span>{t.x}</span><b> · </b>')).toEqual([
      'Hello there',
      'placeholder="Type here"',
    ]);
  });

  it('strings with values are functions (AC-3)', () => {
    expect(en.search.count(1)).toBe('1 artifact');
    expect(en.search.count(3)).toBe('3 artifacts');
    expect(en.detail.siblingsHeading('alpha')).toBe('Other artifacts in alpha');
  });
});
