#!/usr/bin/env node
// Checks every plugin of the marketplace (SPEC-2): manifests, README/CHANGELOG, dependencies, project-neutral text,
// plugin-agent frontmatter and skill references. Usage: node scripts/validate-plugins.mjs [root]
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepository } from './lib/validate-lib.mjs';

const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const problems = validateRepository(root);
if (problems.length > 0) {
  for (const problem of problems) console.error(`${problem.path}: ${problem.reason}`);
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log('All plugins are valid.');
