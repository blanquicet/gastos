package categories

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// Handler handles HTTP requests for category management
type Handler struct {
	service    Service
	authSvc    *auth.Service
	logger     *slog.Logger
	cookieName string
}

// NewHandler creates a new category handler
func NewHandler(service Service, authService *auth.Service, cookieName string, logger *slog.Logger) *Handler {
	return &Handler{
		service:    service,
		authSvc:    authService,
		logger:     logger,
		cookieName: cookieName,
	}
}

// ListCategories handles GET /api/categories
func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get includeInactive from query params
	includeInactive := r.URL.Query().Get("include_inactive") == "true"

	// List categories
	response, err := h.service.ListByHousehold(r.Context(), user.ID, includeInactive)
	if err != nil {
		h.logger.Error("failed to list categories", "error", err, "user_id", user.ID)
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

// CreateCategory handles POST /api/categories
func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var input CreateCategoryInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.logger.Error("failed to decode request body", "error", err)
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Create category
	category, err := h.service.Create(r.Context(), user.ID, &input)
	if err != nil {
		h.logger.Error("failed to create category", "error", err, "user_id", user.ID)
		if err == ErrCategoryNameRequired || err == ErrCategoryNameTooLong || 
		   strings.Contains(err.Error(), "must be at most") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err == ErrCategoryNameExists {
			http.Error(w, "category with this name already exists in household", http.StatusConflict)
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
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(category)
}

// UpdateCategory handles PATCH /api/categories/:id
func (h *Handler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get category ID from path variable
	categoryID := r.PathValue("id")
	if categoryID == "" {
		http.Error(w, "category ID is required", http.StatusBadRequest)
		return
	}

	// Parse request body
	var input UpdateCategoryInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.logger.Error("failed to decode request body", "error", err)
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Update category
	category, err := h.service.Update(r.Context(), user.ID, categoryID, &input)
	if err != nil {
		h.logger.Error("failed to update category", "error", err, "user_id", user.ID, "category_id", categoryID)
		if err == ErrCategoryNameRequired || err == ErrCategoryNameTooLong || 
		   err == ErrInvalidDisplayOrder || strings.Contains(err.Error(), "must be at most") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err == ErrCategoryNameExists {
			http.Error(w, "category with this name already exists in household", http.StatusConflict)
			return
		}
		if err == ErrCategoryNotFound {
			http.Error(w, "category not found", http.StatusNotFound)
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
	json.NewEncoder(w).Encode(category)
}

// DeleteCategory handles DELETE /api/categories/:id
func (h *Handler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get category ID from path variable
	categoryID := r.PathValue("id")
	if categoryID == "" {
		http.Error(w, "category ID is required", http.StatusBadRequest)
		return
	}

	// Delete category
	err = h.service.Delete(r.Context(), user.ID, categoryID)
	if err != nil {
		h.logger.Error("failed to delete category", "error", err, "user_id", user.ID, "category_id", categoryID)
		if err == ErrCategoryNotFound {
			http.Error(w, "category not found", http.StatusNotFound)
			return
		}
		if err == ErrNotAuthorized {
			http.Error(w, "forbidden: user is not a member of this household", http.StatusForbidden)
			return
		}
		if err == ErrCategoryInUse {
			http.Error(w, "category cannot be deleted because it is used in movements", http.StatusConflict)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ReorderCategories handles POST /api/categories/reorder
func (h *Handler) ReorderCategories(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	user, err := h.getUserFromSession(r)
	if err != nil {
		h.logger.Error("failed to get user from session", "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var input ReorderCategoriesInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.logger.Error("failed to decode request body", "error", err)
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Reorder categories
	err = h.service.Reorder(r.Context(), user.ID, &input)
	if err != nil {
		h.logger.Error("failed to reorder categories", "error", err, "user_id", user.ID)
		if strings.Contains(err.Error(), "required") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err == ErrCategoryNotFound {
			http.Error(w, "category not found", http.StatusNotFound)
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
	json.NewEncoder(w).Encode(map[string]string{"message": "categories reordered successfully"})
}

// getUserFromSession extracts the user from the session cookie
func (h *Handler) getUserFromSession(r *http.Request) (*auth.User, error) {
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		return nil, err
	}
	return h.authSvc.GetUserBySession(r.Context(), cookie.Value)
}
