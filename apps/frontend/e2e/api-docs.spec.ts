import { authenticatedTest as test, expect } from './fixtures';

/**
 * Smoke tests for the new "Documentation" tab on /api-keys. The tab exposes
 * the OpenAPI/Swagger entry points and language-specific snippets.
 */
test.describe('api-keys - documentation tab', () => {
  test('/api-keys renders both API Keys and Documentation tabs', async ({
    page,
  }) => {
    await page.goto('/api-keys');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/api-keys$/);

    await expect(
      page.getByRole('heading', { name: /^API Keys$/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: /^API Keys$/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: /Documentation/i }).first(),
    ).toBeVisible();
  });

  test('Documentation tab shows base URL, rate limits, and the Swagger UI link', async ({
    page,
  }) => {
    await page.goto('/api-keys');
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /Documentation/i }).first().click();

    await expect(
      page.getByText(/^Base URL$/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/Rate limits/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Open Swagger UI/i }).first(),
    ).toBeVisible();
  });

  test('Code snippets panel exposes curl/python/node/go tabs', async ({
    page,
  }) => {
    await page.goto('/api-keys');
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /Documentation/i }).first().click();

    const curlTab = page.getByRole('tab', { name: /^curl$/i }).first();
    const pythonTab = page.getByRole('tab', { name: /^Python$/i }).first();
    const nodeTab = page.getByRole('tab', { name: /^Node\.js$/i }).first();
    const goTab = page.getByRole('tab', { name: /^Go$/i }).first();

    await expect(curlTab).toBeVisible({ timeout: 10_000 });
    await expect(pythonTab).toBeVisible();
    await expect(nodeTab).toBeVisible();
    await expect(goTab).toBeVisible();

    // Flip once to prove the tabs are interactive.
    await pythonTab.click();
    await expect(pythonTab).toHaveAttribute('aria-selected', 'true');
  });
});
