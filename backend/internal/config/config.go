package config

import (
	"errors"
	"os"
	"strings"
	"time"
)

// Config holds all configuration for the application.
type Config struct {
	// Server configuration
	ServerAddr string

	// Database configuration
	DatabaseURL string

	// Session configuration
	SessionDuration     time.Duration
	SessionCookieName   string
	SessionCookieSecure bool

	// CORS configuration
	AllowedOrigins []string

	// Static files (for local development)
	StaticDir string
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL environment variable is required")
	}

	serverAddr := os.Getenv("SERVER_ADDR")
	if serverAddr == "" {
		serverAddr = ":8080"
	}

	sessionCookieName := os.Getenv("SESSION_COOKIE_NAME")
	if sessionCookieName == "" {
		sessionCookieName = "gastos_session"
	}

	// Default session duration: 30 days
	sessionDuration := 30 * 24 * time.Hour

	// Cookie secure flag - default to true for production
	sessionCookieSecure := os.Getenv("SESSION_COOKIE_SECURE") != "false"

	// Allowed origins for CORS (comma-separated)
	// Must be set via ALLOWED_ORIGINS environment variable
	var allowedOrigins []string
	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		allowedOrigins = strings.Split(origins, ",")
		for i := range allowedOrigins {
			allowedOrigins[i] = strings.TrimSpace(allowedOrigins[i])
		}
	}

	// Static directory for serving frontend in development
	staticDir := os.Getenv("STATIC_DIR")

	return &Config{
		ServerAddr:          serverAddr,
		DatabaseURL:         databaseURL,
		SessionDuration:     sessionDuration,
		SessionCookieName:   sessionCookieName,
		SessionCookieSecure: sessionCookieSecure,
		AllowedOrigins:      allowedOrigins,
		StaticDir:           staticDir,
	}, nil
}
