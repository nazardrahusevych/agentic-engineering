import { expect, test, type Page } from '@playwright/test';

const detail = (page: Page) => page.getByTestId('artifact-detail');

test.describe('detail pages', () => {
  test('AC-26: a card opens a stable detail URL that survives a reload', async ({ page }) => {
    await page.goto('./');
    await page
      .locator('[data-testid="result-card"][data-id="alpha:code-review"]')
      .getByRole('link', { name: 'code-review' })
      .click();
    await expect(page).toHaveURL(/\/agentic-engineering\/plugins\/alpha\/skills\/code-review\/$/);
    await expect(detail(page)).toHaveAttribute('data-id', 'alpha:code-review');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('code-review');
    await expect(detail(page).getByTestId('artifact-id')).toHaveText('alpha:code-review');
  });

  test('AC-27: a skill page shows description, body, files, install, source and siblings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('plugins/alpha/skills/code-review/');
    const d = detail(page);
    await expect(d.getByTestId('description')).toHaveText(
      'Review pull requests for correctness, readability and missing tests before they are merged.',
    );
    await expect(d.getByTestId('artifact-body').getByRole('heading', { name: 'Code review' })).toBeVisible();
    await expect(d.getByTestId('artifact-body').locator('table')).toBeVisible();
    await expect(d.getByTestId('file-list')).toContainText('plugins/alpha/skills/code-review/reference.md');
    await expect(d.locator('code', { hasText: '/plugin install alpha@agentic-engineering' })).toBeVisible();
    await expect(d.getByTestId('source-link')).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/nazardrahusevych\/agentic-engineering\/tree\/[0-9a-f]{40}\/test\/fixtures|^https:\/\/github\.com\/nazardrahusevych\/agentic-engineering\/tree\/[0-9a-f]{40}\/plugins\/alpha\/skills\/code-review$/,
    );
    await expect(d.getByTestId('source-link')).toHaveAttribute('rel', 'noopener noreferrer');
    const siblings = d.getByTestId('sibling-list');
    await expect(siblings.getByRole('link')).toHaveText(['alpha', 'security-audit', 'reviewer', 'deploy-check', 'triage', 'hooks', 'docs-search']);
    await d.getByRole('button', { name: /Copy/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/plugin install alpha@agentic-engineering');
  });

  test('AC-27: agent and command pages render their bodies', async ({ page }) => {
    await page.goto('plugins/alpha/agents/reviewer/');
    await expect(detail(page).getByTestId('artifact-body')).toContainText('You are a careful reviewer.');
    await page.goto('plugins/alpha/commands/deploy-check/');
    await expect(detail(page).getByTestId('description')).toHaveText('Check that the current branch is ready to deploy.');
    await expect(detail(page).getByTestId('artifact-body')).toContainText('Run the build, the tests and the linter');
  });

  test('AC-27: the hooks page shows events and matchers', async ({ page }) => {
    await page.goto('plugins/alpha/hooks/');
    const table = detail(page).getByTestId('hooks-table');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table.locator('tbody tr').nth(0)).toContainText('PreToolUse');
    await expect(table.locator('tbody tr').nth(0)).toContainText('Bash');
    await expect(table.locator('tbody tr').nth(1)).toContainText('PostToolUse');
    await expect(table.locator('tbody tr').nth(1)).toContainText('Edit|Write');
    await expect(detail(page).getByTestId('file-list')).toContainText('plugins/alpha/hooks/hooks.json');
  });

  test('AC-27: the MCP page shows the server name and command', async ({ page }) => {
    await page.goto('plugins/alpha/mcp/docs-search/');
    const info = detail(page).getByTestId('mcp-info');
    await expect(info).toContainText('docs-search');
    await expect(info).toContainText('stdio');
    await expect(info).toContainText('npx -y docs-search-mcp --index ${CLAUDE_PLUGIN_ROOT}/docs');
  });

  test('AC-28: the plugin page shows version, license, author, changelog and all files', async ({ page }) => {
    await page.goto('plugins/alpha/');
    const facts = detail(page).getByTestId('plugin-facts');
    await expect(facts).toContainText('1.2.0');
    await expect(facts).toContainText('MIT');
    const author = facts.getByRole('link', { name: 'Alpha Author' });
    await expect(author).toHaveAttribute('href', 'https://example.com/alpha');
    await expect(author).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(facts).toContainText('output-styles');
    await expect(detail(page).getByTestId('changelog').getByRole('heading', { name: /1\.2\.0/ })).toBeVisible();
    await expect(detail(page).getByTestId('file-list')).toContainText('plugins/alpha/output-styles/terse.md');
    await expect(detail(page).getByTestId('sibling-list').getByRole('link')).toHaveCount(7);
  });

  test('Untrusted inputs: hostile markdown runs nothing and renders no script, iframe or image', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', async (dialog) => {
      dialogs += 1;
      await dialog.dismiss();
    });
    await page.goto('plugins/beta/skills/unsafe-markdown/');
    const body = detail(page).getByTestId('artifact-body');
    await expect(body.getByRole('heading', { name: 'Unsafe markdown' })).toBeVisible();
    expect(await body.locator('script, iframe, img, [onclick], [onerror]').count()).toBe(0);
    expect(await body.locator('a[href^="javascript:"]').count()).toBe(0);
    await expect(body.getByRole('link', { name: 'External image' })).toHaveAttribute('href', 'https://example.com/tracker.png');
    await expect(body.getByRole('link', { name: 'A relative link' })).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/nazardrahusevych\/agentic-engineering\/blob\/[0-9a-f]{40}\/plugins\/beta\/skills\/unsafe-markdown\/notes\/guide\.md$/,
    );
    await expect(body).not.toContainText('Click me');
    await page.waitForTimeout(200);
    expect(dialogs).toBe(0);
  });
});
