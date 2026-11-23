// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://nazardrahusevych.github.io',
  base: '/agentic-engineering',
  trailingSlash: 'always',
  output: 'static',
  build: { format: 'directory' },
  integrations: [react()],
});
