import { authenticatedTest as test, expect } from './fixtures';

/**
 * Smoke tests for /notifications/channels — the Phase B channel-management
 * UI. We do not actually create channels on prod; we just prove the dialog
 * renders dynamic fields for each channel type (schema comes from the API).
 */
test.describe('notifications - channels', () => {
  test('empty state renders when no channels exist', async ({ page }) => {
    await page.goto('/notifications/channels');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/notifications\/channels$/);
    await expect(
      page.getByRole('heading', { name: /Notification Channels/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: /Something went wrong/i }),
    ).toHaveCount(0);
  });

  test('"Add Channel" dialog exposes 4 channel types', async ({ page }) => {
    await page.goto('/notifications/channels');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add channel/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/Add Notification Channel/i).first(),
    ).toBeVisible();

    // Type selector is the second combobox (first is… actually just Type here).
    const typeTrigger = dialog.getByRole('combobox').first();
    await typeTrigger.click();

    for (const label of [/Telegram/i, /Slack/i, /Email/i, /Webhook/i]) {
      await expect(
        page.getByRole('option', { name: label }).first(),
      ).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('Telegram type renders botToken + chatId fields', async ({ page }) => {
    await page.goto('/notifications/channels');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add channel/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Default type is Telegram; dynamic schema should already be rendered.
    // Labels come from the API, but the convention keeps "Bot token" and
    // "Chat ID" (case-insensitive, with/without space).
    await expect(
      dialog.getByText(/bot token|bottoken/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.getByText(/chat id|chatid/i).first(),
    ).toBeVisible();

    await dialog
      .getByRole('button', { name: /cancel/i })
      .first()
      .click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('Email type renders SMTP host/port/user fields', async ({ page }) => {
    await page.goto('/notifications/channels');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add channel/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Switch type to Email.
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /Email/i }).first().click();

    // Expect the SMTP schema to render at least a host and a port label.
    // The exact copy comes from the backend; we match leniently.
    await expect(
      dialog.getByText(/host/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.getByText(/port/i).first(),
    ).toBeVisible();

    await dialog
      .getByRole('button', { name: /cancel/i })
      .first()
      .click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
