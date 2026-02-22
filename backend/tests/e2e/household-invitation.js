import { chromium } from 'playwright';
import pg from 'pg';
import { skipOnboardingWizard, completeOnboardingViaDB } from './helpers/onboarding-helpers.js';
const { Pool } = pg;

/**
 * Test Household Invitation Email Flow
 * 
 * Tests the complete invitation via email flow:
 * 1. User 1 registers and creates household
 * 2. User 1 invites a new email (not registered yet)
 * 3. Get invitation token from database
 * 4. User 2 registers with that email
 * 5. User 2 visits /invite?token=xxx
 * 6. Verify User 2 is now a member of the household
 */

async function testHouseholdInvitation() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const apiUrl = process.env.API_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const user1Email = `inviter-${timestamp}@example.com`;
  const user2Email = `invitee-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Invitation Test ${timestamp}`;

  try {
    console.log('🚀 Starting Household Invitation Email Flow Test');
    console.log('👤 User 1 (Inviter):', user1Email);
    console.log('👤 User 2 (Invitee):', user2Email);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User 1
    // ==================================================================
    console.log('📝 Step 1: Registering User 1 (Inviter)...');
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    
    await page1.goto(apiUrl);
    await page1.waitForTimeout(1000);
    
    await page1.getByRole('link', { name: 'Regístrate' }).click();
    await page1.waitForTimeout(500);
    
    await page1.locator('#registerName').fill('Test Inviter');
    await page1.locator('#registerEmail').fill(user1Email);
    await page1.locator('#registerPassword').fill(password);
    await page1.locator('#registerConfirm').fill(password);
    
    await page1.getByRole('button', { name: 'Registrarse' }).click();
    await page1.waitForTimeout(2000);
    
    console.log('✅ User 1 registered and logged in');

    // ==================================================================
    // STEP 2: User 1 creates household
    // ==================================================================
    console.log('🏠 Step 2: User 1 creating household...');
    
    // Should be on welcome page
    await page1.goto(`${apiUrl}/`);
    await page1.waitForTimeout(2000);
    
    // Click "Crear mi hogar" button
    await page1.locator('#create-household-btn').click();
    await page1.waitForTimeout(500);
    
    // Fill household name in modal
    await page1.locator('#household-name-input').fill(householdName);
    
    // Click create button
    await page1.locator('#household-create-btn').click();
    await page1.waitForTimeout(2000);
    
    // Complete onboarding BEFORE dismissing modal (which triggers page reload)
    const user1Query = await pool.query('SELECT id FROM users WHERE email = $1', [user1Email]);
    const user1Id = user1Query.rows[0].id;
    await completeOnboardingViaDB(pool, user1Id);

    // Click OK on success modal
    await page1.locator('#modal-ok').click();
    await page1.waitForTimeout(2000);

    
    console.log('✅ Household created');

    // ==================================================================
    // STEP 3: User 1 invites User 2 (not registered yet)
    // ==================================================================
    console.log('📧 Step 3: User 1 inviting User 2 (new email)...');
    
    // Navigate to household page
    await page1.goto(`${apiUrl}/hogar`);
    await page1.waitForTimeout(2000);
    
    // Find and click "Invitar miembro" button
    await page1.locator('#invite-member-btn').click();
    await page1.waitForTimeout(500);
    
    // Fill email input in the invite form
    await page1.locator('#invite-email').fill(user2Email);
    
    // Submit the form (click the submit button)
    await page1.locator('#invite-form button[type="submit"]').click();
    await page1.waitForTimeout(2000);
    
    // Close success modal
    await page1.locator('#modal-ok').click();
    await page1.waitForTimeout(500);
    
    console.log('✅ Invitation sent to', user2Email);

    // ==================================================================
    // STEP 4: Get invitation token from database
    // ==================================================================
    console.log('🔍 Step 4: Getting invitation token from database...');
    
    const result = await pool.query(
      `SELECT token FROM household_invitations WHERE email = $1 AND accepted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [user2Email]
    );
    
    if (result.rows.length === 0) {
      throw new Error('No invitation found in database');
    }
    
    const invitationToken = result.rows[0].token;
    console.log('✅ Got invitation token');

    // ==================================================================
    // STEP 5: User 2 registers with the invited email
    // ==================================================================
    console.log('📝 Step 5: Registering User 2 (Invitee)...');
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    await page2.goto(apiUrl);
    await page2.waitForTimeout(1000);
    
    await page2.getByRole('link', { name: 'Regístrate' }).click();
    await page2.waitForTimeout(500);
    
    await page2.locator('#registerName').fill('Test Invitee');
    await page2.locator('#registerEmail').fill(user2Email);
    await page2.locator('#registerPassword').fill(password);
    await page2.locator('#registerConfirm').fill(password);
    
    await page2.getByRole('button', { name: 'Registrarse' }).click();
    await page2.waitForTimeout(2000);
    
    console.log('✅ User 2 registered and logged in');

    // ==================================================================
    // STEP 6: User 2 visits invitation link
    // ==================================================================
    console.log('🔗 Step 6: User 2 visiting invitation link...');
    
    await page2.goto(`${apiUrl}/invite?token=${invitationToken}`);
    await page2.waitForTimeout(2000);
    
    // Wait for confirmation modal to appear
    await page2.waitForSelector('#accept-btn', { timeout: 5000 });
    
    // Verify household name is shown in confirmation
    const householdNameShown = await page2.locator('#household-name').textContent();
    console.log('📋 Household shown:', householdNameShown);
    
    if (householdNameShown !== householdName) {
      throw new Error(`Expected household name "${householdName}" but got "${householdNameShown}"`);
    }
    
    // Click "Unirme" button to accept
    await page2.locator('#accept-btn').click();
    await page2.waitForTimeout(2000);
    
    // Check for success message
    const resultMessage = await page2.locator('#result-message').textContent();
    console.log('📋 Result message:', resultMessage);
    
    if (!resultMessage.includes('exitosamente') && !resultMessage.includes('uniste')) {
      throw new Error(`Unexpected result message: ${resultMessage}`);
    }
    
    console.log('✅ Invitation accepted successfully');

    // ==================================================================
    // STEP 7: Verify User 2 is now a member in database
    // ==================================================================
    console.log('🔍 Step 7: Verifying membership in database...');
    
    // Click continue button first
    await page2.locator('#continue-btn').click();
    await page2.waitForTimeout(1000);
    
    const memberResult = await pool.query(
      `SELECT hm.* FROM household_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE u.email = $1`,
      [user2Email]
    );
    
    if (memberResult.rows.length === 0) {
      throw new Error('User 2 not found as household member in database');
    }
    
    console.log('✅ Database confirms User 2 is a household member');

    // ==================================================================
    // STEP 8: Verify invitation is marked as accepted
    // ==================================================================
    console.log('🔍 Step 8: Verifying invitation is marked accepted...');
    
    const invResult = await pool.query(
      `SELECT accepted_at FROM household_invitations WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
      [user2Email]
    );
    
    if (invResult.rows.length === 0 || !invResult.rows[0].accepted_at) {
      throw new Error('Invitation not marked as accepted in database');
    }
    
    console.log('✅ Invitation marked as accepted in database');

    // ==================================================================
    // STEP 9: Verify UI shows household (basic check)
    // ==================================================================
    console.log('🔍 Step 9: Verifying UI shows household content...');
    
    // Navigate to household page
    await page2.goto(`${apiUrl}/hogar`);
    await page2.waitForTimeout(2000);
    
    // Verify the page loaded and we can see household info (not welcome screen)
    const pageContent = await page2.content();
    if (pageContent.includes('Crear mi hogar') || pageContent.includes('¡Bienvenido a Conti!')) {
      throw new Error('User 2 is still seeing welcome screen, not a member');
    }
    
    // Check that the household name appears somewhere in the page
    if (!pageContent.includes(householdName)) {
      throw new Error('Household name not found in page content');
    }
    
    console.log('✅ UI shows household content correctly');

    // ==================================================================
    // STEP 10: Test User 3 - Opens invite link WITHOUT being registered
    // ==================================================================
    console.log('');
    console.log('👤 TESTING USER 3: Unregistered user opens invite link');
    console.log('');
    
    const user3Email = `invitee3-${timestamp}@example.com`;
    
    // User 1 invites User 3
    console.log('📧 Step 10a: User 1 inviting User 3...');
    await page1.goto(`${apiUrl}/hogar`);
    await page1.waitForTimeout(2000);
    
    await page1.locator('#invite-member-btn').click();
    await page1.waitForTimeout(500);
    await page1.locator('#invite-email').fill(user3Email);
    await page1.locator('#invite-form button[type="submit"]').click();
    await page1.waitForTimeout(2000);
    await page1.locator('#modal-ok').click();
    await page1.waitForTimeout(500);
    
    console.log('✅ Invitation sent to', user3Email);
    
    // Get User 3's invitation token
    console.log('🔍 Step 10b: Getting User 3 invitation token...');
    const result3 = await pool.query(
      `SELECT token FROM household_invitations WHERE email = $1 AND accepted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [user3Email]
    );
    
    if (result3.rows.length === 0) {
      throw new Error('No invitation found for User 3');
    }
    const user3Token = result3.rows[0].token;
    console.log('✅ Got User 3 invitation token');
    
    // User 3 opens invite link WITHOUT being logged in (new context = no session)
    console.log('🔗 Step 10c: User 3 opens invite link without being logged in...');
    const context3 = await browser.newContext();
    const page3 = await context3.newPage();
    
    // Navigate directly to invite URL
    await page3.goto(`${apiUrl}/invite?token=${user3Token}`);
    await page3.waitForTimeout(2000);
    
    // The invite page can fetch info (GET is public) and show confirmation
    // Wait for confirmation modal to appear
    await page3.waitForSelector('#accept-btn', { timeout: 5000 });
    
    // Verify household name is shown
    const household3Shown = await page3.locator('#household-name').textContent();
    console.log('📋 User 3 sees household:', household3Shown);
    console.log('✅ User 3 can see invitation info without being logged in');
    
    // Click "Unirme" - this should redirect to login (not logged in)
    console.log('🔗 Step 10d: User 3 clicks Unirme and is redirected to login...');
    await page3.locator('#accept-btn').click();
    await page3.waitForTimeout(2000);
    
    // Should be redirected to login
    const currentUrl = page3.url();
    console.log('📍 Current URL:', currentUrl);
    
    if (!currentUrl.includes('/login')) {
      throw new Error('User 3 was not redirected to login page');
    }
    console.log('✅ User 3 redirected to login page');
    
    // User 3 registers
    console.log('📝 Step 10e: User 3 registers...');
    await page3.getByRole('link', { name: 'Regístrate' }).click();
    await page3.waitForTimeout(500);
    
    await page3.locator('#registerName').fill('Test Invitee 3');
    await page3.locator('#registerEmail').fill(user3Email);
    await page3.locator('#registerPassword').fill(password);
    await page3.locator('#registerConfirm').fill(password);
    
    await page3.getByRole('button', { name: 'Registrarse' }).click();
    await page3.waitForTimeout(3000);
    
    // After registration, should be redirected back to invite page automatically
    console.log('🔗 Step 10f: User 3 is redirected back to invite page...');
    const urlAfterRegister = page3.url();
    console.log('📍 URL after register:', urlAfterRegister);
    
    // Wait for redirect and confirmation modal
    await page3.waitForTimeout(2000);
    await page3.waitForSelector('#accept-btn', { timeout: 5000 });
    
    // Now logged in, click accept again
    console.log('✅ User 3 back on invite page, clicking Unirme...');
    await page3.locator('#accept-btn').click();
    await page3.waitForTimeout(2000);
    
    // Check for success
    const successMessage = await page3.locator('#result-message').textContent();
    console.log('📋 Result after accept:', successMessage);
    
    if (!successMessage.includes('exitosamente') && !successMessage.includes('uniste')) {
      throw new Error(`User 3 invite failed: ${successMessage}`);
    }
    
    console.log('✅ User 3 accepted invitation after registration');
    
    // Verify User 3 is a member in database
    console.log('🔍 Step 10g: Verifying User 3 membership in database...');
    const member3Result = await pool.query(
      `SELECT hm.* FROM household_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE u.email = $1`,
      [user3Email]
    );
    
    if (member3Result.rows.length === 0) {
      throw new Error('User 3 not found as household member in database');
    }
    
    console.log('✅ Database confirms User 3 is a household member');
    
    await context3.close();

    // ==================================================================
    // SUCCESS
    // ==================================================================
    console.log('');
    console.log('🎉 ====================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
    console.log('🎉 ====================================');

    await context1.close();
    await context2.close();
    await browser.close();
    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ ====================================');
    console.error('❌ TEST FAILED');
    console.error('❌ ====================================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    await browser.close();
    await pool.end();
    process.exit(1);
  }
}

testHouseholdInvitation();
