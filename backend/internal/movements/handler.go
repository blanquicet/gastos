package movements

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/blanquicet/gastos/backend/internal/auth"
	"github.com/blanquicet/gastos/backend/internal/categorygroups"
	"github.com/blanquicet/gastos/backend/internal/households"
	"github.com/blanquicet/gastos/backend/internal/n8nclient"
	"github.com/blanquicet/gastos/backend/internal/paymentmethods"
	"github.com/google/uuid"
)

// Handler handles movement-related HTTP requests.
type Handler struct {
	service    Service
	authSvc    *auth.Service
	cookieName string
	logger     *slog.Logger
	// Legacy n8n client for backwards compatibility
	n8nClient *n8nclient.Client
}

// NewHandler creates a new movements handler.
func NewHandler(
	service Service,
	authService *auth.Service,
	cookieName string,
	n8nClient *n8nclient.Client,
	logger *slog.Logger,
) *Handler {
	return &Handler{
		service:    service,
		authSvc:    authService,
		cookieName: cookieName,
		n8nClient:  n8nClient,
		logger:     logger,
	}
}

// HandleCreate creates a new movement
// POST /movements
func (h *Handler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		h.logger.Error("no session cookie", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		h.logger.Error("failed to get user by session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var req CreateMovementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Error("failed to decode request", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Convert to input
	input, err := req.ToInput()
	if err != nil {
		h.logger.Error("failed to convert request", "error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Create movement
	movement, err := h.service.Create(r.Context(), user.ID, input)
	if err != nil {
		h.logger.Error("failed to create movement", "error", err, "user_id", user.ID)
		
		// Handle specific errors
		switch err {
		case ErrN8NUnavailable:
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		case ErrInvalidMovementType, ErrInvalidAmount, ErrPayerRequired,
			ErrCounterpartyRequired, ErrCounterpartyNotAllowed,
			ErrParticipantsRequired, ErrParticipantsNotAllowed,
			ErrInvalidPercentageSum, ErrCategoryRequired, ErrPaymentMethodRequired:
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	h.logger.Info("movement created", "movement_id", movement.ID, "user_id", user.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(movement); err != nil {
		h.logger.Error("failed to encode response", "error", err)
	}
}

// RecordMovement proxies movement registration to n8n (DEPRECATED - kept for backwards compatibility).
// POST /movements (legacy)
func (h *Handler) RecordMovement(w http.ResponseWriter, r *http.Request) {
	var movement n8nclient.Movement

	if err := json.NewDecoder(r.Body).Decode(&movement); err != nil {
		h.logger.Error("failed to decode movement", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Always generate unique ID for this movement (force rebuild)
	if movement.ID == "" {
		movement.ID = uuid.New().String()
		h.logger.Info("generated new movement ID", "id", movement.ID)
	}

	h.logger.Info("recording movement (legacy)", "id", movement.ID, "type", movement.Tipo, "valor", movement.Valor)

	// Forward to n8n
	resp, err := h.n8nClient.RecordMovement(r.Context(), &movement)
	if err != nil {
		h.logger.Error("failed to record movement in n8n", "error", err, "movement_id", movement.ID)
		http.Error(w, "n8n service unavailable - movement could not be synced to Google Sheets. Please contact administrator", http.StatusServiceUnavailable)
		return
	}

	h.logger.Info("movement recorded successfully", "id", movement.ID, "n8n_response", resp)

	// Return n8n's response
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		h.logger.Error("failed to encode response", "error", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// HandleList lists movements for the user's household
// GET /movements
func (h *Handler) HandleList(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		h.logger.Error("no session cookie", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		h.logger.Error("failed to get user by session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse query parameters for filters
	filters := &ListMovementsFilters{}
	
	if typeStr := r.URL.Query().Get("type"); typeStr != "" {
		movType := MovementType(typeStr)
		filters.Type = &movType
	}
	if month := r.URL.Query().Get("month"); month != "" {
		filters.Month = &month
	}
	if memberID := r.URL.Query().Get("member_id"); memberID != "" {
		filters.MemberID = &memberID
	}

	// Get movements
	response, err := h.service.ListByHousehold(r.Context(), user.ID, filters)
	if err != nil {
		h.logger.Error("failed to list movements", "error", err, "user_id", user.ID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		h.logger.Error("failed to encode response", "error", err)
	}
}

// HandleGetByID retrieves a single movement by ID
// GET /movements/{id}
func (h *Handler) HandleGetByID(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		h.logger.Error("no session cookie", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		h.logger.Error("failed to get user by session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get movement ID from path
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "Movement ID is required", http.StatusBadRequest)
		return
	}

	// Get movement
	movement, err := h.service.GetByID(r.Context(), user.ID, id)
	if err != nil {
		h.logger.Error("failed to get movement", "error", err, "movement_id", id, "user_id", user.ID)
		
		switch err {
		case ErrMovementNotFound:
			http.Error(w, "Movement not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		default:
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(movement); err != nil {
		h.logger.Error("failed to encode response", "error", err)
	}
}

// HandleUpdate updates a movement
// PATCH /movements/{id}
func (h *Handler) HandleUpdate(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		h.logger.Error("no session cookie", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		h.logger.Error("failed to get user by session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get movement ID from path
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "Movement ID is required", http.StatusBadRequest)
		return
	}

	// Parse request body
	var input UpdateMovementInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.logger.Error("failed to decode request", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update movement
	movement, err := h.service.Update(r.Context(), user.ID, id, &input)
	if err != nil {
		h.logger.Error("failed to update movement", "error", err, "movement_id", id, "user_id", user.ID)
		
		switch err {
		case ErrMovementNotFound:
			http.Error(w, "Movement not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		case ErrInvalidAmount:
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(movement); err != nil {
		h.logger.Error("failed to encode response", "error", err)
	}
}

// HandleGetDebtConsolidation calculates who owes whom
// GET /movements/debts/consolidate?month=YYYY-MM
func (h *Handler) HandleGetDebtConsolidation(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		h.logger.Error("no session cookie", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		h.logger.Error("failed to get user by session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse optional month filter
	var month *string
	if monthStr := r.URL.Query().Get("month"); monthStr != "" {
		month = &monthStr
	}

	// Get debt consolidation
	consolidation, err := h.service.GetDebtConsolidation(r.Context(), user.ID, month)
	if err != nil {
		h.logger.Error("failed to get debt consolidation", "error", err, "user_id", user.ID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(consolidation); err != nil {
		h.logger.Error("failed to encode response", "error", err)
	}
}

// HandleDelete deletes a movement
// DELETE /movements/{id}
func (h *Handler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		h.logger.Error("no session cookie", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		h.logger.Error("failed to get user by session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get movement ID from path
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "Movement ID is required", http.StatusBadRequest)
		return
	}

	// Delete movement
	if err := h.service.Delete(r.Context(), user.ID, id); err != nil {
		h.logger.Error("failed to delete movement", "error", err, "movement_id", id, "user_id", user.ID)
		
		switch err {
		case ErrMovementNotFound:
			http.Error(w, "Movement not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		default:
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Request/Response types

// CreateMovementRequest represents the HTTP request for creating a movement
type CreateMovementRequest struct {
	Type         string                      `json:"type"`
	Description  string                      `json:"description"`
	Amount       float64                     `json:"amount"`
	Category     *string                     `json:"category,omitempty"`
	MovementDate string                      `json:"movement_date"` // YYYY-MM-DD format
	
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	
	PaymentMethodID   *string                  `json:"payment_method_id,omitempty"`
	ReceiverAccountID *string                  `json:"receiver_account_id,omitempty"`
	Participants      []ParticipantRequestItem `json:"participants,omitempty"`
}

// ParticipantRequestItem represents a participant in the HTTP request
type ParticipantRequestItem struct {
	ParticipantUserID    *string `json:"participant_user_id,omitempty"`
	ParticipantContactID *string `json:"participant_contact_id,omitempty"`
	Percentage           float64 `json:"percentage"`
}

// ToInput converts CreateMovementRequest to CreateMovementInput
func (r *CreateMovementRequest) ToInput() (*CreateMovementInput, error) {
	// Parse movement date
	movementDate, err := time.Parse("2006-01-02", r.MovementDate)
	if err != nil {
		return nil, err
	}

	input := &CreateMovementInput{
		Type:                  MovementType(r.Type),
		Description:           r.Description,
		Amount:                r.Amount,
		Category:              r.Category,
		MovementDate:          movementDate,
		PayerUserID:           r.PayerUserID,
		PayerContactID:        r.PayerContactID,
		CounterpartyUserID:    r.CounterpartyUserID,
		CounterpartyContactID: r.CounterpartyContactID,
		PaymentMethodID:       r.PaymentMethodID,
		ReceiverAccountID:     r.ReceiverAccountID,
	}

	// Convert participants
	if len(r.Participants) > 0 {
		input.Participants = make([]ParticipantInput, len(r.Participants))
		for i, p := range r.Participants {
			input.Participants[i] = ParticipantInput{
				ParticipantUserID:    p.ParticipantUserID,
				ParticipantContactID: p.ParticipantContactID,
				Percentage:           p.Percentage,
			}
		}
	}

	return input, nil
}

// FormConfigHandler handles requests for movement form configuration data
type FormConfigHandler struct {
	authSvc            *auth.Service
	householdRepo      households.HouseholdRepository
	paymentMethodRepo  paymentmethods.Repository
	categoryGroupsRepo categorygroups.Repository
	cookieName         string
	logger             *slog.Logger
}

// NewFormConfigHandler creates a new form config handler
func NewFormConfigHandler(
	authSvc *auth.Service,
	householdRepo households.HouseholdRepository,
	paymentMethodRepo paymentmethods.Repository,
	categoryGroupsRepo categorygroups.Repository,
	cookieName string,
	logger *slog.Logger,
) *FormConfigHandler {
	return &FormConfigHandler{
		authSvc:            authSvc,
		householdRepo:      householdRepo,
		paymentMethodRepo:  paymentMethodRepo,
		categoryGroupsRepo: categoryGroupsRepo,
		cookieName:         cookieName,
		logger:             logger,
	}
}

// User represents a user or contact in the form
type User struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"` // "member" or "contact"
	IsPrimary  bool   `json:"is_primary"`
	HasAccount bool   `json:"has_account,omitempty"`
}

// PaymentMethod represents a payment method in the form
type PaymentMethod struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	OwnerName string `json:"owner_name"`
	OwnerID   string `json:"owner_id"`
	IsShared  bool   `json:"is_shared"`
}

// FormConfigResponse is the response for movement form configuration
type FormConfigResponse struct {
	Users          []User                         `json:"users"`
	PaymentMethods []PaymentMethod                `json:"payment_methods"`
	CategoryGroups []*categorygroups.CategoryGroup `json:"category_groups"`
}

// GetFormConfig handles GET /api/movement-form-config
func (h *FormConfigHandler) GetFormConfig(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		h.logger.Error("no session cookie", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		h.logger.Error("failed to get user by session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get user's household
	households, err := h.householdRepo.ListByUser(r.Context(), user.ID)
	if err != nil {
		h.logger.Error("failed to list households", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if len(households) == 0 {
		http.Error(w, "user has no household", http.StatusNotFound)
		return
	}

	household := households[0]

	// Get household members
	members, err := h.householdRepo.GetMembers(r.Context(), household.ID)
	if err != nil {
		h.logger.Error("failed to get members", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Get active contacts
	allContacts, err := h.householdRepo.ListContacts(r.Context(), household.ID)
	if err != nil {
		h.logger.Error("failed to list contacts", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Build users list: members first, then active contacts
	var users []User
	memberIDs := make(map[string]bool)
	
	// Add household members
	for _, m := range members {
		users = append(users, User{
			ID:        m.UserID,
			Name:      m.UserName,
			Type:      "member",
			IsPrimary: true,
		})
		memberIDs[m.UserID] = true
	}

	// Add active contacts only
	for _, c := range allContacts {
		if !c.IsActive {
			continue
		}
		users = append(users, User{
			ID:         c.ID,
			Name:       c.Name,
			Type:       "contact",
			IsPrimary:  false,
			HasAccount: c.LinkedUserID != nil,
		})
	}

	// Get payment methods (own + shared)
	allPaymentMethods, err := h.paymentMethodRepo.ListByHousehold(r.Context(), household.ID)
	if err != nil {
		h.logger.Error("failed to list payment methods", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Filter: include all members' payment methods + shared ones, active only
	var paymentMethods []PaymentMethod
	for _, pm := range allPaymentMethods {
		// Include if: (1) owner is a member of household, OR (2) shared with household
		if pm.IsActive && (memberIDs[pm.OwnerID] || pm.IsSharedWithHousehold) {
			paymentMethods = append(paymentMethods, PaymentMethod{
				ID:        pm.ID,
				Name:      pm.Name,
				Type:      string(pm.Type),
				OwnerName: pm.OwnerName,
				OwnerID:   pm.OwnerID,
				IsShared:  pm.IsSharedWithHousehold,
			})
		}
	}

	// Get category groups from database
	categoryGroups, err := h.categoryGroupsRepo.ListByHousehold(r.Context(), household.ID)
	if err != nil {
		h.logger.Error("failed to list category groups", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	response := FormConfigResponse{
		Users:          users,
		PaymentMethods: paymentMethods,
		CategoryGroups: categoryGroups,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		h.logger.Error("failed to encode response", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
}
