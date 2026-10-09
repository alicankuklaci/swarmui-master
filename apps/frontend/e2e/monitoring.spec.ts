import { authenticatedTest as test, expect } from './fixtures';

/**
 * Smoke tests for the Phase B monitoring UI.
 * Hits the live production backend and asserts the shell renders without an
 * ErrorBoundary — the deep assertions on data belong in unit tests.
 */
test.describe('monitoring', () => {
  test('overview renders without the error boundary', async ({ page }) => {
    await page.goto('/monitoring');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/monitoring$/);
    await expect(
      page.getByRole('heading', { name: /^Monitoring$/i }).first(),
    ).toBeVisible();
    // The ErrorBoundary renders "Something went wrong"
    await expect(
      page.getByRole('alert').filter({ hasText: /Something went wrong/i }),
    ).toHaveCount(0);
  });

  test('overview shows node cards that link to /monitoring/nodes/:id', async ({
    page,
  }) => {
    await page.goto('/monitoring');
    await page.waitForLoadState('networkidle');

    const nodeLinks = page.locator('a[href^="/monitoring/nodes/"]');
    // 3 nodes expected per API smoke; allow 1+ to tolerate churn.
    await expect(nodeLinks.first()).toBeVisible({ timeout: 10_000 });
    const count = await nodeLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking a node card navigates to its detail page with Time-series tab', async ({
    page,
  }) => {
    await page.goto('/monitoring');
    await page.waitForLoadState('networkidle');

    const firstNode = page.locator('a[href^="/monitoring/nodes/"]').first();
    await expect(firstNode).toBeVisible({ timeout: 10_000 });
    await firstNode.click();

    await page.waitForURL(/\/monitoring\/nodes\//, { timeout: 10_000 });
    // Time-series tab trigger uses role=tab.
    await expect(
      page.getByRole('tab', { name: /time-series/i }).first(),
    ).toBeVisible();
  });

  test('/monitoring/live renders node grid and container table', async ({
    page,
  }) => {
    await page.goto('/monitoring/live');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/monitoring\/live$/);
    await expect(
      page.getByRole('heading', { name: /Live Monitoring/i }).first(),
    ).toBeVisible();

    // Either the node grid is populated or the empty state is shown — crash is
    // the only forbidden outcome.
    await expect(
      page.getByRole('alert').filter({ hasText: /Something went wrong/i }),
    ).toHaveCount(0);

    // "Top containers (live)" header should always exist.
    await expect(
      page.getByText(/Top containers \(live\)/i).first(),
    ).toBeVisible();
  });

  test('/monitoring/containers "By CPU"/"By Memory" toggle is wired', async ({
    page,
  }) => {
    await page.goto('/monitoring/containers');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /Container Monitoring/i }).first(),
    ).toBeVisible();

    const byMem = page.getByRole('button', { name: /^By Memory$/i }).first();
    const byCpu = page.getByRole('button', { name: /^By CPU$/i }).first();

    // Toggle to memory, then back to CPU; the clicks must not crash the page.
    await byMem.click();
    await page.waitForLoadState('networkidle');
    await byCpu.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/monitoring\/containers$/);
    await expect(
      page.getByRole('alert').filter({ hasText: /Something went wrong/i }),
    ).toHaveCount(0);
  });

  test('/monitoring/alarms renders header without crash', async ({ page }) => {
    await page.goto('/monitoring/alarms');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/monitoring\/alarms$/);
    await expect(
      page.getByRole('heading', { name: /^Alarms$/i }).first(),
    ).toBeVisible();
    // Either rows or empty state is fine — just no boundary.
    await expect(
      page.getByRole('alert').filter({ hasText: /Something went wrong/i }),
    ).toHaveCount(0);
  });
});
