package audit

import (
"context"
"log/slog"
"net"
"net/http"
"strings"
"time"
)

type service struct {
repo   Repository
logger *slog.Logger

// Buffered channel for async logging
asyncChan chan *LogInput
}

// NewService creates a new audit logging service
func NewService(repo Repository, logger *slog.Logger) Service {
s := &service{
repo:      repo,
logger:    logger,
asyncChan: make(chan *LogInput, 1000), // Buffer up to 1000 logs
}

// Start background worker
go s.asyncWorker()

return s
}

// Log creates an audit log entry synchronously
func (s *service) Log(ctx context.Context, input *LogInput) error {
_, err := s.repo.Create(ctx, input)
if err != nil {
s.logger.Error("Failed to create audit log", "error", err, "action", input.Action)
return err
}
return nil
}

// LogAsync creates an audit log entry asynchronously (non-blocking)
func (s *service) LogAsync(ctx context.Context, input *LogInput) {
select {
case s.asyncChan <- input:
// Successfully queued
default:
// Channel full - log warning but don't block
s.logger.Warn("Audit log channel full, dropping log entry", "action", input.Action)
}
}

// asyncWorker processes audit logs from channel
func (s *service) asyncWorker() {
for input := range s.asyncChan {
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
if err := s.Log(ctx, input); err != nil {
s.logger.Error("Async audit log failed", "error", err, "action", input.Action)
}
cancel()
}
}

// LogFromRequest extracts client info from HTTP request and logs
func (s *service) LogFromRequest(r *http.Request, input *LogInput) error {
input.IPAddress = getIPAddress(r)
input.UserAgent = getUserAgent(r)
return s.Log(r.Context(), input)
}

// Query retrieves audit logs with filters
func (s *service) Query(ctx context.Context, filters *ListFilters) ([]*AuditLog, int, error) {
return s.repo.List(ctx, filters)
}

// Cleanup deletes audit logs older than retentionDays
func (s *service) Cleanup(ctx context.Context, retentionDays int) (int64, error) {
before := time.Now().AddDate(0, 0, -retentionDays)
deleted, err := s.repo.DeleteOlderThan(ctx, before)
if err != nil {
s.logger.Error("Failed to cleanup old audit logs", "error", err)
return 0, err
}

s.logger.Info("Cleaned up old audit logs", "deleted_count", deleted, "retention_days", retentionDays)
return deleted, nil
}

// Helper functions

func getIPAddress(r *http.Request) *string {
// Try X-Forwarded-For header first (for proxies/load balancers)
forwarded := r.Header.Get("X-Forwarded-For")
if forwarded != "" {
// X-Forwarded-For can contain multiple IPs, take the first one
ips := strings.Split(forwarded, ",")
if len(ips) > 0 {
ip := strings.TrimSpace(ips[0])
return &ip
}
}

// Try X-Real-IP header
realIP := r.Header.Get("X-Real-IP")
if realIP != "" {
return &realIP
}

// Fall back to RemoteAddr
if r.RemoteAddr != "" {
// RemoteAddr includes port, extract just the IP
host, _, err := net.SplitHostPort(r.RemoteAddr)
if err == nil {
return &host
}
// If parsing fails, use as-is
return &r.RemoteAddr
}

return nil
}

func getUserAgent(r *http.Request) *string {
ua := r.Header.Get("User-Agent")
if ua != "" {
return &ua
}
return nil
}
