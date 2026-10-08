import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { authenticatedTest } from './fixtures';

/**
 * Lightweight a11y smoke:
 *  1. /login page should have no serious/critical axe violations.
 *  2. The Topbar icon buttons must have accessible names.
 */

test.describe('accessibility - unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/login has no serious axe violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    expect(
      serious,
      serious
        .map((v) => `${v.id} (${v.impact}): ${v.help}`)
        .join('\n'),
    ).toEqual([]);
  });
});

authenticatedTest.describe('accessibility - topbar', () => {
  authenticatedTest(
    'topbar icon buttons expose accessible names',
    async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // These aria-labels come from Topbar.tsx and must stay stable for a11y.
      for (const name of [
        /switch active endpoint/i,
        /change language/i,
        /notifications/i,
        /sign out/i,
      ]) {
        await expect(
          page.getByRole('button', { name }).first(),
        ).toBeVisible();
      }
    },
  );
});
