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
