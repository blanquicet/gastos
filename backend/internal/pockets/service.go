package pockets

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/blanquicet/conti/backend/internal/accounts"
	"github.com/blanquicet/conti/backend/internal/audit"
	"github.com/blanquicet/conti/backend/internal/households"
	"github.com/blanquicet/conti/backend/internal/movements"
)

// Service handles pocket business logic
type Service struct {
	repo             Repository
	movementsRepo    movements.Repository
	accountsRepo     accounts.Repository
	householdRepo    households.HouseholdRepository
	categoryGroupRepo CategoryGroupRepo
	categoryRepo     CategoryRepo
	auditService     audit.Service
	logger           *slog.Logger
}

// NewService creates a new pocket service
func NewService(
	repo Repository,
	movementsRepo movements.Repository,
	accountsRepo accounts.Repository,
	householdRepo households.HouseholdRepository,
	categoryGroupRepo CategoryGroupRepo,
	categoryRepo CategoryRepo,
	auditService audit.Service,
	logger *slog.Logger,
) *Service {
	return &Service{
		repo:             repo,
		movementsRepo:    movementsRepo,
		accountsRepo:     accountsRepo,
		householdRepo:    householdRepo,
		categoryGroupRepo: categoryGroupRepo,
		categoryRepo:     categoryRepo,
		auditService:     auditService,
		logger:           logger,
	}
}

// Create creates a new pocket
func (s *Service) Create(ctx context.Context, input *CreatePocketInput) (*Pocket, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Check max pockets limit
	count, err := s.repo.CountByHousehold(ctx, input.HouseholdID)
	if err != nil {
		return nil, fmt.Errorf("counting pockets: %w", err)
	}
	if count >= 20 {
		return nil, ErrMaxPocketsReached
	}

	// Check name uniqueness
	existing, err := s.repo.FindByName(ctx, input.HouseholdID, input.Name)
	if err != nil {
		return nil, fmt.Errorf("checking pocket name: %w", err)
	}
	if existing != nil {
		return nil, ErrPocketNameExists
	}

	// Verify owner is a household member
	isMember, err := s.householdRepo.IsUserMember(ctx, input.HouseholdID, input.OwnerID)
	if err != nil {
		return nil, fmt.Errorf("checking household membership: %w", err)
	}
	if !isMember {
		return nil, ErrNotAuthorized
	}

	// Create pocket
	pocket := &Pocket{
		HouseholdID: input.HouseholdID,
		OwnerID:     input.OwnerID,
		Name:        input.Name,
		Icon:        input.Icon,
		GoalAmount:  input.GoalAmount,
		Note:        input.Note,
	}

	pocket, err = s.repo.Create(ctx, pocket)
	if err != nil {
		return nil, fmt.Errorf("creating pocket: %w", err)
	}

	// Audit log
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(input.OwnerID),
		Action:       audit.ActionPocketCreated,
		ResourceType: "pocket",
		ResourceID:   audit.StringPtr(pocket.ID),
		HouseholdID:  audit.StringPtr(input.HouseholdID),
		NewValues:    audit.StructToMap(pocket),
		Success:      true,
	})

	return pocket, nil
}

// GetByID retrieves a pocket by ID, verifying household access
func (s *Service) GetByID(ctx context.Context, id, householdID string) (*Pocket, error) {
	pocket, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if pocket.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	return pocket, nil
}

// ListByHousehold lists all active pockets for a household
func (s *Service) ListByHousehold(ctx context.Context, householdID string) ([]*Pocket, error) {
	return s.repo.ListActiveByHousehold(ctx, householdID)
}

// GetSummary returns aggregated pocket data for a household
func (s *Service) GetSummary(ctx context.Context, householdID string) (*PocketSummary, error) {
	pockets, err := s.repo.ListActiveByHousehold(ctx, householdID)
	if err != nil {
		return nil, fmt.Errorf("listing pockets: %w", err)
	}

	summary := &PocketSummary{
		PocketCount: len(pockets),
		Pockets:     pockets,
	}

	var totalBalance float64
	var totalGoal float64
	hasGoal := false

	for _, p := range pockets {
		if p.Balance != nil {
			totalBalance += *p.Balance
		}
		if p.GoalAmount != nil {
			totalGoal += *p.GoalAmount
			hasGoal = true
		}
	}

	summary.TotalBalance = totalBalance
	if hasGoal {
		summary.TotalGoal = &totalGoal
	}

	return summary, nil
}

// Update updates a pocket's mutable fields
func (s *Service) Update(ctx context.Context, userID, householdID string, input *UpdatePocketInput) (*Pocket, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get existing pocket
	pocket, err := s.repo.GetByID(ctx, input.ID)
	if err != nil {
		return nil, err
	}

	// Verify household access
	if pocket.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	// Check name uniqueness if name is being changed
	if input.Name != nil && *input.Name != pocket.Name {
		existing, err := s.repo.FindByName(ctx, householdID, *input.Name)
		if err != nil {
			return nil, fmt.Errorf("checking pocket name: %w", err)
		}
		if existing != nil {
			return nil, ErrPocketNameExists
		}
	}

	// Apply updates
	oldName := pocket.Name
	if input.Name != nil {
		pocket.Name = *input.Name
	}
	if input.Icon != nil {
		pocket.Icon = *input.Icon
	}
	if input.GoalAmount != nil {
		pocket.GoalAmount = input.GoalAmount
	}
	if input.ClearGoal {
		pocket.GoalAmount = nil
	}
	if input.Note != nil {
		pocket.Note = input.Note
	}
	if input.ClearNote {
		pocket.Note = nil
	}

	// Persist
	pocket, err = s.repo.Update(ctx, pocket)
	if err != nil {
		return nil, fmt.Errorf("updating pocket: %w", err)
	}

	// If name changed, rename the matching category in "Ahorros" group (best-effort)
	if input.Name != nil && *input.Name != oldName {
		groupID, grpErr := s.categoryGroupRepo.FindOrCreateByName(ctx, householdID, ahorrosGroupName, ahorrosGroupIcon)
		if grpErr == nil {
			if renameErr := s.categoryRepo.RenameByGroupAndName(ctx, householdID, groupID, oldName, *input.Name); renameErr != nil {
				s.logger.Warn("failed to rename pocket category",
					"old_name", oldName,
					"new_name", *input.Name,
					"error", renameErr,
				)
			}
		}
	}

	// Audit log
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionPocketUpdated,
		ResourceType: "pocket",
		ResourceID:   audit.StringPtr(pocket.ID),
		HouseholdID:  audit.StringPtr(householdID),
		NewValues:    audit.StructToMap(pocket),
		Success:      true,
	})

	return pocket, nil
}

// Deactivate deactivates a pocket (soft delete)
func (s *Service) Deactivate(ctx context.Context, id, userID, householdID string, force bool) error {
	// Get pocket
	pocket, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Verify household access
	if pocket.HouseholdID != householdID {
		return ErrNotAuthorized
	}

	// Check balance if not forcing
	if !force {
		balance, err := s.repo.GetBalance(ctx, id)
		if err != nil {
			return fmt.Errorf("getting pocket balance: %w", err)
		}
		if balance > 0 {
			return ErrPocketHasBalance
		}
	}

	// Deactivate
	if err := s.repo.Deactivate(ctx, id); err != nil {
		return fmt.Errorf("deactivating pocket: %w", err)
	}

	// Audit log
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionPocketDeactivated,
		ResourceType: "pocket",
		ResourceID:   audit.StringPtr(id),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
	})

	return nil
}

// Deposit creates a deposit transaction for a pocket, along with a linked HOUSEHOLD movement
func (s *Service) Deposit(ctx context.Context, input *DepositInput) (*PocketTransaction, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get pocket and verify it's active
	pocket, err := s.repo.GetByID(ctx, input.PocketID)
	if err != nil {
		return nil, err
	}
	if !pocket.IsActive {
		return nil, ErrPocketNotActive
	}

	// Verify source account belongs to household
	account, err := s.accountsRepo.GetByID(ctx, input.SourceAccountID)
	if err != nil {
		return nil, fmt.Errorf("getting source account: %w", err)
	}
	if account.HouseholdID != pocket.HouseholdID {
		return nil, ErrNotAuthorized
	}

	// Resolve category: use cached pocket.CategoryID or find/create it
	var categoryID string
	var categoryCreated bool
	if pocket.CategoryID != nil {
		categoryID = *pocket.CategoryID
	} else {
		categoryID, categoryCreated, err = s.resolvePocketCategory(ctx, pocket.HouseholdID, pocket.Name)
		if err != nil {
			return nil, fmt.Errorf("resolving pocket category: %w", err)
		}
		// Persist the resolved category_id on the pocket
		pocket.CategoryID = &categoryID
		if _, updateErr := s.repo.Update(ctx, pocket); updateErr != nil {
			s.logger.Warn("failed to persist category_id on pocket",
				"pocket_id", pocket.ID,
				"category_id", categoryID,
				"error", updateErr,
			)
		}
	}

	// Create the linked HOUSEHOLD movement first (auto-commits via its own repo)
	movementInput := &movements.CreateMovementInput{
		Type:           movements.TypeHousehold,
		Description:    buildDepositDescription(pocket.Name, input.Description),
		Amount:         input.Amount,
		CategoryID:     &categoryID,
		MovementDate:   input.TransactionDate,
		PayerUserID:    &input.CreatedBy,
		SourcePocketID: &input.PocketID,
		// PaymentMethodID intentionally nil — avoids double-counting in account balance
	}

	movement, err := s.movementsRepo.Create(ctx, movementInput, pocket.HouseholdID)
	if err != nil {
		s.logger.Error("failed to create linked movement for deposit",
			"pocket_id", input.PocketID,
			"error", err,
		)
		return nil, fmt.Errorf("creating linked movement: %w", err)
	}

	// Create pocket transaction with linked_movement_id
	ptx := &PocketTransaction{
		PocketID:         input.PocketID,
		HouseholdID:      pocket.HouseholdID,
		Type:             TransactionTypeDeposit,
		Amount:           input.Amount,
		Description:      &input.Description,
		TransactionDate:  input.TransactionDate,
		SourceAccountID:  &input.SourceAccountID,
		LinkedMovementID: &movement.ID,
		CreatedBy:        input.CreatedBy,
	}

	result, err := s.repo.CreateTransaction(ctx, ptx)
	if err != nil {
		// Cleanup: delete the movement we just created
		s.logger.Error("failed to create pocket transaction, cleaning up movement",
			"pocket_id", input.PocketID,
			"movement_id", movement.ID,
			"error", err,
		)
		if delErr := s.movementsRepo.Delete(ctx, movement.ID); delErr != nil {
			s.logger.Error("failed to cleanup movement after pocket transaction failure",
				"movement_id", movement.ID,
				"error", delErr,
			)
		}
		return nil, fmt.Errorf("creating pocket transaction: %w", err)
	}

	// Audit logs
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(input.CreatedBy),
		Action:       audit.ActionMovementCreated,
		ResourceType: "movement",
		ResourceID:   audit.StringPtr(movement.ID),
		HouseholdID:  audit.StringPtr(pocket.HouseholdID),
		NewValues:    audit.StructToMap(movement),
		Success:      true,
	})

	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(input.CreatedBy),
		Action:       audit.ActionPocketTransactionCreated,
		ResourceType: "pocket_transaction",
		ResourceID:   audit.StringPtr(result.ID),
		HouseholdID:  audit.StringPtr(pocket.HouseholdID),
		NewValues:    audit.StructToMap(result),
		Success:      true,
	})

	result.CategoryCreated = categoryCreated
	return result, nil
}

// ahorrosGroupName is the well-known name for the auto-created savings category group
const ahorrosGroupName = "Ahorros"
const ahorrosGroupIcon = "💰"

// buildDepositDescription returns the movement description for a pocket deposit.
// If the user provided a description, it appends it; otherwise just "Depósito a <name>".
func buildDepositDescription(pocketName, userDesc string) string {
	if userDesc == "" || userDesc == "Depósito" {
		return fmt.Sprintf("Depósito a %s", pocketName)
	}
	return fmt.Sprintf("Depósito a %s: %s", pocketName, userDesc)
}

// resolvePocketCategory finds or creates the "Ahorros" category group and a category
// matching the pocket name. Returns the category ID and whether the category was just created.
func (s *Service) resolvePocketCategory(ctx context.Context, householdID, pocketName string) (string, bool, error) {
	groupID, err := s.categoryGroupRepo.FindOrCreateByName(ctx, householdID, ahorrosGroupName, ahorrosGroupIcon)
	if err != nil {
		return "", false, fmt.Errorf("finding/creating Ahorros group: %w", err)
	}

	categoryID, created, err := s.categoryRepo.FindOrCreateByName(ctx, householdID, groupID, pocketName)
	if err != nil {
		return "", false, fmt.Errorf("finding/creating category %q: %w", pocketName, err)
	}

	return categoryID, created, nil
}

// Withdraw creates a withdrawal transaction for a pocket
func (s *Service) Withdraw(ctx context.Context, input *WithdrawInput) (*PocketTransaction, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get pocket and verify it's active
	pocket, err := s.repo.GetByID(ctx, input.PocketID)
	if err != nil {
		return nil, err
	}
	if !pocket.IsActive {
		return nil, ErrPocketNotActive
	}

	// Verify destination account belongs to household
	account, err := s.accountsRepo.GetByID(ctx, input.DestinationAccountID)
	if err != nil {
		return nil, fmt.Errorf("getting destination account: %w", err)
	}
	if account.HouseholdID != pocket.HouseholdID {
		return nil, ErrNotAuthorized
	}

	// Begin DB transaction for atomic balance check + withdrawal
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}
	defer func() {
		_ = s.repo.RollbackTx(ctx, tx) // no-op if already committed
	}()

	// Check balance with lock
	balance, err := s.repo.GetBalanceForUpdate(ctx, tx, input.PocketID)
	if err != nil {
		return nil, fmt.Errorf("getting balance for update: %w", err)
	}
	if balance < input.Amount {
		return nil, ErrInsufficientBalance
	}

	// Create pocket transaction within the DB transaction
	ptx := &PocketTransaction{
		PocketID:             input.PocketID,
		HouseholdID:          pocket.HouseholdID,
		Type:                 TransactionTypeWithdrawal,
		Amount:               input.Amount,
		Description:          &input.Description,
		TransactionDate:      input.TransactionDate,
		DestinationAccountID: &input.DestinationAccountID,
		CreatedBy:            input.CreatedBy,
		// No category, no linked movement for withdrawals
	}

	result, err := s.repo.CreateTransactionInTx(ctx, tx, ptx)
	if err != nil {
		return nil, fmt.Errorf("creating withdrawal transaction: %w", err)
	}

	// Commit
	if err := s.repo.CommitTx(ctx, tx); err != nil {
		return nil, fmt.Errorf("committing withdrawal: %w", err)
	}

	// Re-fetch with enriched names
	result, err = s.repo.GetTransactionByID(ctx, result.ID)
	if err != nil {
		return nil, fmt.Errorf("fetching enriched transaction: %w", err)
	}

	// Audit log
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(input.CreatedBy),
		Action:       audit.ActionPocketTransactionCreated,
		ResourceType: "pocket_transaction",
		ResourceID:   audit.StringPtr(result.ID),
		HouseholdID:  audit.StringPtr(pocket.HouseholdID),
		NewValues:    audit.StructToMap(result),
		Success:      true,
	})

	return result, nil
}

// EditTransaction updates an existing pocket transaction
func (s *Service) EditTransaction(ctx context.Context, userID, householdID string, input *EditTransactionInput) (*PocketTransaction, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get existing transaction
	existing, err := s.repo.GetTransactionByID(ctx, input.ID)
	if err != nil {
		return nil, err
	}

	// Get pocket and verify access
	pocket, err := s.repo.GetByID(ctx, existing.PocketID)
	if err != nil {
		return nil, err
	}
	if pocket.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	// Balance check: reject edits that would cause negative balance
	if input.Amount != nil {
		if existing.Type == TransactionTypeWithdrawal && *input.Amount > existing.Amount {
			// Withdrawal increasing: need extra funds
			currentBalance, err := s.repo.GetBalance(ctx, pocket.ID)
			if err != nil {
				return nil, fmt.Errorf("getting pocket balance: %w", err)
			}
			extraNeeded := *input.Amount - existing.Amount
			if currentBalance < extraNeeded {
				return nil, ErrInsufficientBalance
			}
		} else if existing.Type == TransactionTypeDeposit && *input.Amount < existing.Amount {
			// Deposit decreasing: check resulting balance stays ≥ 0
			currentBalance, err := s.repo.GetBalance(ctx, pocket.ID)
			if err != nil {
				return nil, fmt.Errorf("getting pocket balance: %w", err)
			}
			reduction := existing.Amount - *input.Amount
			if currentBalance < reduction {
				return nil, ErrInsufficientBalance
			}
		}
	}

	// Update the transaction
	updated, err := s.repo.UpdateTransaction(ctx, input.ID, input)
	if err != nil {
		return nil, fmt.Errorf("updating pocket transaction: %w", err)
	}

	// If deposit with linked movement, propagate changes
	if existing.Type == TransactionTypeDeposit && existing.LinkedMovementID != nil {
		movUpdate := &movements.UpdateMovementInput{}
		hasChanges := false

		if input.Amount != nil {
			movUpdate.Amount = input.Amount
			hasChanges = true
		}
		if input.TransactionDate != nil {
			movUpdate.MovementDate = input.TransactionDate
			hasChanges = true
		}
		if input.Description != nil {
			newDesc := buildDepositDescription(pocket.Name, *input.Description)
			movUpdate.Description = &newDesc
			hasChanges = true
		}

		if hasChanges {
			_, err := s.movementsRepo.Update(ctx, *existing.LinkedMovementID, movUpdate)
			if err != nil {
				s.logger.Error("failed to propagate pocket transaction edit to linked movement",
					"transaction_id", input.ID,
					"movement_id", *existing.LinkedMovementID,
					"error", err,
				)
				// Don't fail the whole operation — the pocket transaction is already updated
			}
		}
	}

	// Audit log
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionPocketTransactionUpdated,
		ResourceType: "pocket_transaction",
		ResourceID:   audit.StringPtr(updated.ID),
		HouseholdID:  audit.StringPtr(householdID),
		OldValues:    audit.StructToMap(existing),
		NewValues:    audit.StructToMap(updated),
		Success:      true,
	})

	return updated, nil
}

// DeleteTransaction deletes a pocket transaction
func (s *Service) DeleteTransaction(ctx context.Context, transactionID, userID, householdID string) error {
	// Get existing transaction
	existing, err := s.repo.GetTransactionByID(ctx, transactionID)
	if err != nil {
		return err
	}

	// Get pocket and verify access
	pocket, err := s.repo.GetByID(ctx, existing.PocketID)
	if err != nil {
		return err
	}
	if pocket.HouseholdID != householdID {
		return ErrNotAuthorized
	}

	// If deposit, check deleting won't cause overdraft
	if existing.Type == TransactionTypeDeposit {
		currentBalance, err := s.repo.GetBalance(ctx, pocket.ID)
		if err != nil {
			return fmt.Errorf("getting pocket balance: %w", err)
		}
		if currentBalance-existing.Amount < 0 {
			return ErrDeleteWouldOverdraft
		}
	}

	// If linked movement exists, delete it first
	if existing.LinkedMovementID != nil {
		if err := s.movementsRepo.Delete(ctx, *existing.LinkedMovementID); err != nil {
			s.logger.Error("failed to delete linked movement",
				"transaction_id", transactionID,
				"movement_id", *existing.LinkedMovementID,
				"error", err,
			)
			return fmt.Errorf("deleting linked movement: %w", err)
		}

		// Audit log for movement deletion
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(userID),
			Action:       audit.ActionMovementDeleted,
			ResourceType: "movement",
			ResourceID:   existing.LinkedMovementID,
			HouseholdID:  audit.StringPtr(householdID),
			Success:      true,
		})
	}

	// Delete the pocket transaction
	if err := s.repo.DeleteTransaction(ctx, transactionID); err != nil {
		return fmt.Errorf("deleting pocket transaction: %w", err)
	}

	// Audit log
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionPocketTransactionDeleted,
		ResourceType: "pocket_transaction",
		ResourceID:   audit.StringPtr(transactionID),
		HouseholdID:  audit.StringPtr(householdID),
		OldValues:    audit.StructToMap(existing),
		Success:      true,
	})

	return nil
}

// DeleteTransactionByMovementID deletes a pocket transaction linked to a movement.
// Called when a linked movement is deleted from the Gastos tab.
func (s *Service) DeleteTransactionByMovementID(ctx context.Context, movementID, householdID string) error {
	// Find the pocket transaction linked to this movement
	ptx, err := s.repo.GetTransactionByLinkedMovementID(ctx, movementID)
	if err != nil {
		return fmt.Errorf("finding pocket transaction by movement ID: %w", err)
	}
	if ptx == nil {
		// No linked transaction — nothing to do
		return nil
	}

	// Get pocket and verify household
	pocket, err := s.repo.GetByID(ctx, ptx.PocketID)
	if err != nil {
		return fmt.Errorf("getting pocket: %w", err)
	}
	if pocket.HouseholdID != householdID {
		return ErrNotAuthorized
	}

	// Check deleting deposit won't cause overdraft
	if ptx.Type == TransactionTypeDeposit {
		currentBalance, err := s.repo.GetBalance(ctx, pocket.ID)
		if err != nil {
			return fmt.Errorf("getting pocket balance: %w", err)
		}
		if currentBalance-ptx.Amount < 0 {
			return ErrDeleteWouldOverdraft
		}
	}

	// Delete the pocket transaction
	if err := s.repo.DeleteTransaction(ctx, ptx.ID); err != nil {
		return fmt.Errorf("deleting pocket transaction: %w", err)
	}

	// Audit log
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(ptx.CreatedBy),
		Action:       audit.ActionPocketTransactionDeleted,
		ResourceType: "pocket_transaction",
		ResourceID:   audit.StringPtr(ptx.ID),
		HouseholdID:  audit.StringPtr(householdID),
		OldValues:    audit.StructToMap(ptx),
		Success:      true,
	})

	return nil
}

// ListTransactions lists all transactions for a pocket
func (s *Service) ListTransactions(ctx context.Context, pocketID, householdID string) ([]*PocketTransaction, error) {
	// Get pocket and verify household access
	pocket, err := s.repo.GetByID(ctx, pocketID)
	if err != nil {
		return nil, err
	}
	if pocket.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	return s.repo.ListTransactions(ctx, pocketID)
}
