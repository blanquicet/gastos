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
	EmailAPIKey      string // API key for Resend
	SMTPHost         string
	SMTPPort         int
	SMTPUsername     string
	SMTPPassword     string

	// Static files (for local development)
	StaticDir string

	// Azure OpenAI configuration (auth via Managed Identity, no API key)
	AzureOpenAIEndpoint   string
	AzureOpenAIDeployment string
	AzureOpenAIAPIVersion string

	// Azure Speech (for STT, auth via Managed Identity)
	SpeechRegion     string
	SpeechLanguage   string
	SpeechResourceID string
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

	// Email provider API key (for Resend)
	emailAPIKey := os.Getenv("EMAIL_API_KEY")

	// Static directory for serving frontend in development
	staticDir := os.Getenv("STATIC_DIR")

	// Rate limiting - disabled only if explicitly set to "false", enabled by default
	rateLimitEnabled := os.Getenv("RATE_LIMIT_ENABLED") != "false"

	// Azure OpenAI (optional — chat feature disabled if endpoint not set)
	// Auth via Managed Identity (DefaultAzureCredential), no API key needed
	azureOpenAIEndpoint := os.Getenv("AZURE_OPENAI_ENDPOINT")
	azureOpenAIDeployment := os.Getenv("AZURE_OPENAI_CHAT_DEPLOYMENT")
	if azureOpenAIDeployment == "" {
		azureOpenAIDeployment = "gpt-4.1-mini"
	}
	azureOpenAIAPIVersion := os.Getenv("AZURE_OPENAI_API_VERSION")
	if azureOpenAIAPIVersion == "" {
		azureOpenAIAPIVersion = "2024-10-21"
	}

	// Azure Speech (STT)
	speechRegion := os.Getenv("SPEECH_REGION")
	speechLanguage := os.Getenv("SPEECH_LANGUAGE")
	if speechLanguage == "" {
		speechLanguage = "es-CO"
	}
	speechResourceID := os.Getenv("SPEECH_RESOURCE_ID")

	return &Config{
		ServerAddr:            serverAddr,
		DatabaseURL:           databaseURL,
		SessionDuration:       sessionDuration,
		SessionCookieName:     sessionCookieName,
		SessionCookieSecure:   sessionCookieSecure,
		AllowedOrigins:        allowedOrigins,
		RateLimitEnabled:      rateLimitEnabled,
		EmailProvider:         emailProvider,
		EmailFromAddress:      emailFromAddress,
		EmailFromName:         emailFromName,
		EmailBaseURL:          emailBaseURL,
		EmailAPIKey:           emailAPIKey,
		SMTPHost:              smtpHost,
		SMTPPort:              smtpPort,
		SMTPUsername:          smtpUsername,
		SMTPPassword:          smtpPassword,
		StaticDir:             staticDir,
		AzureOpenAIEndpoint:   azureOpenAIEndpoint,
		AzureOpenAIDeployment: azureOpenAIDeployment,
		AzureOpenAIAPIVersion: azureOpenAIAPIVersion,
		SpeechRegion:          speechRegion,
		SpeechLanguage:        speechLanguage,
		SpeechResourceID:      speechResourceID,
	}, nil
}
