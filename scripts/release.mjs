#!/usr/bin/env node
// Releases one plugin: bumps the version in its plugin.json, moves the CHANGELOG "Unreleased" notes under the
// new version, commits, and creates the annotated tag <plugin>--v<version>. See docs/releasing.md.
//
//   node scripts/release.mjs <plugin> <major|minor|patch|x.y.z> [--dry-run] [--push] [--skip-validate] [--allow-branch]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  assertCleanTree,
  assertReleaseBranch,
  git,
  gitSucceeds,
  locatePlugin,
  nextVersion,
  readJson,
  releaseChangelog,
  releasedVersions,
  ReleaseError,
  repoRoot,
  runCli,
  tagExists,
  tagName,
  today,
  validateWithClaude,
  withVersion,
  writeJson,
} from './lib/release-lib.mjs';

const USAGE =
  'usage: node scripts/release.mjs <plugin> <major|minor|patch|x.y.z> [--dry-run] [--push] [--skip-validate] [--allow-branch]';

await runCli(async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      push: { type: 'boolean', default: false },
      'skip-validate': { type: 'boolean', default: false },
      'allow-branch': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals.length !== 2) throw new ReleaseError(USAGE);
  const [plugin, bump] = positionals;

  const root = repoRoot();
  assertCleanTree(root);
  const branch = assertReleaseBranch(root, values['allow-branch']);
  const paths = locatePlugin(root, plugin);

  const manifest = readJson(paths.manifestPath);
  const current = manifest.version;
  const version = nextVersion(current, bump);
  const tag = tagName(plugin, version);
  if (tagExists(tag, root)) throw new ReleaseError(`tag ${tag} already exists`);

  const [lastReleased] = releasedVersions(plugin, root);
  if (lastReleased) {
    if (current !== lastReleased) {
      console.warn(`warning: plugin.json says ${current ?? '(none)'}, the newest tag says ${lastReleased}`);
    }
    const lastTag = tagName(plugin, lastReleased);
    if (gitSucceeds(['diff', '--quiet', lastTag, 'HEAD', '--', paths.relativeDir], root)) {
      throw new ReleaseError(`nothing changed in ${paths.relativeDir} since ${lastTag}`);
    }
  }

  if (!existsSync(paths.changelogPath)) {
    throw new ReleaseError(`${paths.relativeDir}/CHANGELOG.md is missing; create it with a "## [Unreleased]" section`);
  }
  const changelog = releaseChangelog(readFileSync(paths.changelogPath, 'utf8'), version, today());

  console.log(`plugin   ${plugin} (${paths.relativeDir})`);
  console.log(`version  ${current ?? '(none)'} -> ${version}`);
  console.log(`tag      ${tag}`);
  console.log(`branch   ${branch}${values.push ? ' (will push)' : ''}`);

  if (values['dry-run']) {
    console.log('dry run: nothing written');
    return;
  }

  try {
    writeJson(paths.manifestPath, withVersion(manifest, version));
    writeFileSync(paths.changelogPath, changelog);
    // Validate what will be released (a first release has no version until now, which --strict rejects).
    if (!values['skip-validate']) {
      const { skipped } = validateWithClaude(root, paths.relativeDir);
      if (skipped) console.warn('warning: Claude Code CLI not found; skipped `claude plugin validate` (CI still runs it)');
    }
    git(['add', '--', paths.manifestPath, paths.changelogPath], root);
    git(['commit', '-q', '-m', `release(${plugin}): v${version}`], root);
  } catch (error) {
    // The tree was clean when we started, so a hard reset discards only this script's own changes.
    git(['reset', '-q', '--hard', 'HEAD'], root);
    console.error('release aborted; working tree restored to HEAD');
    throw error;
  }
  git(['tag', '-a', tag, '-m', `${plugin} v${version}`], root);
  console.log(`committed and tagged ${tag}`);

  if (values.push) {
    git(['push', '--atomic', 'origin', 'HEAD', `refs/tags/${tag}`], root);
    console.log('pushed branch and tag to origin');
  } else {
    console.log(`next: git push --atomic origin HEAD refs/tags/${tag}`);
  }
});
