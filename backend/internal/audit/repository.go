package audit

import (
"context"
"encoding/json"
"errors"
"fmt"
"strings"
"time"

"github.com/jackc/pgx/v5"
"github.com/jackc/pgx/v5/pgxpool"
)

var (
ErrAuditLogNotFound = errors.New("audit log not found")
)

type repository struct {
pool *pgxpool.Pool
}

// NewRepository creates a new audit log repository
func NewRepository(pool *pgxpool.Pool) Repository {
return &repository{pool: pool}
}

// Create creates a new audit log entry
func (r *repository) Create(ctx context.Context, input *LogInput) (*AuditLog, error) {
query := `
INSERT INTO audit_logs (
user_id, action, resource_type, resource_id, household_id,
ip_address, user_agent, old_values, new_values, metadata,
success, error_message
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING id, created_at
`

var oldValuesJSON, newValuesJSON, metadataJSON []byte
var err error

if input.OldValues != nil {
oldValuesJSON, err = json.Marshal(input.OldValues)
if err != nil {
return nil, fmt.Errorf("failed to marshal old_values: %w", err)
}
}

if input.NewValues != nil {
newValuesJSON, err = json.Marshal(input.NewValues)
if err != nil {
return nil, fmt.Errorf("failed to marshal new_values: %w", err)
}
}

if input.Metadata != nil {
metadataJSON, err = json.Marshal(input.Metadata)
if err != nil {
return nil, fmt.Errorf("failed to marshal metadata: %w", err)
}
}

log := &AuditLog{
UserID:       input.UserID,
Action:       input.Action,
ResourceType: input.ResourceType,
ResourceID:   input.ResourceID,
HouseholdID:  input.HouseholdID,
IPAddress:    input.IPAddress,
UserAgent:    input.UserAgent,
OldValues:    input.OldValues,
NewValues:    input.NewValues,
Metadata:     input.Metadata,
Success:      input.Success,
ErrorMessage: input.ErrorMessage,
}

err = r.pool.QueryRow(
ctx, query,
input.UserID, input.Action, input.ResourceType, input.ResourceID,
input.HouseholdID, input.IPAddress, input.UserAgent,
oldValuesJSON, newValuesJSON, metadataJSON,
input.Success, input.ErrorMessage,
).Scan(&log.ID, &log.CreatedAt)

if err != nil {
return nil, fmt.Errorf("failed to create audit log: %w", err)
}

return log, nil
}

// GetByID retrieves an audit log by ID
func (r *repository) GetByID(ctx context.Context, id string) (*AuditLog, error) {
query := `
SELECT id, user_id, created_at, action, resource_type, resource_id,
household_id, ip_address, user_agent, old_values, new_values,
metadata, success, error_message
FROM audit_logs
WHERE id = $1
`

var log AuditLog
var oldValuesJSON, newValuesJSON, metadataJSON []byte

err := r.pool.QueryRow(ctx, query, id).Scan(
&log.ID, &log.UserID, &log.CreatedAt, &log.Action, &log.ResourceType,
&log.ResourceID, &log.HouseholdID, &log.IPAddress, &log.UserAgent,
&oldValuesJSON, &newValuesJSON, &metadataJSON,
&log.Success, &log.ErrorMessage,
)

if err == pgx.ErrNoRows {
return nil, ErrAuditLogNotFound
}
if err != nil {
return nil, fmt.Errorf("failed to get audit log: %w", err)
}

// Unmarshal JSON fields
if len(oldValuesJSON) > 0 {
if err := json.Unmarshal(oldValuesJSON, &log.OldValues); err != nil {
return nil, fmt.Errorf("failed to unmarshal old_values: %w", err)
}
}
if len(newValuesJSON) > 0 {
if err := json.Unmarshal(newValuesJSON, &log.NewValues); err != nil {
return nil, fmt.Errorf("failed to unmarshal new_values: %w", err)
}
}
if len(metadataJSON) > 0 {
if err := json.Unmarshal(metadataJSON, &log.Metadata); err != nil {
return nil, fmt.Errorf("failed to unmarshal metadata: %w", err)
}
}

return &log, nil
}

// List retrieves audit logs with filters
func (r *repository) List(ctx context.Context, filters *ListFilters) ([]*AuditLog, int, error) {
// Build WHERE clause
var conditions []string
var args []interface{}
argIndex := 1

if filters.UserID != nil {
conditions = append(conditions, fmt.Sprintf("user_id = $%d", argIndex))
args = append(args, *filters.UserID)
argIndex++
}

if filters.HouseholdID != nil {
conditions = append(conditions, fmt.Sprintf("household_id = $%d", argIndex))
args = append(args, *filters.HouseholdID)
argIndex++
}

if filters.Action != nil {
conditions = append(conditions, fmt.Sprintf("action = $%d", argIndex))
args = append(args, *filters.Action)
argIndex++
}

if filters.ResourceType != nil {
conditions = append(conditions, fmt.Sprintf("resource_type = $%d", argIndex))
args = append(args, *filters.ResourceType)
argIndex++
}

if filters.ResourceID != nil {
conditions = append(conditions, fmt.Sprintf("resource_id = $%d", argIndex))
args = append(args, *filters.ResourceID)
argIndex++
}

if filters.StartTime != nil {
conditions = append(conditions, fmt.Sprintf("created_at >= $%d", argIndex))
args = append(args, *filters.StartTime)
argIndex++
}

if filters.EndTime != nil {
conditions = append(conditions, fmt.Sprintf("created_at <= $%d", argIndex))
args = append(args, *filters.EndTime)
argIndex++
}

if filters.SuccessOnly != nil && *filters.SuccessOnly {
conditions = append(conditions, "success = TRUE")
}

whereClause := ""
if len(conditions) > 0 {
whereClause = "WHERE " + strings.Join(conditions, " AND ")
}

// Get total count
countQuery := fmt.Sprintf("SELECT COUNT(*) FROM audit_logs %s", whereClause)
var total int
err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
if err != nil {
return nil, 0, fmt.Errorf("failed to count audit logs: %w", err)
}

// Get logs with pagination
limit := filters.Limit
if limit <= 0 {
limit = 50
}
offset := filters.Offset
if offset < 0 {
offset = 0
}

query := fmt.Sprintf(`
SELECT id, user_id, created_at, action, resource_type, resource_id,
household_id, ip_address, user_agent, old_values, new_values,
metadata, success, error_message
FROM audit_logs
%s
ORDER BY created_at DESC
LIMIT $%d OFFSET $%d
`, whereClause, argIndex, argIndex+1)

args = append(args, limit, offset)

rows, err := r.pool.Query(ctx, query, args...)
if err != nil {
return nil, 0, fmt.Errorf("failed to list audit logs: %w", err)
}
defer rows.Close()

var logs []*AuditLog
for rows.Next() {
var log AuditLog
var oldValuesJSON, newValuesJSON, metadataJSON []byte

err := rows.Scan(
&log.ID, &log.UserID, &log.CreatedAt, &log.Action, &log.ResourceType,
&log.ResourceID, &log.HouseholdID, &log.IPAddress, &log.UserAgent,
&oldValuesJSON, &newValuesJSON, &metadataJSON,
&log.Success, &log.ErrorMessage,
)
if err != nil {
return nil, 0, fmt.Errorf("failed to scan audit log: %w", err)
}

// Unmarshal JSON fields
if len(oldValuesJSON) > 0 {
if err := json.Unmarshal(oldValuesJSON, &log.OldValues); err != nil {
return nil, 0, fmt.Errorf("failed to unmarshal old_values: %w", err)
}
}
if len(newValuesJSON) > 0 {
if err := json.Unmarshal(newValuesJSON, &log.NewValues); err != nil {
return nil, 0, fmt.Errorf("failed to unmarshal new_values: %w", err)
}
}
if len(metadataJSON) > 0 {
if err := json.Unmarshal(metadataJSON, &log.Metadata); err != nil {
return nil, 0, fmt.Errorf("failed to unmarshal metadata: %w", err)
}
}

logs = append(logs, &log)
}

if err := rows.Err(); err != nil {
return nil, 0, fmt.Errorf("failed to iterate audit logs: %w", err)
}

return logs, total, nil
}

// DeleteOlderThan deletes audit logs older than the specified time
func (r *repository) DeleteOlderThan(ctx context.Context, before time.Time) (int64, error) {
query := "DELETE FROM audit_logs WHERE created_at < $1"

result, err := r.pool.Exec(ctx, query, before)
if err != nil {
return 0, fmt.Errorf("failed to delete old audit logs: %w", err)
}

rowsAffected := result.RowsAffected()
return rowsAffected, nil
}
