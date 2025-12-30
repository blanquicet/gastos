# API Integration Tests

This directory contains automated curl-based tests for all 17 API endpoints.

```bash
# Start the backend server
cd backend
go run cmd/api/main.go

# In another terminal, run tests
cd backend/tests/api-integration
./test-api.sh
```

**Expected output:**

```bash
✅ All 17 tests completed!
```

**Tests:**

- ✅ User registration and login
- ✅ Household CRUD operations
- ✅ Member management (add, promote, remove)
- ✅ Contact management (create, update, delete)
- ✅ Contact auto-linking
- ✅ Error cases (401, 409, etc.)
