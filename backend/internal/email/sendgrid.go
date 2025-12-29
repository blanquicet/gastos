package email

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/sendgrid/sendgrid-go"
	"github.com/sendgrid/sendgrid-go/helpers/mail"
)

// SendGridSender sends emails via SendGrid (for production).
type SendGridSender struct {
	apiKey   string
	from     string
	fromName string
	baseURL  string
	logger   *slog.Logger
}

// NewSendGridSender creates a new SendGrid email sender.
func NewSendGridSender(cfg *Config, logger *slog.Logger) *SendGridSender {
	return &SendGridSender{
		apiKey:   cfg.SendGridAPIKey,
		from:     cfg.FromAddress,
		fromName: cfg.FromName,
		baseURL:  cfg.BaseURL,
		logger:   logger,
	}
}

// SendPasswordReset sends a password reset email via SendGrid.
func (s *SendGridSender) SendPasswordReset(ctx context.Context, to, token string) error {
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", s.baseURL, token)

	from := mail.NewEmail(s.fromName, s.from)
	subject := "Restablecer contraseña - Gastos"
	recipient := mail.NewEmail("", to)
	htmlContent := formatPasswordResetEmail(to, resetLink, token)

	message := mail.NewSingleEmail(from, subject, recipient, "", htmlContent)
	client := sendgrid.NewSendClient(s.apiKey)

	s.logger.Info("sending password reset email via SendGrid",
		"to", to,
	)

	response, err := client.Send(message)
	if err != nil {
		s.logger.Error("failed to send email via SendGrid",
			"error", err,
			"to", to,
		)
		return fmt.Errorf("failed to send email: %w", err)
	}

	if response.StatusCode >= 400 {
		s.logger.Error("SendGrid returned error status",
			"status_code", response.StatusCode,
			"body", response.Body,
			"to", to,
		)
		return fmt.Errorf("sendgrid error: status %d", response.StatusCode)
	}

	s.logger.Info("password reset email sent successfully",
		"to", to,
		"status_code", response.StatusCode,
	)
	return nil
}
