import { cp, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** Absolute path of a fixture directory under site/test/fixtures/. */
export function fixturePath(name: string): string {
  return resolve(process.cwd(), 'test', 'fixtures', name);
}

/** Copies a fixture to a fresh temporary directory so a test can mutate it. */
export async function copyFixture(name: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), `catalog-${name}-`));
  await cp(fixturePath(name), target, { recursive: true });
  return target;
}

/** Writes (or overwrites) a file inside a copied fixture, creating parent directories. */
export async function writeFixtureFile(root: string, relPath: string, text: string): Promise<void> {
  const path = join(root, relPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

/**
 * Creates a directory symlink. Returns false when the platform refuses
 * (Windows without Developer Mode), so the caller can skip its test.
 */
export async function tryCreateSymlink(target: string, path: string): Promise<boolean> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await symlink(target, path, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  }
}
