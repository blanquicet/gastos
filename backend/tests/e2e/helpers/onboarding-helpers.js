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

/**
 * Complete onboarding via DB so the wizard never appears.
 * Call this after household creation for tests that don't test onboarding.
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function completeOnboardingViaDB(pool, userId) {
  await pool.query(
    `UPDATE users SET onboarding_completed_at = NOW() WHERE id = $1`,
    [userId]
  );
}
