import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture, fixturePath, tryCreateSymlink, writeFixtureFile } from '../../test/helpers/fixture.ts';
import { buildCatalog } from './build-catalog.ts';
import type { Artifact, BuildInfo } from './types.ts';

const buildInfo: BuildInfo = {
  commit: 'a'.repeat(40),
  commitDate: '2026-11-20T10:00:00.000Z',
  builtAt: '2026-11-23T10:00:00.000Z',
};
const siteUrl = 'https://example.github.io/agentic-engineering/';
const repo = 'owner/repo';
const build = (root: string) => buildCatalog({ root, repo, siteUrl, buildInfo });
const expected = JSON.parse(readFileSync(fixturePath('marketplace.expected.json'), 'utf8')) as {
  id: string;
  type: string;
}[];

const result = build(fixturePath('marketplace'));
const byId = (id: string, type?: string): Artifact => {
  const found = result.artifacts.find((artifact) => artifact.id === id && (!type || artifact.type === type));
  if (!found) throw new Error(`no artifact ${id}`);
  return found;
};

describe('buildCatalog on the fixture marketplace', () => {
  it('AC-3: gives exactly the expected entries in landing order', () => {
    expect(result.artifacts.map(({ id, type }) => ({ id, type }))).toEqual(expected);
  });

  it('AC-4: every entry carries every catalog field', () => {
    for (const artifact of result.artifacts) {
      expect(artifact.id).toBe(artifact.type === 'plugin' ? artifact.plugin : `${artifact.plugin}:${artifact.name}`);
      expect(typeof artifact.name).toBe('string');
      expect(typeof artifact.description).toBe('string');
      expect(artifact.description.length).toBeGreaterThan(0);
      expect(Array.isArray(artifact.tags)).toBe(true);
      expect(artifact.category).toMatch(/^(quality|workflow)$/);
      expect(artifact.pluginVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(artifact.path).not.toMatch(/\\/);
      expect(artifact.sourceUrl).toMatch(new RegExp(`^https://github\\.com/owner/repo/(tree|blob)/${'a'.repeat(40)}/`));
      expect(artifact.detailUrl).toBe(`${siteUrl}${artifact.detailPath}`);
      expect(artifact.install).toBe(`/plugin install ${artifact.plugin}@agentic-engineering`);
    }
  });

  it('AC-4: same-named skills in two plugins are separate entries', () => {
    const alpha = byId('alpha:code-review');
    const beta = byId('beta:code-review');
    expect(alpha.plugin).toBe('alpha');
    expect(beta.plugin).toBe('beta');
    expect(alpha.detailPath).not.toBe(beta.detailPath);
    expect(alpha.pluginVersion).toBe('1.2.0');
    expect(beta.pluginVersion).toBe('0.3.0');
  });

  it('derives tags, category and descriptions', () => {
    expect(byId('alpha').tags).toEqual(['review', 'security', 'audit']);
    expect(byId('alpha:code-review').tags).toEqual(['review', 'pr']);
    expect(byId('alpha:security-audit').tags).toEqual(['review', 'security', 'audit']);
    expect(byId('beta:spec-writer').category).toBe('workflow');
    expect(byId('alpha:deploy-check').description).toBe('Check that the current branch is ready to deploy.');
    expect(byId('alpha:hooks').description).toBe('Hooks: PreToolUse (Bash), PostToolUse (Edit|Write)');
  });

  it('AC-5: an unlisted plugin is absent and reported as a warning', () => {
    expect(result.artifacts.some((artifact) => artifact.plugin === 'unlisted')).toBe(false);
    expect(result.warnings).toContain('plugins/unlisted is not listed in .claude-plugin/marketplace.json; skipped');
  });

  it('AC-26: detail paths are stable across builds and follow the URL scheme', () => {
    const again = build(fixturePath('marketplace'));
    expect(again.artifacts.map((artifact) => artifact.detailPath)).toEqual(
      result.artifacts.map((artifact) => artifact.detailPath),
    );
    expect(byId('alpha').detailPath).toBe('plugins/alpha/');
    expect(byId('alpha:code-review').detailPath).toBe('plugins/alpha/skills/code-review/');
    expect(byId('alpha:reviewer').detailPath).toBe('plugins/alpha/agents/reviewer/');
    expect(byId('alpha:deploy-check').detailPath).toBe('plugins/alpha/commands/deploy-check/');
    expect(byId('alpha:hooks').detailPath).toBe('plugins/alpha/hooks/');
    expect(byId('alpha:docs-search').detailPath).toBe('plugins/alpha/mcp/docs-search/');
    for (const artifact of result.artifacts) expect(artifact.detailPath).not.toContain(':');
  });

  it('AC-27: component data for the detail pages', () => {
    const skill = byId('alpha:code-review');
    expect(skill.bodyHtml).toContain('<h1>Code review</h1>');
    expect(skill.bodyText).toContain('Read the diff');
    expect(skill.files.map((file) => file.path)).toEqual([
      'plugins/alpha/skills/code-review/SKILL.md',
      'plugins/alpha/skills/code-review/reference.md',
    ]);
    expect(byId('alpha:hooks').hooks).toEqual([
      {
        event: 'PreToolUse',
        matcher: 'Bash',
        type: 'command',
        command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/check-command.mjs"',
      },
      {
        event: 'PostToolUse',
        matcher: 'Edit|Write',
        type: 'command',
        command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/check-command.mjs" --after',
      },
    ]);
    expect(byId('alpha:docs-search').mcp).toEqual({
      name: 'docs-search',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'docs-search-mcp', '--index', '${CLAUDE_PLUGIN_ROOT}/docs'],
      url: null,
    });
  });

  it('AC-28: plugin info and the full plugin file list', () => {
    const alpha = byId('alpha');
    expect(alpha.pluginVersion).toBe('1.2.0');
    expect(alpha.pluginInfo).toMatchObject({
      license: 'MIT',
      author: { name: 'Alpha Author', url: 'https://example.com/alpha' },
      otherComponents: ['output-styles'],
    });
    expect(alpha.pluginInfo?.changelogHtml).toContain('1.2.0');
    expect(alpha.files.map((file) => file.path)).toContain('plugins/alpha/output-styles/terse.md');
    expect(byId('beta').pluginInfo?.license).toBe('Apache-2.0');
  });

  it('records the marketplace info', () => {
    expect(result.marketplace).toEqual({
      name: 'agentic-engineering',
      description: 'Fixture marketplace for the catalog site tests',
      owner: { name: 'Fixture Owner', url: null },
      addCommand: '/plugin marketplace add owner/repo',
      url: 'https://github.com/owner/repo',
    });
  });
});

describe('buildCatalog edge cases', () => {
  it('an empty marketplace gives zero entries and no error', async () => {
    const root = await copyFixture('marketplace');
    await writeFixtureFile(
      root,
      '.claude-plugin/marketplace.json',
      JSON.stringify({ name: 'agentic-engineering', owner: { name: 'x' }, plugins: [] }),
    );
    const empty = build(root);
    expect(empty.artifacts).toEqual([]);
  });

  it('a skill shared through a symlink gives an entry in each plugin', async () => {
    const root = await copyFixture('marketplace');
    const linked = await tryCreateSymlink(
      join(root, 'plugins/alpha/skills/security-audit'),
      join(root, 'plugins/beta/skills/security-audit'),
    );
    if (!linked) return; // symlinks unavailable on this machine; CI on Linux runs this
    const ids = build(root).artifacts.map((artifact) => artifact.id);
    expect(ids).toContain('alpha:security-audit');
    expect(ids).toContain('beta:security-audit');
  });

  it('indexes skills from a plugin.json "skills" override', async () => {
    const root = await copyFixture('marketplace');
    await writeFixtureFile(
      root,
      'plugins/beta/.claude-plugin/plugin.json',
      JSON.stringify({ name: 'beta', version: '0.3.0', skills: './extra-skills' }),
    );
    await writeFixtureFile(root, 'plugins/beta/extra-skills/bonus/SKILL.md', '---\ndescription: A bonus skill.\n---\nBody\n');
    const ids = build(root).artifacts.map((artifact) => artifact.id);
    expect(ids).toContain('beta:bonus');
    expect(ids).toContain('beta:spec-writer');
  });

  it('warns when two components of one plugin share an id', async () => {
    const root = await copyFixture('marketplace');
    await writeFixtureFile(root, 'plugins/alpha/agents/code-review.md', '---\ndescription: Agent twin.\n---\nBody\n');
    const twin = build(root);
    expect(twin.warnings.some((warning) => warning.includes('"alpha:code-review"'))).toBe(true);
    expect(twin.artifacts.filter((artifact) => artifact.id === 'alpha:code-review')).toHaveLength(2);
  });
});
