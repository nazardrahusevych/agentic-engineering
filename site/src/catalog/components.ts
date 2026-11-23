import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parseFrontmatter, stringField } from './frontmatter.ts';
import { isRecord, readJsonFile } from './marketplace.ts';
import { isSafeName } from './paths.ts';
import { exists, type ConfigSource, type PluginManifest, type ReadContext } from './plugin.ts';
import { ProblemError } from './problems.ts';
import type { HookRow, McpServerInfo, WorkflowInfo } from './types.ts';
import { parseWorkflowMeta, WorkflowMetaError } from './workflow-meta.ts';

export const MAX_FILES_PER_PLUGIN = 500;
const SKIPPED_DIRS = new Set(['node_modules', '.git']);

/** A component as read from disk, before the catalog fields (URLs, tags, install) are added. */
export interface ComponentDraft {
  type: 'skill' | 'agent' | 'command' | 'workflow' | 'hooks' | 'mcp';
  name: string;
  description: string;
  /** Repository-relative path of the component (directory for skills, file otherwise). */
  path: string;
  isDir: boolean;
  /** Markdown body for skill, agent and command; null otherwise. */
  markdown: string | null;
  /** Plain text for types without markdown (hooks, MCP). */
  text: string;
  /** Tags from frontmatter `metadata.tags`, or null when absent. */
  tags: string[] | null;
  files: string[];
  hooks?: HookRow[];
  mcp?: McpServerInfo;
  workflow?: WorkflowInfo;
}

/** Shared budget for the files listed per plugin. */
export interface FileBudget {
  remaining: number;
  truncated: boolean;
}

function stat(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

/**
 * Lists the files under a repository path (a file lists itself). Follows symlinks, skips `node_modules` and `.git`,
 * guards against symlink loops and stops at the plugin's file budget.
 */
export function listFiles(root: string, relPath: string, budget: FileBudget): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (rel: string): void => {
    if (budget.remaining <= 0) {
      budget.truncated = true;
      return;
    }
    const abs = join(root, rel);
    const info = stat(abs);
    if (!info) return;
    if (info.isFile()) {
      out.push(rel);
      budget.remaining -= 1;
      return;
    }
    if (!info.isDirectory()) return;
    let real: string;
    try {
      real = realpathSync(abs);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);
    for (const name of readdirSync(abs).sort()) {
      if (SKIPPED_DIRS.has(name)) continue;
      walk(posix.join(rel, name));
    }
  };
  walk(relPath);
  return out;
}

function tagsFrom(data: Record<string, unknown>): string[] | null {
  const metadata = data.metadata;
  if (!isRecord(metadata)) return null;
  const tags = metadata.tags;
  if (Array.isArray(tags)) return tags.filter((tag): tag is string => typeof tag === 'string');
  if (typeof tags === 'string') return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  return null;
}

function checkName(name: string, path: string): void {
  if (!isSafeName(name)) {
    throw new ProblemError(path, `name "${name}" is not URL- and filename-safe (letters, digits, ".", "_", "-")`);
  }
}

/** Runs one reader; a ProblemError is recorded and reading continues with the next file. */
function attempt<T>(ctx: ReadContext, read: () => T): T | null {
  try {
    return read();
  } catch (error) {
    if (error instanceof ProblemError) {
      ctx.problems.push(error.problem);
      return null;
    }
    throw error;
  }
}

function readText(ctx: ReadContext, rel: string): string {
  return readFileSync(join(ctx.root, rel), 'utf8');
}

function isDefault(plugin: PluginManifest, path: string, kind: string): boolean {
  return path === posix.join(plugin.dir, kind);
}

// ---------- skills ----------

function skillDirs(ctx: ReadContext, plugin: PluginManifest): string[] {
  const dirs: string[] = [];
  for (const base of plugin.paths.skills) {
    const info = stat(join(ctx.root, base));
    if (!info?.isDirectory()) {
      if (!isDefault(plugin, base, 'skills')) {
        ctx.problems.push({ path: posix.join(plugin.dir, '.claude-plugin/plugin.json'), reason: `skills path "${base}" is not a directory` });
      }
      continue;
    }
    if (exists(join(ctx.root, base, 'SKILL.md'))) {
      dirs.push(base);
      continue;
    }
    for (const name of readdirSync(join(ctx.root, base)).sort()) {
      const rel = posix.join(base, name);
      if (stat(join(ctx.root, rel))?.isDirectory() && exists(join(ctx.root, rel, 'SKILL.md'))) dirs.push(rel);
    }
  }
  return [...new Set(dirs)];
}

function readSkill(ctx: ReadContext, dir: string, budget: FileBudget): ComponentDraft {
  const file = posix.join(dir, 'SKILL.md');
  const { data, body } = parseFrontmatter(readText(ctx, file), file);
  const name = stringField(data, 'name') ?? posix.basename(dir);
  checkName(name, file);
  const description = stringField(data, 'description');
  if (!description) throw new ProblemError(file, 'missing "description" in frontmatter');
  return {
    type: 'skill',
    name,
    description,
    path: dir,
    isDir: true,
    markdown: body,
    text: '',
    tags: tagsFrom(data),
    files: listFiles(ctx.root, dir, budget),
  };
}

// ---------- agents and commands ----------

function markdownFiles(ctx: ReadContext, plugin: PluginManifest, paths: string[], kind: string): string[] {
  const files: string[] = [];
  for (const path of paths) {
    const info = stat(join(ctx.root, path));
    if (!info) {
      if (!isDefault(plugin, path, kind)) {
        ctx.problems.push({ path: posix.join(plugin.dir, '.claude-plugin/plugin.json'), reason: `${kind} path "${path}" does not exist` });
      }
      continue;
    }
    if (info.isFile()) {
      if (path.endsWith('.md')) files.push(path);
      continue;
    }
    for (const name of readdirSync(join(ctx.root, path)).sort()) {
      const rel = posix.join(path, name);
      if (name.endsWith('.md') && stat(join(ctx.root, rel))?.isFile()) files.push(rel);
    }
  }
  return [...new Set(files)];
}

function firstLine(body: string): string {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^#+\s*/, '').trim();
    if (line) return line.length > 300 ? `${line.slice(0, 297)}...` : line;
  }
  return '';
}

function readAgentOrCommand(ctx: ReadContext, file: string, type: 'agent' | 'command', budget: FileBudget): ComponentDraft {
  const { data, body } = parseFrontmatter(readText(ctx, file), file);
  const name = stringField(data, 'name') ?? posix.basename(file, '.md');
  checkName(name, file);
  let description = stringField(data, 'description');
  if (!description) {
    if (type === 'agent') throw new ProblemError(file, 'missing "description" in frontmatter');
    description = firstLine(body);
  }
  return {
    type,
    name,
    description,
    path: file,
    isDir: false,
    markdown: body,
    text: '',
    tags: tagsFrom(data),
    files: listFiles(ctx.root, file, budget),
  };
}

// ---------- workflows ----------

function workflowFiles(ctx: ReadContext, plugin: PluginManifest): string[] {
  const files: string[] = [];
  for (const path of plugin.paths.workflows) {
    const info = stat(join(ctx.root, path));
    if (!info) {
      if (!isDefault(plugin, path, 'workflows')) {
        ctx.problems.push({ path: posix.join(plugin.dir, '.claude-plugin/plugin.json'), reason: `workflows path "${path}" does not exist` });
      }
      continue;
    }
    if (info.isFile()) {
      if (/\.(?:js|mjs)$/.test(path)) files.push(path);
      continue;
    }
    for (const name of readdirSync(join(ctx.root, path)).sort()) {
      const rel = posix.join(path, name);
      if (/\.(?:js|mjs)$/.test(name) && stat(join(ctx.root, rel))?.isFile()) files.push(rel);
    }
  }
  return [...new Set(files)];
}

/** A workflow is read as text: its literal `meta` names and describes it; the file is never executed (SPEC-3 AC-6). */
function readWorkflow(ctx: ReadContext, plugin: PluginManifest, file: string, budget: FileBudget): ComponentDraft {
  const source = readText(ctx, file);
  let meta;
  try {
    meta = parseWorkflowMeta(source);
  } catch (error) {
    if (error instanceof WorkflowMetaError) throw new ProblemError(file, `invalid workflow meta: ${error.message}`);
    throw error;
  }
  checkName(meta.name, file);
  return {
    type: 'workflow',
    name: meta.name,
    description: meta.description,
    path: file,
    isDir: false,
    markdown: null,
    text: [meta.description, ...meta.phases].join(' '),
    tags: null,
    files: listFiles(ctx.root, file, budget),
    workflow: { phases: meta.phases, command: `/${plugin.name}:${meta.name}`, source },
  };
}

// ---------- hooks ----------

function loadConfig(ctx: ReadContext, source: ConfigSource): unknown {
  return 'inline' in source ? source.inline : readJsonFile(ctx.root, source.path);
}

/** Validates the hooks shape (`{ hooks: { <event>: [{ matcher?, hooks: [{ type, command? }] }] } }`). */
export function parseHooks(data: unknown, path: string): { rows: HookRow[]; description: string | null } {
  if (!isRecord(data)) throw new ProblemError(path, 'invalid hooks configuration: expected a JSON object');
  const events = isRecord(data.hooks) ? data.hooks : data.hooks === undefined ? data : null;
  if (!events) throw new ProblemError(path, 'invalid hooks configuration: "hooks" must be an object');
  const rows: HookRow[] = [];
  for (const [event, groups] of Object.entries(events)) {
    if (event === 'description') continue;
    if (!Array.isArray(groups)) {
      throw new ProblemError(path, `invalid hooks configuration: "${event}" must be an array`);
    }
    groups.forEach((group, index) => {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        throw new ProblemError(path, `invalid hooks configuration: "${event}[${index}].hooks" must be an array`);
      }
      if (group.matcher !== undefined && typeof group.matcher !== 'string') {
        throw new ProblemError(path, `invalid hooks configuration: "${event}[${index}].matcher" must be a string`);
      }
      for (const hook of group.hooks) {
        if (!isRecord(hook) || typeof hook.type !== 'string') {
          throw new ProblemError(path, `invalid hooks configuration: every hook in "${event}[${index}]" needs a "type"`);
        }
        rows.push({
          event,
          matcher: typeof group.matcher === 'string' && group.matcher !== '' ? group.matcher : null,
          type: hook.type,
          command:
            typeof hook.command === 'string'
              ? hook.command
              : typeof hook.prompt === 'string'
                ? hook.prompt
                : typeof hook.url === 'string'
                  ? hook.url
                  : null,
        });
      }
    });
  }
  return { rows, description: typeof data.description === 'string' ? data.description : null };
}

export function describeHooks(rows: HookRow[]): string {
  const parts: string[] = [];
  for (const row of rows) {
    const part = row.matcher ? `${row.event} (${row.matcher})` : row.event;
    if (!parts.includes(part)) parts.push(part);
  }
  return `Hooks: ${parts.join(', ')}`;
}

function readHooks(ctx: ReadContext, plugin: PluginManifest, budget: FileBudget): ComponentDraft | null {
  const rows: HookRow[] = [];
  let description: string | null = null;
  let failed = false;
  for (const source of plugin.paths.hooks) {
    const parsed = attempt(ctx, () => parseHooks(loadConfig(ctx, source), source.path));
    if (!parsed) {
      failed = true;
      continue;
    }
    rows.push(...parsed.rows);
    description ??= parsed.description;
  }
  if (failed || rows.length === 0) return null;
  const first = plugin.paths.hooks[0]!;
  const hooksDir = posix.join(plugin.dir, 'hooks');
  const files = stat(join(ctx.root, hooksDir))?.isDirectory()
    ? listFiles(ctx.root, hooksDir, budget)
    : plugin.paths.hooks.filter((source) => !('inline' in source)).flatMap((source) => listFiles(ctx.root, source.path, budget));
  return {
    type: 'hooks',
    name: 'hooks',
    description: description ?? describeHooks(rows),
    path: first.path,
    isDir: false,
    markdown: null,
    text: rows.map((row) => [row.event, row.matcher ?? '', row.command ?? ''].join(' ')).join(' '),
    tags: null,
    files,
    hooks: rows,
  };
}

// ---------- MCP servers ----------

/** Validates an MCP configuration: `{ mcpServers: {...} }` or a flat map of servers. */
export function parseMcp(data: unknown, path: string): { info: McpServerInfo; description: string }[] {
  if (!isRecord(data)) throw new ProblemError(path, 'invalid MCP configuration: expected a JSON object');
  const servers = data.mcpServers === undefined ? data : data.mcpServers;
  if (!isRecord(servers)) throw new ProblemError(path, 'invalid MCP configuration: "mcpServers" must be an object');
  return Object.entries(servers).map(([name, server]) => {
    checkName(name, path);
    if (!isRecord(server)) throw new ProblemError(path, `invalid MCP configuration: server "${name}" must be an object`);
    const command = typeof server.command === 'string' ? server.command : null;
    const url = typeof server.url === 'string' ? server.url : null;
    if (!command && !url) {
      throw new ProblemError(path, `invalid MCP configuration: server "${name}" needs a "command" or a "url"`);
    }
    if (server.args !== undefined && !Array.isArray(server.args)) {
      throw new ProblemError(path, `invalid MCP configuration: "args" of server "${name}" must be an array`);
    }
    const args = Array.isArray(server.args) ? server.args.map(String) : [];
    const transport = typeof server.type === 'string' ? server.type : command ? 'stdio' : 'http';
    const description =
      typeof server.description === 'string' && server.description.trim()
        ? server.description.trim()
        : `MCP server (${transport}): ${command ? [command, ...args].join(' ') : url}`;
    return { info: { name, transport, command, args, url }, description };
  });
}

function readMcp(ctx: ReadContext, plugin: PluginManifest, budget: FileBudget): ComponentDraft[] {
  const drafts: ComponentDraft[] = [];
  for (const source of plugin.paths.mcp) {
    const servers = attempt(ctx, () => parseMcp(loadConfig(ctx, source), source.path));
    if (!servers) continue;
    const files = 'inline' in source ? [] : listFiles(ctx.root, source.path, budget);
    for (const { info, description } of servers) {
      drafts.push({
        type: 'mcp',
        name: info.name,
        description,
        path: source.path,
        isDir: false,
        markdown: null,
        text: [info.name, info.transport, info.command ?? '', ...info.args, info.url ?? ''].join(' '),
        tags: null,
        files,
        mcp: info,
      });
    }
  }
  return drafts;
}

/** Reads every component of a plugin; problems are recorded in `ctx.problems`. */
export function readComponents(ctx: ReadContext, plugin: PluginManifest, budget: FileBudget): ComponentDraft[] {
  const drafts: ComponentDraft[] = [];
  for (const dir of skillDirs(ctx, plugin)) {
    const draft = attempt(ctx, () => readSkill(ctx, dir, budget));
    if (draft) drafts.push(draft);
  }
  for (const file of markdownFiles(ctx, plugin, plugin.paths.agents, 'agents')) {
    const draft = attempt(ctx, () => readAgentOrCommand(ctx, file, 'agent', budget));
    if (draft) drafts.push(draft);
  }
  for (const file of markdownFiles(ctx, plugin, plugin.paths.commands, 'commands')) {
    const draft = attempt(ctx, () => readAgentOrCommand(ctx, file, 'command', budget));
    if (draft) drafts.push(draft);
  }
  for (const file of workflowFiles(ctx, plugin)) {
    const draft = attempt(ctx, () => readWorkflow(ctx, plugin, file, budget));
    if (draft) drafts.push(draft);
  }
  const hooks = readHooks(ctx, plugin, budget);
  if (hooks) drafts.push(hooks);
  drafts.push(...readMcp(ctx, plugin, budget));
  return drafts;
}
