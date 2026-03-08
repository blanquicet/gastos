import { chromium } from 'playwright';
import pg from 'pg';
import { skipOnboardingWizard, completeOnboardingViaDB } from './helpers/onboarding-helpers.js';
const { Pool } = pg;

/**
 * Test Category & Group Management
 *
 * Tests the complete category and group management from /hogar page:
 * 1. Register user and create household
 * 2. Create a category group ("Salud")
 * 3. Create a category in that group ("Consulta médica")
 * 4. Create a second group ("Transporte") for move test
 * 5. Edit the group (rename "Salud" → "Bienestar", change icon)
 * 6. Move category ("Consulta médica") from "Bienestar" to "Transporte"
 * 7. Verify categories appear in movement form dropdown
 * 8. Deactivate a category
 * 9. Verify deactivated category does NOT appear in movement form
 * 10. Reactivate the category
 * 11. Delete a category (no movements)
 * 12. Delete a group (empty)
 * 13. Deactivate/reactivate a group
 */

async function testCategoryGroupManagement() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';

  const browser = await chromium.launch({ headless });

  const pool = new Pool({ connectionString: dbUrl });

  const timestamp = Date.now();
  const userEmail = `catgroup-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `CatGroup Test ${timestamp}`;

  let page;

  try {
    console.log('🚀 Starting Category & Group Management Test');
    console.log('👤 User:', userEmail);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User and Create Household
    // ==================================================================
    console.log('📝 Step 1: Registering user and creating household...');
    const context = await browser.newContext();
    page = await context.newPage();

    await page.goto(appUrl);
    await page.waitForTimeout(1000);

    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);

    await page.locator('#registerName').fill('Cat Test User');
    await page.locator('#registerEmail').fill(userEmail);
    await page.locator('#registerPassword').fill(password);
    await page.locator('#registerConfirm').fill(password);

    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);

    // Create household
    await page.locator('#hamburger-btn').click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Crear hogar' }).click();
    await page.waitForTimeout(500);
    await page.locator('#household-name-input').fill(householdName);
    await page.locator('#household-create-btn').click();
    await page.waitForTimeout(1000);

    // Complete onboarding before dismissing modal (which triggers page reload)
    const userQuery = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    const userId = userQuery.rows[0].id;
    await completeOnboardingViaDB(pool, userId);

    await page.locator('#modal-ok').click();
    await page.waitForTimeout(2000);

    console.log('✅ User registered and household created');

    // ==================================================================
    // STEP 2: Navigate to /hogar and Create a Group
    // ==================================================================
    console.log('📝 Step 2: Creating a category group...');

    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);

    // Click "+ Agregar grupo"
    await page.locator('#add-group-btn').click();
    await page.waitForTimeout(500);

    // Fill group name (use unique name since "Hogar" and "Diversión" already exist as defaults)
    await page.locator('#group-name').fill('Salud');

    // Select icon ⚕️
    await page.locator('.icon-pick[data-icon="⚕️"]').click();
    await page.waitForTimeout(200);

    // Submit
    await page.locator('#group-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Verify group appears in page
    const groupCard = page.locator('.cat-group-card', { hasText: 'Salud' });
    if (await groupCard.count() === 0) {
      throw new Error('Group "Salud" not found after creation');
    }
    console.log('✅ Group "Salud" created with ⚕️ icon');

    // ==================================================================
    // STEP 3: Create a Category Inside the Group
    // ==================================================================
    console.log('📝 Step 3: Creating category in group...');

    // Click three-dots on the group header to add category
    await groupCard.locator('[data-group-menu]').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu .menu-item[data-action="add-category"]').click();
    await page.waitForTimeout(500);

    // Fill category name (group should be pre-selected)
    await page.locator('#cat-name').fill('Consulta médica');

    // Verify group is pre-selected in dropdown
    const selectedGroup = await page.locator('#cat-group').inputValue();
    if (!selectedGroup) {
      throw new Error('Group should be pre-selected when adding category from group menu');
    }

    // Submit
    await page.locator('#category-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Expand group to see the category
    await groupCard.locator('.cat-group-header').click();
    await page.waitForTimeout(500);

    const catItem = groupCard.locator('.cat-item', { hasText: 'Consulta médica' });
    if (await catItem.count() === 0) {
      throw new Error('Category "Consulta médica" not found under "Salud" group');
    }
    console.log('✅ Category "Consulta médica" created in "Salud" group');

    // ==================================================================
    // STEP 4: Create a Second Group (for move test)
    // ==================================================================
    console.log('📝 Step 4: Creating second group "Transporte"...');

    await page.locator('#add-group-btn').click();
    await page.waitForTimeout(500);
    await page.locator('#group-name').fill('Transporte');
    await page.locator('.icon-pick[data-icon="🚗"]').click();
    await page.waitForTimeout(200);
    await page.locator('#group-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const transporteCard = page.locator('.cat-group-card', { hasText: 'Transporte' });
    if (await transporteCard.count() === 0) {
      throw new Error('Group "Transporte" not found after creation');
    }
    console.log('✅ Group "Transporte" created');

    // ==================================================================
    // STEP 5: Edit Group (rename + change icon)
    // ==================================================================
    console.log('📝 Step 5: Editing group (rename + icon)...');

    const saludCard = page.locator('.cat-group-card', { hasText: 'Salud' });
    await saludCard.locator('[data-group-menu]').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu button[data-action="edit-group"]').click();
    await page.waitForTimeout(500);

    // Change name and icon
    await page.locator('#group-name').fill('Bienestar');
    await page.locator('.icon-pick[data-icon="🏦"]').click();
    await page.waitForTimeout(200);

    await page.locator('#group-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Verify rename in UI
    const bienestarCard = page.locator('.cat-group-card', { hasText: 'Bienestar' });
    if (await bienestarCard.count() === 0) {
      throw new Error('Group was not renamed to "Bienestar"');
    }

    // Verify in DB
    const renamedGroup = await pool.query(
      `SELECT name, icon FROM category_groups
       WHERE household_id = (SELECT id FROM households WHERE name = $1) AND name = 'Bienestar'`,
      [householdName]
    );
    if (renamedGroup.rows.length === 0) {
      throw new Error('Group "Bienestar" not found in database');
    }
    if (!renamedGroup.rows[0].icon.startsWith('🏦')) {
      throw new Error(`Expected icon 🏦, got ${renamedGroup.rows[0].icon}`);
    }
    console.log('✅ Group renamed to "Bienestar" with icon 🏦');

    // ==================================================================
    // STEP 6: Move Category to a Different Group
    // ==================================================================
    console.log('📝 Step 6: Moving category from "Bienestar" to "Transporte"...');

    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);

    // Expand Bienestar to find "Consulta médica"
    const bienestarCardMove = page.locator('.cat-group-card', { hasText: 'Bienestar' });
    await bienestarCardMove.locator('.cat-group-header').click();
    await page.waitForTimeout(500);

    const consultaItemMove = bienestarCardMove.locator('.cat-item', { hasText: 'Consulta médica' });
    await consultaItemMove.locator('.three-dots-btn').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu button[data-action="edit-category"]').click();
    await page.waitForTimeout(500);

    // Only change group, keep name
    const moveOptions = await page.locator('#cat-group option').allTextContents();
    const transporteOption = moveOptions.find(o => o.includes('Transporte'));
    if (!transporteOption) throw new Error('"Transporte" group not found in dropdown');
    await page.locator('#cat-group').selectOption({ label: transporteOption });

    await page.locator('#category-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Verify in DB
    const movedCat = await pool.query(
      `SELECT c.name, cg.name as group_name FROM categories c
       JOIN category_groups cg ON c.category_group_id = cg.id
       WHERE c.household_id = (SELECT id FROM households WHERE name = $1)
         AND c.name = 'Consulta médica'`,
      [householdName]
    );
    if (movedCat.rows.length === 0) throw new Error('Category "Consulta médica" not found after move');
    if (movedCat.rows[0].group_name !== 'Transporte') {
      throw new Error(`Expected group "Transporte", got "${movedCat.rows[0].group_name}"`);
    }

    // Verify in UI — category should now be under "Transporte", not "Bienestar"
    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);

    const tCardAfterMove = page.locator('.cat-group-card', { hasText: 'Transporte' });
    await tCardAfterMove.locator('.cat-group-header').click();
    await page.waitForTimeout(500);
    const movedItem = tCardAfterMove.locator('.cat-item', { hasText: 'Consulta médica' });
    if (await movedItem.count() === 0) {
      throw new Error('"Consulta médica" not found under "Transporte" group in UI');
    }

    // Verify "Bienestar" no longer has it
    const bienestarCardAfterMove = page.locator('.cat-group-card', { hasText: 'Bienestar' });
    await bienestarCardAfterMove.locator('.cat-group-header').click();
    await page.waitForTimeout(500);
    const ghostItem = bienestarCardAfterMove.locator('.cat-item', { hasText: 'Consulta médica' });
    if (await ghostItem.count() > 0) {
      throw new Error('"Consulta médica" should NOT be under "Bienestar" anymore');
    }

    console.log('✅ Category "Consulta médica" moved from "Bienestar" to "Transporte"');

    // ==================================================================
    // STEP 7: Verify Categories in Movement Form
    // ==================================================================
    console.log('📝 Step 7: Verifying categories in movement form...');

    await page.goto(`${appUrl}/registrar-movimiento`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.click('button.tipo-btn[data-tipo="HOUSEHOLD"]');
    await page.waitForTimeout(1000);

    const categoryOptions = await page.locator('#categoria option').allTextContents();
    console.log('  Category options:', categoryOptions);

    if (!categoryOptions.some(o => o.includes('Consulta médica'))) {
      throw new Error('"Consulta médica" not found in category dropdown');
    }

    // Verify "Consulta médica" is under the "TRANSPORTE" optgroup (not "BIENESTAR")
    const transOptgroup = page.locator('#categoria optgroup[label="TRANSPORTE"]');
    const consultaInTrans = transOptgroup.locator('option', { hasText: 'Consulta médica' });
    if (await consultaInTrans.count() === 0) {
      throw new Error('"Consulta médica" should be under "TRANSPORTE" optgroup in movement form');
    }

    console.log('✅ Categories appear in movement form under correct group');

    // ==================================================================
    // STEP 8: Deactivate a Category
    // ==================================================================
    console.log('📝 Step 8: Deactivating category...');

    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);

    // Expand Transporte (where "Consulta médica" lives after Step 6)
    const tCardDeact = page.locator('.cat-group-card', { hasText: 'Transporte' });
    await tCardDeact.locator('.cat-group-header').click();
    await page.waitForTimeout(500);

    // Deactivate "Consulta médica"
    const consultaItem = tCardDeact.locator('.cat-item', { hasText: 'Consulta médica' });
    await consultaItem.locator('.three-dots-btn').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu button[data-action="deactivate-category"]').click();
    await page.waitForTimeout(500);
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(2000);

    // Verify in DB
    const deactivated = await pool.query(
      `SELECT is_active FROM categories
       WHERE household_id = (SELECT id FROM households WHERE name = $1) AND name = 'Consulta médica'`,
      [householdName]
    );
    if (deactivated.rows[0].is_active !== false) {
      throw new Error('Category should be deactivated');
    }
    console.log('✅ Category "Consulta médica" deactivated');

    // ==================================================================
    // STEP 9: Verify Deactivated Category NOT in Movement Form
    // ==================================================================
    console.log('📝 Step 9: Verifying deactivated category hidden from form...');

    await page.goto(`${appUrl}/registrar-movimiento`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.click('button.tipo-btn[data-tipo="HOUSEHOLD"]');
    await page.waitForTimeout(1000);

    const optsAfter = await page.locator('#categoria option').allTextContents();
    if (optsAfter.some(o => o.includes('Consulta médica'))) {
      throw new Error('Deactivated category should NOT appear in form');
    }
    console.log('✅ Deactivated category hidden from movement form');

    // ==================================================================
    // STEP 10: Reactivate Category
    // ==================================================================
    console.log('📝 Step 10: Reactivating category...');

    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);

    const tCardReact = page.locator('.cat-group-card', { hasText: 'Transporte' });
    await tCardReact.locator('.cat-group-header').click();
    await page.waitForTimeout(500);

    const inactiveItem = tCardReact.locator('.cat-item', { hasText: 'Consulta médica' });
    await inactiveItem.locator('.three-dots-btn').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu button[data-action="reactivate-category"]').click();
    await page.waitForTimeout(2000);

    const reactivated = await pool.query(
      `SELECT is_active FROM categories
       WHERE household_id = (SELECT id FROM households WHERE name = $1) AND name = 'Consulta médica'`,
      [householdName]
    );
    if (reactivated.rows[0].is_active !== true) {
      throw new Error('Category should be reactivated');
    }
    console.log('✅ Category "Consulta médica" reactivated');

    // ==================================================================
    // STEP 11: Delete a Category (no movements)
    // ==================================================================
    console.log('📝 Step 11: Deleting category...');

    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);

    const tCardDel = page.locator('.cat-group-card', { hasText: 'Transporte' });
    await tCardDel.locator('.cat-group-header').click();
    await page.waitForTimeout(500);

    const consultaItem2 = tCardDel.locator('.cat-item', { hasText: 'Consulta médica' });
    await consultaItem2.locator('.three-dots-btn').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu button[data-action="delete-category"]').click();
    await page.waitForTimeout(500);

    // Type "eliminar" if confirmation input is visible
    const confirmInput = page.locator('#confirm-input');
    if (await confirmInput.isVisible()) {
      await confirmInput.fill('eliminar');
    }
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(2000);

    const deletedCat = await pool.query(
      `SELECT id FROM categories
       WHERE household_id = (SELECT id FROM households WHERE name = $1) AND name = 'Consulta médica'`,
      [householdName]
    );
    if (deletedCat.rows.length > 0) {
      throw new Error('Category "Consulta médica" should be deleted');
    }
    console.log('✅ Category "Consulta médica" deleted');

    // ==================================================================
    // STEP 12: Delete an Empty Group
    // ==================================================================
    console.log('📝 Step 12: Deleting empty group...');

    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);

    const tCard4 = page.locator('.cat-group-card', { hasText: 'Transporte' });
    await tCard4.locator('[data-group-menu]').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu button[data-action="delete-group"]').click();
    await page.waitForTimeout(500);

    const groupConfirmInput = page.locator('#confirm-input');
    if (await groupConfirmInput.isVisible()) {
      await groupConfirmInput.fill('eliminar');
    }
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(2000);

    const deletedGroup = await pool.query(
      `SELECT id FROM category_groups
       WHERE household_id = (SELECT id FROM households WHERE name = $1) AND name = 'Transporte'`,
      [householdName]
    );
    if (deletedGroup.rows.length > 0) {
      throw new Error('Group "Transporte" should be deleted');
    }
    console.log('✅ Group "Transporte" deleted');

    // ==================================================================
    // STEP 13: Deactivate and Reactivate a Group
    // ==================================================================
    console.log('📝 Step 13: Testing group deactivation/reactivation...');

    // Add a category to "Bienestar" so we can deactivate instead of delete
    const bienestarCard2 = page.locator('.cat-group-card', { hasText: 'Bienestar' });
    await bienestarCard2.locator('[data-group-menu]').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu .menu-item[data-action="add-category"]').click();
    await page.waitForTimeout(500);
    await page.locator('#cat-name').fill('Servicios');
    await page.locator('#category-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Deactivate "Bienestar" group
    const bienestarCard3 = page.locator('.cat-group-card', { hasText: 'Bienestar' });
    await bienestarCard3.locator('[data-group-menu]').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu button[data-action="deactivate-group"]').click();
    await page.waitForTimeout(500);
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(2000);

    const deactivatedGroup = await pool.query(
      `SELECT is_active FROM category_groups
       WHERE household_id = (SELECT id FROM households WHERE name = $1) AND name = 'Bienestar'`,
      [householdName]
    );
    if (deactivatedGroup.rows[0].is_active !== false) {
      throw new Error('Group "Bienestar" should be deactivated');
    }
    console.log('  ✅ Group deactivated');

    // Reactivate "Bienestar"
    const inactiveGroup = page.locator('.cat-group-card', { hasText: 'Bienestar' });
    await inactiveGroup.locator('[data-group-menu]').click();
    await page.waitForTimeout(300);
    await page.locator('body > .three-dots-menu button[data-action="reactivate-group"]').click();
    await page.waitForTimeout(2000);

    const reactivatedGroup = await pool.query(
      `SELECT is_active FROM category_groups
       WHERE household_id = (SELECT id FROM households WHERE name = $1) AND name = 'Bienestar'`,
      [householdName]
    );
    if (reactivatedGroup.rows[0].is_active !== true) {
      throw new Error('Group "Bienestar" should be reactivated');
    }
    console.log('  ✅ Group reactivated');
    console.log('✅ Group deactivation/reactivation works');

    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log('🧹 Cleaning up test data...');

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;
      const householdResult = await pool.query('SELECT id FROM households WHERE name = $1', [householdName]);

      if (householdResult.rows.length > 0) {
        const householdId = householdResult.rows[0].id;

        // These tables may not exist in all environments; ignore errors
        try { await pool.query('DELETE FROM budgets WHERE category_id IN (SELECT id FROM categories WHERE household_id = $1)', [householdId]); } catch (_) {}
        try { await pool.query('DELETE FROM recurring_movement_templates WHERE household_id = $1', [householdId]); } catch (_) {}
        await pool.query('DELETE FROM categories WHERE household_id = $1', [householdId]);
        await pool.query('DELETE FROM category_groups WHERE household_id = $1', [householdId]);
        await pool.query('DELETE FROM contacts WHERE household_id = $1', [householdId]);
        await pool.query('DELETE FROM household_members WHERE household_id = $1', [householdId]);
        await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
      }

      await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }

    console.log('✅ Cleanup complete');

    console.log('');
    console.log('✅ ✅ ✅ ALL CATEGORY & GROUP MANAGEMENT TESTS PASSED! ✅ ✅ ✅');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ ❌ ❌ TEST FAILED ❌ ❌ ❌');
    console.error('Error:', error.message);
    console.error('');

    if (page) {
      const screenshotPath = process.env.CI
        ? 'test-results/category-group-failure.png'
        : '/tmp/category-group-failure.png';
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      console.error(`Screenshot saved to ${screenshotPath}`);
    }

    throw error;
  } finally {
    await browser.close();
    await pool.end();
  }
}

testCategoryGroupManagement()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
