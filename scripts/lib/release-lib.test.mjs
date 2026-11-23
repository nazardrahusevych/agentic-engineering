import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compareVersions,
  insertChangelogEntry,
  nextVersion,
  releaseChangelog,
  ReleaseError,
  tagName,
  withVersion,
} from './release-lib.mjs';

describe('nextVersion', () => {
  it('bumps major, minor and patch', () => {
    assert.equal(nextVersion('1.2.3', 'major'), '2.0.0');
    assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0');
    assert.equal(nextVersion('1.2.3', 'patch'), '1.2.4');
  });

  it('starts from 0.0.0 for a plugin without a version', () => {
    assert.equal(nextVersion(undefined, 'minor'), '0.1.0');
    assert.equal(nextVersion(undefined, '1.0.0'), '1.0.0');
  });

  it('accepts an explicit greater version only', () => {
    assert.equal(nextVersion('1.2.3', '1.10.0'), '1.10.0');
    assert.throws(() => nextVersion('1.2.3', '1.2.3'), ReleaseError);
    assert.throws(() => nextVersion('1.2.3', '1.0.0'), ReleaseError);
  });

  it('rejects malformed input', () => {
    assert.throws(() => nextVersion('1.2', 'patch'), ReleaseError);
    assert.throws(() => nextVersion('1.2.3', 'huge'), ReleaseError);
    assert.throws(() => nextVersion('1.2.3', '2.0.0-beta.1'), ReleaseError);
  });
});

describe('compareVersions', () => {
  it('compares numerically, not lexically', () => {
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
  });
});

describe('tagName', () => {
  it('matches the claude plugin tag format', () => {
    assert.equal(tagName('review-gates', '1.2.0'), 'review-gates--v1.2.0');
  });
});

describe('withVersion', () => {
  it('places version after name and keeps other keys in order', () => {
    const result = withVersion({ name: 'a', description: 'd', author: { name: 'x' } }, '1.0.0');
    assert.deepEqual(Object.keys(result), ['name', 'version', 'description', 'author']);
  });

  it('places version after displayName when present', () => {
    const result = withVersion({ name: 'a', displayName: 'A', version: '0.1.0', license: 'MIT' }, '0.2.0');
    assert.deepEqual(Object.keys(result), ['name', 'displayName', 'version', 'license']);
    assert.equal(result.version, '0.2.0');
  });
});

describe('releaseChangelog', () => {
  const changelog = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '- new skill',
    '',
    '## [0.1.0] - 2026-11-01',
    '',
    '- first release',
    '',
  ].join('\n');

  it('moves Unreleased notes under the new version and opens an empty Unreleased', () => {
    const result = releaseChangelog(changelog, '0.2.0', '2026-11-23');
    assert.equal(
      result,
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '## [0.2.0] - 2026-11-23',
        '',
        '### Added',
        '- new skill',
        '',
        '## [0.1.0] - 2026-11-01',
        '',
        '- first release',
        '',
      ].join('\n'),
    );
  });

  it('keeps CRLF line endings', () => {
    const result = releaseChangelog(changelog.replaceAll('\n', '\r\n'), '0.2.0', '2026-11-23');
    assert.ok(result.includes('## [0.2.0] - 2026-11-23\r\n'));
    assert.ok(!/[^\r]\n/.test(result));
  });

  it('fails without an Unreleased section or with an empty one', () => {
    assert.throws(() => releaseChangelog('# Changelog\n', '0.2.0', '2026-11-23'), ReleaseError);
    assert.throws(
      () => releaseChangelog('# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-11-01\n', '0.2.0', '2026-11-23'),
      ReleaseError,
    );
  });
});

describe('insertChangelogEntry', () => {
  it('inserts before the newest release, after Unreleased', () => {
    const text = '# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-11-20\n\n- x\n';
    const result = insertChangelogEntry(text, '1.1.1', '2026-11-23', ['### Reverted', '- back to 1.0.0']);
    assert.equal(
      result,
      '# Changelog\n\n## [Unreleased]\n\n## [1.1.1] - 2026-11-23\n\n### Reverted\n- back to 1.0.0\n\n## [1.1.0] - 2026-11-20\n\n- x\n',
    );
  });

  it('appends when there is no released version yet', () => {
    const result = insertChangelogEntry('# Changelog\n\n', '0.0.1', '2026-11-23', ['- x']);
    assert.equal(result, '# Changelog\n\n## [0.0.1] - 2026-11-23\n\n- x\n');
  });
});
