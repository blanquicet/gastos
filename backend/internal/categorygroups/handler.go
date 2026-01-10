package categorygroups

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/blanquicet/gastos/internal/middleware"
)

// Handler handles HTTP requests for category groups
type Handler struct {
	service Service
	logger  *slog.Logger
}

// NewHandler creates a new category groups handler
func NewHandler(service Service, logger *slog.Logger) *Handler {
	return &Handler{
		service: service,
		logger:  logger,
	}
}

// RegisterRoutes registers category groups routes
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/category-groups", middleware.RequireAuth(h.handleList))
}

// handleList returns all category groups with their categories for the current user's household
func (h *Handler) handleList(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(string)

	groups, err := h.service.ListByHousehold(r.Context(), userID)
	if err != nil {
		h.logger.Error("failed to list category groups", "error", err, "user_id", userID)
		http.Error(w, "Failed to fetch category groups", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(groups); err != nil {
		h.logger.Error("failed to encode category groups response", "error", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}
