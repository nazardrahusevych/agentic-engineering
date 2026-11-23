import { expect, test, type Page } from '@playwright/test';

const cards = (page: Page) => page.getByTestId('result-card');
const searchField = (page: Page) => page.getByRole('searchbox', { name: 'Search the catalog' });
const checkbox = (page: Page, filter: string, value: string) =>
  page.locator(`fieldset[data-filter="${filter}"]`).getByRole('checkbox', { name: new RegExp(`^${value} `) });
const count = (page: Page, filter: string, value: string) =>
  page.locator(`fieldset[data-filter="${filter}"] label`, { hasText: new RegExp(`^${value}\\s*\\(`) }).getByTestId('facet-count');
const ids = (page: Page) => cards(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')));

test.describe('filters and URL state', () => {
  test('AC-23: every option shows a count that follows the query', async ({ page }) => {
    await page.goto('./');
    await expect(cards(page)).toHaveCount(12);
    await expect(count(page, 'type', 'skill')).toHaveText('(5)');
    await expect(count(page, 'plugin', 'alpha')).toHaveText('(7)');
    await expect(count(page, 'category', 'workflow')).toHaveText('(5)');
    await expect(count(page, 'tag', 'pr')).toHaveText('(1)');

    await searchField(page).fill('review');
    await expect(count(page, 'type', 'skill')).not.toHaveText('(5)');
    const skills = await cards(page).evaluateAll((nodes) => nodes.filter((n) => n.getAttribute('data-type') === 'skill').length);
    await expect(count(page, 'type', 'skill')).toHaveText(`(${skills})`);
  });

  test('AC-24: options of one filter are ORed, different filters ANDed', async ({ page }) => {
    await page.goto('./');
    await checkbox(page, 'type', 'skill').check();
    await checkbox(page, 'type', 'agent').check();
    await expect(cards(page)).toHaveCount(7);
    await checkbox(page, 'plugin', 'beta').check();
    await expect(cards(page)).toHaveCount(4);
    expect((await ids(page)).sort()).toEqual(['beta:code-review', 'beta:planner', 'beta:spec-writer', 'beta:unsafe-markdown']);
  });

  test('AC-25: the URL keeps the state across a reload and in a new tab', async ({ page, context }) => {
    await page.goto('./');
    await searchField(page).fill('review');
    await checkbox(page, 'type', 'skill').check();
    await checkbox(page, 'plugin', 'beta').check();
    await expect(page).toHaveURL(/\?q=review&type=skill&plugin=beta$/);
    const expected = await ids(page);
    expect(expected).toEqual(['beta:code-review']);

    await page.reload();
    await expect(searchField(page)).toHaveValue('review');
    await expect(checkbox(page, 'type', 'skill')).toBeChecked();
    await expect(checkbox(page, 'plugin', 'beta')).toBeChecked();
    expect(await ids(page)).toEqual(expected);

    const copied = page.url();
    const other = await context.newPage();
    await other.goto(copied);
    await expect(searchField(other)).toHaveValue('review');
    await expect(cards(other)).toHaveCount(1);
    expect(await ids(other)).toEqual(expected);
  });

  test('AC-25: unknown values are ignored and known ones restored', async ({ page }) => {
    await page.goto('./?type=bogus&type=agent&plugin=nope');
    await expect(checkbox(page, 'type', 'agent')).toBeChecked();
    expect((await ids(page)).sort()).toEqual(['alpha:reviewer', 'beta:planner']);
    await expect(page).toHaveURL(/\?type=agent$/);
  });
});
