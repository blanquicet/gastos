package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/blanquicet/gastos/backend/internal/auth"
	"github.com/blanquicet/gastos/backend/internal/config"
	"github.com/blanquicet/gastos/backend/internal/middleware"
	"github.com/blanquicet/gastos/backend/internal/sessions"
	"github.com/blanquicet/gastos/backend/internal/users"
)

// Server wraps the HTTP server and its dependencies.
type Server struct {
	httpServer *http.Server
	pool       *pgxpool.Pool
	logger     *slog.Logger
}

// New creates a new HTTP server with all routes configured.
func New(ctx context.Context, cfg *config.Config, logger *slog.Logger) (*Server, error) {
	// Connect to database
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}
	logger.Info("connected to database")

	// Create repositories
	userRepo := users.NewRepository(pool)
	sessionRepo := sessions.NewRepository(pool)
	passwordResetRepo := users.NewPasswordResetRepository(pool)

	// Create auth service
	authService := auth.NewService(
		userRepo,
		sessionRepo,
		passwordResetRepo,
		cfg.SessionDuration,
	)

	// Create auth handler
	authHandler := auth.NewHandler(
		authService,
		cfg.SessionCookieName,
		cfg.SessionCookieSecure,
		logger,
	)

	// Create rate limiters for auth endpoints
	// Login/Register: 5 requests per minute per IP (strict to prevent brute force)
	authLimiter := middleware.NewRateLimiter(5, time.Minute)
	// Password reset: 3 requests per minute per IP (even stricter)
	resetLimiter := middleware.NewRateLimiter(3, time.Minute)

	// Rate limit wrapper for auth handlers
	rateLimitAuth := middleware.RateLimit(authLimiter)
	rateLimitReset := middleware.RateLimit(resetLimiter)

	// Setup routes
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("GET /health", handleHealth)

	// Auth endpoints with rate limiting
	mux.Handle("POST /auth/register", rateLimitAuth(http.HandlerFunc(authHandler.Register)))
	mux.Handle("POST /auth/login", rateLimitAuth(http.HandlerFunc(authHandler.Login)))
	mux.HandleFunc("POST /auth/logout", authHandler.Logout)
	mux.HandleFunc("GET /me", authHandler.Me)
	mux.Handle("POST /auth/forgot-password", rateLimitReset(http.HandlerFunc(authHandler.ForgotPassword)))
	mux.Handle("POST /auth/reset-password", rateLimitReset(http.HandlerFunc(authHandler.ResetPassword)))

	// Serve static files in development mode
	if cfg.StaticDir != "" {
		logger.Info("serving static files", "dir", cfg.StaticDir)
		fs := http.FileServer(http.Dir(cfg.StaticDir))
		// Use pattern with trailing slash to match all paths
		mux.Handle("/", fs)
	}

	// Apply middleware
	var handler http.Handler = mux
	handler = middleware.Logging(logger)(handler)
	handler = middleware.CORS(cfg.AllowedOrigins)(handler)
	handler = middleware.Recovery(logger)(handler)

	httpServer := &http.Server{
		Addr:         cfg.ServerAddr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return &Server{
		httpServer: httpServer,
		pool:       pool,
		logger:     logger,
	}, nil
}

// ListenAndServe starts the HTTP server.
func (s *Server) ListenAndServe() error {
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the server.
func (s *Server) Shutdown(ctx context.Context) error {
	s.logger.Info("closing database connection pool")
	s.pool.Close()
	return s.httpServer.Shutdown(ctx)
}

// Addr returns the server address.
func (s *Server) Addr() string {
	return s.httpServer.Addr
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
	})
}
