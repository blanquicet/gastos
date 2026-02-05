package income

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// Handler handles HTTP requests for income management
type Handler struct {
	service    Service
	logger     *slog.Logger
	authSvc    *auth.Service
	cookieName string
}

// NewHandler creates a new income handler
func NewHandler(
	service Service,
	authService *auth.Service,
	cookieName string,
	logger *slog.Logger,
) *Handler {
	return &Handler{
		service:    service,
		logger:     logger,
		authSvc:    authService,
		cookieName: cookieName,
	}
}

// Request/Response types

type CreateIncomeRequest struct {
	MemberID    string  `json:"member_id"`
	AccountID   string  `json:"account_id"`
	Type        string  `json:"type"`
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	IncomeDate  string  `json:"income_date"` // YYYY-MM-DD format
}

type UpdateIncomeRequest struct {
	AccountID   *string  `json:"account_id,omitempty"`
	Type        *string  `json:"type,omitempty"`
	Amount      *float64 `json:"amount,omitempty"`
	Description *string  `json:"description,omitempty"`
	IncomeDate  *string  `json:"income_date,omitempty"` // YYYY-MM-DD format
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

func (h *Handler) respondJSON(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) respondError(w http.ResponseWriter, err error, statusCode int) {
	h.logger.Error("request error", "error", err.Error())
	h.respondJSON(w, ErrorResponse{Error: err.Error()}, statusCode)
}

// Handler methods

// HandleCreate creates a new income entry
// POST /api/income
func (h *Handler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	var req CreateIncomeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	// Parse income date
	incomeDate, err := time.Parse("2006-01-02", req.IncomeDate)
	if err != nil {
		h.respondError(w, errors.New("invalid income_date format, expected YYYY-MM-DD"), http.StatusBadRequest)
		return
	}

	input := &CreateIncomeInput{
		MemberID:    req.MemberID,
		AccountID:   req.AccountID,
		Type:        IncomeType(req.Type),
		Amount:      req.Amount,
		Description: req.Description,
		IncomeDate:  incomeDate,
	}

	income, err := h.service.Create(r.Context(), user.ID, input)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidIncomeType):
			h.respondError(w, err, http.StatusBadRequest)
		case errors.Is(err, ErrInvalidAccountType):
			h.respondError(w, err, http.StatusBadRequest)
		case errors.Is(err, ErrMemberNotInHousehold):
			h.respondError(w, err, http.StatusForbidden)
		case errors.Is(err, ErrNotAuthorized):
			h.respondError(w, err, http.StatusForbidden)
		case errors.Is(err, ErrInvalidAmount):
			h.respondError(w, err, http.StatusBadRequest)
		default:
			h.respondError(w, err, http.StatusInternalServerError)
		}
		return
	}

	h.respondJSON(w, income, http.StatusCreated)
}

// HandleList lists all income entries for the user's household
// GET /api/income
func (h *Handler) HandleList(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	// Parse query parameters
	filters := &ListIncomeFilters{}

	if memberID := r.URL.Query().Get("member_id"); memberID != "" {
		filters.MemberID = &memberID
	}

	if accountID := r.URL.Query().Get("account_id"); accountID != "" {
		filters.AccountID = &accountID
	}

	if month := r.URL.Query().Get("month"); month != "" {
		filters.Month = &month
	}

	if startDateStr := r.URL.Query().Get("start_date"); startDateStr != "" {
		startDate, err := time.Parse("2006-01-02", startDateStr)
		if err != nil {
			h.respondError(w, errors.New("invalid start_date format, expected YYYY-MM-DD"), http.StatusBadRequest)
			return
		}
		filters.StartDate = &startDate
	}

	if endDateStr := r.URL.Query().Get("end_date"); endDateStr != "" {
		endDate, err := time.Parse("2006-01-02", endDateStr)
		if err != nil {
			h.respondError(w, errors.New("invalid end_date format, expected YYYY-MM-DD"), http.StatusBadRequest)
			return
		}
		filters.EndDate = &endDate
	}

	response, err := h.service.ListByHousehold(r.Context(), user.ID, filters)
	if err != nil {
		h.respondError(w, err, http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, response, http.StatusOK)
}

// HandleGetByID retrieves a single income entry by ID
// GET /api/income/{id}
func (h *Handler) HandleGetByID(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		h.respondError(w, errors.New("income id is required"), http.StatusBadRequest)
		return
	}

	income, err := h.service.GetByID(r.Context(), user.ID, id)
	if err != nil {
		if errors.Is(err, ErrIncomeNotFound) {
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

	h.respondJSON(w, income, http.StatusOK)
}

// HandleUpdate updates an income entry
// PATCH /api/income/{id}
func (h *Handler) HandleUpdate(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		h.respondError(w, errors.New("income id is required"), http.StatusBadRequest)
		return
	}

	var req UpdateIncomeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	input := &UpdateIncomeInput{
		AccountID:   req.AccountID,
		Description: req.Description,
		Amount:      req.Amount,
	}

	if req.Type != nil {
		incomeType := IncomeType(*req.Type)
		input.Type = &incomeType
	}

	if req.IncomeDate != nil {
		incomeDate, err := time.Parse("2006-01-02", *req.IncomeDate)
		if err != nil {
			h.respondError(w, errors.New("invalid income_date format, expected YYYY-MM-DD"), http.StatusBadRequest)
			return
		}
		input.IncomeDate = &incomeDate
	}

	income, err := h.service.Update(r.Context(), user.ID, id, input)
	if err != nil {
		switch {
		case errors.Is(err, ErrIncomeNotFound):
			h.respondError(w, err, http.StatusNotFound)
		case errors.Is(err, ErrNotAuthorized):
			h.respondError(w, err, http.StatusForbidden)
		case errors.Is(err, ErrInvalidIncomeType):
			h.respondError(w, err, http.StatusBadRequest)
		case errors.Is(err, ErrInvalidAccountType):
			h.respondError(w, err, http.StatusBadRequest)
		case errors.Is(err, ErrInvalidAmount):
			h.respondError(w, err, http.StatusBadRequest)
		default:
			h.respondError(w, err, http.StatusInternalServerError)
		}
		return
	}

	h.respondJSON(w, income, http.StatusOK)
}

// HandleDelete deletes an income entry
// DELETE /api/income/{id}
func (h *Handler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		h.respondError(w, errors.New("income id is required"), http.StatusBadRequest)
		return
	}

	err = h.service.Delete(r.Context(), user.ID, id)
	if err != nil {
		if errors.Is(err, ErrIncomeNotFound) {
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
