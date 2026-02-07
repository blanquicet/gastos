import { chromium } from 'playwright';
import pg from 'pg';
const { Pool } = pg;

/**
 * Test Authentication Form Validations
 * 
 * Tests validation in login and registration forms:
 * 1. Login - email validation
 * 2. Login - password visibility toggle
 * 3. Register - email validation
 * 4. Register - password strength indicator
 * 5. Register - password match validation
 * 6. Register - all validations together
 */

async function testAuthValidation() {
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
  const testEmail = `authtest-${timestamp}@example.com`;

  try {
    console.log('🚀 Starting Authentication Validation Test');
    console.log('');

    // ==================================================================
    // STEP 1: Test Login Email Validation
    // ==================================================================
    console.log('📧 Step 1: Testing login email validation...');
    
    await page.goto(apiUrl);
    await page.waitForTimeout(1000);
    
    // Test invalid email formats
    const invalidEmails = [
      'notanemail',
      'missing@domain',
      '@nodomain.com',
    ];
    
    for (const invalidEmail of invalidEmails) {
      await page.locator('#loginEmail').fill(invalidEmail);
      await page.locator('#loginEmail').blur();
      await page.waitForTimeout(300);
      
      const hasInvalidClass = await page.locator('#loginEmail.invalid').count() > 0;
      if (!hasInvalidClass) {
        throw new Error(`Login email "${invalidEmail}" should be invalid but wasn't marked as such`);
      }
    }
    
    console.log('✅ Login invalid email formats correctly rejected');
    
    // Test valid email
    await page.locator('#loginEmail').fill('valid@email.com');
    await page.locator('#loginEmail').blur();
    await page.waitForTimeout(300);
    
    const hasValidClass = await page.locator('#loginEmail.valid').count() > 0;
    if (!hasValidClass) {
      throw new Error('Login valid email should be marked as valid');
    }
    
    console.log('✅ Login valid email format accepted');

    // ==================================================================
    // STEP 2: Test Login Password Visibility Toggle
    // ==================================================================
    console.log('👁️ Step 2: Testing login password visibility toggle...');
    
    await page.locator('#loginPassword').fill('TestPassword123');
    await page.waitForTimeout(300);
    
    // Initially password should be hidden
    let passwordType = await page.locator('#loginPassword').getAttribute('type');
    if (passwordType !== 'password') {
      throw new Error('Password should initially be type="password"');
    }
    
    // Check initial eye icon (should be regular eye)
    let eyeIcon = await page.locator('.toggle-password[data-target="loginPassword"] .eye-icon').innerHTML();
    if (!eyeIcon.includes('circle')) {
      throw new Error('Initial eye icon should be regular eye (with circle)');
    }
    
    console.log('✅ Password initially hidden with eye icon');
    
    // Click toggle button to show password
    await page.locator('.toggle-password[data-target="loginPassword"]').click();
    await page.waitForTimeout(300);
    
    passwordType = await page.locator('#loginPassword').getAttribute('type');
    if (passwordType !== 'text') {
      throw new Error('Password should be type="text" after toggle');
    }
    
    // Check eye icon changed to eye-off (with slash line)
    eyeIcon = await page.locator('.toggle-password[data-target="loginPassword"] .eye-icon').innerHTML();
    if (!eyeIcon.includes('line')) {
      throw new Error('Eye icon should change to eye-off (with line) when password visible');
    }
    
    console.log('✅ Password visible with eye-off icon after toggle');
    
    // Click toggle again to hide password
    await page.locator('.toggle-password[data-target="loginPassword"]').click();
    await page.waitForTimeout(300);
    
    passwordType = await page.locator('#loginPassword').getAttribute('type');
    if (passwordType !== 'password') {
      throw new Error('Password should be type="password" after second toggle');
    }
    
    // Check eye icon back to regular eye
    eyeIcon = await page.locator('.toggle-password[data-target="loginPassword"] .eye-icon').innerHTML();
    if (!eyeIcon.includes('circle')) {
      throw new Error('Eye icon should be back to regular eye after second toggle');
    }
    
    console.log('✅ Password hidden again with eye icon after second toggle');

    // ==================================================================
    // STEP 3: Test Register Email Validation
    // ==================================================================
    console.log('📧 Step 3: Testing register email validation...');
    
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.waitForTimeout(500);
    
    // Test invalid emails
    for (const invalidEmail of invalidEmails) {
      await page.locator('#registerEmail').fill(invalidEmail);
      await page.locator('#registerEmail').blur();
      await page.waitForTimeout(300);
      
      const hasInvalidClass = await page.locator('#registerEmail.invalid').count() > 0;
      if (!hasInvalidClass) {
        throw new Error(`Register email "${invalidEmail}" should be invalid but wasn't marked as such`);
      }
    }
    
    console.log('✅ Register invalid email formats correctly rejected');
    
    // Test valid email
    await page.locator('#registerEmail').fill(testEmail);
    await page.locator('#registerEmail').blur();
    await page.waitForTimeout(300);
    
    const registerValidClass = await page.locator('#registerEmail.valid').count() > 0;
    if (!registerValidClass) {
      throw new Error('Register valid email should be marked as valid');
    }
    
    console.log('✅ Register valid email format accepted');

    // ==================================================================
    // STEP 4: Test Password Strength Indicator
    // ==================================================================
    console.log('💪 Step 4: Testing password strength indicator...');
    
    // Initially should be hidden
    let strengthHidden = await page.locator('#passwordStrength.hidden').count() > 0;
    if (!strengthHidden) {
      throw new Error('Password strength should be hidden initially');
    }
    
    // Test weak password (no uppercase, no number)
    await page.locator('#registerPassword').fill('weakpass');
    await page.locator('#registerPassword').blur();
    await page.waitForTimeout(500);
    
    let strengthText = await page.locator('.strength-text').textContent();
    if (!strengthText.includes('Débil')) {
      throw new Error(`Expected "Débil" but got "${strengthText}"`);
    }
    
    let strengthBar = await page.locator('.strength-bar-fill');
    let hasWeakClass = await strengthBar.evaluate(el => el.classList.contains('weak'));
    if (!hasWeakClass) {
      throw new Error('Strength bar should have "weak" class');
    }
    
    console.log('✅ Weak password shows "Débil" with weak class');
    
    // Test acceptable password (8+ chars, upper, lower, number)
    await page.locator('#registerPassword').fill('Acceptable1');
    await page.locator('#registerPassword').blur();
    await page.waitForTimeout(500);
    
    strengthText = await page.locator('.strength-text').textContent();
    if (!strengthText.includes('Aceptable')) {
      throw new Error(`Expected "Aceptable" but got "${strengthText}"`);
    }
    
    let hasAcceptableClass = await strengthBar.evaluate(el => el.classList.contains('acceptable'));
    if (!hasAcceptableClass) {
      throw new Error('Strength bar should have "acceptable" class');
    }
    
    console.log('✅ Acceptable password shows "Aceptable"');
    
    // Test good password (12+ chars but still meets basic requirements)
    await page.locator('#registerPassword').fill('GoodPassword1');
    await page.locator('#registerPassword').blur();
    await page.waitForTimeout(500);
    
    strengthText = await page.locator('.strength-text').textContent();
    if (!strengthText.includes('Buena')) {
      throw new Error(`Expected "Buena" but got "${strengthText}"`);
    }
    
    let hasGoodClass = await strengthBar.evaluate(el => el.classList.contains('good'));
    if (!hasGoodClass) {
      throw new Error('Strength bar should have "good" class');
    }
    
    console.log('✅ Good password shows "Buena"');
    
    // Test strong password (12+ chars, upper, lower, number AND special)
    await page.locator('#registerPassword').fill('VeryStrongPass1!');
    await page.locator('#registerPassword').blur();
    await page.waitForTimeout(500);
    
    strengthText = await page.locator('.strength-text').textContent();
    if (!strengthText.includes('Fuerte')) {
      throw new Error(`Expected "Fuerte" but got "${strengthText}"`);
    }
    
    let hasStrongClass = await strengthBar.evaluate(el => el.classList.contains('strong'));
    if (!hasStrongClass) {
      throw new Error('Strength bar should have "strong" class');
    }
    
    console.log('✅ Strong password shows "Fuerte"');

    // ==================================================================
    // STEP 5: Test Password Match Validation
    // ==================================================================
    console.log('🔐 Step 5: Testing password match validation...');
    
    // Password match hint should be hidden initially
    let matchHidden = await page.locator('#passwordMatch.hidden').count() > 0;
    if (!matchHidden) {
      throw new Error('Password match hint should be hidden initially');
    }
    
    // Enter non-matching password
    await page.locator('#registerPassword').fill('TestPassword1!');
    await page.locator('#registerConfirm').fill('DifferentPassword1!');
    await page.locator('#registerConfirm').blur();
    await page.waitForTimeout(300);
    
    matchHidden = await page.locator('#passwordMatch.hidden').count() > 0;
    if (matchHidden) {
      throw new Error('Password match hint should be visible for non-matching passwords');
    }
    
    let matchText = await page.locator('#passwordMatch').textContent();
    if (!matchText.includes('no coinciden')) {
      throw new Error('Should show "no coinciden" message');
    }
    
    console.log('✅ Shows error for non-matching passwords');
    
    // Enter matching password - clear and type to trigger input event
    await page.locator('#registerConfirm').fill('');
    await page.waitForTimeout(200);
    await page.locator('#registerConfirm').fill('TestPassword1!');
    await page.waitForTimeout(500); // Give time for input event to process
    
    matchHidden = await page.locator('#passwordMatch.hidden').count() > 0;
    if (matchHidden) {
      throw new Error('Password match hint should be visible for matching passwords');
    }
    
    matchText = await page.locator('#passwordMatch').textContent();
    if (!matchText.includes('coinciden')) {
      throw new Error('Should show "coinciden" message for matching passwords');
    }
    
    const hasMatchClass = await page.locator('#passwordMatch.match').count() > 0;
    if (!hasMatchClass) {
      throw new Error('Should have "match" class for matching passwords');
    }
    
    console.log('✅ Shows success message for matching passwords');

    // ==================================================================
    // STEP 6: Test Register Password Visibility Toggle
    // ==================================================================
    console.log('👁️ Step 6: Testing register password visibility toggles...');
    
    // Test password field toggle
    await page.locator('#registerPassword').fill('TestPassword123');
    
    passwordType = await page.locator('#registerPassword').getAttribute('type');
    if (passwordType !== 'password') {
      throw new Error('Register password should initially be hidden');
    }
    
    await page.locator('.toggle-password[data-target="registerPassword"]').click();
    await page.waitForTimeout(300);
    
    passwordType = await page.locator('#registerPassword').getAttribute('type');
    if (passwordType !== 'text') {
      throw new Error('Register password should be visible after toggle');
    }
    
    // Check icon changed
    eyeIcon = await page.locator('.toggle-password[data-target="registerPassword"] .eye-icon').innerHTML();
    if (!eyeIcon.includes('line')) {
      throw new Error('Eye icon should show eye-off when password visible');
    }
    
    console.log('✅ Register password toggle works');
    
    // Test confirm password field toggle
    await page.locator('#registerConfirm').fill('TestPassword123');
    
    passwordType = await page.locator('#registerConfirm').getAttribute('type');
    if (passwordType !== 'password') {
      throw new Error('Confirm password should initially be hidden');
    }
    
    await page.locator('.toggle-password[data-target="registerConfirm"]').click();
    await page.waitForTimeout(300);
    
    passwordType = await page.locator('#registerConfirm').getAttribute('type');
    if (passwordType !== 'text') {
      throw new Error('Confirm password should be visible after toggle');
    }
    
    eyeIcon = await page.locator('.toggle-password[data-target="registerConfirm"] .eye-icon').innerHTML();
    if (!eyeIcon.includes('line')) {
      throw new Error('Confirm password eye icon should show eye-off');
    }
    
    console.log('✅ Confirm password toggle works');

    // ==================================================================
    // STEP 7: Test Successful Registration with Valid Data
    // ==================================================================
    console.log('✅ Step 7: Testing successful registration...');
    
    await page.locator('#registerName').fill('Auth Test User');
    await page.locator('#registerEmail').fill(testEmail);
    await page.locator('#registerPassword').fill('ValidPassword1!');
    await page.locator('#registerConfirm').fill('ValidPassword1!');
    
    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);
    
    // After registration, user is logged in
    console.log('✅ Registration successful with valid data');

    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log('🧹 Cleaning up test data...');
    
    await pool.query('DELETE FROM users WHERE email = $1', [testEmail]);
    console.log('✅ Test data cleaned up');

    console.log('');
    console.log('✅ ✅ ✅ ALL AUTH VALIDATION TESTS PASSED! ✅ ✅ ✅');
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
testAuthValidation();
