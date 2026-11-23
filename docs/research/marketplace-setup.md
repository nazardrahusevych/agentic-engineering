# Research: building a Claude Code plugin marketplace

Status: research notes, collected 2026-11-23. Re-check every item against the live docs once the repository is
ready (see the checklist at the end). Items marked **(verify)** came from truncated pages or community sources.

## Sources

Official (authoritative):
- Marketplaces: https://code.claude.com/docs/en/plugin-marketplaces
- Marketplace reference (full schema): https://code.claude.com/docs/en/plugins/marketplace-reference
- Hosting and distribution: https://code.claude.com/docs/en/plugins/host-marketplace
- Plugins overview: https://code.claude.com/docs/en/plugins
- Plugin reference (`plugin.json`, paths, env vars): https://code.claude.com/docs/en/plugins-reference
- Loading and caching: https://code.claude.com/docs/en/plugins/loading
- CLI reference: https://code.claude.com/docs/en/plugins/cli-reference
- Install and manage (user side): https://code.claude.com/docs/en/discover-plugins
- Skills (`SKILL.md`): https://code.claude.com/docs/en/skills
- Reference marketplace: https://github.com/anthropics/claude-plugins-official
- Demo marketplace (legacy): https://github.com/anthropics/claude-code/tree/main/plugins

Community (secondary, may contradict official docs):
- https://talent-factory.github.io/claude-plugins/reference/marketplace-json/
- https://skills.sh/sjnims/plugin-dev/marketplace-structure (no content fetched; flagged by security scanners)

Not read yet (read before finishing the repo): settings reference (`extraKnownMarketplaces`, `enabledPlugins`,
`strictKnownMarketplaces`, `blockedMarketplaces`, `pluginConfigs`), `plugins/components` (agent frontmatter,
`hooks.json` events), `plugins/troubleshooting`, `plugins/create`,
`anthropics/claude-plugins-official/plugins/example-plugin`.

## 1. What a marketplace is

A marketplace is a git repository (or a directory, or a hosted JSON file) with a catalog at
`.claude-plugin/marketplace.json`. The directory that contains `.claude-plugin/` is the marketplace root;
relative plugin sources resolve from it. Each plugin is a directory with an optional `.claude-plugin/plugin.json`
and its components (skills, agents, commands, hooks, MCP/LSP servers, output styles, ...).

Users add it and install from it:

```
/plugin marketplace add nazardrahusevych/agentic-engineering          # pin a ref: ...#v1.0.0
/plugin install <plugin>@agentic-engineering
claude plugin install <plugin>@agentic-engineering --scope project   # shell form
```

## 2. Target repository layout

Follows `anthropics/claude-plugins-official` (`.claude-plugin/`, `.github/`, `plugins/`, `LICENSE`, `README.md`):

```
agentic-engineering/
├── .claude-plugin/
│   └── marketplace.json          # the catalog (required)
├── plugins/
│   └── <plugin-name>/            # one directory per plugin, kebab-case
│       ├── .claude-plugin/
│       │   └── plugin.json       # manifest (only "name" is required)
│       ├── skills/<skill>/SKILL.md
│       ├── agents/<agent>.md
│       ├── commands/<cmd>.md
│       ├── hooks/hooks.json      # top-level "hooks" wrapper
│       ├── scripts/              # hook/helper scripts (NOT bin/, see §8)
│       ├── .mcp.json
│       └── README.md
├── .github/workflows/validate.yml
├── docs/
├── README.md
├── CHANGELOG.md
└── LICENSE
```

Default component locations inside a plugin: `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`,
`.lsp.json`, `output-styles/`, `workflows/`, `themes/`, `monitors/monitors.json`, `bin/`.
A `CLAUDE.md` at a plugin root is **not** loaded (validate warns).

## 3. `marketplace.json`

Minimal:

```json
{
  "name": "agentic-engineering",
  "owner": { "name": "Nazar Drahusevych" },
  "description": "Skills, agents, hooks and workflows for engineering with AI coding agents",
  "plugins": [
    {
      "name": "spec-driven-dev",
      "source": "./plugins/spec-driven-dev",
      "description": "Spec -> plan -> implementation workflow"
    }
  ]
}
```

Top-level fields:
| Field | Notes |
|---|---|
| `name` | required; letters, digits, `.`, `_`, `-`; starts with letter/digit; no `..`. Users type it after `@`. |
| `owner` | required; `name` required, `email` and `url` optional |
| `plugins` | required array |
| `$schema`, `description`, `version` | optional; `$schema` ignored at load |
| `metadata.description`, `metadata.version`, `metadata.pluginRoot` | `pluginRoot` (v2.1.239+): bare source names resolve under it, e.g. `"pluginRoot": "./plugins"` |
| `renames` | `{"old": "new" \| null}`; append-only; handles renamed/removed plugins |
| `forceRemoveDeletedPlugins` | `true` uninstalls plugins removed from the catalog at session start |
| `allowCrossMarketplaceDependenciesOn` | array of marketplaces dependencies may point to |

Plugin entry fields: `name` and `source` required; optional `description`, `version`, `category`, `tags`,
`strict` (default `true`), `relevance`, `dependencies`, `engines` (`{"claude-code": ">=2.1.400"}`, v2.1.323+),
`defaultEnabled` (default `true`), `displayName`, `metadata`, `headers`/`headersHelper` (v2.1.238+).

**Unknown keys are silently ignored at load** (typos don't fail) — `claude plugin validate` warns about them.

### Strict mode
- No `plugin.json` → the marketplace entry is the manifest.
- `strict: true` (default) + `plugin.json` → entry's `commands`, `agents`, `skills`, `outputStyles`, `themes` are
  appended to the manifest; entry `hooks` replace manifest hooks per event.
- `strict: false` + `plugin.json` + components in the entry → error
  `Plugin <name> has conflicting manifests`.
- Entry `mcpServers`, `lspServers`, `userConfig`, `channels` are ignored when `plugin.json` exists.
- Inline `hooks` in an entry only work as an inline object; a file path → "not yet supported in a marketplace entry".

**Decision for us:** every plugin has its own `plugin.json`; marketplace entries carry only `name`, `source`,
`description`, `category`, `tags`. One source of truth per field.

### Plugin source types
| Type | Example |
|---|---|
| relative path | `"./plugins/foo"` — must start with `./`, no `..`; only works for git/directory marketplaces |
| `github` | `{"source":"github","repo":"org/foo","ref":"v2.0.0","sha":"<40-char>"}` |
| `url` (git) | `{"source":"url","url":"https://gitlab.example.com/foo.git","ref":"main"}` |
| `git-subdir` | `{"source":"git-subdir","url":"org/monorepo","path":"tools/foo"}` (sparse checkout) |
| `npm` | `{"source":"npm","package":"@org/foo","version":"^2.0.0"}` — install scripts never run |
| `archive` | `{"source":"archive","url":"https://.../foo.zip","sha256":"<64 hex>"}` — https only, 256 MiB |
| `command` | `{"source":"command","command":"tool path","timeout":120}` — link mode not on Windows |

We only need relative paths (all plugins live in this repo).

## 4. `plugin.json`

Only `name` is required (kebab-case; no spaces, `@`, `:` or path separators). Useful fields:
`displayName`, `version`, `description`, `author` (`name` required), `homepage`, `repository`, `license` (SPDX),
`keywords`, `engines`, `dependencies`, `userConfig`, and component path overrides: `skills` (adds to default scan),
`commands`/`agents`/`outputStyles`/`workflows` (replace defaults), `hooks`/`mcpServers`/`lspServers` (merge).

Rules:
- Component paths start with `./`, no `..`, must exist and stay inside the plugin root. Backslashes fail on
  macOS/Linux → always forward slashes.
- Unknown top-level keys are stripped with a warning; unknown keys inside `userConfig`, `channels`, `lspServers`,
  `monitors` are **errors** (plugin won't load).
- **Reserved plugin names:** error for names starting with `claude-`, `anthropic-`, `anthropics-`, `cc-plugin-`,
  or exactly `claude`, `anthropic`, `anthropics`, `claude-code`, `claude-mods`; warning if those words appear
  elsewhere in the name.
- Validate warns when `version`, `description` or `author` is missing.

`userConfig` lets a plugin ask the user for settings at install (`type`: string, number, boolean, directory, file;
`sensitive` values go to the secure store). Reference as `${user_config.KEY}` in MCP/LSP config, skill/agent
content and exec-form hook args, or as env `CLAUDE_PLUGIN_OPTION_<KEY>` in hooks. This is the mechanism for making
project-specific paths configurable instead of hard-coding them.

Environment variables available to hooks/MCP:
- `${CLAUDE_PLUGIN_ROOT}` — the installed version dir (changes on every update; never store state there).
- `${CLAUDE_PLUGIN_DATA}` — `~/.claude/plugins/data/<id>/`, survives updates, deleted on uninstall.
- `${CLAUDE_PROJECT_DIR}` — the user's project.
- Not available inside Bash tool commands.

Hook example (`hooks/hooks.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/check-command.sh" }] }
    ]
  }
}
```

Quote the variable in shell form or use exec form (`args`). On Windows use forward slashes (except exec-form /
PowerShell hooks).

## 5. Skills inside plugins

- Path: `<plugin>/skills/<skill-name>/SKILL.md`; invoked as `/<plugin-name>:<skill-name>`.
- Frontmatter: all optional, `description` strongly recommended; `name` defaults to the directory name.
  Others: `when_to_use`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `context: fork`, `agent`,
  `hooks`, `paths`, `shell`. Unknown fields silently ignored.
- `description` + `when_to_use` truncated at 1,536 chars in the listing. Put the key use case first, include the
  words users would actually say.
- Keep `SKILL.md` under ~500 lines; move detail to `reference.md`, `examples.md`, `scripts/` (progressive
  disclosure). After compaction each invoked skill keeps its first ~5,000 tokens. **(verify)**
- Portability: claude.ai and the Skills API accept only `name`, `description`, `license`, `compatibility`,
  `metadata`, `allowed-tools` — any other key is a hard error there. Keep skills we may publish to claude.ai
  within that set.
- Every enabled plugin adds the name + description of its invocable skills/agents to every turn's context →
  many small, focused plugins that users enable selectively are cheaper than one giant plugin.
  `claude plugin details <name>` shows the projected token cost.

## 6. Installation, caching and why it matters for layout

- Marketplace plugins are **copied** into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` at install.
  **Files outside the plugin directory are not copied** — `../shared/...` breaks after install.
- Symlinks: target inside the plugin → kept; target elsewhere in the same marketplace → **dereferenced (content
  copied)**; target outside the marketplace → skipped. This is the official way to share a skill between plugins
  (e.g. a meta-plugin whose `skills/` links to skills of other plugins).
  Windows: requires Developer Mode (or elevated `mklink /D`) and `core.symlinks=true` in the clone.
- In-place (not copied): `--plugin-dir`, relative-path plugins of a *local-path* marketplace — so local testing can
  hide copy-related bugs. Test once via a git install too.
- Node dependencies: if the plugin root has `package.json` + lockfile (`package-lock.json`, `npm-shrinkwrap.json`
  or `bun.lock`), Claude Code installs them at install/update. **`pnpm-lock.yaml` and `yarn.lock` are skipped**,
  lifecycle scripts never run, 60 s timeout. Prefer dependency-free scripts.
- Keep plugin files out of Git LFS (clones get pointer files).
- Old version dirs are deleted 14 days after being orphaned.
- Name conflicts: a `--plugin-dir` plugin silently replaces an installed marketplace plugin with the same name.
- Project-scope plugins load only after workspace trust; MCP servers need per-server approval.

## 7. Versioning and updates

Version resolution: `plugin.json` `version` → entry `version` → source-derived (relative path in a git
marketplace: commit SHA of the plugin dir).

- Users receive a new copy **only when the computed version changes**. Re-using a version string = users never get
  new commits.
- **Don't set `version` in both `plugin.json` and the entry** (plugin.json wins silently; validate reports it).
  The community talent-factory guide says to keep them in sync in both files — the official docs say the opposite.
- Two valid strategies: (a) omit `version` → every commit touching the plugin is a new version; (b) set semver in
  `plugin.json` and bump on each release. For a public marketplace (b) + `CHANGELOG.md` is clearer.
- `claude plugin tag [path]` creates an annotated tag `<name>--v<version>` (`--push`, `--dry-run`). **(verify)**
- Users can pin the marketplace: `owner/repo#ref`. Release channels = two marketplaces with different `name`
  pointing at different refs (e.g. `main` and `stable`).
- Auto-update is **off by default** for third-party marketplaces; users toggle it in `/plugin` → Marketplaces.
- Plugin `name` is an immutable slug. Renaming breaks installs (`plugin-not-found`) → use `renames` in
  `marketplace.json` or change only `displayName`.

## 8. Hosting, private repos, teams

- GitHub `owner/repo` is the simplest. URL-hosted `marketplace.json` cannot use relative-path entries.
- Private repo: no token field; Claude Code uses the user's git setup non-interactively (SSH key without passphrase,
  or HTTPS via a credential helper — `gh auth login` + `gh auth setup-git`). `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`
  skips the SSH probe. Background auto-update with a prompting helper fails silently.
- Team/project wiring: `claude plugin marketplace add <src> --scope project` writes `.claude/settings.json`
  (`extraKnownMarketplaces` + `enabledPlugins`); commit it. Example:

  ```json
  {
    "extraKnownMarketplaces": {
      "agentic-engineering": {
        "source": { "source": "github", "repo": "nazardrahusevych/agentic-engineering" }
      }
    },
    "enabledPlugins": { "spec-driven-dev@agentic-engineering": true }
  }
  ```

- claude.ai organization sync: repo must be private/internal on github.com or gitlab.com, and a top-level `bin/`
  in a plugin is rejected → keep executables in `scripts/` and call them via `${CLAUDE_PLUGIN_ROOT}/scripts/...`.
- Download limits: `marketplace.json` 5 MiB; archives 256 MiB; 100,000 entries; 1 GiB uncompressed.

## 9. Naming rules (checked for our names)

Reserved marketplace names (cannot be used): `claude-code-marketplace`, `claude-code-plugins`,
`claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`,
`life-sciences`, `knowledge-work-plugins`, `claude-for-legal`, `claude-for-financial-services`,
`financial-services-plugins`, `first-party-plugins`, `claude-tag-plugins`, `claude-community`,
`claude-plugins-community`, `healthcare`, `anthropic-plugin-directory`, `claude-plugin-directory`, the prefix
`claudeai-`, origin names (`inline`, `builtin`, `skills-dir`, `synced`, `claude-plugin-test`), JS member names
(`constructor`, `toString`, ...), spelling variants of official names, and `<owner>-<repo>` download-folder
collisions.

`agentic-engineering` is not on the list and does not impersonate an official name. ✔
Plugin names must avoid the `claude-` / `anthropic-` / `cc-plugin-` prefixes.

## 10. Validation and testing

```
claude plugin validate .                         # marketplace
claude plugin validate ./plugins/<name> --strict # plugin; --strict for CI, --json for machine output
claude --plugin-dir ./plugins/<name>             # load one plugin for a session, in place
claude plugin marketplace add ./                 # local end-to-end
claude plugin install <name>@agentic-engineering
claude plugin details <name>                     # components + projected token cost
/reload-plugins                                  # pick up edits without restarting
claude plugin test [dir]                         # runs *.test.ts(x) in a plugin
claude plugin eval [target]                      # eval suites for skills/agents
```

Validate exit codes: 0 passed (possibly with warnings), 1 failed, 2 unexpected error. **(verify)**
Confirmed locally with Claude Code 2.1.325 (2026-11-23):
- `--strict` turns warnings into errors, so a plugin without `version` fails strict validation.
- `claude plugin validate <plugin>` also runs **plugin directory checks** (the official directory's submission
  rules): `README.md` of 40+ words, a `LICENSE` file or `license` in `plugin.json`, and an icon
  (`.claude-plugin/icon.png`, square PNG 512–2048 px, < 2 MB; SVG/WebP not accepted). A README/LICENSE at the
  repository root also counts. These are reported but don't change the result unless run with
  `--profile directory`. Worth satisfying for a future public listing.

Validate does **not** check: reserved names, remote sources, or that a relative source dir exists (that fails only
at install: `Source path does not exist`).

## 11. Best practices and pitfalls (synthesis)

Repository:
1. Mirror the official layout: `.claude-plugin/marketplace.json` + `plugins/<name>/` + README + LICENSE + CHANGELOG.
2. Many small plugins grouped by purpose (users pay context tokens per enabled plugin), named by function, kebab-case.
3. Set `version` in `plugin.json` only; bump on release; tag releases; keep a CHANGELOG.
4. Never rename a plugin `name` — use `renames` / `displayName`.
5. Pick a license early (official repo uses Apache-2.0; MIT is also common) and add `license` to each `plugin.json`.
6. CI on every PR: `claude plugin validate . ` and `--strict` per plugin; also a check that every `plugins/*`
   directory is listed in `marketplace.json` (the official repo checks every folder on each PR).
   No ready-made GitHub Actions workflow was found in official docs — we write our own.
7. Before the repo goes public: no secrets, no personal absolute paths, no project-private details in skills.

Plugin content:
8. Everything a plugin needs lives inside its directory. To share a skill across plugins use a symlink inside the
   marketplace (dereferenced on install), never `../`.
9. Hooks call scripts via `"${CLAUDE_PLUGIN_ROOT}"/scripts/...`, forward slashes, no top-level `bin/`.
10. Persistent state goes to `${CLAUDE_PLUGIN_DATA}`, never `${CLAUDE_PLUGIN_ROOT}`.
11. Hook scripts must run on Windows, macOS and Linux. No source covers this — our own rule: prefer Node.js
    scripts (Node is already required by Claude Code) over `.sh`/`.ps1`, or ship both. **(our decision, verify)**
12. Prefer no runtime dependencies; if needed, use npm/bun lockfiles (pnpm/yarn lockfiles are ignored).
13. Project-specific values (paths, package names, commands) come from `userConfig` or from the consuming
    project's `AGENTS.md`/`CLAUDE.md`, not hard-coded in skills.
14. Test both in place (`--plugin-dir`) and via a real git install — copying to cache is where `../` and
    symlink bugs show up.
15. Security: plugins run with the user's privileges; Anthropic explicitly does not vet third-party content.
    Document what each hook does in the plugin README; never ship hooks that phone home.

## 12. Migration notes from RevAI

What exists in RevAI today and what changes when it moves here:

| RevAI today | Concern | Plan |
|---|---|---|
| `.claude/skills/*` (adapted to RevAI) | hard-coded `server/src/...`, `client/...` paths | split: generic part → plugin; RevAI specifics stay in RevAI `AGENTS.md` or come via `userConfig` |
| `.claude/agents/*` | reference project skills and packages | agents in plugins reference skills by `<plugin>:<skill>` |
| hooks (PR gate, pre-push, subagent write guards) | scripts with repo-relative paths, Windows user | move scripts into `plugins/<name>/scripts/`, call via `${CLAUDE_PLUGIN_ROOT}` |
| `.agents/skills` symlink for Codex | plugins are Claude Code–specific | decide later whether Codex keeps a copy or a symlink into the installed plugin |
| `CLAUDE.md` → `AGENTS.md` symlinks | `CLAUDE.md` at plugin root isn't loaded | keep project guides in projects, not in plugins |
| `evals/` package | measures skills/agents | consider `claude plugin eval` per plugin |

RevAI side after migration: `.claude/settings.json` with `extraKnownMarketplaces` + `enabledPlugins` (see §8).

## 13. Re-check checklist (run when the repo is ready)

- [ ] `claude plugin validate .` passes with no warnings
- [ ] `claude plugin validate ./plugins/<each> --strict` passes
- [ ] every `plugins/*` directory is listed in `marketplace.json` and vice versa
- [ ] no plugin name starts with `claude-`, `anthropic-`, `cc-plugin-`
- [ ] `version` set only in `plugin.json`; CHANGELOG entry for it
- [ ] no `../` paths, no backslashes, no top-level `bin/`, no Git LFS files
- [ ] hooks use `"${CLAUDE_PLUGIN_ROOT}"` and run on Windows
- [ ] fresh install from GitHub works: `/plugin marketplace add nazardrahusevych/agentic-engineering`,
      install each plugin, `/reload-plugins`, skills/agents/hooks show up
- [ ] RevAI works with the plugins enabled via `.claude/settings.json` and its local copies removed
- [ ] `claude plugin details <name>` token cost is acceptable for each plugin
- [ ] no secrets, personal paths or private project details (before making the repo public)
- [ ] LICENSE present; `license`, `author`, `repository` set in each `plugin.json`
- [ ] re-read the "Not read yet" pages listed under Sources and the items marked **(verify)**
