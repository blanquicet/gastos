package budgets

import (
	"context"

	"github.com/blanquicet/conti/backend/internal/audit"
	"github.com/blanquicet/conti/backend/internal/categories"
	"github.com/blanquicet/conti/backend/internal/households"
)

// BudgetService implements Service
type BudgetService struct {
	repo              Repository
	categoryRepo      categories.Repository
	householdRepo     households.HouseholdRepository
	auditService      audit.Service
	templatesCalculator TemplatesSumCalculator // For validating budgets >= templates sum
}

// NewService creates a new budget service
func NewService(
	repo Repository, 
	categoryRepo categories.Repository, 
	householdRepo households.HouseholdRepository, 
	auditService audit.Service,
	templatesCalculator TemplatesSumCalculator,
) *BudgetService {
	return &BudgetService{
		repo:              repo,
		categoryRepo:      categoryRepo,
		householdRepo:     householdRepo,
		auditService:      auditService,
		templatesCalculator: templatesCalculator,
	}
}

// SetTemplatesCalculator sets the templates calculator after initialization
// This is needed to break the circular dependency between budgets and recurring movements
func (s *BudgetService) SetTemplatesCalculator(calculator TemplatesSumCalculator) {
	s.templatesCalculator = calculator
}

// GetByMonth returns budgets for a month with status indicators
func (s *BudgetService) GetByMonth(ctx context.Context, userID, month string) (*GetBudgetResponse, error) {
	// Validate month format
	_, err := ParseMonth(month)
	if err != nil {
		return nil, ErrInvalidMonth
	}

	// Get user's household
	householdID, err := s.getUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Get budgets with spent amounts
	budgets, err := s.repo.GetByMonth(ctx, householdID, month)
	if err != nil {
		return nil, err
	}

	// Calculate totals
	var totalBudget, totalSpent float64
	for _, budget := range budgets {
		totalBudget += budget.Amount
		totalSpent += budget.Spent
	}

	var totalPercentage float64
	if totalBudget > 0 {
		totalPercentage = (totalSpent / totalBudget) * 100
	}

	return &GetBudgetResponse{
		Month:   month,
		Budgets: budgets,
		Totals: &BudgetTotals{
			TotalBudget: totalBudget,
			TotalSpent:  totalSpent,
			Percentage:  totalPercentage,
		},
	}, nil
}

// Set creates or updates a budget
func (s *BudgetService) Set(ctx context.Context, userID string, input *SetBudgetInput) (*MonthlyBudget, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get user's household
	householdID, err := s.getUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Verify category exists and belongs to user's household
	category, err := s.categoryRepo.GetByID(ctx, input.CategoryID)
	if err != nil {
		if err == categories.ErrCategoryNotFound {
			return nil, ErrCategoryNotFound
		}
		return nil, err
	}
	if category.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	// Validate budget amount >= sum of templates for this category
	if s.templatesCalculator != nil {
		templatesSum, err := s.templatesCalculator.CalculateTemplatesSum(ctx, userID, input.CategoryID)
		if err != nil {
			// Log but don't fail - templates service might not be available
			// This allows budgets to work independently
		} else if input.Amount < templatesSum {
			return nil, ErrBudgetBelowTemplates
		}
	}

	// Set budget (upsert operation)
	budget, err := s.repo.Set(ctx, householdID, input)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionBudgetCreated,
			ResourceType: "budget",
			UserID:       audit.StringPtr(userID),
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionBudgetCreated,
		ResourceType: "budget",
		ResourceID:   audit.StringPtr(budget.ID),
		UserID:       audit.StringPtr(userID),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
		NewValues:    audit.StructToMap(budget),
	})

	// Apply scope side-effects
	scope := input.Scope
	if scope == "" {
		scope = ScopeThis // Default: only affect this month
	}
	switch scope {
	case ScopeFuture:
		// Delete future budget records — future months will get lazy-copied
		s.repo.DeleteFutureRecords(ctx, householdID, input.CategoryID, input.Month)
	case ScopeAll:
		// Update all existing budget records for this category
		s.repo.UpdateAllRecords(ctx, householdID, input.CategoryID, input.Amount)
	case ScopeThis:
		// No side effects — only the specified month was set
	}

	return budget, nil
}

// Delete deletes a budget
func (s *BudgetService) Delete(ctx context.Context, userID, budgetID string) error {
	// Get budget to verify access
	budget, err := s.repo.GetByID(ctx, budgetID)
	if err != nil {
		return err
	}

	// Verify user is member of budget's household
	_, err = s.householdRepo.GetMemberByUserID(ctx, budget.HouseholdID, userID)
	if err != nil {
		if err == households.ErrMemberNotFound {
			return ErrNotAuthorized
		}
		return err
	}

	// Store old values for audit
	oldValues := audit.StructToMap(budget)

	// Delete budget
	err = s.repo.Delete(ctx, budgetID)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionBudgetDeleted,
			ResourceType: "budget",
			ResourceID:   audit.StringPtr(budgetID),
			UserID:       audit.StringPtr(userID),
			HouseholdID:  audit.StringPtr(budget.HouseholdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionBudgetDeleted,
		ResourceType: "budget",
		ResourceID:   audit.StringPtr(budgetID),
		UserID:       audit.StringPtr(userID),
		HouseholdID:  audit.StringPtr(budget.HouseholdID),
		Success:      true,
		OldValues:    oldValues,
	})

	return nil
}

// CopyBudgets copies budgets from one month to another
func (s *BudgetService) CopyBudgets(ctx context.Context, userID string, input *CopyBudgetsInput) (int, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return 0, err
	}

	// Get user's household
	householdID, err := s.getUserHouseholdID(ctx, userID)
	if err != nil {
		return 0, err
	}

	// Copy budgets
	return s.repo.CopyBudgets(ctx, householdID, input.FromMonth, input.ToMonth)
}

// getUserHouseholdID gets the household ID for a user
func (s *BudgetService) getUserHouseholdID(ctx context.Context, userID string) (string, error) {
	households, err := s.householdRepo.ListByUser(ctx, userID)
	if err != nil {
		return "", err
	}
	if len(households) == 0 {
		return "", ErrNoHousehold
	}
	// User should only have one household (for now)
	return households[0].ID, nil
}
