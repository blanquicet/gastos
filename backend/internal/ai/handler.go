package ai

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/blanquicet/conti/backend/internal/auth"
	"github.com/blanquicet/conti/backend/internal/households"
	"github.com/blanquicet/conti/backend/internal/movements"
)

// Handler provides HTTP endpoints for chat.
type Handler struct {
	chatService      *ChatService
	authService      *auth.Service
	movementsService movements.Service
	householdRepo    households.HouseholdRepository
	cookieName       string
	logger           *slog.Logger
	rateLimiter      *rateLimiter
}

// NewHandler creates a new chat HTTP handler.
func NewHandler(chatService *ChatService, authService *auth.Service, movementsService movements.Service, householdRepo households.HouseholdRepository, cookieName string, logger *slog.Logger) *Handler {
	return &Handler{
		chatService:      chatService,
		authService:      authService,
		movementsService: movementsService,
		householdRepo:    householdRepo,
		cookieName:       cookieName,
		logger:           logger,
		rateLimiter:      newRateLimiter(20, time.Minute),
	}
}

type chatRequest struct {
	Message string           `json:"message"`
	History []historyMessage `json:"history,omitempty"`
}

type historyMessage struct {
	Role    string `json:"role"` // "user" or "assistant"
	Content string `json:"content"`
}

type chatResponse struct {
	Message string         `json:"message"`
	Draft   *MovementDraft `json:"draft,omitempty"`
	Options []string       `json:"options,omitempty"`
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

	// Fetch household members for identity context
	members, _ := h.householdRepo.GetMembers(r.Context(), householdID)
	var memberNames []string
	userName := user.Name
	for _, m := range members {
		if m.UserID != userID {
			memberNames = append(memberNames, m.UserName)
		}
	}

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
	// Convert history to ChatMessage format
	var history []ChatMessage
	for _, h := range req.History {
		if h.Role == "user" || h.Role == "assistant" {
			history = append(history, ChatMessage{Role: h.Role, Content: h.Content})
		}
	}

	result, err := h.chatService.Chat(r.Context(), householdID, userID, userName, memberNames, req.Message, history)
	if err != nil {
		h.logger.Error("chat failed", "error", err, "user_id", userID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "error procesando tu pregunta"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chatResponse{Message: result.Message, Draft: result.Draft, Options: result.Options})
}

// HandleCreateMovement processes POST /chat/create-movement requests.
func (h *Handler) HandleCreateMovement(w http.ResponseWriter, r *http.Request) {
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

	var draft MovementDraft
	if err := json.NewDecoder(r.Body).Decode(&draft); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Parse date in Bogota timezone
	movDate, err := time.ParseInLocation("2006-01-02", draft.MovementDate, Bogota)
	if err != nil {
		http.Error(w, `{"error":"invalid date format"}`, http.StatusBadRequest)
		return
	}

	// Create movement via existing service
	input := &movements.CreateMovementInput{
		Type:            movements.MovementType(draft.Type),
		Description:     draft.Description,
		Amount:          draft.Amount,
		MovementDate:    movDate,
	}

	// Category (optional for some loan types)
	if draft.CategoryID != "" {
		input.CategoryID = &draft.CategoryID
	}

	// Payer
	if draft.PayerUserID != "" {
		input.PayerUserID = &draft.PayerUserID
	}
	if draft.PayerContactID != "" {
		input.PayerContactID = &draft.PayerContactID
	}

	// Payment method (optional for some types)
	if draft.PaymentMethodID != "" {
		input.PaymentMethodID = &draft.PaymentMethodID
	}

	// Counterparty (for DEBT_PAYMENT)
	if draft.CounterpartyUserID != "" {
		input.CounterpartyUserID = &draft.CounterpartyUserID
	}
	if draft.CounterpartyContactID != "" {
		input.CounterpartyContactID = &draft.CounterpartyContactID
	}

	// Participants (for SPLIT)
	for _, p := range draft.Participants {
		pi := movements.ParticipantInput{Percentage: p.Percentage}
		if p.UserID != "" {
			pi.ParticipantUserID = &p.UserID
		}
		if p.ContactID != "" {
			pi.ParticipantContactID = &p.ContactID
		}
		input.Participants = append(input.Participants, pi)
	}

	movement, err := h.movementsService.Create(r.Context(), user.ID, input)
	if err != nil {
		h.logger.Error("failed to create movement from chat", "error", err, "user_id", user.ID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":     true,
		"movement_id": movement.ID,
		"message":     "Movimiento registrado exitosamente",
	})
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
