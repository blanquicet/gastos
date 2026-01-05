package income

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/blanquicet/gastos/backend/internal/accounts"
	"github.com/blanquicet/gastos/backend/internal/households"
	"github.com/blanquicet/gastos/backend/internal/n8nclient"
)

// service implements Service interface
type service struct {
	repo          Repository
	accountsRepo  accounts.Repository
	householdsRepo households.HouseholdRepository
	n8nClient     *n8nclient.Client
	logger        *slog.Logger
}

// NewService creates a new income service
func NewService(repo Repository, accountsRepo accounts.Repository, householdsRepo households.HouseholdRepository, n8nClient *n8nclient.Client, logger *slog.Logger) Service {
	return &service{
		repo:          repo,
		accountsRepo:  accountsRepo,
		householdsRepo: householdsRepo,
		n8nClient:     n8nClient,
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
		return nil, err
	}

	// Dual write to n8n (Google Sheets) if configured
	if s.n8nClient != nil {
		n8nIncome := &n8nclient.IncomeMovement{
			Tipo:        "ingreso",
			Fecha:       income.IncomeDate.Format("2006-01-02"),
			Miembro:     income.MemberName,
			TipoIngreso: string(income.Type),
			Monto:       income.Amount,
			Descripcion: income.Description,
		}
		
		s.logger.Info("sending income to n8n", "income_id", income.ID, "type", income.Type, "amount", income.Amount)
		
		resp, err := s.n8nClient.RecordIncome(ctx, n8nIncome)
		if err != nil {
			s.logger.Error("failed to send income to n8n", "error", err, "income_id", income.ID)
			return nil, ErrN8NUnavailable
		}
		s.logger.Info("income sent to n8n successfully", "income_id", income.ID, "n8n_response", resp)
	}

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
		return nil, err
	}

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
	return s.repo.Delete(ctx, id)
}
