import { authenticatedTest as test, expect } from './fixtures';

test.describe('services', () => {
  test('services list page loads', async ({ page }) => {
    await page.goto('/services');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/services$/);
    await expect(
      page.getByRole('heading', { name: /services/i }).first(),
    ).toBeVisible();
  });

  test('clicking a service row navigates to its detail page', async ({
    page,
  }) => {
    await page.goto('/services');
    await page.waitForLoadState('networkidle');

    // Give AutoEndpoint + services query a chance to settle.
    const row = page.locator('a[href^="/services/"]').first();
    const rowCount = await row.count();
    if (rowCount === 0) {
      test.skip(true, 'No services on this environment (likely no endpoint configured)');
      return;
    }
    const href = await row.getAttribute('href');
    expect(href).toBeTruthy();
    await row.click();
    await page.waitForURL(new RegExp(`${href}$`), { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('service row shows a replica count indicator', async ({ page }) => {
    await page.goto('/services');
    await page.waitForLoadState('networkidle');

    const row = page.locator('a[href^="/services/"]').first();
    if ((await row.count()) === 0) {
      test.skip(true, 'No services on this environment (likely no endpoint configured)');
      return;
    }
    // Replica badge format is typically "N/M" (e.g. "1/1").
    const replicas = page.locator('text=/\\b\\d+\\s*\\/\\s*\\d+\\b/').first();
    await expect(replicas).toBeVisible({ timeout: 10_000 });
  });
});
