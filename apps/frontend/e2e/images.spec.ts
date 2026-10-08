import { authenticatedTest as test, expect } from './fixtures';

test.describe('images', () => {
  test('images list loads', async ({ page }) => {
    await page.goto('/images');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/images$/);
    await expect(
      page.getByRole('heading', { name: /images/i }).first(),
    ).toBeVisible();
  });

  test('pull dialog opens with an image input and closes on cancel', async ({
    page,
  }) => {
    await page.goto('/images');
    await page.waitForLoadState('networkidle');

    const pullBtn = page
      .getByRole('button', { name: /^pull image$|^pull$|çek/i })
      .first();
    await pullBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog should expose a textbox for the image name.
    await expect(dialog.getByRole('textbox').first()).toBeVisible();

    // Close via Cancel / Esc.
    const cancel = dialog.getByRole('button', { name: /cancel|iptal|close/i }).first();
    if (await cancel.count()) {
      await cancel.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
