import { expect, test } from '@playwright/test';
import { builtCatalog } from './helpers.ts';

test('AC-9: the footer shows the commit and date the catalog was built from', async ({ page }) => {
  const { commit, commitDate } = builtCatalog();
  await page.goto('./');
  const info = page.getByTestId('build-info');
  await expect(info).toContainText(commit.slice(0, 7));
  await expect(info).toContainText(commitDate.slice(0, 10));
  await expect(info.getByRole('link')).toHaveAttribute('href', new RegExp(`/commit/${commit}$`));
  await expect(page.getByRole('link', { name: 'catalog.json' })).toHaveAttribute('href', '/agentic-engineering/catalog.json');
});

test('the no-JavaScript message is in the page', async ({ page }) => {
  const response = await page.request.get('./');
  expect(await response.text()).toMatch(/<noscript>[\s\S]*JavaScript is required to search/);
});
