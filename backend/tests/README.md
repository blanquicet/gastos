# Backend E2E Tests

This directory contains end-to-end tests for the Gastos backend using Playwright.

## Prerequisites

1. **Backend running locally** on port 8080
2. **Frontend running locally** on port 5173  
3. **PostgreSQL database** running with test data
4. **Node.js and npm** installed

## Setup

Install Playwright and dependencies:

```bash
cd backend/tests
npm install
npx playwright install
```

## Running Tests

### Run all tests:
```bash
npm test
```

### Run specific test file:
```bash
npx playwright test password-reset-e2e.js
```

### Run with UI mode (interactive):
```bash
npx playwright test --ui
```

### Run in headed mode (see browser):
```bash
npx playwright test --headed
```

## Test Files

### `password-reset-e2e.js`
Complete end-to-end test for password reset flow:
- Forgot password request
- Email sent confirmation
- Token extraction from backend logs (noop provider)
- Password reset with validation
- Login with new password

**Important:** This test requires:
- `EMAIL_PROVIDER=noop` in backend `.env` (logs email content)
- A valid test user in the database
- Backend and frontend running locally

## How Tests Work

### Email Testing with Noop Provider

For password reset tests, we use the **noop email provider** which:
1. Logs email content to backend console instead of sending
2. Allows tests to extract reset tokens from logs
3. No external email service needed

**Configuration:**
```env
# backend/.env
EMAIL_PROVIDER=noop
EMAIL_FROM=noreply@gastos.blanquicet.com.co
```

### Token Extraction Process

The test:
1. Triggers password reset via frontend
2. Waits for backend to log the email
3. Parses backend logs to extract the token
4. Uses token to complete password reset

**Example log pattern:**
```
[NOOP Email] Would send email:
To: test@example.com
Subject: Restablecer tu Contraseña - Gastos
Body: ...https://gastos.blanquicet.com.co/reset-password?token=abc123...
```

### Password Validation Testing

Tests verify:
- Password strength indicator works correctly
- Border colors change based on strength (red/orange/green)
- Confirmation field matches validation
- Submit button enables only when valid

## Test User Setup

Create a test user in PostgreSQL:

```sql
INSERT INTO users (email, password_hash, created_at, updated_at)
VALUES (
  'resendtest@example.com',
  '$2a$10$hashedpassword',  -- Use actual bcrypt hash
  NOW(),
  NOW()
);
```

Or register via the frontend registration form.

## Debugging Tests

### View test report:
```bash
npx playwright show-report
```

### Run with debug mode:
```bash
PWDEBUG=1 npx playwright test
```

### Check backend logs while running tests:
```bash
# In backend directory
go run cmd/api/main.go | grep -E "NOOP Email|Password reset"
```

## Common Issues

### "Timeout waiting for token in logs"
- **Solution:** Ensure backend is running with `EMAIL_PROVIDER=noop`
- Check backend logs are printing email content

### "locator.click: Target closed"
- **Solution:** Increase timeout in test or check if page navigation is correct

### "Error: page.goto: net::ERR_CONNECTION_REFUSED"
- **Solution:** Make sure frontend is running on http://localhost:5173

### Database connection errors
- **Solution:** Ensure PostgreSQL is running and `.env` has correct `DATABASE_URL`

## Dependencies

- `@playwright/test` - Browser automation framework for E2E testing
- `pg` - PostgreSQL client for database verification
- `dotenv` - Environment variable loading

## Next Steps

Future improvements:
- Add more test scenarios (invalid tokens, expired tokens, etc.)
- Add tests for registration flow
- Add tests for login flow with MFA
- Integrate with CI/CD pipeline
