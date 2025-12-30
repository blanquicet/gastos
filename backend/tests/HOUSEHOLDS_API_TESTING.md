# Households API Testing

This directory contains API tests for the Households feature (Phase 2A).

## Postman Collection

### Setup

1. **Import the collection:**
   - Open Postman
   - Click "Import"
   - Select `Gastos_Households_API.postman_collection.json`

2. **Start the local server:**
   ```bash
   cd backend
   docker compose up -d  # Start PostgreSQL
   migrate -path ./migrations -database "$DATABASE_URL" up  # Run migrations
   go run cmd/api/main.go  # Start API server
   ```

3. **Run the collection:**
   - In Postman, select the collection
   - Click "Run" button
   - Execute all requests in sequence

### Test Flow

The collection tests the complete household management workflow:

#### 1. Authentication (4 requests)
- Register User 1 (Jose) - Creates first user
- Login User 1 - Authenticates Jose
- Register User 2 (Caro) - Creates second user for member testing
- Get Current User - Verifies session

#### 2. Households (4 requests)
- Create Household - Jose creates "Casa de Jose y Caro"
- List Households - Verify household appears in list
- Get Household Details - Get full household with members/contacts
- Update Household Name - Change household name

#### 3. Members (2 requests)
- Add Member (Caro) - Add Caro to household
- Promote Member to Owner - Promote Caro from member to owner

#### 4. Contacts (4 requests)
- Create Contact (Unlinked) - Add "Papá" without registered account
- Create Contact (Auto-linked) - Add contact with Caro's email (auto-links)
- Update Contact - Modify contact details
- Delete Contact - Remove contact

#### 5. Error Cases (3 requests)
- Create Household Without Auth - Tests 401 Unauthorized
- Add Duplicate Member - Tests 409 Conflict
- Get Non-Existent Household - Tests 404 Not Found

### Variables

The collection uses these variables (automatically set during tests):
- `baseUrl` - API base URL (default: http://localhost:8080)
- `householdId` - ID of created household (set by "Create Household")
- `memberId` - User ID of added member (set by "Add Member")
- `contactId` - ID of created contact (set by "Create Contact")

### Expected Results

All tests should pass with:
- ✅ Status codes match expectations
- ✅ Response bodies contain required fields
- ✅ Business logic validated (auto-linking, role promotion, etc.)
- ✅ Error cases return appropriate status codes

### Manual Testing

You can also run requests individually to test specific scenarios:

**Test auto-linking:**
1. Register a user with email "test@example.com"
2. Create a contact with the same email
3. Verify `is_registered: true` and `linked_user_id` is set

**Test authorization:**
1. Login as Jose
2. Create a household
3. Logout and login as Caro
4. Try to access Jose's household → Should get 403 Forbidden

**Test cannot remove last owner:**
1. Create household (you're the only owner)
2. Try to remove yourself → Should get 400 Bad Request

## Newman (CLI Testing)

You can also run tests from command line using Newman:

```bash
# Install Newman
npm install -g newman

# Run collection
newman run Gastos_Households_API.postman_collection.json

# Run with environment variables
newman run Gastos_Households_API.postman_collection.json \
  --env-var "baseUrl=http://localhost:8080"

# Run with detailed output
newman run Gastos_Households_API.postman_collection.json \
  --reporters cli,json \
  --reporter-json-export results.json
```

## CI/CD Integration

To integrate with GitHub Actions:

```yaml
- name: Run API Tests
  run: |
    npm install -g newman
    newman run backend/tests/Gastos_Households_API.postman_collection.json \
      --env-var "baseUrl=http://localhost:8080" \
      --bail
```

## Troubleshooting

**Tests failing with 401 Unauthorized:**
- Make sure cookies are enabled in Postman
- Check that sessions are working (`GET /me` should return user data)

**Tests failing with connection errors:**
- Verify backend is running on localhost:8080
- Check database is running (`docker compose ps`)
- Verify migrations are applied

**Auto-linking not working:**
- Ensure email addresses match exactly
- Check that user exists before creating contact
- Verify `linked_user_id` is populated in response

## Next Steps

After manual API testing is complete:
1. All endpoints verified to work correctly
2. Error cases handled properly
3. Ready for frontend integration (Phase 2B)
