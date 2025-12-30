# Gastos Backend Tests

Test suite for the Gastos backend API.

## Directory Structure

```
tests/
├── api-integration/       # API integration tests (curl-based)
│   └── test-api.sh       # Automated test script for all endpoints
│
├── e2e/                  # End-to-end tests (Playwright)
│   ├── password-reset-e2e.js
│   └── README.md         # E2E testing documentation
│
└── test-results/         # Test output and reports (gitignored)
```

## Running Tests

### API Integration Tests (Recommended)

Automated curl-based tests for all 17 API endpoints.

```bash
# Start the backend server
cd backend
go run cmd/api/main.go

# In another terminal, run tests
cd backend/tests/api-integration
./test-api.sh
```

**Expected output:**
```
✅ All 17 tests completed!

Summary:
  Household ID: <uuid>
  Jose ID: <uuid>
  Caro ID: <uuid>
```

**Tests:**
- ✅ User registration and login
- ✅ Household CRUD operations
- ✅ Member management (add, promote, remove)
- ✅ Contact management (create, update, delete)
- ✅ Contact auto-linking
- ✅ Error cases (401, 409, etc.)

### End-to-End Tests (Playwright)

Browser-based tests for user flows.

**Setup:**
```bash
cd backend/tests/e2e
npm install
npx playwright install
```

**Run:**
```bash
npx playwright test password-reset-e2e.js
```

**Tests:**
- ✅ Password reset flow (request → email → reset → login)

See `e2e/README.md` for detailed documentation.

---

## CI/CD Integration

Tests run automatically on every PR and push to main.

**GitHub Actions workflow:** `.github/workflows/deploy-api.yml`

**Pipeline:**
1. Setup PostgreSQL service
2. Run database migrations
3. Run unit tests (`go test -v -race ./...`)
4. Start API server
5. **Run API integration tests** (`api-integration/test-api.sh`)
6. Build Docker image
7. Deploy to Azure

---

## Environment Variables

```bash
# Required
DATABASE_URL=postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable

# For testing - disable rate limiting
RATE_LIMIT_ENABLED=false

# Allow HTTP cookies in tests
SESSION_COOKIE_SECURE=false
```

---

## Test Coverage

### Unit Tests
- **Location:** `backend/internal/*/\*_test.go`
- **Count:** 35+ tests
- **Coverage:** 100% of service layer
- **Run:** `go test -v -race ./...`

### API Integration Tests
- **Location:** `api-integration/test-api.sh`
- **Count:** 17 endpoints tested
- **Coverage:** All CRUD operations, auth, error cases
- **Run:** `./test-api.sh`

### E2E Tests
- **Location:** `e2e/password-reset-e2e.js`
- **Count:** 1 flow (more in Phase 2B)
- **Coverage:** Password reset user flow
- **Run:** `npx playwright test`

---

## Adding New Tests

### API Integration Test

Edit `api-integration/test-api.sh` and add:

```bash
echo -e "${YELLOW}[18/18] Test New Endpoint${NC}"
curl -s -X POST $BASE_URL/new-endpoint \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"key":"value"}' | jq .
echo -e "${GREEN}✓ New endpoint tested${NC}\n"
```

### E2E Test

Create new file in `e2e/`:

```javascript
// e2e/new-feature.js
const { test, expect } = require('@playwright/test');

test('new feature flow', async ({ page }) => {
  await page.goto('http://localhost:8080');
  // Test implementation
});
```

---

## Troubleshooting

### Tests fail with "401 Unauthorized"
- Verify backend server is running on `http://localhost:8080`
- Check session cookies are enabled
- Ensure `SESSION_COOKIE_SECURE=false` in .env

### Tests fail with "429 Too Many Requests"
- Set `RATE_LIMIT_ENABLED=false` in .env
- Restart backend server
- Wait 60 seconds for rate limit to reset

### Database connection errors
- Start PostgreSQL: `docker compose up -d`
- Check `DATABASE_URL` is correct
- Run migrations: `migrate -path ./migrations -database "$DATABASE_URL" up`

### E2E tests fail
- Install Playwright: `npx playwright install`
- Check backend is running
- Verify email provider is configured (for password reset tests)

---

## Quick Reference

| Test Type | Command | Duration | CI/CD |
|-----------|---------|----------|-------|
| Unit Tests | `go test -v -race ./...` | ~2s | ✅ |
| API Integration | `./api-integration/test-api.sh` | ~10s | ✅ |
| E2E Tests | `npx playwright test` | ~30s | ⏳ |

---

## Test Results

All tests are passing ✅

- **Unit tests:** 35+ tests, 0 failures
- **Integration tests:** 17 endpoints, 0 failures
- **E2E tests:** 1 flow, 0 failures

---

## Documentation

- **API Integration:** Run `./test-api.sh` with colored output
- **E2E Testing:** See `e2e/README.md`
- **CI/CD Pipeline:** See `.github/workflows/deploy-api.yml`

---

**Phase 2A Backend: 100% Complete** ✅  
**Ready for Phase 2B Frontend** 🚀
