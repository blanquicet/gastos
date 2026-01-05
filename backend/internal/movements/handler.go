package movements

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/blanquicet/gastos/backend/internal/auth"
	"github.com/blanquicet/gastos/backend/internal/households"
	"github.com/blanquicet/gastos/backend/internal/n8nclient"
	"github.com/blanquicet/gastos/backend/internal/paymentmethods"
	"github.com/google/uuid"
)

// Handler handles movement-related HTTP requests.
type Handler struct {
	n8nClient *n8nclient.Client
	logger    *slog.Logger
}

// NewHandler creates a new movements handler.
func NewHandler(n8nClient *n8nclient.Client, logger *slog.Logger) *Handler {
	return &Handler{
		n8nClient: n8nClient,
		logger:    logger,
	}
}

// RecordMovement proxies movement registration to n8n.
// POST /movements
func (h *Handler) RecordMovement(w http.ResponseWriter, r *http.Request) {
	var movement n8nclient.Movement

	if err := json.NewDecoder(r.Body).Decode(&movement); err != nil {
		h.logger.Error("failed to decode movement", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Always generate unique ID for this movement (force rebuild)
	if movement.ID == "" {
		movement.ID = uuid.New().String()
		h.logger.Info("generated new movement ID", "id", movement.ID)
	}

	h.logger.Info("recording movement", "id", movement.ID, "type", movement.Tipo, "valor", movement.Valor)

	// Forward to n8n
	resp, err := h.n8nClient.RecordMovement(r.Context(), &movement)
	if err != nil {
		h.logger.Error("failed to record movement in n8n", "error", err, "movement_id", movement.ID)
		http.Error(w, "n8n service unavailable - movement could not be synced to Google Sheets. Please contact administrator", http.StatusServiceUnavailable)
		return
	}

	h.logger.Info("movement recorded successfully", "id", movement.ID, "n8n_response", resp)

	// Return n8n's response
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		h.logger.Error("failed to encode response", "error", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// FormConfigHandler handles requests for movement form configuration data
type FormConfigHandler struct {
	authSvc           *auth.Service
	householdRepo     households.HouseholdRepository
	paymentMethodRepo paymentmethods.Repository
	cookieName        string
	logger            *slog.Logger
}

// NewFormConfigHandler creates a new form config handler
func NewFormConfigHandler(
	authSvc *auth.Service,
	householdRepo households.HouseholdRepository,
	paymentMethodRepo paymentmethods.Repository,
	cookieName string,
	logger *slog.Logger,
) *FormConfigHandler {
	return &FormConfigHandler{
		authSvc:           authSvc,
		householdRepo:     householdRepo,
		paymentMethodRepo: paymentMethodRepo,
		cookieName:        cookieName,
		logger:            logger,
	}
}

// User represents a user or contact in the form
type User struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"` // "member" or "contact"
	IsPrimary  bool   `json:"is_primary"`
	HasAccount bool   `json:"has_account,omitempty"`
}

// PaymentMethod represents a payment method in the form
type PaymentMethod struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	OwnerName string `json:"owner_name"`
	OwnerID   string `json:"owner_id"`
	IsShared  bool   `json:"is_shared"`
}

// FormConfigResponse is the response for movement form configuration
type FormConfigResponse struct {
	Users          []User          `json:"users"`
	PaymentMethods []PaymentMethod `json:"payment_methods"`
	Categories     []string        `json:"categories"`
}

// Hardcoded categories (Phase 3 - will be customizable in Phase 4)
var defaultCategories = []string{
	"Pago de SOAT/impuestos/mantenimiento",
	"Carro - Seguro",
	"Uber/Gasolina/Peajes/Parqueaderos",
	"Casa - Gastos fijos",
	"Casa - Cositas para casa",
	"Casa - Provisionar mes entrante",
	"Kellys",
	"Mercado",
	"Ahorros para SOAT/impuestos/mantenimiento",
	"Ahorros para cosas de la casa",
	"Ahorros para vacaciones",
	"Ahorros para regalos",
	"Salidas juntos",
	"Vacaciones",
	"Inversiones Caro",
	"Inversiones Jose",
	"Inversiones Juntos",
	"Regalos",
	"Caro - Gastos fijos",
	"Caro - Vida cotidiana",
	"Jose - Gastos fijos",
	"Jose - Vida cotidiana",
	"Gastos médicos",
	"Caro - Imprevistos",
	"Jose - Imprevistos",
	"Casa - Imprevistos",
	"Carro - Imprevistos",
	"Préstamo",
}

// GetFormConfig handles GET /api/movement-form-config
func (h *FormConfigHandler) GetFormConfig(w http.ResponseWriter, r *http.Request) {
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

	// Get user's household
	households, err := h.householdRepo.ListByUser(r.Context(), user.ID)
	if err != nil {
		h.logger.Error("failed to list households", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if len(households) == 0 {
		http.Error(w, "user has no household", http.StatusNotFound)
		return
	}

	household := households[0]

	// Get household members
	members, err := h.householdRepo.GetMembers(r.Context(), household.ID)
	if err != nil {
		h.logger.Error("failed to get members", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Get active contacts
	allContacts, err := h.householdRepo.ListContacts(r.Context(), household.ID)
	if err != nil {
		h.logger.Error("failed to list contacts", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Build users list: members first, then active contacts
	var users []User
	memberIDs := make(map[string]bool)
	
	// Add household members
	for _, m := range members {
		users = append(users, User{
			ID:        m.UserID,
			Name:      m.UserName,
			Type:      "member",
			IsPrimary: true,
		})
		memberIDs[m.UserID] = true
	}

	// Add active contacts only
	for _, c := range allContacts {
		if !c.IsActive {
			continue
		}
		users = append(users, User{
			ID:         c.ID,
			Name:       c.Name,
			Type:       "contact",
			IsPrimary:  false,
			HasAccount: c.LinkedUserID != nil,
		})
	}

	// Get payment methods (own + shared)
	allPaymentMethods, err := h.paymentMethodRepo.ListByHousehold(r.Context(), household.ID)
	if err != nil {
		h.logger.Error("failed to list payment methods", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Filter: include all members' payment methods + shared ones, active only
	var paymentMethods []PaymentMethod
	for _, pm := range allPaymentMethods {
		// Include if: (1) owner is a member of household, OR (2) shared with household
		if pm.IsActive && (memberIDs[pm.OwnerID] || pm.IsSharedWithHousehold) {
			paymentMethods = append(paymentMethods, PaymentMethod{
				ID:        pm.ID,
				Name:      pm.Name,
				Type:      string(pm.Type),
				OwnerName: pm.OwnerName,
				OwnerID:   pm.OwnerID,
				IsShared:  pm.IsSharedWithHousehold,
			})
		}
	}

	response := FormConfigResponse{
		Users:          users,
		PaymentMethods: paymentMethods,
		Categories:     defaultCategories,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		h.logger.Error("failed to encode response", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
}
