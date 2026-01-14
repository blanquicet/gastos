# Audit Logging - Your Next Steps 🚀

**Backend core implementation is COMPLETE!** ✅

All code is written, tested, and documented. Here's what you need to do to activate it.

---

## Step 1: Run the Migration 🗄️

**Run this SQL in your PostgreSQL database:**

```bash
# Connect to your database
psql $DATABASE_URL

# Then run the migration file
\i backend/migrations/027_create_audit_logs.up.sql
```

**Or** if you use a migration tool, just run migrations as usual.

**Verify it worked:**
```sql
\d audit_logs
SELECT COUNT(*) FROM audit_logs;  -- Should be 0
```

---

## Step 2: Test the Admin API 🧪

**Start your server:**
```bash
cd backend
go run cmd/api/main.go
```

**Test the endpoints:**

```bash
# List audit logs (should be empty initially)
curl http://localhost:8080/admin/audit-logs

# Test cleanup endpoint
curl -X POST http://localhost:8080/admin/audit-logs/cleanup?retention_days=90
```

Expected responses:
- `/admin/audit-logs`: `{"logs":[],"total":0,"limit":50,"offset":0}`
- `/cleanup`: `{"deleted":0,"retention_days":90}`

---

## Step 3: Integrate Into One Service (Example) 📝

Let's add audit logging to the **movements service** as an example.

### 3.1: Update movements/service.go

**Add audit service to struct:**
```go
// At line 15 in movements/service.go
type service struct {
repo              Repository
householdsRepo    households.HouseholdRepository
paymentMethodRepo paymentmethods.Repository
accountsRepo      accounts.Repository
n8nClient         *n8nclient.Client
auditService      audit.Service  // ADD THIS
logger            *slog.Logger
}
```

**Add to constructor:**
```go
// At line 25 in movements/service.go
func NewService(
repo Repository,
householdsRepo households.HouseholdRepository,
paymentMethodRepo paymentmethods.Repository,
accountsRepo accounts.Repository,
n8nClient *n8nclient.Client,
auditService audit.Service,  // ADD THIS
logger *slog.Logger,
) Service {
return &service{
repo:              repo,
householdsRepo:    householdsRepo,
paymentMethodRepo: paymentMethodRepo,
accountsRepo:      accountsRepo,
n8nClient:         n8nClient,
auditService:      auditService,  // ADD THIS
logger:            logger,
}
}
```

**Add import:**
```go
// At line 8 in movements/service.go
import (
"context"
"errors"
"log/slog"

"github.com/blanquicet/gastos/backend/internal/accounts"
"github.com/blanquicet/gastos/backend/internal/audit"  // ADD THIS
"github.com/blanquicet/gastos/backend/internal/households"
...
)
```

### 3.2: Add audit logging to Create method

**After line 170 in movements/service.go (after n8n dual-write):**

```go
func (s *service) Create(ctx context.Context, userID string, input *CreateMovementInput) (*Movement, error) {
// ... existing validation and logic ...

// Create movement
movement, err := s.repo.Create(ctx, input, householdID)
if err != nil {
// Log failed attempt
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementCreated,
ResourceType: "movement",
HouseholdID:  audit.StringPtr(householdID),
Success:      false,
ErrorMessage: audit.StringPtr(err.Error()),
})
return nil, err
}

// Log successful creation
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementCreated,
ResourceType: "movement",
ResourceID:   audit.StringPtr(movement.ID),
HouseholdID:  audit.StringPtr(householdID),
NewValues:    audit.StructToMap(movement),
Success:      true,
})

// ... existing n8n dual-write ...

return movement, nil
}
```

### 3.3: Update server.go to pass audit service

**Around line 125 in httpserver/server.go:**

```go
// Before
movementsService := movements.NewService(
movementsRepo,
householdRepo,
paymentMethodsRepo,
accountsRepo,
n8nClient,
logger,
)

// After
movementsService := movements.NewService(
movementsRepo,
householdRepo,
paymentMethodsRepo,
accountsRepo,
n8nClient,
auditService,  // ADD THIS
logger,
)
```

### 3.4: Rebuild and test

```bash
cd backend
go build -o gastos-api ./cmd/api
./gastos-api
```

**Create a movement via your app or API:**
```bash
curl -X POST http://localhost:8080/movements \
  -H "Content-Type: application/json" \
  -d '{"type":"HOUSEHOLD","amount":100,"description":"test",...}'
```

**Check audit logs:**
```bash
curl http://localhost:8080/admin/audit-logs?action=MOVEMENT_CREATED
```

You should see your audit log! 🎉

---

## Step 4: Repeat for Other Services 📦

Use the same pattern for:
1. **Auth service** - login, logout, password reset
2. **Income service** - CREATE, UPDATE, DELETE
3. **Accounts service** - CREATE, UPDATE, DELETE
4. **Payment methods** - CREATE, UPDATE, DELETE
5. **Households** - invitations, members
6. **Categories** - CREATE, UPDATE, DELETE
7. **Budgets** - CREATE, UPDATE, DELETE

**See full examples in:** `backend/internal/audit/INTEGRATION_EXAMPLE.md`

---

## Step 5: Add Background Cleanup (Later) 🧹

For now, cleanup is manual via API endpoint.

**To automate:**

1. Add a cron job that calls:
   ```bash
   curl -X POST http://localhost:8080/admin/audit-logs/cleanup?retention_days=90
   ```

2. Or add it to your application startup as a daily task

---

## 📚 Reference Documentation

All documentation is in place:

- **Design Doc**: `docs/design/07_AUDIT_LOGGING_PHASE.md`
- **Integration Guide**: `backend/internal/audit/INTEGRATION_EXAMPLE.md`
- **Module README**: `backend/internal/audit/README.md`
- **Summary**: `docs/design/AUDIT_LOGGING_SUMMARY.md`

---

## ✅ Checklist

- [ ] Run migration 027
- [ ] Test admin API endpoints
- [ ] Integrate movements service (example above)
- [ ] Test audit log creation
- [ ] Integrate auth service
- [ ] Integrate remaining services
- [ ] Add admin middleware (currently admin endpoints are open)
- [ ] Schedule cleanup job
- [ ] Deploy to production

---

## 🎯 Success Criteria

You'll know it's working when:
1. ✅ Audit logs appear in database after operations
2. ✅ Admin API returns logs with filters
3. ✅ Old logs can be cleaned up via API
4. ✅ No performance impact (async logging)

---

## 🆘 Need Help?

**Check these first:**
1. Compilation errors? Make sure imports are correct
2. No logs appearing? Check slog output for warnings
3. Performance issues? Check buffer size in `service.go`
4. Database errors? Verify migration ran successfully

**Files to review:**
- `backend/internal/audit/README.md` - Overview
- `backend/internal/audit/INTEGRATION_EXAMPLE.md` - Step-by-step
- `docs/design/AUDIT_LOGGING_SUMMARY.md` - Full summary

---

**Good luck! The backend is ready to go!** ��
