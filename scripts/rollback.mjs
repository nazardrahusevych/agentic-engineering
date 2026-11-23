#!/usr/bin/env node
// Rolls one plugin back by rolling forward: restores the plugin directory exactly as it was at
// <plugin>--v<target>, publishes it under a new patch version above the current one, records it in the
// CHANGELOG, commits and tags. Users only receive a new copy when the version changes, so re-using the old
// version string would not reach anyone who already updated. See docs/releasing.md.
//
//   node scripts/rollback.mjs <plugin> <target-version> [--dry-run] [--push] [--skip-validate] [--allow-branch]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  assertCleanTree,
  assertReleaseBranch,
  compareVersions,
  git,
  insertChangelogEntry,
  locatePlugin,
  nextVersion,
  parseVersion,
  readJson,
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
  'usage: node scripts/rollback.mjs <plugin> <target-version> [--dry-run] [--push] [--skip-validate] [--allow-branch]';

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
  const [plugin, target] = positionals;
  if (!parseVersion(target)) throw new ReleaseError(`target version "${target}" is not x.y.z`);

  const root = repoRoot();
  assertCleanTree(root);
  const branch = assertReleaseBranch(root, values['allow-branch']);
  const paths = locatePlugin(root, plugin);

  const targetTag = tagName(plugin, target);
  if (!tagExists(targetTag, root)) throw new ReleaseError(`tag ${targetTag} does not exist`);

  const current = readJson(paths.manifestPath).version;
  if (!parseVersion(current)) throw new ReleaseError(`plugin.json version "${current}" is not x.y.z`);
  if (compareVersions(target, current) >= 0) {
    throw new ReleaseError(`target ${target} must be older than the current ${current}`);
  }
  const version = nextVersion(current, 'patch');
  const tag = tagName(plugin, version);
  if (tagExists(tag, root)) throw new ReleaseError(`tag ${tag} already exists`);

  console.log(`plugin   ${plugin} (${paths.relativeDir})`);
  console.log(`restore  contents of ${targetTag}`);
  console.log(`version  ${current} -> ${version}`);
  console.log(`tag      ${tag}`);
  console.log(`branch   ${branch}${values.push ? ' (will push)' : ''}`);

  if (values['dry-run']) {
    console.log('dry run: nothing written');
    return;
  }

  // The changelog keeps its full history: save it before the directory is replaced.
  const changelog = existsSync(paths.changelogPath) ? readFileSync(paths.changelogPath, 'utf8') : '# Changelog\n';

  try {
    // Remove first, then check out: files added after the target release disappear as well.
    git(['rm', '-r', '-q', '--', paths.relativeDir], root);
    git(['checkout', targetTag, '--', paths.relativeDir], root);

    writeJson(paths.manifestPath, withVersion(readJson(paths.manifestPath), version));
    writeFileSync(
      paths.changelogPath,
      insertChangelogEntry(changelog, version, today(), [
        '### Reverted',
        `- Rolled back to the contents of ${target} (tag \`${targetTag}\`), released from ${current}.`,
      ]),
    );

    if (!values['skip-validate']) {
      const { skipped } = validateWithClaude(root, paths.relativeDir);
      if (skipped) console.warn('warning: Claude Code CLI not found; skipped `claude plugin validate` (CI still runs it)');
    }

    git(['add', '-A', '--', paths.relativeDir], root);
    git(['commit', '-q', '-m', `revert(${plugin}): roll back to v${target} as v${version}`], root);
  } catch (error) {
    // The tree was clean when we started, so a hard reset discards only this script's own changes.
    git(['reset', '-q', '--hard', 'HEAD'], root);
    console.error('rollback aborted; working tree restored to HEAD');
    throw error;
  }

  git(['tag', '-a', tag, '-m', `${plugin} v${version} (rollback to v${target})`], root);
  console.log(`committed and tagged ${tag}`);
  console.log('note: .claude-plugin/marketplace.json was not changed; check the entry still describes this version');

  if (values.push) {
    git(['push', '--atomic', 'origin', 'HEAD', `refs/tags/${tag}`], root);
    console.log('pushed branch and tag to origin');
  } else {
    console.log(`next: git push --atomic origin HEAD refs/tags/${tag}`);
  }
});
