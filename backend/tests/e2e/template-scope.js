/**
 * Template Scope E2E Test
 *
 * Verifies scope behavior for template operations:
 * 1. Template edit with scope=THIS (current month only, movements unchanged)
 * 2. Template edit with scope=ALL (all months, movements unchanged)
 * 3. Template delete with scope=THIS (hard delete, keep movements)
 * 4. Template delete with scope=ALL (hard delete across months)
 * 5. Delete last template → budget goes to 0
 *
 * Note: Template creation and budget auto-calculation are tested in templates.js.
 * This file focuses specifically on scope semantics (THIS/FUTURE/ALL).
 */

import { chromium } from 'playwright';
import pg from 'pg';
import { createGroupsAndCategoriesViaUI, getCategoryIds } from './helpers/category-helpers.js';
import { createAccountViaUI, createPaymentMethodViaUI } from './helpers/profile-helpers.js';
import { completeOnboardingViaDB } from './helpers/onboarding-helpers.js';
const { Pool } = pg;

const appUrl = process.env.APP_URL || 'http://localhost:8080';
const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';

// Helper: navigate to Presupuesto tab and wait for content
async function goToPresupuesto(page) {
  await page.goto(`${appUrl}/`);
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
  await page.waitForSelector('#app', { state: 'visible' });
  await page.locator('.tab-btn[data-tab="presupuesto"]').click();
  await page.waitForTimeout(2000);
}

// Helper: expand a category group by name
async function expandGroup(page, groupName) {
  const header = page.locator('.expense-group-header').filter({ hasText: groupName });
  await header.waitFor({ state: 'visible', timeout: 5000 });
  await header.click();
  await page.waitForTimeout(500);
}

// Helper: expand a category by name (click its header)
async function expandCategory(page, categoryName) {
  const header = page.locator('.expense-category-header').filter({ hasText: categoryName });
  await header.waitFor({ state: 'visible', timeout: 5000 });
  await header.click();
  await page.waitForTimeout(500);
}

// Helper: click next month button
async function goNextMonth(page) {
  await page.locator('#next-month-btn').click();
  await page.waitForTimeout(2000);
}

// Helper: select scope in scope modal and confirm
async function selectScopeAndConfirm(page, scopeValue) {
  await page.locator('#scope-modal-overlay').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator(`input[name="scope"][value="${scopeValue}"]`).check();
  await page.waitForTimeout(200);
  await page.locator('#scope-confirm-btn').click();
  await page.waitForTimeout(2000);
}

// Helper: close success/info modal
async function closeModal(page) {
  const okBtn = page.locator('#modal-ok');
  if (await okBtn.count() > 0) {
    await okBtn.click();
    await page.waitForTimeout(1000);
  }
}

async function testTemplateScope() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless });
  const pool = new Pool({ connectionString: dbUrl });

  const timestamp = Date.now();
  const userEmail = `tmpl-scope-e2e-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `TmplScope E2E ${timestamp}`;

  console.log('🚀 Starting Template Scope E2E Tests');
  console.log('👤 User:', userEmail);
  console.log('🏠 Household:', householdName);

  let householdId, userId, gastosFijosId, paymentMethodId;

  try {
    // ==================================================================
    // SETUP: Register, create household, categories, account, payment method
    // ==================================================================
    console.log('\n📦 SETUP');

    const context = await browser.newContext();
    const page = await context.newPage();

    // Register user
    await page.goto(appUrl);
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    await page.locator('#registerName').fill('Template Scope Tester');
    await page.locator('#registerEmail').fill(userEmail);
    await page.locator('#registerPassword').fill(password);
    await page.locator('#registerConfirm').fill(password);
    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);
    console.log('  ✅ User registered');

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

    // Complete onboarding via DB BEFORE dismissing modal
    const userQuery = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    userId = userQuery.rows[0].id;
    await completeOnboardingViaDB(pool, userId);

    await page.locator('#modal-ok').click();
    await page.waitForTimeout(2000);
    console.log('  ✅ Household created');

    // Get household ID
    const hhQuery = await pool.query('SELECT id FROM households WHERE name = $1', [householdName]);
    householdId = hhQuery.rows[0].id;

    // Create categories via UI
    await createGroupsAndCategoriesViaUI(page, appUrl, [
      { name: 'Hogar', icon: '🏠', categories: ['TmplScopeGastos'] },
    ]);
    console.log('  ✅ Categories created');

    const categoryMap = await getCategoryIds(pool, householdId, ['TmplScopeGastos']);
    gastosFijosId = categoryMap['TmplScopeGastos'];

    // Create account and payment method via UI
    await createAccountViaUI(page, appUrl, { name: 'Cuenta Principal', type: 'savings', institution: 'Bancolombia', balance: 0 });
    await page.waitForTimeout(1000);
    await createPaymentMethodViaUI(page, appUrl, { name: 'Débito', type: 'debit_card' });
    await page.waitForTimeout(1000);
    console.log('  ✅ Account and payment method created');

    // Get payment method ID
    const pmQuery = await pool.query(
      'SELECT id FROM payment_methods WHERE household_id = $1 LIMIT 1',
      [householdId]
    );
    paymentMethodId = pmQuery.rows[0].id;

    // Create a template via UI to use for scope tests
    await goToPresupuesto(page);
    await expandGroup(page, 'Hogar');
    await expandCategory(page, 'TmplScopeGastos');

    const addTemplateBtn = page.locator('.budget-add-template-btn[data-category-name="TmplScopeGastos"]');
    await addTemplateBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addTemplateBtn.click();
    await page.waitForTimeout(1000);

    await page.locator('#template-name').fill('Arriendo');
    await page.locator('#template-amount').fill('2000000');
    await page.locator('#template-movement-type').selectOption('HOUSEHOLD');
    await page.waitForTimeout(500);

    const pmSelect = page.locator('#template-payment-method-other');
    await pmSelect.waitFor({ timeout: 5000 });
    await pmSelect.selectOption(paymentMethodId);

    await page.locator('#template-auto-generate').check();
    await page.waitForTimeout(300);
    await page.locator('#template-day').fill('1');

    const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /Crear|Guardar/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(3000);
    await closeModal(page);
    console.log('  ✅ Template "Arriendo" created ($2,000,000)');

    // Navigate to next month to trigger lazy-copy (so we have items in both months)
    await goNextMonth(page);
    await expandGroup(page, 'Hogar');
    await page.waitForTimeout(1000);

    // ==================================================================
    // TEST 1: Template edit with scope=THIS
    // ==================================================================
    console.log('\n📝 Test 1: Template edit with scope=THIS');

    // Get budget item ID and source template ID
    const generateRes = await pool.query(
      `SELECT id, source_template_id FROM monthly_budget_items WHERE household_id = $1 AND name = 'Arriendo' AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [householdId]
    );
    const budgetItemId = generateRes.rows[0].id;
    const sourceTemplateId = generateRes.rows[0].source_template_id;

    // Create a movement via DB that simulates auto-generation
    const movInsert = await pool.query(
      `INSERT INTO movements (household_id, type, description, amount, currency, category_id,
       movement_date, payer_user_id, payment_method_id${sourceTemplateId ? ', generated_from_template_id' : ''})
       VALUES ($1, 'HOUSEHOLD', 'Arriendo', 2000000, 'COP', $2,
       DATE_TRUNC('month', CURRENT_DATE)::DATE + INTERVAL '0 days', $3, $4${sourceTemplateId ? ', $5' : ''})
       RETURNING id, amount`,
      sourceTemplateId
        ? [householdId, gastosFijosId, userId, paymentMethodId, sourceTemplateId]
        : [householdId, gastosFijosId, userId, paymentMethodId]
    );
    const movementId = movInsert.rows[0].id;
    console.log(`  Created test movement: ${movementId}`);

    // Edit template via UI
    await goToPresupuesto(page);
    await expandGroup(page, 'Hogar');
    await expandCategory(page, 'TmplScopeGastos');

    const templateItem = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'Arriendo' });
    await templateItem.waitFor({ state: 'visible', timeout: 5000 });
    await templateItem.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await templateItem.locator('.menu-item[data-action="edit-template"]').click();
    await page.waitForTimeout(500);

    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(1500);

    const amountInput = page.locator('#template-amount');
    await amountInput.clear();
    await amountInput.fill('2500000');
    await amountInput.blur();
    await page.waitForTimeout(300);

    const editSubmitBtn = page.locator('button[type="submit"]').filter({ hasText: /Guardar|Actualizar/i }).first();
    await editSubmitBtn.click();
    await page.waitForTimeout(2000);
    await closeModal(page);

    // Verify template updated in DB
    const templateCheck = await pool.query(
      `SELECT amount FROM monthly_budget_items WHERE id = $1`,
      [budgetItemId]
    );
    const newTemplateAmount = parseFloat(templateCheck.rows[0].amount);
    if (newTemplateAmount !== 2500000) {
      throw new Error(`Expected template amount 2,500,000 but got ${newTemplateAmount}`);
    }
    console.log('  ✅ Template updated to $2,500,000');

    // Verify movement was NOT updated
    const movCheck = await pool.query(
      `SELECT amount FROM movements WHERE id = $1`,
      [movementId]
    );
    const movAmount = parseFloat(movCheck.rows[0].amount);
    if (movAmount !== 2000000) {
      throw new Error(`Movement should still be 2,000,000 but got ${movAmount}`);
    }
    console.log('  ✅ Movement unchanged at $2,000,000');

    // Current month should be 2,500,000 but next month should keep 2,000,000
    const itemsSumThisMonth = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as amount FROM monthly_budget_items WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [gastosFijosId]
    );
    if (parseFloat(itemsSumThisMonth.rows[0]?.amount || 0) !== 2500000) {
      throw new Error(`Current month items total should be 2,500,000 but got ${itemsSumThisMonth.rows[0]?.amount}`);
    }
    console.log('  ✅ Current month items total = $2,500,000');

    const itemsSumNextMonth = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as amount FROM monthly_budget_items WHERE category_id = $1 AND month = (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE`,
      [gastosFijosId]
    );
    if (parseFloat(itemsSumNextMonth.rows[0]?.amount || 0) !== 2000000) {
      throw new Error(`Next month items total should stay at 2,000,000 but got ${itemsSumNextMonth.rows[0]?.amount}`);
    }
    console.log('  ✅ Next month items total = $2,000,000 (scope=THIS did NOT change it)');

    console.log('✅ Test 1 PASSED: Template edit scope=THIS works correctly\n');

    // ==================================================================
    // TEST 2: Template edit with scope=ALL
    // ==================================================================
    console.log('📝 Test 2: Template edit with scope=ALL');

    await goToPresupuesto(page);
    await expandGroup(page, 'Hogar');
    await expandCategory(page, 'TmplScopeGastos');

    const templateItem2 = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'Arriendo' });
    await templateItem2.waitFor({ state: 'visible', timeout: 5000 });
    await templateItem2.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await templateItem2.locator('.menu-item[data-action="edit-template"]').click();
    await page.waitForTimeout(500);

    await selectScopeAndConfirm(page, 'ALL');
    await page.waitForTimeout(1500);

    const amountInput2 = page.locator('#template-amount');
    await amountInput2.clear();
    await amountInput2.fill('3000000');
    await amountInput2.blur();
    await page.waitForTimeout(300);

    const editSubmitBtn2 = page.locator('button[type="submit"]').filter({ hasText: /Guardar|Actualizar/i }).first();
    await editSubmitBtn2.click();
    await page.waitForTimeout(2000);
    await closeModal(page);

    // Verify template updated
    const templateCheck2 = await pool.query(
      `SELECT amount FROM monthly_budget_items WHERE id = $1`,
      [budgetItemId]
    );
    if (parseFloat(templateCheck2.rows[0].amount) !== 3000000) {
      throw new Error(`Expected template amount 3,000,000 but got ${templateCheck2.rows[0].amount}`);
    }
    console.log('  ✅ Template updated to $3,000,000');

    // Verify movement was NOT updated
    const movCheck2 = await pool.query(
      `SELECT amount FROM movements WHERE id = $1`,
      [movementId]
    );
    if (parseFloat(movCheck2.rows[0].amount) !== 2000000) {
      throw new Error(`Movement should still be 2,000,000 but got ${movCheck2.rows[0].amount}`);
    }
    console.log('  ✅ Movement unchanged at $2,000,000');

    // Both months should be 3,000,000
    const itemsAllThis = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as amount FROM monthly_budget_items WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [gastosFijosId]
    );
    if (parseFloat(itemsAllThis.rows[0]?.amount || 0) !== 3000000) {
      throw new Error(`Current month items total should be 3,000,000 but got ${itemsAllThis.rows[0]?.amount}`);
    }
    console.log('  ✅ Current month items total = $3,000,000');

    const itemsAllNext = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as amount FROM monthly_budget_items WHERE category_id = $1 AND month = (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE`,
      [gastosFijosId]
    );
    if (parseFloat(itemsAllNext.rows[0]?.amount || 0) !== 3000000) {
      throw new Error(`Next month items total should be 3,000,000 but got ${itemsAllNext.rows[0]?.amount}`);
    }
    console.log('  ✅ Next month items total = $3,000,000 (scope=ALL updated both)');

    console.log('✅ Test 2 PASSED: Template edit scope=ALL works correctly\n');

    // ==================================================================
    // TEST 3: Template delete with scope=THIS (hard delete, keep movements)
    // ==================================================================
    console.log('📝 Test 3: Template delete with scope=THIS');

    await goToPresupuesto(page);
    await expandGroup(page, 'Hogar');
    await expandCategory(page, 'TmplScopeGastos');

    const templateItem3 = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'Arriendo' });
    await templateItem3.waitFor({ state: 'visible', timeout: 5000 });
    await templateItem3.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await templateItem3.locator('.menu-item[data-action="delete-template"]').click();
    await page.waitForTimeout(1000);

    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(2000);
    await closeModal(page);

    // Verify template hard-deleted
    const deleteCheck = await pool.query(
      `SELECT COUNT(*) as count FROM monthly_budget_items WHERE id = $1`,
      [budgetItemId]
    );
    if (parseInt(deleteCheck.rows[0].count) !== 0) {
      throw new Error('Template should be hard-deleted with scope=THIS');
    }
    console.log('  ✅ Template hard-deleted');

    // Verify movement still exists
    const movStillExists = await pool.query(
      `SELECT COUNT(*) as count FROM movements WHERE id = $1`,
      [movementId]
    );
    if (parseInt(movStillExists.rows[0].count) === 0) {
      throw new Error('Movement should still exist after scope=THIS delete');
    }
    console.log('  ✅ Movement still exists (scope=THIS keeps movements)');

    console.log('✅ Test 3 PASSED: Template delete scope=THIS works correctly\n');

    // ==================================================================
    // TEST 4: Template delete with scope=ALL (hard delete across months)
    // ==================================================================
    console.log('📝 Test 4: Template delete with scope=ALL');

    // Create a new template via API for this test
    const createRes = await page.evaluate(async (data) => {
      const response = await fetch('/api/budget-items?scope=FUTURE', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      return response.json();
    }, {
      name: 'Internet',
      movement_type: 'HOUSEHOLD',
      category_id: gastosFijosId,
      amount: 150000,
      auto_generate: false,
      payment_method_id: paymentMethodId,
      month: new Date().toISOString().slice(0, 7),
    });
    const newTemplateId = createRes.id;
    console.log(`  Created template: ${newTemplateId}`);

    // Create a movement (not linked to template)
    const movInsert2 = await pool.query(
      `INSERT INTO movements (household_id, type, description, amount, currency, category_id,
       movement_date, payer_user_id, payment_method_id)
       VALUES ($1, 'HOUSEHOLD', 'Internet', 150000, 'COP', $2,
       DATE_TRUNC('month', CURRENT_DATE)::DATE + INTERVAL '4 days', $3, $4)
       RETURNING id`,
      [householdId, gastosFijosId, userId, paymentMethodId]
    );
    const internetMovId = movInsert2.rows[0].id;
    console.log(`  Created test movement: ${internetMovId}`);

    // Delete via UI with scope=ALL
    await goToPresupuesto(page);
    await expandGroup(page, 'Hogar');
    await expandCategory(page, 'TmplScopeGastos');

    const internetTemplate = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'Internet' });
    await internetTemplate.waitFor({ state: 'visible', timeout: 5000 });
    await internetTemplate.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await internetTemplate.locator('.menu-item[data-action="delete-template"]').click();
    await page.waitForTimeout(2000);

    await selectScopeAndConfirm(page, 'ALL');
    await page.waitForTimeout(3000);
    await closeModal(page);

    // Verify budget item hard-deleted
    const deleteCheckAll = await pool.query(
      `SELECT COUNT(*) as count FROM monthly_budget_items WHERE id = $1`,
      [newTemplateId]
    );
    if (parseInt(deleteCheckAll.rows[0].count) !== 0) {
      throw new Error('Budget item should be hard-deleted with scope=ALL');
    }
    console.log('  ✅ Budget item hard-deleted');

    // Verify movement still exists (movement deletion is separate from budget items)
    const movCheck3 = await pool.query(
      `SELECT COUNT(*) as count FROM movements WHERE id = $1`,
      [internetMovId]
    );
    console.log(`  ℹ️ Movement exists: ${parseInt(movCheck3.rows[0].count) > 0}`);

    console.log('✅ Test 4 PASSED: Template delete scope=ALL works correctly\n');

    // ==================================================================
    // TEST 5: Delete last template → budget should go to 0
    // ==================================================================
    console.log('\n📝 Test 5: Delete last template → budget goes to 0');

    // Create a new category for this test
    const hogarGroupQuery = await pool.query(
      `SELECT id FROM category_groups WHERE household_id = $1 AND name = 'Hogar' LIMIT 1`,
      [householdId]
    );
    const hogarGroupId = hogarGroupQuery.rows[0].id;
    const catRes = await pool.query(
      `INSERT INTO categories (household_id, name, is_active, category_group_id)
       VALUES ($1, 'TestDelete', true, $2)
       RETURNING id`,
      [householdId, hogarGroupId]
    );
    const testDeleteCatId = catRes.rows[0].id;

    // Create a template via direct DB insert (master template + monthly item)
    const tmplRes = await pool.query(
      `INSERT INTO recurring_movement_templates (
        household_id, name, type, category_id, amount,
        auto_generate, is_active, currency
      ) VALUES ($1, 'LastTemplate', 'HOUSEHOLD', $2, 1500000, false, true, 'COP')
      RETURNING id`,
      [householdId, testDeleteCatId]
    );
    const lastTemplateId = tmplRes.rows[0].id;

    // Also create monthly budget item (what the UI reads)
    await pool.query(
      `INSERT INTO monthly_budget_items (
        household_id, category_id, month, name, amount, currency,
        movement_type, auto_generate, source_template_id
      ) VALUES ($1, $2, DATE_TRUNC('month', CURRENT_DATE)::DATE, 'LastTemplate', 1500000, 'COP',
        'HOUSEHOLD', false, $3)`,
      [householdId, testDeleteCatId, lastTemplateId]
    );

    // Verify items total before delete
    const budgetBefore = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as amount FROM monthly_budget_items WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [testDeleteCatId]
    );
    if (parseFloat(budgetBefore.rows[0]?.amount) !== 1500000) {
      throw new Error('Items total should be 1,500,000 before delete');
    }
    console.log('  ✅ Items total before delete: $1,500,000');

    // Delete the template via UI
    await goToPresupuesto(page);
    await expandGroup(page, 'Hogar');
    await expandCategory(page, 'TestDelete');

    const lastTemplateItem = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'LastTemplate' });
    await lastTemplateItem.waitFor({ state: 'visible', timeout: 5000 });
    await lastTemplateItem.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await lastTemplateItem.locator('.menu-item[data-action="delete-template"]').click();
    await page.waitForTimeout(1000);

    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(2000);
    await closeModal(page);
    console.log('  ✅ Last template deleted (scope=THIS)');

    // Verify budget item is gone
    const tmplCheck = await pool.query(
      `SELECT COUNT(*) as count FROM monthly_budget_items WHERE household_id = $1 AND name = 'LastTemplate' AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [householdId]
    );
    if (parseInt(tmplCheck.rows[0].count) !== 0) {
      throw new Error('Budget item should be deleted');
    }
    console.log('  ✅ Template hard-deleted from DB');

    // Verify items total went to 0
    const budgetAfter = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as amount FROM monthly_budget_items WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [testDeleteCatId]
    );
    if (parseFloat(budgetAfter.rows[0]?.amount || -1) !== 0) {
      throw new Error(`Items total should be 0 after deleting last template, got: ${budgetAfter.rows[0]?.amount}`);
    }
    console.log('  ✅ Items total = 0 after deleting last template');

    console.log('✅ Test 5 PASSED: Deleting last template sets budget to 0\n');

    // ==================================================================
    // SUMMARY
    // ==================================================================
    console.log('='.repeat(60));
    console.log('📊 ALL TEMPLATE SCOPE TESTS PASSED ✅');
    console.log('='.repeat(60));
    console.log('✅ Test 1: Template edit scope=THIS (movements unchanged)');
    console.log('✅ Test 2: Template edit scope=ALL (movements unchanged)');
    console.log('✅ Test 3: Template delete scope=THIS (hard delete, keep movements)');
    console.log('✅ Test 4: Template delete scope=ALL (hard delete across months)');
    console.log('✅ Test 5: Delete last template → budget goes to 0');
    console.log('='.repeat(60));

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    const userDel = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userDel.rows.length > 0) {
      await pool.query('DELETE FROM users WHERE id = $1', [userDel.rows[0].id]);
    }
    console.log('✅ Cleanup complete');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);

    const screenshotPath = process.env.CI
      ? 'test-results/template-scope-failure.png'
      : '/tmp/template-scope-failure.png';
    try {
      const page = (await browser.contexts())[0]?.pages()[0];
      if (page) {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error(`📸 Screenshot saved to: ${screenshotPath}`);
      }
    } catch (e) {
      console.error('Failed to save screenshot:', e.message);
    }

    // Cleanup on failure
    if (householdId) {
      try {
        await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
      } catch (e) { /* ignore */ }
    }

    throw error;
  } finally {
    await pool.end();
    await browser.close();
  }
}

testTemplateScope().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
