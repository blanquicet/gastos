package email

import (
	"context"
	"fmt"
	"log/slog"
)

// Sender defines the interface for sending emails.
type Sender interface {
	SendPasswordReset(ctx context.Context, to, token string) error
}

// NoOpSender is a no-op email sender for development.
type NoOpSender struct {
	logger *slog.Logger
}

// NewNoOpSender creates a new no-op email sender that just logs.
func NewNoOpSender(logger *slog.Logger) *NoOpSender {
	return &NoOpSender{logger: logger}
}

// SendPasswordReset logs the password reset email instead of sending.
func (s *NoOpSender) SendPasswordReset(ctx context.Context, to, token string) error {
	s.logger.Info("password reset email (no-op)",
		"to", to,
		"token", token,
	)
	fmt.Printf("\n=== PASSWORD RESET EMAIL ===\nTo: %s\nToken: %s\n============================\n\n", to, token)
	return nil
}

// Config holds email service configuration.
type Config struct {
	// Provider: "noop", "smtp", "sendgrid", or "resend"
	Provider string

	// SMTP configuration (for local development)
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string

	// API key for email providers (SendGrid, Resend, etc.)
	APIKey string

	// Common configuration
	FromAddress string
	FromName    string
	BaseURL     string // Frontend URL for reset links
}

// NewSender creates an email sender based on the provider configuration.
func NewSender(cfg *Config, logger *slog.Logger) (Sender, error) {
	switch cfg.Provider {
	case "noop", "":
		logger.Info("using no-op email sender (emails will be logged only)")
		return NewNoOpSender(logger), nil

	case "smtp":
		if cfg.SMTPHost == "" || cfg.SMTPPort == 0 {
			return nil, fmt.Errorf("SMTP configuration incomplete: host and port required")
		}
		logger.Info("using SMTP email sender", "host", cfg.SMTPHost, "port", cfg.SMTPPort)
		return NewSMTPSender(cfg, logger), nil

	case "sendgrid":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("email provider API key is required")
		}
		logger.Info("using SendGrid email sender")
		return NewSendGridSender(cfg, logger), nil

	case "resend":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("email provider API key is required")
		}
		logger.Info("using Resend email sender")
		return NewResendSender(cfg, logger), nil

	default:
		return nil, fmt.Errorf("unknown email provider: %s (valid: noop, smtp, sendgrid, resend)", cfg.Provider)
	}
}


