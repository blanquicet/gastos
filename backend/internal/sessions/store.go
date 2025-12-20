package sessions

import (
	"context"
	"net/http"
	"time"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// Store provides session management functionality.
type Store struct {
	repo       auth.SessionRepository
	cookieName string
	duration   time.Duration
	secure     bool
}

// NewStore creates a new session store.
func NewStore(repo auth.SessionRepository, cookieName string, duration time.Duration, secure bool) *Store {
	return &Store{
		repo:       repo,
		cookieName: cookieName,
		duration:   duration,
		secure:     secure,
	}
}

// Create creates a new session and returns it.
func (s *Store) Create(ctx context.Context, userID string) (*auth.Session, error) {
	expiresAt := time.Now().Add(s.duration)
	return s.repo.Create(ctx, userID, expiresAt)
}

// Get retrieves a session by ID.
func (s *Store) Get(ctx context.Context, sessionID string) (*auth.Session, error) {
	return s.repo.Get(ctx, sessionID)
}

// Delete deletes a session.
func (s *Store) Delete(ctx context.Context, sessionID string) error {
	return s.repo.Delete(ctx, sessionID)
}

// SetCookie sets the session cookie on the response.
func (s *Store) SetCookie(w http.ResponseWriter, session *auth.Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    session.ID,
		Path:     "/",
		Expires:  session.ExpiresAt,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearCookie clears the session cookie.
func (s *Store) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// CleanupExpired removes expired sessions from the database.
func (s *Store) CleanupExpired(ctx context.Context) error {
	return s.repo.DeleteExpired(ctx)
}
