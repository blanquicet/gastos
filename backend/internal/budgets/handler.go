package budgets

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// Handler handles HTTP requests for budget management
type Handler struct {
	service    Service
	authSvc    *auth.Service
	logger     *slog.Logger
	cookieName string
}

// NewHandler creates a new budget handler
func NewHandler(service Service, authService *auth.Service, cookieName string, logger *slog.Logger) *Handler {
	return &Handler{
		service:    service,
		authSvc:    authService,
		logger:     logger,
		cookieName: cookieName,
	}
}

// GetBudgetsForMonth handles GET /api/budgets/:month
func (h *Handler) GetBudgetsForMonth(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get month from path variable (format: YYYY-MM)
	month := r.PathValue("month")
	if month == "" {
		http.Error(w, "month is required in format YYYY-MM", http.StatusBadRequest)
		return
	}

	// Get budgets
	response, err := h.service.GetByMonth(r.Context(), user.ID, month)
	if err != nil {
		h.logger.Error("failed to get budgets", "error", err, "user_id", user.ID, "month", month)
		if err == ErrInvalidMonth {
			http.Error(w, "invalid month format (must be YYYY-MM)", http.StatusBadRequest)
			return
		}
		if err == ErrNoHousehold {
			http.Error(w, "user has no household", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// SetBudget handles PUT /api/budgets
func (h *Handler) SetBudget(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var input SetBudgetInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.logger.Error("failed to decode request body", "error", err)
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Set budget
	budget, err := h.service.Set(r.Context(), user.ID, &input)
	if err != nil {
		h.logger.Error("failed to set budget", "error", err, "user_id", user.ID)
		if err == ErrInvalidMonth || err == ErrInvalidAmount || 
		   strings.Contains(err.Error(), "required") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err == ErrCategoryNotFound {
			http.Error(w, "category not found", http.StatusNotFound)
			return
		}
		if err == ErrNoHousehold {
			http.Error(w, "user has no household", http.StatusNotFound)
			return
		}
		if err == ErrNotAuthorized {
			http.Error(w, "forbidden: user is not a member of this household", http.StatusForbidden)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(budget)
}

// DeleteBudget handles DELETE /api/budgets/:id
func (h *Handler) DeleteBudget(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get budget ID from path variable
	budgetID := r.PathValue("id")
	if budgetID == "" {
		http.Error(w, "budget ID is required", http.StatusBadRequest)
		return
	}

	// Delete budget
	err = h.service.Delete(r.Context(), user.ID, budgetID)
	if err != nil {
		h.logger.Error("failed to delete budget", "error", err, "user_id", user.ID, "budget_id", budgetID)
		if err == ErrBudgetNotFound {
			http.Error(w, "budget not found", http.StatusNotFound)
			return
		}
		if err == ErrNotAuthorized {
			http.Error(w, "forbidden: user is not a member of this household", http.StatusForbidden)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CopyBudgets handles POST /api/budgets/copy
func (h *Handler) CopyBudgets(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var input CopyBudgetsInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.logger.Error("failed to decode request body", "error", err)
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Copy budgets
	count, err := h.service.CopyBudgets(r.Context(), user.ID, &input)
	if err != nil {
		h.logger.Error("failed to copy budgets", "error", err, "user_id", user.ID)
		if err == ErrInvalidMonth || strings.Contains(err.Error(), "must be after") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err == ErrBudgetsExist {
			http.Error(w, "budgets already exist for target month", http.StatusConflict)
			return
		}
		if err == ErrNoHousehold {
			http.Error(w, "user has no household", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "budgets copied successfully",
		"count":   count,
	})
}

// getUserFromSession extracts the user from the session cookie
func (h *Handler) getUserFromSession(r *http.Request) (*auth.User, error) {
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		return nil, err
	}
	return h.authSvc.GetUserBySession(r.Context(), cookie.Value)
}
