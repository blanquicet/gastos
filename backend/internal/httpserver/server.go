package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/blanquicet/gastos/backend/internal/accounts"
	"github.com/blanquicet/gastos/backend/internal/auth"
	"github.com/blanquicet/gastos/backend/internal/config"
	"github.com/blanquicet/gastos/backend/internal/email"
	"github.com/blanquicet/gastos/backend/internal/households"
	"github.com/blanquicet/gastos/backend/internal/income"
	"github.com/blanquicet/gastos/backend/internal/middleware"
	"github.com/blanquicet/gastos/backend/internal/movements"
	"github.com/blanquicet/gastos/backend/internal/n8nclient"
	"github.com/blanquicet/gastos/backend/internal/paymentmethods"
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

	// Create email sender
	emailCfg := &email.Config{
		Provider:     cfg.EmailProvider,
		SMTPHost:     cfg.SMTPHost,
		SMTPPort:     cfg.SMTPPort,
		SMTPUsername: cfg.SMTPUsername,
		SMTPPassword: cfg.SMTPPassword,
		APIKey:       cfg.EmailAPIKey,
		FromAddress:  cfg.EmailFromAddress,
		FromName:     cfg.EmailFromName,
		BaseURL:      cfg.EmailBaseURL,
	}
	emailSender, err := email.NewSender(emailCfg, logger)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to create email sender: %w", err)
	}

	// Create repositories
	userRepo := users.NewRepository(pool)
	sessionRepo := sessions.NewRepository(pool)
	passwordResetRepo := users.NewPasswordResetRepository(pool)
	householdRepo := households.NewRepository(pool)

	// Create auth service
	authService := auth.NewService(
		userRepo,
		sessionRepo,
		passwordResetRepo,
		emailSender,
		cfg.SessionDuration,
	)

	// Create household service
	householdService := households.NewService(householdRepo, userRepo)

	// Create auth handler
	authHandler := auth.NewHandler(
		authService,
		cfg.SessionCookieName,
		cfg.SessionCookieSecure,
		logger,
	)

	// Create payment methods service and handler
	paymentMethodsRepo := paymentmethods.NewRepository(pool)
	paymentMethodsService := paymentmethods.NewService(paymentMethodsRepo)
	
	// Create accounts service and handler
	accountsRepo := accounts.NewRepository(pool)
	accountsService := accounts.NewService(accountsRepo)
	
	accountsHandler := accounts.NewHandler(
		accountsService,
		authService,
		householdRepo,
		cfg.SessionCookieName,
		logger,
	)
	
	// Create n8n client if configured (optional for movements)
	var n8nClient *n8nclient.Client
	if cfg.N8NWebhookURL != "" && cfg.N8NAPIKey != "" {
		n8nClient = n8nclient.New(cfg.N8NWebhookURL, cfg.N8NAPIKey, cfg.N8NIsTest)
		logger.Info("n8n client configured for dual write",
			"webhook", cfg.N8NWebhookURL,
			"is_test", cfg.N8NIsTest)
	} else {
		logger.Info("n8n client not configured; movements will only be saved to PostgreSQL")
	}
	
	// Create movements service and handler (always create, n8n is optional)
	movementsRepo := movements.NewRepository(pool)
	movementsService := movements.NewService(
		movementsRepo,
		householdRepo,
		paymentMethodsRepo,
		n8nClient, // Can be nil
		logger,
	)
	movementsHandler := movements.NewHandler(
		movementsService,
		authService,
		cfg.SessionCookieName,
		n8nClient, // Can be nil - for backwards compatibility with legacy endpoint
		logger,
	)
	
	// Create income service and handler (needs n8n client for dual write)
	incomeRepo := income.NewRepository(pool)
	incomeService := income.NewService(incomeRepo, accountsRepo, householdRepo, n8nClient, logger)
	
	incomeHandler := income.NewHandler(
		incomeService,
		authService,
		cfg.SessionCookieName,
		logger,
	)
	
	// Create household handler (needs function to load shared payment methods)
	loadSharedPM := func(ctx context.Context, householdID, userID string) (interface{}, error) {
		return paymentMethodsService.ListSharedPaymentMethods(ctx, householdID, userID)
	}
	
	householdHandler := households.NewHandler(
		householdService,
		authService,
		loadSharedPM,
		cfg.SessionCookieName,
		logger,
	)
	
	paymentMethodsHandler := paymentmethods.NewHandler(
		paymentMethodsService,
		authService,
		householdRepo,
		cfg.SessionCookieName,
		logger,
	)

	// Create form config handler for movements
	formConfigHandler := movements.NewFormConfigHandler(
		authService,
		householdRepo,
		paymentMethodsRepo,
		cfg.SessionCookieName,
		logger,
	)

	// Create rate limiters for auth endpoints (if enabled)
	// Login/Register: 5 requests per minute per IP (strict to prevent brute force)
	// Password reset: 3 requests per minute per IP (even stricter)
	var rateLimitAuth, rateLimitReset func(http.Handler) http.Handler
	if cfg.RateLimitEnabled {
		authLimiter := middleware.NewRateLimiter(5, time.Minute)
		resetLimiter := middleware.NewRateLimiter(3, time.Minute)
		rateLimitAuth = middleware.RateLimit(authLimiter)
		rateLimitReset = middleware.RateLimit(resetLimiter)
		logger.Info("rate limiting enabled for auth endpoints")
	} else {
		// No-op middleware when rate limiting is disabled
		rateLimitAuth = func(next http.Handler) http.Handler { return next }
		rateLimitReset = func(next http.Handler) http.Handler { return next }
		logger.Warn("rate limiting disabled - only use in development/testing")
	}

	// Setup routes
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /version", handleVersion)

	// Auth endpoints with optional rate limiting
	mux.Handle("POST /auth/register", rateLimitAuth(http.HandlerFunc(authHandler.Register)))
	mux.Handle("POST /auth/login", rateLimitAuth(http.HandlerFunc(authHandler.Login)))
	mux.HandleFunc("POST /auth/logout", authHandler.Logout)
	mux.HandleFunc("GET /me", authHandler.Me)
	mux.Handle("POST /auth/forgot-password", rateLimitReset(http.HandlerFunc(authHandler.ForgotPassword)))
	mux.Handle("POST /auth/reset-password", rateLimitReset(http.HandlerFunc(authHandler.ResetPassword)))
	mux.HandleFunc("DELETE /auth/account", authHandler.DeleteAccount)

	// Household endpoints (all require authentication)
	mux.HandleFunc("POST /households", householdHandler.CreateHousehold)
	mux.HandleFunc("GET /households", householdHandler.ListHouseholds)
	mux.HandleFunc("GET /households/{id}", householdHandler.GetHousehold)
	mux.HandleFunc("PATCH /households/{id}", householdHandler.UpdateHousehold)
	mux.HandleFunc("DELETE /households/{id}", householdHandler.DeleteHousehold)
	mux.HandleFunc("POST /households/{id}/leave", householdHandler.LeaveHousehold)
	
	// Member management endpoints
	mux.HandleFunc("POST /households/{id}/members", householdHandler.AddMember)
	mux.HandleFunc("DELETE /households/{household_id}/members/{member_id}", householdHandler.RemoveMember)
	mux.HandleFunc("PATCH /households/{household_id}/members/{member_id}/role", householdHandler.UpdateMemberRole)
	
	// Contact management endpoints
	mux.HandleFunc("POST /households/{id}/contacts", householdHandler.CreateContact)
	mux.HandleFunc("GET /households/{household_id}/contacts", householdHandler.ListContacts)
	mux.HandleFunc("PATCH /households/{household_id}/contacts/{contact_id}", householdHandler.UpdateContact)
	mux.HandleFunc("DELETE /households/{household_id}/contacts/{contact_id}", householdHandler.DeleteContact)
	mux.HandleFunc("POST /households/{household_id}/contacts/{contact_id}/promote", householdHandler.PromoteContact)
	
	// Invitation endpoints
	mux.HandleFunc("POST /households/{id}/invitations", householdHandler.CreateInvitation)

	// Accounts endpoints
	mux.HandleFunc("POST /accounts", accountsHandler.CreateAccount)
	mux.HandleFunc("GET /accounts", accountsHandler.ListAccounts)
	mux.HandleFunc("GET /accounts/{id}", accountsHandler.GetAccount)
	mux.HandleFunc("PATCH /accounts/{id}", accountsHandler.UpdateAccount)
	mux.HandleFunc("DELETE /accounts/{id}", accountsHandler.DeleteAccount)

	// Income endpoints
	mux.HandleFunc("POST /income", incomeHandler.HandleCreate)
	mux.HandleFunc("GET /income", incomeHandler.HandleList)
	mux.HandleFunc("GET /income/{id}", incomeHandler.HandleGetByID)
	mux.HandleFunc("PATCH /income/{id}", incomeHandler.HandleUpdate)
	mux.HandleFunc("DELETE /income/{id}", incomeHandler.HandleDelete)

	// Payment methods endpoints
	mux.HandleFunc("POST /payment-methods", paymentMethodsHandler.CreatePaymentMethod)
	mux.HandleFunc("GET /payment-methods", paymentMethodsHandler.ListPaymentMethods)
	mux.HandleFunc("GET /payment-methods/{id}", paymentMethodsHandler.GetPaymentMethod)
	mux.HandleFunc("PATCH /payment-methods/{id}", paymentMethodsHandler.UpdatePaymentMethod)
	mux.HandleFunc("DELETE /payment-methods/{id}", paymentMethodsHandler.DeletePaymentMethod)

	// Movement endpoints (always available)
	// CRUD endpoints
	mux.HandleFunc("POST /movements", movementsHandler.HandleCreate)
	mux.HandleFunc("GET /movements", movementsHandler.HandleList)
	mux.HandleFunc("GET /movements/{id}", movementsHandler.HandleGetByID)
	mux.HandleFunc("PATCH /movements/{id}", movementsHandler.HandleUpdate)
	mux.HandleFunc("DELETE /movements/{id}", movementsHandler.HandleDelete)
	
	// Debt consolidation (for Resume page)
	mux.HandleFunc("GET /movements/debts/consolidate", movementsHandler.HandleGetDebtConsolidation)
	
	// Legacy endpoint (backwards compatibility with n8n direct calls)
	// This can be removed after frontend is updated
	// mux.HandleFunc("POST /movements/legacy", movementsHandler.RecordMovement)
	
	// Movement form config endpoint
	mux.HandleFunc("GET /movement-form-config", formConfigHandler.GetFormConfig)

	// Serve static files in development mode with SPA fallback
	if cfg.StaticDir != "" {
		logger.Info("serving static files", "dir", cfg.StaticDir)
		spaHandler := spaFileServer(cfg.StaticDir)
		// Use pattern with trailing slash to match all paths
		mux.Handle("/", spaHandler)
	}

	// Apply middleware
	var handler http.Handler = mux
	handler = middleware.NoCache()(handler)
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

// Build-time variables injected via ldflags
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildTime = "unknown"
)

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
	})
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"version":   Version,
		"commit":    Commit,
		"buildTime": BuildTime,
	})
}

// spaFileServer creates an HTTP handler that serves static files with SPA fallback.
// If a file is not found, it serves index.html to allow client-side routing.
func spaFileServer(staticDir string) http.Handler {
	fs := http.Dir(staticDir)
	fileServer := http.FileServer(fs)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// If path is root, serve index.html
		if path == "/" || path == "" {
			http.ServeFile(w, r, staticDir+"/index.html")
			return
		}

		// Try to open the file to check if it exists
		f, err := fs.Open(path)
		if err != nil {
			// File doesn't exist, serve index.html for SPA routing
			http.ServeFile(w, r, staticDir+"/index.html")
			return
		}
		f.Close()

		// File exists, serve it normally
		fileServer.ServeHTTP(w, r)
	})
}
