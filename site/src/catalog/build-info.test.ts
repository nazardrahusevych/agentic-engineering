import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBuildInfo } from './build-info.ts';

const now = new Date('2026-11-23T12:00:00.000Z');

describe('readBuildInfo (AC-9)', () => {
  it('uses the environment overrides when set', () => {
    const { buildInfo, warnings } = readBuildInfo(
      process.cwd(),
      { CATALOG_COMMIT: 'f'.repeat(40), CATALOG_COMMIT_DATE: '2026-01-02T03:04:05+02:00' },
      now,
    );
    expect(buildInfo).toEqual({
      commit: 'f'.repeat(40),
      commitDate: '2026-01-02T01:04:05.000Z',
      builtAt: '2026-11-23T12:00:00.000Z',
    });
    expect(warnings).toEqual([]);
  });

  it('reads the commit from git in a checkout', () => {
    const { buildInfo, warnings } = readBuildInfo(process.cwd(), {}, now);
    expect(buildInfo.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Number.isNaN(Date.parse(buildInfo.commitDate))).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('falls back to "unknown" with a warning outside git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-git-'));
    const { buildInfo, warnings } = readBuildInfo(dir, { GIT_DIR: undefined }, now);
    expect(buildInfo.commit).toBe('unknown');
    expect(buildInfo.commitDate).toBe(now.toISOString());
    expect(warnings).toHaveLength(1);
  });
});
