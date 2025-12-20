package users

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// PasswordResetRepository implements auth.PasswordResetRepository using PostgreSQL.
type PasswordResetRepository struct {
	pool *pgxpool.Pool
}

// NewPasswordResetRepository creates a new password reset repository.
func NewPasswordResetRepository(pool *pgxpool.Pool) *PasswordResetRepository {
	return &PasswordResetRepository{pool: pool}
}

// Create creates a new password reset token.
func (r *PasswordResetRepository) Create(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (*auth.PasswordReset, error) {
	var reset auth.PasswordReset
	err := r.pool.QueryRow(ctx, `
		INSERT INTO password_resets (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, token_hash, expires_at, used_at, created_at
	`, userID, tokenHash, expiresAt).Scan(
		&reset.ID,
		&reset.UserID,
		&reset.TokenHash,
		&reset.ExpiresAt,
		&reset.UsedAt,
		&reset.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &reset, nil
}

// GetByTokenHash retrieves a password reset by token hash.
func (r *PasswordResetRepository) GetByTokenHash(ctx context.Context, tokenHash string) (*auth.PasswordReset, error) {
	var reset auth.PasswordReset
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, token_hash, expires_at, used_at, created_at
		FROM password_resets
		WHERE token_hash = $1
	`, tokenHash).Scan(
		&reset.ID,
		&reset.UserID,
		&reset.TokenHash,
		&reset.ExpiresAt,
		&reset.UsedAt,
		&reset.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &reset, nil
}

// MarkUsed marks a password reset token as used.
func (r *PasswordResetRepository) MarkUsed(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE password_resets
		SET used_at = $1
		WHERE id = $2
	`, time.Now(), id)
	return err
}

// DeleteExpired deletes all expired password reset tokens.
func (r *PasswordResetRepository) DeleteExpired(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM password_resets WHERE expires_at < NOW()`)
	return err
}
