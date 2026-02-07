import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Movement Registration - DEBT_PAYMENT Type
 * 
 * Tests the movement registration form for DEBT_PAYMENT movements:
 * 1. Register two users and create household
 * 2. Add payment method
 * 3. Add contact
 * 4. Test DEBT_PAYMENT movement creation (member to member)
 * 5. Test DEBT_PAYMENT movement creation (member to contact)
 * 6. Test validation (pagador != tomador)
 * 7. Verify movements saved to database
 * 8. Cleanup test data
 */

/**
 * Helper: Submit form and handle success modal
 */
async function submitFormAndConfirm(page) {
  // Click submit button
  const submitBtn = page.locator('#submitBtn');
  await submitBtn.click();
  
  // Wait for either success modal or error message (ignore "Registrando..." status)
  try {
    await page.waitForSelector('.modal-overlay', { timeout: 15000 });
  } catch (error) {
    // If modal doesn't appear, check for error in status
    const statusText = await page.locator('#status').textContent();
    if (statusText && statusText.trim() !== '' && !statusText.includes('Registrando')) {
      console.error('❌ Form submission error:', statusText);
      throw new Error(`Form submission failed: ${statusText}`);
    }
    throw error; // Re-throw original timeout error
  }
  
  // Click OK button in modal
  await page.locator('#modal-ok').click();
  
  // Wait for modal to close
  await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
}

async function testMovementPagoDeuda() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const user1Email = `mov-debt-user1-${timestamp}@example.com`;
  const user2Email = `mov-debt-user2-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Debt Test ${timestamp}`;

  let user1Id = null;
  let user2Id = null;
  let householdId = null;
  let contactId = null;

  try {
    console.log('🚀 Starting Movement DEBT_PAYMENT Test');
    console.log('👤 User 1:', user1Email);
    console.log('👤 User 2:', user2Email);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User 1 and Create Household
    // ==================================================================
    console.log('📝 Step 1: Registering User 1 and creating household...');
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    
    await page1.goto(appUrl);
    await page1.waitForTimeout(1000);
    
    await page1.getByRole('link', { name: 'Regístrate' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#registerName').fill('User One Debt');
    await page1.locator('#registerEmail').fill(user1Email);
    await page1.locator('#registerPassword').fill(password);
    await page1.locator('#registerConfirm').fill(password);
    
    await page1.getByRole('button', { name: 'Registrarse' }).click();
    await page1.waitForTimeout(2000);
    
    // Get user ID from database
    const user1Result = await pool.query('SELECT id FROM users WHERE email = $1', [user1Email]);
    user1Id = user1Result.rows[0].id;
    
    // Create household
    await page1.locator('#hamburger-btn').click();
    await page1.waitForTimeout(500);
    await page1.getByRole('link', { name: 'Perfil' }).click();
    await page1.waitForTimeout(1000);
    
    await page1.getByRole('button', { name: 'Crear hogar' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#household-name-input').fill(householdName);
    await page1.locator('#household-create-btn').click();
    await page1.waitForTimeout(1000);
    await page1.locator('#modal-ok').click();
    await page1.waitForTimeout(2000);
    
    // Get household ID from database
    const householdResult = await pool.query('SELECT id FROM households WHERE name = $1', [householdName]);
    householdId = householdResult.rows[0].id;
    
    console.log('✅ User 1 registered and household created');

    // ==================================================================
    // STEP 2: Register User 2 and Join Household
    // ==================================================================
    console.log('📝 Step 2: Registering User 2 and joining household...');
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    await page2.goto(appUrl);
    await page2.waitForTimeout(1000);
    
    await page2.getByRole('link', { name: 'Regístrate' }).click();
    await page2.waitForTimeout(500);
    
    await page2.locator('#registerName').fill('User Two Debt');
    await page2.locator('#registerEmail').fill(user2Email);
    await page2.locator('#registerPassword').fill(password);
    await page2.locator('#registerConfirm').fill(password);
    
    await page2.getByRole('button', { name: 'Registrarse' }).click();
    await page2.waitForTimeout(2000);
    
    // Get user2 ID from database
    const user2Result = await pool.query('SELECT id FROM users WHERE email = $1', [user2Email]);
    user2Id = user2Result.rows[0].id;
    
    // User 1 invites User 2 (auto-accepted since email matches)
    await page1.goto(`${appUrl}/hogar`);
    await page1.waitForTimeout(2000);
    
    const inviteBtn = page1.locator('#invite-member-btn');
    await inviteBtn.waitFor({ state: 'visible', timeout: 5000 });
    await inviteBtn.click();
    await page1.waitForTimeout(500);
    
    const emailInput = page1.locator('#invite-email');
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
    await emailInput.fill(user2Email);
    
    const submitBtn = page1.getByRole('button', { name: 'Enviar invitación' });
    await submitBtn.click();
    await page1.waitForTimeout(2000);
    
    // Wait for and close success modal
    await page1.waitForSelector('.modal', { timeout: 5000 });
    await page1.waitForTimeout(500);
    await page1.locator('.modal button').click(); // Click OK
    await page1.waitForTimeout(2000); // Wait for reload
    
    // Verify User 2 is now a household member in the database
    const memberCheck = await pool.query(
      'SELECT user_id FROM household_members WHERE household_id = $1 AND user_id = $2',
      [householdId, user2Id]
    );
    
    if (memberCheck.rows.length === 0) {
      // Check invitations table to see if invitation exists
      const inviteCheck = await pool.query(
        'SELECT * FROM household_invitations WHERE household_id = $1 AND email = $2',
        [householdId, user2Email]
      );
      console.error('❌ User 2 not found as household member');
      console.error('📋 Invitation record:', inviteCheck.rows);
      
      // Also check all household members
      const allMembers = await pool.query(
        'SELECT user_id, role FROM household_members WHERE household_id = $1',
        [householdId]
      );
      console.error('👥 All household members:', allMembers.rows);
      
      throw new Error('User 2 failed to join household');
    }
    
    console.log('✅ User 2 joined household');

    // ==================================================================
    // STEP 3: Add Contact
    // ==================================================================
    console.log('📝 Step 3: Adding contact...');
    
    await page1.goto(`${appUrl}/hogar`);
    await page1.waitForTimeout(2000);
    
    await page1.getByRole('button', { name: '+ Agregar contacto' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#contact-name').fill('Pedro External');
    await page1.locator('#contact-email').fill('pedro@example.com');
    
    await page1.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page1.waitForTimeout(3000); // Wait for reload
    
    // Get contact ID from database
    const contactResult = await pool.query(
      'SELECT id FROM contacts WHERE household_id = $1 AND name = $2',
      [householdId, 'Pedro External']
    );
    contactId = contactResult.rows[0].id;
    
    console.log('✅ Contact added');

    // ==================================================================
    // STEP 4: Add Payment Method for User 1
    // ==================================================================
    console.log('📝 Step 4: Adding payment method for User 1...');
    
    await page1.goto(`${appUrl}/perfil`);
    await page1.waitForTimeout(2000);
    
    // Wait for the add button to be visible
    await page1.locator('#add-payment-method-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page1.locator('#add-payment-method-btn').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#pm-name').fill('Nequi Test');
    await page1.selectOption('select#pm-type', 'other');
    
    // Ensure NOT shared
    const isSharedCheckbox = page1.locator('#pm-shared');
    const isChecked = await isSharedCheckbox.isChecked();
    if (isChecked) {
      await isSharedCheckbox.uncheck();
    }
    
    await page1.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page1.waitForTimeout(1500);
    
    // Close modal
    await page1.keyboard.press('Escape');
    await page1.waitForTimeout(500);
    
    console.log('✅ Payment method added');

    // ==================================================================
    // STEP 4.5: Add Account for User 2 (receiver)
    // ==================================================================
    console.log('📝 Step 4.5: Adding account for User 2 (receiver)...');
    
    // User 2 creates an account to receive the debt payment
    await page2.goto(`${appUrl}/perfil`);
    await page2.waitForTimeout(2000);
    
    await page2.locator('#add-account-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page2.locator('#add-account-btn').click();
    await page2.waitForTimeout(500);
    
    await page2.selectOption('select#account-type', 'cash');
    await page2.locator('#account-name').fill('Cash Test');
    await page2.locator('#account-balance').fill('0');
    
    await page2.locator('#account-form button[type="submit"]').click();
    await page2.waitForTimeout(1500);
    
    // Wait for success modal and click OK
    await page2.waitForSelector('.modal-overlay', { timeout: 5000 });
    await page2.locator('#modal-ok').click();
    await page2.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    
    console.log('✅ Account added for User 2');

    // ==================================================================
    // STEP 4.6: Add Account for User 1 (to receive payment in step 9)
    // ==================================================================
    console.log('📝 Step 4.6: Adding account for User 1...');
    
    // User 1 creates an account to receive debt payment
    await page1.goto(`${appUrl}/perfil`);
    await page1.waitForTimeout(2000);
    
    await page1.locator('#add-account-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page1.locator('#add-account-btn').click();
    await page1.waitForTimeout(500);
    
    await page1.selectOption('select#account-type', 'savings');
    await page1.locator('#account-name').fill('Savings Test');
    await page1.locator('#account-balance').fill('1000000');
    
    await page1.locator('#account-form button[type="submit"]').click();
    await page1.waitForTimeout(1500);
    
    // Wait for success modal and click OK
    await page1.waitForSelector('.modal-overlay', { timeout: 5000 });
    await page1.locator('#modal-ok').click();
    await page1.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    
    console.log('✅ Account added for User 1');

    // ==================================================================
    // STEP 5: Create DEBT_PAYMENT (Member to Member)
    // ==================================================================
    console.log('📝 Step 5: Creating DEBT_PAYMENT movement (member to member)...');
    
    await page1.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(2000);
    
    // Select LOAN type and REPAY direction (equivalent to old DEBT_PAYMENT)
    await page1.locator('button[data-tipo="LOAN"]').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('button.loan-direction-btn[data-direction="REPAY"]').click();
    await page1.waitForTimeout(500);
    
    // Fill form
    await page1.locator('#descripcion').fill('Pago deuda almuerzo');
    await page1.locator('#valor').fill('25000');
    
    // Wait for pagador dropdown to be populated
    await page1.waitForTimeout(1000);
    
    await page1.selectOption('#pagador', 'User One Debt');
    await page1.waitForTimeout(500);
    await page1.selectOption('#metodo', 'Nequi Test');
    
    // Wait for tomador dropdown to be populated
    await page1.waitForTimeout(500);
    
    await page1.selectOption('#tomador', 'User Two Debt');
    
    // Trigger change event manually to ensure receiver account field appears
    await page1.evaluate(() => {
      const tomadorEl = document.getElementById('tomador');
      const event = new Event('change', { bubbles: true });
      tomadorEl.dispatchEvent(event);
    });
    
    // Wait for receiver account dropdown to appear and become visible (appears when tomador is a member)
    await page1.locator('#cuentaReceptoraWrap').waitFor({ state: 'visible', timeout: 5000 });
    await page1.waitForTimeout(500);
    
    // Debug: Check what options are available
    const options = await page1.evaluate(() => {
      const select = document.getElementById('cuentaReceptora');
      return Array.from(select.options).map(opt => ({value: opt.value, text: opt.textContent}));
    });
    console.log('Available receiver account options:', options);
    
    // Select receiver account by text (more reliable than by name)
    const accountOption = options.find(opt => opt.text.includes('Cash Test'));
    if (!accountOption || !accountOption.value) {
      throw new Error('Cash Test account not found in receiver account options');
    }
    await page1.selectOption('#cuentaReceptora', accountOption.value);
    
    // Verify the selection was successful
    const selectedValue = await page1.evaluate(() => {
      return document.getElementById('cuentaReceptora').value;
    });
    console.log('Selected receiver account value:', selectedValue);
    
    if (!selectedValue) {
      throw new Error('Receiver account selection failed - value is empty');
    }
    
    // Category is NOT required for LOAN type (neither LEND nor REPAY)
    // Submit form and confirm modal
    await submitFormAndConfirm(page1);
    
    // Wait for navigation
    await page1.waitForURL('**/', { timeout: 5000 });
    await page1.waitForTimeout(1000);
    
    console.log('✅ DEBT_PAYMENT movement created (member to member)');

    // ==================================================================
    // STEP 6: Verify Movement in Database
    // ==================================================================
    console.log('📝 Step 6: Verifying movement in PostgreSQL...');
    
    const movementResult = await pool.query(
      'SELECT * FROM movements WHERE household_id = $1 AND description = $2',
      [householdId, 'Pago deuda almuerzo']
    );
    
    if (movementResult.rows.length === 0) {
      throw new Error('Movement not found in database');
    }
    
    const movement = movementResult.rows[0];
    
    // Verify movement data
    if (movement.type !== 'DEBT_PAYMENT') {
      throw new Error(`Expected type DEBT_PAYMENT, got ${movement.type}`);
    }
    if (parseFloat(movement.amount) !== 25000) {
      throw new Error(`Expected amount 25000, got ${movement.amount}`);
    }
    if (movement.payer_user_id !== user1Id) {
      throw new Error(`Expected payer ${user1Id}, got ${movement.payer_user_id}`);
    }
    if (movement.counterparty_user_id !== user2Id) {
      throw new Error(`Expected counterparty ${user2Id}, got ${movement.counterparty_user_id}`);
    }
    
    console.log('✅ Movement verified in PostgreSQL');
    console.log('   Type:', movement.type);
    console.log('   Amount:', movement.amount);
    console.log('   Payer: User 1');
    console.log('   Counterparty: User 2');

    // ==================================================================
    // STEP 7: Create DEBT_PAYMENT (Member to Contact)
    // ==================================================================
    console.log('📝 Step 7: Creating DEBT_PAYMENT movement (member to contact)...');
    
    await page1.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(2000);
    
    await page1.locator('button[data-tipo="LOAN"]').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('button.loan-direction-btn[data-direction="REPAY"]').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#descripcion').fill('Pago deuda taxi');
    await page1.locator('#valor').fill('15000');
    await page1.selectOption('#pagador', 'User One Debt');
    await page1.waitForTimeout(500);
    await page1.selectOption('#metodo', 'Nequi Test');
    await page1.selectOption('#tomador', 'Pedro External');
    
    
    // Category is NOT required for LOAN type
    await submitFormAndConfirm(page1);
    
    // Wait for navigation
    await page1.waitForURL('**/', { timeout: 5000 });
    await page1.waitForTimeout(1000);
    
    console.log('✅ DEBT_PAYMENT movement created (member to contact)');

    // Verify in database
    const movement2Result = await pool.query(
      'SELECT * FROM movements WHERE household_id = $1 AND description = $2',
      [householdId, 'Pago deuda taxi']
    );
    
    const movement2 = movement2Result.rows[0];
    
    if (movement2.payer_user_id !== user1Id) {
      throw new Error(`Expected payer ${user1Id}, got ${movement2.payer_user_id}`);
    }
    if (movement2.counterparty_contact_id !== contactId) {
      throw new Error(`Expected counterparty contact ${contactId}, got ${movement2.counterparty_contact_id}`);
    }
    
    console.log('✅ Movement to contact verified');

    // ==================================================================
    // STEP 8: Test Validation (Pagador == Tomador)
    // ==================================================================
    console.log('📝 Step 8: Testing validation (pagador != tomador)...');
    
    await page1.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(2000);
    
    await page1.locator('button[data-tipo="LOAN"]').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('button.loan-direction-btn[data-direction="REPAY"]').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#descripcion').fill('Test validation');
    await page1.locator('#valor').fill('10000');
    await page1.selectOption('#pagador', 'User One Debt');
    await page1.waitForTimeout(500);
    await page1.selectOption('#metodo', 'Nequi Test');
    await page1.selectOption('#tomador', 'User One Debt'); // Same as pagador
    
    await page1.locator('#submitBtn').click();
    await page1.waitForTimeout(1000);
    
    // Should show validation error
    const validationStatus = await page1.locator('#status').textContent();
    if (!validationStatus.includes('misma persona') && !validationStatus.toLowerCase().includes('same')) {
      console.error('❌ Expected validation error, got:', validationStatus);
      throw new Error('Pagador == Tomador validation not working');
    }
    
    console.log('✅ Validation working correctly (pagador != tomador)');

    // ==================================================================
    // STEP 9: Test DEBT_PAYMENT Without Payment Method (Contact as Payer)
    // ==================================================================
    console.log('📝 Step 9: Testing DEBT_PAYMENT with contact as payer (no payment method)...');
    
    await page1.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(2000);
    
    await page1.locator('button[data-tipo="LOAN"]').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('button.loan-direction-btn[data-direction="REPAY"]').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#descripcion').fill('Pago de Pedro');
    await page1.locator('#valor').fill('20000');
    await page1.selectOption('#pagador', 'Pedro External');
    await page1.waitForTimeout(500);
    
    // Payment method should be hidden for contacts
    const metodoWrapVisible = await page1.locator('#metodoWrap').isVisible();
    if (metodoWrapVisible) {
      throw new Error('Payment method should be hidden for contact payers');
    }
    
    await page1.selectOption('#tomador', 'User One Debt');
    await page1.waitForTimeout(500);
    
    // Select receiver account (User 1's account from earlier steps)
    const cuentaReceptoraSelect = page1.locator('#cuentaReceptora');
    await cuentaReceptoraSelect.waitFor({ state: 'visible', timeout: 5000 });
    
    // Get available account options and select the first real account
    const accountOptions = await cuentaReceptoraSelect.locator('option').allTextContents();
    const accountValues = await cuentaReceptoraSelect.locator('option').evaluateAll(options => 
      options.map(opt => ({ value: opt.value, text: opt.textContent.trim() }))
    );
    
    console.log('Available accounts for User 1:', accountValues);
    
    // Find and select a valid account (not the placeholder)
    const validAccount = accountValues.find(opt => opt.value !== '');
    if (!validAccount) {
      throw new Error('No valid receiver account found for User 1');
    }
    
    await cuentaReceptoraSelect.selectOption(validAccount.value);
    await page1.waitForTimeout(500);
    
    console.log(`Selected receiver account: ${validAccount.text}`);
    
    await submitFormAndConfirm(page1);
    
    // Wait for navigation
    await page1.waitForURL('**/', { timeout: 5000 });
    await page1.waitForTimeout(1000);
    
    console.log('✅ DEBT_PAYMENT from contact created successfully');

    // Verify no payment method in database
    const movement3Result = await pool.query(
      'SELECT * FROM movements WHERE household_id = $1 AND description = $2',
      [householdId, 'Pago de Pedro']
    );
    
    const movement3 = movement3Result.rows[0];
    
    if (movement3.payment_method_id !== null) {
      throw new Error('Payment method should be null for contact payers');
    }
    if (movement3.payer_contact_id !== contactId) {
      throw new Error(`Expected payer contact ${contactId}, got ${movement3.payer_contact_id}`);
    }
    
    console.log('✅ Contact as payer verified (no payment method)');

    // ==================================================================
    // Cleanup
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    await pool.query('DELETE FROM movements WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM contacts WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM household_members WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM payment_methods WHERE owner_id IN ($1, $2)', [user1Id, user2Id]);
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [user1Id, user2Id]);
    
    console.log('✅ Cleanup complete');
    console.log('');
    console.log('✅ ✅ ✅ ALL DEBT_PAYMENT MOVEMENT TESTS PASSED! ✅ ✅ ✅');

    await browser.close();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Save screenshot on failure
    try {
      const page = (await browser.contexts())[0]?.pages()[0];
      if (page) {
        const screenshotPath = process.env.CI 
          ? 'test-results/movement-pago-deuda-failure.png'
          : '/tmp/movement-pago-deuda-failure.png';
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
        await pool.query('DELETE FROM contacts WHERE household_id = $1', [householdId]);
        await pool.query('DELETE FROM household_members WHERE household_id = $1', [householdId]);
      }
      if (user1Id && user2Id) {
        await pool.query('DELETE FROM payment_methods WHERE owner_id IN ($1, $2)', [user1Id, user2Id]);
      }
      if (householdId) {
        await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
      }
      if (user1Id && user2Id) {
        await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [user1Id, user2Id]);
      }
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
    
    await browser.close();
    await pool.end();
    throw error;
  }
}

testMovementPagoDeuda();
