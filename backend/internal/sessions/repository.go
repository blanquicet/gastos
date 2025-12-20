package sessions

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// Repository implements auth.SessionRepository using PostgreSQL.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new session repository.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create creates a new session.
func (r *Repository) Create(ctx context.Context, userID string, expiresAt time.Time) (*auth.Session, error) {
	var session auth.Session
	err := r.pool.QueryRow(ctx, `
		INSERT INTO sessions (user_id, expires_at)
		VALUES ($1, $2)
		RETURNING id, user_id, expires_at, created_at
	`, userID, expiresAt).Scan(
		&session.ID,
		&session.UserID,
		&session.ExpiresAt,
		&session.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &session, nil
}

// Get retrieves a session by ID, returning nil if expired.
func (r *Repository) Get(ctx context.Context, id string) (*auth.Session, error) {
	var session auth.Session
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, expires_at, created_at
		FROM sessions
		WHERE id = $1 AND expires_at > NOW()
	`, id).Scan(
		&session.ID,
		&session.UserID,
		&session.ExpiresAt,
		&session.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

// Delete deletes a session by ID.
func (r *Repository) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	return err
}

// DeleteByUserID deletes all sessions for a user.
func (r *Repository) DeleteByUserID(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

// DeleteExpired deletes all expired sessions.
func (r *Repository) DeleteExpired(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at < NOW()`)
	return err
}
