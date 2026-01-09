import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Household Management Flow
 * 
 * Tests the complete household functionality:
 * 1. Register two users
 * 2. User 1: Create household
 * 3. User 1: Add contact
 * 4. User 1: Invite User 2 (auto-accept)
 * 5. User 2: Verify household membership
 * 6. User 1: Promote User 2 to owner
 * 7. User 1: Demote User 2 back to member
 * 8. User 1: Remove User 2
 * 9. User 1: Delete household
 */

async function testHouseholdManagement() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const apiUrl = process.env.API_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const user1Email = `owner-${timestamp}@example.com`;
  const user2Email = `member-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Test Household ${timestamp}`;

  try {
    console.log('🚀 Starting Household Management Test');
    console.log('👤 User 1 (Owner):', user1Email);
    console.log('👤 User 2 (Member):', user2Email);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User 1
    // ==================================================================
    console.log('📝 Step 1: Registering User 1 (Owner)...');
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    
    await page1.goto(apiUrl);
    await page1.waitForTimeout(1000);
    
    await page1.getByRole('link', { name: 'Regístrate' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#registerName').fill('Test Owner');
    await page1.locator('#registerEmail').fill(user1Email);
    await page1.locator('#registerPassword').fill(password);
    await page1.locator('#registerConfirm').fill(password);
    
    await page1.getByRole('button', { name: 'Registrarse' }).click();
    await page1.waitForTimeout(2000);
    
    // Should be on registrar-movimiento page
    await page1.waitForURL('**/registrar-movimiento');
    console.log('✅ User 1 registered and logged in');

    // ==================================================================
    // STEP 2: Register User 2
    // ==================================================================
    console.log('📝 Step 2: Registering User 2 (Future Member)...');
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    await page2.goto(apiUrl);
    await page2.waitForTimeout(1000);
    
    await page2.getByRole('link', { name: 'Regístrate' }).click();
    await page2.waitForTimeout(500);
    
    await page2.locator('#registerName').fill('Test Member');
    await page2.locator('#registerEmail').fill(user2Email);
    await page2.locator('#registerPassword').fill(password);
    await page2.locator('#registerConfirm').fill(password);
    
    await page2.getByRole('button', { name: 'Registrarse' }).click();
    await page2.waitForTimeout(2000);
    
    await page2.waitForURL('**/registrar-movimiento');
    console.log('✅ User 2 registered and logged in');

    // ==================================================================
    // STEP 3: User 1 - Create Household
    // ==================================================================
    console.log('🏠 Step 3: User 1 creating household...');
    
    // Go to profile
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
    
    // Verify household name appears
    const householdTitle = await page1.locator('.household-info-large h2').textContent();
    if (!householdTitle.includes(householdName)) {
      throw new Error('Household name not found on page');
    }
    console.log('✅ Household created:', householdName);

    // ==================================================================
    // STEP 4: User 1 - Add Contact
    // ==================================================================
    console.log('📇 Step 4: User 1 adding contact...');
    
    await page1.getByRole('button', { name: '+ Agregar contacto' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#contact-name').fill('Maria External');
    await page1.locator('#contact-email').fill('maria@external.com');
    await page1.locator('#contact-phone').fill('+573001234567');
    await page1.locator('#contact-notes').fill('Friend from work');
    
    await page1.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page1.waitForTimeout(3000); // Wait for reload
    
    // Verify contact appears
    const contactName = await page1.locator('.contact-name').first().textContent();
    if (!contactName.includes('Maria External')) {
      throw new Error('Contact not found');
    }
    console.log('✅ Contact added: Maria External');

    // ==================================================================
    // STEP 5: User 1 - Invite User 2 (Auto-accept)
    // ==================================================================
    console.log('📧 Step 5: User 1 inviting User 2...');
    
    await page1.getByRole('button', { name: '+ Invitar miembro' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#invite-email').fill(user2Email);
    await page1.getByRole('button', { name: 'Enviar invitación' }).click();
    await page1.waitForTimeout(2000);
    
    // Wait for and close success modal
    await page1.waitForSelector('.modal');
    await page1.waitForTimeout(500);
    await page1.locator('.modal button').click(); // Click OK
    await page1.waitForTimeout(2000); // Wait for reload
    
    // Verify User 2 appears in members list
    const memberEmails = await page1.locator('.member-email').allTextContents();
    if (!memberEmails.some(email => email.includes(user2Email))) {
      throw new Error('User 2 not found in members list');
    }
    console.log('✅ User 2 auto-added as member');

    // ==================================================================
    // STEP 6: User 2 - Verify Household Membership
    // ==================================================================
    console.log('👀 Step 6: User 2 verifying membership...');
    
    // Go to profile
    await page2.locator('#hamburger-btn').click();
    await page2.waitForTimeout(500);
    await page2.getByRole('link', { name: 'Perfil' }).click();
    await page2.waitForTimeout(1000);
    
    // Should see household
    const householdCard = await page2.locator('.household-name').textContent();
    if (!householdCard.includes(householdName)) {
      throw new Error('Household not found in User 2 profile');
    }
    console.log('✅ User 2 sees household in profile');
    
    // View household details
    await page2.getByRole('button', { name: 'Ver detalles' }).click();
    await page2.waitForTimeout(1000);
    
    // Verify can see members
    const membersCount = await page2.locator('.member-item').count();
    if (membersCount !== 2) {
      throw new Error(`Expected 2 members, found ${membersCount}`);
    }
    console.log('✅ User 2 can access household page');

    // ==================================================================
    // STEP 7: User 1 - Promote User 2 to Owner
    // ==================================================================
    console.log('⬆️ Step 7: User 1 promoting User 2 to owner...');
    
    await page1.reload();
    await page1.waitForTimeout(1000);
    
    // Find User 2's promote button
    const memberItems = await page1.locator('.member-item').all();
    for (const item of memberItems) {
      const email = await item.locator('.member-email').textContent();
      if (email.includes(user2Email)) {
        const promoteBtn = item.locator('button:has-text("Promover a dueño")');
        if (await promoteBtn.count() > 0) {
          await promoteBtn.click();
          await page1.waitForTimeout(500);
          
          // Confirm modal - use ID selector to be specific
          await page1.locator('#modal-confirm').click();
          await page1.waitForTimeout(2000);
          break;
        }
      }
    }
    
    // Verify User 2 now has owner badge (User 1 view)
    await page1.reload();
    await page1.waitForTimeout(1000);
    
    const ownerBadges = await page1.locator('.role-owner').count();
    if (ownerBadges !== 2) {
      throw new Error(`Expected 2 owners, found ${ownerBadges}`);
    }
    console.log('✅ User 2 promoted to owner (verified in User 1 view)');

    // User 2: Verify promotion from their view
    console.log('👀 User 2 verifying promotion...');
    await page2.reload();
    await page2.waitForTimeout(1000);
    
    // Check if User 2 sees owner badge
    const user2Badges = await page2.locator('.role-owner').count();
    if (user2Badges < 1) {
      throw new Error('User 2 does not see owner badge');
    }
    
    // Check if User 2 now has owner capabilities (can see invite button)
    const inviteButton = await page2.locator('#invite-member-btn').count();
    if (inviteButton === 0) {
      throw new Error('User 2 does not have owner capabilities');
    }
    console.log('✅ User 2 sees owner role and capabilities');

    // ==================================================================
    // STEP 8: User 1 - Demote User 2 Back to Member
    // ==================================================================
    console.log('⬇️ Step 8: User 1 demoting User 2 to member...');
    
    // Find User 2's demote button
    const memberItems2 = await page1.locator('.member-item').all();
    for (const item of memberItems2) {
      const email = await item.locator('.member-email').textContent();
      if (email.includes(user2Email)) {
        const demoteBtn = item.locator('button:has-text("Quitar como dueño")');
        if (await demoteBtn.count() > 0) {
          await demoteBtn.click();
          await page1.waitForTimeout(500);
          
          // Confirm modal
          await page1.locator('#modal-confirm').click();
          await page1.waitForTimeout(2000);
          break;
        }
      }
    }
    
    // Verify User 2 is member again (User 1 view)
    await page1.reload();
    await page1.waitForTimeout(1000);
    
    const ownerBadges2 = await page1.locator('.role-owner').count();
    if (ownerBadges2 !== 1) {
      throw new Error(`Expected 1 owner, found ${ownerBadges2}`);
    }
    console.log('✅ User 2 demoted to member (verified in User 1 view)');

    // User 2: Verify demotion from their view
    console.log('👀 User 2 verifying demotion...');
    await page2.reload();
    await page2.waitForTimeout(1000);
    
    // Check if User 2 sees member badge (not owner)
    const memberBadges = await page2.locator('.role-member').allTextContents();
    const hasMemberBadge = memberBadges.some(badge => badge.includes('Miembro'));
    if (!hasMemberBadge) {
      throw new Error('User 2 does not see member badge');
    }
    
    // Check if User 2 no longer has owner capabilities (no invite button)
    const inviteButton2 = await page2.locator('#invite-member-btn').count();
    if (inviteButton2 > 0) {
      throw new Error('User 2 still has owner capabilities');
    }
    console.log('✅ User 2 sees member role (no owner capabilities)');

    // ==================================================================
    // STEP 9: User 1 - Remove User 2
    // ==================================================================
    console.log('🗑️ Step 9: User 1 removing User 2...');
    
    // Find User 2's remove button
    const memberItems3 = await page1.locator('.member-item').all();
    for (const item of memberItems3) {
      const email = await item.locator('.member-email').textContent();
      if (email.includes(user2Email)) {
        const removeBtn = item.locator('button:has-text("Remover")');
        await removeBtn.click();
        await page1.waitForTimeout(500);
        
        // Confirm modal
        await page1.locator('#modal-confirm').click();
        await page1.waitForTimeout(2000);
        break;
      }
    }
    
    // Verify only 1 member now
    await page1.reload();
    await page1.waitForTimeout(1000);
    
    const finalMembersCount = await page1.locator('.member-item').count();
    if (finalMembersCount !== 1) {
      throw new Error(`Expected 1 member, found ${finalMembersCount}`);
    }
    console.log('✅ User 2 removed from household');

    // ==================================================================
    // STEP 10: User 2 - Verify No Longer Has Household
    // ==================================================================
    console.log('🔍 Step 10: User 2 verifying removal...');
    
    // Navigate to profile to check
    await page2.locator('#hamburger-btn').click();
    await page2.waitForTimeout(500);
    await page2.getByRole('link', { name: 'Perfil', exact: true }).click();
    await page2.waitForTimeout(1000);
    
    // Should see no household
    const noHouseholdText = await page2.locator('.no-household-text').first().textContent();
    if (!noHouseholdText.includes('no tienes un hogar')) {
      throw new Error('User 2 still has household access');
    }
    console.log('✅ User 2 no longer has household');

    // ==================================================================
    // STEP 11: User 1 - Delete Household
    // ==================================================================
    console.log('🗑️ Step 11: User 1 deleting household...');
    
    // Click household three-dots menu
    await page1.locator('#household-menu-btn').click();
    await page1.waitForTimeout(300);
    
    // Click "Eliminar hogar" in the menu
    await page1.locator('button[data-action="delete-household"]').click();
    await page1.waitForTimeout(500);
    
    // Type "eliminar" in confirmation
    await page1.locator('#confirm-input').fill('eliminar');
    await page1.waitForTimeout(500);
    
    await page1.locator('#modal-confirm').click();
    await page1.waitForTimeout(2000);
    
    // Should be back at profile
    await page1.waitForURL('**/perfil');
    
    // Verify no household
    const noHousehold = await page1.locator('.no-household-text').first().textContent();
    if (!noHousehold.includes('no tienes un hogar')) {
      throw new Error('Household not deleted');
    }
    console.log('✅ Household deleted successfully');

    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    // Delete test users
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [user1Email, user2Email]);
    console.log('✅ Test users deleted');

    console.log('');
    console.log('✅ ✅ ✅ ALL TESTS PASSED! ✅ ✅ ✅');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    await browser.close();
  }
}

// Run the test
testHouseholdManagement();
