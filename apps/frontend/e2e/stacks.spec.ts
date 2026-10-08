import { authenticatedTest as test, expect } from './fixtures';

test.describe('stacks', () => {
  test('stacks list page loads', async ({ page }) => {
    await page.goto('/stacks');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/stacks$/);
    await expect(
      page.getByRole('heading', { name: /stacks/i }).first(),
    ).toBeVisible();
  });

  test('"New Stack" opens the fullscreen editor and Esc closes it', async ({
    page,
  }) => {
    await page.goto('/stacks');
    await page.waitForLoadState('networkidle');

    const newStack = page
      .getByRole('button', { name: /^deploy stack$|^new stack$|^yeni stack$|^create stack$/i })
      .first();
    await newStack.click();

    // Editor opens — look for the YAML placeholder content or Env Variables toggle.
    const editorContent = page
      .locator('text=/version:\\s*"3\\.8"|services:|env variables|yeni stack deploy/i')
      .first();
    await expect(editorContent).toBeVisible({ timeout: 10_000 });

    // Esc should close when nothing was edited (dirty-check is on contents).
    await page.keyboard.press('Escape');
    // After close, the "Deploy Stack" button is visible again.
    await expect(newStack).toBeVisible({ timeout: 5_000 });
  });

  test('clicking an existing stack navigates to its detail page', async ({
    page,
  }) => {
    await page.goto('/stacks');
    await page.waitForLoadState('networkidle');

    // Stack rows link to /stacks/<name> via react-router <Link>.
    const stackLink = page.locator('a[href^="/stacks/"]').first();
    if (!(await stackLink.count())) {
      test.skip(true, 'No stacks present on this environment');
      return;
    }

    const href = await stackLink.getAttribute('href');
    await stackLink.click();
    await page.waitForURL(new RegExp(`${href}$`), { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});
