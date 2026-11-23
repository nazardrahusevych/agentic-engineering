import { execFileSync } from 'node:child_process';

export interface BuildInfo {
  commit: string;
  /** ISO 8601 commit date; equals `builtAt` when git is unavailable. */
  commitDate: string;
  builtAt: string;
}

export interface BuildInfoResult {
  buildInfo: BuildInfo;
  warnings: string[];
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * Reads the commit the catalog is built from (AC-9). `CATALOG_COMMIT` and `CATALOG_COMMIT_DATE` override git.
 * Outside a git checkout the commit is `unknown` and a warning is returned.
 */
export function readBuildInfo(cwd: string, env: Record<string, string | undefined>, now = new Date()): BuildInfoResult {
  const builtAt = now.toISOString();
  const warnings: string[] = [];
  let commit = env.CATALOG_COMMIT?.trim() || '';
  let commitDate = env.CATALOG_COMMIT_DATE?.trim() || '';
  if (!commit || !commitDate) {
    try {
      if (!commit) commit = git(cwd, ['rev-parse', 'HEAD']);
      if (!commitDate) commitDate = new Date(git(cwd, ['show', '-s', '--format=%cI', 'HEAD'])).toISOString();
    } catch {
      warnings.push('git metadata is unavailable; the footer shows commit "unknown"');
      commit ||= 'unknown';
      commitDate ||= builtAt;
    }
  } else {
    commitDate = new Date(commitDate).toISOString();
  }
  return { buildInfo: { commit, commitDate, builtAt }, warnings };
}
