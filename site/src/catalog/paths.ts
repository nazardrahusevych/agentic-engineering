// The URL scheme and ordering live in search/browse.ts, which the browser islands also use.
export { compareText, detailPath, TYPE_ORDER } from '../search/browse.ts';

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** A name is safe when it can be a URL path segment and a file name on every platform. */
export function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name) && name.length <= 128;
}

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/** GitHub URL of a repository path at a commit. */
export function sourceUrl(repo: string, commit: string, path: string, isDir: boolean): string {
  const encoded = encodePath(path);
  return `https://github.com/${repo}/${isDir ? 'tree' : 'blob'}/${commit}${encoded ? `/${encoded}` : ''}`;
}
