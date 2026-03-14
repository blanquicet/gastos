package budgets

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/blanquicet/conti/backend/internal/auth"
)

// BudgetItemsHandler handles HTTP requests for monthly budget items
type BudgetItemsHandler struct {
	service    *BudgetItemsService
	authSvc    *auth.Service
	householdRepo interface {
		GetUserHouseholdID(ctx context.Context, userID string) (string, error)
	}
	cookieName string
	logger     *slog.Logger
}

// NewBudgetItemsHandler creates a new budget items handler
func NewBudgetItemsHandler(service *BudgetItemsService, authSvc *auth.Service, householdRepo interface {
	GetUserHouseholdID(ctx context.Context, userID string) (string, error)
}, cookieName string, logger *slog.Logger) *BudgetItemsHandler {
	return &BudgetItemsHandler{
		service:       service,
		authSvc:       authSvc,
		householdRepo: householdRepo,
		cookieName:    cookieName,
		logger:        logger,
	}
}

func (h *BudgetItemsHandler) getScope(r *http.Request) BudgetScope {
	scope := r.URL.Query().Get("budget_scope")
	if scope == "" {
		scope = r.URL.Query().Get("scope")
	}
	if scope == "" {
		return ScopeFuture
	}
	return BudgetScope(scope)
}

func (h *BudgetItemsHandler) getUserAndHousehold(r *http.Request) (string, string, error) {
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		return "", "", err
	}
	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		return "", "", err
	}
	householdID, err := h.householdRepo.GetUserHouseholdID(r.Context(), user.ID)
	if err != nil {
		return "", "", err
	}
	return user.ID, householdID, nil
}

// HandleListByMonth returns budget items for a month (with lazy copy)
// GET /api/budget-items/{month}
func (h *BudgetItemsHandler) HandleListByMonth(w http.ResponseWriter, r *http.Request) {
	_, householdID, err := h.getUserAndHousehold(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	month := r.PathValue("month")
	if month == "" {
		http.Error(w, "month is required (YYYY-MM)", http.StatusBadRequest)
		return
	}

	items, err := h.service.GetItemsForMonth(r.Context(), householdID, month)
	if err != nil {
		h.logger.Error("failed to get budget items", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// HandleGetByID returns a single budget item
// GET /api/budget-items/item/{id}
func (h *BudgetItemsHandler) HandleGetByID(w http.ResponseWriter, r *http.Request) {
	_, _, err := h.getUserAndHousehold(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	item, err := h.service.itemsRepo.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Item not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

// HandleCreate creates a new budget item
// POST /api/budget-items
func (h *BudgetItemsHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	_, householdID, err := h.getUserAndHousehold(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var input CreateBudgetItemInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	scope := h.getScope(r)

	item, err := h.service.CreateItem(r.Context(), householdID, &input, scope)
	if err != nil {
		h.logger.Error("failed to create budget item", "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(item)
}

// HandleUpdate updates a budget item
// PUT /api/budget-items/{id}
func (h *BudgetItemsHandler) HandleUpdate(w http.ResponseWriter, r *http.Request) {
	_, _, err := h.getUserAndHousehold(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "item ID required", http.StatusBadRequest)
		return
	}

	var input UpdateBudgetItemInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	scope := h.getScope(r)

	item, err := h.service.UpdateItem(r.Context(), id, &input, scope)
	if err != nil {
		h.logger.Error("failed to update budget item", "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

// HandleDelete deletes a budget item
// DELETE /api/budget-items/{id}
func (h *BudgetItemsHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	_, _, err := h.getUserAndHousehold(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "item ID required", http.StatusBadRequest)
		return
	}

	scope := h.getScope(r)
	deleteMovements := r.URL.Query().Get("delete_movements") == "true"

	if err := h.service.DeleteItem(r.Context(), id, scope, deleteMovements); err != nil {
		h.logger.Error("failed to delete budget item", "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
