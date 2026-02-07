import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Budget Management (Phase 6B Frontend)
 * 
 * Tests the budget editing and copying functionality:
 * 1. Register user and create household
 * 2. Create categories
 * 3. Navigate to Presupuesto tab
 * 4. Add budget using three-dots menu and modal
 * 5. Edit budget using three-dots menu and modal
 * 6. Copy budgets to next month
 * 7. Verify budgets were copied
 * 8. Test "Gestionar categorías" button navigation
 */

async function testBudgetManagement() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const userEmail = `budget-test-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Budget Test Household ${timestamp}`;

  try {
    console.log('🚀 Starting Budget Management Test');
    console.log('👤 User:', userEmail);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User and Create Household
    // ==================================================================
    console.log('📝 Step 1: Registering user and creating household...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto(appUrl);
    await page.waitForTimeout(1000);
    
    // Register
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#registerName').fill('Test User');
    await page.locator('#registerEmail').fill(userEmail);
    await page.locator('#registerPassword').fill(password);
    await page.locator('#registerConfirm').fill(password);
    
    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);
    
    // After registration, user is logged in and should be on home page
    console.log('✅ User registered and logged in');

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
    
    console.log('✅ Household created');

    // ==================================================================
    // STEP 2: Create Test Categories
    // ==================================================================
    console.log('📝 Step 2: Creating test categories...');
    
    // Get household ID from database
    const householdQuery = await pool.query(
      'SELECT id FROM households WHERE name = $1',
      [householdName]
    );
    const householdId = householdQuery.rows[0].id;
    
    // Create category groups and categories via database
    const categoryGroups = [
      { name: 'Casa', icon: '🏠', display_order: 1 },
      { name: 'Diversión', icon: '🎉', display_order: 2 }
    ];
    
    const categoryGroupIds = {};
    for (const group of categoryGroups) {
      const result = await pool.query(
        `INSERT INTO category_groups (household_id, name, icon, display_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [householdId, group.name, group.icon, group.display_order]
      );
      categoryGroupIds[group.name] = result.rows[0].id;
    }
    
    const categories = [
      { name: 'Mercado', category_group: 'Casa' },
      { name: 'Transporte', category_group: 'Casa' },
      { name: 'Restaurantes', category_group: 'Diversión' }
    ];
    
    for (const cat of categories) {
      await pool.query(
        `INSERT INTO categories (household_id, name, category_group_id, display_order, is_active)
         VALUES ($1, $2, $3, 1, true)`,
        [householdId, cat.name, categoryGroupIds[cat.category_group]]
      );
    }
    
    console.log(`✅ Created ${categoryGroups.length} category groups and ${categories.length} test categories`);

    // ==================================================================
    // STEP 3: Navigate to Home Page and Presupuesto Tab
    // ==================================================================
    console.log('📝 Step 3: Navigating to Presupuesto tab...');
    
    // Navigate to home page (route is / not /home)
    await page.goto(`${appUrl}/`);
    
    // Wait for loading spinner to disappear
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
    
    // Wait for app content to be visible
    await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
    
    // Wait for tabs to load
    await page.waitForSelector('.tab-btn', { timeout: 10000 });
    
    // Log available tabs
    const tabCount = await page.locator('.tab-btn').count();
    console.log(`  Found ${tabCount} tabs`);
    
    // Click on Presupuesto tab
    const presupuestoTab = page.locator('.tab-btn[data-tab="presupuesto"]');
    await presupuestoTab.click();
    await page.waitForTimeout(2000);
    
    console.log('✅ On Presupuesto tab');

    // ==================================================================
    // STEP 4: Get Category IDs and Expand Groups
    // ==================================================================
    console.log('📝 Step 4: Getting category IDs and expanding groups...');
    
    // Get category IDs from database
    const categoriesQuery = await pool.query(
      'SELECT id, name FROM categories WHERE household_id = $1 ORDER BY name',
      [householdId]
    );
    const categoryIds = categoriesQuery.rows;
    console.log(`  Found ${categoryIds.length} categories`);

    // Expand all category groups (they're collapsed by default)
    const groupHeaders = await page.locator('.expense-group-header').all();
    console.log(`  Found ${groupHeaders.length} category groups`);
    
    for (const header of groupHeaders) {
      await header.click();
      await page.waitForTimeout(300);
    }
    
    console.log('✅ Expanded all groups');
    
    // Check for budget cards (using expense-category-item structure)
    const budgetCards = await page.locator('.expense-category-item').count();
    if (budgetCards !== 3) {
      throw new Error(`Expected 3 budget cards, found ${budgetCards}`);
    }
    
    console.log(`✅ Found ${budgetCards} budget cards (one per category)`);

    // ==================================================================
    // STEP 5: Add Budget Using Action Button
    // ==================================================================
    console.log('📝 Step 5: Adding budget using action button...');
    
    // Get first budget item (category without budget)
    const firstBudgetCard = page.locator('.expense-category-item').first();
    
    // Click the category header to expand and show action buttons
    const categoryHeader = firstBudgetCard.locator('.expense-category-header');
    await categoryHeader.click();
    await page.waitForTimeout(500);
    
    // Now look for the "Agregar presupuesto total" button (should be visible now)
    const addBudgetBtn = firstBudgetCard.locator('button[data-action="add-budget"]');
    await addBudgetBtn.waitFor({ timeout: 5000 });
    await addBudgetBtn.click();
    await page.waitForTimeout(1000);
    
    // Wait for modal to appear
    await page.waitForSelector('.modal', { timeout: 3000 });
    
    // Fill budget amount in modal input (uses id="modal-input")
    const modalInput = page.locator('#modal-input');
    await modalInput.fill('500000');
    await page.waitForTimeout(300);
    
    // Click confirm button in modal
    const addConfirmBtn = page.locator('.modal button#modal-confirm').first();
    await addConfirmBtn.click();
    await page.waitForTimeout(2000); // Wait for API call and success modal
    
    // Close success modal (showSuccess uses modal-ok)
    const addSuccessOkBtn = page.locator('.modal button#modal-ok').first();
    await addSuccessOkBtn.click();
    await page.waitForTimeout(1000);
    
    console.log('✅ Budget added successfully using action button');

    // ==================================================================
    // STEP 6: Edit Budget Using Action Button
    // ==================================================================
    console.log('📝 Step 6: Editing budget using action button...');
    
    // Expand groups again (they collapse after reload)
    const editGroupHeaders = await page.locator('.expense-group-header').all();
    for (const header of editGroupHeaders) {
      await header.click();
      await page.waitForTimeout(300);
    }
    
    // Get first budget item again
    const editBudgetCard = page.locator('.expense-category-item').first();
    
    // Click the category header to expand (categories collapse after page reload)
    const editCategoryHeader = editBudgetCard.locator('.expense-category-header');
    await editCategoryHeader.click();
    await page.waitForTimeout(500);
    
    // Click the "Editar presupuesto total" button
    const editBudgetBtn = editBudgetCard.locator('button[data-action="edit-budget"]');
    await editBudgetBtn.waitFor({ timeout: 5000 });
    await editBudgetBtn.click();
    await page.waitForTimeout(500);
    
    // Wait for modal to appear
    await page.waitForSelector('.modal', { timeout: 3000 });
    
    // Clear and fill new budget amount in modal input (uses id="modal-input")
    const editModalInput = page.locator('#modal-input');
    await editModalInput.selectText();
    await editModalInput.fill('750000');
    await page.waitForTimeout(300);
    
    // Click confirm button in modal
    const editConfirmBtn = page.locator('.modal button#modal-confirm').first();
    await editConfirmBtn.click();
    await page.waitForTimeout(2000); // Wait for API call and success modal
    
    // Close success modal (showSuccess uses modal-ok)
    const editSuccessOkBtn = page.locator('.modal button#modal-ok').first();
    await editSuccessOkBtn.click();
    await page.waitForTimeout(1000);
    
    // Verify amount was updated (amount is in the category header)
    const updatedAmountEl = editBudgetCard.locator('.expense-category-header .expense-category-amount');
    const updatedAmount = await updatedAmountEl.textContent();
    console.log(`  Updated budget amount: ${updatedAmount.trim()}`);
    
    if (!updatedAmount.includes('750.000') && !updatedAmount.includes('750,000')) {
      throw new Error(`Expected budget to be 750,000 but got: ${updatedAmount}`);
    }
    
    console.log('✅ Budget edited successfully using action button');
    
    // ==================================================================
    // STEP 7: Add Budgets to Remaining Categories via API
    // ==================================================================
    console.log('📝 Step 7: Adding budgets to remaining categories via API...');
    
    // Set budgets for all categories via API for copy test
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    for (const cat of categoryIds) {
      // Skip first category (already has budget from UI test)
      if (cat.id === categoryIds[0].id) continue;
      
      await pool.query(
        `INSERT INTO monthly_budgets (household_id, category_id, month, amount, currency)
         VALUES ($1, $2, $3, $4, 'COP')
         ON CONFLICT (household_id, category_id, month) DO UPDATE SET amount = $4`,
        [householdId, cat.id, `${currentMonth}-01`, 500000]
      );
    }
    
    console.log(`✅ Set budgets for remaining categories`);
    
    // Reload to see all budgets
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Click Presupuesto tab again after reload
    await page.locator('.tab-btn[data-tab="presupuesto"]').click();
    await page.waitForTimeout(2000);

    // ==================================================================
    // STEP 8: Navigate to Next Month
    // ==================================================================
    console.log('📝 Step 8: Navigating to next month...');
    
    // Click next month button
    await page.locator('#next-month-btn').click();
    await page.waitForTimeout(2000);
    
    // Expand all groups again in the new month
    const nextMonthGroups = await page.locator('.expense-group-header').all();
    for (const header of nextMonthGroups) {
      await header.click();
      await page.waitForTimeout(300);
    }
    
    // Verify budgets are empty for next month
    const nextMonthCards = await page.locator('.expense-category-item').count();
    if (nextMonthCards !== 3) {
      throw new Error(`Expected 3 budget cards in next month, found ${nextMonthCards}`);
    }
    
    // Check that amounts show "Sin presupuesto" (no budgets set yet)
    const firstCard = page.locator('.expense-category-item').first();
    const amountEl = firstCard.locator('.expense-category-header .expense-category-amount');
    const amountText = await amountEl.textContent();
    
    console.log('  First card amount text:', amountText.trim());
    
    if (!amountText.includes('Sin presupuesto')) {
      console.log('  ⚠️  Warning: Expected "Sin presupuesto" but got:', amountText.trim());
    }
    
    console.log('✅ Navigated to next month (budgets should be empty)');

    // ==================================================================
    // STEP 9: Copy Budgets from Previous Month
    // ==================================================================
    console.log('📝 Step 9: Copying budgets from previous month...');
    
    // Click "Copiar del mes anterior" button
    const copyBtn = page.locator('#copy-prev-month-budget');
    await copyBtn.click();
    await page.waitForTimeout(500);
    
    // Wait for custom confirmation modal to appear
    await page.waitForSelector('.modal', { timeout: 3000 });
    
    // Click confirm button in modal (showConfirmation uses modal-confirm)
    const copyConfirmBtn = page.locator('.modal button#modal-confirm').first();
    await copyConfirmBtn.click();
    await page.waitForTimeout(2000); // Wait for API call
    
    // Wait for success modal and click OK (showSuccess uses modal-ok)
    await page.waitForSelector('.modal', { timeout: 5000 });
    const copyOkBtn = page.locator('.modal button#modal-ok').first();
    await copyOkBtn.click();
    await page.waitForTimeout(3000); // Wait for modal to close and data to reload
    
    console.log('✅ Copy budgets button clicked and confirmed');

    // ==================================================================
    // STEP 10: Verify Budgets Were Copied
    // ==================================================================
    console.log('📝 Step 10: Verifying budgets were copied...');
    
    // Expand all groups to see categories
    const copiedMonthGroups = await page.locator('.expense-group-header').all();
    for (const header of copiedMonthGroups) {
      await header.click();
      await page.waitForTimeout(300);
    }
    
    // Check that amounts are now populated
    const copiedCards = await page.locator('.expense-category-item').all();
    
    for (let i = 0; i < copiedCards.length; i++) {
      const cardAmountEl = copiedCards[i].locator('.expense-category-header .expense-category-amount');
      const cardAmount = await cardAmountEl.textContent();
      console.log(`  Category ${i + 1} amount:`, cardAmount.trim());
      
      // Check that budget amount is not empty and not 0
      // Format is now: "$ 500.000" or "$ 750.000" (for first category)
      if (!cardAmount || cardAmount.trim() === '' || cardAmount.includes('Sin presupuesto')) {
        throw new Error(`Category ${i + 1} shows invalid budget after copy: ${cardAmount}`);
      }
    }
    
    console.log('✅ All budgets successfully copied to next month');

    // ==================================================================
    // STEP 11: Verify "Gestionar categorías" Button Navigation
    // ==================================================================
    console.log('📝 Step 11: Testing "Gestionar categorías" button...');
    
    const manageCategoriesBtn = page.locator('#manage-categories-btn');
    await manageCategoriesBtn.click();
    await page.waitForTimeout(2000);
    
    // Should navigate to /hogar page
    await page.waitForURL('**/hogar');
    console.log('✅ "Gestionar categorías" button navigates to /hogar page');

    // ==================================================================
    // Cleanup: Delete test data
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    // Delete household (cascades to categories and budgets)
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    
    // Delete user
    const userQuery = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userQuery.rows.length > 0) {
      await pool.query('DELETE FROM users WHERE id = $1', [userQuery.rows[0].id]);
    }
    
    console.log('✅ Cleanup complete');
    console.log('');
    console.log('✅ ✅ ✅ ALL BUDGET MANAGEMENT TESTS PASSED! ✅ ✅ ✅');
    
    return true;
  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED:', error.message);
    console.error('');
    
    // Take screenshot on failure
    const screenshotPath = process.env.CI 
      ? 'test-results/budget-management-failure.png'
      : '/tmp/budget-management-failure.png';
    
    try {
      const page = (await browser.contexts())[0]?.pages()[0];
      if (page) {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error(`📸 Screenshot saved to: ${screenshotPath}`);
      }
    } catch (screenshotError) {
      console.error('Failed to save screenshot:', screenshotError.message);
    }
    
    throw error;
  } finally {
    await pool.end();
    await browser.close();
  }
}

// Run the test
testBudgetManagement()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
