import type { ArtifactType } from './types.ts';

/** Landing order of the types (AC-15): plugins first, then components grouped by type. */
export const TYPE_ORDER: readonly ArtifactType[] = ['plugin', 'skill', 'agent', 'command', 'hooks', 'mcp'];

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** A name is safe when it can be a URL path segment and a file name on every platform. */
export function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name) && name.length <= 128;
}

const SEGMENT: Record<Exclude<ArtifactType, 'plugin' | 'hooks'>, string> = {
  skill: 'skills',
  agent: 'agents',
  command: 'commands',
  mcp: 'mcp',
};

/** Detail page path relative to the site base (AC-26). Deterministic: depends only on type, plugin and name. */
export function detailPath(type: ArtifactType, plugin: string, name: string): string {
  if (type === 'plugin') return `plugins/${plugin}/`;
  if (type === 'hooks') return `plugins/${plugin}/hooks/`;
  return `plugins/${plugin}/${SEGMENT[type]}/${name}/`;
}

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/** GitHub URL of a repository path at a commit. */
export function sourceUrl(repo: string, commit: string, path: string, isDir: boolean): string {
  const encoded = encodePath(path);
  return `https://github.com/${repo}/${isDir ? 'tree' : 'blob'}/${commit}${encoded ? `/${encoded}` : ''}`;
}

/** Code-point comparison of lowercased text, then raw text: stable across locales. */
export function compareText(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  if (a !== b) return a < b ? -1 : 1;
  return 0;
}
