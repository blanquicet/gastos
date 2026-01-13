import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Movement Registration - SPLIT Type
 * 
 * Tests the movement registration form for SPLIT movements:
 * 1. Register user and create household with contacts
 * 2. Add payment method
 * 3. Test SPLIT movement creation with participants
 * 4. Test equitable split
 * 5. Test custom percentages
 * 6. Test validation (percentages must sum 100%)
 * 7. Verify participants saved to database
 * 8. Cleanup test data
 */

/**
 * Helper: Submit form and handle success modal
 */
async function submitFormAndConfirm(page) {
  // Click submit button
  const submitBtn = page.locator('#submitBtn');
  await submitBtn.click();
  
  // Wait for success modal to appear
  await page.waitForSelector('.modal-overlay', { timeout: 5000 });
  
  // Click OK button in modal
  await page.locator('#modal-ok').click();
  
  // Wait for modal to close
  await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
}

async function testMovementCompartido() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const userEmail = `mov-compartido-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Compartido Test ${timestamp}`;

  let userId = null;
  let householdId = null;
  let contactId = null;

  try {
    console.log('🚀 Starting Movement SPLIT Test');
    console.log('👤 User:', userEmail);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User and Create Household
    // ==================================================================
    console.log('📝 Step 1: Registering user and creating household...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Listen for console messages
    const consoleErrors = [];
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      } else if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });
    
    await page.goto(appUrl);
    await page.waitForTimeout(1000);
    
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#registerName').fill('Test User Split');
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
    // STEP 2: Add Contact
    // ==================================================================
    console.log('📝 Step 2: Adding contact...');
    
    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);
    
    await page.getByRole('button', { name: '+ Agregar contacto' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#contact-name').fill('María External');
    await page.locator('#contact-email').fill('maria@example.com');
    
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.waitForTimeout(3000); // Wait for reload
    
    // Get contact ID from database
    const contactResult = await pool.query(
      'SELECT id FROM contacts WHERE household_id = $1 AND name = $2',
      [householdId, 'María External']
    );
    contactId = contactResult.rows[0].id;
    
    console.log('✅ Contact added');

    // ==================================================================
    // STEP 3: Add Payment Method
    // ==================================================================
    console.log('📝 Step 3: Adding payment method...');
    
    await page.goto(`${appUrl}/perfil`);
    await page.waitForTimeout(2000);
    
    // Wait for the add button to be visible
    await page.locator('#add-payment-method-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#add-payment-method-btn').click();
    await page.waitForTimeout(500);
    
    await page.locator('#pm-name').fill('Efectivo Test');
    await page.selectOption('select#pm-type', 'cash');
    
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
    // STEP 3.5: Create Category Groups and Categories
    // ==================================================================
    console.log('📝 Step 3.5: Creating category groups and categories...');
    
    // Create category group "Casa"
    const categoryGroupResult = await pool.query(`
      INSERT INTO category_groups (household_id, name, icon, display_order)
      VALUES ($1, 'Casa', '🏠', 1)
      RETURNING id
    `, [householdId]);
    const categoryGroupId = categoryGroupResult.rows[0].id;
    
    // Create "Mercado" category
    await pool.query(`
      INSERT INTO categories (household_id, name, category_group_id, display_order)
      VALUES ($1, 'Mercado', $2, 1)
    `, [householdId, categoryGroupId]);
    
    console.log('✅ Category groups and categories created');

    // ==================================================================
    // STEP 4: Create SPLIT Movement (Equitable Split)
    // ==================================================================
    console.log('📝 Step 4: Creating SPLIT movement with equitable split...');
    
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
    
    // Select SPLIT type
    await page.locator('button[data-tipo="SPLIT"]').click();
    await page.waitForTimeout(500);
    
    // Fill form
    await page.locator('#descripcion').fill('Cena en restaurante');
    await page.locator('#valor').fill('100000');
    await page.selectOption('#categoria', 'Mercado');
    await page.selectOption('#pagadorCompartido', 'Test User Split');
    await page.waitForTimeout(500);
    await page.selectOption('#metodo', 'Efectivo Test');
    
    // Add participant (María)
    await page.locator('#addParticipantBtn').click();
    await page.waitForTimeout(500);
    
    // Select María in the second participant dropdown
    const participantSelects = await page.locator('#participantsList select').all();
    if (participantSelects.length >= 2) {
      await participantSelects[1].selectOption('María External');
      await page.waitForTimeout(500);
    }
    
    // Verify equitable checkbox is checked
    const equitableChecked = await page.locator('#equitable').isChecked();
    if (!equitableChecked) {
      throw new Error('Equitable checkbox should be checked by default');
    }
    
    // Submit form and confirm modal
    await submitFormAndConfirm(page);
    
    // Wait for navigation back to home
    await page.waitForURL('**/', { timeout: 5000 });
    await page.waitForTimeout(1000);
    
    console.log('✅ SPLIT movement created successfully');

    // ==================================================================
    // STEP 5: Verify Movement and Participants in Database
    // ==================================================================
    console.log('📝 Step 5: Verifying movement and participants in PostgreSQL...');
    
    const movementResult = await pool.query(
      'SELECT * FROM movements WHERE household_id = $1 AND description = $2',
      [householdId, 'Cena en restaurante']
    );
    
    if (movementResult.rows.length === 0) {
      throw new Error('Movement not found in database');
    }
    
    const movement = movementResult.rows[0];
    
    // Verify movement data
    if (movement.type !== 'SPLIT') {
      throw new Error(`Expected type SPLIT, got ${movement.type}`);
    }
    if (parseFloat(movement.amount) !== 100000) {
      throw new Error(`Expected amount 100000, got ${movement.amount}`);
    }
    
    // Verify participants
    const participantsResult = await pool.query(
      'SELECT * FROM movement_participants WHERE movement_id = $1 ORDER BY percentage DESC',
      [movement.id]
    );
    
    if (participantsResult.rows.length !== 2) {
      throw new Error(`Expected 2 participants, got ${participantsResult.rows.length}`);
    }
    
    // Should be 50/50 split
    const participant1 = participantsResult.rows[0];
    const participant2 = participantsResult.rows[1];
    
    if (Math.abs(participant1.percentage - 0.5) > 0.01) {
      throw new Error(`Expected participant 1 percentage 0.5, got ${participant1.percentage}`);
    }
    if (Math.abs(participant2.percentage - 0.5) > 0.01) {
      throw new Error(`Expected participant 2 percentage 0.5, got ${participant2.percentage}`);
    }
    
    // Verify one participant is user, other is contact
    const hasUser = participantsResult.rows.some(p => p.participant_user_id === userId);
    const hasContact = participantsResult.rows.some(p => p.participant_contact_id === contactId);
    
    if (!hasUser) {
      throw new Error('User not found in participants');
    }
    if (!hasContact) {
      throw new Error('Contact not found in participants');
    }
    
    console.log('✅ Movement and participants verified in PostgreSQL');
    console.log('   Type:', movement.type);
    console.log('   Amount:', movement.amount);
    console.log('   Participants:', participantsResult.rows.length);
    console.log('   Split: 50% / 50%');

    // ==================================================================
    // STEP 6: Create SPLIT with Custom Percentages
    // ==================================================================
    console.log('📝 Step 6: Creating SPLIT with custom percentages...');
    
    await page.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    await page.locator('button[data-tipo="SPLIT"]').click();
    await page.waitForTimeout(500);
    
    await page.locator('#descripcion').fill('Almuerzo dividido desigual');
    await page.locator('#valor').fill('80000');
    await page.selectOption('#categoria', 'Mercado');
    await page.selectOption('#pagadorCompartido', 'Test User Split');
    await page.waitForTimeout(500);
    await page.selectOption('#metodo', 'Efectivo Test');
    
    // Add participant
    await page.locator('#addParticipantBtn').click();
    await page.waitForTimeout(500);
    
    const participantSelects2 = await page.locator('#participantsList select').all();
    if (participantSelects2.length >= 2) {
      await participantSelects2[1].selectOption('María External');
      await page.waitForTimeout(500);
    }
    
    // Uncheck equitable to enable custom percentages
    await page.locator('#equitable').uncheck();
    await page.waitForTimeout(500);
    
    // Set custom percentages: 70% / 30%
    const pctInputs = await page.locator('#participantsList input[type="number"]').all();
    if (pctInputs.length >= 2) {
      await pctInputs[0].fill('70');
      await pctInputs[1].fill('30');
      await page.waitForTimeout(500);
    }
    
    // Submit form and confirm modal
    await submitFormAndConfirm(page);
    
    // Wait for navigation back to home
    await page.waitForURL('**/', { timeout: 5000 });
    await page.waitForTimeout(1000);
    
    console.log('✅ Custom percentage movement created');

    // Verify custom percentages in database
    const movement2Result = await pool.query(
      'SELECT * FROM movements WHERE household_id = $1 AND description = $2',
      [householdId, 'Almuerzo dividido desigual']
    );
    
    const movement2 = movement2Result.rows[0];
    const participants2Result = await pool.query(
      'SELECT * FROM movement_participants WHERE movement_id = $1 ORDER BY percentage DESC',
      [movement2.id]
    );
    
    if (Math.abs(participants2Result.rows[0].percentage - 0.7) > 0.01) {
      throw new Error(`Expected 70%, got ${participants2Result.rows[0].percentage * 100}%`);
    }
    if (Math.abs(participants2Result.rows[1].percentage - 0.3) > 0.01) {
      throw new Error(`Expected 30%, got ${participants2Result.rows[1].percentage * 100}%`);
    }
    
    console.log('✅ Custom percentages verified: 70% / 30%');

    // ==================================================================
    // STEP 7: Test Validation (Percentages Must Sum 100%)
    // ==================================================================
    console.log('📝 Step 7: Testing percentage validation...');
    
    await page.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    await page.locator('button[data-tipo="SPLIT"]').click();
    await page.waitForTimeout(500);
    
    await page.locator('#descripcion').fill('Test validation');
    await page.locator('#valor').fill('50000');
    await page.selectOption('#categoria', 'Mercado');
    await page.selectOption('#pagadorCompartido', 'Test User Split');
    await page.waitForTimeout(500);
    await page.selectOption('#metodo', 'Efectivo Test');
    
    await page.locator('#addParticipantBtn').click();
    await page.waitForTimeout(500);
    
    const participantSelects3 = await page.locator('#participantsList select').all();
    if (participantSelects3.length >= 2) {
      await participantSelects3[1].selectOption('María External');
      await page.waitForTimeout(500);
    }
    
    // Set invalid percentages (don't sum to 100%)
    await page.locator('#equitable').uncheck();
    await page.waitForTimeout(500);
    
    const pctInputs3 = await page.locator('#participantsList input[type="number"]').all();
    if (pctInputs3.length >= 2) {
      await pctInputs3[0].fill('40');
      await pctInputs3[1].fill('30');
      await page.waitForTimeout(500);
    }
    
    // Try to submit - should fail
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(1000);
    
    // Should show validation error
    const validationStatus = await page.locator('#status').textContent();
    if (!validationStatus.includes('100%') && !validationStatus.includes('100')) {
      console.error('❌ Expected percentage validation error, got:', validationStatus);
      throw new Error('Percentage validation not working');
    }
    
    console.log('✅ Percentage validation working correctly');

    // ==================================================================
    // STEP 8: Verify SPLIT Movement Appears in Gastos View
    // ==================================================================
    console.log('📝 Step 8: Verifying SPLIT movement appears in Gastos view...');
    
    // Navigate to home page
    await page.goto(`${appUrl}/`);
    await page.waitForTimeout(2000);
    
    // Make sure we're on the Gastos tab
    const gastosTab = page.locator('button[data-tab="gastos"]');
    if (!await gastosTab.locator('.active').count()) {
      await gastosTab.click();
      await page.waitForTimeout(1000);
    }
    
    // The movement should be in the current month (default date is today)
    // Wait for movements to load
    await page.waitForTimeout(1000);
    
    // First expand the "Casa" group that contains "Mercado"
    const casaGroup = page.locator('.expense-group-card[data-group="Casa"]');
    const casaHeader = casaGroup.locator('.expense-group-header');
    await casaHeader.click();
    await page.waitForTimeout(500);
    
    // Then expand the "Mercado" category to see movements
    const mercadoCategory = page.locator('.expense-category-item[data-category="Mercado"]');
    const mercadoHeader = mercadoCategory.locator('.expense-category-header');
    await mercadoHeader.click();
    await page.waitForTimeout(500);
    
    // Check if the SPLIT movement appears in the view
    const movementDescription = 'Cena en restaurante';
    
    // Log all movements for debugging
    const allMovements = await page.locator('.movement-detail-entry .entry-description').allTextContents();
    console.log('   All movements found:', allMovements);
    
    const movementVisible = await page.locator('.movement-detail-entry', { hasText: movementDescription }).count();
    
    if (movementVisible === 0) {
      throw new Error('SPLIT movement not visible in Gastos view (user is participant, should be visible)');
    }
    
    // Verify the amount shown is correct (should be user's portion: 50% of 100,000 = 50,000)
    const movementItem = page.locator('.movement-detail-entry', { hasText: movementDescription });
    const amountText = await movementItem.locator('.entry-amount').textContent();
    
    // The amount should show 50,000 (user's 50% share)
    if (!amountText.includes('50.000') && !amountText.includes('50,000')) {
      console.error('❌ Expected amount to show user portion (50,000), got:', amountText);
      throw new Error('SPLIT movement amount not correctly displayed');
    }
    
    console.log('✅ SPLIT movement correctly appears in Gastos view');
    console.log('   Movement found:', movementDescription);
    console.log('   Amount shown:', amountText, '(user\'s 50% portion)');

    // ==================================================================
    // STEP 9: Test Exact Amount Preservation (Values instead of Percentages)
    // ==================================================================
    console.log('📝 Step 9: Testing exact amount preservation with values...');
    
    // Clear console logs to capture only this step
    consoleLogs.length = 0;
    
    await page.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Select SPLIT type
    await page.locator('button[data-tipo="SPLIT"]').click();
    await page.waitForTimeout(500);
    
    // Fill form with exact values from the reported issue
    await page.locator('#descripcion').fill('Test percentage precision');
    await page.locator('#valor').fill('720000');
    await page.selectOption('#categoria', 'Mercado');
    await page.selectOption('#pagadorCompartido', 'Test User Split');
    await page.waitForTimeout(500);
    await page.selectOption('#metodo', 'Efectivo Test');
    
    // Add participant (María)
    await page.locator('#addParticipantBtn').click();
    await page.waitForTimeout(500);
    
    const participantSelects4 = await page.locator('#participantsList select').all();
    if (participantSelects4.length >= 2) {
      await participantSelects4[1].selectOption('María External');
      await page.waitForTimeout(500);
    }
    
    // Uncheck equitable to use custom values
    await page.locator('#equitable').uncheck();
    await page.waitForTimeout(500);
    
    // Enable "Mostrar como valor" to enter exact COP amounts
    await page.locator('#showAsValue').check();
    await page.waitForTimeout(500);
    
    // Enter exact amounts: Test User Split = 620,000, María = 100,000
    // These should add up to 720,000 (total)
    const amountInputs = await page.locator('#participantsList input[type="text"]').all();
    if (amountInputs.length >= 2) {
      // First participant (Test User Split) - need to clear and fill with Spanish format
      await amountInputs[0].click();
      await amountInputs[0].press('Control+A');
      await amountInputs[0].fill('620000');
      await amountInputs[0].blur();
      await page.waitForTimeout(300);
      
      // Second participant (María) 
      await amountInputs[1].click();
      await amountInputs[1].press('Control+A');
      await amountInputs[1].fill('100000');
      await amountInputs[1].blur();
      await page.waitForTimeout(300);
    }
    
    // Submit form and confirm modal
    await submitFormAndConfirm(page);
    
    // Wait for navigation back to home
    await page.waitForURL('**/', { timeout: 5000 });
    await page.waitForTimeout(1000);
    
    console.log('✅ Exact amount movement created');
    
    // Print console logs to see the payload
    const payloadLog = consoleLogs.find(log => log.includes('Creating movement with payload'));
    if (payloadLog) {
      console.log('   Frontend payload:', payloadLog);
    }
    
    // Verify amounts are stored correctly in database with amount field
    const movement3Result = await pool.query(
      'SELECT id, amount FROM movements WHERE household_id = $1 AND description = $2',
      [householdId, 'Test percentage precision']
    );
    
    const movement3 = movement3Result.rows[0];
    const participants3Result = await pool.query(
      `SELECT mp.percentage, mp.amount, 
              mp.participant_user_id, mp.participant_contact_id,
              COALESCE(u.name, c.name) as participant_name
       FROM movement_participants mp
       LEFT JOIN users u ON mp.participant_user_id = u.id
       LEFT JOIN contacts c ON mp.participant_contact_id = c.id
       WHERE mp.movement_id = $1
       ORDER BY mp.amount DESC NULLS LAST, mp.percentage DESC`,
      [movement3.id]
    );
    
    console.log('   Movement amount:', movement3.amount);
    console.log('   Participants:');
    participants3Result.rows.forEach(p => {
      console.log(`     - ${p.participant_name}: percentage=${p.percentage}, amount=${p.amount}`);
    });
    
    // Find Test User Split and María participants
    const testUserPart = participants3Result.rows.find(p => p.participant_name === 'Test User Split');
    const mariaPart = participants3Result.rows.find(p => p.participant_name === 'María External');
    
    if (!testUserPart || !mariaPart) {
      throw new Error('Could not find both participants in database');
    }
    
    // Verify the amount field is set (not null)
    if (testUserPart.amount === null || mariaPart.amount === null) {
      throw new Error('Amount field should be set when entering values (not null)');
    }
    
    // Verify exact amounts are stored
    if (Math.abs(testUserPart.amount - 620000) > 0.01) {
      throw new Error(`Expected Test User amount to be 620000, got ${testUserPart.amount}`);
    }
    
    if (Math.abs(mariaPart.amount - 100000) > 0.01) {
      throw new Error(`Expected María amount to be 100000, got ${mariaPart.amount}`);
    }
    
    console.log('✅ Exact amounts stored in database');
    console.log('   Test User Split: 620,000.00 ✓');
    console.log('   María External: 100,000.00 ✓');
    console.log('   Total: 720,000.00 ✓');
    console.log('');
    console.log('   ✅ PRECISION FIX VERIFIED:');
    console.log('   - Frontend sends exact amounts when "Mostrar como valor" is checked');
    console.log('   - Backend correctly stores amounts in database');
    console.log('   - No precision loss (0 COP error instead of 8 COP)');
    console.log('   - Amounts preserved with full precision in database');

    // ==================================================================
    // Cleanup
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    await pool.query('DELETE FROM movement_participants WHERE movement_id IN (SELECT id FROM movements WHERE household_id = $1)', [householdId]);
    await pool.query('DELETE FROM movements WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM contacts WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM household_members WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM payment_methods WHERE owner_id = $1', [userId]);
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    console.log('✅ Cleanup complete');
    console.log('');
    console.log('✅ ✅ ✅ ALL SPLIT MOVEMENT TESTS PASSED! ✅ ✅ ✅');

    await browser.close();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Save screenshot on failure
    try {
      const page = (await browser.contexts())[0]?.pages()[0];
      if (page) {
        const screenshotPath = process.env.CI 
          ? 'test-results/movement-compartido-failure.png'
          : '/tmp/movement-compartido-failure.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('📸 Screenshot saved to:', screenshotPath);
      }
    } catch (screenshotError) {
      console.error('Failed to save screenshot:', screenshotError);
    }
    
    // Cleanup on failure
    try {
      if (householdId) {
        await pool.query('DELETE FROM movement_participants WHERE movement_id IN (SELECT id FROM movements WHERE household_id = $1)', [householdId]);
        await pool.query('DELETE FROM movements WHERE household_id = $1', [householdId]);
        await pool.query('DELETE FROM contacts WHERE household_id = $1', [householdId]);
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

testMovementCompartido();
