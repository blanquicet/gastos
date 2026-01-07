package movements

import (
	"context"
	"errors"
	"time"
)

// Errors for movement operations
var (
	ErrMovementNotFound       = errors.New("movement not found")
	ErrNotAuthorized          = errors.New("not authorized")
	ErrInvalidMovementType    = errors.New("invalid movement type")
	ErrInvalidAmount          = errors.New("amount must be positive")
	ErrPayerRequired          = errors.New("exactly one payer (user or contact) is required")
	ErrCounterpartyRequired   = errors.New("counterparty is required for DEBT_PAYMENT")
	ErrCounterpartyNotAllowed = errors.New("counterparty not allowed for this movement type")
	ErrParticipantsRequired   = errors.New("participants are required for SPLIT movements")
	ErrParticipantsNotAllowed = errors.New("participants not allowed for this movement type")
	ErrInvalidPercentageSum   = errors.New("participant percentages must sum to 100%")
	ErrCategoryRequired       = errors.New("category is required for this movement type")
	ErrPaymentMethodRequired  = errors.New("payment method is required")
	ErrN8NUnavailable         = errors.New("n8n service unavailable - movement saved to database but not synced to Google Sheets. Please contact administrator")
)

// MovementType represents the type of movement
type MovementType string

const (
	TypeHousehold   MovementType = "HOUSEHOLD"    // Household expense
	TypeSplit       MovementType = "SPLIT"        // Shared/split expense with participants
	TypeDebtPayment MovementType = "DEBT_PAYMENT" // Debt payment/settlement
)

// Validate checks if the movement type is valid
func (t MovementType) Validate() error {
	switch t {
	case TypeHousehold, TypeSplit, TypeDebtPayment:
		return nil
	default:
		return ErrInvalidMovementType
	}
}

// Movement represents a financial movement/expense
type Movement struct {
	ID            string       `json:"id"`
	HouseholdID   string       `json:"household_id"`
	Type          MovementType `json:"type"`
	Description   string       `json:"description"`
	Amount        float64      `json:"amount"`
	Category      *string      `json:"category,omitempty"`
	MovementDate  time.Time    `json:"movement_date"`
	Currency      string       `json:"currency"`
	
	// Payer (exactly one)
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	PayerName      string  `json:"payer_name"` // Populated from join
	
	// Counterparty (only for DEBT_PAYMENT)
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	CounterpartyName      *string `json:"counterparty_name,omitempty"` // Populated from join
	
	// Payment method
	PaymentMethodID   *string `json:"payment_method_id,omitempty"`
	PaymentMethodName *string `json:"payment_method_name,omitempty"` // Populated from join
	
	// Participants (only for SPLIT)
	Participants []Participant `json:"participants,omitempty"`
	
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Participant represents a participant in a shared expense
type Participant struct {
	ID                   string    `json:"id"`
	MovementID           string    `json:"movement_id"`
	ParticipantUserID    *string   `json:"participant_user_id,omitempty"`
	ParticipantContactID *string   `json:"participant_contact_id,omitempty"`
	ParticipantName      string    `json:"participant_name"` // Populated from join
	Percentage           float64   `json:"percentage"` // 0.0 to 1.0
	CreatedAt            time.Time `json:"created_at"`
}

// CreateMovementInput represents input for creating a movement
type CreateMovementInput struct {
	Type         MovementType `json:"type"`
	Description  string       `json:"description"`
	Amount       float64      `json:"amount"`
	Category     *string      `json:"category,omitempty"`
	MovementDate time.Time    `json:"movement_date"`
	
	// Payer (exactly one required)
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	
	// Counterparty (required only for DEBT_PAYMENT)
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	
	// Payment method (required for HOUSEHOLD, conditional for others)
	PaymentMethodID *string `json:"payment_method_id,omitempty"`
	
	// Participants (required only for SPLIT)
	Participants []ParticipantInput `json:"participants,omitempty"`
}

// ParticipantInput represents input for a participant
type ParticipantInput struct {
	ParticipantUserID    *string `json:"participant_user_id,omitempty"`
	ParticipantContactID *string `json:"participant_contact_id,omitempty"`
	Percentage           float64 `json:"percentage"` // 0.0 to 1.0
}

// Validate validates the create movement input
func (i *CreateMovementInput) Validate() error {
	// Validate type
	if err := i.Type.Validate(); err != nil {
		return err
	}
	
	// Validate description
	if i.Description == "" {
		return errors.New("description is required")
	}
	
	// Validate amount
	if i.Amount <= 0 {
		return ErrInvalidAmount
	}
	
	// Validate movement date
	if i.MovementDate.IsZero() {
		return errors.New("movement_date is required")
	}
	
	// Validate payer (exactly one)
	hasPayerUser := i.PayerUserID != nil && *i.PayerUserID != ""
	hasPayerContact := i.PayerContactID != nil && *i.PayerContactID != ""
	if !hasPayerUser && !hasPayerContact {
		return ErrPayerRequired
	}
	if hasPayerUser && hasPayerContact {
		return errors.New("cannot specify both payer_user_id and payer_contact_id")
	}
	
	// Type-specific validations
	switch i.Type {
	case TypeHousehold:
		// Category required
		if i.Category == nil || *i.Category == "" {
			return ErrCategoryRequired
		}
		// Payment method required
		if i.PaymentMethodID == nil || *i.PaymentMethodID == "" {
			return ErrPaymentMethodRequired
		}
		// No counterparty allowed
		if i.CounterpartyUserID != nil || i.CounterpartyContactID != nil {
			return ErrCounterpartyNotAllowed
		}
		// No participants allowed
		if len(i.Participants) > 0 {
			return ErrParticipantsNotAllowed
		}
		
	case TypeSplit:
		// Participants required
		if len(i.Participants) == 0 {
			return ErrParticipantsRequired
		}
		// Validate participants
		totalPercentage := 0.0
		for _, p := range i.Participants {
			// Exactly one participant identifier
			hasUser := p.ParticipantUserID != nil && *p.ParticipantUserID != ""
			hasContact := p.ParticipantContactID != nil && *p.ParticipantContactID != ""
			if !hasUser && !hasContact {
				return errors.New("participant must have either user_id or contact_id")
			}
			if hasUser && hasContact {
				return errors.New("participant cannot have both user_id and contact_id")
			}
			// Validate percentage
			if p.Percentage <= 0 || p.Percentage > 1 {
				return errors.New("participant percentage must be between 0 and 1")
			}
			totalPercentage += p.Percentage
		}
		// Check percentage sum (allow small floating point error)
		if totalPercentage < 0.9999 || totalPercentage > 1.0001 {
			return ErrInvalidPercentageSum
		}
		// No counterparty allowed
		if i.CounterpartyUserID != nil || i.CounterpartyContactID != nil {
			return ErrCounterpartyNotAllowed
		}
		
	case TypeDebtPayment:
		// Counterparty required (exactly one)
		hasCounterpartyUser := i.CounterpartyUserID != nil && *i.CounterpartyUserID != ""
		hasCounterpartyContact := i.CounterpartyContactID != nil && *i.CounterpartyContactID != ""
		if !hasCounterpartyUser && !hasCounterpartyContact {
			return ErrCounterpartyRequired
		}
		if hasCounterpartyUser && hasCounterpartyContact {
			return errors.New("cannot specify both counterparty_user_id and counterparty_contact_id")
		}
		// Category required if payer is household member
		if hasPayerUser && (i.Category == nil || *i.Category == "") {
			return ErrCategoryRequired
		}
		// No participants allowed
		if len(i.Participants) > 0 {
			return ErrParticipantsNotAllowed
		}
	}
	
	return nil
}

// UpdateMovementInput represents input for updating a movement
type UpdateMovementInput struct {
	Description  *string    `json:"description,omitempty"`
	Amount       *float64   `json:"amount,omitempty"`
	Category     *string    `json:"category,omitempty"`
	MovementDate *time.Time `json:"movement_date,omitempty"`
	// Note: Cannot update type, payer, counterparty, or payment method after creation
	// Participants can be updated separately
}

// Validate validates the update movement input
func (i *UpdateMovementInput) Validate() error {
	if i.Amount != nil && *i.Amount <= 0 {
		return ErrInvalidAmount
	}
	if i.Description != nil && *i.Description == "" {
		return errors.New("description cannot be empty")
	}
	return nil
}

// ListMovementsFilters represents filters for listing movements
type ListMovementsFilters struct {
	Type      *MovementType
	Month     *string    // YYYY-MM format
	StartDate *time.Time
	EndDate   *time.Time
	MemberID  *string // Filter by payer (user only)
}

// MovementTotals represents totals for movements
type MovementTotals struct {
	TotalAmount        float64                   `json:"total_amount"`
	ByType             map[MovementType]float64  `json:"by_type"`
	ByCategory         map[string]float64        `json:"by_category"`
	ByPaymentMethod    map[string]float64        `json:"by_payment_method"`
}

// DebtBalance represents who owes whom and how much
type DebtBalance struct {
	DebtorID   string  `json:"debtor_id"`   // ID of person who owes
	DebtorName string  `json:"debtor_name"` // Name of person who owes
	CreditorID string  `json:"creditor_id"` // ID of person who is owed
	CreditorName string `json:"creditor_name"` // Name of person who is owed
	Amount     float64 `json:"amount"`      // Amount owed
	Currency   string  `json:"currency"`
}

// DebtConsolidationResponse represents consolidated debts for a household
type DebtConsolidationResponse struct {
	Balances []DebtBalance `json:"balances"` // List of who owes whom
	Month    *string       `json:"month,omitempty"` // Optional month filter
}

// ListMovementsResponse represents the response for listing movements
type ListMovementsResponse struct {
	Movements []*Movement     `json:"movements"`
	Totals    *MovementTotals `json:"totals"`
}

// Repository defines the interface for movement data access
type Repository interface {
	Create(ctx context.Context, input *CreateMovementInput, householdID string) (*Movement, error)
	GetByID(ctx context.Context, id string) (*Movement, error)
	ListByHousehold(ctx context.Context, householdID string, filters *ListMovementsFilters) ([]*Movement, error)
	GetTotals(ctx context.Context, householdID string, filters *ListMovementsFilters) (*MovementTotals, error)
	Update(ctx context.Context, id string, input *UpdateMovementInput) (*Movement, error)
	Delete(ctx context.Context, id string) error
}

// Service defines the interface for movement business logic
type Service interface {
	Create(ctx context.Context, userID string, input *CreateMovementInput) (*Movement, error)
	GetByID(ctx context.Context, userID, id string) (*Movement, error)
	ListByHousehold(ctx context.Context, userID string, filters *ListMovementsFilters) (*ListMovementsResponse, error)
	GetDebtConsolidation(ctx context.Context, userID string, month *string) (*DebtConsolidationResponse, error)
	Update(ctx context.Context, userID, id string, input *UpdateMovementInput) (*Movement, error)
	Delete(ctx context.Context, userID, id string) error
}
