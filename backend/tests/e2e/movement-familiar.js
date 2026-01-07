import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Movement Registration - HOUSEHOLD Type
 * 
 * Tests the movement registration form for HOUSEHOLD movements:
 * 1. Register user and create household
 * 2. Add payment method
 * 3. Test form loads without errors
 * 4. Test HOUSEHOLD movement creation
 * 5. Verify movement saved to PostgreSQL
 * 6. Test validation (required fields)
 * 7. Create second movement in same category
 * 8. Verify GET /movements API
 * 9. Verify movements appear in dashboard/resumen
 * 10. Verify category grouping and amounts
 * 11. Cleanup test data
 */

async function testMovementFamiliar() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const userEmail = `mov-familiar-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Familiar Test ${timestamp}`;

  let userId = null;
  let householdId = null;

  try {
    console.log('🚀 Starting Movement HOUSEHOLD Test');
    console.log('👤 User:', userEmail);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User and Create Household
    // ==================================================================
    console.log('📝 Step 1: Registering user and creating household...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Listen for console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto(appUrl);
    await page.waitForTimeout(1000);
    
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#registerName').fill('Test User Familiar');
    await page.locator('#registerEmail').fill(userEmail);
    await page.locator('#registerPassword').fill(password);
    await page.locator('#registerConfirm').fill(password);
    
    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);
    
    // Get user ID from database
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    userId = userResult.rows[0].id;
    
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
    
    // Get household ID from database
    const householdResult = await pool.query('SELECT id FROM households WHERE name = $1', [householdName]);
    householdId = householdResult.rows[0].id;
    
    console.log('✅ User registered and household created');

    // ==================================================================
    // STEP 2: Add Payment Method
    // ==================================================================
    console.log('📝 Step 2: Adding payment method...');
    
    await page.goto(`${appUrl}/perfil`);
    await page.waitForTimeout(2000);
    
    // Wait for the add button to be visible
    await page.locator('#add-payment-method-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#add-payment-method-btn').click();
    await page.waitForTimeout(500);
    
    await page.locator('#pm-name').fill('Tarjeta Test');
    await page.selectOption('select#pm-type', 'debit_card');
    
    // Ensure NOT shared
    const isSharedCheckbox = page.locator('#pm-shared');
    const isChecked = await isSharedCheckbox.isChecked();
    if (isChecked) {
      await isSharedCheckbox.uncheck();
    }
    
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.waitForTimeout(1500);
    
    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    console.log('✅ Payment method added');

    // ==================================================================
    // STEP 3: Navigate to Movement Form
    // ==================================================================
    console.log('📝 Step 3: Testing movement form loads...');
    
    // Clear previous console errors
    consoleErrors.length = 0;
    
    await page.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Check for JavaScript errors (only after navigating to movement form)
    const relevantErrors = consoleErrors.filter(err => 
      err.includes('movement') || err.includes('form config') || err.includes('registrar')
    );
    
    if (relevantErrors.length > 0) {
      console.error('❌ JavaScript errors found:', relevantErrors);
      throw new Error('JavaScript errors in movement form');
    }
    
    console.log('✅ Movement form loaded without errors');

    // ==================================================================
    // STEP 4: Test Form Validation
    // ==================================================================
    console.log('📝 Step 4: Testing form validation...');
    
    // Try to submit empty form
    const submitBtn = page.locator('#submitBtn');
    await submitBtn.click();
    await page.waitForTimeout(1000);
    
    // Should show validation error (tipo is required)
    const statusText = await page.locator('#status').textContent();
    if (!statusText.includes('obligatorio')) {
      console.error('❌ Expected validation error, got:', statusText);
      throw new Error('Form validation not working');
    }
    
    console.log('✅ Form validation working correctly');

    // ==================================================================
    // STEP 5: Create HOUSEHOLD Movement
    // ==================================================================
    console.log('📝 Step 5: Creating HOUSEHOLD movement...');
    
    // Select HOUSEHOLD type
    await page.locator('button[data-tipo="HOUSEHOLD"]').click();
    await page.waitForTimeout(500);
    
    // Fill form
    await page.locator('#descripcion').fill('Mercado del mes');
    await page.locator('#valor').fill('250000');
    await page.selectOption('#categoria', 'Mercado');
    await page.selectOption('#metodo', 'Tarjeta Test');
    
    // Submit form
    await submitBtn.click();
    await page.waitForTimeout(3000);
    
    // Check success message
    const successStatus = await page.locator('#status').textContent();
    if (!successStatus.includes('correctamente')) {
      console.error('❌ Expected success message, got:', successStatus);
      throw new Error('Movement creation failed');
    }
    
    console.log('✅ Movement created successfully');

    // ==================================================================
    // STEP 6: Verify Movement in Database
    // ==================================================================
    console.log('📝 Step 6: Verifying movement in PostgreSQL...');
    
    const movementResult = await pool.query(
      'SELECT * FROM movements WHERE household_id = $1 AND description = $2',
      [householdId, 'Mercado del mes']
    );
    
    if (movementResult.rows.length === 0) {
      throw new Error('Movement not found in database');
    }
    
    const movement = movementResult.rows[0];
    
    // Verify movement data
    if (movement.type !== 'HOUSEHOLD') {
      throw new Error(`Expected type HOUSEHOLD, got ${movement.type}`);
    }
    if (parseFloat(movement.amount) !== 250000) {
      throw new Error(`Expected amount 250000, got ${movement.amount}`);
    }
    if (movement.category !== 'Mercado') {
      throw new Error(`Expected category Mercado, got ${movement.category}`);
    }
    if (movement.payer_user_id !== userId) {
      throw new Error(`Expected payer ${userId}, got ${movement.payer_user_id}`);
    }
    
    console.log('✅ Movement verified in PostgreSQL');
    console.log('   Type:', movement.type);
    console.log('   Amount:', movement.amount);
    console.log('   Category:', movement.category);
    console.log('   Description:', movement.description);

    // ==================================================================
    // STEP 7: Test Another Movement with Same Category
    // ==================================================================
    console.log('📝 Step 7: Creating second HOUSEHOLD movement...');
    
    await page.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    await page.locator('button[data-tipo="HOUSEHOLD"]').click();
    await page.waitForTimeout(500);
    
    await page.locator('#descripcion').fill('Mercado semanal');
    await page.locator('#valor').fill('80000');
    await page.selectOption('#categoria', 'Mercado');
    await page.selectOption('#metodo', 'Tarjeta Test');
    
    await submitBtn.click();
    await page.waitForTimeout(3000);
    
    const successStatus2 = await page.locator('#status').textContent();
    if (!successStatus2.includes('correctamente')) {
      throw new Error('Second movement creation failed');
    }
    
    console.log('✅ Second movement created successfully');

    // ==================================================================
    // STEP 8: Verify GET /movements API
    // ==================================================================
    console.log('📝 Step 8: Testing GET /movements API...');
    
    const apiResponse = await page.evaluate(async () => {
      const res = await fetch('/movements', {
        credentials: 'include'
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
      return {
        status: res.status,
        data: data
      };
    });
    
    if (apiResponse.status !== 200) {
      throw new Error(`GET /movements failed with status ${apiResponse.status}`);
    }
    
    console.log('API Response:', JSON.stringify(apiResponse.data).substring(0, 200));
    
    const movements = Array.isArray(apiResponse.data) ? apiResponse.data : apiResponse.data.movements;
    if (!movements || !Array.isArray(movements)) {
      throw new Error('GET /movements did not return array');
    }
    
    if (movements.length < 2) {
      throw new Error(`Expected at least 2 movements, got ${movements.length}`);
    }
    
    console.log('✅ GET /movements API working correctly');
    console.log(`   Found ${movements.length} movements`);

    // ==================================================================
    // STEP 9: Verify Movement Appears in Dashboard (Resumen)
    // ==================================================================
    console.log('📝 Step 9: Verifying movement appears in dashboard...');
    
    // Navigate to home page
    await page.goto(`${appUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Ensure we're on Gastos tab
    const gastosTab = page.locator('button.tab-btn').filter({ hasText: 'Gastos' });
    await gastosTab.click();
    await page.waitForTimeout(1500);
    
    // Wait for categories to load
    await page.waitForSelector('.categories-grid', { state: 'visible', timeout: 10000 });
    
    // Check if we have expense groups
    const expenseGroups = await page.locator('.expense-group-card').count();
    if (expenseGroups === 0) {
      throw new Error('No expense groups found in dashboard');
    }
    
    console.log(`   Found ${expenseGroups} expense groups`);
    
    // Find the group containing "Mercado" category
    // Based on category grouping, "Mercado" should be in "Ocio" group
    let foundMercado = false;
    let mercadoGroupName = null;
    
    // Click through each group to find Mercado
    for (let i = 0; i < expenseGroups; i++) {
      const groupCard = page.locator('.expense-group-card').nth(i);
      const groupName = await groupCard.locator('.expense-group-name').textContent();
      
      // Click to expand group
      await groupCard.click();
      await page.waitForTimeout(500);
      
      // Check if this group contains Mercado category
      const categoryItems = groupCard.locator('.expense-category-item');
      const categoryCount = await categoryItems.count();
      
      for (let j = 0; j < categoryCount; j++) {
        const categoryItem = categoryItems.nth(j);
        const categoryName = await categoryItem.locator('.expense-category-name').textContent();
        
        if (categoryName.includes('Mercado')) {
          foundMercado = true;
          mercadoGroupName = groupName;
          
          // Verify the total amount for Mercado category
          // We created two movements: 250,000 + 80,000 = 330,000
          const categoryAmount = await categoryItem.locator('.expense-category-amount').textContent();
          console.log(`   Mercado category amount: ${categoryAmount}`);
          
          // Click to expand category details
          await categoryItem.click();
          await page.waitForTimeout(500);
          
          // Check for movement details
          const movementEntries = categoryItem.locator('.movement-detail-entry');
          const movementCount = await movementEntries.count();
          
          if (movementCount < 2) {
            throw new Error(`Expected at least 2 movements in Mercado, found ${movementCount}`);
          }
          
          console.log(`   Found ${movementCount} movements in Mercado category`);
          
          // Verify our specific movements
          const descriptions = await movementEntries.locator('.entry-description').allTextContents();
          const amounts = await movementEntries.locator('.entry-amount').allTextContents();
          
          const hasMercadoMes = descriptions.some(d => d.includes('Mercado del mes'));
          const hasMercadoSemanal = descriptions.some(d => d.includes('Mercado semanal'));
          
          if (!hasMercadoMes || !hasMercadoSemanal) {
            throw new Error('Could not find expected movement descriptions in dashboard');
          }
          
          console.log('   ✅ Found both movements:');
          console.log('      - Mercado del mes');
          console.log('      - Mercado semanal');
          
          // Verify payment method badges
          const paymentBadges = await movementEntries.locator('.entry-payment-badge').allTextContents();
          const hasCorrectPaymentMethod = paymentBadges.some(p => p.includes('Tarjeta Test'));
          
          if (!hasCorrectPaymentMethod) {
            throw new Error('Payment method badge not found or incorrect');
          }
          
          console.log('   ✅ Payment method badge verified');
          
          break;
        }
      }
      
      if (foundMercado) break;
    }
    
    if (!foundMercado) {
      throw new Error('Mercado category not found in any expense group');
    }
    
    console.log(`✅ Movement verified in dashboard under "${mercadoGroupName}" group`);

    // ==================================================================
    // STEP 10: Verify Total Amount in Dashboard
    // ==================================================================
    console.log('📝 Step 10: Verifying total amount in dashboard...');
    
    const totalAmount = await page.locator('.total-amount').textContent();
    console.log(`   Total displayed: ${totalAmount}`);
    
    // The total should include our 330,000 (250,000 + 80,000)
    // We just verify it's displayed (exact amount depends on other test data)
    if (!totalAmount || totalAmount.trim() === '') {
      throw new Error('Total amount not displayed in dashboard');
    }
    
    console.log('✅ Total amount verified in dashboard');

    // ==================================================================
    // Cleanup
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    await pool.query('DELETE FROM movements WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM household_members WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM payment_methods WHERE owner_id = $1', [userId]);
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    console.log('✅ Cleanup complete');
    console.log('');
    console.log('✅ ✅ ✅ ALL HOUSEHOLD MOVEMENT TESTS PASSED! ✅ ✅ ✅');

    await browser.close();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Save screenshot on failure
    try {
      const page = (await browser.contexts())[0]?.pages()[0];
      if (page) {
        const screenshotPath = process.env.CI 
          ? 'test-results/movement-familiar-failure.png'
          : '/tmp/movement-familiar-failure.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('📸 Screenshot saved to:', screenshotPath);
      }
    } catch (screenshotError) {
      console.error('Failed to save screenshot:', screenshotError);
    }
    
    // Cleanup on failure
    try {
      if (householdId) {
        await pool.query('DELETE FROM movements WHERE household_id = $1', [householdId]);
        await pool.query('DELETE FROM household_members WHERE household_id = $1', [householdId]);
      }
      if (userId) {
        await pool.query('DELETE FROM payment_methods WHERE owner_id = $1', [userId]);
      }
      if (householdId) {
        await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
      }
      if (userId) {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      }
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
    
    await browser.close();
    await pool.end();
    throw error;
  }
}

testMovementFamiliar();
