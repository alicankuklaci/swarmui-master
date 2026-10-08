import { authenticatedTest as test, expect } from './fixtures';

test.describe('registries', () => {
  test('registries list page loads', async ({ page }) => {
    await page.goto('/registries');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/registries$/);
    await expect(
      page.getByRole('heading', { name: /Registries/i }).first(),
    ).toBeVisible();
  });

  test('create registry dialog opens, validates, and closes on cancel', async ({
    page,
  }) => {
    await page.goto('/registries');
    await page.waitForLoadState('networkidle');

    // "Add Registry" / "Yeni Registry" button – match by icon + role.
    const addButton = page
      .getByRole('button', { name: /add registry|new registry|yeni registry/i })
      .first();

    // Fall back: any button that contains the plus icon in the header region.
    const openClickable = (await addButton.count())
      ? addButton
      : page.locator('button:has(svg.lucide-plus)').first();

    await openClickable.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The submit button acts as the validation gate — it must be DISABLED
    // when required fields (name / username / password) are empty.
    const submit = dialog
      .getByRole('button', { name: /create|kaydet|save|add/i })
      .first();
    if (await submit.count()) {
      await expect(submit).toBeDisabled();
    }

    // Close via Cancel / Esc.
    const cancel = dialog
      .getByRole('button', { name: /cancel|iptal|close/i })
      .first();
    if (await cancel.count()) {
      await cancel.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
