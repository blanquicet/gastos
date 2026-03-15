/**
 * Budget Scope E2E Test
 *
 * Verifies:
 * 1. Lazy copy of budget items across months
 * 2. Budget edit with scope=THIS
 * 3. Budget edit with scope=ALL
 * 4. Budget set to 0 with scope=THIS
 */

import { chromium } from 'playwright';
import pg from 'pg';
import { createGroupsAndCategoriesViaUI, getCategoryIds } from './helpers/category-helpers.js';
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

async function testBudgetScope() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless });
  const pool = new Pool({ connectionString: dbUrl });

  const timestamp = Date.now();
  const userEmail = `budget-scope-e2e-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `BudgetScope E2E ${timestamp}`;

  console.log('🚀 Starting Budget Scope E2E Tests');
  console.log('👤 User:', userEmail);
  console.log('🏠 Household:', householdName);

  let householdId, mercadoId;

  try {
    // ==================================================================
    // SETUP: Register, create household, categories
    // ==================================================================
    console.log('\n📦 SETUP');

    const context = await browser.newContext();
    const page = await context.newPage();

    // Register user
    await page.goto(appUrl);
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    await page.locator('#registerName').fill('Budget Scope Tester');
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
    const userId = userQuery.rows[0].id;
    await completeOnboardingViaDB(pool, userId);

    await page.locator('#modal-ok').click();
    await page.waitForTimeout(2000);
    console.log('  ✅ Household created');

    // Get household ID
    const hhQuery = await pool.query('SELECT id FROM households WHERE name = $1', [householdName]);
    householdId = hhQuery.rows[0].id;

    // Create categories via UI
    await createGroupsAndCategoriesViaUI(page, appUrl, [
      { name: 'Casa', icon: '🏠', categories: ['BudgetScopeMercado'] },
    ]);
    console.log('  ✅ Categories created');

    const categoryMap = await getCategoryIds(pool, householdId, ['BudgetScopeMercado']);
    mercadoId = categoryMap['BudgetScopeMercado'];

    // ==================================================================
    // TEST 1: Lazy copy across months (budget items)
    // ==================================================================
    console.log('\n📝 Test 1: Lazy copy of budget items across months');

    // Create a budget item via UI
    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'BudgetScopeMercado');

    const addTemplateBtn1 = page.locator('.budget-add-template-btn[data-category-name="BudgetScopeMercado"]');
    await addTemplateBtn1.waitFor({ timeout: 5000 });
    await addTemplateBtn1.click();
    await page.waitForTimeout(1000);

    await page.locator('#template-name').fill('TestItem');
    await page.locator('#template-amount').fill('500000');
    await page.locator('#template-movement-type').selectOption('HOUSEHOLD');
    await page.waitForTimeout(500);

    const submitBtn1 = page.locator('button[type="submit"]').filter({ hasText: /Crear|Guardar/i }).first();
    await submitBtn1.click();
    await page.waitForTimeout(3000);
    await closeModal(page);

    console.log('  ✅ Budget item created for current month');

    // Navigate to next month — should lazy-copy
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    let budgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
    if (!budgetText.includes('500.000') && !budgetText.includes('500,000')) {
      throw new Error(`Next month should have 500k from lazy copy, got: ${budgetText}`);
    }
    console.log('  ✅ Next month has 500k (lazy copy)');

    // Navigate forward once more — still copies
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
    if (!budgetText.includes('500.000') && !budgetText.includes('500,000')) {
      throw new Error(`Month+2 should also have 500k, got: ${budgetText}`);
    }
    console.log('  ✅ Month+2 also has 500k (lazy copy)');

    // Go back to a past month — no backward copy
    await goPrevMonth(page);
    await goPrevMonth(page);
    await goPrevMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
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
    await expandCategory(page, 'BudgetScopeMercado');

    const editBudgetBtn = page.locator('.expense-category-item').filter({ hasText: 'BudgetScopeMercado' }).locator('button[data-action="edit-budget"]');
    await editBudgetBtn.waitFor({ timeout: 5000 });
    await editBudgetBtn.click();
    await page.waitForTimeout(500);

    await selectScopeAndConfirm(page, 'THIS');
    await page.waitForTimeout(1000);

    const editInput = page.locator('#modal-input');
    await editInput.selectText();
    await editInput.fill('600000');
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(1000);
    await closeModal(page);

    console.log('  ✅ Budget edited to 600k with scope=THIS');

    // Verify current month shows 600k
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
    if (!budgetText.includes('600.000') && !budgetText.includes('600,000')) {
      throw new Error(`Current month should be 600k, got: ${budgetText}`);
    }
    console.log('  ✅ Current month = 600k');

    // Next month should still be 500k
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
    if (!budgetText.includes('500.000') && !budgetText.includes('500,000')) {
      throw new Error(`Next month should keep 500k (old value), got: ${budgetText}`);
    }
    console.log('  ✅ Next month keeps 500k (old value preserved)');

    console.log('✅ Test 2 PASSED: Budget scope=THIS works correctly\n');

    // ==================================================================
    // TEST 3: Budget scope=ALL
    // ==================================================================
    console.log('📝 Test 3: Budget scope=ALL');

    // Set next month to 800k (THIS) so we have two different records
    await goToPresupuesto(page);
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'BudgetScopeMercado');

    const editBtn2 = page.locator('.expense-category-item').filter({ hasText: 'BudgetScopeMercado' }).locator('button[data-action="edit-budget"]');
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
    await expandCategory(page, 'BudgetScopeMercado');

    const editBtn3 = page.locator('.expense-category-item').filter({ hasText: 'BudgetScopeMercado' }).locator('button[data-action="edit-budget"]');
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
    budgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
    if (!budgetText.includes('700.000') && !budgetText.includes('700,000')) {
      throw new Error(`Current month should be 700k after ALL, got: ${budgetText}`);
    }
    console.log('  ✅ Current month = 700k');

    // Next month should also be 700k (ALL updated it)
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    budgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
    if (!budgetText.includes('700.000') && !budgetText.includes('700,000')) {
      throw new Error(`Next month should be 700k after ALL, got: ${budgetText}`);
    }
    console.log('  ✅ Next month = 700k (ALL updated it)');

    console.log('✅ Test 3 PASSED: Budget scope=ALL works correctly\n');

    // ==================================================================
    // TEST 4: Budget set to 0 (delete) with scope=THIS
    // After Test 3, BudgetScopeMercado has 700k everywhere.
    // Setting to 0 with scope=THIS should clear this month only.
    // ==================================================================
    console.log('\n📝 Test 4: Budget set to 0 with scope=THIS');

    await goToPresupuesto(page);
    await expandGroup(page, 'Casa');
    await expandCategory(page, 'BudgetScopeMercado');

    const zeroBudgetBtn = page.locator('.expense-category-item').filter({ hasText: 'BudgetScopeMercado' }).locator('button[data-action="edit-budget"]');
    await zeroBudgetBtn.waitFor({ timeout: 5000 });
    await zeroBudgetBtn.click();
    await page.waitForTimeout(500);

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
    let zeroBudgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
    if (!zeroBudgetText.toLowerCase().includes('sin presupuesto')) {
      throw new Error(`Current month should show "Sin presupuesto", got: ${zeroBudgetText}`);
    }
    console.log('  ✅ Current month shows "Sin presupuesto"');

    // Next month should still have a budget
    await goNextMonth(page);
    await expandGroup(page, 'Casa');
    zeroBudgetText = await getCategoryBudgetText(page, 'BudgetScopeMercado');
    if (zeroBudgetText.toLowerCase().includes('sin presupuesto')) {
      throw new Error(`Next month should still have budget, got: ${zeroBudgetText}`);
    }
    console.log(`  ✅ Next month still has budget: ${zeroBudgetText} (scope=THIS preserved it)`);

    console.log('✅ Test 4 PASSED: Budget set to 0 asks for scope correctly\n');

    // ==================================================================
    // SUMMARY
    // ==================================================================
    console.log('='.repeat(60));
    console.log('📊 ALL BUDGET SCOPE TESTS PASSED ✅');
    console.log('='.repeat(60));
    console.log('✅ Test 1: Budget inheritance across months (lazy copy)');
    console.log('✅ Test 2: Budget scope=THIS');
    console.log('✅ Test 3: Budget scope=ALL');
    console.log('✅ Test 4: Budget set to 0 with scope=THIS');
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

testBudgetScope().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
