import { authenticatedTest as test, expect } from './fixtures';

const NAV_TARGETS: Array<{ label: RegExp; url: RegExp }> = [
  { label: /^Stacks$/, url: /\/stacks$/ },
  { label: /^Services$/, url: /\/services$/ },
  { label: /^Containers$/, url: /\/containers$/ },
  { label: /^Images$/, url: /\/images$/ },
  { label: /^Networks$/, url: /\/networks$/ },
  { label: /^Volumes$/, url: /\/volumes$/ },
  { label: /^Registries$/, url: /\/registries$/ },
];

test.describe('sidebar navigation', () => {
  test('sidebar links take the user to the expected routes', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    for (const { label, url } of NAV_TARGETS) {
      // Sidebar NavLinks are anchors with the translated label text.
      await page.getByRole('link', { name: label }).first().click();
      await page.waitForURL(url, { timeout: 10_000 });
      await expect(page).toHaveURL(url);
    }
  });
});
