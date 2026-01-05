import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Payment Methods Management
 * 
 * Tests the complete payment methods functionality:
 * 1. Register two users and create household
 * 2. User 1: Add personal payment methods
 * 3. User 1: Add shared payment methods
 * 4. User 2: Join household
 * 5. User 2: Verify can see shared payment methods
 * 6. User 1: Verify payment methods in movement form
 * 7. User 2: Verify sees own + shared in movement form
 * 8. Test form validation (required fields, etc.)
 * 9. User 1: Delete payment method
 * 10. User 2: Verify deleted shared method is gone
 */

async function testPaymentMethods() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const user1Email = `pm-owner-${timestamp}@example.com`;
  const user2Email = `pm-member-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `PM Test Household ${timestamp}`;

  try {
    console.log('🚀 Starting Payment Methods Test');
    console.log('👤 User 1 (Owner):', user1Email);
    console.log('👤 User 2 (Member):', user2Email);
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
    
    await page1.locator('#registerName').fill('Test Owner PM');
    await page1.locator('#registerEmail').fill(user1Email);
    await page1.locator('#registerPassword').fill(password);
    await page1.locator('#registerConfirm').fill(password);
    
    await page1.getByRole('button', { name: 'Registrarse' }).click();
    await page1.waitForTimeout(2000);
    
    // Should be on home page after registration
    
    // Go to profile and create household
    await page1.locator('#hamburger-btn').click();
    await page1.waitForTimeout(500);
    await page1.getByRole('link', { name: 'Perfil' }).click();
    await page1.waitForTimeout(1000);
    
    // Click "Crear hogar"
    await page1.getByRole('button', { name: 'Crear hogar' }).click();
    await page1.waitForTimeout(1000);
    
    // Fill household name
    await page1.locator('#household-name').fill(householdName);
    await page1.getByRole('button', { name: 'Crear hogar' }).click();
    await page1.waitForTimeout(2000);
    
    // Should be on household page
    await page1.waitForURL('**/hogar');
    await page1.waitForTimeout(1000);
    
    console.log('✅ User 1 registered and household created');

    // ==================================================================
    // STEP 2: User 1 - Add Personal Payment Method
    // ==================================================================
    console.log('📝 Step 2: User 1 adding personal payment method...');
    
    await page1.goto(`${appUrl}/perfil`);
    await page1.waitForTimeout(2000); // Wait for payment methods to load
    
    // Wait for the add button to be visible
    await page1.locator('#add-payment-method-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page1.locator('#add-payment-method-btn').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#pm-name').fill('Personal Visa');
    await page1.selectOption('select#pm-type', 'credit_card');
    await page1.locator('#pm-institution').fill('Banco Personal');
    await page1.locator('#pm-last4').fill('1234');
    
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
    
    // Verify it appears in the list
    const personalCard = await page1.locator('text=Personal Visa').count();
    if (personalCard === 0) {
      throw new Error('Personal payment method not found after creation');
    }
    
    console.log('✅ Personal payment method created');

    // ==================================================================
    // STEP 3: User 1 - Add Shared Payment Method
    // ==================================================================
    console.log('📝 Step 3: User 1 adding shared payment method...');
    
    await page1.locator('#add-payment-method-btn').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#pm-name').fill('Shared Mastercard');
    await page1.selectOption('select#pm-type', 'credit_card');
    await page1.locator('#pm-institution').fill('Banco Compartido');
    await page1.locator('#pm-last4').fill('5678');
    
    // Make it shared
    await page1.locator('#pm-shared').check();
    
    await page1.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page1.waitForTimeout(1500);
    
    // Close modal
    await page1.keyboard.press('Escape');
    await page1.waitForTimeout(500);
    
    // Verify it appears with "Compartido" badge
    const sharedCard = await page1.locator('text=Shared Mastercard').count();
    if (sharedCard === 0) {
      throw new Error('Shared payment method not found after creation');
    }
    
    console.log('✅ Shared payment method created');

    // ==================================================================
    // STEP 4: User 1 - Add Cash Payment Method
    // ==================================================================
    console.log('📝 Step 4: User 1 adding cash payment method...');
    
    await page1.locator('#add-payment-method-btn').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#pm-name').fill('Efectivo');
    await page1.selectOption('select#pm-type', 'cash');
    // No institution or last4 for cash
    
    await page1.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page1.waitForTimeout(2000);
    
    console.log('✅ Cash payment method created');

    // ==================================================================
    // STEP 6: Register User 2 and Join Household
    // ==================================================================
    console.log('📝 Step 6: Registering User 2...');
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    await page2.goto(appUrl);
    await page2.waitForTimeout(1000);
    
    await page2.getByRole('link', { name: 'Regístrate' }).click();
    await page2.waitForTimeout(500);
    
    await page2.locator('#registerName').fill('Test Member PM');
    await page2.locator('#registerEmail').fill(user2Email);
    await page2.locator('#registerPassword').fill(password);
    await page2.locator('#registerConfirm').fill(password);
    
    await page2.getByRole('button', { name: 'Registrarse' }).click();
    await page2.waitForTimeout(2000);
    
    // Should be on home page after registration
    console.log('✅ User 2 registered');

    // User 1: Invite User 2
    console.log('📝 Inviting User 2 to household...');
    await page1.goto(`${appUrl}/hogar`);
    await page1.waitForTimeout(500);
    
    await page1.getByRole('button', { name: 'Invitar miembro' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#invite-email').fill(user2Email);
    await page1.getByRole('button', { name: 'Enviar invitación' }).click();
    await page1.waitForTimeout(2000);
    
    // User 2: Accept invitation (auto-accept in this test)
    await page2.goto(`${appUrl}/hogar`);
    await page2.waitForTimeout(1000);
    
    console.log('✅ User 2 joined household');

    // ==================================================================
    // STEP 7: User 2 - Verify Sees Shared Payment Methods
    // ==================================================================
    console.log('📝 Step 7: User 2 checking household shared payment methods...');
    
    await page2.goto(`${appUrl}/hogar`);
    await page2.waitForTimeout(1000);
    
    // Check for Shared Mastercard in household page
    const sharedInHousehold = await page2.locator('text=Shared Mastercard').count();
    if (sharedInHousehold === 0) {
      throw new Error('User 2 cannot see shared payment method in household page');
    }
    
    // Should NOT see "Personal Visa" (not shared)
    const personalInHousehold = await page2.locator('text=Personal Visa').count();
    if (personalInHousehold > 0) {
      throw new Error('User 2 should NOT see User 1\'s personal payment method');
    }
    
    console.log('✅ User 2 correctly sees only shared payment methods in household');

    // ==================================================================
    // STEP 8: User 1 - Verify Payment Methods in Movement Form
    // ==================================================================
    console.log('📝 Step 8: User 1 checking payment methods in movement form...');
    
    // Listen for console errors
    page1.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Browser console error:', msg.text());
      }
    });
    
    await page1.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    
    // Wait for the tipo select to be available and not disabled
    await page1.waitForSelector('select#tipo', { state: 'visible', timeout: 15000 });
    await page1.waitForTimeout(500); // Additional wait for form config to load
    
    // Select a movement type that shows payment methods (FAMILIAR)
    await page1.selectOption('select#tipo', 'FAMILIAR');
    await page1.waitForTimeout(1000);
    
    // Get payment method options
    const paymentOptions1 = await page1.locator('select#metodo option').allTextContents();
    console.log('User 1 payment methods:', paymentOptions1);
    
    // Should see: Personal Visa, Shared Mastercard, Efectivo
    if (!paymentOptions1.some(pm => pm.includes('Personal Visa'))) {
      throw new Error('User 1 should see "Personal Visa"');
    }
    if (!paymentOptions1.some(pm => pm.includes('Shared Mastercard'))) {
      throw new Error('User 1 should see "Shared Mastercard"');
    }
    if (!paymentOptions1.some(pm => pm.includes('Efectivo'))) {
      throw new Error('User 1 should see "Efectivo"');
    }
    
    console.log('✅ User 1 sees all own payment methods in movement form');

    // ==================================================================
    // STEP 9: User 2 - Add Own Payment Method
    // ==================================================================
    console.log('📝 Step 9: User 2 adding own payment method...');
    
    await page2.goto(`${appUrl}/perfil`);
    await page2.waitForTimeout(1000);
    
    await page2.locator('#add-payment-method-btn').click();
    await page2.waitForTimeout(500);
    
    await page2.locator('#pm-name').fill('User2 Debit');
    await page2.selectOption('select#pm-type', 'debit_card');
    await page2.locator('#pm-institution').fill('Banco User2');
    
    await page2.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page2.waitForTimeout(1500);
    
    await page2.keyboard.press('Escape');
    await page2.waitForTimeout(500);
    
    console.log('✅ User 2 payment method created');

    // ==================================================================
    // STEP 10: User 2 - Verify Sees Own + Shared in Movement Form
    // ==================================================================
    console.log('📝 Step 10: User 2 checking payment methods in movement form...');
    
    await page2.goto(`${appUrl}/registrar-movimiento`);
    
    // Wait for the tipo select to be available and not disabled
    await page2.waitForSelector('select#tipo', { state: 'visible', timeout: 10000 });
    await page2.waitForTimeout(500); // Additional wait for form config to load
    
    await page2.selectOption('select#tipo', 'FAMILIAR');
    await page2.waitForTimeout(1000);
    
    const paymentOptions2 = await page2.locator('select#metodo option').allTextContents();
    console.log('User 2 payment methods:', paymentOptions2);
    
    // Should see: User2 Debit (own), Shared Mastercard (shared)
    // Should NOT see: Personal Visa (User 1's personal)
    if (!paymentOptions2.some(pm => pm.includes('User2 Debit'))) {
      throw new Error('User 2 should see "User2 Debit"');
    }
    if (!paymentOptions2.some(pm => pm.includes('Shared Mastercard'))) {
      throw new Error('User 2 should see shared "Shared Mastercard"');
    }
    if (paymentOptions2.some(pm => pm.includes('Personal Visa'))) {
      throw new Error('User 2 should NOT see User 1\'s "Personal Visa"');
    }
    
    console.log('✅ User 2 sees own + shared payment methods (correctly filtered)');

    // ==================================================================
    // STEP 10.5: Test Payment Method Filtering by Payer (COMPARTIDO)
    // ==================================================================
    console.log('📝 Step 10.5: Testing payment method filtering by payer selection...');
    
    await page2.goto(`${appUrl}/registrar-movimiento`);
    await page2.waitForSelector('select#tipo', { state: 'visible', timeout: 10000 });
    await page2.waitForTimeout(500);
    
    // Select COMPARTIDO type
    await page2.selectOption('select#tipo', 'COMPARTIDO');
    await page2.waitForTimeout(1000);
    
    // User 2 selects themselves as payer - should see own + shared
    await page2.selectOption('select#pagadorCompartido', 'Test Member PM');
    await page2.waitForTimeout(500);
    
    let paymentOptionsUser2 = await page2.locator('select#metodo option').allTextContents();
    console.log('When User 2 is payer:', paymentOptionsUser2);
    
    if (!paymentOptionsUser2.some(pm => pm.includes('User2 Debit'))) {
      throw new Error('User 2 should see own "User2 Debit" when selected as payer');
    }
    if (!paymentOptionsUser2.some(pm => pm.includes('Shared Mastercard'))) {
      throw new Error('User 2 should see shared "Shared Mastercard" when selected as payer');
    }
    
    // User 2 selects User 1 as payer - should see User 1's + shared
    await page2.selectOption('select#pagadorCompartido', 'Test Owner PM');
    await page2.waitForTimeout(500);
    
    let paymentOptionsUser1 = await page2.locator('select#metodo option').allTextContents();
    console.log('When User 1 is payer (from User 2 perspective):', paymentOptionsUser1);
    
    if (!paymentOptionsUser1.some(pm => pm.includes('Personal Visa'))) {
      throw new Error('Should see User 1\'s "Personal Visa" when User 1 is payer');
    }
    if (!paymentOptionsUser1.some(pm => pm.includes('Shared Mastercard'))) {
      throw new Error('Should see shared "Shared Mastercard" when User 1 is payer');
    }
    if (paymentOptionsUser1.some(pm => pm.includes('User2 Debit'))) {
      throw new Error('Should NOT see User 2\'s "User2 Debit" when User 1 is payer');
    }
    
    console.log('✅ Payment methods correctly filtered by payer selection');

    // ==================================================================
    // STEP 10.6: Test Payment Method Validation (Backend Security)
    // ==================================================================
    console.log('📝 Step 10.6: Testing payment method validation (backend security)...');
    
    // Try to submit a movement with wrong payment method for payer
    // This tests that the backend validates ownership even if frontend is bypassed
    await page2.goto(`${appUrl}/registrar-movimiento`);
    await page2.waitForSelector('select#tipo', { state: 'visible', timeout: 10000 });
    await page2.waitForTimeout(500);
    
    await page2.selectOption('select#tipo', 'PAGO_DEUDA');
    await page2.waitForTimeout(500);
    
    // Fill form
    await page2.locator('#fecha').fill('2025-01-15');
    await page2.locator('#descripcion').fill('Test validation');
    await page2.locator('#valor').fill('100,00');
    await page2.selectOption('select#categoria', 'Mercado');
    
    // Select User 1 as payer (pagador)
    await page2.selectOption('select#pagador', 'Test Owner PM');
    await page2.waitForTimeout(500);
    
    // Select User 2 as tomador (receiver)
    await page2.selectOption('select#tomador', 'Test Member PM');
    await page2.waitForTimeout(500);
    
    // Manually inject User2's payment method into the select (simulating form manipulation)
    // This tests that backend validation catches the error
    await page2.evaluate(() => {
      const select = document.getElementById('metodo');
      const option = document.createElement('option');
      option.value = 'User2 Debit';
      option.text = 'User2 Debit';
      select.add(option);
    });
    
    await page2.selectOption('select#metodo', 'User2 Debit');
    await page2.waitForTimeout(500);
    
    // Try to submit - should show validation error
    await page2.click('#submitBtn');
    await page2.waitForTimeout(2000);
    
    // Check for error message in status element
    const statusText = await page2.locator('#status').textContent();
    if (!statusText || !statusText.includes('no puede usar el método')) {
      throw new Error(`Expected validation error, got: ${statusText}`);
    }
    
    console.log('✅ Payment method validation works correctly (backend rejected invalid payment method)');

    // ==================================================================
    // STEP 10.7: Test Contact Payment Method Visibility
    // ==================================================================
    console.log('📝 Step 10.7: Testing contact payment method visibility...');
    
    // User 1 adds a contact
    await page1.goto(`${appUrl}/hogar`);
    await page1.waitForTimeout(1000);
    
    await page1.getByRole('button', { name: 'Agregar contacto' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#contact-name').fill('External Contact');
    await page1.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page1.waitForTimeout(1500);
    
    // Go to movement form
    await page1.goto(`${appUrl}/registrar-movimiento`);
    await page1.waitForSelector('select#tipo', { state: 'visible', timeout: 10000 });
    await page1.waitForTimeout(500);
    
    await page1.selectOption('select#tipo', 'COMPARTIDO');
    await page1.waitForTimeout(500);
    
    // Select contact as payer
    await page1.selectOption('select#pagadorCompartido', 'External Contact');
    await page1.waitForTimeout(500);
    
    // Payment method field should be HIDDEN for contacts
    const metodoWrap = await page1.locator('#metodoWrap');
    const isHidden = await metodoWrap.evaluate(el => el.classList.contains('hidden'));
    
    if (!isHidden) {
      throw new Error('Payment method field should be hidden when contact is selected as payer');
    }
    
    console.log('✅ Payment method field correctly hidden for contacts');

    // ==================================================================
    // STEP 11: User 1 - Edit Payment Method
    // ==================================================================
    console.log('📝 Step 11: User 1 editing payment method...');
    
    await page1.goto(`${appUrl}/perfil`);
    await page1.waitForTimeout(1000);
    
    // Find "Efectivo" payment method item
    const efectivoItem = page1.locator('.contact-item:has-text("Efectivo")');
    
    // Click menu button to open dropdown
    await efectivoItem.locator('button.btn-menu').click();
    await page1.waitForTimeout(300);
    
    // Click Edit button in dropdown
    await efectivoItem.locator('.actions-dropdown button[data-action="edit"]').click();
    await page1.waitForTimeout(500);
    
    // Change name
    await page1.locator('#pm-name').clear();
    await page1.locator('#pm-name').fill('Efectivo Principal');
    await page1.getByRole('button', { name: 'Guardar' }).click();
    await page1.waitForTimeout(1500);
    
    // Close success modal
    await page1.locator('#modal-ok').click();
    await page1.waitForTimeout(500);
    
    // Verify name changed
    const updatedName = await page1.locator('text=Efectivo Principal').count();
    if (updatedName === 0) {
      throw new Error('Payment method name not updated');
    }
    
    console.log('✅ Payment method edited successfully');

    // ==================================================================
    // STEP 12: User 1 - Delete Personal Payment Method
    // ==================================================================
    console.log('📝 Step 12: User 1 deleting personal payment method...');
    
    const personalItem = page1.locator('.contact-item:has-text("Personal Visa")');
    
    // Click menu button to open dropdown
    await personalItem.locator('button.btn-menu').click();
    await page1.waitForTimeout(300);
    
    // Click Delete button in dropdown
    await personalItem.locator('.actions-dropdown button[data-action="delete"]').click();
    await page1.waitForTimeout(500);
    
    // Confirm deletion
    await page1.locator('#modal-confirm').click();
    await page1.waitForTimeout(1000);
    
    // Close success modal
    await page1.locator('#modal-ok').click();
    await page1.waitForTimeout(500);
    
    // Verify it's gone
    const deletedCard = await page1.locator('text=Personal Visa').count();
    if (deletedCard > 0) {
      throw new Error('Deleted payment method still appears');
    }
    
    console.log('✅ Personal payment method deleted');

    // ==================================================================
    // STEP 13: User 1 - Delete Shared Payment Method
    // ==================================================================
    console.log('📝 Step 13: User 1 deleting shared payment method...');
    
    const sharedItem = page1.locator('.contact-item:has-text("Shared Mastercard")');
    
    // Click menu button to open dropdown
    await sharedItem.locator('button.btn-menu').click();
    await page1.waitForTimeout(300);
    
    // Click Delete button in dropdown
    await sharedItem.locator('.actions-dropdown button[data-action="delete"]').click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#modal-confirm').click();
    await page1.waitForTimeout(1000);
    
    // Close success modal
    await page1.locator('#modal-ok').click();
    await page1.waitForTimeout(500);
    
    console.log('✅ Shared payment method deleted');

    // ==================================================================
    // STEP 14: User 2 - Verify Deleted Shared Method is Gone
    // ==================================================================
    console.log('📝 Step 14: User 2 verifying deleted shared method is gone...');
    
    await page2.goto(`${appUrl}/hogar`);
    await page2.waitForTimeout(1000);
    
    const deletedShared = await page2.locator('text=Shared Mastercard').count();
    if (deletedShared > 0) {
      throw new Error('Deleted shared payment method still visible to User 2');
    }
    
    console.log('✅ User 2 correctly does not see deleted shared payment method');

    // ==================================================================
    // STEP 15: User 2 - Verify in Movement Form
    // ==================================================================
    console.log('📝 Step 15: User 2 checking movement form after deletion...');
    
    await page2.goto(`${appUrl}/registrar-movimiento`);
    await page2.waitForSelector('select#tipo', { state: 'visible', timeout: 10000 });
    await page2.waitForTimeout(500);
    
    await page2.selectOption('select#tipo', 'FAMILIAR');
    await page2.waitForTimeout(500);
    
    const finalOptions = await page2.locator('select#metodo option').allTextContents();
    console.log('User 2 final payment methods:', finalOptions);
    
    // Should only see: User2 Debit (Personal Visa and Shared Mastercard were deleted)
    if (!finalOptions.some(pm => pm.includes('User2 Debit'))) {
      throw new Error('User 2 should still see "User2 Debit"');
    }
    if (finalOptions.some(pm => pm.includes('Shared Mastercard'))) {
      throw new Error('User 2 should NOT see deleted "Shared Mastercard"');
    }
    
    console.log('✅ User 2 movement form correctly updated after shared method deletion');

    // ==================================================================
    // STEP 16: Test Deactivation of Payment Method
    // ==================================================================
    console.log('📝 Step 16: Testing payment method deactivation...');
    
    // User 2 adds a new payment method, then deactivates it
    await page2.goto(`${appUrl}/perfil`);
    await page2.waitForTimeout(1000);
    
    await page2.locator('#add-payment-method-btn').click();
    await page2.waitForTimeout(500);
    
    await page2.locator('#pm-name').fill('To Deactivate');
    await page2.selectOption('select#pm-type', 'other');
    await page2.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page2.waitForTimeout(1500);
    
    await page2.keyboard.press('Escape');
    await page2.waitForTimeout(500);
    
    // Verify it appears in movement form
    await page2.goto(`${appUrl}/registrar-movimiento`);
    await page2.waitForSelector('select#tipo', { state: 'visible', timeout: 10000 });
    await page2.waitForTimeout(500);
    await page2.selectOption('select#tipo', 'FAMILIAR');
    await page2.waitForTimeout(500);
    
    let beforeDeactivation = await page2.locator('select#metodo option').allTextContents();
    if (!beforeDeactivation.some(pm => pm.includes('To Deactivate'))) {
      throw new Error('New payment method should appear before deactivation');
    }
    
    // Now deactivate it
    await page2.goto(`${appUrl}/perfil`);
    await page2.waitForTimeout(1000);
    
    // Find the payment method
    const pmItem = page2.locator('.contact-item:has-text("To Deactivate")');
    
    // Click menu button to open dropdown
    await pmItem.locator('button.btn-menu').click();
    await page2.waitForTimeout(300);
    
    // Click Edit button in dropdown
    await pmItem.locator('.actions-dropdown button[data-action="edit"]').click();
    await page2.waitForTimeout(500);
    
    // Uncheck is_active
    await page2.locator('#pm-active').uncheck();
    await page2.getByRole('button', { name: 'Guardar' }).click();
    await page2.waitForTimeout(1500);
    
    // Close success modal
    await page2.locator('#modal-ok').click();
    await page2.waitForTimeout(500);
    
    // Verify it does NOT appear in movement form
    await page2.goto(`${appUrl}/registrar-movimiento`);
    await page2.waitForSelector('select#tipo', { state: 'visible', timeout: 10000 });
    await page2.waitForTimeout(500);
    await page2.selectOption('select#tipo', 'FAMILIAR');
    await page2.waitForTimeout(500);
    
    let afterDeactivation = await page2.locator('select#metodo option').allTextContents();
    if (afterDeactivation.some(pm => pm.includes('To Deactivate'))) {
      throw new Error('Deactivated payment method should NOT appear in movement form');
    }
    
    console.log('✅ Payment method deactivation works correctly');

    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    const user1Result = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [user1Email]
    );
    
    const user2Result = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [user2Email]
    );
    
    if (user1Result.rows.length > 0) {
      const user1Id = user1Result.rows[0].id;
      
      const householdResult = await pool.query(
        'SELECT id FROM households WHERE name = $1',
        [householdName]
      );
      
      if (householdResult.rows.length > 0) {
        const householdId = householdResult.rows[0].id;
        
        // Delete payment methods
        await pool.query('DELETE FROM payment_methods WHERE household_id = $1', [householdId]);
        
        // Delete household members
        await pool.query('DELETE FROM household_members WHERE household_id = $1', [householdId]);
        
        // Delete household
        await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
      }
      
      // Delete user 1
      await pool.query('DELETE FROM users WHERE id = $1', [user1Id]);
    }
    
    if (user2Result.rows.length > 0) {
      const user2Id = user2Result.rows[0].id;
      
      // Delete any remaining payment methods
      await pool.query('DELETE FROM payment_methods WHERE owner_id = $1', [user2Id]);
      
      // Delete user 2
      await pool.query('DELETE FROM users WHERE id = $1', [user2Id]);
    }
    
    console.log('✅ Cleanup complete');

    console.log('');
    console.log('✅ ✅ ✅ ALL PAYMENT METHOD TESTS PASSED! ✅ ✅ ✅');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ ❌ ❌ TEST FAILED ❌ ❌ ❌');
    console.error('Error:', error.message);
    console.error('');
    throw error;
  } finally {
    await browser.close();
    await pool.end();
  }
}

// Run test
testPaymentMethods()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
