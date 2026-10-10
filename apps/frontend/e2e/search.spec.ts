import { authenticatedTest as test, expect } from './fixtures';

/**
 * The search bar is a shared primitive — Containers is representative. If
 * this spec passes everywhere the primitive is wired to `useUrlSearch`
 * should behave the same (debounced filtering, URL ?q= sync, clear button).
 */
test.describe('search input', () => {
  test('typing filters the list and syncs ?q= to the URL', async ({ page }) => {
    await page.goto('/containers');
    await page.waitForLoadState('networkidle');

    const search = page.getByRole('searchbox');
    await expect(search).toBeVisible();

    // Impossible needle: list should collapse (empty-state row or 0 rows).
    await search.fill('zzzz-no-such-container-xyz');
    // The URL sync is debounced ~300 ms.
    await page.waitForURL(/\?q=zzzz-no-such-container-xyz/, { timeout: 2500 });

    const linkCount = await page.locator('a[href^="/containers/"]').count();
    expect(linkCount).toBe(0);

    // Clear via the clear button → URL loses ?q= and rows return.
    await page.getByRole('button', { name: /clear search/i }).click();
    await page.waitForURL((url) => !url.search.includes('q='), {
      timeout: 2500,
    });
    await page.waitForLoadState('networkidle');
  });

  test('refreshing a page with ?q= in the URL preserves the query', async ({
    page,
  }) => {
    await page.goto('/containers?q=abc');
    await page.waitForLoadState('networkidle');
    const search = page.getByRole('searchbox');
    await expect(search).toHaveValue('abc');
  });
});
