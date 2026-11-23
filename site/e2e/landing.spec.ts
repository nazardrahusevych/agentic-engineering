import { expect, test } from '@playwright/test';
import { expectedEntries } from './helpers.ts';

test.describe('landing page', () => {
  test('AC-15: lists every fixture artifact in landing order', async ({ page }) => {
    await page.goto('./');
    const cards = page.getByTestId('result-card');
    const expected = expectedEntries();
    await expect(cards).toHaveCount(expected.length);
    const actual = await cards.evaluateAll((nodes) =>
      nodes.map((node) => ({ id: node.getAttribute('data-id'), type: node.getAttribute('data-type') })),
    );
    expect(actual).toEqual(expected);
    await expect(page.getByTestId('result-count')).toHaveText('12 artifacts');
  });

  test('AC-19: a card shows badge, name, plugin, clamped description, up to 3 tags and the copy button', async ({ page }) => {
    await page.goto('./');
    const card = page.locator('[data-testid="result-card"][data-id="alpha:code-review"]');
    await expect(card.getByTestId('type-badge')).toHaveText('skill');
    await expect(card.getByRole('link', { name: 'code-review' })).toHaveAttribute(
      'href',
      '/agentic-engineering/plugins/alpha/skills/code-review/',
    );
    await expect(card.getByTestId('card-plugin')).toHaveText('in alpha');
    const description = card.locator('.description');
    await expect(description).toHaveText(/^Review pull requests/);
    expect(await description.evaluate((node) => getComputedStyle(node).webkitLineClamp)).toBe('2');
    await expect(card.getByRole('listitem')).toHaveText(['review', 'pr']);
    await expect(card.getByRole('button', { name: /Copy install/ })).toBeVisible();

    // A plugin with more tags shows at most three.
    const plugin = page.locator('[data-testid="result-card"][data-id="alpha"]');
    expect(await plugin.locator('.tag').count()).toBeLessThanOrEqual(3);
    // The button is not inside the link.
    expect(await card.locator('a button').count()).toBe(0);
  });

  test('AC-20: "Copy install" copies the plugin install command and confirms for about 2 s', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./');
    const card = page.locator('[data-testid="result-card"][data-id="alpha:reviewer"]');
    await card.getByRole('button', { name: /Copy install/ }).click();
    const status = card.getByRole('status');
    await expect(status).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/plugin install alpha@agentic-engineering');
    await page.waitForTimeout(1500);
    await expect(status).toHaveText('Copied');
    await expect(status).toHaveText('', { timeout: 1500 });
  });

  test('AC-21: without clipboard access the command is shown selected for manual copying', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
    });
    await page.goto('./');
    const card = page.locator('[data-testid="result-card"][data-id="beta:planner"]');
    await card.getByRole('button', { name: /Copy install/ }).click();
    const field = card.getByRole('textbox');
    await expect(field).toHaveValue('/plugin install beta@agentic-engineering');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('readonly', '');
    const selected = await field.evaluate((node: HTMLInputElement) =>
      node.value.slice(node.selectionStart ?? 0, node.selectionEnd ?? 0),
    );
    expect(selected).toBe('/plugin install beta@agentic-engineering');
    await expect(card.getByText('Press Ctrl+C / ⌘C to copy')).toBeVisible();
  });

  test('AC-22: shows the marketplace add command with its own copy button', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./');
    const box = page.getByTestId('add-marketplace');
    await expect(box.locator('code')).toHaveText('/plugin marketplace add nazardrahusevych/agentic-engineering');
    await box.getByRole('button', { name: /Copy/ }).click();
    await expect(box.getByRole('status')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      '/plugin marketplace add nazardrahusevych/agentic-engineering',
    );
  });
});
