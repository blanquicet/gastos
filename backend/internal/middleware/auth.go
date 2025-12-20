package middleware

import (
	"context"
	"net/http"

	"github.com/blanquicet/gastos/backend/internal/sessions"
)

// contextKey is a custom type for context keys to avoid collisions.
type contextKey string

const (
	// UserIDKey is the context key for the authenticated user ID.
	UserIDKey contextKey = "user_id"
	// SessionIDKey is the context key for the session ID.
	SessionIDKey contextKey = "session_id"
)

// Auth returns a middleware that validates session cookies.
func Auth(sessionStore *sessions.Store, cookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(cookieName)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			session, err := sessionStore.Get(r.Context(), cookie.Value)
			if err != nil || session == nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			// Add user ID and session ID to context
			ctx := context.WithValue(r.Context(), UserIDKey, session.UserID)
			ctx = context.WithValue(ctx, SessionIDKey, session.ID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID retrieves the user ID from the request context.
func GetUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}

// GetSessionID retrieves the session ID from the request context.
func GetSessionID(ctx context.Context) (string, bool) {
	sessionID, ok := ctx.Value(SessionIDKey).(string)
	return sessionID, ok
}
