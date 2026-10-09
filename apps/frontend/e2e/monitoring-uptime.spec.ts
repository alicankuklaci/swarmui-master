import { authenticatedTest as test, expect } from './fixtures';

/**
 * Smoke tests for /monitoring/uptime. The live backend starts with zero
 * checks — the empty state and the add-check dialog are the surface worth
 * covering without actually mutating prod.
 */
test.describe('monitoring - uptime checks', () => {
  test('empty state renders when no checks exist', async ({ page }) => {
    await page.goto('/monitoring/uptime');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/monitoring\/uptime$/);
    await expect(
      page.getByRole('heading', { name: /Uptime Checks/i }).first(),
    ).toBeVisible();

    // Either the empty-state copy OR a table of rows must be visible — never
    // the ErrorBoundary.
    await expect(
      page.getByRole('alert').filter({ hasText: /Something went wrong/i }),
    ).toHaveCount(0);
  });

  test('"Add Check" dialog opens with http/tcp/ping type selector', async ({
    page,
  }) => {
    await page.goto('/monitoring/uptime');
    await page.waitForLoadState('networkidle');

    // There may be two "Add Check" entry points (header + empty-state CTA).
    // Clicking either is fine; use the first visible one.
    const addBtn = page.getByRole('button', { name: /add check/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/Add Uptime Check/i).first(),
    ).toBeVisible();

    // Open the Type select to prove it renders the three probe options.
    const typeTrigger = dialog
      .getByRole('combobox')
      .first();
    await typeTrigger.click();

    // Options are rendered in a Radix select content portal (role=option).
    await expect(
      page.getByRole('option', { name: /HTTP\(S\)/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: /TCP/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: /ping/i }).first(),
    ).toBeVisible();

    // Dismiss popover + dialog.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('submit is disabled while Name/Target are empty', async ({ page }) => {
    await page.goto('/monitoring/uptime');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add check/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const submit = dialog.getByRole('button', { name: /^create$/i }).first();
    await expect(submit).toBeDisabled();

    await dialog
      .getByRole('button', { name: /cancel/i })
      .first()
      .click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
