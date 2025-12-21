package auth

import (
	"context"
	"errors"
	"time"
)

var (
	ErrUserNotFound       = errors.New("user not found")
	ErrUserExists         = errors.New("user already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrSessionExpired     = errors.New("session expired")
	ErrTokenExpired       = errors.New("token expired")
	ErrTokenUsed          = errors.New("token already used")
)

// User represents an authenticated user.
type User struct {
	ID           string
	Email        string
	Name         string
	PasswordHash string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Session represents an authentication session.
type Session struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	CreatedAt time.Time
}

// PasswordReset represents a password reset request.
type PasswordReset struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	UsedAt    *time.Time
	CreatedAt time.Time
}

// UserRepository defines the interface for user persistence.
type UserRepository interface {
	Create(ctx context.Context, email, name, passwordHash string) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	UpdatePassword(ctx context.Context, id, passwordHash string) error
}

// SessionRepository defines the interface for session persistence.
type SessionRepository interface {
	Create(ctx context.Context, userID string, expiresAt time.Time) (*Session, error)
	Get(ctx context.Context, id string) (*Session, error)
	Delete(ctx context.Context, id string) error
	DeleteByUserID(ctx context.Context, userID string) error
	DeleteExpired(ctx context.Context) error
}

// PasswordResetRepository defines the interface for password reset persistence.
type PasswordResetRepository interface {
	Create(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (*PasswordReset, error)
	GetByTokenHash(ctx context.Context, tokenHash string) (*PasswordReset, error)
	MarkUsed(ctx context.Context, id string) error
	DeleteExpired(ctx context.Context) error
}
