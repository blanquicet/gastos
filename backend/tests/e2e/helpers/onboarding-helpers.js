/**
 * Shared helpers for handling onboarding wizard in E2E tests.
 */

/**
 * Skip the onboarding wizard if it appears.
 * Call this after household creation.
 * @param {import('playwright').Page} page
 */
export async function skipOnboardingWizard(page) {
  const wizardSkip = page.locator('[data-testid="skip-wizard"]');
  if (await wizardSkip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await wizardSkip.click();
    await page.waitForTimeout(500);
  }
}
