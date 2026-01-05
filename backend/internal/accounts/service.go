package accounts

import (
	"context"
	"errors"
	"strings"
)

// Service handles account business logic
type Service struct {
	repo Repository
}

// NewService creates a new account service
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// CreateInput contains the data needed to create an account
type CreateInput struct {
	HouseholdID    string
	OwnerID        string // ID of the member who owns this account
	Name           string
	Type           AccountType
	Institution    *string
	Last4          *string
	InitialBalance *float64 // Optional, defaults to 0
	Notes          *string
}

// Validate validates the input
func (i *CreateInput) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if i.Name == "" {
		return errors.New("account name is required")
	}
	if len(i.Name) > 100 {
		return errors.New("account name must be 100 characters or less")
	}
	if i.HouseholdID == "" {
		return errors.New("household ID is required")
	}
	if i.OwnerID == "" {
		return errors.New("owner ID is required")
	}
	if err := i.Type.Validate(); err != nil {
		return err
	}
	if i.Last4 != nil {
		*i.Last4 = strings.TrimSpace(*i.Last4)
		if len(*i.Last4) > 0 && len(*i.Last4) != 4 {
			return errors.New("last4 must be exactly 4 characters")
		}
	}
	if i.Institution != nil {
		*i.Institution = strings.TrimSpace(*i.Institution)
		if len(*i.Institution) > 100 {
			return errors.New("institution must be 100 characters or less")
		}
	}
	return nil
}

// Create creates a new account
func (s *Service) Create(ctx context.Context, input CreateInput) (*Account, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Check if name already exists in household
	existing, err := s.repo.FindByName(ctx, input.HouseholdID, input.Name)
	if err == nil && existing != nil {
		return nil, ErrAccountNameExists
	}
	if err != nil && !errors.Is(err, ErrAccountNotFound) {
		return nil, err
	}

	// Set default initial balance if not provided
	initialBalance := 0.0
	if input.InitialBalance != nil {
		initialBalance = *input.InitialBalance
	}

	account := &Account{
		HouseholdID:    input.HouseholdID,
		OwnerID:        input.OwnerID,
		Name:           input.Name,
		Type:           input.Type,
		Institution:    input.Institution,
		Last4:          input.Last4,
		InitialBalance: initialBalance,
		Notes:          input.Notes,
	}

	return s.repo.Create(ctx, account)
}

// UpdateInput contains the data needed to update an account
type UpdateInput struct {
	ID             string
	Name           *string
	Institution    *string
	Last4          *string
	InitialBalance *float64
	Notes          *string
}

// Validate validates the update input
func (i *UpdateInput) Validate() error {
	if i.ID == "" {
		return errors.New("account ID is required")
	}
	if i.Name != nil {
		*i.Name = strings.TrimSpace(*i.Name)
		if *i.Name == "" {
			return errors.New("account name cannot be empty")
		}
		if len(*i.Name) > 100 {
			return errors.New("account name must be 100 characters or less")
		}
	}
	if i.Last4 != nil {
		*i.Last4 = strings.TrimSpace(*i.Last4)
		if len(*i.Last4) > 0 && len(*i.Last4) != 4 {
			return errors.New("last4 must be exactly 4 characters")
		}
	}
	if i.Institution != nil {
		*i.Institution = strings.TrimSpace(*i.Institution)
		if len(*i.Institution) > 100 {
			return errors.New("institution must be 100 characters or less")
		}
	}
	return nil
}

// Update updates an account
func (s *Service) Update(ctx context.Context, householdID string, input UpdateInput) (*Account, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get existing account
	existing, err := s.repo.GetByID(ctx, input.ID)
	if err != nil {
		return nil, err
	}

	// Check authorization - account must belong to user's household
	if existing.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	// Update fields if provided
	if input.Name != nil {
		// Check if new name conflicts with another account in household
		if *input.Name != existing.Name {
			nameCheck, err := s.repo.FindByName(ctx, householdID, *input.Name)
			if err == nil && nameCheck != nil && nameCheck.ID != input.ID {
				return nil, ErrAccountNameExists
			}
		}
		existing.Name = *input.Name
	}
	if input.Institution != nil {
		existing.Institution = input.Institution
	}
	if input.Last4 != nil {
		existing.Last4 = input.Last4
	}
	if input.InitialBalance != nil {
		existing.InitialBalance = *input.InitialBalance
	}
	if input.Notes != nil {
		existing.Notes = input.Notes
	}

	return s.repo.Update(ctx, existing)
}

// GetByID retrieves an account by ID
func (s *Service) GetByID(ctx context.Context, id, householdID string) (*Account, error) {
	account, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Check authorization
	if account.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	return account, nil
}

// ListByHousehold retrieves all accounts for a household
func (s *Service) ListByHousehold(ctx context.Context, householdID string) ([]*Account, error) {
	return s.repo.ListByHousehold(ctx, householdID)
}

// Delete deletes an account
func (s *Service) Delete(ctx context.Context, id, householdID string) error {
	// Get existing account
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Check authorization
	if existing.HouseholdID != householdID {
		return ErrNotAuthorized
	}

	return s.repo.Delete(ctx, id)
}
