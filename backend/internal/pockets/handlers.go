package pockets

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/blanquicet/conti/backend/internal/auth"
	"github.com/blanquicet/conti/backend/internal/households"
)

// Handler handles HTTP requests for pocket management
type Handler struct {
	service       *Service
	logger        *slog.Logger
	authSvc       *auth.Service
	householdRepo households.HouseholdRepository
	cookieName    string
}

// NewHandler creates a new pocket handler
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

// CreatePocketRequest is the request body for creating a pocket
type CreatePocketRequest struct {
	OwnerID    string   `json:"owner_id"`
	Name       string   `json:"name"`
	Icon       string   `json:"icon"`
	GoalAmount *float64 `json:"goal_amount,omitempty"`
	Note       *string  `json:"note,omitempty"`
}

// UpdatePocketRequest is the request body for updating a pocket
type UpdatePocketRequest struct {
	Name       *string  `json:"name,omitempty"`
	Icon       *string  `json:"icon,omitempty"`
	GoalAmount *float64 `json:"goal_amount,omitempty"`
	ClearGoal  bool     `json:"clear_goal,omitempty"`
	Note       *string  `json:"note,omitempty"`
	ClearNote  bool     `json:"clear_note,omitempty"`
}

// DepositRequest is the request body for depositing into a pocket
type DepositRequest struct {
	Amount          float64 `json:"amount"`
	Description     string  `json:"description"`
	TransactionDate string  `json:"transaction_date"`
	SourceAccountID string  `json:"source_account_id"`
}

// WithdrawRequest is the request body for withdrawing from a pocket
type WithdrawRequest struct {
	Amount               float64 `json:"amount"`
	Description          string  `json:"description"`
	TransactionDate      string  `json:"transaction_date"`
	DestinationAccountID string  `json:"destination_account_id"`
}

// EditTransactionRequest is the request body for editing a pocket transaction
type EditTransactionRequest struct {
	Amount               *float64 `json:"amount,omitempty"`
	Description          *string  `json:"description,omitempty"`
	TransactionDate      *string  `json:"transaction_date,omitempty"`
	SourceAccountID      *string  `json:"source_account_id,omitempty"`
	DestinationAccountID *string  `json:"destination_account_id,omitempty"`
}

// ErrorResponse represents an error response
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

func (h *Handler) respondJSON(w http.ResponseWriter, data any, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) respondError(w http.ResponseWriter, err error, statusCode int) {
	h.logger.Error("request error", "error", err.Error())
	h.respondJSON(w, ErrorResponse{Error: err.Error()}, statusCode)
}

// mapServiceError maps domain errors to HTTP status codes
func mapServiceError(err error) int {
	switch {
	case errors.Is(err, ErrPocketNotFound), errors.Is(err, ErrTransactionNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrNotAuthorized):
		return http.StatusForbidden
	case errors.Is(err, ErrPocketNameExists):
		return http.StatusConflict
	case errors.Is(err, ErrInsufficientBalance), errors.Is(err, ErrMaxPocketsReached),
		errors.Is(err, ErrPocketHasBalance), errors.Is(err, ErrPocketNotActive),
		errors.Is(err, ErrDeleteWouldOverdraft):
		return http.StatusUnprocessableEntity
	default:
		return 0
	}
}

func (h *Handler) handleServiceError(w http.ResponseWriter, err error) {
	status := mapServiceError(err)
	if status != 0 {
		h.respondError(w, err, status)
		return
	}
	// Unknown error — return 500
	h.respondError(w, errors.New("internal server error"), http.StatusInternalServerError)
}

// HTTP Handlers

// HandleCreate handles POST /api/pockets
func (h *Handler) HandleCreate(w http.ResponseWriter, r *http.Request) {
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

	var req CreatePocketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	input := &CreatePocketInput{
		HouseholdID: household.ID,
		OwnerID:     req.OwnerID,
		Name:        req.Name,
		Icon:        req.Icon,
		GoalAmount:  req.GoalAmount,
		Note:        req.Note,
	}

	pocket, err := h.service.Create(r.Context(), input)
	if err != nil {
		status := mapServiceError(err)
		if status != 0 {
			h.respondError(w, err, status)
			return
		}
		h.respondError(w, err, http.StatusBadRequest)
		return
	}

	h.respondJSON(w, pocket, http.StatusCreated)
}

// HandleList handles GET /api/pockets
func (h *Handler) HandleList(w http.ResponseWriter, r *http.Request) {
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

	pockets, err := h.service.ListByHousehold(r.Context(), household.ID)
	if err != nil {
		h.respondError(w, err, http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, pockets, http.StatusOK)
}

// HandleGetSummary handles GET /api/pockets/summary
func (h *Handler) HandleGetSummary(w http.ResponseWriter, r *http.Request) {
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

	summary, err := h.service.GetSummary(r.Context(), household.ID)
	if err != nil {
		h.respondError(w, err, http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, summary, http.StatusOK)
}

// HandleGetByID handles GET /api/pockets/{id}
func (h *Handler) HandleGetByID(w http.ResponseWriter, r *http.Request) {
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
		h.respondError(w, errors.New("pocket ID is required"), http.StatusBadRequest)
		return
	}

	pocket, err := h.service.GetByID(r.Context(), id, household.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, pocket, http.StatusOK)
}

// HandleUpdate handles PATCH /api/pockets/{id}
func (h *Handler) HandleUpdate(w http.ResponseWriter, r *http.Request) {
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
		h.respondError(w, errors.New("pocket ID is required"), http.StatusBadRequest)
		return
	}

	var req UpdatePocketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	input := &UpdatePocketInput{
		ID:         id,
		Name:       req.Name,
		Icon:       req.Icon,
		GoalAmount: req.GoalAmount,
		ClearGoal:  req.ClearGoal,
		Note:       req.Note,
		ClearNote:  req.ClearNote,
	}

	pocket, err := h.service.Update(r.Context(), user.ID, household.ID, input)
	if err != nil {
		status := mapServiceError(err)
		if status != 0 {
			h.respondError(w, err, status)
			return
		}
		h.respondError(w, err, http.StatusBadRequest)
		return
	}

	h.respondJSON(w, pocket, http.StatusOK)
}

// HandleDelete handles DELETE /api/pockets/{id}
func (h *Handler) HandleDelete(w http.ResponseWriter, r *http.Request) {
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
		h.respondError(w, errors.New("pocket ID is required"), http.StatusBadRequest)
		return
	}

	force := r.URL.Query().Get("force") == "true"

	err = h.service.Deactivate(r.Context(), id, user.ID, household.ID, force)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleDeposit handles POST /api/pockets/{id}/deposit
func (h *Handler) HandleDeposit(w http.ResponseWriter, r *http.Request) {
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

	_ = household // household verified via service layer

	id := r.PathValue("id")
	if id == "" {
		h.respondError(w, errors.New("pocket ID is required"), http.StatusBadRequest)
		return
	}

	var req DepositRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	txDate, err := time.Parse("2006-01-02", req.TransactionDate)
	if err != nil {
		h.respondError(w, errors.New("invalid transaction_date format, expected YYYY-MM-DD"), http.StatusBadRequest)
		return
	}

	input := &DepositInput{
		PocketID:        id,
		Amount:          req.Amount,
		Description:     req.Description,
		TransactionDate: txDate,
		SourceAccountID: req.SourceAccountID,
		CreatedBy:       user.ID,
	}

	transaction, err := h.service.Deposit(r.Context(), input)
	if err != nil {
		status := mapServiceError(err)
		if status != 0 {
			h.respondError(w, err, status)
			return
		}
		h.respondError(w, err, http.StatusBadRequest)
		return
	}

	h.respondJSON(w, transaction, http.StatusCreated)
}

// HandleWithdraw handles POST /api/pockets/{id}/withdraw
func (h *Handler) HandleWithdraw(w http.ResponseWriter, r *http.Request) {
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

	_ = household // household verified via service layer

	id := r.PathValue("id")
	if id == "" {
		h.respondError(w, errors.New("pocket ID is required"), http.StatusBadRequest)
		return
	}

	var req WithdrawRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	txDate, err := time.Parse("2006-01-02", req.TransactionDate)
	if err != nil {
		h.respondError(w, errors.New("invalid transaction_date format, expected YYYY-MM-DD"), http.StatusBadRequest)
		return
	}

	input := &WithdrawInput{
		PocketID:             id,
		Amount:               req.Amount,
		Description:          req.Description,
		TransactionDate:      txDate,
		DestinationAccountID: req.DestinationAccountID,
		CreatedBy:            user.ID,
	}

	transaction, err := h.service.Withdraw(r.Context(), input)
	if err != nil {
		status := mapServiceError(err)
		if status != 0 {
			h.respondError(w, err, status)
			return
		}
		h.respondError(w, err, http.StatusBadRequest)
		return
	}

	h.respondJSON(w, transaction, http.StatusCreated)
}

// HandleListTransactions handles GET /api/pockets/{id}/transactions
func (h *Handler) HandleListTransactions(w http.ResponseWriter, r *http.Request) {
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
		h.respondError(w, errors.New("pocket ID is required"), http.StatusBadRequest)
		return
	}

	transactions, err := h.service.ListTransactions(r.Context(), id, household.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, transactions, http.StatusOK)
}

// HandleEditTransaction handles PATCH /api/pocket-transactions/{id}
func (h *Handler) HandleEditTransaction(w http.ResponseWriter, r *http.Request) {
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
		h.respondError(w, errors.New("transaction ID is required"), http.StatusBadRequest)
		return
	}

	var req EditTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	input := &EditTransactionInput{
		ID:                   id,
		Amount:               req.Amount,
		Description:          req.Description,
		SourceAccountID:      req.SourceAccountID,
		DestinationAccountID: req.DestinationAccountID,
	}

	// Parse transaction_date if provided
	if req.TransactionDate != nil {
		txDate, err := time.Parse("2006-01-02", *req.TransactionDate)
		if err != nil {
			h.respondError(w, errors.New("invalid transaction_date format, expected YYYY-MM-DD"), http.StatusBadRequest)
			return
		}
		input.TransactionDate = &txDate
	}

	transaction, err := h.service.EditTransaction(r.Context(), user.ID, household.ID, input)
	if err != nil {
		status := mapServiceError(err)
		if status != 0 {
			h.respondError(w, err, status)
			return
		}
		h.respondError(w, err, http.StatusBadRequest)
		return
	}

	h.respondJSON(w, transaction, http.StatusOK)
}

// HandleDeleteTransaction handles DELETE /api/pocket-transactions/{id}
func (h *Handler) HandleDeleteTransaction(w http.ResponseWriter, r *http.Request) {
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
		h.respondError(w, errors.New("transaction ID is required"), http.StatusBadRequest)
		return
	}

	err = h.service.DeleteTransaction(r.Context(), id, user.ID, household.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
