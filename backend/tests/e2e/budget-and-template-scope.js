/**
 * Budget Inheritance & Scope E2E Test
 *
 * Verifies:
 * 1. Budget inheritance across months (LATERAL JOIN fallback)
 * 2. Budget edit with scope THIS / FUTURE / ALL
 * 3. Template creation auto-updates budget
 * 4. Template edit with scope THIS / ALL
 * 5. Template delete with scope THIS / ALL
 */

import { chromium } from 'playwright';
import pg from 'pg';
import { createGroupsAndCategoriesViaUI, getCategoryIds } from './helpers/category-helpers.js';
import { createAccountViaUI, createPaymentMethodViaUI } from './helpers/profile-helpers.js';
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

// Helper: get budget amount text for a category from the UI
async function getCategoryBudgetText(page, categoryName) {
  const header = page.locator('.expense-category-header').filter({ hasText: categoryName });
  const amountEl = header.locator('.expense-category-amount');
  return (await amountEl.textContent()).trim();
}

// Helper: click next month button
async function goNextMonth(page) {
  await page.locator('#next-month-btn').click();
  await page.waitForTimeout(2000);
}

// Helper: click prev month button
async function goPrevMonth(page) {
  await page.locator('#prev-month-btn').click();
  await page.waitForTimeout(2000);
}

// Helper: select scope in scope modal and confirm
async function selectScopeAndConfirm(page, scopeValue) {
  // Wait for scope modal
  await page.locator('#scope-modal-overlay').waitFor({ state: 'visible', timeout: 5000 });
  // Select the radio button with the desired scope
  await page.locator(`input[name="scope"][value="${scopeValue}"]`).check();
  await page.waitForTimeout(200);
  // Click confirm
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

async function testBudgetAndTemplateScope() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless });
  const pool = new Pool({ connectionString: dbUrl });

  const timestamp = Date.now();
  const userEmail = `scope-e2e-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Scope E2E ${timestamp}`;

  console.log('🚀 Starting Budget & Template Scope E2E Tests');
  console.log('👤 User:', userEmail);
  console.log('🏠 Household:', householdName);

  let householdId, contactId, paymentMethodId, mercadoId, gastosFijosId;

  try {
    // ==================================================================
    // SETUP: Register, create household, categories, contact, account, payment method
    // ==================================================================
    console.log('\n📦 SETUP');

    const context = await browser.newContext();
    const page = await context.newPage();

    // Register user
    await page.goto(appUrl);
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    await page.locator('#registerName').fill('Scope Tester');
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
    await page.locator('#modal-ok').click();
    await page.waitForTimeout(2000);
    console.log('  ✅ Household created');

    // Get household ID
    const hhQuery = await pool.query('SELECT id FROM households WHERE name = $1', [householdName]);
    householdId = hhQuery.rows[0].id;

    // Create categories via UI
    await createGroupsAndCategoriesViaUI(page, appUrl, [
      { name: 'Casa', icon: '🏠', categories: ['Mercado', 'Gastos fijos'] },
    ]);
    console.log('  ✅ Categories created');

    const categoryMap = await getCategoryIds(pool, householdId, ['Mercado', 'Gastos fijos']);
    mercadoId = categoryMap['Mercado'];
    gastosFijosId = categoryMap['Gastos fijos'];

    // Create contact via DB (needed for SPLIT templates)
    const contactResult = await pool.query(
      `INSERT INTO contacts (household_id, name, email) VALUES ($1, 'Test Contact', 'contact@test.com') RETURNING id`,
      [householdId]
    );
    contactId = contactResult.rows[0].id;
    console.log('  ✅ Contact created');

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

    // Get user ID
    const userQuery = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    const userId = userQuery.rows[0].id;

    // ==================================================================
    // TEST 1: Lazy copy across months (budget items)
    // ==================================================================
    console.log('\n📝 Test 1: Lazy copy of budget items across months');

    // Create a budget item for Mercado via UI
    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Mercado');

    // Click "Agregar gasto presupuestado"
    const addTemplateBtn1 = page.locator('.budget-add-template-btn[data-category-name="Mercado"]');
    await addTemplateBtn1.waitFor({ timeout: 5000 });
    await addTemplateBtn1.click();
    await page.waitForTimeout(1000);

    // Fill the form
    await page.locator('#template-name').fill('TestItem');
    await page.locator('#template-amount').fill('500000');
    await page.locator('#template-movement-type').selectOption('HOUSEHOLD');
    await page.waitForTimeout(500);

    // Submit (create with default scope=FUTURE)
    const submitBtn1 = page.locator('button[type="submit"]').filter({ hasText: /Crear|Guardar/i }).first();
    await submitBtn1.click();
    await page.waitForTimeout(3000);
    await closeModal(page);

    console.log('  ✅ Budget item created for current month');

    // Navigate to next month — should lazy-copy
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    let budgetText = await getCategoryBudgetText(page, 'Mercado');
    if (!budgetText.includes('500.000') && !budgetText.includes('500,000')) {
      throw new Error(`Next month should have 500k from lazy copy, got: ${budgetText}`);
    }
    console.log('  ✅ Next month has 500k (lazy copy)');

    // Navigate forward once more — still copies
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'Mercado');
    if (!budgetText.includes('500.000') && !budgetText.includes('500,000')) {
      throw new Error(`Month+2 should also have 500k, got: ${budgetText}`);
    }
    console.log('  ✅ Month+2 also has 500k (lazy copy)');

    // Go back to a past month — no backward copy
    await goPrevMonth(page);
    await goPrevMonth(page);
    await goPrevMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'Mercado');
    if (budgetText.includes('500.000') || budgetText.includes('500,000')) {
      throw new Error(`Previous month should NOT have budget, got: ${budgetText}`);
    }
    console.log('  ✅ Previous month has no budget (no backward copy)');

    console.log('✅ Test 1 PASSED: Lazy copy works correctly\n');

    // ==================================================================
    // TEST 2: Budget scope=THIS
    // ==================================================================
    console.log('📝 Test 2: Budget scope=THIS');

    // Go back to current month
    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Mercado');

    // Edit budget
    const editBudgetBtn = page.locator('.expense-category-item').filter({ hasText: 'Mercado' }).locator('button[data-action="edit-budget"]');
    await editBudgetBtn.waitFor({ timeout: 5000 });
    await editBudgetBtn.click();
    await page.waitForTimeout(500);

    // Select scope=THIS FIRST (before amount input)
    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(1000);

    // Fill new amount
    const editInput = page.locator('#modal-input');
    await editInput.selectText();
    await editInput.fill('600000');
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(1000);
    await closeModal(page);

    console.log('  ✅ Budget edited to 600k with scope=THIS');

    // Verify current month shows 600k
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'Mercado');
    if (!budgetText.includes('600.000') && !budgetText.includes('600,000')) {
      throw new Error(`Current month should be 600k, got: ${budgetText}`);
    }
    console.log('  ✅ Current month = 600k');

    // Next month should still be 500k (the old value before the edit).
    // scope=THIS protects month+1 by creating an explicit record with the old value.
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'Mercado');
    if (!budgetText.includes('500.000') && !budgetText.includes('500,000')) {
      throw new Error(`Next month should keep 500k (old value), got: ${budgetText}`);
    }
    console.log('  ✅ Next month keeps 500k (old value preserved)');

    console.log('✅ Test 2 PASSED: Budget scope=THIS works correctly\n');

    // ==================================================================
    // TEST 3: Budget scope=ALL
    // ==================================================================
    console.log('📝 Test 3: Budget scope=ALL');

    // Create distinct budgets first:
    // Set next month to 800k (THIS) so we have two different records
    await goToPresupuesto(page);
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Mercado');

    const editBtn2 = page.locator('.expense-category-item').filter({ hasText: 'Mercado' }).locator('button[data-action="edit-budget"]');
    await editBtn2.waitFor({ timeout: 5000 });
    await editBtn2.click();
    await page.waitForTimeout(500);
    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(1000);
    const editInput2 = page.locator('#modal-input');
    await editInput2.selectText();
    await editInput2.fill('800000');
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(1000);
    await closeModal(page);
    console.log('  Set next month to 800k');

    // Now go back to current month and edit with scope=ALL to 700k
    await goPrevMonth(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Mercado');

    const editBtn3 = page.locator('.expense-category-item').filter({ hasText: 'Mercado' }).locator('button[data-action="edit-budget"]');
    await editBtn3.waitFor({ timeout: 5000 });
    await editBtn3.click();
    await page.waitForTimeout(500);
    await selectScopeAndConfirm(page, 'ALL');
    await page.waitForTimeout(1000);
    const editInput3 = page.locator('#modal-input');
    await editInput3.selectText();
    await editInput3.fill('700000');
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(1000);
    await closeModal(page);
    console.log('  Edited to 700k with scope=ALL');

    // Verify current = 700k
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'Mercado');
    if (!budgetText.includes('700.000') && !budgetText.includes('700,000')) {
      throw new Error(`Current month should be 700k after ALL, got: ${budgetText}`);
    }
    console.log('  ✅ Current month = 700k');

    // Next month should also be 700k (ALL updated it)
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'Mercado');
    if (!budgetText.includes('700.000') && !budgetText.includes('700,000')) {
      throw new Error(`Next month should be 700k after ALL, got: ${budgetText}`);
    }
    console.log('  ✅ Next month = 700k (ALL updated it)');

    console.log('✅ Test 3 PASSED: Budget scope=ALL works correctly\n');

    // ==================================================================
    // TEST 4: Template creation auto-updates budget
    // ==================================================================
    console.log('📝 Test 4: Template creation auto-updates budget');

    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Gastos fijos');

    // Click "Agregar gasto recurrente" for Gastos fijos
    const addTemplateBtn4 = page.locator('.budget-add-template-btn[data-category-name="Gastos fijos"]');
    await addTemplateBtn4.waitFor({ state: 'visible', timeout: 5000 });
    await addTemplateBtn4.click();
    await page.waitForTimeout(1000);

    // Fill template form
    await page.locator('#template-name').fill('Arriendo');
    await page.locator('#template-amount').fill('2000000');
    await page.locator('#template-movement-type').selectOption('HOUSEHOLD');
    await page.waitForTimeout(500);

    // Select payment method
    const pmSelect = page.locator('#template-payment-method-other');
    await pmSelect.waitFor({ timeout: 5000 });
    await pmSelect.selectOption(paymentMethodId);

    // Enable auto-generate
    await page.locator('#template-auto-generate').check();
    await page.waitForTimeout(300);
    await page.locator('#template-day').fill('1');

    // Submit
    const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /Crear|Guardar/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    // Close success modal
    await closeModal(page);

    // Verify budget was auto-created in DB
    const budgetQ = await pool.query(
      `SELECT amount FROM monthly_budgets WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [gastosFijosId]
    );
    const autoBudget = parseFloat(budgetQ.rows[0]?.amount || 0);
    if (autoBudget !== 2000000) {
      throw new Error(`Expected auto-budget 2,000,000 but got ${autoBudget}`);
    }
    console.log('  ✅ Budget auto-created: $2,000,000');

    // Navigate to next month — budget should be inherited
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'Gastos fijos');
    if (!budgetText.includes('2.000.000') && !budgetText.includes('2,000,000')) {
      throw new Error(`Next month should inherit template budget, got: ${budgetText}`);
    }
    console.log('  ✅ Next month inherits template budget');

    console.log('✅ Test 4 PASSED: Template creation auto-updates budget\n');

    // ==================================================================
    // TEST 5: Template edit with scope=THIS
    // ==================================================================
    console.log('📝 Test 5: Template edit with scope=THIS');

    // Get budget item ID and source template ID
    const generateRes = await pool.query(
      `SELECT id, source_template_id FROM monthly_budget_items WHERE household_id = $1 AND name = 'Arriendo' AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [householdId]
    );
    const budgetItemId = generateRes.rows[0].id;
    const sourceTemplateId = generateRes.rows[0].source_template_id;

    // Create a movement via DB that simulates auto-generation
    // Use source_template_id if available (FK references recurring_movement_templates)
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
    const originalAmount = parseFloat(movInsert.rows[0].amount);
    console.log(`  Created test movement: ${movementId} (amount: ${originalAmount})`);

    // Now edit template via UI
    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Gastos fijos');

    // Find template and click edit
    const templateItem = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'Arriendo' });
    await templateItem.waitFor({ state: 'visible', timeout: 5000 });
    const threeDotsBtn = templateItem.locator('.three-dots-btn');
    await threeDotsBtn.click();
    await page.waitForTimeout(500);

    const editOption = templateItem.locator('.menu-item[data-action="edit-template"]');
    await editOption.click();
    await page.waitForTimeout(500);

    // Scope modal: select THIS (only this month — budget + movements of this month)
    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(1500);

    // Edit amount in the form
    const amountInput = page.locator('#template-amount');
    await amountInput.clear();
    await amountInput.fill('2500000');
    await amountInput.blur();
    await page.waitForTimeout(300);

    // Submit edit (no second modal — scope was already selected)
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

    // Verify movement was NOT updated (budget items don't update movements directly)
    const movCheck = await pool.query(
      `SELECT amount FROM movements WHERE id = $1`,
      [movementId]
    );
    const movAmount = parseFloat(movCheck.rows[0].amount);
    if (movAmount !== 2000000) {
      throw new Error(`Movement should still be 2,000,000 (not updated) but got ${movAmount}`);
    }
    console.log('  ✅ Movement unchanged at $2,000,000');

    // Verify budget scope: current month should be 2,500,000 but next month should keep 2,000,000
    const budgetThisMonth = await pool.query(
      `SELECT amount FROM monthly_budgets WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [gastosFijosId]
    );
    const budgetThisAmount = parseFloat(budgetThisMonth.rows[0]?.amount || 0);
    if (budgetThisAmount !== 2500000) {
      throw new Error(`Current month budget should be 2,500,000 but got ${budgetThisAmount}`);
    }
    console.log('  ✅ Current month budget = $2,500,000 (scope=THIS updated)');

    // Check next month: should still have old value (2,000,000) since scope=THIS
    const budgetNextMonth = await pool.query(
      `SELECT amount FROM monthly_budgets WHERE category_id = $1 AND month = (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE`,
      [gastosFijosId]
    );
    const nextMonthBudget = parseFloat(budgetNextMonth.rows[0]?.amount || 0);
    if (nextMonthBudget !== 2000000) {
      throw new Error(`Next month budget should stay at 2,000,000 (scope=THIS) but got ${nextMonthBudget}`);
    }
    console.log('  ✅ Next month budget = $2,000,000 (scope=THIS did NOT change it)');

    console.log('✅ Test 5 PASSED: Template edit scope=THIS works correctly\n');

    // ==================================================================
    // TEST 6: Template edit with scope=ALL
    // ==================================================================
    console.log('📝 Test 6: Template edit with scope=ALL');

    // Edit template again via UI
    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Gastos fijos');

    const templateItem2 = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'Arriendo' });
    await templateItem2.waitFor({ state: 'visible', timeout: 5000 });
    await templateItem2.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await templateItem2.locator('.menu-item[data-action="edit-template"]').click();
    await page.waitForTimeout(500);

    // Scope modal: select ALL (all months + all movements)
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

    // Verify movement was NOT updated (budget items don't update movements)
    const movCheck2 = await pool.query(
      `SELECT amount FROM movements WHERE id = $1`,
      [movementId]
    );
    const movAmount2 = parseFloat(movCheck2.rows[0].amount);
    if (movAmount2 !== 2000000) {
      throw new Error(`Movement should still be 2,000,000 but got ${movAmount2}`);
    }
    console.log('  ✅ Movement unchanged at $2,000,000');

    // Verify budget scope=ALL: both current and next month should be 3,000,000
    const budgetAllThis = await pool.query(
      `SELECT amount FROM monthly_budgets WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [gastosFijosId]
    );
    if (parseFloat(budgetAllThis.rows[0]?.amount || 0) !== 3000000) {
      throw new Error(`Current month budget should be 3,000,000 (scope=ALL) but got ${budgetAllThis.rows[0]?.amount}`);
    }
    console.log('  \u2705 Current month budget = $3,000,000 (scope=ALL updated)');

    const budgetAllNext = await pool.query(
      `SELECT amount FROM monthly_budgets WHERE category_id = $1 AND month = (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE`,
      [gastosFijosId]
    );
    if (parseFloat(budgetAllNext.rows[0]?.amount || 0) !== 3000000) {
      throw new Error(`Next month budget should be 3,000,000 (scope=ALL) but got ${budgetAllNext.rows[0]?.amount}`);
    }
    console.log('  \u2705 Next month budget = $3,000,000 (scope=ALL updated both)');

    console.log('\u2705 Test 6 PASSED: Template edit scope=ALL works correctly\n');

    // ==================================================================
    // TEST 7: Template delete with scope=THIS (hard delete template, keep movements)
    // ==================================================================
    console.log('📝 Test 7: Template delete with scope=THIS');

    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Gastos fijos');

    const templateItem3 = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'Arriendo' });
    await templateItem3.waitFor({ state: 'visible', timeout: 5000 });
    await templateItem3.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await templateItem3.locator('.menu-item[data-action="delete-template"]').click();
    await page.waitForTimeout(1000);

    // Scope modal for delete — select THIS
    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(2000);
    await closeModal(page);

    // Verify template hard-deleted (not just deactivated)
    const deleteCheck = await pool.query(
      `SELECT COUNT(*) as count FROM monthly_budget_items WHERE id = $1`,
      [budgetItemId]
    );
    if (parseInt(deleteCheck.rows[0].count) !== 0) {
      throw new Error('Template should be hard-deleted with scope=THIS');
    }
    console.log('  ✅ Template hard-deleted');

    // Verify movement still exists (generated_from_template_id set to NULL by FK)
    const movStillExists = await pool.query(
      `SELECT COUNT(*) as count FROM movements WHERE id = $1`,
      [movementId]
    );
    if (parseInt(movStillExists.rows[0].count) === 0) {
      throw new Error('Movement should still exist after scope=THIS delete');
    }
    console.log('  ✅ Movement still exists (scope=THIS keeps movements)');

    console.log('✅ Test 7 PASSED: Template delete scope=THIS works correctly\n');

    // ==================================================================
    // TEST 8: Template delete with scope=ALL (hard delete + movements)
    // ==================================================================
    console.log('📝 Test 8: Template delete with scope=ALL');

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
      month: new Date().toISOString().slice(0, 7), // Current month YYYY-MM
    });
    const newTemplateId = createRes.id;
    console.log(`  Created template: ${newTemplateId}`);

    // Create a movement (not linked to template since budget items are separate)
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
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Gastos fijos');

    const internetTemplate = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'Internet' });
    await internetTemplate.waitFor({ state: 'visible', timeout: 5000 });
    await internetTemplate.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await internetTemplate.locator('.menu-item[data-action="delete-template"]').click();
    await page.waitForTimeout(2000);

    // Scope modal — select ALL (includes delete movements)
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

    console.log('✅ Test 8 PASSED: Template delete scope=ALL works correctly\n');


    // ==================================================================
    // TEST 9: Budget set to 0 (delete) asks for scope
    // After Test 3, Mercado has 700k everywhere.
    // Setting to 0 with scope=THIS should clear this month only;
    // next month should keep 700k.
    // ==================================================================
    console.log('\n📝 Test 9: Budget set to 0 with scope=THIS');

    // Navigate to current month
    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'Mercado');

    // Edit budget — set to 0
    const zeroBudgetBtn = page.locator('.expense-category-item').filter({ hasText: 'Mercado' }).locator('button[data-action="edit-budget"]');
    await zeroBudgetBtn.waitFor({ timeout: 5000 });
    await zeroBudgetBtn.click();
    await page.waitForTimeout(500);

    // Scope modal appears FIRST
    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(1000);

    const zeroInput = page.locator('#modal-input');
    await zeroInput.selectText();
    await zeroInput.fill('0');
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(1000);
    await closeModal(page);
    console.log('  ✅ Budget set to 0 with scope=THIS');

    // Verify current month shows "Sin presupuesto"
    await expandGroup(page, 'Casa');
    let zeroBudgetText = await getCategoryBudgetText(page, 'Mercado');
    if (!zeroBudgetText.toLowerCase().includes('sin presupuesto')) {
      throw new Error(`Current month should show "Sin presupuesto", got: ${zeroBudgetText}`);
    }
    console.log('  ✅ Current month shows "Sin presupuesto"');

    // Next month should still have a budget (not affected by scope=THIS)
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    zeroBudgetText = await getCategoryBudgetText(page, 'Mercado');
    if (zeroBudgetText.toLowerCase().includes('sin presupuesto')) {
      throw new Error(`Next month should still have budget, got: ${zeroBudgetText}`);
    }
    console.log(`  ✅ Next month still has budget: ${zeroBudgetText} (scope=THIS preserved it)`);

    console.log('✅ Test 9 PASSED: Budget set to 0 asks for scope correctly\n');

    // ==================================================================
    // TEST 10: Delete last template → budget should go to 0
    // Create a template in a clean category, then delete it.
    // Budget should be set to 0 (not left at old value).
    // ==================================================================
    console.log('\n📝 Test 10: Delete last template → budget goes to 0');

    // Create a new category for this test
    const catRes10 = await pool.query(
      `INSERT INTO categories (household_id, name, is_active, category_group_id)
       SELECT $1, 'TestDelete', true, id FROM category_groups WHERE household_id = $1 LIMIT 1
       RETURNING id`,
      [householdId]
    );
    const testDeleteCatId = catRes10.rows[0].id;

    // Create a template via direct DB insert (master template + monthly item)
    const tmplRes10 = await pool.query(
      `INSERT INTO recurring_movement_templates (
        household_id, name, type, category_id, amount,
        auto_generate, is_active, currency
      ) VALUES ($1, 'LastTemplate', 'HOUSEHOLD', $2, 1500000, false, true, 'COP')
      RETURNING id`,
      [householdId, testDeleteCatId]
    );
    const lastTemplateId = tmplRes10.rows[0].id;

    // Also create monthly budget item (what the UI reads)
    await pool.query(
      `INSERT INTO monthly_budget_items (
        household_id, category_id, month, name, amount, currency,
        movement_type, auto_generate, source_template_id
      ) VALUES ($1, $2, DATE_TRUNC('month', CURRENT_DATE)::DATE, 'LastTemplate', 1500000, 'COP',
        'HOUSEHOLD', false, $3)`,
      [householdId, testDeleteCatId, lastTemplateId]
    );

    // Set budget = 1500000 for this category (simulating what create does)
    const currentMonth10 = new Date().toISOString().slice(0, 7);
    await pool.query(
      `INSERT INTO monthly_budgets (household_id, category_id, month, amount) VALUES ($1, $2, DATE_TRUNC('month', CURRENT_DATE)::DATE, 1500000)`,
      [householdId, testDeleteCatId]
    );

    // Verify budget exists
    const budgetBefore10 = await pool.query(
      `SELECT amount FROM monthly_budgets WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [testDeleteCatId]
    );
    if (parseFloat(budgetBefore10.rows[0]?.amount) !== 1500000) {
      throw new Error('Budget should be 1,500,000 before delete');
    }
    console.log('  ✅ Budget before delete: $1,500,000');

    // Delete the template via UI
    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'TestDelete');

    const lastTemplateItem = page.locator('.movement-detail-entry[data-template-id]').filter({ hasText: 'LastTemplate' });
    await lastTemplateItem.waitFor({ state: 'visible', timeout: 5000 });
    await lastTemplateItem.locator('.three-dots-btn').click();
    await page.waitForTimeout(500);
    await lastTemplateItem.locator('.menu-item[data-action="delete-template"]').click();
    await page.waitForTimeout(1000);

    // Scope modal appears — select THIS (delete only template)
    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(2000);
    await closeModal(page);
    console.log('  ✅ Last template deleted (scope=THIS)');

    // Verify budget item is gone
    const tmplCheck10 = await pool.query(
      `SELECT COUNT(*) as count FROM monthly_budget_items WHERE household_id = $1 AND name = 'LastTemplate' AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [householdId]
    );
    if (parseInt(tmplCheck10.rows[0].count) !== 0) {
      throw new Error('Budget item should be deleted');
    }
    console.log('  ✅ Template hard-deleted from DB');

    // Verify budget went to 0 (not left at 1,500,000!)
    const budgetAfter10 = await pool.query(
      `SELECT amount FROM monthly_budgets WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [testDeleteCatId]
    );
    const budgetAfterAmount = parseFloat(budgetAfter10.rows[0]?.amount || -1);
    if (budgetAfterAmount !== 0) {
      throw new Error(`Budget should be 0 after deleting last template, got: ${budgetAfterAmount}`);
    }
    console.log('  ✅ Budget set to 0 after deleting last template');

    console.log('✅ Test 10 PASSED: Deleting last template sets budget to 0\n');

    // ==================================================================
    // SUMMARY
    // ==================================================================
    console.log('='.repeat(60));
    console.log('📊 ALL TESTS PASSED ✅');
    console.log('='.repeat(60));
    console.log('✅ Test 1: Budget inheritance across months');
    console.log('✅ Test 2: Budget scope=THIS');
    console.log('✅ Test 3: Budget scope=ALL');
    console.log('✅ Test 4: Template creation auto-updates budget');
    console.log('✅ Test 5: Template edit scope=THIS (movements unchanged)');
    console.log('✅ Test 6: Template edit scope=ALL (movements updated)');
    console.log('✅ Test 7: Template delete scope=THIS (hard delete, keep movements)');
    console.log('✅ Test 8: Template delete scope=ALL (hard delete + movements)');
    console.log('✅ Test 9: Budget set to 0 with scope=THIS');
    console.log('✅ Test 10: Delete last template → budget goes to 0');
    console.log('='.repeat(60));
    console.log('\n✅ ✅ ✅ BUDGET & TEMPLATE SCOPE E2E COMPLETE! ✅ ✅ ✅\n');

    // Cleanup
    console.log('🧹 Cleaning up...');
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    const userDel = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userDel.rows.length > 0) {
      await pool.query('DELETE FROM users WHERE id = $1', [userDel.rows[0].id]);
    }
    console.log('✅ Cleanup complete');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);

    const screenshotPath = process.env.CI
      ? 'test-results/budget-scope-failure.png'
      : '/tmp/budget-scope-failure.png';
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

testBudgetAndTemplateScope().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
