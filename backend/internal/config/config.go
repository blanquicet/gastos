package config

import (
	"errors"
	"os"
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

	// n8n configuration
	N8NWebhookURL string
	N8NAPIKey     string
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

	// Allowed origins for CORS
	allowedOrigins := []string{"https://gastos.blanquicet.com.co"}
	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		allowedOrigins = []string{origins}
	}

	// n8n configuration
	n8nWebhookURL := os.Getenv("N8N_WEBHOOK_URL")
	if n8nWebhookURL == "" {
		n8nWebhookURL = "https://n8n.blanquicet.com.co/webhook/movimientos/reportar"
	}

	n8nAPIKey := os.Getenv("N8N_API_KEY")

	return &Config{
		ServerAddr:          serverAddr,
		DatabaseURL:         databaseURL,
		SessionDuration:     sessionDuration,
		SessionCookieName:   sessionCookieName,
		SessionCookieSecure: sessionCookieSecure,
		AllowedOrigins:      allowedOrigins,
		N8NWebhookURL:       n8nWebhookURL,
		N8NAPIKey:           n8nAPIKey,
	}, nil
}
