// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://nazardrahusevych.github.io',
  base: '/agentic-engineering',
  trailingSlash: 'always',
  output: 'static',
  build: { format: 'directory' },
  integrations: [preact()],
});
