import { describe, expect, it } from 'vitest';
import { copyFixture, writeFixtureFile } from '../../test/helpers/fixture.ts';
import { buildCatalog } from './build-catalog.ts';
import { CatalogBuildError, type CatalogProblem } from './problems.ts';

const buildInfo = { commit: 'b'.repeat(40), commitDate: '2026-11-20T10:00:00.000Z', builtAt: '2026-11-23T10:00:00.000Z' };

async function problemsAfter(mutations: [string, string][]): Promise<CatalogProblem[]> {
  const root = await copyFixture('marketplace');
  for (const [path, text] of mutations) await writeFixtureFile(root, path, text);
  try {
    buildCatalog({ root, repo: 'owner/repo', siteUrl: 'https://x.test/', buildInfo });
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogBuildError);
    expect((error as Error).message).toContain('The catalog build failed');
    return (error as CatalogBuildError).problems;
  }
  throw new Error('the build did not fail');
}

describe('buildCatalog failures (AC-6)', () => {
  it('broken marketplace.json', async () => {
    const problems = await problemsAfter([['.claude-plugin/marketplace.json', '{ "name": "x", ']]);
    expect(problems).toEqual([{ path: '.claude-plugin/marketplace.json', reason: expect.stringMatching(/^invalid JSON/) }]);
  });

  it('broken plugin.json', async () => {
    const problems = await problemsAfter([['plugins/alpha/.claude-plugin/plugin.json', '{ nope }']]);
    expect(problems).toEqual([
      { path: 'plugins/alpha/.claude-plugin/plugin.json', reason: expect.stringMatching(/^invalid JSON/) },
    ]);
  });

  it('bad frontmatter', async () => {
    const problems = await problemsAfter([
      ['plugins/alpha/skills/security-audit/SKILL.md', '---\ndescription: [broken\n---\nBody\n'],
    ]);
    expect(problems).toEqual([
      {
        path: 'plugins/alpha/skills/security-audit/SKILL.md',
        reason: expect.stringMatching(/^invalid frontmatter: .+ \(line \d+\)$/),
      },
    ]);
  });

  it('skill without a description', async () => {
    const problems = await problemsAfter([['plugins/beta/skills/spec-writer/SKILL.md', '---\nname: spec-writer\n---\nBody\n']]);
    expect(problems).toEqual([
      { path: 'plugins/beta/skills/spec-writer/SKILL.md', reason: 'missing "description" in frontmatter' },
    ]);
  });

  it('agent without a description', async () => {
    const problems = await problemsAfter([['plugins/beta/agents/planner.md', 'No frontmatter at all.\n']]);
    expect(problems).toEqual([{ path: 'plugins/beta/agents/planner.md', reason: 'missing "description" in frontmatter' }]);
  });

  it('hooks.json that is not JSON', async () => {
    const problems = await problemsAfter([['plugins/alpha/hooks/hooks.json', '{ "hooks": ']]);
    expect(problems).toEqual([{ path: 'plugins/alpha/hooks/hooks.json', reason: expect.stringMatching(/^invalid JSON/) }]);
  });

  it('hooks.json with a wrong shape', async () => {
    const problems = await problemsAfter([
      ['plugins/alpha/hooks/hooks.json', JSON.stringify({ hooks: { PreToolUse: { matcher: 'Bash' } } })],
    ]);
    expect(problems).toEqual([
      { path: 'plugins/alpha/hooks/hooks.json', reason: 'invalid hooks configuration: "PreToolUse" must be an array' },
    ]);
  });

  it('broken .mcp.json', async () => {
    const problems = await problemsAfter([
      ['plugins/alpha/.mcp.json', JSON.stringify({ mcpServers: { 'docs-search': { args: [] } } })],
    ]);
    expect(problems).toEqual([
      {
        path: 'plugins/alpha/.mcp.json',
        reason: 'invalid MCP configuration: server "docs-search" needs a "command" or a "url"',
      },
    ]);
  });

  it('unsafe name', async () => {
    const problems = await problemsAfter([
      ['plugins/alpha/agents/reviewer.md', '---\nname: "bad:name"\ndescription: x\n---\nBody\n'],
    ]);
    expect(problems).toEqual([
      { path: 'plugins/alpha/agents/reviewer.md', reason: expect.stringContaining('"bad:name" is not URL- and filename-safe') },
    ]);
  });

  it('two components of one type and name in one plugin', async () => {
    const problems = await problemsAfter([
      ['plugins/alpha/agents/reviewer-copy.md', '---\nname: reviewer\ndescription: Twin.\n---\nBody\n'],
    ]);
    expect(problems).toEqual([
      {
        path: 'plugins/alpha/agents/reviewer.md',
        reason: 'duplicate agent name "reviewer" in plugin "alpha" (also plugins/alpha/agents/reviewer-copy.md)',
      },
    ]);
  });

  it('reports two broken files together', async () => {
    const problems = await problemsAfter([
      ['plugins/alpha/.mcp.json', '[not json'],
      ['plugins/beta/agents/planner.md', '---\nname: planner\n---\n'],
    ]);
    expect(problems.map((problem) => problem.path).sort()).toEqual([
      'plugins/alpha/.mcp.json',
      'plugins/beta/agents/planner.md',
    ]);
  });
});
