import { expect, test } from '@playwright/test';

test('AC-29: an unknown artifact URL shows "not found" with a pre-filled search', async ({ page }) => {
  const response = await page.goto('plugins/alpha/skills/gone/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  const field = page.getByRole('searchbox', { name: 'Search' });
  await expect(field).toHaveValue('gone');

  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/agentic-engineering\/\?q=gone$/);
  await expect(page.getByRole('searchbox', { name: 'Search the catalog' })).toHaveValue('gone');
});

test('AC-29: a hostile path segment is shown only as a field value', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });
  await page.goto(`plugins/${encodeURIComponent('<img src=x onerror=alert(1)>')}/`);
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('<img src=x onerror=alert(1)>');
  expect(await page.locator('main img').count()).toBe(0);
  expect(dialogs).toBe(0);
});
