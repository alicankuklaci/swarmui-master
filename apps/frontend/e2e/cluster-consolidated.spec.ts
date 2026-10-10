import { authenticatedTest as test, expect } from './fixtures';

/**
 * /cluster is the merged home for Swarm overview, Nodes, and Topology.
 * Legacy routes (/swarm, /nodes, /visualizer) must redirect here with the
 * matching tab preselected.
 */
test.describe('consolidated /cluster page', () => {
  test('shows three tabs and switches between them', async ({ page }) => {
    await page.goto('/cluster');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/cluster/);

    for (const label of ['Overview', 'Nodes', 'Topology']) {
      await expect(page.getByRole('tab', { name: new RegExp(label, 'i') })).toBeVisible();
    }

    await page.getByRole('tab', { name: /nodes/i }).click();
    await page.waitForURL(/tab=nodes/, { timeout: 2500 });

    await page.getByRole('tab', { name: /topology/i }).click();
    await page.waitForURL(/tab=topology/, { timeout: 2500 });
  });

  test('legacy /nodes redirects to /cluster?tab=nodes', async ({ page }) => {
    await page.goto('/nodes');
    await page.waitForURL(/\/cluster\?tab=nodes/, { timeout: 3000 });
  });

  test('legacy /swarm redirects to /cluster?tab=overview', async ({ page }) => {
    await page.goto('/swarm');
    await page.waitForURL(/\/cluster\?tab=overview/, { timeout: 3000 });
  });

  test('legacy /visualizer redirects to /cluster?tab=topology', async ({ page }) => {
    await page.goto('/visualizer');
    await page.waitForURL(/\/cluster\?tab=topology/, { timeout: 3000 });
  });
});
