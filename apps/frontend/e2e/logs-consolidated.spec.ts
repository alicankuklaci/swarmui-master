import { authenticatedTest as test, expect } from './fixtures';

/**
 * /logs is the merged home for Audit, Activity, Auth, Events. Legacy routes
 * (/audit-log, /activity-logs, /auth-logs, /events) must redirect here with
 * the matching tab preselected.
 */
test.describe('consolidated /logs page', () => {
  test('shows four tabs and switches between them', async ({ page }) => {
    await page.goto('/logs');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/logs/);

    for (const label of ['Audit', 'Activity', 'Auth', 'Events']) {
      await expect(page.getByRole('tab', { name: new RegExp(label, 'i') })).toBeVisible();
    }

    // Clicking a tab syncs ?tab= to the URL.
    await page.getByRole('tab', { name: /events/i }).click();
    await page.waitForURL(/tab=events/, { timeout: 2500 });

    await page.getByRole('tab', { name: /auth$/i }).click();
    await page.waitForURL(/tab=auth/, { timeout: 2500 });
  });

  test('legacy /audit-log redirects to /logs?tab=audit', async ({ page }) => {
    await page.goto('/audit-log');
    await page.waitForURL(/\/logs\?tab=audit/, { timeout: 3000 });
  });

  test('legacy /events redirects to /logs?tab=events', async ({ page }) => {
    await page.goto('/events');
    await page.waitForURL(/\/logs\?tab=events/, { timeout: 3000 });
  });
});
