// Repository checks for the plugins of this marketplace (SPEC-2). Zero dependencies.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Text that ties a public plugin to one project or machine (SPEC-2 AC-6). */
export const FORBIDDEN = [
  { pattern: /revai/i, reason: 'names the RevAI project' },
  { pattern: /devdigest/i, reason: 'names the DevDigest project' },
  { pattern: /server\/src|client\/src|reviewer-core|vendor\/shared|server\/clones/, reason: 'names a RevAI package path' },
  { pattern: /[A-Za-z]:\\(?:Users|Repos)\\|\/Users\/[a-z]|\/home\/[a-z]/i, reason: 'contains an absolute local path' },
  {
    pattern: /pr-self-review|routing\.json|agent-workflow\.md|\.claude\/hooks|implementer-backend|implementer-ui|test-writer-(?:backend|ui)/,
    reason: 'names an artifact that is not part of this marketplace',
  },
];

/** Agent frontmatter keys Claude Code ignores for plugin agents (SPEC-2 AC-10). */
export const UNSUPPORTED_AGENT_KEYS = ['hooks', 'permissionMode', 'mcpServers', 'initialPrompt'];

const REQUIRED_MANIFEST = ['name', 'version', 'description', 'author', 'license', 'keywords'];
const SEMVER = /^\d+\.\d+\.\d+$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else out.push(path);
  }
  return out;
}

/**
 * Minimal frontmatter reader: top-level `key: value` pairs and `key:` followed by `  - item` lists.
 * Nested mappings are recorded as `true` (enough to detect unsupported keys).
 */
export function readFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const data = {};
  let listKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      if (!Array.isArray(data[listKey])) data[listKey] = [];
      data[listKey].push(item[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) {
      const [, key, value] = pair;
      listKey = value === '' ? key : null;
      data[key] = value === '' ? true : value.trim();
    }
  }
  return data;
}

/**
 * YAML pitfalls the minimal reader cannot see but a real YAML parser rejects or misreads: an unquoted scalar that
 * contains ": " (a nested mapping error) or " #" (the rest becomes a comment). Returns `{ line, reason }` items.
 */
export function frontmatterIssues(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return [];
  const issues = [];
  match[1].split(/\r?\n/).forEach((line, index) => {
    const pair = /^\s*(?:-\s+)?[A-Za-z][\w-]*:\s+(.+)$/.exec(line) ?? /^\s*-\s+(.+)$/.exec(line);
    const value = pair?.[1]?.trim();
    if (!value || /^["'|>[{]/.test(value)) return;
    if (/: /.test(value)) issues.push({ line: index + 2, reason: 'unquoted YAML value contains ": "; quote it' });
    else if (/ #/.test(value)) issues.push({ line: index + 2, reason: 'unquoted YAML value contains " #"; quote it' });
  });
  return issues;
}

/** Skill names a frontmatter `skills` value lists (YAML list or comma-separated string). */
function skillList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

/** Runs every check; returns problems as `{ path, reason }` with repository-relative paths. */
export function validateRepository(root) {
  const problems = [];
  const rel = (path) => relative(root, path).replaceAll('\\', '/');
  const add = (path, reason) => problems.push({ path: rel(path), reason });

  const marketplacePath = join(root, '.claude-plugin', 'marketplace.json');
  const marketplace = readJson(marketplacePath);
  const listed = new Map((marketplace.plugins ?? []).map((entry) => [entry.name, entry]));
  const pluginsDir = join(root, 'plugins');
  const dirs = existsSync(pluginsDir)
    ? readdirSync(pluginsDir).filter((name) => statSync(join(pluginsDir, name)).isDirectory()).sort()
    : [];

  const plugins = new Map();
  for (const name of dirs) {
    const dir = join(pluginsDir, name);
    const entry = listed.get(name);
    if (!entry) add(dir, 'plugin directory is not listed in .claude-plugin/marketplace.json');
    else if (entry.source !== `./plugins/${name}`) add(marketplacePath, `plugin "${name}" must have source "./plugins/${name}"`);
    for (const key of ['description', 'category', 'tags']) {
      if (entry && entry[key] === undefined) add(marketplacePath, `plugin "${name}" has no "${key}"`);
    }

    const manifestPath = join(dir, '.claude-plugin', 'plugin.json');
    if (!existsSync(manifestPath)) {
      add(manifestPath, 'missing plugin.json');
      continue;
    }
    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch (error) {
      add(manifestPath, `invalid JSON: ${error.message}`);
      continue;
    }
    for (const key of REQUIRED_MANIFEST) if (manifest[key] === undefined) add(manifestPath, `missing "${key}"`);
    if (manifest.name !== name) add(manifestPath, `"name" must be "${name}"`);
    if (manifest.version !== undefined && !SEMVER.test(manifest.version)) add(manifestPath, '"version" must be x.y.z');
    for (const file of ['README.md', 'CHANGELOG.md']) if (!existsSync(join(dir, file))) add(join(dir, file), 'missing');

    const skills = existsSync(join(dir, 'skills'))
      ? readdirSync(join(dir, 'skills')).filter((skill) => existsSync(join(dir, 'skills', skill, 'SKILL.md')))
      : [];
    const dependencies = (manifest.dependencies ?? []).map((dep) => (typeof dep === 'string' ? dep : dep.name));
    plugins.set(name, { dir, manifestPath, dependencies, skills: new Set(skills) });
  }

  for (const name of listed.keys()) {
    if (!plugins.has(name) && !dirs.includes(name)) add(marketplacePath, `plugin "${name}" has no directory plugins/${name}`);
  }

  // Dependencies: known plugins, no cycles (AC-4, AC-5).
  for (const [name, plugin] of plugins) {
    for (const dep of plugin.dependencies) {
      if (dep.includes('@')) add(plugin.manifestPath, `dependency "${dep}" points to another marketplace`);
      else if (!plugins.has(dep)) add(plugin.manifestPath, `dependency "${dep}" is not a plugin of this marketplace`);
      else if (dep === name) add(plugin.manifestPath, 'a plugin cannot depend on itself');
    }
  }
  const state = new Map();
  const visit = (name, trail) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'active') {
      add(plugins.get(name).manifestPath, `dependency cycle: ${[...trail, name].join(' -> ')}`);
      return;
    }
    state.set(name, 'active');
    for (const dep of plugins.get(name)?.dependencies ?? []) if (plugins.has(dep)) visit(dep, [...trail, name]);
    state.set(name, 'done');
  };
  for (const name of plugins.keys()) visit(name, []);

  // Content: forbidden text everywhere, agent frontmatter and skill references (AC-6, AC-8, AC-10).
  for (const [name, plugin] of plugins) {
    const reachable = new Set([name, ...plugin.dependencies]);
    const resolves = (ref) => {
      const [owner, skill] = ref.includes(':') ? ref.split(':', 2) : [name, ref];
      return reachable.has(owner) && plugins.get(owner)?.skills.has(skill);
    };
    for (const file of listFiles(plugin.dir)) {
      const text = readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, index) => {
        for (const { pattern, reason } of FORBIDDEN) {
          if (pattern.test(line)) add(file, `line ${index + 1} ${reason}`);
        }
      });
      const isAgent = /[\\/]agents[\\/][^\\/]+\.md$/.test(file);
      const isSkill = /[\\/]skills[\\/][^\\/]+[\\/]SKILL\.md$/.test(file);
      if (!isAgent && !isSkill) continue;
      for (const issue of frontmatterIssues(text)) add(file, `line ${issue.line} ${issue.reason}`);
      const data = readFrontmatter(text);
      if (!data) {
        add(file, 'missing frontmatter');
        continue;
      }
      if (typeof data.description !== 'string' || data.description === '') add(file, 'missing "description"');
      if (isAgent) {
        for (const key of UNSUPPORTED_AGENT_KEYS) {
          if (key in data) add(file, `"${key}" is not supported in a plugin agent's frontmatter`);
        }
      }
      for (const ref of skillList(data.skills)) {
        if (!resolves(ref)) add(file, `skill "${ref}" is not in this plugin or one of its dependencies`);
      }
    }
  }
  return problems;
}
