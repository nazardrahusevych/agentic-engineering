import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture, fixturePath, writeFixtureFile } from './fixture.ts';

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
}

describe('fixture helpers', () => {
  it('copies the marketplace fixture byte for byte', async () => {
    const source = fixturePath('marketplace');
    const copy = await copyFixture('marketplace');
    const files = await listFiles(source);
    expect(await listFiles(copy)).toEqual(files);
    expect(files).toContain('.claude-plugin/marketplace.json');
    for (const file of files) {
      expect(await readFile(join(copy, file), 'utf8')).toBe(await readFile(join(source, file), 'utf8'));
    }
  });

  it('writes files into a copy without touching the source', async () => {
    const copy = await copyFixture('marketplace');
    await writeFixtureFile(copy, 'plugins/alpha/new/dir/file.md', 'hello');
    expect(await readFile(join(copy, 'plugins/alpha/new/dir/file.md'), 'utf8')).toBe('hello');
    expect(await listFiles(fixturePath('marketplace'))).not.toContain('plugins/alpha/new/dir/file.md');
  });
});
