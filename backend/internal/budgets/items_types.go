package budgets

import (
	"context"
	"time"

	"github.com/blanquicet/conti/backend/internal/movements"
)

// BudgetScope defines temporal scope for budget/item operations
type BudgetScope string

const (
	ScopeThis   BudgetScope = "THIS"   // Only this month
	ScopeFuture BudgetScope = "FUTURE" // This month + all future months
	ScopeAll    BudgetScope = "ALL"    // All months (past + future)
)

// MonthlyBudgetItem represents one budgeted expense for a specific month
type MonthlyBudgetItem struct {
	ID          string    `json:"id"`
	HouseholdID string    `json:"household_id"`
	CategoryID  string    `json:"category_id"`
	Month       time.Time `json:"month"`

	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Amount      float64 `json:"amount"`
	Currency    string  `json:"currency"`

	MovementType *movements.MovementType `json:"movement_type,omitempty"`
	AutoGenerate bool                    `json:"auto_generate"`

	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	PayerName      *string `json:"payer_name,omitempty"`

	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	CounterpartyName      *string `json:"counterparty_name,omitempty"`

	PaymentMethodID   *string `json:"payment_method_id,omitempty"`
	PaymentMethodName *string `json:"payment_method_name,omitempty"`

	ReceiverAccountID   *string `json:"receiver_account_id,omitempty"`
	ReceiverAccountName *string `json:"receiver_account_name,omitempty"`

	SourceTemplateID *string `json:"source_template_id,omitempty"`

	// Participants (for SPLIT)
	Participants []BudgetItemParticipant `json:"participants,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Computed: has a movement been registered for this item this month?
	UsedThisMonth bool `json:"used_this_month,omitempty"`
}

// BudgetItemParticipant represents a participant in a SPLIT budget item
type BudgetItemParticipant struct {
	ID                   string  `json:"id"`
	BudgetItemID         string  `json:"budget_item_id"`
	ParticipantUserID    *string `json:"participant_user_id,omitempty"`
	ParticipantContactID *string `json:"participant_contact_id,omitempty"`
	ParticipantName      *string `json:"participant_name,omitempty"`
	Percentage           float64 `json:"percentage"`
}

// CreateBudgetItemInput represents input for creating a budget item
type CreateBudgetItemInput struct {
	CategoryID  string  `json:"category_id"`
	Month       string  `json:"month"` // YYYY-MM
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Amount      float64 `json:"amount"`

	MovementType *movements.MovementType `json:"movement_type,omitempty"`
	AutoGenerate bool                    `json:"auto_generate"`

	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`

	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`

	PaymentMethodID   *string `json:"payment_method_id,omitempty"`
	ReceiverAccountID *string `json:"receiver_account_id,omitempty"`

	SourceTemplateID *string `json:"source_template_id,omitempty"`

	Participants []BudgetItemParticipantInput `json:"participants,omitempty"`
}

// BudgetItemParticipantInput represents input for a budget item participant
type BudgetItemParticipantInput struct {
	ParticipantUserID    *string `json:"participant_user_id,omitempty"`
	ParticipantContactID *string `json:"participant_contact_id,omitempty"`
	Percentage           float64 `json:"percentage"`
}

// UpdateBudgetItemInput represents input for updating a budget item
type UpdateBudgetItemInput struct {
	Name        *string  `json:"name,omitempty"`
	Description *string  `json:"description,omitempty"`
	Amount      *float64 `json:"amount,omitempty"`

	MovementType *movements.MovementType `json:"movement_type,omitempty"`
	AutoGenerate *bool                   `json:"auto_generate,omitempty"`

	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	ClearPayer     bool    `json:"-"`

	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	ClearCounterparty     bool    `json:"-"`

	PaymentMethodID   *string `json:"payment_method_id,omitempty"`
	ReceiverAccountID *string `json:"receiver_account_id,omitempty"`
	ClearReceiverAccount bool `json:"-"`

	Participants []BudgetItemParticipantInput `json:"participants,omitempty"`
}

// BudgetItemsRepository defines data access for monthly budget items
type BudgetItemsRepository interface {
	// ListByMonth returns all budget items for a household in a specific month
	ListByMonth(ctx context.Context, householdID, month string) ([]*MonthlyBudgetItem, error)

	// GetByID returns a single budget item
	GetByID(ctx context.Context, id string) (*MonthlyBudgetItem, error)

	// Create creates a new budget item
	Create(ctx context.Context, householdID string, input *CreateBudgetItemInput) (*MonthlyBudgetItem, error)

	// Update updates a budget item
	Update(ctx context.Context, id string, input *UpdateBudgetItemInput) (*MonthlyBudgetItem, error)

	// Delete deletes a budget item
	Delete(ctx context.Context, id string) error

	// HasItemsForMonth checks if any items exist for a given month
	HasItemsForMonth(ctx context.Context, householdID, month string) (bool, error)

	// CopyItemsToMonth copies all items from one month to another
	CopyItemsToMonth(ctx context.Context, householdID, fromMonth, toMonth string) (int, error)

	// DeleteItemsForMonth deletes all items for a month
	DeleteItemsForMonth(ctx context.Context, householdID, month string) (int64, error)

	// DeleteFutureItems deletes all items after a given month
	DeleteFutureItems(ctx context.Context, householdID, afterMonth string) (int64, error)

	// UpdateAllMonths updates the same-named item across all months
	UpdateAllMonths(ctx context.Context, householdID, categoryID, name string, input *UpdateBudgetItemInput) (int64, error)

	// GetMostRecentMonth returns the most recent month that has items
	GetMostRecentMonth(ctx context.Context, householdID string, beforeMonth string) (string, error)
}
