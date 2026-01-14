# Audit Logging Testing Strategy

**Date:** 2026-01-14  
**Status:** PROPOSAL

---

## Current Testing Infrastructure

Your app has **3 testing approaches** in place:

### 1. **Go Unit Tests** (Mock-based)
**Location:** `backend/internal/*/service_test.go`  
**Examples:** 
- `households/service_test.go` - Mock repository pattern
- `categories/service_test.go` - Similar pattern

**Pros:**
- ✅ Fast (no database)
- ✅ Isolated (pure logic testing)
- ✅ Already established pattern

**Cons:**
- ❌ Doesn't test database integration
- ❌ Doesn't test async behavior
- ❌ Can't verify actual audit log creation

### 2. **Bash API Integration Tests**
**Location:** `backend/tests/api-integration/test-movements.sh`  
**Coverage:** 
- Full CRUD for movements (HOUSEHOLD, SPLIT, DEBT_PAYMENT)
- End-to-end API flow with real database
- 580+ lines of comprehensive tests

**Pros:**
- ✅ Tests real API endpoints
- ✅ Tests database persistence
- ✅ Easy to verify HTTP responses
- ✅ Simple to extend (just bash/curl/jq)
- ✅ Already has sophisticated test patterns

**Cons:**
- ❌ No UI testing
- ❌ Harder to test timing/async behavior

### 3. **Playwright E2E Tests**
**Location:** `backend/tests/e2e/*.js`  
**Coverage:** 
- Password reset flow
- Household management
- Form validation
- Movement registration

**Pros:**
- ✅ Tests full user journey (UI + API + DB)
- ✅ Can verify UI state
- ✅ Already has database verification helpers

**Cons:**
- ❌ Slower to run
- ❌ More complex to maintain
- ❌ Might be overkill for backend-only features

---

## 🎯 RECOMMENDATION: Bash API Integration Tests

### Why This Approach?

**1. Best fit for audit logging:**
- Audit logging is a **backend-only feature** (no UI yet)
- Need to verify **database persistence** (mocks won't help)
- Need to verify **async behavior** works correctly
- Already have excellent patterns in `test-movements.sh`

**2. Practical advantages:**
- ✅ **Quick to write** - Copy patterns from existing movements tests
- ✅ **Easy to debug** - Just curl + jq
- ✅ **Fast execution** - No browser overhead
- ✅ **Comprehensive** - Can test all scenarios
- ✅ **Database verification** - Can query audit_logs directly
- ✅ **Fits existing workflow** - Same pattern as current tests

**3. What we can test:**
- ✅ Movement creation → Audit log exists with correct action
- ✅ Movement update → Audit log has old_values and new_values
- ✅ Movement deletion → Audit log has old_values
- ✅ Failed operations → Audit log has error_message
- ✅ Admin API → List/filter/cleanup endpoints work
- ✅ User tracking → user_id captured correctly
- ✅ Household tracking → household_id captured correctly
- ✅ JSONB snapshots → Full object data preserved

---

## Proposed Test Structure

### Extend `test-movements.sh`

**Add new section at the end (before summary):**

```bash
# ═══════════════════════════════════════════════════════════
# AUDIT LOGGING VERIFICATION
# ═══════════════════════════════════════════════════════════

run_test "Verify audit log created for movement creation"
AUDIT_COUNT=$(psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'MOVEMENT_CREATED' 
    AND resource_id = '$HOUSEHOLD_MOV_ID'
")
[ "$AUDIT_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Audit log exists for movement creation${NC}\n"

run_test "Verify audit log has full snapshot (new_values)"
AUDIT_SNAPSHOT=$(psql $DATABASE_URL -t -c "
  SELECT new_values::text 
  FROM audit_logs 
  WHERE action = 'MOVEMENT_CREATED' 
    AND resource_id = '$HOUSEHOLD_MOV_ID' 
  ORDER BY created_at DESC 
  LIMIT 1
")
echo "$AUDIT_SNAPSHOT" | grep -q "250000"  # Amount
echo "$AUDIT_SNAPSHOT" | grep -q "Mercado del mes"  # Description
echo -e "${GREEN}✓ Audit log contains full movement snapshot${NC}\n"

run_test "Verify audit log for movement update has old and new values"
UPDATE_AUDIT=$(psql $DATABASE_URL -t -c "
  SELECT 
    old_values::text,
    new_values::text
  FROM audit_logs 
  WHERE action = 'MOVEMENT_UPDATED' 
    AND resource_id = '$HOUSEHOLD_MOV_ID' 
  ORDER BY created_at DESC 
  LIMIT 1
")
echo "$UPDATE_AUDIT" | grep -q "250000"  # Old amount
echo "$UPDATE_AUDIT" | grep -q "280000"  # New amount
echo -e "${GREEN}✓ Update audit log has old and new values${NC}\n"

run_test "Verify audit log for movement deletion"
DELETE_AUDIT=$(psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'MOVEMENT_DELETED' 
    AND resource_id = '$DEBT_MOV_ID'
")
[ "$DELETE_AUDIT" = "1" ]
echo -e "${GREEN}✓ Deletion audit log created${NC}\n"

run_test "Verify audit log has user_id and household_id"
AUDIT_METADATA=$(psql $DATABASE_URL -t -c "
  SELECT user_id, household_id 
  FROM audit_logs 
  WHERE action = 'MOVEMENT_CREATED' 
    AND resource_id = '$HOUSEHOLD_MOV_ID' 
  LIMIT 1
")
echo "$AUDIT_METADATA" | grep -q "$JOSE_ID"
echo "$AUDIT_METADATA" | grep -q "$HOUSEHOLD_ID"
echo -e "${GREEN}✓ Audit log has correct user and household${NC}\n"

run_test "List audit logs via admin API"
ADMIN_LOGS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/admin/audit-logs?action=MOVEMENT_CREATED" -b $COOKIES_FILE)
LOGS_COUNT=$(echo "$ADMIN_LOGS" | jq '.logs | length')
[ "$LOGS_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Admin API returns audit logs${NC}\n"

run_test "Filter audit logs by household"
HOUSEHOLD_LOGS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/admin/audit-logs?household_id=$HOUSEHOLD_ID" -b $COOKIES_FILE)
HOUSEHOLD_LOGS_COUNT=$(echo "$HOUSEHOLD_LOGS" | jq '.logs | length')
[ "$HOUSEHOLD_LOGS_COUNT" -ge "5" ]  # All movements created
echo -e "${GREEN}✓ Can filter audit logs by household${NC}\n"

run_test "Verify audit log includes resource_type"
RESOURCE_TYPE=$(psql $DATABASE_URL -t -c "
  SELECT resource_type 
  FROM audit_logs 
  WHERE resource_id = '$HOUSEHOLD_MOV_ID' 
  LIMIT 1
" | xargs)
[ "$RESOURCE_TYPE" = "movement" ]
echo -e "${GREEN}✓ Audit log has correct resource_type${NC}\n"
```

**Update test summary:**

```bash
echo "  ✓ Audit logging: verify all operations tracked with full snapshots"
```

---

## Alternative: Create Dedicated Audit Test Script

**Location:** `backend/tests/api-integration/test-audit-logging.sh`

**Pros:**
- ✅ Cleaner separation
- ✅ Easier to run audit tests independently
- ✅ Can test admin-specific scenarios

**Cons:**
- ❌ Requires setup duplication (register user, create household, etc.)
- ❌ Another script to maintain

**Structure:**

```bash
#!/bin/bash
# Audit Logging Tests
# Tests audit logging for all CRUD operations

# Setup: Register user, create household, payment method
# Test 1: Create movement → verify audit log
# Test 2: Update movement → verify old/new values
# Test 3: Delete movement → verify old values
# Test 4: Failed operation → verify error logged
# Test 5: Admin API - list logs
# Test 6: Admin API - filter by action
# Test 7: Admin API - filter by household
# Test 8: Admin API - filter by user
# Test 9: Admin API - filter by time range
# Test 10: Admin API - cleanup old logs
# Test 11: Verify JSONB contains expected fields
# Test 12: Verify success=true for successful ops
# Test 13: Verify success=false for failed ops
```

---

## E2E Tests Approach (If Needed Later)

**When to use:**
- ✅ If you build admin UI for viewing audit logs
- ✅ If you want to test user experience of audit trail
- ✅ If audit logs become user-facing feature

**Example test:**

```javascript
// backend/tests/e2e/audit-logging.js
test('Admin can view audit logs for household', async () => {
  // 1. Register admin user
  // 2. Create household
  // 3. Create movement
  // 4. Navigate to /admin/audit-logs
  // 5. Verify movement creation appears
  // 6. Verify full snapshot shown
  // 7. Filter by household
  // 8. Verify only household logs shown
});
```

---

## Go Unit Tests Approach (Complementary)

**What to test with mocks:**
- ✅ Service validation logic
- ✅ Error handling paths
- ✅ Edge cases (nil pointers, empty strings)
- ✅ Helper functions (StructToMap, StringPtr)

**Example:**

```go
// backend/internal/audit/service_test.go
func TestStructToMap(t *testing.T) {
    type TestStruct struct {
        Name   string  `json:"name"`
        Amount int     `json:"amount"`
    }
    
    input := TestStruct{Name: "Test", Amount: 100}
    result := StructToMap(input)
    
    if result["name"] != "Test" {
        t.Errorf("expected name=Test, got %v", result["name"])
    }
}

func TestLogAsync_NonBlocking(t *testing.T) {
    // Test that LogAsync returns immediately
    // Test that full buffer doesn't block
}
```

---

## Implementation Plan

### Phase 1: Bash Integration Tests (RECOMMENDED START)
**Effort:** 2-3 hours  
**Impact:** High - Validates core functionality

**Tasks:**
1. ✅ Extend `test-movements.sh` with audit verification section
2. ✅ Add ~8 test cases (create, update, delete, admin API)
3. ✅ Add SQL queries to verify database state
4. ✅ Update test summary
5. ✅ Run and verify all tests pass

### Phase 2: Go Unit Tests (OPTIONAL)
**Effort:** 1-2 hours  
**Impact:** Medium - Better coverage of edge cases

**Tasks:**
1. ✅ Create `backend/internal/audit/helpers_test.go`
2. ✅ Test StructToMap function
3. ✅ Test StringPtr function
4. ✅ Create `backend/internal/audit/service_test.go`
5. ✅ Test async behavior (non-blocking)

### Phase 3: E2E Tests (FUTURE - IF ADMIN UI)
**Effort:** 3-4 hours  
**Impact:** Low now, High later (when UI exists)

**Tasks:**
1. ✅ Create `backend/tests/e2e/audit-logging.js`
2. ✅ Test admin can view logs
3. ✅ Test filtering works in UI
4. ✅ Test pagination
5. ✅ Test cleanup functionality

---

## Success Criteria

### Must Have (Phase 1)
- [x] ✅ Verify audit log created for movement CREATE
- [x] ✅ Verify audit log created for movement UPDATE (old + new values)
- [x] ✅ Verify audit log created for movement DELETE (old values)
- [x] ✅ Verify audit log has correct user_id
- [x] ✅ Verify audit log has correct household_id
- [x] ✅ Verify audit log has correct action
- [x] ✅ Verify JSONB snapshots contain expected data
- [x] ✅ Verify admin API returns logs correctly
- [x] ✅ Verify admin API filtering works

### Nice to Have (Phase 2+)
- [ ] ✅ Test async behavior doesn't block requests
- [ ] ✅ Test buffer overflow handling
- [ ] ✅ Test cleanup functionality
- [ ] ✅ Test failed operation logging
- [ ] ✅ Test edge cases (nil values, empty strings)

---

## Example Test Output

```bash
╔════════════════════════════════════════════════════════╗
║     🧪 Gastos Movements API Integration Tests         ║
╚════════════════════════════════════════════════════════╝

# ... existing tests ...

═══════════════════════════════════════════════════════════
# AUDIT LOGGING VERIFICATION
═══════════════════════════════════════════════════════════

▶ Verify audit log created for movement creation
✓ Audit log exists for movement creation

▶ Verify audit log has full snapshot (new_values)
✓ Audit log contains full movement snapshot

▶ Verify audit log for movement update has old and new values
✓ Update audit log has old and new values

▶ Verify audit log for movement deletion
✓ Deletion audit log created

▶ Verify audit log has user_id and household_id
✓ Audit log has correct user and household

▶ List audit logs via admin API
✓ Admin API returns audit logs

▶ Filter audit logs by household
✓ Can filter audit logs by household

▶ Verify audit log includes resource_type
✓ Audit log has correct resource_type

╔════════════════════════════════════════════════════════╗
║                  ✓ ALL TESTS PASSED                   ║
╚════════════════════════════════════════════════════════╝

Test Summary:
  ✓ HOUSEHOLD movements: create, validate, enforce rules
  ✓ SPLIT movements: create with participants, validate percentages
  ✓ DEBT_PAYMENT movements: create, handle external payers
  ✓ List, filter, get, update, delete operations
  ✓ Audit logging: verify all operations tracked with full snapshots
  ✓ Authorization and error handling
  ✓ Data integrity and debt consolidation
```

---

## Next Steps

### Immediate (Do Now)
1. ✅ Run migration 027 in database
2. ✅ Extend `test-movements.sh` with audit tests (8 new tests)
3. ✅ Run tests and verify all pass
4. ✅ Commit test additions

### Short-term (This Week)
1. ✅ Add similar audit tests to `test-categories-budgets.sh` (if needed)
2. ✅ Document testing approach in README
3. ✅ Add CI/CD integration if not already done

### Long-term (Future)
1. ✅ Add Go unit tests for edge cases
2. ✅ Create E2E tests when admin UI is built
3. ✅ Add integration tests for other services (auth, income, etc.)

---

## Questions for You

1. **Do you want me to implement the bash tests now?**  
   I can extend `test-movements.sh` with the 8 audit verification tests right away.

2. **Do you also want Go unit tests?**  
   Or focus on integration tests first and add unit tests later?

3. **Admin API authorization:**  
   The admin endpoints currently have no auth middleware. Should I:
   - Add tests that verify endpoints are public (document TODO)?
   - Wait for you to add admin middleware first?
   - Add tests assuming admin-only access?

4. **Other services integration:**  
   After movements tests are done, should I also add audit tests for:
   - Auth service (login, logout, password reset)?
   - Income service?
   - Or wait until you integrate audit logging into those services?

---

**My recommendation:** Start with **bash integration tests** (Phase 1). They give the most value for the least effort, and you already have excellent patterns to follow in `test-movements.sh`. Once those are solid, we can add unit tests for edge cases.

**Status:** ✅ Ready to implement - Just say the word!
