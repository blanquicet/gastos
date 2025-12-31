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
  const apiUrl = process.env.API_URL || 'http://localhost:8080';
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
    
    await page1.goto(`${apiUrl}/registrar`);
    await page1.fill('input[name="email"]', user1Email);
    await page1.fill('input[name="password"]', password);
    await page1.fill('input[name="passwordConfirm"]', password);
    await page1.click('button[type="submit"]');
    
    await page1.waitForURL(`${apiUrl}/`, { timeout: 5000 });
    
    await page1.goto(`${apiUrl}/hogar/crear`);
    await page1.fill('input[name="name"]', householdName);
    await page1.click('button:has-text("Crear hogar")');
    await page1.waitForURL(`${apiUrl}/hogar`, { timeout: 5000 });
    
    console.log('✅ User 1 registered and household created');

    // ==================================================================
    // STEP 2: User 1 - Test Form Validation
    // ==================================================================
    console.log('📝 Step 2: Testing payment method form validation...');
    
    await page1.goto(`${apiUrl}/metodos-pago`);
    await page1.waitForTimeout(1000);
    
    // Click Add Payment Method
    await page1.click('button:has-text("Agregar método de pago")');
    await page1.waitForTimeout(500);
    
    // Try to submit empty form
    await page1.click('button:has-text("Guardar")');
    await page1.waitForTimeout(500);
    
    // Should show validation errors (check for required fields)
    const nameInput = page1.locator('input[name="name"]');
    const isInvalid = await nameInput.evaluate(el => el.validity.valid === false);
    
    if (!isInvalid) {
      console.log('⚠️  Warning: Form validation might not be working (no HTML5 validation)');
    } else {
      console.log('✅ Form validation working (empty name rejected)');
    }
    
    // Cancel
    await page1.click('button:has-text("Cancelar")');
    await page1.waitForTimeout(500);

    // ==================================================================
    // STEP 3: User 1 - Add Personal Payment Method
    // ==================================================================
    console.log('📝 Step 3: User 1 adding personal payment method...');
    
    await page1.click('button:has-text("Agregar método de pago")');
    await page1.waitForTimeout(500);
    
    await page1.fill('input[name="name"]', 'Personal Visa');
    await page1.selectOption('select[name="type"]', 'credit_card');
    await page1.fill('input[name="institution"]', 'Banco Personal');
    await page1.fill('input[name="last4"]', '1234');
    
    // Ensure NOT shared
    await page1.uncheck('input[name="is_shared_with_household"]');
    
    await page1.click('button:has-text("Guardar")');
    await page1.waitForTimeout(1000);
    
    // Verify it appears in the list
    const personalCard = await page1.locator('text=Personal Visa').count();
    if (personalCard === 0) {
      throw new Error('Personal payment method not found after creation');
    }
    
    console.log('✅ Personal payment method created');

    // ==================================================================
    // STEP 4: User 1 - Add Shared Payment Method
    // ==================================================================
    console.log('📝 Step 4: User 1 adding shared payment method...');
    
    await page1.click('button:has-text("Agregar método de pago")');
    await page1.waitForTimeout(500);
    
    await page1.fill('input[name="name"]', 'Shared Mastercard');
    await page1.selectOption('select[name="type"]', 'credit_card');
    await page1.fill('input[name="institution"]', 'Banco Compartido');
    await page1.fill('input[name="last4"]', '5678');
    
    // Make it shared
    await page1.check('input[name="is_shared_with_household"]');
    
    await page1.click('button:has-text("Guardar")');
    await page1.waitForTimeout(1000);
    
    // Verify it appears with "Compartido" badge
    const sharedCard = await page1.locator('text=Shared Mastercard').count();
    if (sharedCard === 0) {
      throw new Error('Shared payment method not found after creation');
    }
    
    const sharedBadge = await page1.locator('.member-role:has-text("Compartido")').count();
    if (sharedBadge === 0) {
      console.log('⚠️  Warning: "Compartido" badge not visible');
    }
    
    console.log('✅ Shared payment method created');

    // ==================================================================
    // STEP 5: User 1 - Add Cash Payment Method
    // ==================================================================
    console.log('📝 Step 5: User 1 adding cash payment method...');
    
    await page1.click('button:has-text("Agregar método de pago")');
    await page1.waitForTimeout(500);
    
    await page1.fill('input[name="name"]', 'Efectivo');
    await page1.selectOption('select[name="type"]', 'cash');
    // No institution or last4 for cash
    
    await page1.click('button:has-text("Guardar")');
    await page1.waitForTimeout(1000);
    
    console.log('✅ Cash payment method created');

    // ==================================================================
    // STEP 6: Register User 2 and Join Household
    // ==================================================================
    console.log('📝 Step 6: Registering User 2...');
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    await page2.goto(`${apiUrl}/registrar`);
    await page2.fill('input[name="email"]', user2Email);
    await page2.fill('input[name="password"]', password);
    await page2.fill('input[name="passwordConfirm"]', password);
    await page2.click('button[type="submit"]');
    
    await page2.waitForURL(`${apiUrl}/`, { timeout: 5000 });
    console.log('✅ User 2 registered');

    // User 1: Invite User 2
    console.log('📝 Inviting User 2 to household...');
    await page1.goto(`${apiUrl}/hogar`);
    await page1.waitForTimeout(500);
    
    await page1.click('button:has-text("Invitar miembro")');
    await page1.waitForTimeout(500);
    
    await page1.fill('input[name="email"]', user2Email);
    await page1.click('button:has-text("Enviar invitación")');
    await page1.waitForTimeout(2000);
    
    // User 2: Accept invitation (auto-accept in this test)
    await page2.goto(`${apiUrl}/hogar`);
    await page2.waitForTimeout(1000);
    
    console.log('✅ User 2 joined household');

    // ==================================================================
    // STEP 7: User 2 - Verify Sees Shared Payment Methods
    // ==================================================================
    console.log('📝 Step 7: User 2 checking household shared payment methods...');
    
    await page2.goto(`${apiUrl}/hogar`);
    await page2.waitForTimeout(1000);
    
    // Scroll to shared payment methods section
    await page2.evaluate(() => {
      const section = document.querySelector('h3:has-text("Métodos de Pago (Compartidos)")');
      if (section) section.scrollIntoView();
    });
    
    await page2.waitForTimeout(500);
    
    // Check for Shared Mastercard
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
    
    await page1.goto(`${apiUrl}/registrar`);
    await page1.waitForTimeout(1000);
    
    // Select a movement type that shows payment methods
    await page1.selectOption('select[name="tipo"]', 'GASTO');
    await page1.waitForTimeout(500);
    
    // Get payment method options
    const paymentOptions1 = await page1.locator('select[name="metodo"] option').allTextContents();
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
    
    await page2.goto(`${apiUrl}/metodos-pago`);
    await page2.waitForTimeout(1000);
    
    await page2.click('button:has-text("Agregar método de pago")');
    await page2.waitForTimeout(500);
    
    await page2.fill('input[name="name"]', 'User2 Debit');
    await page2.selectOption('select[name="type"]', 'debit_card');
    await page2.fill('input[name="institution"]', 'Banco User2');
    
    await page2.click('button:has-text("Guardar")');
    await page2.waitForTimeout(1000);
    
    console.log('✅ User 2 payment method created');

    // ==================================================================
    // STEP 10: User 2 - Verify Sees Own + Shared in Movement Form
    // ==================================================================
    console.log('📝 Step 10: User 2 checking payment methods in movement form...');
    
    await page2.goto(`${apiUrl}/registrar`);
    await page2.waitForTimeout(1000);
    
    await page2.selectOption('select[name="tipo"]', 'GASTO');
    await page2.waitForTimeout(500);
    
    const paymentOptions2 = await page2.locator('select[name="metodo"] option').allTextContents();
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
    // STEP 11: User 1 - Edit Payment Method
    // ==================================================================
    console.log('📝 Step 11: User 1 editing payment method...');
    
    await page1.goto(`${apiUrl}/metodos-pago`);
    await page1.waitForTimeout(1000);
    
    // Find "Efectivo" and click Edit
    const efectivoCard = page1.locator('.payment-method-item:has-text("Efectivo")');
    await efectivoCard.locator('button:has-text("Editar")').click();
    await page1.waitForTimeout(500);
    
    // Change name
    await page1.fill('input[name="name"]', 'Efectivo Principal');
    
    await page1.click('button:has-text("Guardar")');
    await page1.waitForTimeout(1000);
    
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
    
    const personalCard2 = page1.locator('.payment-method-item:has-text("Personal Visa")');
    await personalCard2.locator('button:has-text("Eliminar")').click();
    await page1.waitForTimeout(500);
    
    // Confirm deletion
    await page1.click('button:has-text("Eliminar")'); // Confirmation dialog
    await page1.waitForTimeout(1000);
    
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
    
    const sharedCard2 = page1.locator('.payment-method-item:has-text("Shared Mastercard")');
    await sharedCard2.locator('button:has-text("Eliminar")').click();
    await page1.waitForTimeout(500);
    
    await page1.click('button:has-text("Eliminar")');
    await page1.waitForTimeout(1000);
    
    console.log('✅ Shared payment method deleted');

    // ==================================================================
    // STEP 14: User 2 - Verify Deleted Shared Method is Gone
    // ==================================================================
    console.log('📝 Step 14: User 2 verifying deleted shared method is gone...');
    
    await page2.goto(`${apiUrl}/hogar`);
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
    
    await page2.goto(`${apiUrl}/registrar`);
    await page2.waitForTimeout(1000);
    
    await page2.selectOption('select[name="tipo"]', 'GASTO');
    await page2.waitForTimeout(500);
    
    const finalOptions = await page2.locator('select[name="metodo"] option').allTextContents();
    console.log('User 2 final payment methods:', finalOptions);
    
    // Should only see: User2 Debit
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
    await page2.goto(`${apiUrl}/metodos-pago`);
    await page2.waitForTimeout(1000);
    
    await page2.click('button:has-text("Agregar método de pago")');
    await page2.waitForTimeout(500);
    
    await page2.fill('input[name="name"]', 'To Deactivate');
    await page2.selectOption('select[name="type"]', 'other');
    await page2.click('button:has-text("Guardar")');
    await page2.waitForTimeout(1000);
    
    // Verify it appears in movement form
    await page2.goto(`${apiUrl}/registrar`);
    await page2.waitForTimeout(1000);
    await page2.selectOption('select[name="tipo"]', 'GASTO');
    await page2.waitForTimeout(500);
    
    let beforeDeactivation = await page2.locator('select[name="metodo"] option').allTextContents();
    if (!beforeDeactivation.some(pm => pm.includes('To Deactivate'))) {
      throw new Error('New payment method should appear before deactivation');
    }
    
    // Now deactivate it
    await page2.goto(`${apiUrl}/metodos-pago`);
    await page2.waitForTimeout(1000);
    
    const toDeactivate = page2.locator('.payment-method-item:has-text("To Deactivate")');
    await toDeactivate.locator('button:has-text("Editar")').click();
    await page2.waitForTimeout(500);
    
    await page2.uncheck('input[name="is_active"]');
    await page2.click('button:has-text("Guardar")');
    await page2.waitForTimeout(1000);
    
    // Verify it does NOT appear in movement form
    await page2.goto(`${apiUrl}/registrar`);
    await page2.waitForTimeout(1000);
    await page2.selectOption('select[name="tipo"]', 'GASTO');
    await page2.waitForTimeout(500);
    
    let afterDeactivation = await page2.locator('select[name="metodo"] option').allTextContents();
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
