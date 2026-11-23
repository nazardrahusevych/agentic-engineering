# Releasing and rolling back

Two things in this repository ship to users, and they release differently:

| What | How users get it | Release | Rollback |
|---|---|---|---|
| A plugin (`plugins/<name>/`) | Claude Code copies it into its cache when the plugin's **version changes** | `scripts/release.mjs` | `scripts/rollback.mjs` (roll forward) |
| The catalog site (GitHub Pages) | browser loads the latest deployment | the Pages workflow on push to `main` | redeploy an older ref ([docs/catalog-site.md](catalog-site.md#deploying-and-rolling-back)) |

The marketplace catalog itself (`.claude-plugin/marketplace.json`) has no version of its own: Claude Code reads it
from the default branch on every refresh, so a change to it is live as soon as it lands on `main`.

## Versioning rules

- Every plugin is versioned on its own with semver `x.y.z`, set **only** in `plugins/<name>/.claude-plugin/plugin.json`.
  Never put `version` in the marketplace entry: if both are set, `plugin.json` wins silently. The scripts refuse
  to run if an entry has one.
- Users get a new copy only when the version string changes. A merged change without a version bump does not
  reach users who already installed the plugin.
- Each release is tagged `<plugin>--v<version>` (the format of `claude plugin tag`), e.g. `review-gates--v1.2.0`.
- Every plugin has `plugins/<name>/CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com) style with a
  `## [Unreleased]` section. Changes add a line there in the same PR.
- Breaking a skill's or agent's name, removing a component, or changing what a hook blocks is a **major** bump.

## Release a plugin

Run on an up-to-date, clean `main`:

```bash
npm run release -- <plugin> <major|minor|patch|x.y.z> --dry-run
```

```bash
npm run release -- <plugin> <major|minor|patch|x.y.z> --push
```

The script:
1. checks the tree is clean and the branch is `main` (`--allow-branch` overrides);
2. finds the plugin through `marketplace.json` and refuses a `version` in the entry;
3. computes the next version and refuses an existing tag or a plugin with no changes since its last tag;
4. turns the CHANGELOG `## [Unreleased]` notes into `## [x.y.z] - <date>` (refuses an empty Unreleased section);
5. writes the version to `plugin.json` and runs `claude plugin validate .` and
   `claude plugin validate plugins/<name> --strict` when the Claude Code CLI is installed
   (`--skip-validate` skips it; CI validates anyway);
6. commits `release(<plugin>): v<version>`, creates the annotated tag, and with `--push` pushes both atomically.

If anything fails after files were written, the script resets the tree to `HEAD` (it was clean at the start, so
only the script's own changes are discarded) and creates no commit or tag.

## Roll back a plugin

```bash
npm run rollback -- <plugin> <target-version> --dry-run
```

```bash
npm run rollback -- <plugin> <target-version> --push
```

A rollback is a **roll forward**: the plugin directory is restored exactly as it was at `<plugin>--v<target>`
(files added since then are removed) and published as a new patch version above the current one. Example: current
`1.1.0` is broken, `npm run rollback -- demo 1.0.0` releases `1.1.1` with the contents of `1.0.0`.

Why not just point back at the old version: users only receive a new copy when the version changes, and Claude Code
keeps each installed version in its cache. Re-using `1.0.0` would leave everyone already on `1.1.0` where they are;
a new, higher version reaches them on their next update.

The script keeps the current CHANGELOG history and adds a `### Reverted` entry, validates, commits
`revert(<plugin>): roll back to v<target> as v<new>`, and tags. Like `release`, it undoes its own changes on failure.

Not covered by the rollback, check by hand:
- the plugin's entry in `.claude-plugin/marketplace.json` (description, tags) is not restored;
- files the plugin reaches through symlinks to elsewhere in the repository are not restored;
- a bad fix in the rolled-back version is fixed with a normal PR and a new `release`.

## What users can do themselves

- Update: `claude plugin update <plugin>@agentic-engineering`, then `/reload-plugins`.
  Auto-update is off by default for third-party marketplaces (toggle in `/plugin` → Marketplaces).
- Pin the whole marketplace to a ref while a fix is on the way:
  `/plugin marketplace add nazardrahusevych/agentic-engineering#<tag-or-sha>`.

## Script tests

```bash
npm test
```

Runs the unit tests of `scripts/lib/release-lib.mjs` (`node --test`, no dependencies).
