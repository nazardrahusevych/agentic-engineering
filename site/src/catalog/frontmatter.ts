import { parseDocument } from 'yaml';
import { ProblemError } from './problems.ts';

export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const EMPTY_BLOCK = /^---\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Splits a markdown file into its YAML frontmatter and body.
 * A file without a `---` block has empty data. Broken YAML throws a ProblemError with the line.
 */
export function parseFrontmatter(text: string, path: string): Frontmatter {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const empty = EMPTY_BLOCK.exec(source);
  if (empty) return { data: {}, body: source.slice(empty[0].length) };
  const match = BLOCK.exec(source);
  if (!match) return { data: {}, body: source };

  const yamlText = match[1] ?? '';
  const document = parseDocument(yamlText, { prettyErrors: false });
  const error = document.errors[0];
  if (error) {
    // Line within the file: lines before the error offset, +1 for 1-based, +1 for the opening `---`.
    const offset = error.pos[0] ?? 0;
    const line = yamlText.slice(0, offset).split('\n').length + 1;
    const message = error.message.split('\n')[0] ?? 'parse error';
    throw new ProblemError(path, `invalid frontmatter: ${message} (line ${line})`);
  }
  const data: unknown = document.toJS();
  if (data === null || data === undefined) return { data: {}, body: source.slice(match[0].length) };
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new ProblemError(path, 'invalid frontmatter: expected a mapping of keys to values');
  }
  return { data: data as Record<string, unknown>, body: source.slice(match[0].length) };
}

/** Reads an optional string field from frontmatter; blank strings count as missing. */
export function stringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
