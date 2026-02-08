package email

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/resend/resend-go/v2"
)

// ResendSender sends emails via Resend (for production).
type ResendSender struct {
	apiKey   string
	from     string
	fromName string
	baseURL  string
	logger   *slog.Logger
}

// NewResendSender creates a new Resend email sender.
func NewResendSender(cfg *Config, logger *slog.Logger) *ResendSender {
	return &ResendSender{
		apiKey:   cfg.APIKey,
		from:     cfg.FromAddress,
		fromName: cfg.FromName,
		baseURL:  cfg.BaseURL,
		logger:   logger,
	}
}

// SendPasswordReset sends a password reset email via Resend.
func (s *ResendSender) SendPasswordReset(ctx context.Context, to, token string) error {
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", s.baseURL, token)

	subject := "Restablecer contraseña - Conti"
	htmlContent := formatPasswordResetEmail(to, resetLink, token)

	client := resend.NewClient(s.apiKey)

	from := s.from
	if s.fromName != "" {
		from = fmt.Sprintf("%s <%s>", s.fromName, s.from)
	}

	s.logger.Info("sending password reset email via Resend",
		"to", to,
	)

	params := &resend.SendEmailRequest{
		From:    from,
		To:      []string{to},
		Subject: subject,
		Html:    htmlContent,
	}

	sent, err := client.Emails.SendWithContext(ctx, params)
	if err != nil {
		s.logger.Error("failed to send email via Resend",
			"error", err,
			"to", to,
		)
		return fmt.Errorf("failed to send email: %w", err)
	}

	s.logger.Info("password reset email sent successfully",
		"to", to,
		"email_id", sent.Id,
	)
	return nil
}

// SendHouseholdInvitation sends a household invitation email via Resend.
func (s *ResendSender) SendHouseholdInvitation(ctx context.Context, to, token, householdName, inviterName string) error {
	inviteLink := fmt.Sprintf("%s/invite?token=%s", s.baseURL, token)

	subject := fmt.Sprintf("Te invitaron a unirte a %s - Conti", householdName)
	htmlContent := formatHouseholdInvitationEmail(to, inviteLink, householdName, inviterName)

	client := resend.NewClient(s.apiKey)

	from := s.from
	if s.fromName != "" {
		from = fmt.Sprintf("%s <%s>", s.fromName, s.from)
	}

	s.logger.Info("sending household invitation email via Resend",
		"to", to,
		"household", householdName,
	)

	params := &resend.SendEmailRequest{
		From:    from,
		To:      []string{to},
		Subject: subject,
		Html:    htmlContent,
	}

	sent, err := client.Emails.SendWithContext(ctx, params)
	if err != nil {
		s.logger.Error("failed to send email via Resend",
			"error", err,
			"to", to,
		)
		return fmt.Errorf("failed to send email: %w", err)
	}

	s.logger.Info("household invitation email sent successfully",
		"to", to,
		"household", householdName,
		"email_id", sent.Id,
	)
	return nil
}
