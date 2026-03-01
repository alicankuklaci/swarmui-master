import { test, expect } from '@playwright/test';

test('containers page load', async ({ page }) => {
  // Assuming authentication state is handled or bypassing it
  // For now, testing basic route and elements assuming we log in first
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@swarmui.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');

  await page.click('text=Containers');
  await expect(page).toHaveURL('/containers');
  await expect(page.locator('h1')).toHaveText('Containers');
});
