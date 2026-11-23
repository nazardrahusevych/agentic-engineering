// Builds the site from the fixture marketplace into dist-e2e/ for the Playwright tests.
// Uses the Astro API instead of inline env syntax so it works the same on Windows and Linux.
import { build } from 'astro';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
process.env.CATALOG_ROOT = 'test/fixtures/marketplace';
process.env.CATALOG_REPO ??= 'nazardrahusevych/agentic-engineering';

await build({ root, outDir: './dist-e2e', logLevel: 'warn' });
