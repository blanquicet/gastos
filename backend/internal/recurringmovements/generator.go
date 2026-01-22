package recurringmovements

import (
	"context"
	"log/slog"
	"time"

	"github.com/blanquicet/gastos/backend/internal/movements"
)

// Generator handles automatic movement generation from templates
type Generator struct {
	templateRepo Repository
	movementsSvc movements.Service
	logger       *slog.Logger
}

// NewGenerator creates a new movement generator
func NewGenerator(
	templateRepo Repository,
	movementsSvc movements.Service,
	logger *slog.Logger,
) *Generator {
	return &Generator{
		templateRepo: templateRepo,
		movementsSvc: movementsSvc,
		logger:       logger,
	}
}

// ProcessPendingTemplates generates movements for all pending templates
// This is called by the scheduler
func (g *Generator) ProcessPendingTemplates(ctx context.Context) error {
	now := time.Now()
	
	// Get templates that need to generate movements
	templates, err := g.templateRepo.ListPendingAutoGeneration(ctx, now)
	if err != nil {
		g.logger.Error("failed to list pending templates", "error", err)
		return err
	}

	if len(templates) == 0 {
		g.logger.Debug("no pending templates to process")
		return nil
	}

	g.logger.Info("processing pending templates", "count", len(templates))

	// Process each template
	successCount := 0
	errorCount := 0
	for _, template := range templates {
		if err := g.GenerateMovement(ctx, template); err != nil {
			g.logger.Error("failed to generate movement from template",
				"template_id", template.ID,
				"template_name", template.Name,
				"error", err,
			)
			errorCount++
		} else {
			successCount++
		}
	}

	g.logger.Info("finished processing templates",
		"total", len(templates),
		"success", successCount,
		"errors", errorCount,
	)

	return nil
}

// GenerateMovement generates a single movement from a template
func (g *Generator) GenerateMovement(ctx context.Context, template *RecurringMovementTemplate) error {
	if !template.AutoGenerate {
		return nil // Skip if not configured for auto-generation
	}

	// Build movement input from template
	templateID := template.ID // Store reference to template
	input := &movements.CreateMovementInput{
		Type:                   template.MovementType,
		Description:            template.Name, // Use template name as description
		Amount:                 template.Amount,
		CategoryID:             template.CategoryID,
		MovementDate:           time.Now(), // Use current date
		GeneratedFromTemplateID: &templateID, // Mark as auto-generated
		
		PayerUserID:    template.PayerUserID,
		PayerContactID: template.PayerContactID,
		
		CounterpartyUserID:    template.CounterpartyUserID,
		CounterpartyContactID: template.CounterpartyContactID,
		
		PaymentMethodID:   template.PaymentMethodID,
	}

	// Add participants for SPLIT type
	if template.MovementType == movements.TypeSplit && len(template.Participants) > 0 {
		input.Participants = make([]movements.ParticipantInput, len(template.Participants))
		for i, p := range template.Participants {
			input.Participants[i] = movements.ParticipantInput{
				ParticipantUserID:    p.ParticipantUserID,
				ParticipantContactID: p.ParticipantContactID,
				Percentage:           p.Percentage,
			}
		}
	}

	// Use first household member as userID (for authorization)
	// This is a system operation, so we pick any member
	var userID string
	if template.PayerUserID != nil {
		// Payer is a user - use their ID
		userID = *template.PayerUserID
	} else if len(template.Participants) > 0 {
		// Payer is a contact - use first participant's user_id (for SPLIT movements)
		for _, p := range template.Participants {
			if p.ParticipantUserID != nil {
				userID = *p.ParticipantUserID
				break
			}
		}
		if userID == "" {
			g.logger.Error("cannot determine userID for auto-generation (no user participant found)",
				"template_id", template.ID,
				"template_name", template.Name,
			)
			return nil
		}
	} else {
		// No payer user and no participants - cannot proceed
		g.logger.Error("cannot determine userID for auto-generation (payer is contact, no participants)",
			"template_id", template.ID,
			"template_name", template.Name,
		)
		return nil
	}

	// Create movement
	movement, err := g.movementsSvc.Create(ctx, userID, input)
	if err != nil {
		return err
	}

	g.logger.Info("auto-generated movement from template",
		"template_id", template.ID,
		"template_name", template.Name,
		"movement_id", movement.ID,
		"amount", movement.Amount,
	)

	// Calculate next scheduled date
	now := time.Now()
	var nextScheduled time.Time
	
	if template.RecurrencePattern != nil {
		switch *template.RecurrencePattern {
		case RecurrenceOneTime:
			// One-time templates don't schedule again
			// We could mark them as inactive or just leave next_scheduled_date null
			nextScheduled = time.Time{} // Zero time (won't match future queries)
			
		case RecurrenceMonthly:
			// Calculate next month
			if template.DayOfMonth != nil {
				year, month, _ := now.Date()
				day := *template.DayOfMonth
				
				// Next month
				nextScheduled = time.Date(year, month+1, day, 0, 0, 0, 0, now.Location())
				
				// Handle month overflow (e.g., day 31 in February)
				if nextScheduled.Month() != month+1 && nextScheduled.Month() != 1 {
					// Go to last day of target month
					nextScheduled = time.Date(year, month+1, 1, 0, 0, 0, 0, now.Location()).AddDate(0, 1, -1)
				}
			} else {
				nextScheduled = now.AddDate(0, 1, 0)
			}
			
		case RecurrenceYearly:
			// Calculate next year
			if template.DayOfYear != nil {
				year := now.Year()
				nextScheduled = time.Date(year+1, 1, 1, 0, 0, 0, 0, now.Location()).AddDate(0, 0, *template.DayOfYear-1)
			} else {
				nextScheduled = now.AddDate(1, 0, 0)
			}
		}
	}

	// Update template tracking
	if err := g.templateRepo.UpdateGenerationTracking(ctx, template.ID, now, nextScheduled); err != nil {
		g.logger.Error("failed to update template tracking",
			"template_id", template.ID,
			"error", err,
		)
		// Don't fail the whole operation
	}

	return nil
}
