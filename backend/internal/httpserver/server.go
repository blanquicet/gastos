package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/blanquicet/conti/backend/internal/accounts"
	"github.com/blanquicet/conti/backend/internal/ai"
	"github.com/blanquicet/conti/backend/internal/audit"
	"github.com/blanquicet/conti/backend/internal/auth"
	"github.com/blanquicet/conti/backend/internal/budgets"
	"github.com/blanquicet/conti/backend/internal/categories"
	"github.com/blanquicet/conti/backend/internal/categorygroups"
	"github.com/blanquicet/conti/backend/internal/config"
	"github.com/blanquicet/conti/backend/internal/creditcardpayments"
	"github.com/blanquicet/conti/backend/internal/creditcards"
	"github.com/blanquicet/conti/backend/internal/email"
	"github.com/blanquicet/conti/backend/internal/households"
	"github.com/blanquicet/conti/backend/internal/income"
	"github.com/blanquicet/conti/backend/internal/middleware"
	"github.com/blanquicet/conti/backend/internal/movements"
	"github.com/blanquicet/conti/backend/internal/paymentmethods"
	"github.com/blanquicet/conti/backend/internal/recurringmovements"
	"github.com/blanquicet/conti/backend/internal/sessions"
	"github.com/blanquicet/conti/backend/internal/users"
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
	
	// Create audit log repository and service (needs to be early for other services)
	auditRepo := audit.NewRepository(pool)
	auditService := audit.NewService(auditRepo, logger)

	// Create auth service
	authService := auth.NewService(
		userRepo,
		sessionRepo,
		passwordResetRepo,
		emailSender,
		auditService,
		cfg.SessionDuration,
	)

	// Create household service
	householdService := households.NewService(householdRepo, userRepo, auditService, emailSender)

	// Create auth handler
	authHandler := auth.NewHandler(
		authService,
		cfg.SessionCookieName,
		cfg.SessionCookieSecure,
		logger,
	)

	// Create payment methods service and handler
	paymentMethodsRepo := paymentmethods.NewRepository(pool)
	paymentMethodsService := paymentmethods.NewService(paymentMethodsRepo, auditService)
	
	// Create accounts service and handler
	accountsRepo := accounts.NewRepository(pool)
	accountsService := accounts.NewService(accountsRepo, auditService)
	
	accountsHandler := accounts.NewHandler(
		accountsService,
		authService,
		householdRepo,
		cfg.SessionCookieName,
		logger,
	)
	
	// Create movements service and handler
	movementsRepo := movements.NewRepository(pool)
	movementsService := movements.NewService(
		movementsRepo,
		householdRepo,
		paymentMethodsRepo,
		accountsRepo,
		auditService,
		logger,
	)
	movementsHandler := movements.NewHandler(
		movementsService,
		authService,
		cfg.SessionCookieName,
		logger,
	)
	
	// Create income service and handler
	incomeRepo := income.NewRepository(pool)
	incomeService := income.NewService(incomeRepo, accountsRepo, householdRepo, auditService, logger)
	
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

	// Create category groups repository (needed by form config and budgets)
	categoryGroupsRepo := categorygroups.NewRepository(pool)

	// Create categories service and handler
	categoriesRepo := categories.NewPostgresRepository(pool)
	categoriesService := categories.NewService(categoriesRepo, householdRepo, auditService)
	categoriesHandler := categories.NewHandler(
		categoriesService,
		authService,
		cfg.SessionCookieName,
		logger,
	)

	// Create budgets service and handler
	budgetsRepo := budgets.NewPostgresRepository(pool)
	budgetsService := budgets.NewService(budgetsRepo, categoriesRepo, householdRepo, auditService, nil) // templatesCalculator set later
	budgetsHandler := budgets.NewHandler(
		budgetsService,
		authService,
		cfg.SessionCookieName,
		logger,
	)

	// Create category groups service and handler (repo already created above)
	categoryGroupsService := categorygroups.NewService(categoryGroupsRepo, householdRepo, auditService)
	categoryGroupsHandler := categorygroups.NewHandler(
		categoryGroupsService,
		authService,
		cfg.SessionCookieName,
		logger,
	)
	
	// Create audit log handler
	auditHandler := audit.NewHandler(auditService, logger)

	// Create recurring movements service, handler, generator, and scheduler
	recurringMovementsRepo := recurringmovements.NewRepository(pool)
	recurringMovementsService := recurringmovements.NewService(recurringMovementsRepo, householdRepo, budgetsService, logger)
	
	// Now set the templates calculator in budgets service
	budgetsService.SetTemplatesCalculator(recurringMovementsService)
	
	// Create form config handler for movements (with templates closure to avoid import cycles)
	getTemplatesByCategory := func(ctx context.Context, userID string) (map[string][]movements.TemplateBasicInfo, error) {
		templatesMap, err := recurringMovementsService.ListByCategoryMap(ctx, userID)
		if err != nil {
			return nil, err
		}
		
		// Convert to TemplateBasicInfo
		result := make(map[string][]movements.TemplateBasicInfo)
		for categoryID, templates := range templatesMap {
			var infos []movements.TemplateBasicInfo
			for _, t := range templates {
				infos = append(infos, movements.TemplateBasicInfo{
					ID:         t.ID,
					Name:       t.Name,
					CategoryID: t.CategoryID,
				})
			}
			result[categoryID] = infos
		}
		
		return result, nil
	}
	
	formConfigHandler := movements.NewFormConfigHandler(
		authService,
		householdRepo,
		paymentMethodsRepo,
		categoryGroupsRepo,
		getTemplatesByCategory,
		cfg.SessionCookieName,
		logger,
	)
	
	// Create generator (needed by handler and scheduler)
	generator := recurringmovements.NewGenerator(recurringMovementsRepo, movementsService, logger)
	
	// Create handler with generator for manual triggering
	recurringMovementsHandler := recurringmovements.NewHandler(
		recurringMovementsService,
		generator,
		authService,
		cfg.SessionCookieName,
		logger,
	)
	
	// Create scheduler for auto-generating movements
	scheduler := recurringmovements.NewScheduler(generator, logger)
	
	// Start scheduler in background
	go scheduler.Start(ctx)

	// Create credit card payments service and handler
	ccPaymentsRepo := creditcardpayments.NewRepository(pool)
	ccPaymentsService := creditcardpayments.NewService(
		ccPaymentsRepo,
		householdRepo,
		paymentMethodsRepo,
		accountsRepo,
		auditService,
		logger,
	)
	ccPaymentsHandler := creditcardpayments.NewHandler(ccPaymentsService, authService, cfg.SessionCookieName, logger)

	// Create credit cards summary service and handler
	creditCardsRepo := creditcards.NewRepository(pool)
	creditCardsService := creditcards.NewService(
		creditCardsRepo,
		householdRepo,
		paymentMethodsRepo,
		logger,
	)
	creditCardsHandler := creditcards.NewHandler(creditCardsService, authService, cfg.SessionCookieName)

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

	// Contact linking endpoints
	mux.HandleFunc("GET /contacts/check-email", householdHandler.CheckEmail)
	mux.HandleFunc("POST /contacts/{contact_id}/request-link", householdHandler.RequestLink)
	mux.HandleFunc("POST /contacts/{contact_id}/unlink", householdHandler.UnlinkContact)
	mux.HandleFunc("POST /contacts/{contact_id}/dismiss-unlink", householdHandler.DismissUnlinkBanner)
	
	// Invitation endpoints
	mux.HandleFunc("POST /households/{id}/invitations", householdHandler.CreateInvitation)
	mux.HandleFunc("GET /invitations/{token}", householdHandler.GetInvitationInfo)
	mux.HandleFunc("POST /invitations/accept", householdHandler.AcceptInvitation)

	// Link request endpoints
	mux.HandleFunc("GET /link-requests", householdHandler.ListLinkRequests)
	mux.HandleFunc("GET /link-requests/count", householdHandler.CountLinkRequests)
	mux.HandleFunc("POST /link-requests/{contact_id}/accept", householdHandler.AcceptLinkRequest)
	mux.HandleFunc("POST /link-requests/{contact_id}/reject", householdHandler.RejectLinkRequest)

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
	
	// Movement form config endpoint
	mux.HandleFunc("GET /movement-form-config", formConfigHandler.GetFormConfig)

	// Recurring movements endpoints (order matters to avoid route conflicts)
	mux.HandleFunc("POST /api/recurring-movements", recurringMovementsHandler.HandleCreate)
	mux.HandleFunc("POST /api/recurring-movements/generate", recurringMovementsHandler.HandleGeneratePending)
	mux.HandleFunc("GET /api/recurring-movements", recurringMovementsHandler.HandleList)
	mux.HandleFunc("GET /api/recurring-movements/category/{category_id}", recurringMovementsHandler.HandleGetByCategory)
	mux.HandleFunc("GET /api/recurring-movements/prefill/{id}", recurringMovementsHandler.HandleGetPreFillData)
	mux.HandleFunc("GET /api/recurring-movements/{id}", recurringMovementsHandler.HandleGet)
	mux.HandleFunc("PUT /api/recurring-movements/{id}", recurringMovementsHandler.HandleUpdate)
	mux.HandleFunc("DELETE /api/recurring-movements/{id}", recurringMovementsHandler.HandleDelete)

	// Categories endpoints
	mux.HandleFunc("GET /categories", categoriesHandler.ListCategories)
	mux.HandleFunc("POST /categories", categoriesHandler.CreateCategory)
	mux.HandleFunc("PATCH /categories/{id}", categoriesHandler.UpdateCategory)
	mux.HandleFunc("DELETE /categories/{id}", categoriesHandler.DeleteCategory)
	mux.HandleFunc("POST /categories/reorder", categoriesHandler.ReorderCategories)

	// Budgets endpoints
	mux.HandleFunc("GET /budgets/{month}", budgetsHandler.GetBudgetsForMonth)
	mux.HandleFunc("PUT /budgets", budgetsHandler.SetBudget)
	mux.HandleFunc("DELETE /budgets/{id}", budgetsHandler.DeleteBudget)
	mux.HandleFunc("POST /budgets/copy", budgetsHandler.CopyBudgets)

	// Category groups endpoints
	mux.HandleFunc("GET /category-groups", categoryGroupsHandler.ListCategoryGroups)
	mux.HandleFunc("POST /category-groups", categoryGroupsHandler.CreateCategoryGroup)
	mux.HandleFunc("PATCH /category-groups/{id}", categoryGroupsHandler.UpdateCategoryGroup)
	mux.HandleFunc("DELETE /category-groups/{id}", categoryGroupsHandler.DeleteCategoryGroup)

	// Credit card payments endpoints
	mux.HandleFunc("POST /credit-card-payments", ccPaymentsHandler.HandleCreate)
	mux.HandleFunc("GET /credit-card-payments", ccPaymentsHandler.HandleList)
	mux.HandleFunc("GET /credit-card-payments/{id}", ccPaymentsHandler.HandleGet)
	mux.HandleFunc("DELETE /credit-card-payments/{id}", ccPaymentsHandler.HandleDelete)

	// Credit cards summary endpoints (for Tarjetas tab)
	mux.HandleFunc("GET /credit-cards/summary", creditCardsHandler.HandleGetSummary)
	mux.HandleFunc("GET /credit-cards/{id}/movements", creditCardsHandler.HandleGetCardMovements)
	
	// Admin audit log endpoints (TODO: add admin-only middleware)
	mux.HandleFunc("GET /admin/audit-logs", auditHandler.ListAuditLogs)
	mux.HandleFunc("GET /admin/audit-logs/{id}", auditHandler.GetAuditLog)
	mux.HandleFunc("POST /admin/audit-logs/cleanup", auditHandler.RunCleanup)

	// Chat endpoint (requires Azure OpenAI config, auth via Managed Identity)
	if cfg.AzureOpenAIEndpoint != "" {
		aiClient, err := ai.NewClient(&ai.Config{
			Endpoint:   cfg.AzureOpenAIEndpoint,
			Deployment: cfg.AzureOpenAIDeployment,
			APIVersion: cfg.AzureOpenAIAPIVersion,
		}, logger)
		if err != nil {
			logger.Error("failed to create AI client, chat disabled", "error", err)
		} else {
			toolExecutor := ai.NewToolExecutor(pool)
			chatService := ai.NewChatService(aiClient, toolExecutor, logger)
			chatHandler := ai.NewHandler(chatService, householdRepo, logger)
			mux.HandleFunc("POST /chat", chatHandler.HandleChat)
			logger.Info("chat endpoint enabled", "deployment", cfg.AzureOpenAIDeployment)
		}
	} else {
		logger.Info("chat endpoint disabled (AZURE_OPENAI_ENDPOINT not set)")
	}

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
	handler = middleware.AuditContext()(handler) // Add request metadata to context for audit logging
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
