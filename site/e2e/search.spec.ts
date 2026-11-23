import { expect, test, type Page } from '@playwright/test';

const cards = (page: Page) => page.getByTestId('result-card');
const searchField = (page: Page) => page.getByRole('searchbox', { name: 'Search the catalog' });

async function ready(page: Page, path = './') {
  await page.goto(path);
  await expect(searchField(page)).toBeVisible();
}

test.describe('search', () => {
  test('AC-10: results update while typing, with no requests after the initial load', async ({ page }) => {
    await ready(page);
    await expect(cards(page)).toHaveCount(12);
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    await searchField(page).pressSequentially('zebra', { delay: 30 });
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toHaveAttribute('data-id', 'beta:spec-writer');

    await searchField(page).fill('secuirty');
    await expect(cards(page).first()).toHaveAttribute('data-id', 'alpha:security-audit');

    await searchField(page).fill('I need a skill for reviewing pull requests');
    await expect
      .poll(async () =>
        (await cards(page).evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.getAttribute('data-id')))).sort(),
      )
      .toEqual(['alpha:code-review', 'beta:code-review']);
    expect(requests).toEqual([]);
  });

  test('AC-16: a nonsense query shows the empty state; with a filter set it also offers "Clear filters"', async ({ page }) => {
    await ready(page);
    await searchField(page).fill('qwxzvbnm');
    const empty = page.getByTestId('empty-state');
    await expect(empty).toBeVisible();
    await expect(empty.getByRole('link', { name: 'Request it' })).toBeVisible();
    await expect(empty.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

    await searchField(page).fill('');
    await page.getByTestId('filters').getByRole('checkbox', { name: /^mcp/ }).check();
    await searchField(page).fill('zebrafish');
    await expect(empty).toBeVisible();
    await empty.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toHaveAttribute('data-id', 'beta:spec-writer');
  });

  test('AC-17: "Request it" opens the pre-filled issue form in a new tab', async ({ page }) => {
    await ready(page, './?type=agent&plugin=beta');
    await searchField(page).fill('terraform drift');
    const link = page.getByTestId('empty-state').getByRole('link', { name: 'Request it' });
    await expect(link).toHaveAttribute(
      'href',
      'https://github.com/nazardrahusevych/agentic-engineering/issues/new?template=artifact-request.yml' +
        '&title=Request%3A+terraform+drift&query=terraform+drift&filters=type%3A+agent%3B+plugin%3A+beta',
    );
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('AC-18: "/" focuses the search field, but not while typing in it', async ({ page }) => {
    await ready(page);
    await page.locator('h1').click();
    await expect(searchField(page)).not.toBeFocused();
    await page.keyboard.press('/');
    await expect(searchField(page)).toBeFocused();
    await expect(searchField(page)).toHaveValue('');
    await page.keyboard.type('a/b');
    await expect(searchField(page)).toHaveValue('a/b');
  });

  test('Untrusted inputs: an HTML query is shown as text and runs nothing', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', async (dialog) => {
      dialogs += 1;
      await dialog.dismiss();
    });
    const payload = '<img src=x onerror=alert(1)>';
    await ready(page, `./?q=${encodeURIComponent(payload)}`);
    await expect(searchField(page)).toHaveValue(payload);
    await searchField(page).fill(`${payload} "quotes" .* (regex[`);
    await page.waitForTimeout(300);
    expect(dialogs).toBe(0);
    expect(await page.locator('main img').count()).toBe(0);
  });
});
