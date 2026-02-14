package categorygroups

import (
	"context"
	"errors"

	"github.com/blanquicet/conti/backend/internal/audit"
)

var (
	ErrNoHousehold = errors.New("user does not belong to a household")
)

// UserFetcher defines interface for fetching user household info
type UserFetcher interface {
	GetUserHouseholdID(ctx context.Context, userID string) (string, error)
}

// service implements Service
type service struct {
	repo         Repository
	userFetcher  UserFetcher
	auditService audit.Service
}

// NewService creates a new category groups service
func NewService(repo Repository, userFetcher UserFetcher, auditService audit.Service) Service {
	return &service{
		repo:         repo,
		userFetcher:  userFetcher,
		auditService: auditService,
	}
}

// ListByHousehold returns all category groups with their categories for the current user's household
func (s *service) ListByHousehold(ctx context.Context, userID string, includeInactive bool) ([]*CategoryGroup, error) {
	householdID, err := s.userFetcher.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if householdID == "" {
		return nil, ErrNoHousehold
	}

	return s.repo.ListByHousehold(ctx, householdID, includeInactive)
}

// Create creates a new category group
func (s *service) Create(ctx context.Context, userID string, input *CreateCategoryGroupInput) (*CategoryGroup, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	householdID, err := s.userFetcher.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if householdID == "" {
		return nil, ErrNoHousehold
	}

	group, err := s.repo.Create(ctx, householdID, input)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionCategoryGroupCreated,
			ResourceType: "category_group",
			UserID:       audit.StringPtr(userID),
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionCategoryGroupCreated,
		ResourceType: "category_group",
		ResourceID:   audit.StringPtr(group.ID),
		UserID:       audit.StringPtr(userID),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
		NewValues:    audit.StructToMap(group),
	})

	return group, nil
}

// Update updates a category group
func (s *service) Update(ctx context.Context, userID, id string, input *UpdateCategoryGroupInput) (*CategoryGroup, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	group, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	householdID, err := s.verifyAccess(ctx, userID, group.HouseholdID)
	if err != nil {
		return nil, err
	}

	oldValues := audit.StructToMap(group)

	updated, err := s.repo.Update(ctx, id, input)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionCategoryGroupUpdated,
			ResourceType: "category_group",
			ResourceID:   audit.StringPtr(id),
			UserID:       audit.StringPtr(userID),
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionCategoryGroupUpdated,
		ResourceType: "category_group",
		ResourceID:   audit.StringPtr(id),
		UserID:       audit.StringPtr(userID),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
		OldValues:    oldValues,
		NewValues:    audit.StructToMap(updated),
	})

	return updated, nil
}

// Delete deletes a category group (hard delete only if no categories)
func (s *service) Delete(ctx context.Context, userID, id string) error {
	group, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	householdID, err := s.verifyAccess(ctx, userID, group.HouseholdID)
	if err != nil {
		return err
	}

	hasCats, err := s.repo.HasCategories(ctx, id)
	if err != nil {
		return err
	}
	if hasCats {
		return ErrGroupHasCategories
	}

	oldValues := audit.StructToMap(group)

	if err := s.repo.Delete(ctx, id); err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionCategoryGroupDeleted,
			ResourceType: "category_group",
			ResourceID:   audit.StringPtr(id),
			UserID:       audit.StringPtr(userID),
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionCategoryGroupDeleted,
		ResourceType: "category_group",
		ResourceID:   audit.StringPtr(id),
		UserID:       audit.StringPtr(userID),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
		OldValues:    oldValues,
	})

	return nil
}

// verifyAccess checks if user belongs to the same household
func (s *service) verifyAccess(ctx context.Context, userID, groupHouseholdID string) (string, error) {
	householdID, err := s.userFetcher.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return "", err
	}
	if householdID == "" {
		return "", ErrNoHousehold
	}
	if householdID != groupHouseholdID {
		return "", ErrNotAuthorized
	}
	return householdID, nil
}
