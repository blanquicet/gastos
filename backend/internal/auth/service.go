package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/blanquicet/gastos/backend/internal/audit"
)

// EmailSender defines the interface for sending emails.
type EmailSender interface {
	SendPasswordReset(ctx context.Context, to, token string) error
}

// Service handles authentication business logic.
type Service struct {
	users         UserRepository
	sessions      SessionRepository
	passwordReset PasswordResetRepository
	emailSender   EmailSender
	auditService  audit.Service
	sessionTTL    time.Duration
	resetTokenTTL time.Duration
}

// NewService creates a new auth service.
func NewService(
	users UserRepository,
	sessions SessionRepository,
	passwordReset PasswordResetRepository,
	emailSender EmailSender,
	auditService audit.Service,
	sessionTTL time.Duration,
) *Service {
	return &Service{
		users:         users,
		sessions:      sessions,
		passwordReset: passwordReset,
		emailSender:   emailSender,
		auditService:  auditService,
		sessionTTL:    sessionTTL,
		resetTokenTTL: 1 * time.Hour, // Password reset tokens expire in 1 hour
	}
}

// RegisterInput contains the data needed to register a new user.
type RegisterInput struct {
	Email    string
	Name     string
	Password string
}

// Validate validates the registration input.
func (i *RegisterInput) Validate() error {
	i.Email = strings.TrimSpace(strings.ToLower(i.Email))
	i.Name = strings.TrimSpace(i.Name)

	if i.Email == "" {
		return errors.New("email is required")
	}
	if !strings.Contains(i.Email, "@") {
		return errors.New("invalid email format")
	}
	if i.Name == "" {
		return errors.New("name is required")
	}
	if len(i.Password) < 8 {
		return errors.New("password must be at least 8 characters")
	}

	// Password strength requirements
	hasLower := false
	hasUpper := false
	hasNumber := false
	hasSymbol := false

	for _, char := range i.Password {
		if char >= 'a' && char <= 'z' {
			hasLower = true
		} else if char >= 'A' && char <= 'Z' {
			hasUpper = true
		} else if char >= '0' && char <= '9' {
			hasNumber = true
		} else {
			// Any non-alphanumeric character is considered a symbol
			hasSymbol = true
		}
	}

	if !hasLower {
		return errors.New("password must contain at least one lowercase letter")
	}
	if !hasUpper {
		return errors.New("password must contain at least one uppercase letter")
	}
	if !hasNumber && !hasSymbol {
		return errors.New("password must contain at least one number or symbol")
	}

	return nil
}

// Register creates a new user account and returns a session.
func (s *Service) Register(ctx context.Context, input RegisterInput) (*Session, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Check if user already exists
	existing, err := s.users.GetByEmail(ctx, input.Email)
	if err != nil && !errors.Is(err, ErrUserNotFound) {
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserExists
	}

	// Hash password
	passwordHash, err := HashPassword(input.Password)
	if err != nil {
		return nil, err
	}

	// Create user
	user, err := s.users.Create(ctx, input.Email, input.Name, passwordHash)
	if err != nil {
		return nil, err
	}

	// Create session
	expiresAt := time.Now().Add(s.sessionTTL)
	session, err := s.sessions.Create(ctx, user.ID, expiresAt)
	if err != nil {
		return nil, err
	}

	return session, nil
}

// LoginInput contains the data needed to login.
type LoginInput struct {
	Email    string
	Password string
}

// Validate validates the login input.
func (i *LoginInput) Validate() error {
	i.Email = strings.TrimSpace(strings.ToLower(i.Email))

	if i.Email == "" {
		return errors.New("email is required")
	}
	if i.Password == "" {
		return errors.New("password is required")
	}
	return nil
}

// Login authenticates a user and returns a session.
func (s *Service) Login(ctx context.Context, input LoginInput) (*Session, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get user by email
	user, err := s.users.GetByEmail(ctx, input.Email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			// Log failed login attempt (user not found)
			s.auditService.LogAsync(ctx, &audit.LogInput{
				Action:       audit.ActionAuthLogin,
				ResourceType: "auth",
				Success:      false,
				ErrorMessage: audit.StringPtr("invalid credentials - user not found"),
				Metadata: map[string]interface{}{
					"email": input.Email,
				},
			})
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	// Verify password
	match, err := VerifyPassword(input.Password, user.PasswordHash)
	if err != nil {
		return nil, err
	}
	if !match {
		// Log failed login attempt (invalid password)
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(user.ID),
			Action:       audit.ActionAuthLogin,
			ResourceType: "auth",
			Success:      false,
			ErrorMessage: audit.StringPtr("invalid credentials - wrong password"),
			Metadata: map[string]interface{}{
				"email": input.Email,
			},
		})
		return nil, ErrInvalidCredentials
	}

	// Create session
	expiresAt := time.Now().Add(s.sessionTTL)
	session, err := s.sessions.Create(ctx, user.ID, expiresAt)
	if err != nil {
		// Log failed login (session creation failed)
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(user.ID),
			Action:       audit.ActionAuthLogin,
			ResourceType: "auth",
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	// Log successful login
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(user.ID),
		Action:       audit.ActionAuthLogin,
		ResourceType: "auth",
		ResourceID:   audit.StringPtr(session.ID),
		Success:      true,
		NewValues: map[string]interface{}{
			"session_id": session.ID,
			"email":      input.Email,
			"expires_at": expiresAt,
		},
	})

	return session, nil
}

// Logout invalidates a session.
func (s *Service) Logout(ctx context.Context, sessionID string) error {
	// Get session to log user info
	session, err := s.sessions.Get(ctx, sessionID)
	var userID *string
	if err == nil && session != nil {
		userID = audit.StringPtr(session.UserID)
	}

	// Delete session
	err = s.sessions.Delete(ctx, sessionID)
	if err != nil {
		// Log failed logout
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       userID,
			Action:       audit.ActionAuthLogout,
			ResourceType: "auth",
			ResourceID:   audit.StringPtr(sessionID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return err
	}

	// Log successful logout
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       userID,
		Action:       audit.ActionAuthLogout,
		ResourceType: "auth",
		ResourceID:   audit.StringPtr(sessionID),
		Success:      true,
		OldValues: map[string]interface{}{
			"session_id": sessionID,
		},
	})

	return nil
}

// GetUserBySession returns the user for a valid session.
func (s *Service) GetUserBySession(ctx context.Context, sessionID string) (*User, error) {
	session, err := s.sessions.Get(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, ErrSessionExpired
	}

	return s.users.GetByID(ctx, session.UserID)
}

// RequestPasswordReset creates a password reset token.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) (string, error) {
	email = strings.TrimSpace(strings.ToLower(email))

	user, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			// Log password reset request for non-existent user (security event)
			s.auditService.LogAsync(ctx, &audit.LogInput{
				Action:       audit.ActionAuthPasswordResetRequest,
				ResourceType: "auth",
				Success:      false,
				ErrorMessage: audit.StringPtr("user not found"),
				Metadata: map[string]interface{}{
					"email": email,
				},
			})
			// Don't reveal if email exists - return nil to prevent enumeration
			return "", nil
		}
		return "", err
	}

	// Generate token
	token, err := GenerateToken(32)
	if err != nil {
		return "", err
	}

	// Store hashed token
	tokenHash := HashToken(token)
	expiresAt := time.Now().Add(s.resetTokenTTL)

	resetRecord, err := s.passwordReset.Create(ctx, user.ID, tokenHash, expiresAt)
	if err != nil {
		// Log failed password reset token creation
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(user.ID),
			Action:       audit.ActionAuthPasswordResetRequest,
			ResourceType: "auth",
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return "", err
	}

	// Send password reset email
	if err := s.emailSender.SendPasswordReset(ctx, email, token); err != nil {
		// Log failed email send (but don't fail the request)
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(user.ID),
			Action:       audit.ActionAuthPasswordResetRequest,
			ResourceType: "auth",
			ResourceID:   audit.StringPtr(resetRecord.ID),
			Success:      false,
			ErrorMessage: audit.StringPtr("email send failed: " + err.Error()),
		})
		// Log error but don't fail the request - token is already created
		// User might try again and get a new token
		return "", err
	}

	// Log successful password reset request
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(user.ID),
		Action:       audit.ActionAuthPasswordResetRequest,
		ResourceType: "auth",
		ResourceID:   audit.StringPtr(resetRecord.ID),
		Success:      true,
		NewValues: map[string]interface{}{
			"email":      email,
			"expires_at": expiresAt,
		},
	})

	return token, nil
}

// ResetPasswordInput contains the data needed to reset a password.
type ResetPasswordInput struct {
	Token       string
	NewPassword string
}

// Validate validates the reset password input.
func (i *ResetPasswordInput) Validate() error {
	if i.Token == "" {
		return errors.New("token is required")
	}
	if len(i.NewPassword) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	return nil
}

// ResetPassword resets a user's password using a valid token.
func (s *Service) ResetPassword(ctx context.Context, input ResetPasswordInput) error {
	if err := input.Validate(); err != nil {
		return err
	}

	// Find token by hash
	tokenHash := HashToken(input.Token)
	reset, err := s.passwordReset.GetByTokenHash(ctx, tokenHash)
	if err != nil {
		// Log failed password reset (token not found)
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionAuthPasswordResetComplete,
			ResourceType: "auth",
			Success:      false,
			ErrorMessage: audit.StringPtr("invalid token"),
		})
		return err
	}
	if reset == nil {
		// Log failed password reset (token expired/invalid)
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionAuthPasswordResetComplete,
			ResourceType: "auth",
			Success:      false,
			ErrorMessage: audit.StringPtr("token expired or invalid"),
		})
		return ErrTokenExpired
	}

	// Check if token is expired
	if time.Now().After(reset.ExpiresAt) {
		// Log expired token usage attempt
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(reset.UserID),
			Action:       audit.ActionAuthPasswordResetComplete,
			ResourceType: "auth",
			ResourceID:   audit.StringPtr(reset.ID),
			Success:      false,
			ErrorMessage: audit.StringPtr("token expired"),
		})
		return ErrTokenExpired
	}

	// Check if token was already used
	if reset.UsedAt != nil {
		// Log reused token attempt
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(reset.UserID),
			Action:       audit.ActionAuthPasswordResetComplete,
			ResourceType: "auth",
			ResourceID:   audit.StringPtr(reset.ID),
			Success:      false,
			ErrorMessage: audit.StringPtr("token already used"),
		})
		return ErrTokenUsed
	}

	// Hash new password
	passwordHash, err := HashPassword(input.NewPassword)
	if err != nil {
		return err
	}

	// Update password
	if err := s.users.UpdatePassword(ctx, reset.UserID, passwordHash); err != nil {
		// Log failed password update
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(reset.UserID),
			Action:       audit.ActionAuthPasswordResetComplete,
			ResourceType: "auth",
			ResourceID:   audit.StringPtr(reset.ID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return err
	}

	// Mark token as used
	if err := s.passwordReset.MarkUsed(ctx, reset.ID); err != nil {
		return err
	}

	// Invalidate all sessions for this user (force re-login)
	if err := s.sessions.DeleteByUserID(ctx, reset.UserID); err != nil {
		return err
	}

	// Log successful password reset
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(reset.UserID),
		Action:       audit.ActionAuthPasswordResetComplete,
		ResourceType: "auth",
		ResourceID:   audit.StringPtr(reset.ID),
		Success:      true,
		Metadata: map[string]interface{}{
			"sessions_invalidated": true,
		},
	})

	return nil
}

// DeleteUser deletes a user account and all associated data.
// This will cascade delete sessions, households where they're the creator,
// household memberships, and other related data.
func (s *Service) DeleteUser(ctx context.Context, userID string) error {
	// Delete all sessions first
	if err := s.sessions.DeleteByUserID(ctx, userID); err != nil {
		return err
	}

	// Delete the user (cascades will handle the rest)
	return s.users.Delete(ctx, userID)
}
