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
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';
  
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
    
    await page.goto(appUrl);
    await page.waitForTimeout(1000);
    
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#registerName').fill('Test User');
    await page.locator('#registerEmail').fill(userEmail);
    await page.locator('#registerPassword').fill(password);
    await page.locator('#registerConfirm').fill(password);
    
    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);
    
    // After registration, user is logged in and should be on home page
    console.log('✅ User registered and logged in');

    // ==================================================================
    // STEP 2: Create Household
    // ==================================================================
    console.log('📝 Step 2: Creating household...');
    
    // Go to profile
    await page.locator('#hamburger-btn').click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.waitForTimeout(1000);
    
    // Click "Crear hogar"
    await page.getByRole('button', { name: 'Crear hogar' }).click();
    await page.waitForTimeout(500);
    
    // Fill household name in modal
    await page.locator('#household-name-input').fill(householdName);
    await page.locator('#household-create-btn').click();
    await page.waitForTimeout(1000);
    await page.locator('#modal-ok').click();
    await page.waitForTimeout(2000);
    
    // Navigate to household page to continue test
    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(1000);
    
    console.log('✅ Household created');

    // ==================================================================
    // STEP 3: Add Multiple Contacts
    // ==================================================================
    console.log('📝 Step 3: Adding contacts...');
    
    const contacts = [
      { name: 'Active Contact 1', email: 'active1@example.com', phone: '+571234567890' },
      { name: 'Active Contact 2', email: 'active2@example.com', phone: '+570987654321' },
      { name: 'To Deactivate', email: 'deactivate@example.com', phone: '+575555555555' }
    ];

    for (const contact of contacts) {
      // Click Add Contact button
      await page.getByRole('button', { name: '+ Agregar contacto' }).click();
      await page.waitForTimeout(500);
      
      // Fill contact form
      await page.locator('#contact-name').fill(contact.name);
      await page.locator('#contact-email').fill(contact.email);
      await page.locator('#contact-phone').fill(contact.phone);
      
      // Submit
      await page.getByRole('button', { name: 'Agregar', exact: true }).click();
      await page.waitForTimeout(3000); // Wait for reload
    }
    
    console.log('✅ Added 3 contacts');

    // ==================================================================
    // STEP 4: Verify All Contacts Exist in Database
    // ==================================================================
    console.log('📝 Step 4: Verifying all contacts exist...');
    
    const contactsResult = await pool.query(
      `SELECT name, is_active FROM contacts 
       WHERE household_id = (SELECT id FROM households WHERE name = $1)
       ORDER BY name`,
      [householdName]
    );
    
    console.log('Contacts in database:', contactsResult.rows);
    
    if (contactsResult.rows.length !== 3) {
      throw new Error(`Expected 3 contacts, found ${contactsResult.rows.length}`);
    }
    
    const allActive = contactsResult.rows.every(c => c.is_active === true);
    if (!allActive) {
      throw new Error('All contacts should be active initially');
    }
    
    console.log('✅ All contacts are active');

    // ==================================================================
    // STEP 4b: Verify All Contacts Appear in Movement Form
    // ==================================================================
    console.log('📝 Step 4b: Verifying contacts appear in movement form...');
    
    await page.goto(`${appUrl}/registrar-movimiento`);
    
    // Wait for network to be idle (API calls complete)
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give extra time for API to load
    
    // Select "Dividir gasto" (SPLIT) which shows participants
    await page.click('button.tipo-btn[data-tipo="SPLIT"]');
    await page.waitForTimeout(2000);
    
    // Wait for participants section to be visible
    await page.waitForSelector('#participantesWrap:not(.hidden)', { timeout: 5000 });
    
    // Click "Agregar participante" to add a participant row
    await page.click('button#addParticipantBtn');
    await page.waitForTimeout(2000);
    
    // Get all options from the participant select dropdown
    const selectExists = await page.locator('#participantsList select').count();
    if (selectExists === 0) {
      throw new Error('No participant select found - form may not have loaded users');
    }
    
    const participantOptions = await page.locator('#participantsList select').first().locator('option').allTextContents();
    console.log('Available participants:', participantOptions);
    
    if (participantOptions.length === 0) {
      throw new Error('Participant dropdown is empty - API may not have loaded');
    }
    
    if (!participantOptions.some(p => p.includes('Active Contact 1'))) {
      throw new Error('Active Contact 1 not found in participants dropdown');
    }
    if (!participantOptions.some(p => p.includes('To Deactivate'))) {
      throw new Error('To Deactivate not found in participants dropdown');
    }
    
    console.log('✅ All contacts appear in movement form');

    // ==================================================================
    // STEP 5: Deactivate Contact
    // ==================================================================
    console.log('📝 Step 5: Deactivating contact...');
    
    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(1000);
    
    // Find "To Deactivate" contact, click three-dots menu, then "Desactivar" button
    const contactItem = page.locator('.contact-item', { hasText: 'To Deactivate' });
    await contactItem.locator('.three-dots-btn').click();
    await page.waitForTimeout(300);
    await contactItem.locator('button[data-action="toggle-active"]').click();
    
    // Wait for confirmation modal and confirm
    await page.waitForTimeout(500);
    await page.locator('#modal-confirm').click();
    
    // Wait for the page to reload/update after toggle
    await page.waitForTimeout(3000);
    
    console.log('✅ Contact deactivated');

    // ==================================================================
    // STEP 6: Verify Contact Deactivated in Database
    // ==================================================================
    console.log('📝 Step 6: Verifying contact is deactivated...');
    
    const contactsAfterDeactivation = await pool.query(
      `SELECT name, is_active FROM contacts 
       WHERE household_id = (SELECT id FROM households WHERE name = $1)
       ORDER BY name`,
      [householdName]
    );
    
    console.log('Contacts after deactivation:', contactsAfterDeactivation.rows);
    
    const deactivatedContact = contactsAfterDeactivation.rows.find(c => c.name === 'To Deactivate');
    if (!deactivatedContact) {
      throw new Error('To Deactivate contact not found');
    }
    if (deactivatedContact.is_active !== false) {
      throw new Error('Contact should be deactivated');
    }
    
    const activeContacts = contactsAfterDeactivation.rows.filter(c => c.is_active === true);
    if (activeContacts.length !== 2) {
      throw new Error('Should have 2 active contacts remaining');
    }
    
    console.log('✅ Contact correctly deactivated in database');

    // ==================================================================
    // STEP 6b: Verify Deactivated Contact NOT in Movement Form
    // ==================================================================
    console.log('📝 Step 6b: Verifying deactivated contact does not appear in form...');
    
    await page.goto(`${appUrl}/registrar-movimiento`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Select "Dividir gasto" again
    await page.click('button.tipo-btn[data-tipo="SPLIT"]');
    await page.waitForTimeout(2000);
    
    // Wait for participants section
    await page.waitForSelector('#participantesWrap:not(.hidden)', { timeout: 5000 });
    
    // Click "Agregar participante"
    await page.click('button#addParticipantBtn');
    await page.waitForTimeout(2000);
    
    // Check participants dropdown
    const participantsAfter = await page.locator('#participantsList select').first().locator('option').allTextContents();
    console.log('Available participants after deactivation:', participantsAfter);
    
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
    
    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(1000);
    
    // Find deactivated contact (inactive contacts are sorted to the bottom)
    const contactToReactivate = page.locator('.contact-item').filter({ hasText: 'To Deactivate' });
    
    // Scroll into view since inactive contacts are at the bottom
    await contactToReactivate.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    
    // Click three-dots menu
    await contactToReactivate.locator('.three-dots-btn').click();
    await page.waitForTimeout(300);
    
    // Click "Activar" button
    await contactToReactivate.locator('button[data-action="toggle-active"]').click();
    
    // Wait for confirmation modal and confirm
    await page.waitForTimeout(500);
    await page.locator('#modal-confirm').click();
    
    // Wait for the page to reload/update
    await page.waitForTimeout(3000);
    
    console.log('✅ Contact reactivated');

    // ==================================================================
    // STEP 8: Verify Contact Reactivated in Database
    // ==================================================================
    console.log('📝 Step 8: Verifying contact is reactivated...');
    
    const contactsAfterReactivation = await pool.query(
      `SELECT name, is_active FROM contacts 
       WHERE household_id = (SELECT id FROM households WHERE name = $1)
       ORDER BY name`,
      [householdName]
    );
    
    console.log('Contacts after reactivation:', contactsAfterReactivation.rows);
    
    const reactivatedContact = contactsAfterReactivation.rows.find(c => c.name === 'To Deactivate');
    if (!reactivatedContact) {
      throw new Error('To Deactivate contact not found');
    }
    if (reactivatedContact.is_active !== true) {
      throw new Error('Contact should be reactivated');
    }
    
    const allActiveAgain = contactsAfterReactivation.rows.every(c => c.is_active === true);
    if (!allActiveAgain) {
      throw new Error('All contacts should be active again');
    }
    
    console.log('✅ Contact correctly reactivated in database');

    // ==================================================================
    // STEP 8b: Verify Reactivated Contact Back in Movement Form
    // ==================================================================
    console.log('📝 Step 8b: Verifying reactivated contact appears in form...');
    
    await page.goto(`${appUrl}/registrar-movimiento`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Select "Dividir gasto"
    await page.click('button.tipo-btn[data-tipo="SPLIT"]');
    await page.waitForTimeout(2000);
    
    // Wait for participants section
    await page.waitForSelector('#participantesWrap:not(.hidden)', { timeout: 5000 });
    
    // Click "Agregar participante"
    await page.click('button#addParticipantBtn');
    await page.waitForTimeout(2000);
    
    // Check participants dropdown
    const participantsFinal = await page.locator('#participantsList select').first().locator('option').allTextContents();
    console.log('Available participants after reactivation:', participantsFinal);
    
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
        await pool.query('DELETE FROM contacts WHERE household_id = $1', [householdId]);
        
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
