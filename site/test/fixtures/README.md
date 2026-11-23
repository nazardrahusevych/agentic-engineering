# Test fixtures

`marketplace/` is a small marketplace used only by the site tests (Vitest and Playwright). The real
`.claude-plugin/marketplace.json` at the repository root never references it.

| File | Used by |
|---|---|
| `marketplace/.claude-plugin/marketplace.json` | lists `alpha` and `beta` (AC-3); breaking it is an AC-6 case |
| `plugins/alpha/.claude-plugin/plugin.json`, `CHANGELOG.md` | plugin page: version, license, author, changelog (AC-28) |
| `plugins/alpha/skills/code-review/` (+ `reference.md`) | AC-4 namespaced ids, AC-27 file list, AC-32 ranking, `metadata.tags` |
| `plugins/alpha/skills/security-audit/SKILL.md` | AC-13 prefix and typo search ("secur", "secuirty") |
| `plugins/alpha/agents/reviewer.md` | agent card and detail page (AC-27) |
| `plugins/alpha/commands/deploy-check.md` | command without frontmatter: description from the first body line |
| `plugins/alpha/hooks/hooks.json`, `scripts/check-command.mjs` | the one hooks entry per plugin (AC-3, AC-27) |
| `plugins/alpha/.mcp.json` | MCP server `docs-search` (AC-3, AC-27) |
| `plugins/alpha/output-styles/terse.md` | no card; listed only in the plugin's files (Non-goals, AC-27) |
| `plugins/beta/skills/code-review/SKILL.md` | same skill name in another plugin (AC-4, AC-26); name from the directory |
| `plugins/beta/skills/spec-writer/SKILL.md` | "zebrafish" and "security" only in the body (AC-11, AC-12) |
| `plugins/beta/skills/unsafe-markdown/SKILL.md` | hostile markdown (Untrusted inputs, AC-27) |
| `plugins/beta/agents/planner.md` | "security" only in the body (AC-12) |
| `plugins/unlisted/` | a plugin directory not listed in the marketplace (AC-5) |
| `marketplace.expected.json` | the exact entries in landing order (AC-3, AC-15) |

Error cases (AC-6) mutate a temporary copy made with `test/helpers/fixture.ts`; they never edit these files.
