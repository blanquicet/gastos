package categorygroups

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/blanquicet/conti/backend/internal/auth"
)

// Handler handles HTTP requests for category groups
type Handler struct {
	service    Service
	authSvc    *auth.Service
	logger     *slog.Logger
	cookieName string
}

// NewHandler creates a new category groups handler
func NewHandler(service Service, authService *auth.Service, cookieName string, logger *slog.Logger) *Handler {
	return &Handler{
		service:    service,
		authSvc:    authService,
		logger:     logger,
		cookieName: cookieName,
	}
}

// ListCategoryGroups handles GET /category-groups
func (h *Handler) ListCategoryGroups(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromSession(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	includeInactive := r.URL.Query().Get("include_inactive") == "true"

	groups, err := h.service.ListByHousehold(r.Context(), user.ID, includeInactive)
	if err != nil {
		h.logger.Error("failed to list category groups", "error", err, "user_id", user.ID)
		if err == ErrNoHousehold {
			http.Error(w, "user has no household", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to fetch category groups", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

// CreateCategoryGroup handles POST /category-groups
func (h *Handler) CreateCategoryGroup(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromSession(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var input CreateCategoryGroupInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	group, err := h.service.Create(r.Context(), user.ID, &input)
	if err != nil {
		h.logger.Error("failed to create category group", "error", err, "user_id", user.ID)
		switch err {
		case ErrGroupNameRequired, ErrGroupNameTooLong, ErrIconTooLong, ErrIconRequired:
			http.Error(w, err.Error(), http.StatusBadRequest)
		case ErrGroupNameExists:
			http.Error(w, err.Error(), http.StatusConflict)
		case ErrNoHousehold:
			http.Error(w, "user has no household", http.StatusNotFound)
		default:
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(group)
}

// UpdateCategoryGroup handles PATCH /category-groups/{id}
func (h *Handler) UpdateCategoryGroup(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromSession(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	groupID := r.PathValue("id")
	if groupID == "" {
		http.Error(w, "group ID is required", http.StatusBadRequest)
		return
	}

	var input UpdateCategoryGroupInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	group, err := h.service.Update(r.Context(), user.ID, groupID, &input)
	if err != nil {
		h.logger.Error("failed to update category group", "error", err, "user_id", user.ID, "group_id", groupID)
		switch err {
		case ErrGroupNameRequired, ErrGroupNameTooLong, ErrIconTooLong, ErrIconRequired:
			http.Error(w, err.Error(), http.StatusBadRequest)
		case ErrGroupNameExists:
			http.Error(w, err.Error(), http.StatusConflict)
		case ErrGroupNotFound:
			http.Error(w, "group not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "forbidden", http.StatusForbidden)
		default:
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(group)
}

// DeleteCategoryGroup handles DELETE /category-groups/{id}
func (h *Handler) DeleteCategoryGroup(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromSession(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	groupID := r.PathValue("id")
	if groupID == "" {
		http.Error(w, "group ID is required", http.StatusBadRequest)
		return
	}

	err = h.service.Delete(r.Context(), user.ID, groupID)
	if err != nil {
		h.logger.Error("failed to delete category group", "error", err, "user_id", user.ID, "group_id", groupID)
		switch err {
		case ErrGroupNotFound:
			http.Error(w, "group not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "forbidden", http.StatusForbidden)
		case ErrGroupHasCategories:
			http.Error(w, err.Error(), http.StatusConflict)
		default:
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// getUserFromSession is a helper to extract user from session cookie
func (h *Handler) getUserFromSession(r *http.Request) (*auth.User, error) {
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		return nil, err
	}
	return h.authSvc.GetUserBySession(r.Context(), cookie.Value)
}
