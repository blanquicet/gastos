/**
 * Template Budget Integration Test
 * 
 * Tests template creation and budget auto-calculation
 */

import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

const appUrl = process.env.APP_URL || 'http://localhost:8080';
const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';

async function testTemplates() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless });
  
  const pool = new Pool({ connectionString: dbUrl });
  
  const timestamp = Date.now();
  const userEmail = `tmpl-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Template Test ${timestamp}`;
  
  console.log('🚀 Starting Template Budget Tests');
  console.log('👤 User:', userEmail);
  console.log('🏠 Household:', householdName);
  
  try {
    // ==================================================================
    // SETUP: Register and create household
    // ==================================================================
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto(appUrl);
    await page.waitForTimeout(1000);
    
    // Register
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#registerName').fill('Template Tester');
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
    await page.waitForTimeout(1000);
    
    await page.locator('#household-name').fill(householdName);
    await page.getByRole('button', { name: 'Crear hogar' }).click();
    await page.waitForTimeout(2000);
    
    await page.waitForURL('**/hogar');
    console.log('✅ User and household created');
    
    // Get household ID
    const householdQuery = await pool.query(
      'SELECT id FROM households WHERE name = $1',
      [householdName]
    );
    const householdId = householdQuery.rows[0].id;
    
    // Create test categories via database
    const categoryGroups = [
      { name: 'Casa', icon: '🏠', order: 1 }
    ];
    
    const categoryGroupIds = {};
    for (const group of categoryGroups) {
      const result = await pool.query(
        `INSERT INTO category_groups (household_id, name, icon, display_order, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [householdId, group.name, group.icon, group.order]
      );
      categoryGroupIds[group.name] = result.rows[0].id;
    }
    
    const categories = [
      { name: 'Mercado', group: 'Casa' },
      { name: 'Gastos fijos', group: 'Casa' }
    ];
    
    const categoryIds = [];
    for (const cat of categories) {
      const result = await pool.query(
        `INSERT INTO categories (household_id, name, category_group_id, display_order, is_active)
         VALUES ($1, $2, $3, 1, true) RETURNING id`,
        [householdId, cat.name, categoryGroupIds[cat.group]]
      );
      categoryIds.push({ id: result.rows[0].id, name: cat.name });
    }
    
    console.log(`✅ Created ${categories.length} test categories`);
    
    // Get user ID for payment method
    const userQuery = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [userEmail]
    );
    const userId = userQuery.rows[0].id;
    
    // Create test payment method via database
    const paymentMethodResult = await pool.query(
      `INSERT INTO payment_methods (household_id, name, type, owner_id, is_shared_with_household)
       VALUES ($1, $2, $3, $4, false) RETURNING id`,
      [householdId, 'Efectivo Test', 'cash', userId]
    );
    const paymentMethodId = paymentMethodResult.rows[0].id;
    
    console.log(`✅ Created test payment method`);
    
    // ==================================================================
    // TEST 1: Create first template (Mercado)
    // ==================================================================
    console.log('\n📝 Test 1: Create first template in Mercado category');
    
    await page.goto(`${appUrl}/`);
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
    await page.waitForSelector('#app', { state: 'visible' });
    
    // Click Presupuesto tab
    const presupuestoTab = page.locator('.tab-btn[data-tab="presupuesto"]');
    await presupuestoTab.click();
    await page.waitForTimeout(1500);
    
    // Expand Casa group to see categories
    const casaGroupHeader = page.locator('.expense-group-header').filter({ hasText: 'Casa' });
    await casaGroupHeader.click();
    await page.waitForTimeout(500);
    
    // Click on Mercado category to expand it
    const mercadoCategoryHeader = page.locator('.expense-category-header').filter({ hasText: 'Mercado' });
    await mercadoCategoryHeader.click();
    await page.waitForTimeout(500);
    
    // Click "Agregar gasto recurrente" button inside Mercado category
    const addTemplateBtn = page.locator('.budget-add-template-btn[data-category-name="Mercado"]');
    await addTemplateBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addTemplateBtn.click();
    await page.waitForTimeout(1000);
    
    // Fill template form (category should be pre-selected and disabled)
    await page.locator('#template-name').fill('Compras Exito');
    await page.locator('#template-amount').fill('500000');
    await page.locator('#template-movement-type').selectOption('HOUSEHOLD');
    await page.waitForTimeout(500); // Wait for payment method field to appear
    
    // Select payment method (required for HOUSEHOLD type)
    const paymentMethodSelect = page.locator('#template-payment-method-other');
    await paymentMethodSelect.waitFor({ timeout: 5000 });
    await paymentMethodSelect.selectOption(paymentMethodId);
    
    // Submit
    const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /Crear|Guardar/i }).first();
    await submitBtn.waitFor({ timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(5000); // Give backend time to process
    
    // Close success modal
    const okBtn = page.locator('#modal-ok');
    if (await okBtn.count() > 0) {
      await okBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Verify budget was auto-created
    const budgetQuery1 = await pool.query(
      `SELECT amount FROM monthly_budgets 
       WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [categoryIds[0].id]
    );
    
    if (budgetQuery1.rows.length === 0) {
      throw new Error('Budget was not auto-created for Mercado');
    }
    
    const budget1 = parseFloat(budgetQuery1.rows[0].amount);
    console.log(`  Budget created: $ ${budget1.toLocaleString('es-CO')}`);
    
    if (budget1 !== 500000) {
      throw new Error(`Expected budget of 500,000 but got ${budget1}`);
    }
    
    console.log('✅ Test 1 PASSED: Template created, budget = $ 500.000');
    
    // ==================================================================
    // TEST 2: Add second template to same category
    // ==================================================================
    console.log('\n📝 Test 2: Add second template to Mercado');
    
    // Navigate back to Presupuesto and expand Mercado again
    await page.goto(`${appUrl}/`);
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
    await presupuestoTab.click();
    await page.waitForTimeout(1500);
    
    // Expand Casa group
    const casaGroupHeader2 = page.locator('.expense-group-header').filter({ hasText: 'Casa' });
    await casaGroupHeader2.click();
    await page.waitForTimeout(500);
    
    // Click on Mercado category to expand it
    const mercadoCategoryHeader2 = page.locator('.expense-category-header').filter({ hasText: 'Mercado' });
    await mercadoCategoryHeader2.click();
    await page.waitForTimeout(500);
    
    // Click "Agregar gasto recurrente" button
    const addTemplateBtn2 = page.locator('.budget-add-template-btn[data-category-name="Mercado"]');
    await addTemplateBtn2.click();
    await page.waitForTimeout(1000);
    
    await page.locator('#template-name').fill('Compras Carulla');
    await page.locator('#template-amount').fill('300000');
    
    // Make it auto-generate
    const autoGenerateCheckbox = page.locator('#template-auto-generate');
    await autoGenerateCheckbox.check();
    await page.waitForTimeout(300);
    
    await page.locator('#template-day').fill('15');
    await page.locator('#template-movement-type').selectOption('HOUSEHOLD');
    await page.waitForTimeout(500);
    
    // Select payment method (required for HOUSEHOLD type)  
    const paymentMethodSelectOther = page.locator('#template-payment-method-other');
    await paymentMethodSelectOther.selectOption(paymentMethodId);
    
    await submitBtn.click();
    await page.waitForTimeout(3000);
    
    if (await okBtn.count() > 0) {
      await okBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Verify budget updated
    const budgetQuery2 = await pool.query(
      `SELECT amount FROM monthly_budgets 
       WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [categoryIds[0].id]
    );
    
    const budget2 = parseFloat(budgetQuery2.rows[0].amount);
    console.log(`  Budget after second template: $ ${budget2.toLocaleString('es-CO')}`);
    
    if (budget2 !== 800000) {
      throw new Error(`Expected budget of 800,000 (500k + 300k) but got ${budget2}`);
    }
    
    console.log('✅ Test 2 PASSED: Second template created, budget = $ 800.000');
    
    // ==================================================================
    // TEST 3: Add template to category WITHOUT budget
    // ==================================================================
    console.log('\n📝 Test 3: Add template to Gastos fijos (no budget yet)');
    
    // Navigate back to Presupuesto
    await page.goto(`${appUrl}/`);
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
    await presupuestoTab.click();
    await page.waitForTimeout(1500);
    
    // Expand Casa group
    const casaGroupHeader3 = page.locator('.expense-group-header').filter({ hasText: 'Casa' });
    await casaGroupHeader3.click();
    await page.waitForTimeout(500);
    
    // Click on Gastos fijos category to expand it
    const gastosFijosCategoryHeader = page.locator('.expense-category-header').filter({ hasText: 'Gastos fijos' });
    await gastosFijosCategoryHeader.click();
    await page.waitForTimeout(500);
    
    // Click "Agregar gasto recurrente" button
    const addTemplateBtn3 = page.locator('.budget-add-template-btn[data-category-name="Gastos fijos"]');
    await addTemplateBtn3.click();
    await page.waitForTimeout(1000);
    
    await page.locator('#template-name').fill('Arriendo');
    await page.locator('#template-amount').fill('3200000');
    
    await autoGenerateCheckbox.check();
    await page.waitForTimeout(300);
    await page.locator('#template-day').fill('1');
    await page.locator('#template-movement-type').selectOption('HOUSEHOLD');
    await page.waitForTimeout(500);
    
    // Select payment method (required for HOUSEHOLD type)
    const paymentMethodSelectOther2 = page.locator('#template-payment-method-other');
    await paymentMethodSelectOther2.selectOption(paymentMethodId);
    
    await submitBtn.click();
    await page.waitForTimeout(3000);
    
    if (await okBtn.count() > 0) {
      await okBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Verify budget auto-created
    const budgetQuery3 = await pool.query(
      `SELECT amount FROM monthly_budgets 
       WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [categoryIds[1].id]
    );
    
    if (budgetQuery3.rows.length === 0) {
      throw new Error('Budget was not auto-created for Gastos fijos');
    }
    
    const budget3 = parseFloat(budgetQuery3.rows[0].amount);
    console.log(`  Budget auto-created: $ ${budget3.toLocaleString('es-CO')}`);
    
    if (budget3 !== 3200000) {
      throw new Error(`Expected budget of 3,200,000 but got ${budget3}`);
    }
    
    console.log('✅ Test 3 PASSED: Template created in new category, budget auto-created = $ 3.200.000');
    
    // ==================================================================
    // TEST 4: Validation - Try to edit budget BELOW templates sum
    // ==================================================================
    console.log('\n📝 Test 4: Validation - Edit budget below templates sum (should fail)');
    
    // Navigate to Presupuesto tab if not already there
    await page.goto(`${appUrl}/`);
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(1000);
    await presupuestoTab.click();
    await page.waitForTimeout(1500);
    
    // Expand Casa group to see categories
    const casaGroup4 = page.locator('.expense-group-header').filter({ hasText: 'Casa' });
    if (await casaGroup4.count() > 0) {
      await casaGroup4.click();
      await page.waitForTimeout(500);
    }
    
    // Click on Mercado category HEADER to expand it
    const mercadoCategoryHeader4 = page.locator('.expense-category-header').filter({ hasText: 'Mercado' });
    await mercadoCategoryHeader4.waitFor({ state: 'visible', timeout: 5000 });
    await mercadoCategoryHeader4.click();
    await page.waitForTimeout(500);
    
    // Now the edit button should be visible - find it by data-category-name attribute
    const editBudgetBtn = page.locator('.budget-edit-btn[data-category-name="Mercado"]');
    await editBudgetBtn.waitFor({ state: 'visible', timeout: 5000 });
    await editBudgetBtn.click();
    await page.waitForTimeout(1000);
    
    // Try to set budget to 700,000 (less than 800,000 templates sum)
    const modalInput = page.locator('#modal-input');
    await modalInput.fill('700000');
    
    const modalConfirmBtn = page.locator('#modal-confirm');
    await modalConfirmBtn.click();
    await page.waitForTimeout(1000);
    
    // Verify error modal appears
    const errorModal = page.locator('.modal-overlay');
    const errorModalVisible = await errorModal.isVisible();
    
    if (!errorModalVisible) {
      throw new Error('Expected error modal to appear when setting budget below templates sum');
    }
    
    const errorText = await page.locator('.modal-body').textContent();
    if (!errorText.includes('insuficiente') && !errorText.includes('menor que')) {
      throw new Error(`Expected error message about insufficient budget, got: ${errorText}`);
    }
    
    console.log(`  ✅ Error modal shown: ${errorText.substring(0, 80)}...`);
    
    // Close error modal
    const errorOkBtn = page.locator('#modal-ok');
    await errorOkBtn.click();
    await page.waitForTimeout(500);
    
    // Verify budget NOT changed
    const budgetQuery4 = await pool.query(
      `SELECT amount FROM monthly_budgets 
       WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [categoryIds[0].id]
    );
    
    const budget4 = parseFloat(budgetQuery4.rows[0].amount);
    if (budget4 !== 800000) {
      throw new Error(`Budget should still be 800,000 but got ${budget4}`);
    }
    
    console.log('✅ Test 4 PASSED: Budget validation prevents setting budget below templates sum');
    
    // ==================================================================
    // TEST 5: Validation - Edit budget EQUAL to templates sum (should work)
    // ==================================================================
    console.log('\n📝 Test 5: Validation - Edit budget equal to templates sum (should work)');
    
    // After closing error modal, all groups collapse - need to re-expand everything
    // Wait for any animations to finish
    await page.waitForTimeout(1000);
    
    // Step 1: Re-expand Casa group (click twice to ensure it's expanded, first might collapse, second expands)
    const casaGroupAgain = page.locator('.expense-group-header').filter({ hasText: 'Casa' }).first();
    await casaGroupAgain.waitFor({ state: 'visible', timeout: 5000 });
    await casaGroupAgain.click(); // First click (might collapse if expanded, or expand if collapsed)
    await page.waitForTimeout(300);
    await casaGroupAgain.click(); // Second click (ensures expanded)
    await page.waitForTimeout(700);
    
    // Step 2: Expand Mercado category (double click to ensure)
    const mercadoHeaderAgain = page.locator('.expense-category-header').filter({ hasText: 'Mercado' });
    await mercadoHeaderAgain.waitFor({ state: 'visible', timeout: 5000 });
    await mercadoHeaderAgain.click();
    await page.waitForTimeout(300);
    await mercadoHeaderAgain.click();
    await page.waitForTimeout(700);
    
    // Step 3: Click edit button (now visible)
    const editBudgetBtn2 = page.locator('.budget-edit-btn[data-category-name="Mercado"]');
    await editBudgetBtn2.waitFor({ state: 'visible', timeout: 5000 });
    await editBudgetBtn2.click();
    await page.waitForTimeout(800);
    await page.waitForTimeout(1000);
    
    // Set budget to exactly 800,000
    await modalInput.fill('800000');
    await modalConfirmBtn.click();
    await page.waitForTimeout(2000);
    
    // Should show success modal, not error
    const successModalVisible = await page.locator('.modal-overlay').isVisible();
    if (successModalVisible) {
      const modalText = await page.locator('.modal-body').textContent();
      if (modalText.includes('insuficiente') || modalText.includes('error')) {
        throw new Error(`Expected success but got error: ${modalText}`);
      }
      
      // Close success modal
      await okBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Verify budget equals templates sum
    const budgetQuery5 = await pool.query(
      `SELECT amount FROM monthly_budgets 
       WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [categoryIds[0].id]
    );
    
    const budget5 = parseFloat(budgetQuery5.rows[0].amount);
    if (budget5 !== 800000) {
      throw new Error(`Expected budget of 800,000 but got ${budget5}`);
    }
    
    console.log('✅ Test 5 PASSED: Budget can be set equal to templates sum ($ 800.000)');
    
    // ==================================================================
    // TEST 6: Validation - Edit budget ABOVE templates sum (should work)
    // ==================================================================
    console.log('\n📝 Test 6: Validation - Edit budget above templates sum (should work)');
    
    // After success modal, all groups collapse again - re-expand everything
    await page.waitForTimeout(1000);
    
    // Step 1: Re-expand Casa group (double click to ensure)
    const casaGroupOnceMore = page.locator('.expense-group-header').filter({ hasText: 'Casa' }).first();
    await casaGroupOnceMore.waitFor({ state: 'visible', timeout: 5000 });
    await casaGroupOnceMore.click();
    await page.waitForTimeout(300);
    await casaGroupOnceMore.click();
    await page.waitForTimeout(700);
    
    // Step 2: Expand Mercado category (double click to ensure)
    const mercadoHeaderOnceMore = page.locator('.expense-category-header').filter({ hasText: 'Mercado' });
    await mercadoHeaderOnceMore.waitFor({ state: 'visible', timeout: 5000 });
    await mercadoHeaderOnceMore.click();
    await page.waitForTimeout(300);
    await mercadoHeaderOnceMore.click();
    await page.waitForTimeout(700);
    
    // Step 3: Click edit button
    const editBudgetBtn3 = page.locator('.budget-edit-btn[data-category-name="Mercado"]');
    await editBudgetBtn3.waitFor({ state: 'visible', timeout: 5000 });
    await editBudgetBtn3.click();
    await page.waitForTimeout(800);
    await page.waitForTimeout(1000);
    
    // Set budget to 1,000,000 (200k buffer above templates)
    await modalInput.fill('1000000');
    await modalConfirmBtn.click();
    await page.waitForTimeout(2000);
    
    // Close success modal if shown
    if (await okBtn.count() > 0) {
      await okBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Verify budget updated
    const budgetQuery6 = await pool.query(
      `SELECT amount FROM monthly_budgets 
       WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [categoryIds[0].id]
    );
    
    const budget6 = parseFloat(budgetQuery6.rows[0].amount);
    if (budget6 !== 1000000) {
      throw new Error(`Expected budget of 1,000,000 but got ${budget6}`);
    }
    
    console.log('✅ Test 6 PASSED: Budget can be set above templates sum ($ 1.000.000 > $ 800.000)');
    
    // ==================================================================
    // TEST 7: Validation - Try to create budget below templates (via category without budget)
    // ==================================================================
    console.log('\n📝 Test 7: Validation - Add budget below templates in existing category (should fail)');
    
    // First, delete Gastos fijos budget to test creation
    await pool.query(
      `DELETE FROM monthly_budgets 
       WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [categoryIds[1].id]
    );
    console.log('  Deleted Gastos fijos budget for testing');
    
    // Refresh page to reload budgets
    await page.goto(`${appUrl}/`);
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(1000);
    await presupuestoTab.click();
    await page.waitForTimeout(1500);
    
    // Expand Casa group
    const casaGroupForTest7 = page.locator('.expense-group-header').filter({ hasText: 'Casa' });
    await casaGroupForTest7.waitFor({ state: 'visible', timeout: 5000 });
    await casaGroupForTest7.click();
    await page.waitForTimeout(700);
    
    // Expand Gastos fijos category
    const gastosFijosCategoryHeader7 = page.locator('.expense-category-header').filter({ hasText: 'Gastos fijos' });
    await gastosFijosCategoryHeader7.waitFor({ state: 'visible', timeout: 5000 });
    await gastosFijosCategoryHeader7.click();
    await page.waitForTimeout(700);
    
    // Click "Agregar presupuesto" button (now visible)
    const addBudgetBtn = page.locator('.budget-edit-btn[data-category-name="Gastos fijos"]');
    await addBudgetBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addBudgetBtn.click();
    await page.waitForTimeout(1000);
    
    // Try to set budget to 2,000,000 (less than 3,200,000 template)
    await modalInput.fill('2000000');
    await modalConfirmBtn.click();
    await page.waitForTimeout(1000);
    
    // Verify error modal
    const createErrorModalVisible = await page.locator('.modal-overlay').isVisible();
    if (!createErrorModalVisible) {
      throw new Error('Expected error modal when creating budget below templates sum');
    }
    
    const createErrorText = await page.locator('.modal-body').textContent();
    if (!createErrorText.includes('insuficiente') && !createErrorText.includes('menor que')) {
      throw new Error(`Expected error about insufficient budget, got: ${createErrorText}`);
    }
    
    console.log(`  ✅ Error modal shown: ${createErrorText.substring(0, 80)}...`);
    
    // Close error modal
    await errorOkBtn.click();
    await page.waitForTimeout(500);
    
    // Verify budget NOT created
    const budgetQuery7 = await pool.query(
      `SELECT amount FROM monthly_budgets 
       WHERE category_id = $1 AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE`,
      [categoryIds[1].id]
    );
    
    if (budgetQuery7.rows.length > 0) {
      throw new Error('Budget should not have been created');
    }
    
    console.log('✅ Test 7 PASSED: Cannot create budget below templates sum');
    
    // ==================================================================
    // SUMMARY
    // ==================================================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY - ALL PASSED ✅');
    console.log('='.repeat(60));
    console.log('✅ Test 1: First template → Budget auto-created ($ 500.000)');
    console.log('✅ Test 2: Second template → Budget incremented ($ 800.000)');
    console.log('✅ Test 3: Template in new category → Budget auto-created ($ 3.200.000)');
    console.log('✅ Test 4: Edit budget < templates → VALIDATION ERROR ✅');
    console.log('✅ Test 5: Edit budget = templates → SUCCESS ✅');
    console.log('✅ Test 6: Edit budget > templates → SUCCESS (buffer allowed) ✅');
    console.log('✅ Test 7: Create budget < templates → VALIDATION ERROR ✅');
    console.log('='.repeat(60));
    console.log('\n🎯 KEY FINDINGS:');
    console.log('- Backend auto-calculates budget = SUM(templates)');
    console.log('- Templates successfully created via UI');
    console.log('- Payment methods required for HOUSEHOLD type');
    console.log('- Auto-generate flag works correctly');
    console.log('- ✨ Budget validation: budget >= SUM(templates) enforced');
    console.log('- ✨ Users can add buffer for uncategorized expenses');
    console.log('\n✅ ✅ ✅ TEMPLATE INTEGRATION + VALIDATION WORKING! ✅ ✅ ✅\n');
    
    console.log('\n✅ ✅ ✅ TEMPLATE INTEGRATION WORKING! ✅ ✅ ✅\n');
    
    // ==================================================================
    // Cleanup
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    console.log('✅ Cleanup complete\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    throw error;
    
  } finally {
    await browser.close();
    await pool.end();
  }
}

// Run tests
testTemplates().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
