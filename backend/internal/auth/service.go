package auth

import (
	"context"
	"errors"
	"strings"
	"time"
)

// Service handles authentication business logic.
type Service struct {
	users         UserRepository
	sessions      SessionRepository
	passwordReset PasswordResetRepository
	sessionTTL    time.Duration
	resetTokenTTL time.Duration
}

// NewService creates a new auth service.
func NewService(
	users UserRepository,
	sessions SessionRepository,
	passwordReset PasswordResetRepository,
	sessionTTL time.Duration,
) *Service {
	return &Service{
		users:         users,
		sessions:      sessions,
		passwordReset: passwordReset,
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
		return nil, ErrInvalidCredentials
	}

	// Create session
	expiresAt := time.Now().Add(s.sessionTTL)
	session, err := s.sessions.Create(ctx, user.ID, expiresAt)
	if err != nil {
		return nil, err
	}

	return session, nil
}

// Logout invalidates a session.
func (s *Service) Logout(ctx context.Context, sessionID string) error {
	return s.sessions.Delete(ctx, sessionID)
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

	_, err = s.passwordReset.Create(ctx, user.ID, tokenHash, expiresAt)
	if err != nil {
		return "", err
	}

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
		return err
	}
	if reset == nil {
		return ErrTokenExpired
	}

	// Check if token is expired
	if time.Now().After(reset.ExpiresAt) {
		return ErrTokenExpired
	}

	// Check if token was already used
	if reset.UsedAt != nil {
		return ErrTokenUsed
	}

	// Hash new password
	passwordHash, err := HashPassword(input.NewPassword)
	if err != nil {
		return err
	}

	// Update password
	if err := s.users.UpdatePassword(ctx, reset.UserID, passwordHash); err != nil {
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

	return nil
}
