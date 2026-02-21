package ai

import (
"encoding/json"
"log/slog"
"net/http"
"sync"
"time"

"github.com/blanquicet/conti/backend/internal/auth"
"github.com/blanquicet/conti/backend/internal/households"
)

// Handler provides HTTP endpoints for chat.
type Handler struct {
chatService   *ChatService
authService   *auth.Service
householdRepo households.HouseholdRepository
cookieName    string
logger        *slog.Logger
rateLimiter   *rateLimiter
}

// NewHandler creates a new chat HTTP handler.
func NewHandler(chatService *ChatService, authService *auth.Service, householdRepo households.HouseholdRepository, cookieName string, logger *slog.Logger) *Handler {
return &Handler{
chatService:   chatService,
authService:   authService,
householdRepo: householdRepo,
cookieName:    cookieName,
logger:        logger,
rateLimiter:   newRateLimiter(20, time.Minute),
}
}

type chatRequest struct {
Message string `json:"message"`
}

type chatResponse struct {
Message string `json:"message"`
}

// HandleChat processes POST /chat requests.
func (h *Handler) HandleChat(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodPost {
http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
return
}

// Authenticate via session cookie (same pattern as other handlers)
cookie, err := r.Cookie(h.cookieName)
if err != nil {
http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
return
}

user, err := h.authService.GetUserBySession(r.Context(), cookie.Value)
if err != nil {
http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
return
}
userID := user.ID

// Resolve household
hh, err := h.householdRepo.ListByUser(r.Context(), userID)
if err != nil || len(hh) == 0 {
http.Error(w, `{"error":"no household found"}`, http.StatusNotFound)
return
}
householdID := hh[0].ID

// Rate limiting
if !h.rateLimiter.allow(userID) {
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusTooManyRequests)
json.NewEncoder(w).Encode(map[string]string{"error": "demasiadas solicitudes, intenta en un momento"})
return
}

// Parse request
var req chatRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
http.Error(w, `{"error":"message is required"}`, http.StatusBadRequest)
return
}

// Process chat
response, err := h.chatService.Chat(r.Context(), householdID, req.Message)
if err != nil {
h.logger.Error("chat failed", "error", err, "user_id", userID)
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusInternalServerError)
json.NewEncoder(w).Encode(map[string]string{"error": "error procesando tu pregunta"})
return
}

w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(chatResponse{Message: response})
}

// --- Simple Rate Limiter ---

type rateLimiter struct {
mu       sync.Mutex
limit    int
window   time.Duration
requests map[string][]time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
return &rateLimiter{
limit:    limit,
window:   window,
requests: make(map[string][]time.Time),
}
}

func (rl *rateLimiter) allow(key string) bool {
rl.mu.Lock()
defer rl.mu.Unlock()

now := time.Now()
cutoff := now.Add(-rl.window)

times := rl.requests[key]
valid := times[:0]
for _, t := range times {
if t.After(cutoff) {
valid = append(valid, t)
}
}

if len(valid) >= rl.limit {
rl.requests[key] = valid
return false
}

rl.requests[key] = append(valid, now)
return true
}
