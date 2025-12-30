# Backend E2E Tests

This directory contains end-to-end tests for the Gastos backend using Playwright.

## Prerequisites

1. **PostgreSQL database** running with migrations applied
2. **Node.js and npm** installed
3. **Backend environment configured** with `EMAIL_PROVIDER=noop` in `.env`

## Setup

Install dependencies:

```bash
cd backend/tests
npm install
npx playwright install
```

## Running Tests

### Quick Start (Recommended)

Use the provided test runner script that handles all setup automatically:

```bash
cd backend/tests/e2e
./run-e2e-tests.sh
```

This script will:
1. ✅ Check if PostgreSQL is running
2. ✅ Build the backend binary
3. ✅ Start the backend with proper environment variables
4. ✅ Redirect logs to `/tmp/backend.log`
5. ✅ Wait for backend to be healthy
6. ✅ Run all e2e tests
7. ✅ Clean up the backend process

### Manual Setup (Alternative)

If you prefer to run tests manually:

**Prerequisites before running:**

```bash
# 1. Ensure PostgreSQL is running
pg_isready -h localhost -p 5432 -U gastos
# Or start with docker:
# cd backend && docker compose up -d

# 2. Set environment variables and start backend
cd backend
export DATABASE_URL="postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable"
export STATIC_DIR="../frontend"
export RATE_LIMIT_ENABLED="false"
export SESSION_COOKIE_SECURE="false"
export EMAIL_PROVIDER="noop"

# Start backend with logging
go run cmd/api/main.go 2>&1 | tee /tmp/backend.log &

# 3. Run the tests
cd tests
npm run test:e2e
```

The test will:

1. Open a browser (non-headless by default, headless in CI)
2. Run the complete password reset flow
3. Show validation results in console
4. Save screenshot on failure to `/tmp/password-reset-failure.png` (local) or `test-results/` (CI)

## Test Files

### `password-reset.js`

Complete end-to-end test for password reset flow using Playwright directly:

**What it tests:**

1. ✅ User registration works
2. ✅ Logout clears session
3. ✅ Forgot password page accessible
4. ✅ Password reset email logged with token
5. ✅ Reset password page loads with valid token
6. ✅ **Password strength UI validation:**
   - Weak password (e.g., "abc"): Red border, "Débil" indicator, 25% red bar
   - Medium password (e.g., "Password123"): Green border, "Aceptable" indicator, 50% orange bar
   - Good password (e.g., "GoodPass123!"): Green border, "Buena" indicator, 75% blue bar
   - Strong password (e.g., "NewPassword456!"): Green border, "Fuerte" indicator, 100% green bar
7. ✅ **Password confirmation validation:**
   - Matching passwords: Green border on confirm field
   - Non-matching passwords: Red border + error message
8. ✅ Password reset succeeds with valid token
9. ✅ **Form cleanup after successful reset:**
   - Fields are cleared
   - Strength indicator is hidden
   - Validation classes (green/red borders) are removed
10. ✅ Login works with new password
11. ✅ Token marked as used in database

## How Tests Work

### Email Testing with Noop Provider

For password reset tests, we use the **noop email provider** which:

1. Logs email content to backend console/logs instead of sending
2. Allows tests to extract reset tokens from logs
3. No external email service needed

**Configuration:**

```env
# backend/.env
EMAIL_PROVIDER=noop
EMAIL_FROM_ADDRESS=noreply@gastos.blanquicet.com.co
EMAIL_BASE_URL=http://localhost:8080
STATIC_DIR=../frontend
```

### Token Extraction Process

The test (`password-reset.js`) adapts based on environment:

**Local Development:**
1. Backend runs with logs redirected to `/tmp/backend.log`
2. Test reads token from file: `/tmp/backend.log`

**CI (GitHub Actions):**
1. Backend runs in Docker container
2. Test reads token from docker logs: `docker compose logs api`

**Test Flow:**
1. Registers a new user via frontend
2. Logs out
3. Requests password reset via frontend
4. Extracts token from logs (file or docker)
5. Uses token to complete password reset
6. Verifies password strength UI works correctly
7. Logs in with new password

**Token log format:**

```json
{"time":"2025-12-29T19:38:35.096972118-05:00","level":"INFO","msg":"password reset email (no-op)","to":"test@example.com","token":"GuA6RWcx-JMxbf3rEhHIEN-sOV2RQevdkaqobzJXrYQ="}
```

**Formatted output:**

```text
=== PASSWORD RESET EMAIL ===
To: test@example.com
Token: GuA6RWcx-JMxbf3rEhHIEN-sOV2RQevdkaqobzJXrYQ=
============================
```

The test parses the JSON log line to extract the `token` field.

### Password Strength UI Validation

The test validates the password reset page UX to ensure the fixes in `frontend/pages/reset-password.js` work correctly:

- **Weak password** (e.g., "abc"): Red border (#ef4444), "Débil" indicator, 25% bar
- **Acceptable password** (e.g., "Password123"): Green border (#10b981), "Aceptable" indicator, 50% orange bar (#f59e0b)
- **Good password** (e.g., "GoodPass123!"): Green border, "Buena" indicator, 75% blue bar (#3b82f6)
- **Strong password** (e.g., "NewPassword456!"): Green border, "Fuerte" indicator, 100% green bar (#10b981)
- **Matching confirmation**: Green border on confirm field
- **Non-matching confirmation**: Red border + error message

## Debugging Tests

### View browser while running

The test runs in headed mode by default (`headless: false` in line 19). You can see what's happening in the browser.

### Check backend logs

```bash
tail -f /tmp/backend.log | grep -E "password reset|Token:"
```

### Screenshot on failure

The test automatically saves screenshots to `/tmp/password-reset-failure.png` on failures.

### Add more logging

Edit `password-reset.js` and add more `console.log()` statements where needed.

## Common Issues

### "Timeout waiting for token in logs"

- **Solution:** Ensure backend is running with `EMAIL_PROVIDER=noop`
- Check backend is logging to `/tmp/backend.log`
- Verify logs contain password reset token after request

### "Cannot read /tmp/backend.log"

- **Solution:** The test expects backend to log to this file
- Verify the test started the backend correctly
- Check file permissions on `/tmp/`

### "Error: page.goto: net::ERR_CONNECTION_REFUSED"

- **Solution:** Make sure backend is running on <http://localhost:8080>
- Verify `STATIC_DIR=../frontend` is set in backend `.env`

### "Error: page.goto: net::ERR_EMPTY_RESPONSE"

- **Solution:** Backend failed to start
- Check backend logs for errors
- Verify database is running: `cd backend && docker compose ps`

### Database connection errors

- **Solution:** Ensure PostgreSQL is running:

  ```bash
  cd backend
  docker compose ps
  docker compose up -d  # if not running
  ```

### Port 8080 already in use

- **Solution:** Stop any other process using port 8080:

  ```bash
  lsof -i :8080
  # Kill the process or stop it gracefully
  ```

## Dependencies

- `playwright` - Browser automation library
- `pg` - PostgreSQL client for database verification

## Running in CI/CD

The e2e tests are automatically run in GitHub Actions on every push/PR.

**CI Workflow:** `.github/workflows/deploy-api.yml`

**What happens in CI:**
1. ✅ Builds Docker image once and uploads as artifact
2. ✅ Runs unit tests
3. ✅ Runs API integration tests
4. ✅ Runs e2e tests (parallel with API tests)
5. ✅ Pushes Docker image to registry (on main branch)
6. ✅ Deploys to Azure (on main branch)

**CI-specific features:**
- Tests run in headless mode (`HEADLESS=true`)
- Frontend served via Docker volume mount
- Token extracted from docker compose logs
- Screenshots uploaded as artifacts on failure
- Test results stored for 7 days

## Environment Detection

Tests automatically detect the environment:

```javascript
// Headless mode
const headless = process.env.CI === 'true' || process.env.HEADLESS === 'true';

// API URL
const apiUrl = process.env.API_URL || 'http://localhost:8080';

// Database URL
const dbUrl = process.env.DATABASE_URL || 'postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable';

// Token source
if (process.env.CI) {
  // Read from docker compose logs
} else {
  // Read from /tmp/backend.log
}
```

## Next Steps

Future improvements:

- Add tests for expired tokens
- Add tests for invalid tokens
- Add tests for already-used tokens
- Add tests for registration flow edge cases
- Add more household scenarios
- Add payment methods tests

## Household Management E2E Test

Tests the complete household management flow with two users.

### Test Coverage

**Test File:** `household-management.js`

**Scenarios:**
1. ✅ Register two users (owner and member)
2. ✅ Create household
3. ✅ Add contact with details
4. ✅ Invite member (auto-accept for existing user)
5. ✅ Verify member can see household
6. ✅ Promote member to owner
7. ✅ Demote owner to member
8. ✅ Remove member from household
9. ✅ Verify removed member no longer has access
10. ✅ Delete household
11. ✅ Cleanup test data

### Running the Test

```bash
cd backend/tests
npm run test:household
```

Or run all E2E tests:
```bash
npm run test:e2e
```

### Prerequisites

- Backend server running on `http://localhost:8080`
- Database accessible at `localhost:5432`
- Playwright installed (`npm install`)

### What the Test Does

The test simulates a complete household lifecycle:
- Two browser contexts (two different users)
- Full CRUD operations on household, members, and contacts
- Permission testing (owner vs member actions)
- Auto-accept invitation flow
- Cascade deletion verification

### Expected Output

```
🚀 Starting Household Management Test
👤 User 1 (Owner): owner-1234567890@example.com
👤 User 2 (Member): member-1234567890@example.com
🏠 Household: Test Household 1234567890

📝 Step 1: Registering User 1 (Owner)...
✅ User 1 registered and logged in
📝 Step 2: Registering User 2 (Future Member)...
✅ User 2 registered and logged in
🏠 Step 3: User 1 creating household...
✅ Household created: Test Household 1234567890
📇 Step 4: User 1 adding contact...
✅ Contact added: Maria External
📧 Step 5: User 1 inviting User 2...
✅ User 2 auto-added as member
👀 Step 6: User 2 verifying membership...
✅ User 2 sees household in profile
✅ User 2 can access household page
⬆️ Step 7: User 1 promoting User 2 to owner...
✅ User 2 promoted to owner
⬇️ Step 8: User 1 demoting User 2 to member...
✅ User 2 demoted to member
🗑️ Step 9: User 1 removing User 2...
✅ User 2 removed from household
🔍 Step 10: User 2 verifying removal...
✅ User 2 no longer has household
🗑️ Step 11: User 1 deleting household...
✅ Household deleted successfully
🧹 Cleaning up test data...
✅ Test users deleted

✅ ✅ ✅ ALL TESTS PASSED! ✅ ✅ ✅
```

## Household Validation E2E Test

Tests form validation in household-related forms.

### Test Coverage

**Test File:** `household-validation.js`

**Scenarios:**
1. ✅ Contact email validation (invalid formats rejected)
2. ✅ Contact email validation (valid formats accepted)
3. ✅ Contact phone validation (invalid formats rejected)
4. ✅ Contact phone validation (valid formats accepted)
5. ✅ Form submission blocks invalid email
6. ✅ Form submission blocks invalid phone
7. ✅ Successful submission with valid data
8. ✅ Invite member email validation
9. ✅ Invite submission blocks invalid email
10. ✅ Cleanup test data

### Running the Test

```bash
cd backend/tests
npm run test:validation
```

### Validation Rules Tested

**Email Format:**
- ✅ Requires: `text@text.text`
- ❌ Rejects: `notanemail`, `missing@`, `missing@domain`, `@nodomain.com`
- ✅ Visual feedback: green border for valid, red for invalid
- ✅ Hint message shown for invalid format

**Phone Format:**
- ✅ Accepts: 10-14 digits (e.g., `3001234567`, `12345678901234`)
- ✅ Accepts: + plus up to 13 digits (e.g., `+573001234567`)
- ❌ Rejects: spaces, dashes, parentheses
- ❌ Rejects: < 10 digits or > 14 digits
- ❌ Rejects: + with > 13 digits
- ✅ Visual feedback: green border for valid, red for invalid
- ✅ Hint message shown for invalid format

**Validation Behavior:**
- ✅ Real-time validation on blur (when leaving field)
- ✅ Error cleared on input
- ✅ Submit blocked if validation fails
- ✅ Clear error messages shown
- ✅ Optional fields allow empty values

### Expected Output

```
🚀 Starting Household Validation Test
📧 Step 2: Testing contact email validation...
✅ Invalid email formats correctly rejected
✅ Valid email format accepted
📱 Step 3: Testing contact phone validation...
✅ Invalid phone formats correctly rejected
✅ Valid phone formats accepted
🚫 Step 4: Testing form submission blocks invalid data...
✅ Form submission blocked for invalid email
✅ Form submission blocked for invalid phone
✅ Step 5: Testing successful submission with valid data...
✅ Contact successfully added with valid data
📧 Step 6: Testing invite member email validation...
✅ Invite form shows invalid email correctly
✅ Invite submission blocked for invalid email
✅ Valid invite email accepted

✅ ✅ ✅ ALL VALIDATION TESTS PASSED! ✅ ✅ ✅
```

## Authentication Validation E2E Test

Tests form validation in login and registration forms.

### Test Coverage

**Test File:** `auth-validation.js`

**Scenarios:**
1. ✅ Login email validation (invalid formats rejected)
2. ✅ Login email validation (valid formats accepted)
3. ✅ Login password visibility toggle (eye icon changes)
4. ✅ Register email validation
5. ✅ Password strength indicator (Débil)
6. ✅ Password strength indicator (Aceptable)
7. ✅ Password strength indicator (Buena)
8. ✅ Password strength indicator (Fuerte)
9. ✅ Password match validation (error for non-matching)
10. ✅ Password match validation (success for matching)
11. ✅ Register password visibility toggles
12. ✅ Successful registration with valid data
13. ✅ Cleanup test data

### Running the Test

```bash
cd backend/tests
npm run test:auth-validation
```

### Validation Rules Tested

**Email Format (Login & Register):**
- ✅ Requires: `text@text.text`
- ❌ Rejects: `notanemail`, `missing@domain`, `@nodomain.com`
- ✅ Visual feedback: green border for valid, red for invalid

**Password Visibility Toggle:**
- ✅ Initially type="password" with eye icon
- ✅ Clicking toggles to type="text" with eye-off icon (slash)
- ✅ Clicking again toggles back to type="password" with eye icon
- ✅ Works for all password fields (login, register, confirm)

**Password Strength Indicator:**
- 🔴 **Débil:** Doesn't meet basic requirements
- 🟡 **Aceptable:** 8+ chars, upper, lower, (number OR special)
- 🟢 **Buena:** 12+ chars, meets basic requirements
- 🔵 **Fuerte:** 12+ chars, number AND special char

**Password Match Validation:**
- ✅ Hidden when confirm field is empty
- ❌ Shows "no coinciden" for non-matching passwords
- ✅ Shows "coinciden" for matching passwords
- ✅ Visual feedback with match/no-match classes

### Expected Output

```
🚀 Starting Authentication Validation Test

📧 Step 1: Testing login email validation...
✅ Login invalid email formats correctly rejected
✅ Login valid email format accepted
👁️ Step 2: Testing login password visibility toggle...
✅ Password initially hidden with eye icon
✅ Password visible with eye-off icon after toggle
✅ Password hidden again with eye icon after second toggle
📧 Step 3: Testing register email validation...
✅ Register invalid email formats correctly rejected
✅ Register valid email format accepted
💪 Step 4: Testing password strength indicator...
✅ Weak password shows "Débil" with weak class
✅ Acceptable password shows "Aceptable"
✅ Good password shows "Buena"
✅ Strong password shows "Fuerte"
🔐 Step 5: Testing password match validation...
✅ Shows error for non-matching passwords
✅ Shows success message for matching passwords
👁️ Step 6: Testing register password visibility toggles...
✅ Register password toggle works
✅ Confirm password toggle works
✅ Step 7: Testing successful registration...
✅ Registration successful with valid data

✅ ✅ ✅ ALL AUTH VALIDATION TESTS PASSED! ✅ ✅ ✅
```
