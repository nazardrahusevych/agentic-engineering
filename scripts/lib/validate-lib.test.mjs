import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFrontmatter, validateRepository } from './validate-lib.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A minimal valid marketplace with two plugins; `b` depends on `a` and uses its skill. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'validate-'));
  const entry = (name) => ({ name, source: `./plugins/${name}`, description: 'x', category: 'c', tags: ['t'] });
  write(root, '.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', owner: { name: 'o' }, plugins: [entry('a'), entry('b')] }));
  for (const name of ['a', 'b']) {
    const manifest = { name, version: '0.1.0', description: 'x', author: { name: 'o' }, license: 'MIT', keywords: ['k'] };
    if (name === 'b') manifest.dependencies = ['a'];
    write(root, `plugins/${name}/.claude-plugin/plugin.json`, JSON.stringify(manifest));
    write(root, `plugins/${name}/README.md`, '# x\n');
    write(root, `plugins/${name}/CHANGELOG.md`, '# Changelog\n\n## [Unreleased]\n');
  }
  write(root, 'plugins/a/skills/shared/SKILL.md', '---\nname: shared\ndescription: Shared skill.\n---\nBody\n');
  write(root, 'plugins/b/agents/worker.md', '---\nname: worker\ndescription: Works.\nskills:\n  - a:shared\n---\nBody\n');
  return root;
}

const reasons = (root) => validateRepository(root).map((p) => `${p.path}: ${p.reason}`);

describe('validateRepository', () => {
  it('accepts a valid marketplace', () => {
    assert.deepEqual(reasons(fixture()), []);
  });

  it('accepts the plugins of this repository', () => {
    assert.deepEqual(reasons(repoRoot), []);
  });

  it('AC-6: reports project names, package paths and local paths with file and line', () => {
    const root = fixture();
    write(root, 'plugins/a/skills/shared/notes.md', 'ok\nBuilt for RevAI.\nsee server/src/modules\nC:\\Users\\me\\x\n');
    assert.deepEqual(reasons(root), [
      'plugins/a/skills/shared/notes.md: line 2 names the RevAI project',
      'plugins/a/skills/shared/notes.md: line 3 names a RevAI package path',
      'plugins/a/skills/shared/notes.md: line 4 contains an absolute local path',
    ]);
  });

  it('AC-4/AC-5: unknown dependencies and cycles fail', () => {
    const root = fixture();
    const manifest = { name: 'a', version: '0.1.0', description: 'x', author: { name: 'o' }, license: 'MIT', keywords: [], dependencies: ['b', 'ghost'] };
    write(root, 'plugins/a/.claude-plugin/plugin.json', JSON.stringify(manifest));
    const out = reasons(root);
    assert.ok(out.includes('plugins/a/.claude-plugin/plugin.json: dependency "ghost" is not a plugin of this marketplace'));
    assert.ok(out.some((line) => line.includes('dependency cycle: a -> b -> a')));
  });

  it('AC-8: a skill from a plugin that is not a dependency fails', () => {
    const root = fixture();
    write(root, 'plugins/a/agents/x.md', '---\nname: x\ndescription: X.\nskills:\n  - b:missing\n  - shared\n---\n');
    assert.deepEqual(reasons(root), ['plugins/a/agents/x.md: skill "b:missing" is not in this plugin or one of its dependencies']);
  });

  it('AC-10: unsupported plugin-agent frontmatter fails', () => {
    const root = fixture();
    write(root, 'plugins/b/agents/guarded.md', '---\nname: guarded\ndescription: G.\nhooks:\n  PreToolUse: []\n---\n');
    assert.deepEqual(reasons(root), [`plugins/b/agents/guarded.md: "hooks" is not supported in a plugin agent's frontmatter`]);
  });

  it('frontmatter values that YAML would reject or truncate fail', () => {
    const root = fixture();
    write(root, 'plugins/b/agents/yaml.md', "---\nname: yaml\ndescription: Plan: the contract\ntools: Read # Grep\nmodel: 'a: b'\n---\n");
    assert.deepEqual(reasons(root), [
      'plugins/b/agents/yaml.md: line 3 unquoted YAML value contains ": "; quote it',
      'plugins/b/agents/yaml.md: line 4 unquoted YAML value contains " #"; quote it',
    ]);
  });

  it('AC-1/AC-2: unlisted plugins and missing files fail', () => {
    const root = fixture();
    cpSync(join(root, 'plugins/a'), join(root, 'plugins/c'), { recursive: true });
    write(root, 'plugins/c/.claude-plugin/plugin.json', JSON.stringify({ name: 'c', version: '1' }));
    const out = reasons(root);
    assert.ok(out.includes('plugins/c: plugin directory is not listed in .claude-plugin/marketplace.json'));
    assert.ok(out.includes('plugins/c/.claude-plugin/plugin.json: missing "license"'));
    assert.ok(out.includes('plugins/c/.claude-plugin/plugin.json: "version" must be x.y.z'));
  });
});

describe('readFrontmatter', () => {
  it('reads scalars, lists and nested keys', () => {
    assert.deepEqual(readFrontmatter('---\nname: a\nskills:\n  - x\n  - "y"\nhooks:\n  PreToolUse: []\n---\n'), {
      name: 'a',
      skills: ['x', 'y'],
      hooks: true,
    });
    assert.equal(readFrontmatter('no frontmatter'), null);
  });
});
