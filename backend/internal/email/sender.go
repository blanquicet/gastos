package email

import (
	"context"
	"fmt"
	"log/slog"
)

// Sender defines the interface for sending emails.
type Sender interface {
	SendPasswordReset(ctx context.Context, to, token string) error
	SendHouseholdInvitation(ctx context.Context, to, token, householdName, inviterName string) error
	SendLinkRequest(ctx context.Context, to, requesterName, householdName, appURL string) error
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

// SendHouseholdInvitation logs the household invitation email instead of sending.
func (s *NoOpSender) SendHouseholdInvitation(ctx context.Context, to, token, householdName, inviterName string) error {
	s.logger.Info("household invitation email (no-op)",
		"to", to,
		"token", token,
		"household", householdName,
		"inviter", inviterName,
	)
	fmt.Printf("\n=== HOUSEHOLD INVITATION EMAIL ===\nTo: %s\nHousehold: %s\nInvited by: %s\nToken: %s\n==================================\n\n", to, householdName, inviterName, token)
	return nil
}

// SendLinkRequest logs the link request email instead of sending.
func (s *NoOpSender) SendLinkRequest(ctx context.Context, to, requesterName, householdName, appURL string) error {
	s.logger.Info("link request email (no-op)",
		"to", to,
		"requester", requesterName,
		"household", householdName,
	)
	fmt.Printf("\n=== LINK REQUEST EMAIL ===\nTo: %s\nRequester: %s\nHousehold: %s\nApp URL: %s\n==========================\n\n", to, requesterName, householdName, appURL)
	return nil
}

// Config holds email service configuration.
type Config struct {
	// Provider: "noop", "smtp", or "resend"
	Provider string

	// SMTP configuration (for local development)
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string

	// API key for Resend
	APIKey string

	// Common configuration
	FromAddress string
	FromName    string
	BaseURL     string // Frontend URL for links
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

	case "resend":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("email provider API key is required")
		}
		logger.Info("using Resend email sender")
		return NewResendSender(cfg, logger), nil

	default:
		return nil, fmt.Errorf("unknown email provider: %s (valid: noop, smtp, resend)", cfg.Provider)
	}
}
