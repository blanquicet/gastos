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

### Run the password reset E2E test:
```bash
cd backend/tests
npm test
```

This executes `node password-reset-e2e.js` automatically.

**Prerequisites before running:**
```bash
# 1. Ensure backend .env has EMAIL_PROVIDER=noop
cd backend
cat .env | grep EMAIL_PROVIDER
# Should show: EMAIL_PROVIDER=noop

# 2. Ensure STATIC_DIR is set to serve frontend
cat .env | grep STATIC_DIR
# Should show: STATIC_DIR=../frontend

# 3. Ensure PostgreSQL is running
docker compose ps
docker compose up -d  # if not running

# 4. Start backend with logging (in a separate terminal)
go run cmd/api/main.go 2>&1 | tee /tmp/backend.log
```

The test will:
1. Open a browser (non-headless by default)
2. Run the complete password reset flow
3. Show validation results in console
4. Save screenshot on failure to `/tmp/password-reset-failure.png`

## Test Files

### `password-reset-e2e.js`

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

**Test console output:**
```
🚀 Starting Password Reset Test
📧 Test email: testpw-1767054964295@example.com

Step 1: Registering new user...
✅ User registered and logged in successfully
Step 2: Logging out...
✅ Logged out successfully
Step 3: Requesting password reset...
✅ Navigated to forgot-password page
✅ Password reset requested successfully
Step 4: Retrieving reset token from backend logs...
✅ Token retrieved: GuA6RWcx-JMxbf3rE...
Step 5: Resetting password with token...
  Testing password validation UI...
    Weak password - Border: rgb(239, 68, 68), Strength: Débil
    Medium password - Border: rgb(16, 185, 129), Strength: Aceptable
    Strong password - Border: rgb(16, 185, 129), Strength: Fuerte
    Non-matching confirmation - Border: rgb(239, 68, 68)
    Matching confirmation - Border: rgb(16, 185, 129)
  ✅ Password validation UI working correctly
✅ Password reset successfully
Step 6: Logging in with new password...
✅ Logged in with new password successfully!
Step 7: Verifying token is marked as used...
✅ Token marked as used in database

🎉 ALL TESTS PASSED!
```

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

The test (`password-reset-e2e.js`):

1. Starts backend with logging to `/tmp/backend.log`
2. Registers a new user via frontend
3. Logs out
4. Requests password reset via frontend
5. Reads `/tmp/backend.log` to find the token
6. Uses token to complete password reset
7. Verifies password strength UI works correctly
8. Logs in with new password

**Token log format:**
```json
{"time":"2025-12-29T19:38:35.096972118-05:00","level":"INFO","msg":"password reset email (no-op)","to":"test@example.com","token":"GuA6RWcx-JMxbf3rEhHIEN-sOV2RQevdkaqobzJXrYQ="}
```

**Formatted output:**
```
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

### Check backend logs:
```bash
tail -f /tmp/backend.log | grep -E "password reset|Token:"
```

### Screenshot on failure
The test automatically saves screenshots to `/tmp/password-reset-failure.png` on failures.

### Add more logging
Edit `password-reset-e2e.js` and add more `console.log()` statements where needed.

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
- **Solution:** Make sure backend is running on http://localhost:8080
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

## Next Steps

Future improvements:
- Add tests for expired tokens
- Add tests for invalid tokens
- Add tests for already-used tokens  
- Add tests for registration flow edge cases
- Add tests for login flow
- Integrate with CI/CD pipeline
