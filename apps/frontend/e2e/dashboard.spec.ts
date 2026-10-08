import { authenticatedTest as test, expect } from './fixtures';

test.describe('dashboard', () => {
  test('authenticated user lands at /dashboard with content', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('dashboard renders at least one stat card', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Each StatCard is a Card with a CardTitle span of text-sm font-medium
    // Rather than coupling to class names, look for the known card titles.
    const anyCardTitle = page.getByText(
      /Nodes|Services|Running Tasks|Users|Endpoints|Stacks/i,
    );
    await expect(anyCardTitle.first()).toBeVisible();
  });

  test('dashboard loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore noisy third-party / network warnings that are not app bugs.
        if (/favicon|net::ERR_|Failed to load resource/i.test(text)) return;
        consoleErrors.push(text);
      }
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
});
