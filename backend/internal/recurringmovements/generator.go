package recurringmovements

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/blanquicet/conti/backend/internal/movements"
)

// Generator handles automatic movement generation from templates
type Generator struct {
	templateRepo         Repository
	movementsSvc         movements.Service
	logger               *slog.Logger
	getHouseholdMemberFn func(ctx context.Context, householdID string) (string, error) // returns any user_id from the household
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

// SetGetHouseholdMemberFn sets the function used to look up a household member user ID
// when the template has no payer_user_id or participants (e.g. HOUSEHOLD type without payer)
func (g *Generator) SetGetHouseholdMemberFn(fn func(ctx context.Context, householdID string) (string, error)) {
	g.getHouseholdMemberFn = fn
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
	
	// Auto-generate requires movement_type to be set
	if template.MovementType == nil {
		return errors.New("cannot auto-generate movement: movement_type is not set")
	}

	// Build movement input from template
	templateID := template.ID // Store reference to template
	input := &movements.CreateMovementInput{
		Type:                   *template.MovementType,
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
	if *template.MovementType == movements.TypeSplit && len(template.Participants) > 0 {
		input.Participants = make([]movements.ParticipantInput, len(template.Participants))
		for i, p := range template.Participants {
			input.Participants[i] = movements.ParticipantInput{
				ParticipantUserID:    p.ParticipantUserID,
				ParticipantContactID: p.ParticipantContactID,
				Percentage:           p.Percentage,
			}
		}
	}

	// Determine userID for the movements.Service.Create call (needs a household member)
	// This is a system operation, so we pick any available member
	var userID string
	if template.PayerUserID != nil {
		userID = *template.PayerUserID
	} else if len(template.Participants) > 0 {
		for _, p := range template.Participants {
			if p.ParticipantUserID != nil {
				userID = *p.ParticipantUserID
				break
			}
		}
	}

	// Fallback: look up any member of the household
	if userID == "" && g.getHouseholdMemberFn != nil {
		memberID, err := g.getHouseholdMemberFn(ctx, template.HouseholdID)
		if err != nil {
			g.logger.Error("failed to look up household member for auto-generation",
				"template_id", template.ID,
				"template_name", template.Name,
				"household_id", template.HouseholdID,
				"error", err,
			)
			return fmt.Errorf("cannot determine userID for auto-generation: %w", err)
		}
		userID = memberID

		// For HOUSEHOLD movements without a payer, default payer to this member
		if input.PayerUserID == nil && input.PayerContactID == nil {
			input.PayerUserID = &memberID
		}
	}

	if userID == "" {
		return fmt.Errorf("cannot determine userID for auto-generation: no payer, participants, or household member lookup configured (template %s)", template.ID)
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
