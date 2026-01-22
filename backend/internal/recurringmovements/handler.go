package recurringmovements

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/blanquicet/gastos/backend/internal/auth"
	"github.com/blanquicet/gastos/backend/internal/movements"
)

// Handler handles recurring movement template HTTP requests
type Handler struct {
	service    Service
	generator  *Generator // For manual triggering
	authSvc    *auth.Service
	cookieName string
	logger     *slog.Logger
}

// NewHandler creates a new recurring movements handler
func NewHandler(
	service Service,
	generator *Generator,
	authService *auth.Service,
	cookieName string,
	logger *slog.Logger,
) *Handler {
	return &Handler{
		service:    service,
		generator:  generator,
		authSvc:    authService,
		cookieName: cookieName,
		logger:     logger,
	}
}

// HandleCreate creates a new template
// POST /api/recurring-movements
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
	var input CreateTemplateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.logger.Error("failed to decode request", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Create template
	template, err := h.service.Create(r.Context(), user.ID, &input)
	if err != nil {
		h.logger.Error("failed to create template", "error", err, "user_id", user.ID)
		
		// Handle specific errors
		switch err {
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		case ErrInvalidRecurrencePattern, ErrInvalidDayOfMonth,
			ErrInvalidDayOfYear, ErrRecurrenceRequired,
			ErrInvalidParticipants, ErrInvalidPercentageSum:
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	h.logger.Info("template created", "template_id", template.ID, "user_id", user.ID)

	// Return created template
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(template)
}

// HandleGet retrieves a template by ID
// GET /api/recurring-movements/{id}
func (h *Handler) HandleGet(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get template ID from path
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "template ID required", http.StatusBadRequest)
		return
	}

	// Get template
	template, err := h.service.GetByID(r.Context(), user.ID, id)
	if err != nil {
		switch err {
		case ErrTemplateNotFound:
			http.Error(w, "Template not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		default:
			h.logger.Error("failed to get template", "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	// Return template
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(template)
}

// HandleList lists templates for user's household
// GET /api/recurring-movements
func (h *Handler) HandleList(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse filters
	filters := &ListTemplatesFilters{}
	
	// Category ID filter
	if categoryID := r.URL.Query().Get("category_id"); categoryID != "" {
		filters.CategoryID = &categoryID
	}
	
	// Is active filter
	if isActiveStr := r.URL.Query().Get("is_active"); isActiveStr != "" {
		isActive, err := strconv.ParseBool(isActiveStr)
		if err == nil {
			filters.IsActive = &isActive
		}
	}
	
	// Movement type filter
	if movementTypeStr := r.URL.Query().Get("movement_type"); movementTypeStr != "" {
		movementType := movements.MovementType(movementTypeStr)
		if err := movementType.Validate(); err == nil {
			filters.MovementType = &movementType
		}
	}

	// List templates
	templates, err := h.service.ListByHousehold(r.Context(), user.ID, filters)
	if err != nil {
		h.logger.Error("failed to list templates", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Return templates
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(templates)
}

// HandleGetByCategory lists templates for a specific category
// GET /api/recurring-movements/by-category/{category_id}
func (h *Handler) HandleGetByCategory(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get category ID from path
	categoryID := r.PathValue("category_id")
	if categoryID == "" {
		http.Error(w, "category ID required", http.StatusBadRequest)
		return
	}

	// List templates
	templates, err := h.service.ListByCategory(r.Context(), user.ID, categoryID)
	if err != nil {
		h.logger.Error("failed to list templates by category", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Return templates
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(templates)
}

// HandleGetPreFillData gets pre-fill data for a template
// GET /api/recurring-movements/{id}/prefill?invert_roles=false
func (h *Handler) HandleGetPreFillData(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get template ID from path
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "template ID required", http.StatusBadRequest)
		return
	}

	// Parse invert_roles parameter
	invertRoles := false
	if invertStr := r.URL.Query().Get("invert_roles"); invertStr != "" {
		if parsed, err := strconv.ParseBool(invertStr); err == nil {
			invertRoles = parsed
		}
	}

	// Get pre-fill data
	data, err := h.service.GetPreFillData(r.Context(), user.ID, id, invertRoles)
	if err != nil {
		switch err {
		case ErrTemplateNotFound:
			http.Error(w, "Template not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		default:
			h.logger.Error("failed to get prefill data", "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	// Return pre-fill data
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// HandleUpdate updates a template
// PUT /api/recurring-movements/{id}
func (h *Handler) HandleUpdate(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get template ID from path
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "template ID required", http.StatusBadRequest)
		return
	}

	// Parse request body
	var input UpdateTemplateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.logger.Error("failed to decode request", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update template
	template, err := h.service.Update(r.Context(), user.ID, id, &input)
	if err != nil {
		switch err {
		case ErrTemplateNotFound:
			http.Error(w, "Template not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		default:
			h.logger.Error("failed to update template", "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	// Return updated template
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(template)
}

// HandleDelete deletes a template
// DELETE /api/recurring-movements/{id}
func (h *Handler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	// Get user from session
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authSvc.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get template ID from path
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "template ID required", http.StatusBadRequest)
		return
	}

	// Delete template
	if err := h.service.Delete(r.Context(), user.ID, id); err != nil {
		switch err {
		case ErrTemplateNotFound:
			http.Error(w, "Template not found", http.StatusNotFound)
		case ErrNotAuthorized:
			http.Error(w, "Not authorized", http.StatusForbidden)
		default:
			h.logger.Error("failed to delete template", "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	// Return success
	w.WriteHeader(http.StatusNoContent)
}

// HandleGeneratePending manually triggers the generator to process pending templates
// POST /api/recurring-movements/generate
func (h *Handler) HandleGeneratePending(w http.ResponseWriter, r *http.Request) {
	// Get user from session (authentication required)
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

	h.logger.Info("manual generation triggered", "user_id", user.ID)

	// Process pending templates
	err = h.generator.ProcessPendingTemplates(r.Context())
	if err != nil {
		h.logger.Error("failed to process pending templates", "error", err, "user_id", user.ID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Return success response
	response := map[string]interface{}{
		"success": true,
		"message": "Pending templates processed successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		h.logger.Error("failed to encode response", "error", err)
	}
}
