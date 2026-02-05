package income

import (
	"context"
	"errors"
	"time"
)

// Errors for income operations
var (
	ErrIncomeNotFound       = errors.New("income not found")
	ErrNotAuthorized        = errors.New("not authorized")
	ErrInvalidIncomeType    = errors.New("invalid income type")
	ErrInvalidAccountType   = errors.New("account cannot receive income")
	ErrMemberNotInHousehold = errors.New("member does not belong to household")
	ErrInvalidAmount        = errors.New("amount must be positive")
)

// IncomeType represents the type of income
type IncomeType string

// Real Income - increases net worth
const (
	TypeSalary        IncomeType = "salary"         // Sueldo mensual
	TypeBonus         IncomeType = "bonus"          // Bono, prima, aguinaldo
	TypeFreelance     IncomeType = "freelance"      // Trabajo independiente
	TypeReimbursement IncomeType = "reimbursement"  // Reembolso de gastos
	TypeGift          IncomeType = "gift"           // Regalo en dinero
	TypeSale          IncomeType = "sale"           // Venta de algo (carro, mueble)
	TypeOtherIncome   IncomeType = "other_income"   // Otros ingresos reales
)

// Internal Movements - doesn't increase net worth
const (
	TypeSavingsWithdrawal IncomeType = "savings_withdrawal" // Retiro de ahorros previos
	TypePreviousBalance   IncomeType = "previous_balance"   // Sobrante del mes anterior
	TypeDebtCollection    IncomeType = "debt_collection"    // Cobro de deuda
	TypeAccountTransfer   IncomeType = "account_transfer"   // Transferencia entre cuentas
	TypeAdjustment        IncomeType = "adjustment"         // Ajuste contable
)

// Validate checks if the income type is valid
func (t IncomeType) Validate() error {
	switch t {
	case TypeSalary, TypeBonus, TypeFreelance, TypeReimbursement, TypeGift, TypeSale, TypeOtherIncome,
		TypeSavingsWithdrawal, TypePreviousBalance, TypeDebtCollection, TypeAccountTransfer, TypeAdjustment:
		return nil
	default:
		return ErrInvalidIncomeType
	}
}

// IsRealIncome returns true if this income type represents real income
func (t IncomeType) IsRealIncome() bool {
	switch t {
	case TypeSalary, TypeBonus, TypeFreelance, TypeReimbursement, TypeGift, TypeSale, TypeOtherIncome:
		return true
	default:
		return false
	}
}

// Income represents an income entry
type Income struct {
	ID          string     `json:"id"`
	HouseholdID string     `json:"household_id"`
	MemberID    string     `json:"member_id"`
	MemberName  string     `json:"member_name"`
	AccountID   string     `json:"account_id"`
	AccountName string     `json:"account_name"`
	Type        IncomeType `json:"type"`
	Amount      float64    `json:"amount"`
	Description string     `json:"description"`
	IncomeDate  time.Time  `json:"income_date"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// CreateIncomeInput represents the input for creating an income entry
type CreateIncomeInput struct {
	MemberID    string     `json:"member_id"`
	AccountID   string     `json:"account_id"`
	Type        IncomeType `json:"type"`
	Amount      float64    `json:"amount"`
	Description string     `json:"description"`
	IncomeDate  time.Time  `json:"income_date"`
}

// Validate validates the create income input
func (i *CreateIncomeInput) Validate() error {
	if i.MemberID == "" {
		return errors.New("member_id is required")
	}
	if i.AccountID == "" {
		return errors.New("account_id is required")
	}
	if err := i.Type.Validate(); err != nil {
		return err
	}
	if i.Amount <= 0 {
		return ErrInvalidAmount
	}
	if i.Description == "" {
		return errors.New("description is required")
	}
	if i.IncomeDate.IsZero() {
		return errors.New("income_date is required")
	}
	return nil
}

// UpdateIncomeInput represents the input for updating an income entry
type UpdateIncomeInput struct {
	AccountID   *string     `json:"account_id,omitempty"`
	Type        *IncomeType `json:"type,omitempty"`
	Amount      *float64    `json:"amount,omitempty"`
	Description *string     `json:"description,omitempty"`
	IncomeDate  *time.Time  `json:"income_date,omitempty"`
}

// Validate validates the update income input
func (i *UpdateIncomeInput) Validate() error {
	if i.Type != nil {
		if err := i.Type.Validate(); err != nil {
			return err
		}
	}
	if i.Amount != nil && *i.Amount <= 0 {
		return ErrInvalidAmount
	}
	if i.Description != nil && *i.Description == "" {
		return errors.New("description cannot be empty")
	}
	return nil
}

// ListIncomeFilters represents filters for listing income
type ListIncomeFilters struct {
	MemberID  *string
	AccountID *string
	Month     *string // YYYY-MM format
	StartDate *time.Time
	EndDate   *time.Time
}

// IncomeTotals represents totals for income entries
type IncomeTotals struct {
	TotalAmount             float64                   `json:"total_amount"`
	RealIncomeAmount        float64                   `json:"real_income_amount"`
	InternalMovementsAmount float64                   `json:"internal_movements_amount"`
	ByMember                map[string]*MemberTotals  `json:"by_member"`
	ByAccount               map[string]float64        `json:"by_account"`
	ByType                  map[IncomeType]float64    `json:"by_type"`
}

// MemberTotals represents totals for a specific member
type MemberTotals struct {
	Total              float64 `json:"total"`
	RealIncome         float64 `json:"real_income"`
	InternalMovements  float64 `json:"internal_movements"`
}

// ListIncomeResponse represents the response for listing income
type ListIncomeResponse struct {
	IncomeEntries []*Income       `json:"income_entries"`
	Totals        *IncomeTotals   `json:"totals"`
}

// Repository defines the interface for income data access
type Repository interface {
	Create(ctx context.Context, input *CreateIncomeInput, householdID string) (*Income, error)
	GetByID(ctx context.Context, id string) (*Income, error)
	ListByHousehold(ctx context.Context, householdID string, filters *ListIncomeFilters) ([]*Income, error)
	GetTotals(ctx context.Context, householdID string, filters *ListIncomeFilters) (*IncomeTotals, error)
	Update(ctx context.Context, id string, input *UpdateIncomeInput) (*Income, error)
	Delete(ctx context.Context, id string) error
	CountByAccount(ctx context.Context, accountID string) (int, error)
}

// Service defines the interface for income business logic
type Service interface {
	Create(ctx context.Context, userID string, input *CreateIncomeInput) (*Income, error)
	GetByID(ctx context.Context, userID, id string) (*Income, error)
	ListByHousehold(ctx context.Context, userID string, filters *ListIncomeFilters) (*ListIncomeResponse, error)
	Update(ctx context.Context, userID, id string, input *UpdateIncomeInput) (*Income, error)
	Delete(ctx context.Context, userID, id string) error
}
