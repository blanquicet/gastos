import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Contact Activation/Deactivation
 * 
 * Tests the contact active/inactive functionality:
 * 1. Register user and create household
 * 2. Add multiple contacts
 * 3. Deactivate some contacts
 * 4. Verify inactive contacts don't appear in movement form
 * 5. Reactivate contacts
 * 6. Verify reactivated contacts appear in movement form
 */

async function testContactActivation() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const apiUrl = process.env.API_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const userEmail = `user-contact-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Contact Test Household ${timestamp}`;

  try {
    console.log('🚀 Starting Contact Activation Test');
    console.log('👤 User:', userEmail);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User
    // ==================================================================
    console.log('📝 Step 1: Registering user...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto(`${apiUrl}/registrar`);
    await page.fill('input[name="email"]', userEmail);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="passwordConfirm"]', password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to home
    await page.waitForURL(`${apiUrl}/`, { timeout: 5000 });
    console.log('✅ User registered and logged in');

    // ==================================================================
    // STEP 2: Create Household
    // ==================================================================
    console.log('📝 Step 2: Creating household...');
    await page.goto(`${apiUrl}/hogar/crear`);
    await page.fill('input[name="name"]', householdName);
    await page.click('button:has-text("Crear hogar")');
    
    // Wait for redirect
    await page.waitForURL(`${apiUrl}/hogar`, { timeout: 5000 });
    console.log('✅ Household created');

    // ==================================================================
    // STEP 3: Add Multiple Contacts
    // ==================================================================
    console.log('📝 Step 3: Adding contacts...');
    
    const contacts = [
      { name: 'Active Contact 1', phone: '1234567890' },
      { name: 'Active Contact 2', phone: '0987654321' },
      { name: 'To Deactivate', phone: '5555555555' }
    ];

    for (const contact of contacts) {
      // Click Add Contact button
      await page.click('button:has-text("Agregar contacto")');
      
      // Wait for form to appear
      await page.waitForSelector('input[name="name"]', { timeout: 2000 });
      
      // Fill contact form
      await page.fill('input[name="name"]', contact.name);
      await page.fill('input[name="phone"]', contact.phone);
      
      // Submit
      await page.click('button:has-text("Agregar")');
      
      // Wait for success or contact to appear
      await page.waitForTimeout(500);
    }
    
    console.log('✅ Added 3 contacts');

    // ==================================================================
    // STEP 4: Verify All Contacts in Movement Form
    // ==================================================================
    console.log('📝 Step 4: Verifying all contacts appear in movement form...');
    
    await page.goto(`${apiUrl}/registrar`);
    await page.waitForTimeout(1000); // Wait for form to load
    
    // Select movement type that shows participants (COMPARTIDO)
    await page.selectOption('select[name="tipo"]', 'COMPARTIDO');
    await page.waitForTimeout(500);
    
    // Check participants list
    const participantsBefore = await page.locator('.participante-option').allTextContents();
    console.log('Participants before deactivation:', participantsBefore);
    
    if (!participantsBefore.some(p => p.includes('Active Contact 1'))) {
      throw new Error('Active Contact 1 not found in participants');
    }
    if (!participantsBefore.some(p => p.includes('To Deactivate'))) {
      throw new Error('To Deactivate not found in participants');
    }
    
    console.log('✅ All contacts appear in movement form');

    // ==================================================================
    // STEP 5: Deactivate Contact
    // ==================================================================
    console.log('📝 Step 5: Deactivating contact...');
    
    await page.goto(`${apiUrl}/hogar`);
    await page.waitForTimeout(500);
    
    // Scroll to contacts section
    await page.evaluate(() => {
      const contactsSection = document.querySelector('h2:has-text("Contactos")');
      if (contactsSection) contactsSection.scrollIntoView();
    });
    
    // Find "To Deactivate" contact and click Edit
    const contactToDeactivate = page.locator('.contact-item:has-text("To Deactivate")');
    await contactToDeactivate.locator('button:has-text("Editar")').click();
    
    await page.waitForTimeout(500);
    
    // Uncheck "is_active" checkbox
    await page.uncheck('input[name="is_active"]');
    
    // Save
    await page.click('button:has-text("Guardar")');
    await page.waitForTimeout(1000);
    
    console.log('✅ Contact deactivated');

    // ==================================================================
    // STEP 6: Verify Deactivated Contact NOT in Movement Form
    // ==================================================================
    console.log('📝 Step 6: Verifying deactivated contact does not appear...');
    
    await page.goto(`${apiUrl}/registrar`);
    await page.waitForTimeout(1000);
    
    // Select COMPARTIDO again
    await page.selectOption('select[name="tipo"]', 'COMPARTIDO');
    await page.waitForTimeout(500);
    
    // Check participants list
    const participantsAfter = await page.locator('.participante-option').allTextContents();
    console.log('Participants after deactivation:', participantsAfter);
    
    if (!participantsAfter.some(p => p.includes('Active Contact 1'))) {
      throw new Error('Active Contact 1 should still appear');
    }
    if (participantsAfter.some(p => p.includes('To Deactivate'))) {
      throw new Error('Deactivated contact should NOT appear in participants');
    }
    
    console.log('✅ Deactivated contact correctly hidden from movement form');

    // ==================================================================
    // STEP 7: Reactivate Contact
    // ==================================================================
    console.log('📝 Step 7: Reactivating contact...');
    
    await page.goto(`${apiUrl}/hogar`);
    await page.waitForTimeout(500);
    
    // Find deactivated contact and edit
    await contactToDeactivate.locator('button:has-text("Editar")').click();
    await page.waitForTimeout(500);
    
    // Check "is_active" checkbox
    await page.check('input[name="is_active"]');
    
    // Save
    await page.click('button:has-text("Guardar")');
    await page.waitForTimeout(1000);
    
    console.log('✅ Contact reactivated');

    // ==================================================================
    // STEP 8: Verify Reactivated Contact Back in Movement Form
    // ==================================================================
    console.log('📝 Step 8: Verifying reactivated contact appears again...');
    
    await page.goto(`${apiUrl}/registrar`);
    await page.waitForTimeout(1000);
    
    // Select COMPARTIDO
    await page.selectOption('select[name="tipo"]', 'COMPARTIDO');
    await page.waitForTimeout(500);
    
    // Check participants list
    const participantsFinal = await page.locator('.participante-option').allTextContents();
    console.log('Participants after reactivation:', participantsFinal);
    
    if (!participantsFinal.some(p => p.includes('To Deactivate'))) {
      throw new Error('Reactivated contact should appear in participants');
    }
    
    console.log('✅ Reactivated contact correctly appears in movement form');

    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    const result = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [userEmail]
    );
    
    if (result.rows.length > 0) {
      const userId = result.rows[0].id;
      
      // Get household
      const householdResult = await pool.query(
        'SELECT id FROM households WHERE name = $1',
        [householdName]
      );
      
      if (householdResult.rows.length > 0) {
        const householdId = householdResult.rows[0].id;
        
        // Delete contacts
        await pool.query('DELETE FROM household_contacts WHERE household_id = $1', [householdId]);
        
        // Delete household members
        await pool.query('DELETE FROM household_members WHERE household_id = $1', [householdId]);
        
        // Delete household
        await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
      }
      
      // Delete user
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    
    console.log('✅ Cleanup complete');

    console.log('');
    console.log('✅ ✅ ✅ ALL CONTACT ACTIVATION TESTS PASSED! ✅ ✅ ✅');
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
testContactActivation()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
