import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = ['./', 'plugins/alpha/skills/code-review/', 'plugins/alpha/', 'plugins/alpha/hooks/'];

async function open(page: Page, path: string) {
  await page.goto(path);
  if (path === './') await expect(page.getByTestId('result-card').first()).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`NFR: ${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
        await open(page, path);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }

    test('NFR: the theme follows the system setting', async ({ page }) => {
      await open(page, './');
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background).toBe(colorScheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(17, 20, 24)');
    });
  });
}

test.describe('layout and privacy', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const path of PAGES) {
    test(`NFR: ${path} has no horizontal scroll at 360 px`, async ({ page }) => {
      await open(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('NFR: every request is same-origin and no cookies are set', async ({ page, context }) => {
    const origins = new Set<string>();
    page.on('request', (request) => origins.add(new URL(request.url()).origin));
    await open(page, './');
    await page.getByRole('searchbox', { name: 'Search the catalog' }).fill('review');
    await open(page, 'plugins/alpha/skills/code-review/');
    await page.waitForLoadState('networkidle');
    expect([...origins]).toEqual(['http://127.0.0.1:4321']);
    expect(await context.cookies()).toEqual([]);
  });

  test('NFR: cards and filters are reachable by keyboard', async ({ page }) => {
    await open(page, './');
    const focused: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      focused.push(await page.evaluate(() => document.activeElement?.getAttribute('type') ?? document.activeElement?.tagName ?? ''));
    }
    expect(focused).toContain('search');
    expect(focused).toContain('checkbox');
    expect(focused).toContain('A');
    expect(focused).toContain('button');
  });
});
