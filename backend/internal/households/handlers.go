package households

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/blanquicet/conti/backend/internal/auth"
)

// Handler handles HTTP requests for household management
type Handler struct {
	service                      *Service
	logger                       *slog.Logger
	authSvc                      *auth.Service
	loadSharedPaymentMethodsFunc func(ctx context.Context, householdID, userID string) (interface{}, error)
	cookieName                   string
}

// NewHandler creates a new household handler
func NewHandler(service *Service, authService *auth.Service, loadSharedPMFunc func(ctx context.Context, householdID, userID string) (interface{}, error), cookieName string, logger *slog.Logger) *Handler {
	return &Handler{
		service:                      service,
		logger:                       logger,
		authSvc:                      authService,
		loadSharedPaymentMethodsFunc: loadSharedPMFunc,
		cookieName:                   cookieName,
	}
}

// Request/Response types

type CreateHouseholdRequest struct {
	Name string `json:"name"`
}

type UpdateHouseholdRequest struct {
	Name string `json:"name"`
}

type AddMemberRequest struct {
	Email string `json:"email"`
}

type UpdateMemberRoleRequest struct {
	Role HouseholdRole `json:"role"`
}

type CreateContactRequest struct {
	Name  string  `json:"name"`
	Email *string `json:"email,omitempty"`
	Phone *string `json:"phone,omitempty"`
	Notes *string `json:"notes,omitempty"`
}

type UpdateContactRequest struct {
	Name     string  `json:"name"`
	Email    *string `json:"email,omitempty"`
	Phone    *string `json:"phone,omitempty"`
	Notes    *string `json:"notes,omitempty"`
	IsActive *bool   `json:"is_active,omitempty"`
}

type CreateInvitationRequest struct {
	Email string `json:"email"`
}

type HouseholdResponse struct {
	ID                    string              `json:"id"`
	Name                  string              `json:"name"`
	CreatedBy             string              `json:"created_by"`
	Currency              string              `json:"currency"`
	Timezone              string              `json:"timezone"`
	Members               []*HouseholdMember  `json:"members,omitempty"`
	Contacts              []*Contact          `json:"contacts,omitempty"`
	SharedPaymentMethods  interface{}         `json:"shared_payment_methods,omitempty"`
	CreatedAt             string              `json:"created_at"`
	UpdatedAt             string              `json:"updated_at"`
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
	if err := json.NewEncoder(w).Encode(data); err != nil {
		h.logger.Error("failed to encode JSON response", "error", err)
	}
}

func (h *Handler) respondError(w http.ResponseWriter, message string, statusCode int) {
	h.respondJSON(w, ErrorResponse{Error: message}, statusCode)
}

func (h *Handler) handleServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrHouseholdNotFound):
		h.respondError(w, "hogar no encontrado", http.StatusNotFound)
	case errors.Is(err, ErrMemberNotFound):
		h.respondError(w, "miembro no encontrado", http.StatusNotFound)
	case errors.Is(err, ErrContactNotFound):
		h.respondError(w, "contacto no encontrado", http.StatusNotFound)
	case errors.Is(err, ErrInvitationNotFound):
		h.respondError(w, "invitación no encontrada", http.StatusNotFound)
	case errors.Is(err, ErrUserAlreadyMember):
		h.respondError(w, "el usuario ya es miembro del hogar", http.StatusConflict)
	case errors.Is(err, ErrCannotRemoveLastOwner):
		h.respondError(w, "no se puede eliminar el último propietario", http.StatusBadRequest)
	case errors.Is(err, ErrNotAuthorized):
		h.respondError(w, "no autorizado", http.StatusForbidden)
	case errors.Is(err, ErrContactNotLinked):
		h.respondError(w, "el contacto no está vinculado a una cuenta de usuario", http.StatusBadRequest)
	case errors.Is(err, ErrLinkRequestNotPending):
		h.respondError(w, "la solicitud de vinculación no está pendiente", http.StatusBadRequest)
	case errors.Is(err, ErrInvalidRole):
		h.respondError(w, "rol inválido", http.StatusBadRequest)
	case err.Error() == "user not found":
		h.respondError(w, "usuario no encontrado", http.StatusNotFound)
	case err.Error() == "user not found with that email":
		h.respondError(w, "usuario no encontrado con ese correo", http.StatusNotFound)
	case err.Error() == "invitation already exists for this email":
		h.respondError(w, "ya existe una invitación para este correo", http.StatusConflict)
	default:
		h.logger.Error("service error", "error", err)
		h.respondError(w, "error interno del servidor", http.StatusInternalServerError)
	}
}

// Household endpoints

// CreateHousehold handles POST /households
func (h *Handler) CreateHousehold(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	var req CreateHouseholdRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "cuerpo de solicitud inválido", http.StatusBadRequest)
		return
	}

	household, err := h.service.CreateHousehold(r.Context(), &CreateHouseholdInput{
		Name:   req.Name,
		UserID: user.ID,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, household, http.StatusCreated)
}

// ListHouseholds handles GET /households
func (h *Handler) ListHouseholds(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	households, err := h.service.ListUserHouseholds(r.Context(), user.ID)
	if err != nil {
		h.logger.Error("failed to list households", "error", err)
		h.respondError(w, "error interno del servidor", http.StatusInternalServerError)
		return
	}

	if households == nil {
		households = []*Household{}
	}

	h.respondJSON(w, map[string]interface{}{"households": households}, http.StatusOK)
}

// GetHousehold handles GET /households/{id}
func (h *Handler) GetHousehold(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("id")
	if householdID == "" {
		h.respondError(w, "ID de hogar requerido", http.StatusBadRequest)
		return
	}

	household, err := h.service.GetHousehold(r.Context(), householdID, user.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	// Get members and contacts
	members, err := h.service.GetMembers(r.Context(), householdID, user.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}
	if members == nil {
		members = []*HouseholdMember{}
	}

	contacts, err := h.service.ListContacts(r.Context(), householdID, user.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}
	if contacts == nil {
		contacts = []*Contact{}
	}

	// Get shared payment methods
	sharedPaymentMethods, err := h.loadSharedPaymentMethodsFunc(r.Context(), householdID, user.ID)
	if err != nil {
		// Don't fail the request if payment methods fail to load
		// Just log the error and return empty list
		h.logger.Error("failed to load shared payment methods", "error", err)
		sharedPaymentMethods = []interface{}{}
	}
	if sharedPaymentMethods == nil {
		sharedPaymentMethods = []interface{}{}
	}

	response := &HouseholdResponse{
		ID:                   household.ID,
		Name:                 household.Name,
		CreatedBy:            household.CreatedBy,
		Currency:             household.Currency,
		Timezone:             household.Timezone,
		Members:              members,
		Contacts:             contacts,
		SharedPaymentMethods: sharedPaymentMethods,
		CreatedAt:            household.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:            household.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	h.respondJSON(w, response, http.StatusOK)
}

// UpdateHousehold handles PATCH /households/{id}
func (h *Handler) UpdateHousehold(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("id")
	if householdID == "" {
		h.respondError(w, "ID de hogar requerido", http.StatusBadRequest)
		return
	}

	var req UpdateHouseholdRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "cuerpo de solicitud inválido", http.StatusBadRequest)
		return
	}

	household, err := h.service.UpdateHousehold(r.Context(), &UpdateHouseholdInput{
		HouseholdID: householdID,
		Name:        req.Name,
		UserID:      user.ID,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, household, http.StatusOK)
}

// DeleteHousehold handles DELETE /households/{id}
func (h *Handler) DeleteHousehold(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("id")
	if householdID == "" {
		h.respondError(w, "ID de hogar requerido", http.StatusBadRequest)
		return
	}

	if err := h.service.DeleteHousehold(r.Context(), householdID, user.ID); err != nil {
		h.handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Member endpoints

// AddMember handles POST /households/{id}/members
func (h *Handler) AddMember(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("id")
	if householdID == "" {
		h.respondError(w, "ID de hogar requerido", http.StatusBadRequest)
		return
	}

	var req AddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "cuerpo de solicitud inválido", http.StatusBadRequest)
		return
	}

	member, err := h.service.AddMember(r.Context(), &AddMemberInput{
		HouseholdID: householdID,
		Email:       req.Email,
		UserID:      user.ID,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, member, http.StatusCreated)
}

// RemoveMember handles DELETE /households/{household_id}/members/{member_id}
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("household_id")
	memberID := r.PathValue("member_id")
	
	if householdID == "" || memberID == "" {
		h.respondError(w, "IDs requeridos", http.StatusBadRequest)
		return
	}

	if err := h.service.RemoveMember(r.Context(), &RemoveMemberInput{
		HouseholdID: householdID,
		MemberID:    memberID,
		UserID:      user.ID,
	}); err != nil {
		h.handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// UpdateMemberRole handles PATCH /households/{household_id}/members/{member_id}/role
func (h *Handler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("household_id")
	memberID := r.PathValue("member_id")
	
	if householdID == "" || memberID == "" {
		h.respondError(w, "IDs requeridos", http.StatusBadRequest)
		return
	}

	var req UpdateMemberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "cuerpo de solicitud inválido", http.StatusBadRequest)
		return
	}

	member, err := h.service.UpdateMemberRole(r.Context(), &UpdateMemberRoleInput{
		HouseholdID: householdID,
		MemberID:    memberID,
		Role:        req.Role,
		UserID:      user.ID,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, member, http.StatusOK)
}

// LeaveHousehold handles POST /households/{id}/leave
func (h *Handler) LeaveHousehold(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("id")
	if householdID == "" {
		h.respondError(w, "ID de hogar requerido", http.StatusBadRequest)
		return
	}

	if err := h.service.RemoveMember(r.Context(), &RemoveMemberInput{
		HouseholdID: householdID,
		MemberID:    user.ID,
		UserID:      user.ID,
	}); err != nil {
		h.handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Contact endpoints

// ListContacts handles GET /households/{id}/contacts
func (h *Handler) ListContacts(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("household_id")
	if householdID == "" {
		h.respondError(w, "household_id requerido", http.StatusBadRequest)
		return
	}

	contacts, err := h.service.ListContacts(r.Context(), householdID, user.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, contacts, http.StatusOK)
}

// CreateContact handles POST /households/{id}/contacts
func (h *Handler) CreateContact(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("id")
	if householdID == "" {
		h.respondError(w, "ID de hogar requerido", http.StatusBadRequest)
		return
	}

	var req CreateContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "cuerpo de solicitud inválido", http.StatusBadRequest)
		return
	}

	contact, err := h.service.CreateContact(r.Context(), &CreateContactInput{
		HouseholdID: householdID,
		Name:        req.Name,
		Email:       req.Email,
		Phone:       req.Phone,
		Notes:       req.Notes,
		UserID:      user.ID,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, contact, http.StatusCreated)
}

// UpdateContact handles PATCH /households/{household_id}/contacts/{contact_id}
func (h *Handler) UpdateContact(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("household_id")
	contactID := r.PathValue("contact_id")
	
	if householdID == "" || contactID == "" {
		h.respondError(w, "IDs requeridos", http.StatusBadRequest)
		return
	}

	var req UpdateContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "cuerpo de solicitud inválido", http.StatusBadRequest)
		return
	}

	contact, err := h.service.UpdateContact(r.Context(), &UpdateContactInput{
		ContactID:   contactID,
		HouseholdID: householdID,
		Name:        req.Name,
		Email:       req.Email,
		Phone:       req.Phone,
		Notes:       req.Notes,
		IsActive:    req.IsActive,
		UserID:      user.ID,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, contact, http.StatusOK)
}

// DeleteContact handles DELETE /households/{household_id}/contacts/{contact_id}
func (h *Handler) DeleteContact(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("household_id")
	contactID := r.PathValue("contact_id")
	
	if householdID == "" || contactID == "" {
		h.respondError(w, "IDs requeridos", http.StatusBadRequest)
		return
	}

	if err := h.service.DeleteContact(r.Context(), contactID, householdID, user.ID); err != nil {
		h.handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// PromoteContact handles POST /households/{household_id}/contacts/{contact_id}/promote
func (h *Handler) PromoteContact(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("household_id")
	contactID := r.PathValue("contact_id")
	
	if householdID == "" || contactID == "" {
		h.respondError(w, "IDs requeridos", http.StatusBadRequest)
		return
	}

	member, err := h.service.PromoteContactToMember(r.Context(), &PromoteContactInput{
		ContactID:   contactID,
		HouseholdID: householdID,
		UserID:      user.ID,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, member, http.StatusCreated)
}

// Invitation endpoints

// InvitationInfoResponse is the public info for an invitation (no sensitive data)
type InvitationInfoResponse struct {
	HouseholdName string `json:"household_name"`
	InviterName   string `json:"inviter_name"`
	Email         string `json:"email"`
	IsExpired     bool   `json:"is_expired"`
	IsAccepted    bool   `json:"is_accepted"`
}

// GetInvitationInfo handles GET /invitations/{token}
// This is a public endpoint (no auth required) to show invitation info before accepting
func (h *Handler) GetInvitationInfo(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		h.respondError(w, "token es requerido", http.StatusBadRequest)
		return
	}

	invitation, err := h.service.repo.GetInvitationByToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, ErrInvitationNotFound) {
			h.respondError(w, "invitación no encontrada", http.StatusNotFound)
			return
		}
		h.logger.Error("failed to get invitation", "error", err)
		h.respondError(w, "error interno del servidor", http.StatusInternalServerError)
		return
	}

	response := InvitationInfoResponse{
		HouseholdName: invitation.HouseholdName,
		InviterName:   invitation.InviterName,
		Email:         invitation.Email,
		IsExpired:     invitation.IsExpired(),
		IsAccepted:    invitation.IsAccepted(),
	}

	h.respondJSON(w, response, http.StatusOK)
}

type AcceptInvitationRequest struct {
	Token string `json:"token"`
}

// AcceptInvitation handles POST /invitations/accept
func (h *Handler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	var req AcceptInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "cuerpo de solicitud inválido", http.StatusBadRequest)
		return
	}

	if req.Token == "" {
		h.respondError(w, "token es requerido", http.StatusBadRequest)
		return
	}

	member, err := h.service.AcceptInvitationByToken(r.Context(), &AcceptInvitationByTokenInput{
		Token:  req.Token,
		UserID: user.ID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrInvitationNotFound):
			h.respondError(w, "invitación no encontrada", http.StatusNotFound)
		case errors.Is(err, ErrNotAuthorized):
			h.respondError(w, "tu correo no coincide con la invitación", http.StatusForbidden)
		case errors.Is(err, ErrUserAlreadyMember):
			h.respondError(w, "ya eres miembro de este hogar", http.StatusConflict)
		case err.Error() == "invitation has already been accepted":
			h.respondError(w, "esta invitación ya fue aceptada", http.StatusConflict)
		case err.Error() == "invitation has expired":
			h.respondError(w, "la invitación ha expirado", http.StatusGone)
		default:
			h.logger.Error("failed to accept invitation", "error", err)
			h.respondError(w, "error interno del servidor", http.StatusInternalServerError)
		}
		return
	}

	h.respondJSON(w, member, http.StatusOK)
}

// CreateInvitation handles POST /households/{id}/invitations
func (h *Handler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	householdID := r.PathValue("id")
	if householdID == "" {
		h.respondError(w, "ID de hogar requerido", http.StatusBadRequest)
		return
	}

	var req CreateInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "cuerpo de solicitud inválido", http.StatusBadRequest)
		return
	}

	invitation, err := h.service.CreateInvitation(r.Context(), &CreateInvitationInput{
		HouseholdID: householdID,
		Email:       req.Email,
		UserID:      user.ID,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, invitation, http.StatusCreated)
}

// Link request endpoints

// ListLinkRequests handles GET /link-requests
func (h *Handler) ListLinkRequests(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	requests, err := h.service.ListLinkRequests(r.Context(), user.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	if requests == nil {
		requests = []LinkRequest{}
	}

	h.respondJSON(w, requests, http.StatusOK)
}

// CountLinkRequests handles GET /link-requests/count
func (h *Handler) CountLinkRequests(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	count, err := h.service.CountLinkRequests(r.Context(), user.ID)
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, map[string]int{"count": count}, http.StatusOK)
}

// AcceptLinkRequest handles POST /link-requests/{contact_id}/accept
func (h *Handler) AcceptLinkRequest(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	contactID := r.PathValue("contact_id")
	if contactID == "" {
		h.respondError(w, "contact_id es requerido", http.StatusBadRequest)
		return
	}

	if err := h.service.AcceptLinkRequest(r.Context(), user.ID, contactID); err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, map[string]string{"status": "accepted"}, http.StatusOK)
}

// RejectLinkRequest handles POST /link-requests/{contact_id}/reject
func (h *Handler) RejectLinkRequest(w http.ResponseWriter, r *http.Request) {
	user, err := h.getUserFromRequest(r)
	if err != nil {
		h.respondError(w, "no autorizado", http.StatusUnauthorized)
		return
	}

	contactID := r.PathValue("contact_id")
	if contactID == "" {
		h.respondError(w, "contact_id es requerido", http.StatusBadRequest)
		return
	}

	if err := h.service.RejectLinkRequest(r.Context(), user.ID, contactID); err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, map[string]string{"status": "rejected"}, http.StatusOK)
}
