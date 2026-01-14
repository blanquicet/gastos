# Audit Logging Integration Guide

This guide shows how to integrate audit logging into existing services.

## Step 1: Add Audit Service to Service Struct

```go
// service implements Service interface
type service struct {
repo         Repository
otherRepos   OtherRepos
auditService audit.Service  // ADD THIS
logger       *slog.Logger
}

// NewService creates a new service
func NewService(
repo Repository,
otherRepos OtherRepos,
auditService audit.Service,  // ADD THIS
logger *slog.Logger,
) Service {
return &service{
repo:         repo,
otherRepos:   otherRepos,
auditService: auditService,  // ADD THIS
logger:       logger,
}
}
```

## Step 2: Update Server Setup (server.go)

When creating the service, pass the audit service:

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

## Step 3: Add Audit Logging to CREATE Operations

```go
func (s *service) Create(ctx context.Context, userID string, input *CreateInput) (*Resource, error) {
// ... existing validation and business logic ...

// Create resource
resource, err := s.repo.Create(ctx, input, householdID)
if err != nil {
// Log failed attempt
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementCreated,  // Use appropriate action constant
ResourceType: "movement",                   // Use resource type string
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
ResourceID:   audit.StringPtr(resource.ID),
HouseholdID:  audit.StringPtr(householdID),
NewValues:    audit.StructToMap(resource),  // Full snapshot
Success:      true,
})

// ... rest of function (dual-write to n8n, etc.) ...

return resource, nil
}
```

## Step 4: Add Audit Logging to UPDATE Operations

```go
func (s *service) Update(ctx context.Context, userID, id string, input *UpdateInput) (*Resource, error) {
// ... existing validation ...

// Get existing resource for old values
existing, err := s.repo.GetByID(ctx, id)
if err != nil {
return nil, err
}

// Update resource
updated, err := s.repo.Update(ctx, id, input)
if err != nil {
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementUpdated,
ResourceType: "movement",
ResourceID:   audit.StringPtr(id),
HouseholdID:  audit.StringPtr(householdID),
OldValues:    audit.StructToMap(existing),
Success:      false,
ErrorMessage: audit.StringPtr(err.Error()),
})
return nil, err
}

// Log successful update
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementUpdated,
ResourceType: "movement",
ResourceID:   audit.StringPtr(id),
HouseholdID:  audit.StringPtr(householdID),
OldValues:    audit.StructToMap(existing),  // Before
NewValues:    audit.StructToMap(updated),   // After
Success:      true,
})

return updated, nil
}
```

## Step 5: Add Audit Logging to DELETE Operations

```go
func (s *service) Delete(ctx context.Context, userID, id string) error {
// ... existing validation ...

// Get existing resource for old values
existing, err := s.repo.GetByID(ctx, id)
if err != nil {
return err
}

// Delete resource
err = s.repo.Delete(ctx, id)
if err != nil {
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementDeleted,
ResourceType: "movement",
ResourceID:   audit.StringPtr(id),
HouseholdID:  audit.StringPtr(householdID),
OldValues:    audit.StructToMap(existing),
Success:      false,
ErrorMessage: audit.StringPtr(err.Error()),
})
return err
}

// Log successful deletion
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementDeleted,
ResourceType: "movement",
ResourceID:   audit.StringPtr(id),
HouseholdID:  audit.StringPtr(householdID),
OldValues:    audit.StructToMap(existing),  // Snapshot before deletion
Success:      true,
})

return nil
}
```

## Step 6: Add Audit Logging to AUTH Operations

```go
// Login
func (s *service) Login(ctx context.Context, email, password string) (*User, *Session, error) {
// ... existing logic ...

if err != nil {
// Failed login attempt
s.auditService.LogAsync(ctx, &audit.LogInput{
Action:       audit.ActionAuthLogin,
ResourceType: "auth",
Metadata: map[string]interface{}{
"email":  email,
"reason": err.Error(),
},
Success:      false,
ErrorMessage: audit.StringPtr(err.Error()),
})
return nil, nil, err
}

// Successful login
s.auditService.LogAsync(ctx, &audit.LogInput{
UserID:       audit.StringPtr(user.ID),
Action:       audit.ActionAuthLogin,
ResourceType: "auth",
Metadata: map[string]interface{}{
"email": email,
},
Success: true,
})

return user, session, nil
}
```

## Step 7: Add IP and User Agent from HTTP Requests

If you want to log IP address and user agent, use `LogFromRequest` instead:

```go
// In handler, not service
func (h *handler) CreateMovement(w http.ResponseWriter, r *http.Request) {
// ... parse input ...

movement, err := h.service.Create(r.Context(), userID, input)
if err != nil {
// Log with request info
h.auditService.LogFromRequest(r, &audit.LogInput{
UserID:       audit.StringPtr(userID),
Action:       audit.ActionMovementCreated,
ResourceType: "movement",
HouseholdID:  audit.StringPtr(householdID),
Success:      false,
ErrorMessage: audit.StringPtr(err.Error()),
})
http.Error(w, err.Error(), http.StatusBadRequest)
return
}

// Success already logged in service
// ...
}
```

## Available Action Constants

See `audit/types.go` for all action constants. Examples:

```go
// Auth
audit.ActionAuthLogin
audit.ActionAuthLogout
audit.ActionAuthPasswordResetRequest
audit.ActionAuthPasswordResetComplete

// Movements
audit.ActionMovementCreated
audit.ActionMovementUpdated
audit.ActionMovementDeleted

// Income
audit.ActionIncomeCreated
audit.ActionIncomeUpdated
audit.ActionIncomeDeleted

// Accounts
audit.ActionAccountCreated
audit.ActionAccountUpdated
audit.ActionAccountDeleted

// Payment Methods
audit.ActionPaymentMethodCreated
audit.ActionPaymentMethodUpdated
audit.ActionPaymentMethodDeleted

// Households
audit.ActionHouseholdCreated
audit.ActionHouseholdMemberAdded
audit.ActionHouseholdInvitationSent
// ... etc
```

## Best Practices

1. **Always use LogAsync** - Don't block operations on audit logging
2. **Log failures too** - Set `Success: false` and include `ErrorMessage`
3. **Use full snapshots** - `audit.StructToMap(resource)` for debugging
4. **Don't log sensitive data** - Never log passwords, tokens, etc.
5. **Include household_id** - For household-scoped operations
6. **Use appropriate resource_type** - "movement", "income", "auth", etc.
7. **Log before returning errors** - So failed attempts are captured

## Testing Audit Logs

```go
// In tests, verify audit logs were created
func TestCreateMovement_LogsAudit(t *testing.T) {
// ... create movement ...

// Query audit logs
logs, total, err := auditService.Query(ctx, &audit.ListFilters{
Action:       &audit.ActionMovementCreated,
ResourceType: stringPtr("movement"),
Limit:        10,
})

assert.NoError(t, err)
assert.Equal(t, 1, total)
assert.True(t, logs[0].Success)
assert.NotNil(t, logs[0].NewValues)
}
```

## Example: Complete Service Integration

See the movements service for a complete example of audit logging integration.

Key points:
- Audit service added to struct
- CREATE logs new values
- UPDATE logs old + new values
- DELETE logs old values
- Failed operations logged with error message
- All using LogAsync for non-blocking logging
