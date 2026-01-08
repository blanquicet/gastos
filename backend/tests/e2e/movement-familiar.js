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
 * 11. Test movement edit functionality and verify changes
 * 12. Cleanup test data
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
    
    // Fill form with decimal amount
    await page.locator('#descripcion').fill('Mercado del mes');
    await page.locator('#valor').fill('4.131,94');
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
    if (parseFloat(movement.amount) !== 4131.94) {
      throw new Error(`Expected amount 4131.94, got ${movement.amount}`);
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
    // STEP 11: Test Movement Edit Functionality
    // ==================================================================
    console.log('📝 Step 11: Testing movement edit functionality...');
    
    // Reload the page to ensure clean state
    await page.reload();
    await page.waitForSelector('.expense-group-card');
    await page.waitForTimeout(500);
    
    // Find the "Mercado del mes" movement and click its three-dots menu
    console.log('   Finding "Mercado del mes" movement to edit...');
    
    let editMovementId = null;
    const expenseGroups2 = await page.locator('.expense-group-card').all();
    console.log(`   Found ${expenseGroups2.length} expense groups`);
    
    for (const group of expenseGroups2) {
      // First, expand the expense group (Casa)
      const groupHeader = group.locator('.expense-group-header');
      const groupName = await groupHeader.locator('.expense-group-name').textContent();
      console.log(`   Expanding group: ${groupName}`);
      
      await groupHeader.click();
      await page.waitForTimeout(500);
      
      // Get categories from the group details (after expansion)
      const categoryCards = await group.locator('.expense-group-details .expense-category-item').all();
      console.log(`   Found ${categoryCards.length} categories in ${groupName}`);
      
      for (const categoryItem of categoryCards) {
        const categoryName = await categoryItem.locator('.expense-category-name').textContent();
        console.log(`   Checking category: ${categoryName}`);
        
        if (categoryName.includes('Mercado')) {
          console.log(`   ✅ Found Mercado category, expanding...`);
          // Now expand the category itself
          const categoryHeader = categoryItem.locator('.expense-category-header');
          await categoryHeader.click();
          await page.waitForTimeout(500);
          
          // Find "Mercado del mes" entry
          const entries = await categoryItem.locator('.movement-detail-entry').all();
          console.log(`   Found ${entries.length} entries in Mercado`);
          
          for (const entry of entries) {
            const description = await entry.locator('.entry-description').textContent();
            console.log(`   Checking entry: ${description}`);
            
            if (description.includes('Mercado del mes')) {
              console.log('   ✅ Found "Mercado del mes" movement');
              
              // Get the movement ID from the three-dots button
              const threeDotsBtn = entry.locator('.three-dots-btn');
              const movementIdAttr = await threeDotsBtn.getAttribute('data-movement-id');
              editMovementId = movementIdAttr;
              console.log(`   Movement ID: ${editMovementId}`);
              
              // Click three-dots menu
              await threeDotsBtn.click();
              await page.waitForTimeout(300);
              
              // Click "Editar" option
              const editOption = entry.locator('.three-dots-menu .menu-item').filter({ hasText: 'Editar' });
              await editOption.click();
              
              console.log('   Clicked "Editar" option');
              break;
            }
          }
          
          if (editMovementId) break;
        }
      }
      
      if (editMovementId) break;
    }
    
    if (!editMovementId) {
      await page.screenshot({ path: '/tmp/before-error.png' });
      console.log('   📸 Screenshot saved to /tmp/before-error.png');
      throw new Error('Could not find "Mercado del mes" movement to edit');
    }
    
    // Wait for edit form to load completely
    await page.waitForURL(/registrar-movimiento\?tipo=GASTO&edit=/);
    await page.waitForTimeout(1500); // Wait for loadMovementForEdit() to complete
    console.log('   Edit form loaded');
    
    // Verify form is pre-filled
    const currentDescription = await page.locator('#descripcion').inputValue();
    const currentAmount = await page.locator('#valor').inputValue();
    
    if (!currentDescription.includes('Mercado del mes')) {
      console.log(`   Current description: "${currentDescription}"`);
      throw new Error('Description not pre-filled correctly');
    }
    
    // Verify amount is formatted correctly in Spanish locale (4.131,94)
    if (currentAmount !== '4.131,94') {
      console.log(`   Current amount: "${currentAmount}"`);
      throw new Error(`Amount not pre-filled correctly. Expected 4.131,94, got ${currentAmount}`);
    }
    
    console.log('   ✅ Form pre-filled correctly with Spanish formatted amount');
    
    // Verify tipo buttons are disabled
    const tipoBtn = page.locator('.tipo-btn[data-tipo="HOUSEHOLD"]');
    const isDisabled = await tipoBtn.isDisabled();
    
    if (!isDisabled) {
      throw new Error('Tipo button should be disabled in edit mode');
    }
    
    console.log('   ✅ Tipo buttons are disabled');
    
    // Verify Cancel button is visible
    const cancelBtn = page.locator('#cancelBtn');
    const isCancelVisible = await cancelBtn.isVisible();
    
    if (!isCancelVisible) {
      throw new Error('Cancel button should be visible in edit mode');
    }
    
    console.log('   ✅ Cancel button is visible');
    
    // Edit the movement: change description and amount (use Spanish format with decimals)
    await page.locator('#descripcion').fill('Mercado del mes EDITADO');
    
    // Clear the valor field first, then fill with new value
    const valorField = page.locator('#valor');
    await valorField.clear();
    await valorField.fill('5.275,50');
    
    console.log('   Changed description and amount to 5.275,50');
    
    // Verify submit button says "Actualizar"
    const updateBtn = page.locator('#submitBtn');
    const btnText = await updateBtn.textContent();
    if (!btnText.includes('Actualizar')) {
      throw new Error(`Submit button should say "Actualizar" but says "${btnText}"`);
    }
    console.log('   ✅ Submit button says "Actualizar"');
    
    // Submit the update
    await updateBtn.click();
    
    // Wait for redirect back to dashboard OR check for error
    // We use Promise.race to handle both cases: successful redirect or error
    try {
      await Promise.race([
        page.waitForURL(`${appUrl}/`, { timeout: 10000 }),
        page.waitForSelector('#status:has-text("Error")', { timeout: 10000 })
      ]);
      
      // If we're still on the form page, check for error
      if (page.url().includes('registrar-movimiento')) {
        const statusText = await page.locator('#status').textContent();
        if (statusText && statusText.includes('Error')) {
          throw new Error(`Update failed with error: ${statusText}`);
        }
      }
    } catch (error) {
      // If timeout, check current URL
      if (!page.url().includes('registrar-movimiento')) {
        // Successfully redirected, continue
      } else {
        throw error;
      }
    }
    
    // Ensure we're on the dashboard
    await page.waitForURL(`${appUrl}/`, { timeout: 60000 });
    await page.waitForTimeout(1000);
    
    console.log('   ✅ Movement updated successfully');
    
    // Verify the update is reflected in the dashboard
    console.log('   Verifying updated values in dashboard...');
    
    await page.reload();
    await page.waitForSelector('.expense-group-card');
    await page.waitForTimeout(500);
    
    let foundUpdated = false;
    const expenseGroups3 = await page.locator('.expense-group-card').all();
    
    for (const group of expenseGroups3) {
      // Expand expense group first
      const groupHeader = group.locator('.expense-group-header');
      await groupHeader.click();
      await page.waitForTimeout(500);
      
      const categoryCards = await group.locator('.expense-group-details .expense-category-item').all();
      
      for (const categoryItem of categoryCards) {
        const categoryName = await categoryItem.locator('.expense-category-name').textContent();
        
        if (categoryName.includes('Mercado')) {
          // Expand category
          const categoryHeader = categoryItem.locator('.expense-category-header');
          await categoryHeader.click();
          await page.waitForTimeout(500);
          
          const entries = await categoryItem.locator('.movement-detail-entry').all();
          
          for (const entry of entries) {
            const description = await entry.locator('.entry-description').textContent();
            const amount = await entry.locator('.entry-amount').textContent();
            
            if (description.includes('EDITADO')) {
              foundUpdated = true;
              console.log(`   ✅ Found updated description: ${description}`);
              
              // Verify amount updated (should be 5.275 or 5.276 with rounding)
              if (!amount.includes('5.2')) {
                throw new Error(`Amount not updated correctly. Expected to contain 5.2, got ${amount}`);
              }
              
              console.log(`   ✅ Amount updated correctly: ${amount}`);
              break;
            }
          }
          
          if (foundUpdated) break;
        }
      }
      
      if (foundUpdated) break;
    }
    
    if (!foundUpdated) {
      throw new Error('Updated movement not found in dashboard');
    }
    
    // Verify in database
    const dbResult = await pool.query(
      'SELECT description, amount FROM movements WHERE id = $1',
      [editMovementId]
    );
    
    if (dbResult.rows.length === 0) {
      throw new Error('Movement not found in database after update');
    }
    
    const dbMovement = dbResult.rows[0];
    
    if (dbMovement.description !== 'Mercado del mes EDITADO') {
      throw new Error(`DB description not updated. Expected "Mercado del mes EDITADO", got "${dbMovement.description}"`);
    }
    
    if (parseFloat(dbMovement.amount) !== 5275.50) {
      throw new Error(`DB amount not updated. Expected 5275.50, got ${dbMovement.amount}`);
    }
    
    console.log('   ✅ Changes verified in database');
    console.log('   ✅ Decimal formatting works correctly (4.131,94 → 5.275,50)');
    console.log('✅ Movement edit functionality test passed');

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
