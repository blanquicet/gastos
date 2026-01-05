package accounts

import (
	"context"
	"errors"
	"time"
)

// Errors for account operations
var (
	ErrAccountNotFound    = errors.New("account not found")
	ErrAccountNameExists  = errors.New("account name already exists in household")
	ErrNotAuthorized      = errors.New("not authorized")
	ErrInvalidAccountType = errors.New("invalid account type")
	ErrAccountHasIncome   = errors.New("cannot delete account with income entries")
	ErrAccountHasLinkedPaymentMethods = errors.New("cannot delete account with linked payment methods")
)

// AccountType represents the type of account
type AccountType string

const (
	TypeSavings  AccountType = "savings"
	TypeCash     AccountType = "cash"
	TypeChecking AccountType = "checking"
)

// Validate checks if the account type is valid
func (t AccountType) Validate() error {
	switch t {
	case TypeSavings, TypeCash, TypeChecking:
		return nil
	default:
		return ErrInvalidAccountType
	}
}

// CanReceiveIncome returns true if this account type can receive income
func (t AccountType) CanReceiveIncome() bool {
	return t == TypeSavings || t == TypeCash
}

// Account represents a bank account or cash reserve
type Account struct {
	ID             string       `json:"id"`
	HouseholdID    string       `json:"household_id"`
	Name           string       `json:"name"`
	Type           AccountType  `json:"type"`
	Institution    *string      `json:"institution,omitempty"`
	Last4          *string      `json:"last4,omitempty"`
	InitialBalance float64      `json:"initial_balance"`
	Notes          *string      `json:"notes,omitempty"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	
	// Calculated fields (not in DB)
	CurrentBalance *float64     `json:"current_balance,omitempty"`
	IncomeTotal    *float64     `json:"income_total,omitempty"`
	ExpenseTotal   *float64     `json:"expense_total,omitempty"`
}

// Validate validates account fields
func (a *Account) Validate() error {
	if a.Name == "" {
		return errors.New("account name is required")
	}
	if len(a.Name) > 100 {
		return errors.New("account name must be 100 characters or less")
	}
	if err := a.Type.Validate(); err != nil {
		return err
	}
	if a.Last4 != nil && len(*a.Last4) != 4 {
		return errors.New("last4 must be exactly 4 characters")
	}
	if a.Institution != nil && len(*a.Institution) > 100 {
		return errors.New("institution must be 100 characters or less")
	}
	return nil
}

// Repository defines the interface for account persistence
type Repository interface {
	Create(ctx context.Context, account *Account) (*Account, error)
	GetByID(ctx context.Context, id string) (*Account, error)
	Update(ctx context.Context, account *Account) (*Account, error)
	Delete(ctx context.Context, id string) error
	ListByHousehold(ctx context.Context, householdID string) ([]*Account, error)
	FindByName(ctx context.Context, householdID, name string) (*Account, error)
	GetBalance(ctx context.Context, id string) (float64, error)
}
