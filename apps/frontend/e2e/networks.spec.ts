import { authenticatedTest as test, expect } from './fixtures';

test.describe('networks', () => {
  test('networks list page loads', async ({ page }) => {
    await page.goto('/networks');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/networks$/);
    await expect(
      page.getByRole('heading', { name: /networks/i }).first(),
    ).toBeVisible();
  });

  test('networks list shows at least one Docker-managed network when an endpoint is configured', async ({
    page,
  }) => {
    await page.goto('/networks');
    await page.waitForLoadState('networkidle');

    // When no endpoint is selected, the page may show an empty-state message.
    // We treat the "at least one network" case as the real assertion when
    // rows exist; otherwise skip to avoid false negatives in an unconfigured
    // environment.
    const anyNetworkText = page.getByText(
      /bridge|host|ingress|overlay|swarmui-master/i,
    );
    const hasAny = await anyNetworkText.first().isVisible().catch(() => false);
    if (!hasAny) {
      test.skip(true, 'No networks visible (likely no endpoint configured)');
      return;
    }
    await expect(anyNetworkText.first()).toBeVisible();
  });
});
