package httpserver

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/blanquicet/gastos/backend/internal/config"
	"github.com/blanquicet/gastos/backend/internal/middleware"
)

// New creates a new HTTP server with all routes configured.
func New(cfg *config.Config, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("GET /health", handleHealth)

	// Auth endpoints (to be implemented)
	mux.HandleFunc("POST /auth/register", handleNotImplemented)
	mux.HandleFunc("POST /auth/login", handleNotImplemented)
	mux.HandleFunc("POST /auth/logout", handleNotImplemented)
	mux.HandleFunc("GET /me", handleNotImplemented)
	mux.HandleFunc("POST /auth/forgot-password", handleNotImplemented)
	mux.HandleFunc("POST /auth/reset-password", handleNotImplemented)

	// Apply middleware
	var handler http.Handler = mux
	handler = middleware.Logging(logger)(handler)
	handler = middleware.CORS(cfg.AllowedOrigins)(handler)
	handler = middleware.Recovery(logger)(handler)

	return &http.Server{
		Addr:         cfg.ServerAddr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
	})
}

func handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]string{
		"error": "not implemented",
	})
}
