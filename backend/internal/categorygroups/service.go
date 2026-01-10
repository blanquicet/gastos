package categorygroups

import (
	"context"
	"errors"
)

var (
	ErrNoHousehold = errors.New("user does not belong to a household")
)

// UserFetcher defines interface for fetching user household info
type UserFetcher interface {
	GetHouseholdID(ctx context.Context, userID string) (string, error)
}

// service implements Service
type service struct {
	repo        Repository
	userFetcher UserFetcher
}

// NewService creates a new category groups service
func NewService(repo Repository, userFetcher UserFetcher) Service {
	return &service{
		repo:        repo,
		userFetcher: userFetcher,
	}
}

// ListByHousehold returns all category groups with their categories for the current user's household
func (s *service) ListByHousehold(ctx context.Context, userID string) ([]*CategoryGroup, error) {
	// Get user's household
	householdID, err := s.userFetcher.GetHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if householdID == "" {
		return nil, ErrNoHousehold
	}

	// Get groups with categories
	return s.repo.ListByHousehold(ctx, householdID)
}
