package auth

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

// Handler handles HTTP requests for authentication.
type Handler struct {
	service    *Service
	cookieName string
	secure     bool
	logger     *slog.Logger
}

// NewHandler creates a new auth handler.
func NewHandler(service *Service, cookieName string, secure bool, logger *slog.Logger) *Handler {
	return &Handler{
		service:    service,
		cookieName: cookieName,
		secure:     secure,
		logger:     logger,
	}
}

// RegisterRequest is the request body for registration.
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginRequest is the request body for login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// UserResponse is the response for user info.
type UserResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// ForgotPasswordRequest is the request body for forgot password.
type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ResetPasswordRequest is the request body for reset password.
type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

// ErrorResponse is a standard error response.
type ErrorResponse struct {
	Error string `json:"error"`
}

// Register handles POST /auth/register
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	session, err := h.service.Register(r.Context(), RegisterInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.setSessionCookie(w, session)
	h.respondJSON(w, map[string]string{"message": "registered successfully"}, http.StatusCreated)
}

// Login handles POST /auth/login
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	session, err := h.service.Login(r.Context(), LoginInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.setSessionCookie(w, session)
	h.respondJSON(w, map[string]string{"message": "logged in successfully"}, http.StatusOK)
}

// Logout handles POST /auth/logout
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		// No session cookie, just return success
		h.respondJSON(w, map[string]string{"message": "logged out"}, http.StatusOK)
		return
	}

	if err := h.service.Logout(r.Context(), cookie.Value); err != nil {
		h.logger.Error("failed to logout", "error", err)
		// Still clear the cookie even if DB deletion fails
	}

	h.clearSessionCookie(w)
	h.respondJSON(w, map[string]string{"message": "logged out"}, http.StatusOK)
}

// Me handles GET /me
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		h.respondError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.service.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		if errors.Is(err, ErrSessionExpired) || errors.Is(err, ErrUserNotFound) {
			h.clearSessionCookie(w)
			h.respondError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		h.logger.Error("failed to get user", "error", err)
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.respondJSON(w, UserResponse{
		ID:    user.ID,
		Email: user.Email,
	}, http.StatusOK)
}

// ForgotPassword handles POST /auth/forgot-password
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	token, err := h.service.RequestPasswordReset(r.Context(), req.Email)
	if err != nil {
		h.logger.Error("failed to request password reset", "error", err)
		// Don't reveal errors to prevent email enumeration
	}

	// Always return success to prevent email enumeration
	// In production, you would send an email with the token here
	if token != "" {
		h.logger.Info("password reset token generated",
			"email", req.Email,
			"token", token, // In production, remove this log and send via email!
		)
	}

	h.respondJSON(w, map[string]string{
		"message": "if that email exists, a password reset link has been sent",
	}, http.StatusOK)
}

// ResetPassword handles POST /auth/reset-password
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	err := h.service.ResetPassword(r.Context(), ResetPasswordInput{
		Token:       req.Token,
		NewPassword: req.NewPassword,
	})
	if err != nil {
		h.handleServiceError(w, err)
		return
	}

	h.respondJSON(w, map[string]string{"message": "password reset successfully"}, http.StatusOK)
}

// Helper methods

func (h *Handler) setSessionCookie(w http.ResponseWriter, session *Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName,
		Value:    session.ID,
		Path:     "/",
		Expires:  session.ExpiresAt,
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) respondJSON(w http.ResponseWriter, data any, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) respondError(w http.ResponseWriter, message string, status int) {
	h.respondJSON(w, ErrorResponse{Error: message}, status)
}

func (h *Handler) handleServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrUserExists):
		h.respondError(w, "email already registered", http.StatusConflict)
	case errors.Is(err, ErrInvalidCredentials):
		h.respondError(w, "invalid email or password", http.StatusUnauthorized)
	case errors.Is(err, ErrTokenExpired):
		h.respondError(w, "token expired or invalid", http.StatusBadRequest)
	case errors.Is(err, ErrTokenUsed):
		h.respondError(w, "token already used", http.StatusBadRequest)
	case errors.Is(err, ErrUserNotFound):
		h.respondError(w, "user not found", http.StatusNotFound)
	default:
		// Check for validation errors (they're just regular errors with messages)
		if err != nil {
			errMsg := err.Error()
			if isValidationError(errMsg) {
				h.respondError(w, errMsg, http.StatusBadRequest)
				return
			}
		}
		h.logger.Error("service error", "error", err)
		h.respondError(w, "internal server error", http.StatusInternalServerError)
	}
}

func isValidationError(msg string) bool {
	validationPrefixes := []string{
		"email",
		"password",
		"token",
		"invalid",
	}
	for _, prefix := range validationPrefixes {
		if len(msg) >= len(prefix) && msg[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}
