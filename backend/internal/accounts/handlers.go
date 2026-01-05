package accounts

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/blanquicet/gastos/backend/internal/auth"
	"github.com/blanquicet/gastos/backend/internal/households"
)

// Handler handles HTTP requests for account management
type Handler struct {
	service       *Service
	logger        *slog.Logger
	authSvc       *auth.Service
	householdRepo households.HouseholdRepository
	cookieName    string
}

// NewHandler creates a new account handler
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

type CreateAccountRequest struct {
	Name           string       `json:"name"`
	Type           AccountType  `json:"type"`
	Institution    *string      `json:"institution,omitempty"`
	Last4          *string      `json:"last4,omitempty"`
	InitialBalance *float64     `json:"initial_balance,omitempty"`
	Notes          *string      `json:"notes,omitempty"`
}

type UpdateAccountRequest struct {
	Name           *string  `json:"name,omitempty"`
	Institution    *string  `json:"institution,omitempty"`
	Last4          *string  `json:"last4,omitempty"`
	InitialBalance *float64 `json:"initial_balance,omitempty"`
	Notes          *string  `json:"notes,omitempty"`
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
	h.logger.Error("request error", "error", err.Error())
	h.respondJSON(w, ErrorResponse{Error: err.Error()}, statusCode)
}

// HTTP Handlers

// CreateAccount handles POST /api/accounts
func (h *Handler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	household, err := h.getUserHousehold(r.Context(), user.ID)
	if err != nil {
		h.respondError(w, errors.New("user has no household"), http.StatusNotFound)
		return
	}

	var req CreateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	input := CreateInput{
		HouseholdID:    household.ID,
		Name:           req.Name,
		Type:           req.Type,
		Institution:    req.Institution,
		Last4:          req.Last4,
		InitialBalance: req.InitialBalance,
		Notes:          req.Notes,
	}

	account, err := h.service.Create(r.Context(), input)
	if err != nil {
		if errors.Is(err, ErrAccountNameExists) {
			h.respondError(w, err, http.StatusConflict)
			return
		}
		h.respondError(w, err, http.StatusBadRequest)
		return
	}

	h.respondJSON(w, account, http.StatusCreated)
}

// ListAccounts handles GET /api/accounts
func (h *Handler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	household, err := h.getUserHousehold(r.Context(), user.ID)
	if err != nil {
		h.respondError(w, errors.New("user has no household"), http.StatusNotFound)
		return
	}

	accounts, err := h.service.ListByHousehold(r.Context(), household.ID)
	if err != nil {
		h.respondError(w, err, http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, accounts, http.StatusOK)
}

// GetAccount handles GET /api/accounts/:id
func (h *Handler) GetAccount(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	household, err := h.getUserHousehold(r.Context(), user.ID)
	if err != nil {
		h.respondError(w, errors.New("user has no household"), http.StatusNotFound)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		h.respondError(w, errors.New("account ID is required"), http.StatusBadRequest)
		return
	}

	account, err := h.service.GetByID(r.Context(), id, household.ID)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
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

	h.respondJSON(w, account, http.StatusOK)
}

// UpdateAccount handles PATCH /api/accounts/:id
func (h *Handler) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	household, err := h.getUserHousehold(r.Context(), user.ID)
	if err != nil {
		h.respondError(w, errors.New("user has no household"), http.StatusNotFound)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		h.respondError(w, errors.New("account ID is required"), http.StatusBadRequest)
		return
	}

	var req UpdateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	input := UpdateInput{
		ID:             id,
		Name:           req.Name,
		Institution:    req.Institution,
		Last4:          req.Last4,
		InitialBalance: req.InitialBalance,
		Notes:          req.Notes,
	}

	account, err := h.service.Update(r.Context(), household.ID, input)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
			h.respondError(w, err, http.StatusNotFound)
			return
		}
		if errors.Is(err, ErrNotAuthorized) {
			h.respondError(w, err, http.StatusForbidden)
			return
		}
		if errors.Is(err, ErrAccountNameExists) {
			h.respondError(w, err, http.StatusConflict)
			return
		}
		h.respondError(w, err, http.StatusBadRequest)
		return
	}

	h.respondJSON(w, account, http.StatusOK)
}

// DeleteAccount handles DELETE /api/accounts/:id
func (h *Handler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	household, err := h.getUserHousehold(r.Context(), user.ID)
	if err != nil {
		h.respondError(w, errors.New("user has no household"), http.StatusNotFound)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		h.respondError(w, errors.New("account ID is required"), http.StatusBadRequest)
		return
	}

	err = h.service.Delete(r.Context(), id, household.ID)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
			h.respondError(w, err, http.StatusNotFound)
			return
		}
		if errors.Is(err, ErrNotAuthorized) {
			h.respondError(w, err, http.StatusForbidden)
			return
		}
		if errors.Is(err, ErrAccountHasIncome) || errors.Is(err, ErrAccountHasLinkedPaymentMethods) {
			h.respondError(w, err, http.StatusConflict)
			return
		}
		h.respondError(w, err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
