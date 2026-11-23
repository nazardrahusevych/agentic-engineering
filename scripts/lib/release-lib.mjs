// Shared helpers for scripts/release.mjs and scripts/rollback.mjs.
// No dependencies: Node >= 22 built-ins only, so the scripts run the same on Windows, macOS and Linux.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export class ReleaseError extends Error {}

export const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const IS_WINDOWS = process.platform === 'win32';
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;

// ---------- versions ----------

export function parseVersion(text) {
  const match = SEMVER.exec(text ?? '');
  return match ? match.slice(1).map(Number) : null;
}

export function formatVersion(parts) {
  return parts.join('.');
}

export function compareVersions(a, b) {
  const pa = typeof a === 'string' ? parseVersion(a) : a;
  const pb = typeof b === 'string' ? parseVersion(b) : b;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Next version from the current one and a bump: "major" | "minor" | "patch" | an explicit "x.y.z".
 * `current` may be undefined for a plugin that was never released (treated as 0.0.0).
 */
export function nextVersion(current, bump) {
  const base = current === undefined ? [0, 0, 0] : parseVersion(current);
  if (!base) throw new ReleaseError(`current version "${current}" is not x.y.z`);
  const [major, minor, patch] = base;
  if (bump === 'major') return formatVersion([major + 1, 0, 0]);
  if (bump === 'minor') return formatVersion([major, minor + 1, 0]);
  if (bump === 'patch') return formatVersion([major, minor, patch + 1]);
  const explicit = parseVersion(bump);
  if (!explicit) throw new ReleaseError(`bump must be major, minor, patch or x.y.z, got "${bump}"`);
  if (current !== undefined && compareVersions(explicit, base) <= 0) {
    throw new ReleaseError(`version ${bump} must be greater than the current ${current}`);
  }
  return formatVersion(explicit);
}

/** Tag format used by `claude plugin tag`: <plugin>--v<version>. */
export function tagName(plugin, version) {
  return `${plugin}--v${version}`;
}

// ---------- manifests ----------

/** Returns a copy of plugin.json with `version` set, placed right after name/displayName. */
export function withVersion(manifest, version) {
  const result = {};
  let placed = false;
  for (const [key, value] of Object.entries(manifest)) {
    if (key === 'version') continue;
    result[key] = value;
    if (!placed && key === (manifest.displayName !== undefined ? 'displayName' : 'name')) {
      result.version = version;
      placed = true;
    }
  }
  if (!placed) result.version = version;
  return result;
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ReleaseError(`cannot read ${path}: ${error.message}`);
  }
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Locates a plugin through .claude-plugin/marketplace.json. Only relative-path sources are supported
 * (every plugin of this marketplace lives in this repository).
 */
export function locatePlugin(root, plugin) {
  if (!PLUGIN_NAME.test(plugin)) throw new ReleaseError(`"${plugin}" is not a kebab-case plugin name`);
  const marketplacePath = join(root, '.claude-plugin', 'marketplace.json');
  if (!existsSync(marketplacePath)) throw new ReleaseError(`no marketplace catalog at ${marketplacePath}`);
  const marketplace = readJson(marketplacePath);
  const entry = (marketplace.plugins ?? []).find((candidate) => candidate.name === plugin);
  if (!entry) throw new ReleaseError(`plugin "${plugin}" is not listed in .claude-plugin/marketplace.json`);
  if (entry.version !== undefined) {
    throw new ReleaseError(
      `marketplace entry "${plugin}" sets "version"; keep the version only in the plugin's plugin.json`,
    );
  }
  if (typeof entry.source !== 'string') {
    throw new ReleaseError(`plugin "${plugin}" has a non-relative source; only ./ paths can be released from here`);
  }
  const pluginRoot = marketplace.metadata?.pluginRoot;
  const relative = entry.source.startsWith('./')
    ? entry.source.slice(2)
    : pluginRoot
      ? `${pluginRoot.replace(/^\.\//, '').replace(/\/$/, '')}/${entry.source}`
      : null;
  if (!relative || relative.split('/').includes('..')) {
    throw new ReleaseError(`plugin "${plugin}" has an unsupported source "${entry.source}"`);
  }
  const dir = resolve(root, relative);
  const manifestPath = join(dir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) throw new ReleaseError(`no plugin manifest at ${manifestPath}`);
  return {
    relativeDir: relative.replace(/\/$/, '') || '.',
    dir,
    manifestPath,
    changelogPath: join(dir, 'CHANGELOG.md'),
  };
}

// ---------- changelog (Keep a Changelog style) ----------

const UNRELEASED = /^## \[Unreleased\]\s*$/i;
const RELEASE_HEADING = /^## \[\d/;
const ANY_H2 = /^## /;

function splitLines(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { lines: text.split(/\r?\n/), eol };
}

/**
 * Turns the "## [Unreleased]" section into "## [version] - date" and opens a new empty Unreleased section.
 * Fails when the Unreleased section is missing or empty, so every release documents what changed.
 */
export function releaseChangelog(text, version, date) {
  const { lines, eol } = splitLines(text);
  const start = lines.findIndex((line) => UNRELEASED.test(line));
  if (start === -1) throw new ReleaseError('CHANGELOG.md has no "## [Unreleased]" section');
  let end = lines.findIndex((line, index) => index > start && ANY_H2.test(line));
  if (end === -1) end = lines.length;
  const body = lines.slice(start + 1, end);
  if (body.every((line) => line.trim() === '')) {
    throw new ReleaseError('the "## [Unreleased]" section of CHANGELOG.md is empty; describe the changes first');
  }
  const released = [`## [Unreleased]`, '', `## [${version}] - ${date}`, ...body];
  return [...lines.slice(0, start), ...released, ...lines.slice(end)].join(eol);
}

/** Inserts a release section before the newest released version (after Unreleased, if present). */
export function insertChangelogEntry(text, version, date, bodyLines) {
  const { lines, eol } = splitLines(text);
  const section = [`## [${version}] - ${date}`, '', ...bodyLines, ''];
  let at = lines.findIndex((line) => RELEASE_HEADING.test(line));
  if (at === -1) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return [...lines, '', ...section].join(eol);
  }
  return [...lines.slice(0, at), ...section, ...lines.slice(at)].join(eol);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- git ----------

export function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new ReleaseError(`git ${args.join(' ')} failed:\n${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

export function gitSucceeds(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' }).status === 0;
}

export function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    throw new ReleaseError('not inside a git repository');
  }
}

export function assertCleanTree(cwd) {
  const status = git(['status', '--porcelain'], cwd);
  if (status) throw new ReleaseError(`working tree is not clean; commit or stash first:\n${status}`);
}

export function assertReleaseBranch(cwd, allowAnyBranch) {
  const branch = git(['branch', '--show-current'], cwd);
  if (branch !== 'main' && !allowAnyBranch) {
    throw new ReleaseError(`releases are cut from main (current: "${branch || 'detached HEAD'}"); pass --allow-branch to override`);
  }
  return branch;
}

export function tagExists(tag, cwd) {
  return gitSucceeds(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], cwd);
}

/** Released versions of a plugin, newest first, from its <plugin>--v<x.y.z> tags. */
export function releasedVersions(plugin, cwd) {
  const prefix = `${plugin}--v`;
  return git(['tag', '--list', `${prefix}*`], cwd)
    .split('\n')
    .map((tag) => tag.trim().slice(prefix.length))
    .filter((version) => parseVersion(version))
    .sort((a, b) => compareVersions(b, a));
}

// ---------- validation ----------

/** Runs `claude plugin validate` when the Claude Code CLI is installed; CI runs it regardless. */
export function validateWithClaude(cwd, pluginRelativeDir) {
  if (!SAFE_PATH.test(pluginRelativeDir)) throw new ReleaseError(`unsupported plugin path "${pluginRelativeDir}"`);
  const run = (args, inherit) => {
    const options = { cwd, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' };
    const direct = spawnSync('claude', args, options);
    // npm installs ship claude.cmd on Windows, which needs a shell; the arguments are fixed or checked above.
    if (direct.error?.code === 'ENOENT' && IS_WINDOWS) {
      return spawnSync(`claude ${args.join(' ')}`, { ...options, shell: true });
    }
    return direct;
  };
  if (run(['--version'], false).status !== 0) {
    return { skipped: true };
  }
  for (const args of [
    ['plugin', 'validate', '.'],
    ['plugin', 'validate', pluginRelativeDir, '--strict'],
  ]) {
    if (run(args, true).status !== 0) throw new ReleaseError(`claude ${args.join(' ')} failed`);
  }
  return { skipped: false };
}

// ---------- CLI plumbing ----------

export async function runCli(main) {
  try {
    await main();
  } catch (error) {
    if (error instanceof ReleaseError) {
      console.error(`error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
