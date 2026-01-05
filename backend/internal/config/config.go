package config

import (
	"errors"
	"os"
	"strconv"
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
	
	// Rate limiting configuration
	RateLimitEnabled bool

	// Email configuration
	EmailProvider    string
	EmailFromAddress string
	EmailFromName    string
	EmailBaseURL     string
	EmailAPIKey      string // Generic API key for email providers (SendGrid, Resend, etc.)
	SMTPHost         string
	SMTPPort         int
	SMTPUsername     string
	SMTPPassword     string

	// n8n configuration (for movement registration during migration period)
	N8NWebhookURL string
	N8NAPIKey     string
	N8NIsTest     bool

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

	// Email configuration
	emailProvider := os.Getenv("EMAIL_PROVIDER")
	if emailProvider == "" {
		emailProvider = "noop" // Default to no-op for development
	}

	emailFromAddress := os.Getenv("EMAIL_FROM_ADDRESS")
	if emailFromAddress == "" {
		emailFromAddress = "noreply@gastos.blanquicet.com.co"
	}

	emailFromName := os.Getenv("EMAIL_FROM_NAME")
	if emailFromName == "" {
		emailFromName = "Gastos"
	}

	emailBaseURL := os.Getenv("EMAIL_BASE_URL")
	if emailBaseURL == "" {
		emailBaseURL = "http://localhost:8080" // Default for local dev
	}

	// SMTP configuration (for local development)
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := 587 // Default SMTP port
	if portStr := os.Getenv("SMTP_PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			smtpPort = p
		}
	}
	smtpUsername := os.Getenv("SMTP_USERNAME")
	smtpPassword := os.Getenv("SMTP_PASSWORD")

	// Email provider API key (generic for SendGrid, Resend, etc.)
	emailAPIKey := os.Getenv("EMAIL_API_KEY")

	// n8n configuration (for movement registration during migration period)
	n8nWebhookURL := os.Getenv("N8N_WEBHOOK_URL")
	n8nAPIKey := os.Getenv("N8N_API_KEY")
	n8nIsTest := os.Getenv("N8N_IS_TEST") == "true"

	// Static directory for serving frontend in development
	staticDir := os.Getenv("STATIC_DIR")
	
	// Rate limiting - disabled only if explicitly set to "false", enabled by default
	rateLimitEnabled := os.Getenv("RATE_LIMIT_ENABLED") != "false"

	return &Config{
		ServerAddr:          serverAddr,
		DatabaseURL:         databaseURL,
		SessionDuration:     sessionDuration,
		SessionCookieName:   sessionCookieName,
		SessionCookieSecure: sessionCookieSecure,
		AllowedOrigins:      allowedOrigins,
		RateLimitEnabled:    rateLimitEnabled,
		EmailProvider:       emailProvider,
		EmailFromAddress:    emailFromAddress,
		EmailFromName:       emailFromName,
		EmailBaseURL:        emailBaseURL,
		EmailAPIKey:         emailAPIKey,
		SMTPHost:            smtpHost,
		SMTPPort:            smtpPort,
		SMTPUsername:        smtpUsername,
		SMTPPassword:        smtpPassword,
		N8NWebhookURL:       n8nWebhookURL,
		N8NAPIKey:           n8nAPIKey,
		N8NIsTest:           n8nIsTest,
		StaticDir:           staticDir,
	}, nil
}
