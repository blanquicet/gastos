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
    
    // Submit form
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(3000);
    
    // Check success message
    const successStatus = await page.locator('#status').textContent();
    if (!successStatus.includes('correctamente')) {
      console.error('❌ Expected success message, got:', successStatus);
      throw new Error('SPLIT movement creation failed');
    }
    
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
    
    // Submit form
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(3000);
    
    const successStatus2 = await page.locator('#status').textContent();
    if (!successStatus2.includes('correctamente')) {
      throw new Error('Custom percentage movement creation failed');
    }
    
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
    
    // Navigate to the correct month (January 2025)
    // Keep clicking previous month until we reach January 2025
    let attempts = 0;
    while (attempts < 12) {
      const monthDisplay = await page.locator('.current-month').textContent();
      console.log('   Current month display:', monthDisplay);
      
      if (monthDisplay.includes('Enero') && monthDisplay.includes('2025')) {
        break;
      }
      
      await page.locator('.month-nav-btn:has-text("‹")').click();
      await page.waitForTimeout(500);
      attempts++;
    }
    
    // Wait for movements to load
    await page.waitForTimeout(1000);
    
    // Check if the SPLIT movement appears in the view
    const movementDescription = 'Cena en restaurante';
    
    // Log all movements for debugging
    const allMovements = await page.locator('.movement-item .movement-description').allTextContents();
    console.log('   All movements found:', allMovements);
    
    const movementVisible = await page.locator('.movement-item', { hasText: movementDescription }).count();
    
    if (movementVisible === 0) {
      throw new Error('SPLIT movement not visible in Gastos view (user is participant, should be visible)');
    }
    
    // Verify the amount shown is correct (should be user's portion: 50% of 100,000 = 50,000)
    const movementItem = page.locator('.movement-item', { hasText: movementDescription });
    const amountText = await movementItem.locator('.movement-amount').textContent();
    
    // The amount should show 50,000 (user's 50% share)
    if (!amountText.includes('50.000') && !amountText.includes('50,000')) {
      console.error('❌ Expected amount to show user portion (50,000), got:', amountText);
      throw new Error('SPLIT movement amount not correctly displayed');
    }
    
    console.log('✅ SPLIT movement correctly appears in Gastos view');
    console.log('   Movement found:', movementDescription);
    console.log('   Amount shown:', amountText, '(user\'s 50% portion)');

    // ==================================================================
    // STEP 9: Create SPLIT Movement Where User is NOT a Participant
    // ==================================================================
    console.log('📝 Step 9: Creating SPLIT movement where user is NOT a participant...');
    
    // Go back to register movement page
    await page.goto(`${appUrl}/registrar-movimiento`);
    await page.waitForTimeout(1000);
    
    // Select SPLIT type
    await page.locator('#type').selectOption('SPLIT');
    await page.waitForTimeout(500);
    
    // Fill form (movement only between contact and another future contact)
    await page.locator('#description').fill('Gasto entre contactos');
    await page.locator('#amount').fill('80000');
    await page.locator('#date').fill('2025-01-09');
    await page.locator('#category').selectOption('Alimentación');
    
    // Add only the contact as participant (not the user)
    // Uncheck equitable first
    await page.locator('#equitable').uncheck();
    await page.waitForTimeout(300);
    
    // Set contact to 100%
    const contactCheckbox = page.locator(`input[type="checkbox"][data-participant-id="${contactId}"]`);
    await contactCheckbox.check();
    await page.waitForTimeout(300);
    
    const contactPercentageInput = page.locator(`input[type="number"][data-participant-id="${contactId}"]`);
    await contactPercentageInput.fill('100');
    
    // Submit
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(3000);
    
    // Verify success
    const successStatusNonParticipant = await page.locator('#status').textContent();
    if (!successStatusNonParticipant.includes('correctamente')) {
      console.error('❌ Expected success message, got:', successStatusNonParticipant);
      throw new Error('Second SPLIT movement creation failed');
    }
    
    console.log('✅ SPLIT movement created (user not participant)');

    // ==================================================================
    // STEP 10: Verify Movement Does NOT Appear in Gastos View
    // ==================================================================
    console.log('📝 Step 10: Verifying non-participant SPLIT movement does NOT appear...');
    
    // Navigate to home page
    await page.goto(`${appUrl}/`);
    await page.waitForTimeout(1000);
    
    // Check Gastos view
    const gastosTab2 = page.locator('button[data-tab="gastos"]');
    await gastosTab2.click();
    await page.waitForTimeout(1000);
    
    // This movement should NOT be visible
    const nonParticipantMovement = 'Gasto entre contactos';
    const nonParticipantVisible = await page.locator('.movement-item', { hasText: nonParticipantMovement }).count();
    
    if (nonParticipantVisible > 0) {
      throw new Error('Non-participant SPLIT movement should NOT be visible in Gastos view');
    }
    
    console.log('✅ Non-participant SPLIT movement correctly hidden from Gastos view');

    // ==================================================================
    // STEP 11: Edit SPLIT Movement and Verify Gastos View Updates
    // ==================================================================
    console.log('📝 Step 11: Editing SPLIT movement and verifying Gastos view updates...');
    
    // Click on the first SPLIT movement to edit it
    const editMovement = page.locator('.movement-item', { hasText: movementDescription });
    
    // Click three-dots menu
    await editMovement.locator('.three-dots-btn').click();
    await page.waitForTimeout(300);
    
    // Click edit button
    await editMovement.locator('button[data-action="edit"]').click();
    await page.waitForTimeout(1000);
    
    // Should be on edit page
    await page.waitForURL('**/editar-movimiento/**');
    
    // Change the amount
    await page.locator('#amount').fill('120000');
    
    // Change the split - give user 60%, contact 40%
    await page.locator('#equitable').uncheck();
    await page.waitForTimeout(300);
    
    // Find user's percentage input
    const userCheckbox = page.locator(`input[type="checkbox"][data-participant-user-id="${userId}"]`);
    await userCheckbox.check();
    await page.waitForTimeout(300);
    
    const userPercentageInput = page.locator(`input[type="number"][data-participant-user-id="${userId}"]`);
    await userPercentageInput.fill('60');
    
    // Set contact to 40%
    const contactCheckbox2 = page.locator(`input[type="checkbox"][data-participant-id="${contactId}"]`);
    await contactCheckbox2.check();
    await page.waitForTimeout(300);
    
    const contactPercentageInput2 = page.locator(`input[type="number"][data-participant-id="${contactId}"]`);
    await contactPercentageInput2.fill('40');
    
    // Submit
    await page.locator('#submitBtn').click();
    await page.waitForTimeout(3000);
    
    // Verify success
    const editSuccess = await page.locator('#status').textContent();
    if (!editSuccess.includes('correctamente')) {
      console.error('❌ Expected success message after edit, got:', editSuccess);
      throw new Error('SPLIT movement edit failed');
    }
    
    console.log('✅ SPLIT movement edited successfully');
    
    // ==================================================================
    // STEP 12: Verify Updated Amount in Gastos View
    // ==================================================================
    console.log('📝 Step 12: Verifying updated amount appears in Gastos view...');
    
    // Navigate to home page
    await page.goto(`${appUrl}/`);
    await page.waitForTimeout(1000);
    
    // Check Gastos view
    await gastosTab.click();
    await page.waitForTimeout(1000);
    
    // Find the edited movement
    const editedMovement = page.locator('.movement-item', { hasText: movementDescription });
    const editedAmountText = await editedMovement.locator('.movement-amount').textContent();
    
    // The amount should now show 72,000 (user's 60% of 120,000)
    if (!editedAmountText.includes('72.000') && !editedAmountText.includes('72,000')) {
      console.error('❌ Expected updated amount to show 72,000 (60% of 120,000), got:', editedAmountText);
      throw new Error('SPLIT movement amount not correctly updated in Gastos view');
    }
    
    console.log('✅ Updated SPLIT movement amount correctly shown in Gastos view');
    console.log('   New amount shown:', editedAmountText, '(user\'s 60% of 120,000)');

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
