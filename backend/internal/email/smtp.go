package email

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"
)

// SMTPSender sends emails via SMTP (for local development and testing).
type SMTPSender struct {
	host     string
	port     int
	username string
	password string
	from     string
	fromName string
	baseURL  string
	logger   *slog.Logger
}

// NewSMTPSender creates a new SMTP email sender.
func NewSMTPSender(cfg *Config, logger *slog.Logger) *SMTPSender {
	return &SMTPSender{
		host:     cfg.SMTPHost,
		port:     cfg.SMTPPort,
		username: cfg.SMTPUsername,
		password: cfg.SMTPPassword,
		from:     cfg.FromAddress,
		fromName: cfg.FromName,
		baseURL:  cfg.BaseURL,
		logger:   logger,
	}
}

// SendPasswordReset sends a password reset email via SMTP.
func (s *SMTPSender) SendPasswordReset(ctx context.Context, to, token string) error {
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", s.baseURL, token)

	subject := "Restablecer contraseña - Gastos"
	body := formatPasswordResetEmail(to, resetLink, token)

	msg := formatEmailMessage(s.from, s.fromName, to, subject, body)

	auth := smtp.PlainAuth("", s.username, s.password, s.host)
	addr := fmt.Sprintf("%s:%d", s.host, s.port)

	s.logger.Info("sending password reset email via SMTP",
		"to", to,
		"smtp_host", s.host,
	)

	if err := smtp.SendMail(addr, auth, s.from, []string{to}, []byte(msg)); err != nil {
		s.logger.Error("failed to send email via SMTP",
			"error", err,
			"to", to,
		)
		return fmt.Errorf("failed to send email: %w", err)
	}

	s.logger.Info("password reset email sent successfully", "to", to)
	return nil
}

// SendHouseholdInvitation sends a household invitation email via SMTP.
func (s *SMTPSender) SendHouseholdInvitation(ctx context.Context, to, token, householdName, inviterName string) error {
	inviteLink := fmt.Sprintf("%s/invite?token=%s", s.baseURL, token)

	subject := fmt.Sprintf("Te invitaron a unirte a %s - Conti", householdName)
	body := formatHouseholdInvitationEmail(to, inviteLink, householdName, inviterName)

	msg := formatEmailMessage(s.from, s.fromName, to, subject, body)

	auth := smtp.PlainAuth("", s.username, s.password, s.host)
	addr := fmt.Sprintf("%s:%d", s.host, s.port)

	s.logger.Info("sending household invitation email via SMTP",
		"to", to,
		"household", householdName,
		"smtp_host", s.host,
	)

	if err := smtp.SendMail(addr, auth, s.from, []string{to}, []byte(msg)); err != nil {
		s.logger.Error("failed to send email via SMTP",
			"error", err,
			"to", to,
		)
		return fmt.Errorf("failed to send email: %w", err)
	}

	s.logger.Info("household invitation email sent successfully", "to", to)
	return nil
}

// formatEmailMessage formats an email message with headers.
func formatEmailMessage(from, fromName, to, subject, htmlBody string) string {
	fromHeader := from
	if fromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", fromName, from)
	}

	return fmt.Sprintf(
		"From: %s\r\n"+
			"To: %s\r\n"+
			"Subject: %s\r\n"+
			"MIME-Version: 1.0\r\n"+
			"Content-Type: text/html; charset=UTF-8\r\n"+
			"\r\n"+
			"%s",
		fromHeader, to, subject, htmlBody,
	)
}

// formatPasswordResetEmail creates the HTML body for password reset email.
func formatPasswordResetEmail(to, resetLink, token string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Restablecer Contraseña</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin: 20px 0;">
        <h1 style="color: #2c3e50; margin-top: 0;">Restablecer tu Contraseña</h1>
        
        <p>Hola,</p>
        
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Gastos</strong>.</p>
        
        <p>Si solicitaste esto, haz clic en el siguiente botón para crear una nueva contraseña:</p>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="%s" 
               style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Restablecer Contraseña
            </a>
        </div>
        
        <p>O copia y pega este enlace en tu navegador:</p>
        <p style="background-color: #ecf0f1; padding: 10px; border-radius: 5px; word-break: break-all;">
            <code>%s</code>
        </p>
        
        <p style="color: #e74c3c; font-weight: bold;">⚠️ Este enlace expirará en 1 hora.</p>
        
        <p>Si no solicitaste restablecer tu contraseña, puedes ignorar este correo de forma segura.</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #7f8c8d;">
            <strong>Token de referencia:</strong> <code>%s</code><br>
            <em>Este correo fue enviado a: %s</em>
        </p>
    </div>
</body>
</html>`, resetLink, resetLink, token, to)
}

// formatHouseholdInvitationEmail creates the HTML body for household invitation email.
func formatHouseholdInvitationEmail(to, inviteLink, householdName, inviterName string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invitación a %s</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin: 20px 0;">
        <h1 style="color: #2c3e50; margin-top: 0;">🏠 Te invitaron a un hogar</h1>
        
        <p>Hola,</p>
        
        <p><strong>%s</strong> te ha invitado a unirte al hogar <strong>"%s"</strong> en <strong>Conti</strong>.</p>
        
        <p>Conti es una app para gestionar finanzas en grupo con transparencia total.</p>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="%s" 
               style="background-color: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Aceptar Invitación
            </a>
        </div>
        
        <p>O copia y pega este enlace en tu navegador:</p>
        <p style="background-color: #ecf0f1; padding: 10px; border-radius: 5px; word-break: break-all;">
            <code>%s</code>
        </p>
        
        <p style="color: #e74c3c; font-weight: bold;">⚠️ Esta invitación expirará en 7 días.</p>
        
        <p>Si no esperabas esta invitación, puedes ignorar este correo de forma segura.</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #7f8c8d;">
            <em>Este correo fue enviado a: %s</em>
        </p>
    </div>
</body>
</html>`, householdName, inviterName, householdName, inviteLink, inviteLink, to)
}
