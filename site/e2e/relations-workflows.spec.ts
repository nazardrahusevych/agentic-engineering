import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.describe('SPEC-3: plugin relations, workflows and React', () => {
  test('AC-4: plugin pages show "Depends on" and "Used by" with links', async ({ page }) => {
    await page.goto('plugins/beta/');
    const dependsOn = page.getByTestId('depends-on');
    await expect(dependsOn.getByRole('link', { name: 'alpha' })).toHaveAttribute('href', '/agentic-engineering/plugins/alpha/');
    await expect(page.getByTestId('used-by')).toContainText('No other plugins.');

    await page.goto('plugins/alpha/');
    await expect(page.getByTestId('used-by').getByRole('link', { name: 'beta' })).toHaveAttribute(
      'href',
      '/agentic-engineering/plugins/beta/',
    );
    await expect(page.getByTestId('depends-on')).toContainText('No other plugins.');
  });

  test('AC-5/AC-7: a workflow has a card and a page with its run command, phases and source as text', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', async (dialog) => {
      dialogs += 1;
      await dialog.dismiss();
    });
    await page.goto('./');
    const card = page.locator('[data-testid="result-card"][data-id="alpha:triage"]');
    await expect(card.getByTestId('type-badge')).toHaveText('workflow');
    await card.getByRole('link', { name: 'triage' }).click();
    await expect(page).toHaveURL(/\/plugins\/alpha\/workflows\/triage\/$/);
    const info = page.getByTestId('workflow-info');
    await expect(info.locator('code')).toHaveText('/alpha:triage');
    await expect(page.getByTestId('workflow-phases').getByRole('listitem')).toHaveText(['Collect', 'Label', 'Report']);
    await expect(page.getByTestId('workflow-source')).toContainText("throw new Error('the catalog build must never execute");
    expect(await page.getByTestId('workflow-source').locator('script').count()).toBe(0);
    expect(dialogs).toBe(0);
  });

  test('AC-1: the interactive islands are rendered by React', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('result-card').first()).toBeVisible();
    const island = page.locator('astro-island').first();
    // The island renderer hydrates with React DOM (hydrateRoot); a Preact renderer has no such call.
    const rendererUrl = await island.getAttribute('renderer-url');
    expect(rendererUrl).toBeTruthy();
    const renderer = await (await page.request.get(new URL(rendererUrl!, page.url()).href)).text();
    expect(renderer).toMatch(/hydrateRoot|createRoot/);
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    expect(pkg.dependencies).toHaveProperty('react');
    expect(pkg.dependencies).not.toHaveProperty('preact');
  });
});
