package recurringmovements

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/blanquicet/gastos/backend/internal/budgets"
	"github.com/blanquicet/gastos/backend/internal/households"
	"github.com/blanquicet/gastos/backend/internal/movements"
)

// service implements Service interface
type service struct {
	repo           Repository
	householdsRepo households.HouseholdRepository
	budgetsService budgets.Service
	logger         *slog.Logger
}

// NewService creates a new recurring movements service
func NewService(
	repo Repository,
	householdsRepo households.HouseholdRepository,
	budgetsService budgets.Service,
	logger *slog.Logger,
) Service {
	return &service{
		repo:           repo,
		householdsRepo: householdsRepo,
		budgetsService: budgetsService,
		logger:         logger,
	}
}

// Create creates a new template
func (s *service) Create(ctx context.Context, userID string, input *CreateTemplateInput) (*RecurringMovementTemplate, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Verify payer belongs to household
	if input.PayerUserID != nil {
		isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *input.PayerUserID)
		if err != nil {
			s.logger.Error("failed to check payer membership", "error", err, "household_id", householdID, "payer_id", *input.PayerUserID)
			return nil, err
		}
		if !isMember {
			s.logger.Warn("payer not member of household", "household_id", householdID, "payer_id", *input.PayerUserID)
			return nil, ErrNotAuthorized
		}
	}

	// Verify counterparty belongs to household (if specified)
	if input.CounterpartyUserID != nil {
		isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *input.CounterpartyUserID)
		if err != nil {
			s.logger.Error("failed to check counterparty membership", "error", err, "household_id", householdID, "counterparty_id", *input.CounterpartyUserID)
			return nil, err
		}
		if !isMember {
			s.logger.Warn("counterparty not member of household", "household_id", householdID, "counterparty_id", *input.CounterpartyUserID)
			return nil, ErrNotAuthorized
		}
	}

	// Verify all participants belong to household (for SPLIT movements)
	for i, p := range input.Participants {
		if p.ParticipantUserID != nil {
			isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *p.ParticipantUserID)
			if err != nil {
				s.logger.Error("failed to check participant membership", "error", err, "household_id", householdID, "participant_id", *p.ParticipantUserID, "index", i)
				return nil, err
			}
			if !isMember {
				s.logger.Warn("participant not member of household", "household_id", householdID, "participant_id", *p.ParticipantUserID, "index", i)
				return nil, ErrNotAuthorized
			}
		}
		// Note: ParticipantContactID doesn't need household check as contacts
		// are already scoped to the household
	}

	// Create template
	template, err := s.repo.Create(ctx, input, householdID)
	if err != nil {
		return nil, err
	}

	s.logger.Info("recurring movement template created",
		"template_id", template.ID,
		"name", template.Name,
		"auto_generate", template.AutoGenerate,
		"user_id", userID,
	)

	// Auto-update budget for this category
	if template.CategoryID != nil {
		if err := s.updateBudgetFromTemplates(ctx, userID, householdID, *template.CategoryID); err != nil {
			s.logger.Warn("failed to update budget after template creation",
				"error", err,
				"category_id", *template.CategoryID,
			)
			// Don't fail template creation if budget update fails
		}
	}

	return template, nil
}

// GetByID retrieves a template by ID
func (s *service) GetByID(ctx context.Context, userID, id string) (*RecurringMovementTemplate, error) {
	template, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Verify user has access to this template's household
	isMember, err := s.householdsRepo.IsUserMember(ctx, template.HouseholdID, userID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, ErrNotAuthorized
	}

	return template, nil
}

// ListByHousehold lists all templates for user's household
func (s *service) ListByHousehold(ctx context.Context, userID string, filters *ListTemplatesFilters) ([]*RecurringMovementTemplate, error) {
	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	return s.repo.ListByHousehold(ctx, householdID, filters)
}

// ListByCategory lists all active templates for a category
func (s *service) ListByCategory(ctx context.Context, userID, categoryID string) ([]*RecurringMovementTemplate, error) {
	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Get templates by category
	templates, err := s.repo.ListByCategory(ctx, categoryID)
	if err != nil {
		return nil, err
	}

	// Verify all templates belong to user's household
	// (This is a safety check; category should already be scoped to household)
	var result []*RecurringMovementTemplate
	for _, t := range templates {
		if t.HouseholdID == householdID {
			result = append(result, t)
		}
	}

	return result, nil
}

// ListByCategoryMap returns all templates grouped by category_id
func (s *service) ListByCategoryMap(ctx context.Context, userID string) (map[string][]*RecurringMovementTemplate, error) {
	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Get all templates for household
	templates, err := s.repo.ListByHousehold(ctx, householdID, nil)
	if err != nil {
		return nil, err
	}

	// Group by category_id
	result := make(map[string][]*RecurringMovementTemplate)
	for _, t := range templates {
		if t.CategoryID != nil {
			categoryID := *t.CategoryID
			result[categoryID] = append(result[categoryID], t)
		}
	}

	return result, nil
}

// GetPreFillData gets pre-fill data for a template (with optional role inversion)
func (s *service) GetPreFillData(ctx context.Context, userID, templateID string, invertRoles bool) (*PreFillData, error) {
	// Get template
	template, err := s.GetByID(ctx, userID, templateID)
	if err != nil {
		return nil, err
	}

	// Build pre-fill data
	data := &PreFillData{
		TemplateID:   template.ID,
		TemplateName: template.Name,
		MovementType: template.MovementType,
	}

	// Amount - always pre-fill from template
	data.Amount = &template.Amount

	// Payment method
	data.PaymentMethodID = template.PaymentMethodID
	
	// Receiver account
	data.ReceiverAccountID = template.ReceiverAccountID

	// Handle role inversion for SPLIT templates
	if invertRoles && template.MovementType != nil && *template.MovementType == movements.TypeSplit {
		// For SPLIT: template stores SPLIT data, but we're pre-filling DEBT_PAYMENT
		// Change movement type to DEBT_PAYMENT
		debtPaymentType := movements.TypeDebtPayment
		data.MovementType = &debtPaymentType
		
		// Invert: payer ↔ counterparty
		// Participants become: single participant with 100%
		
		// Original payer becomes counterparty
		data.CounterpartyUserID = template.PayerUserID
		data.CounterpartyContactID = template.PayerContactID
		
		// Original participants: find the one that's 100% (should be user)
		// That becomes the payer
		if len(template.Participants) > 0 {
			// Find participant with highest percentage (should be 100%)
			var maxParticipant *TemplateParticipant
			maxPercentage := 0.0
			for i := range template.Participants {
				if template.Participants[i].Percentage > maxPercentage {
					maxPercentage = template.Participants[i].Percentage
					maxParticipant = &template.Participants[i]
				}
			}
			
			if maxParticipant != nil {
				data.PayerUserID = maxParticipant.ParticipantUserID
				data.PayerContactID = maxParticipant.ParticipantContactID
			}
		}
		
		// No participants for DEBT_PAYMENT
		data.Participants = nil
		
	} else {
		// Normal pre-fill (no inversion)
		data.PayerUserID = template.PayerUserID
		data.PayerContactID = template.PayerContactID
		data.CounterpartyUserID = template.CounterpartyUserID
		data.CounterpartyContactID = template.CounterpartyContactID
		
		// Participants (convert to movements.ParticipantInput)
		if len(template.Participants) > 0 {
			data.Participants = make([]movements.ParticipantInput, len(template.Participants))
			for i, p := range template.Participants {
				data.Participants[i] = movements.ParticipantInput{
					ParticipantUserID:    p.ParticipantUserID,
					ParticipantContactID: p.ParticipantContactID,
					Percentage:           p.Percentage,
				}
			}
		}
	}

	return data, nil
}

// Update updates a template
func (s *service) Update(ctx context.Context, userID, id string, input *UpdateTemplateInput) (*RecurringMovementTemplate, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Verify user has access
	template, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return nil, err
	}

	// Update template
	updated, err := s.repo.Update(ctx, id, input)
	if err != nil {
		return nil, err
	}

	s.logger.Info("recurring movement template updated",
		"template_id", id,
		"name", template.Name,
		"user_id", userID,
	)

	// Auto-update budget for this category (use updated category if changed)
	categoryID := updated.CategoryID
	if categoryID != nil {
		if err := s.updateBudgetFromTemplates(ctx, userID, template.HouseholdID, *categoryID); err != nil {
			s.logger.Warn("failed to update budget after template update",
				"error", err,
				"category_id", *categoryID,
			)
			// Don't fail update if budget update fails
		}
	}
	
	// If category was changed, also update the old category's budget
	if template.CategoryID != nil && updated.CategoryID != nil && 
		*template.CategoryID != *updated.CategoryID {
		if err := s.updateBudgetFromTemplates(ctx, userID, template.HouseholdID, *template.CategoryID); err != nil {
			s.logger.Warn("failed to update old category budget after template update",
				"error", err,
				"category_id", *template.CategoryID,
			)
		}
	}

	return updated, nil
}

// Delete deletes a template
func (s *service) Delete(ctx context.Context, userID, id string) error {
	// Verify user has access and get template info before deleting
	template, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	// Delete template
	if err := s.repo.Delete(ctx, id); err != nil {
		return err
	}

	s.logger.Info("recurring movement template deleted",
		"template_id", id,
		"user_id", userID,
	)

	// Auto-update budget for this category
	if template.CategoryID != nil {
		if err := s.updateBudgetFromTemplates(ctx, userID, template.HouseholdID, *template.CategoryID); err != nil {
			s.logger.Warn("failed to update budget after template deletion",
				"error", err,
				"category_id", *template.CategoryID,
			)
			// Don't fail deletion if budget update fails
		}
	}

	return nil
}

// CalculateTemplatesSum calculates the sum of all template amounts for a category
// This is used by the budgets service to validate manual budgets
func (s *service) CalculateTemplatesSum(ctx context.Context, userID, categoryID string) (float64, error) {
	// Get household for authorization
	households, err := s.householdsRepo.ListByUser(ctx, userID)
	if err != nil {
		return 0, err
	}
	if len(households) == 0 {
		return 0, errors.New("user does not belong to any household")
	}
	householdID := households[0].ID
	
	// Get all active templates for this category
	filters := &ListTemplatesFilters{
		CategoryID: &categoryID,
	}
	templates, err := s.repo.ListByHousehold(ctx, householdID, filters)
	if err != nil {
		return 0, err
	}
	
	// Calculate sum
	totalAmount := 0.0
	for _, t := range templates {
		totalAmount += t.Amount
	}
	
	return totalAmount, nil
}

// updateBudgetFromTemplates creates or updates the budget for a category
// ONLY if no manual budget exists (respects user-set budgets)
func (s *service) updateBudgetFromTemplates(ctx context.Context, userID, householdID, categoryID string) error {
	// Get current month (YYYY-MM format)
	now := time.Now()
	month := now.Format("2006-01")
	
	// Calculate templates sum
	templatesSum, err := s.CalculateTemplatesSum(ctx, userID, categoryID)
	if err != nil {
		return err
	}
	
	// If no templates, don't create/update budget
	if templatesSum == 0 {
		s.logger.Info("no templates for category, skipping budget update",
			"category_id", categoryID,
			"month", month,
		)
		return nil
	}
	
	// Update budget with the calculated sum
	// Note: budgets.Set will validate that this doesn't reduce below templates sum
	budgetInput := &budgets.SetBudgetInput{
		Month:      month,
		CategoryID: categoryID,
		Amount:     templatesSum,
	}
	
	_, err = s.budgetsService.Set(ctx, userID, budgetInput)
	if err != nil {
		return err
	}
	
	s.logger.Info("budget auto-updated from templates",
		"category_id", categoryID,
		"month", month,
		"amount", templatesSum,
	)
	
	return nil
}
