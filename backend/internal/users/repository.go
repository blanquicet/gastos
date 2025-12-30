package users

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// Repository implements auth.UserRepository using PostgreSQL.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new user repository.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create creates a new user.
func (r *Repository) Create(ctx context.Context, email, name, passwordHash string) (*auth.User, error) {
	var user auth.User
	err := r.pool.QueryRow(ctx, `
		INSERT INTO users (email, name, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id, email, name, password_hash, created_at, updated_at
	`, email, name, passwordHash).Scan(
		&user.ID,
		&user.Email,
		&user.Name,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetByID retrieves a user by ID.
func (r *Repository) GetByID(ctx context.Context, id string) (*auth.User, error) {
	var user auth.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, name, password_hash, created_at, updated_at
		FROM users
		WHERE id = $1
	`, id).Scan(
		&user.ID,
		&user.Email,
		&user.Name,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, auth.ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetByEmail retrieves a user by email.
func (r *Repository) GetByEmail(ctx context.Context, email string) (*auth.User, error) {
	var user auth.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, name, password_hash, created_at, updated_at
		FROM users
		WHERE email = $1
	`, email).Scan(
		&user.ID,
		&user.Email,
		&user.Name,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, auth.ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// UpdatePassword updates a user's password hash.
func (r *Repository) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users
		SET password_hash = $1, updated_at = $2
		WHERE id = $3
	`, passwordHash, time.Now(), id)
	return err
}

// Delete deletes a user and all related data (cascades handle sessions, households, etc).
func (r *Repository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return auth.ErrUserNotFound
	}
	return nil
}
