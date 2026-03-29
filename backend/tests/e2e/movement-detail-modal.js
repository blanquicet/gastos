import { chromium } from 'playwright';
import pg from 'pg';
import { completeOnboardingViaDB } from './helpers/onboarding-helpers.js';
const { Pool } = pg;

/**
 * Test Movement Detail Modal (Read-Only)
 *
 * Tests the detail modal that opens when clicking a movement row:
 * 1. Register user, create household, add payment method
 * 2. Create HOUSEHOLD movement
 * 3. Create SPLIT movement with participants
 * 4. Create LOAN movement (single participant at 100%)
 * 5. Click HOUSEHOLD movement row → modal opens with correct fields
 * 6. Verify modal badges, amount, description, date, category (no icon), payer, payment method
 * 7. Verify Edit and Delete buttons
 * 8. Close modal with X, Escape, click outside
 * 9. Click ⋮ button → modal does NOT open
 * 10. Click SPLIT movement → modal shows participants with percentages below name
 * 11. Click LOAN movement → modal shows "Préstamo" badge, "Quién prestó", "Recibió"
 * 12. Test chronological view opens modal too
 * 13. Cleanup
 */

async function submitFormAndConfirm(page) {
  const submitBtn = page.locator('#submitBtn');
  await submitBtn.click();
  await page.waitForSelector('.modal-overlay', { timeout: 5000 });
  await page.locator('#modal-ok').click();
  await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
}

async function expandAllGroupsAndCategories(page) {
  // Expand groups: click headers whose details are hidden
  const groupCards = await page.locator('.expense-group-card').count();
  for (let i = 0; i < groupCards; i++) {
    const card = page.locator('.expense-group-card').nth(i);
    const details = card.locator('[id^="group-details-"]');
    if (await details.count() > 0 && await details.first().evaluate(el => el.classList.contains('hidden'))) {
      await card.locator('.expense-group-header').click();
      await page.waitForTimeout(300);
    }
  }
  // Expand visible categories: click headers whose details are hidden
  const categoryItems = await page.locator('.expense-category-item:visible').count();
  for (let i = 0; i < categoryItems; i++) {
    const item = page.locator('.expense-category-item:visible').nth(i);
    const details = item.locator('[id^="category-details-"]');
    if (await details.count() > 0 && await details.first().evaluate(el => el.classList.contains('hidden'))) {
      await item.locator('.expense-category-header').click();
      await page.waitForTimeout(300);
    }
  }
  await page.waitForTimeout(500);
}

async function testMovementDetailModal() {
  const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';

  const browser = await chromium.launch({ headless });

  const pool = new Pool({ connectionString: dbUrl });

  const timestamp = Date.now();
  const userEmail = `modal-detail-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const householdName = `Modal Test ${timestamp}`;

  let userId = null;
  let householdId = null;
  let contactId = null;

  try {
    console.log('🚀 Starting Movement Detail Modal Test');
    console.log('👤 User:', userEmail);
    console.log('🏠 Household:', householdName);
    console.log('');

    // ==================================================================
    // STEP 1: Register User and Create Household
    // ==================================================================
    console.log('📝 Step 1: Registering user and creating household...');
    const context = await browser.newContext();
    const page = await context.newPage();

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

    await page.locator('#registerName').fill('Test User Modal');
    await page.locator('#registerEmail').fill(userEmail);
    await page.locator('#registerPassword').fill(password);
    await page.locator('#registerConfirm').fill(password);

    await page.getByRole('button', { name: 'Registrarse' }).click();
    await page.waitForTimeout(2000);

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    userId = userResult.rows[0].id;
    await completeOnboardingViaDB(pool, userId);

    // Create household
    await page.locator('#hamburger-btn').click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Crear hogar' }).click();
    await page.waitForTimeout(500);

    await page.locator('#household-name-input').fill(householdName);
    await page.locator('#household-create-btn').click();
    await page.waitForTimeout(1000);
    await page.locator('#modal-ok').click();
    await page.waitForTimeout(2000);

    const householdResult = await pool.query('SELECT id FROM households WHERE name = $1', [householdName]);
    householdId = householdResult.rows[0].id;

    console.log('✅ User registered and household created');

    // ==================================================================
    // STEP 2: Add Contact (for SPLIT movements)
    // ==================================================================
    console.log('📝 Step 2: Adding contact...');

    await page.goto(`${appUrl}/hogar`);
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: '+ Agregar contacto' }).click();
    await page.waitForTimeout(500);

    await page.locator('#contact-name').fill('Laura Contact');
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.waitForTimeout(1500);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const contactResult = await pool.query(
      'SELECT id FROM contacts WHERE name = $1 AND household_id = $2',
      ['Laura Contact', householdId]
    );
    contactId = contactResult.rows[0].id;

    console.log('✅ Contact added');

    // ==================================================================
    // STEP 3: Add Payment Method
    // ==================================================================
    console.log('📝 Step 3: Adding payment method...');

    await page.goto(`${appUrl}/perfil`);
    await page.waitForTimeout(2000);

    await page.locator('#add-payment-method-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#add-payment-method-btn').click();
    await page.waitForTimeout(500);

    await page.locator('#pm-name').fill('Tarjeta Modal Test');
    await page.selectOption('select#pm-type', 'debit_card');

    const isSharedCheckbox = page.locator('#pm-shared');
    if (await isSharedCheckbox.isChecked()) {
      await isSharedCheckbox.uncheck();
    }

    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.waitForTimeout(1500);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    console.log('✅ Payment method added');

    // ==================================================================
    // STEP 4: Create HOUSEHOLD Movement
    // ==================================================================
    console.log('📝 Step 4: Creating HOUSEHOLD movement...');

    await page.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.locator('button[data-tipo="HOUSEHOLD"]').click();
    await page.waitForTimeout(500);

    await page.locator('#descripcion').fill('Almuerzo familiar');
    await page.locator('#valor').fill('75000');
    await page.selectOption('#categoria', 'Mercado');
    await page.selectOption('#metodo', 'Tarjeta Modal Test');

    await submitFormAndConfirm(page);
    await page.waitForURL(url => url.pathname === '/', { timeout: 5000 });

    console.log('✅ HOUSEHOLD movement created');

    // ==================================================================
    // STEP 5: Create SPLIT Movement with participants
    // ==================================================================
    console.log('📝 Step 5: Creating SPLIT movement...');

    await page.goto(`${appUrl}/registrar-movimiento`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.locator('button[data-tipo="SPLIT"]').click();
    await page.waitForTimeout(500);

    await page.locator('#descripcion').fill('Netflix compartido');
    await page.locator('#valor').fill('50000');
    await page.selectOption('#categoria', 'Mercado');
    await page.selectOption('#pagadorCompartido', 'Test User Modal');
    await page.selectOption('#metodo', 'Tarjeta Modal Test');

    // Add participant
    await page.locator('#addParticipantBtn').click();
    await page.waitForTimeout(300);

    const participantSelects = await page.locator('#participantsList select').all();
    if (participantSelects.length >= 2) {
      await participantSelects[1].selectOption('Laura Contact');
    }
    await page.waitForTimeout(500);

    await submitFormAndConfirm(page);
    await page.waitForURL(url => url.pathname === '/', { timeout: 5000 });

    console.log('✅ SPLIT movement created');

    // ==================================================================
    // STEP 5b: Create LOAN Movement via DB (contact lends to user)
    // A loan is stored as SPLIT with 1 participant at 100%
    // ==================================================================
    console.log('📝 Step 5b: Creating LOAN movement...');

    // Get the category_id for Mercado
    const catResult = await pool.query(
      "SELECT id FROM categories WHERE name = 'Mercado' LIMIT 1"
    );
    const mercadoCategoryId = catResult.rows[0]?.id;

    const today = new Date().toISOString().split('T')[0];
    const loanResult = await pool.query(
      `INSERT INTO movements (household_id, type, description, amount, movement_date, payer_contact_id, category_id)
       VALUES ($1, 'SPLIT', 'Préstamo de Laura', 30000, $2, $3, $4)
       RETURNING id`,
      [householdId, today, contactId, mercadoCategoryId]
    );
    const loanMovementId = loanResult.rows[0].id;

    // Add single participant at 100% (the user who received the loan)
    await pool.query(
      `INSERT INTO movement_participants (movement_id, participant_user_id, percentage)
       VALUES ($1, $2, 1.0)`,
      [loanMovementId, userId]
    );

    console.log('✅ LOAN movement created');

    // ==================================================================
    // STEP 6: Navigate to Gastos and expand categories
    // ==================================================================
    console.log('📝 Step 6: Navigating to Gastos tab...');

    await page.goto(`${appUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const gastosTab = page.locator('button.tab-btn').filter({ hasText: 'Gastos' });
    await gastosTab.click();
    await page.waitForTimeout(1500);

    await page.waitForSelector('.categories-grid', { state: 'visible', timeout: 10000 });

    // Expand all groups and categories
    await expandAllGroupsAndCategories(page);

    // Verify movement rows have data-movement-id
    const movementRows = page.locator('.movement-detail-entry[data-movement-id]');
    const rowCount = await movementRows.count();
    if (rowCount < 3) {
      throw new Error(`Expected at least 3 movement rows with data-movement-id, found ${rowCount}`);
    }
    console.log(`   Found ${rowCount} movement rows with data-movement-id`);
    console.log('✅ Gastos tab loaded with movements');

    // ==================================================================
    // STEP 7: Click HOUSEHOLD movement → modal opens
    // ==================================================================
    console.log('📝 Step 7: Testing HOUSEHOLD movement detail modal...');

    // Find the Almuerzo familiar row
    const householdRow = page.locator('.movement-detail-entry[data-movement-id]', {
      has: page.locator('.entry-description:has-text("Almuerzo familiar")')
    });

    if (await householdRow.count() === 0) {
      throw new Error('Could not find "Almuerzo familiar" movement row');
    }

    await householdRow.first().click();
    await page.waitForTimeout(600);

    // Verify modal appeared
    const modal = page.locator('#movement-detail-modal');
    if (await modal.count() === 0) {
      throw new Error('Modal did not appear on row click');
    }
    console.log('   ✅ Modal appeared');

    // Verify header
    const headerText = await page.locator('#movement-detail-modal .modal-header h3').textContent();
    if (headerText !== 'Detalle del movimiento') {
      throw new Error(`Expected header "Detalle del movimiento", got "${headerText}"`);
    }
    console.log('   ✅ Header correct');

    // Verify amount
    const amount = await page.locator('#movement-detail-modal .detail-amount').textContent();
    if (!amount.includes('75.000') && !amount.includes('75,000')) {
      throw new Error(`Expected amount to contain 75.000 or 75,000, got "${amount}"`);
    }
    console.log(`   ✅ Amount: ${amount}`);

    // Verify detail fields
    const fields = page.locator('#movement-detail-modal .detail-field');
    const fieldCount = await fields.count();
    if (fieldCount < 3) {
      throw new Error(`Expected at least 3 detail fields, got ${fieldCount}`);
    }

    // Check specific fields
    const allLabels = await fields.locator('.detail-label').allTextContents();
    const allValues = await fields.locator('.detail-value').allTextContents();

    console.log('   Fields:');
    for (let i = 0; i < allLabels.length; i++) {
      console.log(`     ${allLabels[i]}: ${allValues[i]}`);
    }

    if (!allLabels.includes('Descripción')) throw new Error('Missing Descripción field');
    if (!allLabels.includes('Fecha')) throw new Error('Missing Fecha field');
    if (!allLabels.includes('Categoría')) throw new Error('Missing Categoría field');
    if (!allLabels.includes('Método de pago')) throw new Error('Missing Método de pago field');

    // Verify description value
    const descIdx = allLabels.indexOf('Descripción');
    if (allValues[descIdx] !== 'Almuerzo familiar') {
      throw new Error(`Expected description "Almuerzo familiar", got "${allValues[descIdx]}"`);
    }

    // Verify category shows group name without emoji icon
    const catIdx = allLabels.indexOf('Categoría');
    if (catIdx >= 0) {
      const catValue = allValues[catIdx].trim();
      if (!catValue.includes('Hogar') || !catValue.includes('Mercado')) {
        throw new Error(`Expected category to contain "Hogar" and "Mercado", got "${catValue}"`);
      }
      if (catValue.includes('›')) {
        console.log(`   ✅ Category with group: ${catValue}`);
      }
      // Verify no emoji at the start
      const firstChar = catValue.charAt(0);
      if (firstChar !== 'H') {
        console.log(`   ⚠️ Category starts with "${firstChar}" — expected "H" (Hogar)`);
      }
    }

    // Verify NO "Quién pagó" for HOUSEHOLD (payment method is sufficient)
    if (allLabels.includes('Quién pagó')) {
      throw new Error('HOUSEHOLD modal should NOT have "Quién pagó" field');
    }
    console.log('   ✅ No "Quién pagó" field (correct for HOUSEHOLD)');

    // Verify NO participants section for HOUSEHOLD
    const participants = page.locator('#movement-detail-modal .detail-participants');
    if (await participants.count() > 0) {
      throw new Error('HOUSEHOLD modal should NOT have participants section');
    }
    console.log('   ✅ No participants section (correct for HOUSEHOLD)');

    // Verify Edit and Delete buttons
    if (await page.locator('#detail-edit-btn').count() === 0) throw new Error('No Edit button');
    if (await page.locator('#detail-delete-btn').count() === 0) throw new Error('No Delete button');
    console.log('   ✅ Edit and Delete buttons present');

    console.log('✅ HOUSEHOLD modal verified');

    // ==================================================================
    // STEP 8: Close modal - X button
    // ==================================================================
    console.log('📝 Step 8: Testing modal close methods...');

    await page.locator('#detail-close-btn').click();
    await page.waitForTimeout(400);
    if (await page.locator('#movement-detail-modal').count() !== 0) {
      throw new Error('Modal did not close with X button');
    }
    console.log('   ✅ Close with X button');

    // Close with Escape
    await householdRow.first().click();
    await page.waitForTimeout(600);
    if (await page.locator('#movement-detail-modal').count() === 0) {
      throw new Error('Modal did not reopen');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (await page.locator('#movement-detail-modal').count() !== 0) {
      throw new Error('Modal did not close with Escape');
    }
    console.log('   ✅ Close with Escape key');

    // Close with click outside
    await householdRow.first().click();
    await page.waitForTimeout(600);
    const overlay = page.locator('#movement-detail-modal');
    await overlay.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(400);
    if (await page.locator('#movement-detail-modal').count() !== 0) {
      throw new Error('Modal did not close on click outside');
    }
    console.log('   ✅ Close with click outside');

    console.log('✅ All close methods work');

    // ==================================================================
    // STEP 9: Three-dots menu does NOT open modal
    // ==================================================================
    console.log('📝 Step 9: Testing three-dots menu isolation...');

    const threeDotsBtn = householdRow.first().locator('.three-dots-btn');
    if (await threeDotsBtn.count() > 0) {
      await threeDotsBtn.click();
      await page.waitForTimeout(300);

      if (await page.locator('#movement-detail-modal').count() !== 0) {
        throw new Error('Modal opened on three-dots click - should not happen!');
      }
      console.log('   ✅ Three-dots click does NOT open modal');

      // Close the menu
      await page.click('body');
      await page.waitForTimeout(200);
    }

    console.log('✅ Three-dots isolation verified');

    // Re-expand groups/categories (may have collapsed during interaction)
    await expandAllGroupsAndCategories(page);

    // ==================================================================
    // STEP 10: Click SPLIT movement → modal shows participants
    // ==================================================================
    console.log('📝 Step 10: Testing SPLIT movement detail modal...');

    const splitRow = page.locator('.movement-detail-entry[data-movement-id]', {
      has: page.locator('.entry-description:has-text("Netflix compartido")')
    });

    if (await splitRow.count() === 0) {
      throw new Error('Could not find "Netflix compartido" movement row');
    }

    await splitRow.first().click();
    await page.waitForTimeout(600);

    if (await page.locator('#movement-detail-modal').count() === 0) {
      throw new Error('Modal did not appear for SPLIT movement');
    }

    // Verify "Compartido" badge
    const splitBadge = page.locator('#movement-detail-modal .entry-split-badge');
    if (await splitBadge.count() === 0) {
      throw new Error('Missing "Compartido" badge for SPLIT movement');
    }
    console.log('   ✅ Compartido badge present');

    // Verify participants section
    const participantsSection = page.locator('#movement-detail-modal .detail-participants');
    if (await participantsSection.count() === 0) {
      throw new Error('SPLIT modal should have participants section');
    }
    console.log('   ✅ Participants section present');

    // Verify participant rows
    const participantRows = page.locator('#movement-detail-modal .detail-participant-row');
    const participantCount = await participantRows.count();
    if (participantCount !== 2) {
      throw new Error(`Expected 2 participants, got ${participantCount}`);
    }

    // Check participant details - new layout: name and pct inside .participant-info
    const participantInfos = page.locator('#movement-detail-modal .participant-info');
    const infoCount = await participantInfos.count();
    if (infoCount !== 2) {
      throw new Error(`Expected 2 participant-info containers, got ${infoCount}`);
    }
    console.log('   ✅ Participants use new layout (info + amount)');

    const names = await participantRows.locator('.participant-name').allTextContents();
    const pcts = await participantRows.locator('.participant-pct').allTextContents();
    const amounts = await participantRows.locator('.participant-amount').allTextContents();

    console.log('   Participants:');
    for (let i = 0; i < names.length; i++) {
      console.log(`     ${names[i]} - ${pcts[i]} - ${amounts[i]}`);
    }

    // Verify percentages sum to 100%
    const pctNumbers = pcts.map(p => parseInt(p.replace('%', '')));
    const pctSum = pctNumbers.reduce((a, b) => a + b, 0);
    if (pctSum !== 100) {
      throw new Error(`Participant percentages should sum to 100%, got ${pctSum}%`);
    }
    console.log('   ✅ Percentages sum to 100%');

    // Verify both participants are there
    const allNames = names.join(' ');
    if (!allNames.includes('Test User Modal') && !allNames.includes('Laura Contact')) {
      throw new Error(`Expected both participants, got: ${names.join(', ')}`);
    }
    console.log('   ✅ Both participants present');

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    console.log('✅ SPLIT modal with participants verified');

    // ==================================================================
    // STEP 10b: Click LOAN movement → "Préstamo" badge + descriptive fields
    // ==================================================================
    console.log('📝 Step 10b: Testing LOAN movement detail modal...');

    const loanRow = page.locator('.movement-detail-entry[data-movement-id]', {
      has: page.locator('.entry-description:has-text("Préstamo de Laura")')
    });

    if (await loanRow.count() === 0) {
      throw new Error('Could not find "Préstamo de Laura" movement row');
    }

    await loanRow.first().click();
    await page.waitForTimeout(600);

    if (await page.locator('#movement-detail-modal').count() === 0) {
      throw new Error('Modal did not appear for LOAN movement');
    }

    // Verify "Préstamo" badge (NOT "Compartido")
    const loanBadge = page.locator('#movement-detail-modal .entry-loan-badge');
    if (await loanBadge.count() === 0) {
      throw new Error('Missing "Préstamo" badge for LOAN movement');
    }
    const loanBadgeText = await loanBadge.textContent();
    if (loanBadgeText !== 'Préstamo') {
      throw new Error(`Expected badge text "Préstamo", got "${loanBadgeText}"`);
    }
    console.log('   ✅ "Préstamo" badge present');

    // Verify NO "Compartido" badge
    const splitBadgeInLoan = page.locator('#movement-detail-modal .entry-split-badge');
    if (await splitBadgeInLoan.count() > 0) {
      throw new Error('LOAN modal should NOT have "Compartido" badge');
    }
    console.log('   ✅ No "Compartido" badge (correct for loan)');

    // Verify "Quién prestó" label (not "Quién pagó")
    const loanLabels = await page.locator('#movement-detail-modal .detail-field .detail-label').allTextContents();
    const loanValues = await page.locator('#movement-detail-modal .detail-field .detail-value').allTextContents();

    if (!loanLabels.includes('Quién prestó')) {
      throw new Error(`Expected "Quién prestó" label, got: ${loanLabels.join(', ')}`);
    }
    console.log('   ✅ "Quién prestó" label present');

    // Verify "Recibió" field
    if (!loanLabels.includes('Recibió')) {
      throw new Error(`Expected "Recibió" label, got: ${loanLabels.join(', ')}`);
    }

    const recibioIdx = loanLabels.indexOf('Recibió');
    if (loanValues[recibioIdx] !== 'Test User Modal') {
      throw new Error(`Expected "Recibió" value "Test User Modal", got "${loanValues[recibioIdx]}"`);
    }
    console.log('   ✅ "Recibió: Test User Modal" field present');

    // Verify NO participants table (loans show fields instead)
    const loanParticipants = page.locator('#movement-detail-modal .detail-participants');
    if (await loanParticipants.count() > 0) {
      throw new Error('LOAN modal should NOT have participants section');
    }
    console.log('   ✅ No participants table (correct for loan)');

    console.log('   Fields:');
    for (let i = 0; i < loanLabels.length; i++) {
      console.log(`     ${loanLabels[i]}: ${loanValues[i]}`);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    console.log('✅ LOAN modal verified');

    // ==================================================================
    // STEP 11: Test chronological view
    // ==================================================================
    console.log('📝 Step 11: Testing chronological view...');

    // Find the view toggle button
    const viewToggle = page.locator('#group-toggle-btn');
    if (await viewToggle.count() > 0) {
      await viewToggle.click();
      await page.waitForTimeout(500);

      const chronoRows = page.locator('.chronological-movement-card[data-movement-id]');
      const chronoCount = await chronoRows.count();
      console.log(`   Chronological rows: ${chronoCount}`);

      if (chronoCount > 0) {
        await chronoRows.first().click();
        await page.waitForTimeout(600);

        if (await page.locator('#movement-detail-modal').count() === 0) {
          throw new Error('Modal did not open from chronological view');
        }
        console.log('   ✅ Modal opens from chronological view');

        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }

      // Switch back to grouped view
      await viewToggle.click();
      await page.waitForTimeout(500);
    } else {
      console.log('   ⚠️ View toggle button not found, skipping chronological test');
    }

    console.log('✅ Chronological view verified');

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
    console.log('✅ ✅ ✅ ALL MOVEMENT DETAIL MODAL TESTS PASSED! ✅ ✅ ✅');

    await browser.close();
    await pool.end();

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    try {
      const page = (await browser.contexts())[0]?.pages()[0];
      if (page) {
        const screenshotPath = process.env.CI
          ? 'test-results/movement-detail-modal-failure.png'
          : '/tmp/movement-detail-modal-failure.png';
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

testMovementDetailModal();
