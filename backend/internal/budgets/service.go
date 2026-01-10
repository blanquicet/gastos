package budgets

import (
	"context"

	"github.com/blanquicet/gastos/backend/internal/categories"
	"github.com/blanquicet/gastos/backend/internal/households"
)

// BudgetService implements Service
type BudgetService struct {
	repo          Repository
	categoryRepo  categories.Repository
	householdRepo households.HouseholdRepository
}

// NewService creates a new budget service
func NewService(repo Repository, categoryRepo categories.Repository, householdRepo households.HouseholdRepository) *BudgetService {
	return &BudgetService{
		repo:          repo,
		categoryRepo:  categoryRepo,
		householdRepo: householdRepo,
	}
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

	// Set budget
	return s.repo.Set(ctx, householdID, input)
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

	// Delete budget
	return s.repo.Delete(ctx, budgetID)
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
