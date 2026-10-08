import { authenticatedTest as test, expect } from './fixtures';

test.describe('volumes', () => {
  test('volumes list loads', async ({ page }) => {
    await page.goto('/volumes');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/volumes$/);
    await expect(
      page.getByRole('heading', { name: /volumes/i }).first(),
    ).toBeVisible();
  });
});
