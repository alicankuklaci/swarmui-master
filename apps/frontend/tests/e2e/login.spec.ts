import { test, expect } from '@playwright/test';

test('login to dashboard', async ({ page }) => {
  await page.goto('/login');
  
  await page.fill('input[type="email"]', 'admin@swarmui.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('text=SwarmUI-Master')).toBeVisible();
});
