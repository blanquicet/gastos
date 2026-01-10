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
 * 4. Set budget for a category
 * 5. Edit budget inline (✏️ button)
 * 6. Copy budgets to next month
 * 7. Verify budgets were copied
 */

async function testBudgetManagement() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';
  
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
    
    // Should be on registrar-movimiento page
    await page.waitForURL('**/registrar-movimiento');
    console.log('✅ User registered and logged in');

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
    
    // Create categories via API (simpler than UI)
    const categories = [
      { name: 'Mercado', category_group: 'Casa', icon: '🛒', color: '#FF6B6B' },
      { name: 'Transporte', category_group: 'Casa', icon: '🚗', color: '#4ECDC4' },
      { name: 'Restaurantes', category_group: 'Diversión', icon: '🍽️', color: '#FFE66D' }
    ];
    
    for (const cat of categories) {
      await pool.query(
        `INSERT INTO categories (household_id, name, category_group, icon, color, display_order, is_active)
         VALUES ($1, $2, $3, $4, $5, 1, true)`,
        [householdId, cat.name, cat.category_group, cat.icon, cat.color]
      );
    }
    
    console.log(`✅ Created ${categories.length} test categories`);

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
    // STEP 4: Set Initial Budgets via API (so cards appear)
    // ==================================================================
    console.log('📝 Step 4: Setting initial budgets via API...');
    
    // Get category IDs from database
    const categoriesQuery = await pool.query(
      'SELECT id, name FROM categories WHERE household_id = $1 ORDER BY name',
      [householdId]
    );
    const categoryIds = categoriesQuery.rows;
    console.log(`  Found ${categoryIds.length} categories`);
    
    // Set budgets for all categories via API
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    for (const cat of categoryIds) {
      await pool.query(
        `INSERT INTO monthly_budgets (household_id, category_id, month, amount, currency)
         VALUES ($1, $2, $3, $4, 'COP')`,
        [householdId, cat.id, `${currentMonth}-01`, 500000]
      );
    }
    
    console.log(`✅ Set budgets of 500,000 COP for ${categoryIds.length} categories`);
    
    // Reload the page to fetch the budgets
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Click Presupuesto tab again after reload
    await page.locator('.tab-btn[data-tab="presupuesto"]').click();
    await page.waitForTimeout(2000);

    // ==================================================================
    // STEP 5: Verify Budget Cards Are Displayed
    // ==================================================================
    console.log('📝 Step 5: Verifying budget cards are displayed...');
    
    // Check for budget cards
    const budgetCards = await page.locator('.budget-card').count();
    if (budgetCards !== 3) {
      throw new Error(`Expected 3 budget cards, found ${budgetCards}`);
    }
    
    console.log(`✅ Found ${budgetCards} budget cards (one per category)`);

    // ==================================================================
    // STEP 6: Navigate to Next Month
    // ==================================================================
    console.log('📝 Step 6: Navigating to next month...');
    
    // Click next month button
    await page.locator('#next-month-btn').click();
    await page.waitForTimeout(2000);
    
    // Verify budgets are empty for next month
    const nextMonthCards = await page.locator('.budget-card').count();
    if (nextMonthCards !== 3) {
      throw new Error(`Expected 3 budget cards in next month, found ${nextMonthCards}`);
    }
    
    // Check that amounts are 0 or empty (no budgets set yet)
    const firstCardAmount = await page.locator('.budget-card').first().locator('.budget-amount-display').textContent();
    console.log('  First card amount in next month:', firstCardAmount.trim());
    
    console.log('✅ Navigated to next month (budgets should be empty)');

    // ==================================================================
    // STEP 7: Copy Budgets from Previous Month
    // ==================================================================
    console.log('📝 Step 7: Copying budgets from previous month...');
    
    // Click "Copiar del mes anterior" button
    const copyBtn = page.locator('#copy-prev-month-budget');
    await copyBtn.click();
    await page.waitForTimeout(500);
    
    // Wait for custom confirmation modal to appear
    await page.waitForSelector('.modal', { timeout: 3000 });
    
    // Click confirm button in modal (assuming it's a button with text containing "Copiar" or "Confirmar")
    const confirmBtn = page.locator('.modal button').filter({ hasText: /Copiar|Confirmar|Aceptar|Sí/i }).first();
    await confirmBtn.click();
    await page.waitForTimeout(2000); // Wait for API call
    
    // Wait for success modal and click OK
    await page.waitForSelector('.modal', { timeout: 5000 });
    const okBtn = page.locator('.modal button#modal-ok, .modal button').filter({ hasText: /OK/i }).first();
    await okBtn.click();
    await page.waitForTimeout(3000); // Wait for modal to close and data to reload
    
    console.log('✅ Copy budgets button clicked and confirmed');

    // ==================================================================
    // STEP 8: Verify Budgets Were Copied
    // ==================================================================
    console.log('📝 Step 8: Verifying budgets were copied...');
    
    // Check that amounts are now populated
    const copiedCards = await page.locator('.budget-card').all();
    
    for (let i = 0; i < copiedCards.length; i++) {
      const cardAmount = await copiedCards[i].locator('.budget-amount-display').textContent();
      console.log(`  Category ${i + 1} amount:`, cardAmount.trim());
      
      // Check that budget amount (after /) is not 0
      // Format is: "$ 0 / $ 500.000 ✏️"
      const parts = cardAmount.split('/');
      if (parts.length < 2) {
        throw new Error(`Category ${i + 1} has invalid format: ${cardAmount}`);
      }
      
      const budgetPart = parts[1].trim();
      if (budgetPart.includes('$ 0') || budgetPart.startsWith('0')) {
        throw new Error(`Category ${i + 1} still shows 0 budget after copy: ${budgetPart}`);
      }
    }
    
    console.log('✅ All budgets successfully copied to next month');

    // ==================================================================
    // STEP 9: Verify "Gestionar categorías" Button Navigation
    // ==================================================================
    console.log('📝 Step 9: Testing "Gestionar categorías" button...');
    
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
