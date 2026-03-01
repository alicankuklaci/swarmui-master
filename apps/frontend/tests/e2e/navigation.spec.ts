import { test, expect } from '@playwright/test';

test('basic navigation', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@swarmui.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');

  const links = ['Stacks', 'Endpoints', 'Images', 'Volumes', 'Networks', 'Settings'];
  for (const link of links) {
    await page.click(`text=${link}`);
    await expect(page).toHaveURL(`/${link.toLowerCase()}`);
  }
});
