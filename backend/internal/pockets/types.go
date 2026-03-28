package pockets

import (
	"context"
	"errors"
	"strings"
	"time"
)

// Errors
var (
	ErrPocketNotFound      = errors.New("pocket not found")
	ErrPocketNameExists    = errors.New("pocket name already exists in household")
	ErrPocketNotActive     = errors.New("pocket is not active")
	ErrNotAuthorized       = errors.New("not authorized")
	ErrInsufficientBalance = errors.New("insufficient pocket balance")
	ErrMaxPocketsReached   = errors.New("maximum number of pockets reached (20)")
	ErrPocketHasBalance    = errors.New("pocket has remaining balance")
	ErrTransactionNotFound = errors.New("pocket transaction not found")
	ErrDeleteWouldOverdraft = errors.New("deleting this deposit would cause negative balance")
)

// PocketTransactionType represents the type of pocket transaction
type PocketTransactionType string

const (
	TransactionTypeDeposit    PocketTransactionType = "DEPOSIT"
	TransactionTypeWithdrawal PocketTransactionType = "WITHDRAWAL"
)

// Pocket represents a savings pocket
type Pocket struct {
	ID          string    `json:"id"`
	HouseholdID string    `json:"household_id"`
	OwnerID     string    `json:"owner_id"`
	OwnerName   string    `json:"owner_name,omitempty"`
	Name        string    `json:"name"`
	Icon        string    `json:"icon"`
	GoalAmount  *float64  `json:"goal_amount,omitempty"`
	Note        *string   `json:"note,omitempty"`
	CategoryID  *string   `json:"category_id,omitempty"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// Calculated fields
	Balance *float64 `json:"balance,omitempty"`
}

// PocketTransaction represents a deposit or withdrawal
type PocketTransaction struct {
	ID                   string                `json:"id"`
	PocketID             string                `json:"pocket_id"`
	HouseholdID          string                `json:"household_id"`
	Type                 PocketTransactionType `json:"type"`
	Amount               float64               `json:"amount"`
	Description          *string               `json:"description,omitempty"`
	TransactionDate      time.Time             `json:"transaction_date"`
	SourceAccountID      *string               `json:"source_account_id,omitempty"`
	SourceAccountName    *string               `json:"source_account_name,omitempty"`
	DestinationAccountID *string               `json:"destination_account_id,omitempty"`
	DestinationAccountName *string             `json:"destination_account_name,omitempty"`
	LinkedMovementID     *string               `json:"linked_movement_id,omitempty"`
	CreatedBy            string                `json:"created_by"`
	CreatedByName        string                `json:"created_by_name,omitempty"`
	CreatedAt            time.Time             `json:"created_at"`

	// Transient field — only set on deposit response, not persisted
	CategoryCreated bool `json:"category_created,omitempty"`
}

// PocketSummary represents aggregated pocket data for the summary endpoint
type PocketSummary struct {
	TotalBalance float64   `json:"total_balance"`
	TotalGoal    *float64  `json:"total_goal,omitempty"`
	PocketCount  int       `json:"pocket_count"`
	Pockets      []*Pocket `json:"pockets"`
}

// CreatePocketInput contains data for creating a pocket
type CreatePocketInput struct {
	HouseholdID string
	OwnerID     string
	Name        string
	Icon        string
	GoalAmount  *float64
	Note        *string
}

func (i *CreatePocketInput) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if i.Name == "" {
		return errors.New("pocket name is required")
	}
	if len(i.Name) > 100 {
		return errors.New("pocket name must be 100 characters or less")
	}
	if i.HouseholdID == "" {
		return errors.New("household ID is required")
	}
	if i.OwnerID == "" {
		return errors.New("owner ID is required")
	}
	if i.Icon == "" {
		i.Icon = "💰"
	}
	if i.GoalAmount != nil && *i.GoalAmount <= 0 {
		return errors.New("goal amount must be positive")
	}
	return nil
}

// UpdatePocketInput contains data for updating a pocket
type UpdatePocketInput struct {
	ID         string
	Name       *string
	Icon       *string
	GoalAmount *float64
	ClearGoal  bool // Set to true to remove goal_amount
	Note       *string
	ClearNote  bool // Set to true to remove note
}

func (i *UpdatePocketInput) Validate() error {
	if i.ID == "" {
		return errors.New("pocket ID is required")
	}
	if i.Name != nil {
		*i.Name = strings.TrimSpace(*i.Name)
		if *i.Name == "" {
			return errors.New("pocket name cannot be empty")
		}
		if len(*i.Name) > 100 {
			return errors.New("pocket name must be 100 characters or less")
		}
	}
	if i.GoalAmount != nil && *i.GoalAmount <= 0 {
		return errors.New("goal amount must be positive")
	}
	return nil
}

// DepositInput contains data for depositing into a pocket
type DepositInput struct {
	PocketID        string
	Amount          float64
	Description     string
	TransactionDate time.Time
	SourceAccountID string
	CreatedBy       string
}

func (i *DepositInput) Validate() error {
	if i.PocketID == "" {
		return errors.New("pocket ID is required")
	}
	if i.Amount <= 0 {
		return errors.New("amount must be positive")
	}
	if i.SourceAccountID == "" {
		return errors.New("source account is required")
	}
	if i.TransactionDate.IsZero() {
		return errors.New("transaction date is required")
	}
	if i.CreatedBy == "" {
		return errors.New("created_by is required")
	}
	return nil
}

// WithdrawInput contains data for withdrawing from a pocket
type WithdrawInput struct {
	PocketID             string
	Amount               float64
	Description          string
	TransactionDate      time.Time
	DestinationAccountID string
	CreatedBy            string
}

func (i *WithdrawInput) Validate() error {
	if i.PocketID == "" {
		return errors.New("pocket ID is required")
	}
	if i.Amount <= 0 {
		return errors.New("amount must be positive")
	}
	if i.DestinationAccountID == "" {
		return errors.New("destination account is required")
	}
	if i.TransactionDate.IsZero() {
		return errors.New("transaction date is required")
	}
	if i.CreatedBy == "" {
		return errors.New("created_by is required")
	}
	return nil
}

// EditTransactionInput contains data for editing a pocket transaction
type EditTransactionInput struct {
	ID              string
	Amount          *float64
	Description     *string
	TransactionDate *time.Time
	SourceAccountID *string // Only for deposits
	DestinationAccountID *string // Only for withdrawals
}

func (i *EditTransactionInput) Validate() error {
	if i.ID == "" {
		return errors.New("transaction ID is required")
	}
	if i.Amount != nil && *i.Amount <= 0 {
		return errors.New("amount must be positive")
	}
	return nil
}

// Repository defines the interface for pocket data access
type Repository interface {
	// Pockets
	Create(ctx context.Context, pocket *Pocket) (*Pocket, error)
	GetByID(ctx context.Context, id string) (*Pocket, error)
	Update(ctx context.Context, pocket *Pocket) (*Pocket, error)
	Deactivate(ctx context.Context, id string) error
	ListByHousehold(ctx context.Context, householdID string) ([]*Pocket, error)
	ListActiveByHousehold(ctx context.Context, householdID string) ([]*Pocket, error)
	CountByHousehold(ctx context.Context, householdID string) (int, error)
	FindByName(ctx context.Context, householdID, name string) (*Pocket, error)
	GetBalance(ctx context.Context, id string) (float64, error)
	GetBalanceForUpdate(ctx context.Context, tx any, id string) (float64, error)

	// Transactions
	CreateTransaction(ctx context.Context, tx *PocketTransaction) (*PocketTransaction, error)
	GetTransactionByID(ctx context.Context, id string) (*PocketTransaction, error)
	UpdateTransaction(ctx context.Context, id string, input *EditTransactionInput) (*PocketTransaction, error)
	DeleteTransaction(ctx context.Context, id string) error
	ListTransactions(ctx context.Context, pocketID string) ([]*PocketTransaction, error)
	GetTransactionByLinkedMovementID(ctx context.Context, movementID string) (*PocketTransaction, error)

	// DB transaction support
	BeginTx(ctx context.Context) (any, error)
	CommitTx(ctx context.Context, tx any) error
	RollbackTx(ctx context.Context, tx any) error
	CreateTransactionInTx(ctx context.Context, tx any, ptx *PocketTransaction) (*PocketTransaction, error)
}

// CategoryGroupRepo is the interface for category group operations needed by pockets
type CategoryGroupRepo interface {
	FindOrCreateByName(ctx context.Context, householdID, name, icon string) (groupID string, err error)
}

// CategoryRepo is the interface for category operations needed by pockets
type CategoryRepo interface {
	FindOrCreateByName(ctx context.Context, householdID, groupID, name string) (categoryID string, created bool, err error)
	RenameByGroupAndName(ctx context.Context, householdID, groupID, oldName, newName string) error
}
