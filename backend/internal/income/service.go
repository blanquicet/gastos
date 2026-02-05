package income

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/blanquicet/gastos/backend/internal/accounts"
	"github.com/blanquicet/gastos/backend/internal/audit"
	"github.com/blanquicet/gastos/backend/internal/households"
)

// service implements Service interface
type service struct {
	repo          Repository
	accountsRepo  accounts.Repository
	householdsRepo households.HouseholdRepository
	auditService  audit.Service
	logger        *slog.Logger
}

// NewService creates a new income service
func NewService(repo Repository, accountsRepo accounts.Repository, householdsRepo households.HouseholdRepository, auditService audit.Service, logger *slog.Logger) Service {
	return &service{
		repo:          repo,
		accountsRepo:  accountsRepo,
		householdsRepo: householdsRepo,
		auditService:  auditService,
		logger:        logger,
	}
}

// Create creates a new income entry
func (s *service) Create(ctx context.Context, userID string, input *CreateIncomeInput) (*Income, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Verify member belongs to household
	isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, input.MemberID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, ErrMemberNotInHousehold
	}

	// Verify account exists and belongs to household
	account, err := s.accountsRepo.GetByID(ctx, input.AccountID)
	if err != nil {
		if errors.Is(err, accounts.ErrAccountNotFound) {
			return nil, errors.New("account not found")
		}
		return nil, err
	}
	if account.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	// Verify account type can receive income
	if !account.Type.CanReceiveIncome() {
		return nil, ErrInvalidAccountType
	}

	// Create income
	income, err := s.repo.Create(ctx, input, householdID)
	if err != nil {
		// Log failed creation
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(userID),
			Action:       audit.ActionIncomeCreated,
			ResourceType: "income",
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	// Log successful creation
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionIncomeCreated,
		ResourceType: "income",
		ResourceID:   audit.StringPtr(income.ID),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
		NewValues:    audit.StructToMap(income),
	})

	return income, nil
}

// GetByID retrieves an income entry by ID
func (s *service) GetByID(ctx context.Context, userID, id string) (*Income, error) {
	// Get income
	income, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Verify user has access to this income (belongs to same household)
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if income.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	return income, nil
}

// ListByHousehold retrieves all income entries for user's household
func (s *service) ListByHousehold(ctx context.Context, userID string, filters *ListIncomeFilters) (*ListIncomeResponse, error) {
	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// If filtering by member, verify member belongs to household
	if filters != nil && filters.MemberID != nil {
		isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *filters.MemberID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, errors.New("member does not belong to household")
		}
	}

	// If filtering by account, verify account belongs to household
	if filters != nil && filters.AccountID != nil {
		account, err := s.accountsRepo.GetByID(ctx, *filters.AccountID)
		if err != nil {
			return nil, err
		}
		if account.HouseholdID != householdID {
			return nil, errors.New("account does not belong to household")
		}
	}

	// Get income entries
	incomes, err := s.repo.ListByHousehold(ctx, householdID, filters)
	if err != nil {
		return nil, err
	}

	// Get totals
	totals, err := s.repo.GetTotals(ctx, householdID, filters)
	if err != nil {
		return nil, err
	}

	return &ListIncomeResponse{
		IncomeEntries: incomes,
		Totals:        totals,
	}, nil
}

// Update updates an income entry
func (s *service) Update(ctx context.Context, userID, id string, input *UpdateIncomeInput) (*Income, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get existing income
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Verify user has access
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if existing.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	// If updating account, verify it exists, belongs to household, and can receive income
	if input.AccountID != nil {
		account, err := s.accountsRepo.GetByID(ctx, *input.AccountID)
		if err != nil {
			if errors.Is(err, accounts.ErrAccountNotFound) {
				return nil, errors.New("account not found")
			}
			return nil, err
		}
		if account.HouseholdID != householdID {
			return nil, ErrNotAuthorized
		}
		if !account.Type.CanReceiveIncome() {
			return nil, ErrInvalidAccountType
		}
	}

	// Trim description if provided
	if input.Description != nil {
		trimmed := strings.TrimSpace(*input.Description)
		input.Description = &trimmed
	}

	// Update income
	updated, err := s.repo.Update(ctx, id, input)
	if err != nil {
		// Log failed update
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(userID),
			Action:       audit.ActionIncomeUpdated,
			ResourceType: "income",
			ResourceID:   audit.StringPtr(id),
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	// Log successful update
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionIncomeUpdated,
		ResourceType: "income",
		ResourceID:   audit.StringPtr(id),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
		OldValues:    audit.StructToMap(existing),
		NewValues:    audit.StructToMap(updated),
	})

	return updated, nil
}

// Delete deletes an income entry
func (s *service) Delete(ctx context.Context, userID, id string) error {
	// Get existing income
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Verify user has access
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return err
	}

	if existing.HouseholdID != householdID {
		return ErrNotAuthorized
	}

	// Delete income
	err = s.repo.Delete(ctx, id)
	if err != nil {
		// Log failed deletion
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(userID),
			Action:       audit.ActionIncomeDeleted,
			ResourceType: "income",
			ResourceID:   audit.StringPtr(id),
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return err
	}

	// Log successful deletion
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionIncomeDeleted,
		ResourceType: "income",
		ResourceID:   audit.StringPtr(id),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
		OldValues:    audit.StructToMap(existing),
	})

	return nil
}
