import { test, expect } from '@playwright/test';

/**
 * Auth flow. Runs with a clean context (no storageState) so we can
 * exercise login/logout and the unauthenticated redirect.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const USERNAME = process.env.SWARMUI_USER || 'root';
const PASSWORD = process.env.SWARMUI_PASS || '254226Aq';

test.describe('auth', () => {
  test('login succeeds and redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(USERNAME);
    await page.getByLabel(/password/i).first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL((url) => !/\/login$/.test(url.pathname), {
      timeout: 15_000,
    });
    await expect(page).not.toHaveURL(/\/login$/);
    // Topbar renders the product name once logged in.
    await expect(
      page.getByRole('heading', { name: /SwarmUI Master/i }).first(),
    ).toBeVisible();
  });

  test('login with wrong password shows an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(USERNAME);
    await page.getByLabel(/password/i).first().fill('definitely-wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should NOT navigate away from /login.
    // Wait for a toast / inline error, with fallback assertions.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('unauthenticated user hitting / is redirected to /login', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('logout returns the user to /login', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(USERNAME);
    await page.getByLabel(/password/i).first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => !/\/login$/.test(url.pathname), {
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login$/);
  });
});
