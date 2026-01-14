package audit

import (
"encoding/json"
"log/slog"
"net/http"
"strconv"
"time"
)

type handler struct {
service Service
logger  *slog.Logger
}

// NewHandler creates a new audit log handler
func NewHandler(service Service, logger *slog.Logger) *handler {
return &handler{
service: service,
logger:  logger,
}
}

// ListAuditLogs handles GET /admin/audit-logs
func (h *handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
ctx := r.Context()

// Parse query parameters
filters := &ListFilters{
Limit:  50,
Offset: 0,
}

// user_id filter
if userID := r.URL.Query().Get("user_id"); userID != "" {
filters.UserID = &userID
}

// household_id filter
if householdID := r.URL.Query().Get("household_id"); householdID != "" {
filters.HouseholdID = &householdID
}

// action filter
if action := r.URL.Query().Get("action"); action != "" {
a := Action(action)
filters.Action = &a
}

// resource_type filter
if resourceType := r.URL.Query().Get("resource_type"); resourceType != "" {
filters.ResourceType = &resourceType
}

// resource_id filter
if resourceID := r.URL.Query().Get("resource_id"); resourceID != "" {
filters.ResourceID = &resourceID
}

// start_time filter (ISO 8601 format)
if startTime := r.URL.Query().Get("start_time"); startTime != "" {
t, err := time.Parse(time.RFC3339, startTime)
if err == nil {
filters.StartTime = &t
}
}

// end_time filter (ISO 8601 format)
if endTime := r.URL.Query().Get("end_time"); endTime != "" {
t, err := time.Parse(time.RFC3339, endTime)
if err == nil {
filters.EndTime = &t
}
}

// success_only filter
if successOnly := r.URL.Query().Get("success_only"); successOnly == "true" {
t := true
filters.SuccessOnly = &t
}

// Pagination
if limit := r.URL.Query().Get("limit"); limit != "" {
if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 100 {
filters.Limit = l
}
}

if offset := r.URL.Query().Get("offset"); offset != "" {
if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
filters.Offset = o
}
}

// Query audit logs
logs, total, err := h.service.Query(ctx, filters)
if err != nil {
h.logger.Error("Failed to query audit logs", "error", err)
http.Error(w, "Failed to query audit logs", http.StatusInternalServerError)
return
}

response := map[string]interface{}{
"logs":   logs,
"total":  total,
"limit":  filters.Limit,
"offset": filters.Offset,
}

w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(response)
}

// GetAuditLog handles GET /admin/audit-logs/{id}
func (h *handler) GetAuditLog(w http.ResponseWriter, r *http.Request) {
ctx := r.Context()
id := r.PathValue("id")

if id == "" {
http.Error(w, "Missing audit log ID", http.StatusBadRequest)
return
}

// Query by ID
logs, _, err := h.service.Query(ctx, &ListFilters{
Limit:  1,
Offset: 0,
})

if err != nil {
h.logger.Error("Failed to get audit log", "error", err, "id", id)
http.Error(w, "Failed to get audit log", http.StatusInternalServerError)
return
}

if len(logs) == 0 {
http.Error(w, "Audit log not found", http.StatusNotFound)
return
}

w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(logs[0])
}

// RunCleanup handles POST /admin/audit-logs/cleanup
func (h *handler) RunCleanup(w http.ResponseWriter, r *http.Request) {
ctx := r.Context()

// Default retention: 90 days
retentionDays := 90

// Allow override via query param
if days := r.URL.Query().Get("retention_days"); days != "" {
if d, err := strconv.Atoi(days); err == nil && d > 0 {
retentionDays = d
}
}

deleted, err := h.service.Cleanup(ctx, retentionDays)
if err != nil {
h.logger.Error("Failed to cleanup audit logs", "error", err)
http.Error(w, "Failed to cleanup audit logs", http.StatusInternalServerError)
return
}

response := map[string]interface{}{
"deleted":        deleted,
"retention_days": retentionDays,
}

w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(response)
}
