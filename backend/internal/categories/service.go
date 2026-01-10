package categories

import (
	"context"

	"github.com/blanquicet/gastos/backend/internal/households"
)

// CategoryService implements Service
type CategoryService struct {
	repo         Repository
	householdRepo households.HouseholdRepository
}

// NewService creates a new category service
func NewService(repo Repository, householdRepo households.HouseholdRepository) *CategoryService {
	return &CategoryService{
		repo:         repo,
		householdRepo: householdRepo,
	}
}

// Create creates a new category
func (s *CategoryService) Create(ctx context.Context, userID string, input *CreateCategoryInput) (*Category, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get user's household
	householdID, err := s.getUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Create category
	return s.repo.Create(ctx, householdID, input)
}

// GetByID retrieves a category if user has access to it
func (s *CategoryService) GetByID(ctx context.Context, userID, id string) (*Category, error) {
	// Get category
	category, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Verify user is member of category's household
	_, err = s.householdRepo.GetMemberByUserID(ctx, category.HouseholdID, userID)
	if err != nil {
		if err == households.ErrMemberNotFound {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	return category, nil
}

// ListByHousehold lists all categories for user's household
func (s *CategoryService) ListByHousehold(ctx context.Context, userID string, includeInactive bool) (*ListCategoriesResponse, error) {
	// Get user's household
	householdID, err := s.getUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Get categories
	categories, err := s.repo.ListByHousehold(ctx, householdID, includeInactive)
	if err != nil {
		return nil, err
	}

	// Group categories
	grouped := make(map[string][]*Category)
	for _, cat := range categories {
		group := ""
		if cat.CategoryGroup != nil {
			group = *cat.CategoryGroup
		}
		grouped[group] = append(grouped[group], cat)
	}

	return &ListCategoriesResponse{
		Categories: categories,
		Grouped:    grouped,
	}, nil
}

// Update updates a category
func (s *CategoryService) Update(ctx context.Context, userID, id string, input *UpdateCategoryInput) (*Category, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get category to verify access
	category, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Verify user is member of category's household
	_, err = s.householdRepo.GetMemberByUserID(ctx, category.HouseholdID, userID)
	if err != nil {
		if err == households.ErrMemberNotFound {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	// Update category
	return s.repo.Update(ctx, id, input)
}

// Delete deletes a category
func (s *CategoryService) Delete(ctx context.Context, userID, id string) error {
	// Get category to verify access
	category, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Verify user is member of category's household
	_, err = s.householdRepo.GetMemberByUserID(ctx, category.HouseholdID, userID)
	if err != nil {
		if err == households.ErrMemberNotFound {
			return ErrNotAuthorized
		}
		return err
	}

	// Delete category (repository checks if it's used in movements)
	return s.repo.Delete(ctx, id)
}

// Reorder reorders categories
func (s *CategoryService) Reorder(ctx context.Context, userID string, input *ReorderCategoriesInput) error {
	// Validate input
	if err := input.Validate(); err != nil {
		return err
	}

	// Get user's household
	householdID, err := s.getUserHouseholdID(ctx, userID)
	if err != nil {
		return err
	}

	// Verify all categories belong to user's household
	for _, categoryID := range input.CategoryIDs {
		category, err := s.repo.GetByID(ctx, categoryID)
		if err != nil {
			return err
		}
		if category.HouseholdID != householdID {
			return ErrNotAuthorized
		}
	}

	// Reorder
	return s.repo.Reorder(ctx, householdID, input.CategoryIDs)
}

// getUserHouseholdID gets the household ID for a user
func (s *CategoryService) getUserHouseholdID(ctx context.Context, userID string) (string, error) {
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
