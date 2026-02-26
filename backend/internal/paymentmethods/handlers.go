package paymentmethods

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/blanquicet/conti/backend/internal/auth"
	"github.com/blanquicet/conti/backend/internal/households"
)

// Handler handles HTTP requests for payment method management
type Handler struct {
service       *Service
logger        *slog.Logger
authSvc       *auth.Service
householdRepo households.HouseholdRepository
cookieName    string
}

// NewHandler creates a new payment method handler
func NewHandler(
service *Service,
authService *auth.Service,
householdRepo households.HouseholdRepository,
cookieName string,
logger *slog.Logger,
) *Handler {
return &Handler{
service:       service,
logger:        logger,
authSvc:       authService,
householdRepo: householdRepo,
cookieName:    cookieName,
}
}

// Request/Response types

type CreatePaymentMethodRequest struct {
	Name                  string            `json:"name"`
	Type                  PaymentMethodType `json:"type"`
	IsSharedWithHousehold bool              `json:"is_shared_with_household"`
	IsActive              *bool             `json:"is_active,omitempty"` // Optional, defaults to true
	Last4                 *string           `json:"last4,omitempty"`
	Institution           *string           `json:"institution,omitempty"`
	Notes                 *string           `json:"notes,omitempty"`
	LinkedAccountID       *string           `json:"linked_account_id,omitempty"`
	CutoffDay             *int              `json:"cutoff_day,omitempty"`
}

type UpdatePaymentMethodRequest struct {
	Name                  *string `json:"name,omitempty"`
	IsSharedWithHousehold *bool   `json:"is_shared_with_household,omitempty"`
	Last4                 *string `json:"last4,omitempty"`
	Institution           *string `json:"institution,omitempty"`
	Notes                 *string `json:"notes,omitempty"`
	IsActive              *bool   `json:"is_active,omitempty"`
	LinkedAccountID       *string `json:"linked_account_id,omitempty"`
	CutoffDay             *int    `json:"cutoff_day,omitempty"`
}

type ErrorResponse struct {
Error string `json:"error"`
}

// Helper methods

func (h *Handler) getUserFromRequest(r *http.Request) (*auth.User, error) {
cookie, err := r.Cookie(h.cookieName)
if err != nil {
return nil, errors.New("no session cookie")
}

user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
if err != nil {
return nil, err
}

return user, nil
}

func (h *Handler) getUserHousehold(ctx context.Context, userID string) (*households.Household, error) {
households, err := h.householdRepo.ListByUser(ctx, userID)
if err != nil {
return nil, err
}

if len(households) == 0 {
return nil, errors.New("user has no household")
}

return households[0], nil
}

func (h *Handler) respondJSON(w http.ResponseWriter, data interface{}, statusCode int) {
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(statusCode)
json.NewEncoder(w).Encode(data)
}

func (h *Handler) respondError(w http.ResponseWriter, err error, statusCode int) {
h.logger.Error("request error", "error", err.Error(), "status", statusCode)
h.respondJSON(w, ErrorResponse{Error: err.Error()}, statusCode)
}

// HTTP Handlers

// CreatePaymentMethod handles POST /api/payment-methods
func (h *Handler) CreatePaymentMethod(w http.ResponseWriter, r *http.Request) {
user, err := h.getUserFromRequest(r)
if err != nil {
h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
return
}

var req CreatePaymentMethodRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
return
}

// Get user's household
household, err := h.getUserHousehold(r.Context(), user.ID)
if err != nil {
h.respondError(w, errors.New("user has no household"), http.StatusNotFound)
return
}

input := &CreateInput{
HouseholdID:           household.ID,
OwnerID:               user.ID,
Name:                  req.Name,
Type:                  req.Type,
IsSharedWithHousehold: req.IsSharedWithHousehold,
IsActive:              req.IsActive,
Last4:                 req.Last4,
Institution:           req.Institution,
Notes:                 req.Notes,
LinkedAccountID:       req.LinkedAccountID,
CutoffDay:             req.CutoffDay,
}

pm, err := h.service.Create(r.Context(), input)
if err != nil {
if errors.Is(err, ErrPaymentMethodNameExists) {
h.respondError(w, err, http.StatusConflict)
return
}
h.respondError(w, err, http.StatusBadRequest)
return
}

h.respondJSON(w, pm, http.StatusCreated)
}

// ListPaymentMethods handles GET /api/payment-methods
// Query params:
//   - own_only=true: only return payment methods owned by the user (not shared ones from others)
func (h *Handler) ListPaymentMethods(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	// Get user's household
	household, err := h.getUserHousehold(r.Context(), user.ID)
	if err != nil {
		h.respondError(w, errors.New("user has no household"), http.StatusNotFound)
		return
	}

	// Check if we should only return user's own payment methods
	ownOnly := r.URL.Query().Get("own_only") == "true"

	var methods []*PaymentMethod
	if ownOnly {
		methods, err = h.service.ListByOwner(r.Context(), household.ID, user.ID)
	} else {
		methods, err = h.service.ListByHousehold(r.Context(), household.ID, user.ID)
	}

	if err != nil {
		h.respondError(w, err, http.StatusInternalServerError)
		return
	}

	// Ensure we return empty array instead of null
	if methods == nil {
		methods = []*PaymentMethod{}
	}

	h.respondJSON(w, methods, http.StatusOK)
}

// GetPaymentMethod handles GET /api/payment-methods/:id
func (h *Handler) GetPaymentMethod(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
if err != nil {
h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
return
}

id := r.PathValue("id")
if id == "" {
h.respondError(w, errors.New("payment method ID is required"), http.StatusBadRequest)
return
}

pm, err := h.service.GetByID(r.Context(), id, user.ID)
if err != nil {
if errors.Is(err, ErrPaymentMethodNotFound) {
h.respondError(w, err, http.StatusNotFound)
return
}
if errors.Is(err, ErrNotAuthorized) {
h.respondError(w, err, http.StatusForbidden)
return
}
h.respondError(w, err, http.StatusInternalServerError)
return
}

h.respondJSON(w, pm, http.StatusOK)
}

// UpdatePaymentMethod handles PATCH /api/payment-methods/:id
func (h *Handler) UpdatePaymentMethod(w http.ResponseWriter, r *http.Request) {
user, err := h.getUserFromRequest(r)
if err != nil {
h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
return
}

id := r.PathValue("id")
if id == "" {
h.respondError(w, errors.New("payment method ID is required"), http.StatusBadRequest)
return
}

var req UpdatePaymentMethodRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
return
}

input := &UpdateInput{
		ID:                    id,
		Name:                  req.Name,
		IsSharedWithHousehold: req.IsSharedWithHousehold,
		Last4:                 req.Last4,
		Institution:           req.Institution,
		Notes:                 req.Notes,
		IsActive:              req.IsActive,
		LinkedAccountID:       req.LinkedAccountID,
		CutoffDay:             req.CutoffDay,
		OwnerID:               user.ID,
	}

pm, err := h.service.Update(r.Context(), input)
if err != nil {
if errors.Is(err, ErrPaymentMethodNotFound) {
h.respondError(w, err, http.StatusNotFound)
return
}
if errors.Is(err, ErrNotAuthorized) {
h.respondError(w, err, http.StatusForbidden)
return
}
if errors.Is(err, ErrPaymentMethodNameExists) {
h.respondError(w, err, http.StatusConflict)
return
}
h.respondError(w, err, http.StatusBadRequest)
return
}

h.respondJSON(w, pm, http.StatusOK)
}

// DeletePaymentMethod handles DELETE /api/payment-methods/:id
func (h *Handler) DeletePaymentMethod(w http.ResponseWriter, r *http.Request) {
user, err := h.getUserFromRequest(r)
if err != nil {
h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
return
}

id := r.PathValue("id")
if id == "" {
h.respondError(w, errors.New("payment method ID is required"), http.StatusBadRequest)
return
}

err = h.service.Delete(r.Context(), id, user.ID)
if err != nil {
if errors.Is(err, ErrPaymentMethodNotFound) {
h.respondError(w, err, http.StatusNotFound)
return
}
if errors.Is(err, ErrNotAuthorized) {
h.respondError(w, err, http.StatusForbidden)
return
}
h.respondError(w, err, http.StatusInternalServerError)
return
}

w.WriteHeader(http.StatusNoContent)
}
