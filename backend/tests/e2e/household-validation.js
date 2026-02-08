import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Household Form Validations
 * 
 * Tests validation in household-related forms:
 * 1. Contact form - email validation
 * 2. Contact form - phone validation
 * 3. Invite member form - email validation
 */

async function testHouseholdValidation() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const apiUrl = process.env.API_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';
  
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Database connection
  const pool = new Pool({
    connectionString: dbUrl
  });

  const timestamp = Date.now();
  const userEmail = `validation-test-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Validation Test ${timestamp}`;

  try {
    console.log('🚀 Starting Household Validation Test');
    console.log('👤 User:', userEmail);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User and Create Household
    // ==================================================================
    console.log('📝 Step 1: Setting up test environment...');
    
    await page.goto(apiUrl);
    await page.waitForTimeout(1000);
    
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#registerName').fill('Validation Test User');
    await page.locator('#registerEmail').fill(userEmail);
    await page.locator('#registerPassword').fill(password);
    await page.locator('#registerConfirm').fill(password);
    
    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);
    
    // After registration, user is logged in
    
    // Go to profile and create household
    await page.locator('#hamburger-btn').click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Perfil', exact: true }).click();
    await page.waitForTimeout(1000);
    
    await page.getByRole('button', { name: 'Crear hogar' }).click();
    await page.waitForTimeout(500);
    
    await page.locator('#household-name-input').fill(householdName);
    await page.locator('#household-create-btn').click();
    await page.waitForTimeout(1000);
    await page.locator('#modal-ok').click();
    await page.waitForTimeout(2000);
    
    // Navigate to household page
    await page.goto(`${apiUrl}/hogar`);
    await page.waitForTimeout(1000);
    
    console.log('✅ Test environment ready');

    // ==================================================================
    // STEP 2: Test Contact Email Validation
    // ==================================================================
    console.log('📧 Step 2: Testing contact email validation...');
    
    await page.getByRole('button', { name: '+ Agregar contacto' }).click();
    await page.waitForTimeout(500);
    
    // Fill valid name first
    await page.locator('#contact-name').fill('Test Contact');
    
    // Test invalid email formats
    const invalidEmails = [
      'notanemail',
      'missing@',
      'missing@domain',
      '@nodomain.com',
      'spaces in@email.com'
    ];
    
    for (const invalidEmail of invalidEmails) {
      await page.locator('#contact-email').fill(invalidEmail);
      await page.locator('#contact-email').blur(); // Trigger validation
      await page.waitForTimeout(300);
      
      // Check if field has invalid class
      const hasInvalidClass = await page.locator('#contact-email.invalid').count() > 0;
      if (!hasInvalidClass) {
        throw new Error(`Email "${invalidEmail}" should be invalid but wasn't marked as such`);
      }
      
      // Check if hint is visible
      const hintVisible = await page.locator('#email-hint').isVisible();
      if (!hintVisible) {
        throw new Error(`Email hint should be visible for "${invalidEmail}"`);
      }
    }
    
    console.log('✅ Invalid email formats correctly rejected');
    
    // Test valid email
    await page.locator('#contact-email').fill('valid@email.com');
    await page.locator('#contact-email').blur();
    await page.waitForTimeout(300);
    
    const hasValidClass = await page.locator('#contact-email.valid').count() > 0;
    if (!hasValidClass) {
      throw new Error('Valid email should be marked as valid');
    }
    
    const hintHidden = !(await page.locator('#email-hint').isVisible());
    if (!hintHidden) {
      throw new Error('Email hint should be hidden for valid email');
    }
    
    console.log('✅ Valid email format accepted');

    // ==================================================================
    // STEP 3: Test Contact Phone Validation
    // ==================================================================
    console.log('📱 Step 3: Testing contact phone validation...');
    
    // Test invalid phone formats
    const invalidPhones = [
      '300 123 4567',        // spaces
      '(300) 123-4567',      // parentheses and dashes
      '300-123-4567',        // dashes
      '123456789',           // too short (9 digits)
      '123456789012345',     // too long (15 digits)
      '+1234567890123456',   // + with 16 digits (max is +13)
      'abc1234567890',       // letters
    ];
    
    for (const invalidPhone of invalidPhones) {
      await page.locator('#contact-phone').fill(invalidPhone);
      await page.locator('#contact-phone').blur();
      await page.waitForTimeout(300);
      
      const hasInvalidClass = await page.locator('#contact-phone.invalid').count() > 0;
      if (!hasInvalidClass) {
        throw new Error(`Phone "${invalidPhone}" should be invalid but wasn't marked as such`);
      }
      
      const hintVisible = await page.locator('#phone-hint').isVisible();
      if (!hintVisible) {
        throw new Error(`Phone hint should be visible for "${invalidPhone}"`);
      }
    }
    
    console.log('✅ Invalid phone formats correctly rejected');
    
    // Test valid phone formats
    const validPhones = [
      '3001234567',          // 10 digits
      '12345678901234',      // 14 digits
      '+573001234567',       // + with 12 digits
      '+1234567890123',      // + with 13 digits (max)
    ];
    
    for (const validPhone of validPhones) {
      await page.locator('#contact-phone').fill(validPhone);
      await page.locator('#contact-phone').blur();
      await page.waitForTimeout(300);
      
      const hasValidClass = await page.locator('#contact-phone.valid').count() > 0;
      if (!hasValidClass) {
        throw new Error(`Phone "${validPhone}" should be valid but was marked as invalid`);
      }
      
      const hintHidden = !(await page.locator('#phone-hint').isVisible());
      if (!hintHidden) {
        throw new Error(`Phone hint should be hidden for valid phone "${validPhone}"`);
      }
    }
    
    console.log('✅ Valid phone formats accepted');

    // ==================================================================
    // STEP 4: Test Form Submission with Invalid Data
    // ==================================================================
    console.log('🚫 Step 4: Testing form submission blocks invalid data...');
    
    // Try to submit with invalid email
    // Clear fields first to ensure clean state - use fill('') for reliability in CI
    await page.locator('#contact-email').fill('');
    await page.waitForTimeout(100);
    await page.locator('#contact-email').fill('invalid@email');
    await page.locator('#contact-phone').fill('');
    await page.waitForTimeout(100);
    await page.locator('#contact-phone').fill('3001234567'); // valid phone
    
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.waitForTimeout(1000);
    
    // Should still be on the form (not submitted)
    const errorVisible = await page.locator('#contact-error').isVisible();
    if (!errorVisible) {
      throw new Error('Error should be shown for invalid email on submit');
    }
    
    const errorText = await page.locator('#contact-error').textContent();
    if (!errorText.includes('email')) {
      throw new Error('Error message should mention email');
    }
    
    console.log('✅ Form submission blocked for invalid email');
    
    // Try to submit with invalid phone
    // Clear and refill email to ensure it's valid - use fill('') instead of clear() for reliability in CI
    await page.locator('#contact-email').fill(''); // Clear by filling empty string
    await page.waitForTimeout(100);
    await page.locator('#contact-email').fill('test@test.test'); // fix email with obviously valid format
    await page.locator('#contact-email').blur(); // Trigger validation
    await page.waitForTimeout(300); // Give time for validation to complete
    
    // Clear phone field using fill('') for reliability in CI
    await page.locator('#contact-phone').fill(''); // Clear by filling empty string
    await page.waitForTimeout(100);
    await page.locator('#contact-phone').fill('123'); // invalid phone
    await page.locator('#contact-phone').blur(); // Trigger validation
    await page.waitForTimeout(300); // Give time for validation to complete
    
    // Debug: Check what the actual values are
    const emailValue = await page.locator('#contact-email').inputValue();
    const phoneValue = await page.locator('#contact-phone').inputValue();
    console.log('📧 Email value before submission:', JSON.stringify(emailValue));
    console.log('📱 Phone value before submission:', JSON.stringify(phoneValue));
    
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.waitForTimeout(1000);
    
    const phoneErrorVisible = await page.locator('#contact-error').isVisible();
    if (!phoneErrorVisible) {
      throw new Error('Error should be shown for invalid phone on submit');
    }
    
    const phoneErrorText = await page.locator('#contact-error').textContent();
    console.log('📋 Phone error text:', JSON.stringify(phoneErrorText));
    if (!phoneErrorText.includes('teléfono')) {
      throw new Error(`Error message should mention phone. Got: "${phoneErrorText}"`);
    }
    
    console.log('✅ Form submission blocked for invalid phone');

    // ==================================================================
    // STEP 5: Test Form Submission with Valid Data
    // ==================================================================
    console.log('✅ Step 5: Testing successful submission with valid data...');
    
    // Clear and fill with valid data - clear error state from previous step
    await page.locator('#contact-email').fill('');
    await page.waitForTimeout(100);
    await page.locator('#contact-email').fill('maria@example.com');
    await page.locator('#contact-email').blur();
    await page.waitForTimeout(300);
    
    await page.locator('#contact-phone').fill('');
    await page.waitForTimeout(100);
    await page.locator('#contact-phone').fill('+573001234567');
    await page.locator('#contact-phone').blur();
    await page.waitForTimeout(300);
    
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.waitForTimeout(3000);
    
    // Verify contact was added
    const contactExists = await page.locator('.contact-name:has-text("Test Contact")').count() > 0;
    if (!contactExists) {
      throw new Error('Contact should have been added with valid data');
    }
    
    console.log('✅ Contact successfully added with valid data');

    // ==================================================================
    // STEP 6: Test Invite Member Email Validation
    // ==================================================================
    console.log('📧 Step 6: Testing invite member email validation...');
    
    await page.getByRole('button', { name: '+ Invitar miembro' }).click();
    await page.waitForTimeout(500);
    
    // Test invalid email in invite form
    await page.locator('#invite-email').fill('invalid@email');
    await page.locator('#invite-email').blur();
    await page.waitForTimeout(300);
    
    const inviteInvalidClass = await page.locator('#invite-email.invalid').count() > 0;
    if (!inviteInvalidClass) {
      throw new Error('Invite email should be marked as invalid');
    }
    
    const inviteHintVisible = await page.locator('#invite-email-hint').isVisible();
    if (!inviteHintVisible) {
      throw new Error('Invite email hint should be visible for invalid email');
    }
    
    console.log('✅ Invite form shows invalid email correctly');
    
    // Try to submit with invalid email
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await page.waitForTimeout(1000);
    
    const inviteErrorVisible = await page.locator('#invite-error').isVisible();
    if (!inviteErrorVisible) {
      throw new Error('Error should be shown for invalid invite email on submit');
    }
    
    console.log('✅ Invite submission blocked for invalid email');
    
    // Test valid email
    await page.locator('#invite-email').fill('validuser@example.com');
    await page.locator('#invite-email').blur();
    await page.waitForTimeout(300);
    
    const inviteValidClass = await page.locator('#invite-email.valid').count() > 0;
    if (!inviteValidClass) {
      throw new Error('Valid invite email should be marked as valid');
    }
    
    console.log('✅ Valid invite email accepted');

    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    // Delete household first (cascade will delete contacts)
    // Click household three-dots menu
    await page.locator('#household-menu-btn').click();
    await page.waitForTimeout(300);
    
    // Click "Eliminar hogar" in the menu
    await page.locator('button[data-action="delete-household"]').click();
    await page.waitForTimeout(500);
    await page.locator('#confirm-input').fill('eliminar');
    await page.waitForTimeout(500);
    await page.locator('#modal-confirm').click();
    await page.waitForTimeout(2000);
    
    // Delete test user
    await pool.query('DELETE FROM users WHERE email = $1', [userEmail]);
    console.log('✅ Test data cleaned up');

    console.log('');
    console.log('✅ ✅ ✅ ALL VALIDATION TESTS PASSED! ✅ ✅ ✅');
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
testHouseholdValidation();
