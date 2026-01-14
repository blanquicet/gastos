# Audit Logging Module

This module provides comprehensive audit logging for all operations in the system.

## Features

- ✅ **Async logging**: Non-blocking with 1000-log buffer
- ✅ **Full snapshots**: Complete before/after state for debugging
- ✅ **90-day retention**: Automatic cleanup via admin endpoint
- ✅ **PostgreSQL storage**: Indexed for efficient queries
- ✅ **Admin API**: Query logs by user, action, time, resource
- ✅ **Privacy-first**: No passwords or tokens logged

## Files

- `types.go` - Structs, enums, interfaces
- `repository.go` - PostgreSQL CRUD operations
- `service.go` - Business logic + async worker
- `handlers.go` - Admin HTTP endpoints
- `helpers.go` - Utility functions (StructToMap, StringPtr)
- `INTEGRATION_EXAMPLE.md` - How to integrate into services

## Quick Start

### 1. Run Migration

```bash
# Migration 027 creates audit_logs table
# Run via your migration tool
```

### 2. Add Audit Service to Your Service

```go
type service struct {
repo         Repository
auditService audit.Service  // ADD THIS
logger       *slog.Logger
}
```

### 3. Log Operations

```go
// Success
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementCreated,
ResourceType: "movement",
ResourceID:   audit.StringPtr(resource.ID),
HouseholdID:  audit.StringPtr(householdID),
NewValues:    audit.StructToMap(resource),
Success:      true,
})

// Failure
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementCreated,
ResourceType: "movement",
HouseholdID:  audit.StringPtr(householdID),
Success:      false,
ErrorMessage: audit.StringPtr(err.Error()),
})
```

## Admin API

### List Audit Logs

```bash
GET /admin/audit-logs?user_id={uuid}&action={action}&start_time={iso8601}&limit=50

Response:
{
  "logs": [...],
  "total": 123,
  "limit": 50,
  "offset": 0
}
```

### Get Single Log

```bash
GET /admin/audit-logs/{id}
```

### Cleanup Old Logs

```bash
POST /admin/audit-logs/cleanup?retention_days=90

Response:
{
  "deleted": 1234,
  "retention_days": 90
}
```

## Action Constants

All available in `audit.Action*` constants:

- **Auth**: ActionAuthLogin, ActionAuthLogout, etc.
- **Movements**: ActionMovementCreated, ActionMovementUpdated, ActionMovementDeleted
- **Income**: ActionIncomeCreated, etc.
- **Accounts**: ActionAccountCreated, etc.
- **Payment Methods**: ActionPaymentMethodCreated, etc.
- **Households**: ActionHouseholdCreated, ActionHouseholdMemberAdded, etc.
- **Categories**: ActionCategoryCreated, etc.
- **Budgets**: ActionBudgetCreated, etc.

See `types.go` for complete list.

## Database Schema

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action audit_action NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  old_values JSONB,    -- Before state
  new_values JSONB,    -- After state
  metadata JSONB,      -- Additional context
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT
);
```

## Integration Checklist

- [ ] Add `auditService audit.Service` to service struct
- [ ] Update `NewService` constructor
- [ ] Update server.go to pass audit service
- [ ] Add LogAsync calls to Create operations
- [ ] Add LogAsync calls to Update operations (with old + new values)
- [ ] Add LogAsync calls to Delete operations (with old values)
- [ ] Add LogAsync calls to Auth operations
- [ ] Test audit log creation
- [ ] Verify logs appear in database

## Testing

```go
// Query audit logs in tests
logs, total, err := auditService.Query(ctx, &audit.ListFilters{
Action:       &audit.ActionMovementCreated,
ResourceType: stringPtr("movement"),
UserID:       stringPtr(userID),
Limit:        10,
})
```

## Privacy Considerations

**Never log:**
- Passwords (plaintext or hashed)
- Session tokens
- API keys
- Credit card numbers (full PAN)

**Safe to log:**
- User IDs, names, emails (already in users table)
- Resource IDs and metadata
- Operation outcomes (success/failure)
- Amounts, categories, descriptions (financial data)

## Performance

- Async logging via buffered channel (1000 logs)
- If channel full, logs are dropped (warning logged)
- Typical latency: < 1ms (non-blocking)
- Database inserts happen in background worker
- Indexes on common query patterns

## Future Enhancements

- [ ] Background cron job for cleanup (currently manual via API)
- [ ] User-facing activity feed (not just admin)
- [ ] Anomaly detection (unusual patterns)
- [ ] Export to CSV/JSON
- [ ] Real-time audit stream (WebSocket)
- [ ] Undo/rollback support using audit trail

## Support

See `INTEGRATION_EXAMPLE.md` for detailed integration guide.
