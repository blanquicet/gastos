# Backend Tests

End-to-end tests for the Gastos backend API.

## Tests

### `password-reset-e2e.js`

Complete end-to-end test for the password reset flow using Playwright.

**What it tests:**
1. User registration
2. User logout
3. Forgot password request
4. Email sending (verified via logs)
5. Token extraction from backend logs
6. Password reset with token
7. Login with new password
8. Database verification (token marked as used)

**Prerequisites:**
- Backend running on `http://localhost:3000`
- Frontend running on `http://localhost:8080`
- PostgreSQL database accessible
- Email provider configured (or noop for testing)

**Running the test:**

```bash
cd backend/tests
npm install
node password-reset-e2e.js
```

**Environment:**
The test uses the same `.env` configuration as the backend.

## Dependencies

- `playwright` - Browser automation for E2E testing
- `pg` - PostgreSQL client for database verification
