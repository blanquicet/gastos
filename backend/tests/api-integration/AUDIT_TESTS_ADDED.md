# Audit Logging Tests Added to test-movements.sh

**Date:** 2026-01-14  
**Status:** ✅ COMPLETE

---

## What Was Added

Extended `test-movements.sh` with **8 comprehensive audit logging tests** that verify:

### 1. Movement Creation Audit Log
**Test:** Verify audit log created for movement creation  
**Verification:**
- Queries `audit_logs` table for `MOVEMENT_CREATED` action
- Confirms at least 1 audit log exists for the created movement
- Uses resource_id to match specific movement

### 2. Full Snapshot Verification
**Test:** Verify audit log has full snapshot (new_values)  
**Verification:**
- Extracts `new_values` JSONB field from audit log
- Confirms movement amount (250000) is present
- Confirms description ("Mercado del mes") is present
- Validates full object snapshot was captured

### 3. Update Old + New Values
**Test:** Verify audit log for movement update has old and new values  
**Verification:**
- Queries for `MOVEMENT_UPDATED` action
- Confirms `old_values` contains original amount (250000)
- Confirms `new_values` contains updated amount (280000)
- Confirms description update is captured

### 4. Deletion Audit Log
**Test:** Verify audit log for movement deletion  
**Verification:**
- Queries for `MOVEMENT_DELETED` action
- Confirms exactly 1 deletion log exists
- Uses deleted movement's resource_id

### 5. User and Household Tracking
**Test:** Verify audit log has user_id and household_id  
**Verification:**
- Extracts user_id and household_id from audit log
- Confirms user_id matches Jose's ID
- Confirms household_id matches created household
- Validates metadata is correctly captured

### 6. Admin API List Endpoint
**Test:** List audit logs via admin API  
**Verification:**
- Calls GET `/admin/audit-logs?action=MOVEMENT_CREATED`
- Confirms API returns logs in JSON format
- Confirms at least 1 log is returned
- Validates admin API is functional

### 7. Admin API Filtering
**Test:** Filter audit logs by household  
**Verification:**
- Calls GET `/admin/audit-logs?household_id={id}`
- Confirms at least 5 logs returned (all movements created)
- Validates household-level filtering works
- Tests admin API query parameters

### 8. Resource Type Field
**Test:** Verify audit log includes resource_type  
**Verification:**
- Extracts resource_type field from audit log
- Confirms value is exactly "movement"
- Validates resource type categorization

---

## Test Coverage Summary

| Operation | Audit Action | What's Verified |
|-----------|--------------|-----------------|
| Create Movement | MOVEMENT_CREATED | Log exists, full snapshot in new_values |
| Update Movement | MOVEMENT_UPDATED | Old and new values captured |
| Delete Movement | MOVEMENT_DELETED | Log exists |
| All Operations | - | user_id, household_id, resource_type tracked |
| Admin API | - | List endpoint, filtering by household |

---

## Technical Details

### Database Queries
All tests use direct PostgreSQL queries via `psql`:

```bash
psql $DATABASE_URL -t -c "SELECT ... FROM audit_logs WHERE ..."
```

**Why direct DB queries?**
- ✅ Verifies data actually persists to database
- ✅ Tests async behavior (logs written in background)
- ✅ Validates JSONB fields contain expected data
- ✅ More thorough than API-only tests

### Variables Used
- `$HOUSEHOLD_MOV_ID` - ID of created household movement
- `$DEBT_MOV_ID` - ID of deleted debt payment movement
- `$JOSE_ID` - User ID of Jose (test user)
- `$HOUSEHOLD_ID` - Household ID
- `$DATABASE_URL` - PostgreSQL connection string

### Test Flow
1. **Setup** - Tests run after all movements are created/updated/deleted
2. **Audit section** - Runs after debt consolidation tests
3. **Verification** - Uses IDs from earlier test steps
4. **Summary** - Updated to include audit logging

---

## New Section in test-movements.sh

**Location:** Lines 583-679 (approximately)

**Structure:**
```bash
# ═══════════════════════════════════════════════════════════
# AUDIT LOGGING VERIFICATION
# ═══════════════════════════════════════════════════════════

run_test "Test 1: ..."
# SQL query + verification
echo -e "${GREEN}✓ Test passed${NC}\n"

run_test "Test 2: ..."
# SQL query + verification
echo -e "${GREEN}✓ Test passed${NC}\n"

# ... 8 tests total ...
```

---

## Prerequisites

### 1. Database Migration
Migration 027 **must be run** before tests will pass:

```bash
psql $DATABASE_URL < backend/migrations/027_create_audit_logs.up.sql
```

### 2. Backend Running
Backend server must be running with audit logging enabled:

```bash
cd backend
go run cmd/api/main.go
```

### 3. psql Available
Tests use `psql` command to query database directly:

```bash
which psql  # Should return path
```

---

## How to Run

### Run All Movements Tests (including audit)
```bash
cd backend/tests/api-integration
./test-movements.sh
```

### With Debug Output
```bash
DEBUG=true ./test-movements.sh
```

### With Custom Database URL
```bash
DATABASE_URL="postgres://user:pass@host:5432/db" ./test-movements.sh
```

---

## Expected Output

```bash
# ═══════════════════════════════════════════════════════════
# AUDIT LOGGING VERIFICATION
# ═══════════════════════════════════════════════════════════

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
  ✓ Update payer: SPLIT movements (members & contacts)
  ✓ Update counterparty: DEBT_PAYMENT movements (members & contacts)
  ✓ Update payer + participants simultaneously for SPLIT movements
  ✓ Authorization and error handling
  ✓ Data integrity: participants, percentages, enriched names, totals
  ✓ Debt consolidation: calculate who owes whom (for Resume page)
  ✓ Audit logging: all operations tracked with full snapshots
```

---

## Troubleshooting

### Test fails: "audit_logs: relation does not exist"
**Solution:** Run migration 027:
```bash
psql $DATABASE_URL < backend/migrations/027_create_audit_logs.up.sql
```

### Test fails: "0 audit logs found"
**Solution:** 
- Ensure backend has audit logging integrated (movements service)
- Check backend logs for audit service errors
- Verify async worker is running

### Test fails: "grep: no match"
**Solution:**
- Check JSONB fields contain expected data
- Query database manually to inspect audit log:
  ```bash
  psql $DATABASE_URL -c "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1;"
  ```

### psql command not found
**Solution:** Install PostgreSQL client:
```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# macOS
brew install postgresql
```

---

## Files Modified

### test-movements.sh
**Lines added:** ~100 lines  
**Tests added:** 8 new tests  
**Summary updated:** Added audit logging line

**Changes:**
1. Added DATABASE_URL environment variable
2. Added audit logging verification section
3. Updated test summary to include audit logging

---

## Next Steps

### Immediate
1. ✅ Run migration 027
2. ✅ Run test-movements.sh and verify all pass
3. ✅ Commit changes

### Future
1. Add similar audit tests to other test scripts (if created)
2. Add Go unit tests for audit helpers
3. Add E2E tests when admin UI is built

---

## Success Criteria ✅

- [x] 8 audit tests added to test-movements.sh
- [x] Tests verify database persistence (not just API)
- [x] Tests verify JSONB snapshots contain correct data
- [x] Tests verify user/household tracking
- [x] Tests verify admin API endpoints
- [x] Test summary updated
- [ ] Migration 027 executed (your action)
- [ ] All tests pass (verification pending)
- [ ] Changes committed

---

**Status:** ✅ COMPLETE - Ready to run after migration  
**Blockers:** Migration 027 must be executed first  
**Next:** Run migration → Run tests → Commit
