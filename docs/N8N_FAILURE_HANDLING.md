# n8n Failure Handling

## Overview

During the migration period, the application uses dual-write strategy to sync data to both PostgreSQL (new system) and Google Sheets via n8n (legacy system). This document describes how n8n failures are handled.

## Architecture Decisions

### No Retries
- **Decision**: Do not retry n8n calls
- **Rationale**: n8n is not flaky - if it fails, it will continue failing (likely a service outage)
- **Implication**: Immediate failure notification to user

### Fail Fast
- **Decision**: Return error to user immediately when n8n fails
- **Rationale**: User needs to know the sync failed so they can contact admin
- **Implication**: Better than silent failures that create data inconsistencies

## Behavior by Module

### 1. Movements (Gastos/Prestamos)

**Current State**: Only writes to n8n/Google Sheets (no PostgreSQL DB yet)

**On n8n Failure**:
- ❌ Nothing is saved
- ❌ Request returns `503 Service Unavailable`
- ⚠️ User sees error: "n8n no está disponible - El movimiento NO se guardó. Por favor contacta al administrador."

**Code Location**:
- Backend: `backend/internal/movements/handler.go` - `RecordMovement()`
- Frontend: `frontend/pages/registrar-movimiento.js` - line ~863

**Future**: When movements are migrated to PostgreSQL, behavior will match Income module.

---

### 2. Income (Ingresos)

**Current State**: Writes to PostgreSQL first (source of truth), then syncs to n8n/Google Sheets

**On n8n Failure**:
- ✅ Data IS saved to PostgreSQL
- ❌ Data is NOT synced to Google Sheets
- ❌ Request returns `503 Service Unavailable`
- ⚠️ User sees error: "n8n service unavailable - income saved to database but not synced to Google Sheets. Please contact administrator"

**Code Location**:
- Backend: `backend/internal/income/service.go` - `Create()` method (lines 79-100)
- Backend: `backend/internal/income/types.go` - `ErrN8NUnavailable` error
- Backend: `backend/internal/income/handlers.go` - Error handling (line ~133)
- Frontend: Not yet implemented (Phase 4.3)

**Data Consistency**: 
- PostgreSQL has the complete data
- Google Sheets is missing the entry
- Admin must manually sync or fix n8n service

---

## HTTP Status Codes

| Status | Meaning | User Action |
|--------|---------|-------------|
| `200 OK` | Success - data saved and synced | None |
| `503 Service Unavailable` | n8n is down - see module-specific behavior above | Contact administrator |

## Error Messages

### Movements Frontend
```
⚠️ n8n no está disponible - El movimiento NO se guardó. Por favor contacta al administrador.
```

### Income Backend API
```json
{
  "error": "n8n service unavailable - income saved to database but not synced to Google Sheets. Please contact administrator"
}
```

## Monitoring & Recovery

### For Administrators

When n8n fails:

1. **Check n8n service status**
   ```bash
   curl -I https://n8n.blanquicet.com.co/webhook/movimientos/reportar
   ```

2. **Check backend logs** for failed n8n calls:
   ```bash
   grep "failed to send income to n8n" backend.log
   grep "failed to record movement in n8n" backend.log
   ```

3. **Identify missing syncs**:
   - For income: Query PostgreSQL for entries created during outage period
   - For movements: No recovery needed (nothing was saved)

4. **Manual sync** (if needed):
   - Use n8n's manual trigger or bulk import to sync missing income entries
   - Or wait for automated reconciliation job (future enhancement)

### Future Enhancements

**Not Implemented** (noted as technical debt):
- Transaction rollback for income (would prevent partial saves)
- Retry queue for failed n8n writes (eventual consistency)
- Automated reconciliation between PostgreSQL and Google Sheets
- Background job to detect and report sync inconsistencies

These were explicitly decided against for the migration period to keep implementation simple. The migration period is temporary, and manual intervention is acceptable.

## Testing

To test n8n failure handling:

1. **Temporarily break n8n connection**:
   - Set invalid `N8N_WEBHOOK_URL` in `.env`
   - Restart backend

2. **Test movement registration**:
   - Should return 503
   - Frontend shows error message
   - Nothing saved anywhere

3. **Test income creation** (via API):
   ```bash
   curl -X POST http://localhost:8080/api/income \
     -H "Content-Type: application/json" \
     -d '{...}' -v
   ```
   - Should return 503
   - Should save to PostgreSQL (verify with DB query)
   - Should NOT appear in Google Sheets

4. **Restore n8n connection** and verify normal operation

## Related Documentation

- [Backend API Documentation](./API.md)
- [Migration Strategy](./MIGRATION.md)
- [n8n Integration](./N8N_INTEGRATION.md)
