/**
 * Shared helpers for creating category groups and categories via the UI.
 * Used by E2E tests instead of direct DB inserts.
 */

/**
 * Navigate to /hogar and wait for the page to load.
 */
async function navigateToHogar(page, appUrl) {
  await page.goto(`${appUrl}/hogar`);
  await page.waitForTimeout(2000);
}

/**
 * Create a category group via the UI.
 * @param {import('playwright').Page} page
 * @param {string} appUrl
 * @param {string} groupName - e.g. "Casa"
 * @param {string} icon - e.g. "🏠"
 * @returns {Promise<void>}
 */
export async function createGroupViaUI(page, appUrl, groupName, icon) {
  await navigateToHogar(page, appUrl);

  // Click "Agregar grupo" button
  const addGroupBtn = page.locator('button', { hasText: /Agregar grupo/i });
  await addGroupBtn.click();
  await page.waitForTimeout(500);

  // Fill group name
  await page.locator('#group-name').fill(groupName);

  // Pick icon via emoji picker button
  if (icon) {
    const iconBtn = page.locator(`.icon-pick[data-icon="${icon}"]`);
    if (await iconBtn.count() > 0) {
      await iconBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Submit
  await page.locator('#group-form button[type="submit"]').click();
  await page.waitForTimeout(2000);
}

/**
 * Create a category inside an existing group via the UI.
 * Uses the three-dots menu → "Agregar categoría" on the group card.
 * @param {import('playwright').Page} page
 * @param {string} appUrl
 * @param {string} groupName - Name of the existing group
 * @param {string} categoryName - Name of the new category
 * @returns {Promise<void>}
 */
export async function createCategoryViaUI(page, appUrl, groupName, categoryName) {
  await navigateToHogar(page, appUrl);

  const groupCard = page.locator('.cat-group-card', { hasText: groupName });
  await groupCard.locator('[data-group-menu]').click();
  await page.waitForTimeout(300);
  await groupCard.locator('.menu-item[data-action="add-category"]').click();
  await page.waitForTimeout(500);

  await page.locator('#cat-name').fill(categoryName);
  // Group should be pre-selected since we used the group's menu
  await page.locator('#category-form button[type="submit"]').click();
  await page.waitForTimeout(2000);
}

/**
 * Create multiple groups and categories via the UI in one call.
 * @param {import('playwright').Page} page
 * @param {string} appUrl
 * @param {Array<{name: string, icon: string, categories: string[]}>} groups
 * @returns {Promise<void>}
 */
export async function createGroupsAndCategoriesViaUI(page, appUrl, groups) {
  for (const group of groups) {
    await createGroupViaUI(page, appUrl, group.name, group.icon);
    for (const catName of group.categories) {
      await createCategoryViaUI(page, appUrl, group.name, catName);
    }
  }
}

/**
 * Get category IDs from the database after UI creation.
 * Useful when subsequent test steps need the IDs (e.g. for templates).
 * @param {import('pg').Pool} pool
 * @param {string} householdId
 * @param {string[]} categoryNames
 * @returns {Promise<{[name: string]: string}>}
 */
export async function getCategoryIds(pool, householdId, categoryNames) {
  const result = await pool.query(
    `SELECT id, name FROM categories WHERE household_id = $1 AND name = ANY($2)`,
    [householdId, categoryNames]
  );
  const map = {};
  for (const row of result.rows) {
    map[row.name] = row.id;
  }
  return map;
}
