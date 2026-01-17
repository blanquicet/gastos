import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Income Management (Registration and Editing)
 * 
 * Tests the complete income lifecycle:
 * 1. Register user and create household
 * 2. Add savings and cash accounts
 * 3. Register salary income
 * 4. Register freelance income
 * 5. Register internal movement (savings withdrawal)
 * 6. Verify incomes appear in Ingresos tab
 * 7. Edit an income (amount and description)
 * 8. Verify edited income shows updated data
 * 9. Delete an income
 * 10. Verify deletion
 * 11. Cleanup test data
 */

async function testIncomeManagement() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const userEmail = `income-test-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Income Test Household ${timestamp}`;

  let user1Id, householdId, savingsAccountId, cashAccountId;
  let salaryIncomeId, freelanceIncomeId, withdrawalIncomeId;

  try {
    console.log('🚀 Starting Income Management Test');
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
    
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#registerName').fill('Test User Income');
    await page.locator('#registerEmail').fill(userEmail);
    await page.locator('#registerPassword').fill(password);
    await page.locator('#registerConfirm').fill(password);
    
    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);
    
    // Should be on home page after registration
    
    // Go to profile and create household
    await page.locator('#hamburger-btn').click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.waitForTimeout(1000);
    
    // Click "Crear hogar"
    await page.getByRole('button', { name: 'Crear hogar' }).click();
    await page.waitForTimeout(1000);
    
    // Fill household name
    await page.locator('#household-name').fill(householdName);
    await page.getByRole('button', { name: 'Crear hogar' }).click();
    await page.waitForTimeout(2000);
    
    // Should be on household page
    await page.waitForURL('**/hogar');
    await page.waitForTimeout(1000);
    
    // Get user ID and household ID from database
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    user1Id = userResult.rows[0].id;
    
    const householdResult = await pool.query(
      'SELECT household_id FROM household_members WHERE user_id = $1',
      [user1Id]
    );
    householdId = householdResult.rows[0].household_id;
    
    console.log('✅ User registered and household created');

    // ==================================================================
    // STEP 2: Add Savings Account
    // ==================================================================
    console.log('📝 Step 2: Adding savings account...');
    
    await page.goto(`${appUrl}/perfil`);
    await page.waitForTimeout(2000);
    
    await page.locator('#add-account-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#add-account-btn').click();
    await page.waitForTimeout(500);
    
    await page.selectOption('select#account-type', 'savings');
    await page.locator('#account-name').fill('Cuenta Ahorros Bancolombia');
    await page.locator('#account-balance').fill('5000000');
    
    await page.locator('#account-form button[type="submit"]').click();
    await page.waitForTimeout(1500);
    
    // Wait for success modal and click OK
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    await page.locator('#modal-ok').click();
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    
    // Get account ID from database
    const savingsAccountResult = await pool.query(
      'SELECT id FROM accounts WHERE owner_id = $1 AND type = $2',
      [user1Id, 'savings']
    );
    savingsAccountId = savingsAccountResult.rows[0].id;
    
    console.log('✅ Savings account created');

    // ==================================================================
    // STEP 3: Add Cash Account
    // ==================================================================
    console.log('📝 Step 3: Adding cash account...');
    
    await page.locator('#add-account-btn').click();
    await page.waitForTimeout(500);
    
    await page.selectOption('select#account-type', 'cash');
    await page.locator('#account-name').fill('Bolsillo');
    await page.locator('#account-balance').fill('500000');
    
    await page.locator('#account-form button[type="submit"]').click();
    await page.waitForTimeout(1500);
    
    // Wait for success modal and click OK
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    await page.locator('#modal-ok').click();
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    
    // Get account ID from database
    const cashAccountResult = await pool.query(
      'SELECT id FROM accounts WHERE owner_id = $1 AND type = $2',
      [user1Id, 'cash']
    );
    cashAccountId = cashAccountResult.rows[0].id;
    
    console.log('✅ Cash account created');

    // ==================================================================
    // STEP 4: Register Salary Income
    // ==================================================================
    console.log('📝 Step 4: Registering salary income...');
    
    await page.goto(`${appUrl}/registrar-movimiento`);
    await page.waitForTimeout(1000);
    
    // Click INGRESO button
    await page.locator('button.tipo-btn[data-tipo="INGRESO"]').click();
    await page.waitForTimeout(500);
    
    // Fill income form
    await page.locator('#descripcion').fill('Salario Enero 2026');
    await page.locator('#valor').fill('5000000');
    await page.locator('#fecha').fill('2026-01-15');
    
    // Select who receives (member) - this triggers account loading
    await page.selectOption('select#ingresoMiembro', user1Id);
    await page.waitForTimeout(500);
    
    // Select account (now it should be populated)
    await page.selectOption('select#ingresoCuenta', savingsAccountId);
    
    // Select income type (salary)
    await page.selectOption('select#ingresoTipo', 'salary');
    
    // Submit
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(2000);
    
    // Should navigate to Ingresos tab after submission
    await page.waitForURL('**/?tab=ingresos*', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Try to click modal OK button if present
    try {
      await page.waitForSelector('.modal-overlay', { state: 'visible', timeout: 3000 });
      const modalTitle = await page.locator('.modal-title').textContent({ timeout: 1000 });
      console.log(`✓ Modal shown: "${modalTitle}"`);
      await page.locator('#modal-ok').click();
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('ℹ️ Modal not shown or already dismissed');
    }
    
    // Get income ID from database
    const salaryResult = await pool.query(
      'SELECT id FROM income WHERE member_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1',
      [user1Id, 'salary']
    );
    salaryIncomeId = salaryResult.rows[0].id;
    
    console.log('✅ Salary income registered');

    // ==================================================================
    // STEP 5: Register Freelance Income
    // ==================================================================
    console.log('📝 Step 5: Registering freelance income...');
    
    await page.goto(`${appUrl}/registrar-movimiento`);
    await page.waitForTimeout(1000);
    
    // Click INGRESO button
    await page.locator('button.tipo-btn[data-tipo="INGRESO"]').click();
    await page.waitForTimeout(500);
    
    await page.locator('#descripcion').fill('Proyecto Freelance X');
    await page.locator('#valor').fill('1500000');
    await page.locator('#fecha').fill('2026-01-20');
    await page.selectOption('select#ingresoMiembro', user1Id);
    await page.waitForTimeout(500);
    await page.selectOption('select#ingresoCuenta', savingsAccountId);
    await page.selectOption('select#ingresoTipo', 'other_income');
    
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(2000);
    
    // Should navigate to Ingresos tab
    await page.waitForURL('**/?tab=ingresos*', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Modal may be dismissed quickly
    const modal2Visible = await page.locator('.modal-overlay').isVisible().catch(() => false);
    if (modal2Visible) {
      await page.locator('#modal-ok').click();
      await page.waitForTimeout(1000);
    }
    
    const freelanceResult = await pool.query(
      'SELECT id FROM income WHERE member_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1',
      [user1Id, 'other_income']
    );
    freelanceIncomeId = freelanceResult.rows[0].id;
    
    console.log('✅ Freelance income registered');

    // ==================================================================
    // STEP 6: Register Internal Movement (Savings Withdrawal)
    // ==================================================================
    console.log('📝 Step 6: Registering savings withdrawal...');
    
    await page.goto(`${appUrl}/registrar-movimiento`);
    await page.waitForTimeout(1000);
    
    // Click INGRESO button
    await page.locator('button.tipo-btn[data-tipo="INGRESO"]').click();
    await page.waitForTimeout(500);
    
    await page.locator('#descripcion').fill('Retiro para bolsillo');
    await page.locator('#valor').fill('200000');
    await page.locator('#fecha').fill('2026-01-10');
    await page.selectOption('select#ingresoMiembro', user1Id);
    await page.waitForTimeout(500);
    await page.selectOption('select#ingresoCuenta', cashAccountId);
    await page.selectOption('select#ingresoTipo', 'savings_withdrawal');
    
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(2000);
    
    // Should navigate to Ingresos tab
    await page.waitForURL('**/?tab=ingresos*', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Modal may be dismissed quickly
    const modal3Visible = await page.locator('.modal-overlay').isVisible().catch(() => false);
    if (modal3Visible) {
      await page.locator('#modal-ok').click();
      await page.waitForTimeout(1000);
    }
    
    const withdrawalResult = await pool.query(
      'SELECT id FROM income WHERE member_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1',
      [user1Id, 'savings_withdrawal']
    );
    withdrawalIncomeId = withdrawalResult.rows[0].id;
    
    console.log('✅ Savings withdrawal registered');

    // ==================================================================
    // STEP 7: Verify Incomes Appear in Ingresos Tab
    // ==================================================================
    console.log('📝 Step 7: Verifying incomes appear in Ingresos tab...');
    
    // Navigate to home first
    await page.goto(`${appUrl}/`);
    await page.waitForTimeout(2000);
    
    // Click on Ingresos tab
    await page.locator('button.tab-btn[data-tab="ingresos"]').click();
    await page.waitForTimeout(3000); // Wait for data to load
    
    // Wait for income list to be present
    await page.waitForSelector('.dashboard-content', { timeout: 5000 });
    await page.waitForTimeout(1000);
    
    // Check for income descriptions
    const salaryText = await page.locator('text=Salario Enero 2026').count();
    const freelanceText = await page.locator('text=Proyecto Freelance X').count();
    const withdrawalText = await page.locator('text=Retiro para bolsillo').count();
    
    if (salaryText === 0) {
      throw new Error('Salary income not found in Ingresos tab');
    }
    if (freelanceText === 0) {
      throw new Error('Freelance income not found in Ingresos tab');
    }
    if (withdrawalText === 0) {
      throw new Error('Withdrawal not found in Ingresos tab');
    }
    
    console.log('✅ All incomes appear in Ingresos tab');

    // ==================================================================
    // STEP 8: Edit Salary Income
    // ==================================================================
    console.log('📝 Step 8: Editing salary income...');
    
    // First, expand the category that contains the salary (should be "Sueldo" category)
    const salaryCategory = page.locator('.category-card[data-type="salary"]');
    await salaryCategory.click();
    await page.waitForTimeout(1000);
    
    // Find the salary income entry and click the three-dots menu
    const salaryEntry = page.locator('.income-detail-entry').filter({ hasText: 'Salario Enero 2026' }).first();
    const menuButton = salaryEntry.locator('.three-dots-btn');
    await menuButton.click();
    await page.waitForTimeout(500);
    
    // Click "Editar" in the menu
    const editMenuItem = page.locator('.menu-item[data-action="edit"]').first();
    await editMenuItem.click();
    await page.waitForTimeout(1000);
    
    // Should navigate to edit page
    await page.waitForURL(`**/registrar-movimiento?tipo=INGRESO&edit=${salaryIncomeId}`);
    await page.waitForTimeout(2000);
    
    // Wait for loading overlay to disappear
    try {
      await page.waitForSelector('.fullscreen-loading', { state: 'hidden', timeout: 5000 });
    } catch (e) {
      // Loading overlay may already be gone
    }
    
    // Verify page title shows "Editar Ingreso"
    const pageTitle = await page.locator('h1').textContent();
    if (!pageTitle.includes('Editar Ingreso')) {
      throw new Error(`Expected "Editar Ingreso" title, got: ${pageTitle}`);
    }
    
    // Wait for form to be populated (button text should change to "Actualizar")
    await page.waitForFunction(() => {
      const btn = document.getElementById('submitBtn');
      return btn && btn.textContent.trim() === 'Actualizar';
    }, { timeout: 5000 });
    console.log('  → Form loaded, button text is "Actualizar"');
    
    // Edit amount and description
    console.log('  → Filling amount: 5500000');
    // Clear the field first by selecting all and replacing
    await page.locator('#valor').click();
    await page.locator('#valor').press('Control+A');
    await page.locator('#valor').fill('5500000');
    
    console.log('  → Filling description: Salario Enero + Bono');
    await page.locator('#descripcion').click();
    await page.locator('#descripcion').press('Control+A');
    await page.locator('#descripcion').fill('Salario Enero + Bono');
    
    // Check button text
    const buttonText = await page.locator('#submitBtn').textContent();
    console.log(`  → Submit button text: "${buttonText}"`);
    
    // Check if form has any validation errors
    const statusEl = await page.locator('#status').textContent();
    if (statusEl) {
      console.log(`  → Status before submit: "${statusEl}"`);
    }
    
    // Submit
    console.log('  → Clicking submit button');
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(2000);
    
    // Check for errors after submit
    const statusAfter = await page.locator('#status').textContent();
    if (statusAfter) {
      console.log(`  → Status after submit: "${statusAfter}"`);
    }
    
    // Check current URL
    const currentURL = page.url();
    console.log(`  → Current URL after submit: ${currentURL}`);
    
    // Try to click modal OK button if present
    try {
      await page.waitForSelector('.modal-overlay', { state: 'visible', timeout: 3000 });
      const editModalTitle = await page.locator('.modal-title').textContent({ timeout: 1000 });
      console.log(`✓ Edit modal shown: "${editModalTitle}"`);
      await page.locator('#modal-ok').click();
      await page.waitForTimeout(500);
    } catch (e) {
      console.log('ℹ️ Edit modal not shown or already dismissed');
    }
    
    // Should navigate back to Ingresos tab
    await page.waitForURL('**/?tab=ingresos*', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    await page.waitForTimeout(1000);
    
    console.log('✅ Salary income edited successfully');

    // ==================================================================
    // STEP 9: Verify Edited Income Shows Updated Data
    // ==================================================================
    console.log('📝 Step 9: Verifying edited income shows updated data...');
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Check that the new description appears
    const updatedDescText = await page.locator('text=Salario Enero + Bono').count();
    if (updatedDescText === 0) {
      throw new Error('Updated description not found after edit');
    }
    
    // Check that the new amount appears (formatted as COP)
    const updatedAmountText = await page.locator('text=$5,500,000').count();
    if (updatedAmountText === 0) {
      throw new Error('Updated amount not found after edit');
    }
    
    // Verify in database
    const dbCheckResult = await pool.query(
      'SELECT amount, description FROM income WHERE id = $1',
      [salaryIncomeId]
    );
    const dbIncome = dbCheckResult.rows[0];
    
    if (dbIncome.amount !== 5500000) {
      throw new Error(`Expected amount 5500000, got ${dbIncome.amount}`);
    }
    if (dbIncome.description !== 'Salario Enero + Bono') {
      throw new Error(`Expected description "Salario Enero + Bono", got "${dbIncome.description}"`);
    }
    
    console.log('✅ Edited income shows correct updated data');

    // ==================================================================
    // STEP 10: Delete Withdrawal Income
    // ==================================================================
    console.log('📝 Step 10: Deleting savings withdrawal...');
    
    // Find the withdrawal card and click the three-dots menu
    const withdrawalCard = page.locator('.income-card').filter({ hasText: 'Retiro para bolsillo' }).first();
    const withdrawalMenuButton = withdrawalCard.locator('.three-dots-menu-btn');
    await withdrawalMenuButton.click();
    await page.waitForTimeout(500);
    
    // Click "Eliminar" in the menu
    const deleteButton = page.locator('.menu-option').filter({ hasText: 'Eliminar' }).first();
    await deleteButton.click();
    await page.waitForTimeout(500);
    
    // Confirm deletion in confirmation dialog
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    const confirmButton = page.locator('#modal-confirm');
    await confirmButton.click();
    await page.waitForTimeout(2000);
    
    console.log('✅ Savings withdrawal deleted');

    // ==================================================================
    // STEP 11: Verify Deletion
    // ==================================================================
    console.log('📝 Step 11: Verifying deletion...');
    
    // Reload page to ensure fresh data
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Check that withdrawal no longer appears
    const deletedText = await page.locator('text=Retiro para bolsillo').count();
    if (deletedText !== 0) {
      throw new Error('Deleted income still appears in Ingresos tab');
    }
    
    // Verify in database (should be deleted)
    const dbDeleteResult = await pool.query(
      'SELECT id FROM income WHERE id = $1',
      [withdrawalIncomeId]
    );
    
    if (dbDeleteResult.rows.length !== 0) {
      throw new Error('Income still exists in database after deletion');
    }
    
    console.log('✅ Deletion verified - income removed from UI and database');

    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    // Delete user (cascades to household, incomes, accounts, etc.)
    await pool.query('DELETE FROM users WHERE id = $1', [user1Id]);
    
    console.log('✅ Cleanup complete');
    console.log('');
    console.log('✅ ✅ ✅ ALL INCOME MANAGEMENT TESTS PASSED! ✅ ✅ ✅');

    await context.close();
    await browser.close();
    await pool.end();
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED:', error.message);
    console.error('');
    console.error(error.stack);
    
    // Capture screenshot on failure
    try {
      const page = (await browser.contexts())[0]?.pages()[0];
      if (page) {
        const screenshotPath = process.env.CI 
          ? 'test-results/income-management-failure.png'
          : '/tmp/income-management-failure.png';
        await page.screenshot({ path: screenshotPath });
        console.error('📸 Screenshot saved to:', screenshotPath);
      }
    } catch (screenshotError) {
      console.error('Failed to capture screenshot:', screenshotError.message);
    }
    
    // Cleanup on failure
    try {
      if (user1Id && pool) {
        await pool.query('DELETE FROM users WHERE id = $1', [user1Id]);
        console.log('🧹 Cleaned up test data after failure');
      }
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError.message);
    }
    
    await browser.close();
    await pool.end();
    
    process.exit(1);
  }
}

// Run the test
testIncomeManagement();
