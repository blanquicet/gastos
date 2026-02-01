package recurringmovements

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/blanquicet/gastos/backend/internal/movements"
)

// Errors for recurring movement operations
var (
	ErrTemplateNotFound         = errors.New("recurring movement template not found")
	ErrNotAuthorized            = errors.New("not authorized")
	ErrInvalidRecurrencePattern = errors.New("invalid recurrence pattern")
	ErrInvalidDayOfMonth        = errors.New("day_of_month must be between 1 and 31")
	ErrInvalidDayOfYear         = errors.New("day_of_year must be between 1 and 365")
	ErrAmountRequired           = errors.New("amount is required and must be greater than 0")
	ErrRecurrenceRequired       = errors.New("recurrence_pattern and start_date required when auto_generate is true")
	ErrInvalidParticipants      = errors.New("participants required for SPLIT templates")
	ErrInvalidPercentageSum     = errors.New("participant percentages must sum to 100%")
)

// NullableDate represents a date that can be parsed from multiple formats
type NullableDate struct {
	time.Time
	Valid bool
}

// UnmarshalJSON implements json.Unmarshaler for NullableDate
func (d *NullableDate) UnmarshalJSON(data []byte) error {
	// Remove quotes
	s := strings.Trim(string(data), "\"")
	if s == "null" || s == "" {
		d.Valid = false
		return nil
	}
	
	// Try to parse as date only (YYYY-MM-DD)
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		// Try to parse as RFC3339 timestamp
		t, err = time.Parse(time.RFC3339, s)
		if err != nil {
			return err
		}
	}
	
	d.Time = t
	d.Valid = true
	return nil
}

// MarshalJSON implements json.Marshaler for NullableDate
func (d NullableDate) MarshalJSON() ([]byte, error) {
	if !d.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(d.Format("2006-01-02"))
}

// ToTimePtr converts NullableDate to *time.Time
func (d *NullableDate) ToTimePtr() *time.Time {
	if !d.Valid {
		return nil
	}
	return &d.Time
}

// RecurrencePattern represents how often a template repeats
type RecurrencePattern string

const (
	RecurrenceMonthly RecurrencePattern = "MONTHLY" // Repeats monthly on specific day
	RecurrenceYearly  RecurrencePattern = "YEARLY"  // Repeats yearly on specific day
	RecurrenceOneTime RecurrencePattern = "ONE_TIME" // Only executes once
)

// Validate checks if the recurrence pattern is valid
func (r RecurrencePattern) Validate() error {
	switch r {
	case RecurrenceMonthly, RecurrenceYearly, RecurrenceOneTime:
		return nil
	default:
		return ErrInvalidRecurrencePattern
	}
}

// RecurringMovementTemplate represents a template for recurring movements
type RecurringMovementTemplate struct {
	ID          string    `json:"id"`
	HouseholdID string    `json:"household_id"`
	Name        string    `json:"name"`        // Display name (e.g., "Arriendo", "Servicios")
	Description *string   `json:"description,omitempty"`
	IsActive    bool      `json:"is_active"`   // Can be disabled without deletion
	
	// Movement template fields - MovementType is optional (nil = budget display only)
	MovementType *movements.MovementType `json:"movement_type,omitempty"` // HOUSEHOLD, SPLIT, DEBT_PAYMENT
	CategoryID   *string                 `json:"category_id,omitempty"`
	
	// Amount configuration (always required - either exact or estimated)
	Amount   float64 `json:"amount"`   // Always required (NOT NULL in DB)
	Currency string  `json:"currency"`
	
	// Auto-generation flag
	AutoGenerate bool `json:"auto_generate"` // If true, auto-create movements
	
	// Payer template (only for SPLIT and DEBT_PAYMENT)
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	PayerName      *string `json:"payer_name,omitempty"` // Populated from join
	
	// Counterparty template (for DEBT_PAYMENT)
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	CounterpartyName      *string `json:"counterparty_name,omitempty"` // Populated from join
	
	// Payment method template
	PaymentMethodID   *string `json:"payment_method_id,omitempty"`
	PaymentMethodName *string `json:"payment_method_name,omitempty"` // Populated from join
	
	// Receiver account template (for DEBT_PAYMENT when counterparty is household member)
	ReceiverAccountID   *string `json:"receiver_account_id,omitempty"`
	ReceiverAccountName *string `json:"receiver_account_name,omitempty"` // Populated from join
	
	// Participants template (for SPLIT)
	Participants []TemplateParticipant `json:"participants,omitempty"`
	
	// Recurrence configuration (required if auto_generate=true)
	RecurrencePattern *RecurrencePattern `json:"recurrence_pattern,omitempty"` // MONTHLY, YEARLY, ONE_TIME
	DayOfMonth        *int               `json:"day_of_month,omitempty"`       // 1-31 (for MONTHLY)
	DayOfYear         *int               `json:"day_of_year,omitempty"`        // 1-365 (for YEARLY)
	StartDate         *time.Time         `json:"start_date,omitempty"`         // When to start generating
	
	// Tracking fields (for auto-generation)
	LastGeneratedDate *time.Time `json:"last_generated_date,omitempty"`
	NextScheduledDate *time.Time `json:"next_scheduled_date,omitempty"`
	
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TemplateParticipant represents a participant in a SPLIT template
type TemplateParticipant struct {
	ID                   string    `json:"id"`
	TemplateID           string    `json:"template_id"`
	ParticipantUserID    *string   `json:"participant_user_id,omitempty"`
	ParticipantContactID *string   `json:"participant_contact_id,omitempty"`
	ParticipantName      *string   `json:"participant_name,omitempty"` // Populated from join
	Percentage           float64   `json:"percentage"` // 0.0 to 1.0
	CreatedAt            time.Time `json:"created_at"`
}

// CreateTemplateInput represents input for creating a template
type CreateTemplateInput struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"` // Defaults to true
	
	// Movement template - only required for Form Pre-fill or Auto-generate
	MovementType *movements.MovementType `json:"movement_type,omitempty"`
	CategoryID   *string                 `json:"category_id,omitempty"`
	
	// Amount - always required (for budget display)
	Amount float64 `json:"amount"`
	
	// Auto-generation
	AutoGenerate *bool `json:"auto_generate,omitempty"` // Defaults to false
	
	// Payer - only for SPLIT and DEBT_PAYMENT (not HOUSEHOLD)
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	
	// Counterparty - only for DEBT_PAYMENT
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	
	// Payment method - required for HOUSEHOLD, or when payer is a member
	PaymentMethodID *string `json:"payment_method_id,omitempty"`
	
	// Receiver account - required for DEBT_PAYMENT when counterparty is a member
	ReceiverAccountID *string `json:"receiver_account_id,omitempty"`
	
	// Participants (for SPLIT)
	Participants []TemplateParticipantInput `json:"participants,omitempty"`
	
	// Recurrence
	RecurrencePattern *RecurrencePattern `json:"recurrence_pattern,omitempty"`
	DayOfMonth        *int               `json:"day_of_month,omitempty"`
	DayOfYear         *int               `json:"day_of_year,omitempty"`
	StartDate         *NullableDate      `json:"start_date,omitempty"`
}

// TemplateParticipantInput represents input for a template participant
type TemplateParticipantInput struct {
	ParticipantUserID    *string `json:"participant_user_id,omitempty"`
	ParticipantContactID *string `json:"participant_contact_id,omitempty"`
	Percentage           float64 `json:"percentage"` // 0.0 to 1.0
}

// Validate validates the create template input
// See docs/design/TEMPLATE_FIELD_REQUIREMENTS.md for field requirements
func (i *CreateTemplateInput) Validate() error {
	// === ALWAYS REQUIRED (Budget Display) ===
	if i.Name == "" {
		return errors.New("name is required")
	}
	
	if i.Amount <= 0 {
		return ErrAmountRequired
	}
	
	// CategoryID is required for all templates (for budget display)
	if i.CategoryID == nil || *i.CategoryID == "" {
		return errors.New("category_id is required")
	}
	
	// === BUDGET DISPLAY ONLY MODE ===
	// If no movement_type, this is a budget-only template - no further validation needed
	if i.MovementType == nil {
		// Ensure no movement-specific fields are set
		if i.AutoGenerate != nil && *i.AutoGenerate {
			return errors.New("auto_generate requires movement_type to be set")
		}
		return nil
	}
	
	// === FORM PRE-FILL / AUTO-GENERATE MODE ===
	// Validate movement type
	if err := i.MovementType.Validate(); err != nil {
		return err
	}
	
	// Check if auto-generate is enabled
	isAutoGenerate := i.AutoGenerate != nil && *i.AutoGenerate
	
	// === AUTO-GENERATE: Recurrence validation ===
	if isAutoGenerate {
		if i.RecurrencePattern == nil || i.StartDate == nil || !i.StartDate.Valid {
			return ErrRecurrenceRequired
		}
		
		if err := i.RecurrencePattern.Validate(); err != nil {
			return err
		}
		
		switch *i.RecurrencePattern {
		case RecurrenceMonthly:
			if i.DayOfMonth == nil {
				return errors.New("day_of_month required for MONTHLY recurrence")
			}
			if *i.DayOfMonth < 1 || *i.DayOfMonth > 31 {
				return ErrInvalidDayOfMonth
			}
		case RecurrenceYearly:
			if i.DayOfYear == nil {
				return errors.New("day_of_year required for YEARLY recurrence")
			}
			if *i.DayOfYear < 1 || *i.DayOfYear > 365 {
				return ErrInvalidDayOfYear
			}
		case RecurrenceOneTime:
			// No day validation needed
		}
	}
	
	// === MOVEMENT TYPE SPECIFIC VALIDATION ===
	hasPayerUser := i.PayerUserID != nil && *i.PayerUserID != ""
	hasPayerContact := i.PayerContactID != nil && *i.PayerContactID != ""
	hasPayer := hasPayerUser || hasPayerContact
	
	switch *i.MovementType {
	case movements.TypeHousehold:
		// HOUSEHOLD: Payer is implicit (not required)
		// Payment method is ALWAYS required (to track where money came from)
		if isAutoGenerate {
			if i.PaymentMethodID == nil || *i.PaymentMethodID == "" {
				return errors.New("payment_method_id is required for HOUSEHOLD auto-generate")
			}
		}
		// No participants allowed
		if len(i.Participants) > 0 {
			return errors.New("participants not allowed for HOUSEHOLD templates")
		}
		// No counterparty allowed
		if i.CounterpartyUserID != nil || i.CounterpartyContactID != nil {
			return errors.New("counterparty not allowed for HOUSEHOLD templates")
		}
		
	case movements.TypeSplit:
		// SPLIT: Payer required for auto-generate
		if isAutoGenerate {
			if !hasPayer {
				return errors.New("payer (user or contact) is required for SPLIT auto-generate")
			}
			if hasPayerUser && hasPayerContact {
				return errors.New("cannot specify both payer_user_id and payer_contact_id")
			}
			// Payment method required if payer is a member
			if hasPayerUser && (i.PaymentMethodID == nil || *i.PaymentMethodID == "") {
				return errors.New("payment_method_id is required when payer is a household member")
			}
			// Participants required for auto-generate
			if len(i.Participants) == 0 {
				return ErrInvalidParticipants
			}
		}
		// Validate participants if provided (for both pre-fill and auto-generate)
		if len(i.Participants) > 0 {
			totalPercentage := 0.0
			for _, p := range i.Participants {
				hasUser := p.ParticipantUserID != nil && *p.ParticipantUserID != ""
				hasContact := p.ParticipantContactID != nil && *p.ParticipantContactID != ""
				if !hasUser && !hasContact {
					return errors.New("participant must have either user_id or contact_id")
				}
				if hasUser && hasContact {
					return errors.New("participant cannot have both user_id and contact_id")
				}
				if p.Percentage <= 0 || p.Percentage > 1 {
					return errors.New("participant percentage must be between 0 and 1")
				}
				totalPercentage += p.Percentage
			}
			if totalPercentage < 0.9999 || totalPercentage > 1.0001 {
				return ErrInvalidPercentageSum
			}
		}
		// No counterparty allowed
		if i.CounterpartyUserID != nil || i.CounterpartyContactID != nil {
			return errors.New("counterparty not allowed for SPLIT templates")
		}
		
	case movements.TypeDebtPayment:
		hasCounterpartyUser := i.CounterpartyUserID != nil && *i.CounterpartyUserID != ""
		hasCounterpartyContact := i.CounterpartyContactID != nil && *i.CounterpartyContactID != ""
		hasCounterparty := hasCounterpartyUser || hasCounterpartyContact
		
		if isAutoGenerate {
			// Payer required
			if !hasPayer {
				return errors.New("payer (user or contact) is required for DEBT_PAYMENT auto-generate")
			}
			if hasPayerUser && hasPayerContact {
				return errors.New("cannot specify both payer_user_id and payer_contact_id")
			}
			// Payment method required if payer is a member
			if hasPayerUser && (i.PaymentMethodID == nil || *i.PaymentMethodID == "") {
				return errors.New("payment_method_id is required when payer is a household member")
			}
			// Counterparty required
			if !hasCounterparty {
				return errors.New("counterparty is required for DEBT_PAYMENT auto-generate")
			}
			if hasCounterpartyUser && hasCounterpartyContact {
				return errors.New("cannot specify both counterparty_user_id and counterparty_contact_id")
			}
			// Receiver account required if counterparty is a member
			if hasCounterpartyUser && (i.ReceiverAccountID == nil || *i.ReceiverAccountID == "") {
				return errors.New("receiver_account_id is required when counterparty is a household member")
			}
		}
		// Validate counterparty if provided (for pre-fill)
		if hasCounterpartyUser && hasCounterpartyContact {
			return errors.New("cannot specify both counterparty_user_id and counterparty_contact_id")
		}
		// No participants allowed
		if len(i.Participants) > 0 {
			return errors.New("participants not allowed for DEBT_PAYMENT templates")
		}
	}
	
	return nil
}

// UpdateTemplateInput represents input for updating a template
type UpdateTemplateInput struct {
	Name        *string  `json:"name,omitempty"`
	Description *string  `json:"description,omitempty"`
	IsActive    *bool    `json:"is_active,omitempty"`
	Amount      *float64 `json:"amount,omitempty"`
	
	// Movement type - can be changed
	MovementType *movements.MovementType `json:"movement_type,omitempty"`
	CategoryID   *string                 `json:"category_id,omitempty"`
	
	// Auto-generation settings
	AutoGenerate      *bool              `json:"auto_generate,omitempty"`
	RecurrencePattern *RecurrencePattern `json:"recurrence_pattern,omitempty"`
	DayOfMonth        *int               `json:"day_of_month,omitempty"`
	DayOfYear         *int               `json:"day_of_year,omitempty"`
	StartDate         *NullableDate      `json:"start_date,omitempty"`
	
	// Payer - for SPLIT and DEBT_PAYMENT
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	
	// Counterparty - for DEBT_PAYMENT
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	
	// Payment method
	PaymentMethodID *string `json:"payment_method_id,omitempty"`
	
	// Receiver account - for DEBT_PAYMENT when counterparty is member
	ReceiverAccountID *string `json:"receiver_account_id,omitempty"`
	
	// Participants - for SPLIT
	Participants []TemplateParticipantInput `json:"participants,omitempty"`
	
	// Internal flags to clear fields when changing movement type
	ClearPayer            bool `json:"-"`
	ClearCounterparty     bool `json:"-"`
	ClearReceiverAccount  bool `json:"-"`
}

// Validate validates the update template input
func (i *UpdateTemplateInput) Validate() error {
	if i.Name != nil && *i.Name == "" {
		return errors.New("name cannot be empty")
	}
	if i.Amount != nil && *i.Amount <= 0 {
		return errors.New("amount must be positive")
	}
	return nil
}

// ListTemplatesFilters represents filters for listing templates
type ListTemplatesFilters struct {
	CategoryID   *string
	IsActive     *bool
	MovementType *movements.MovementType
}

// PreFillData represents pre-fill data for movement forms
// This is returned when user selects a template in the dropdown
type PreFillData struct {
	TemplateID   string                  `json:"template_id"`
	TemplateName string                  `json:"template_name"`
	MovementType *movements.MovementType `json:"movement_type,omitempty"`
	Amount       *float64                `json:"amount,omitempty"` // Pre-filled from template
	
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	
	PaymentMethodID   *string `json:"payment_method_id,omitempty"`
	ReceiverAccountID *string `json:"receiver_account_id,omitempty"`
	
	Participants []movements.ParticipantInput `json:"participants,omitempty"`
}

// Repository defines the interface for recurring movement template data access
type Repository interface {
	Create(ctx context.Context, input *CreateTemplateInput, householdID string) (*RecurringMovementTemplate, error)
	GetByID(ctx context.Context, id string) (*RecurringMovementTemplate, error)
	ListByHousehold(ctx context.Context, householdID string, filters *ListTemplatesFilters) ([]*RecurringMovementTemplate, error)
	ListByCategory(ctx context.Context, categoryID string) ([]*RecurringMovementTemplate, error)
	ListPendingAutoGeneration(ctx context.Context, now time.Time) ([]*RecurringMovementTemplate, error)
	Update(ctx context.Context, id string, input *UpdateTemplateInput) (*RecurringMovementTemplate, error)
	UpdateGenerationTracking(ctx context.Context, id string, lastGenerated, nextScheduled time.Time) error
	Delete(ctx context.Context, id string) error
}

// Service defines the interface for recurring movement template business logic
type Service interface {
	Create(ctx context.Context, userID string, input *CreateTemplateInput) (*RecurringMovementTemplate, error)
	GetByID(ctx context.Context, userID, id string) (*RecurringMovementTemplate, error)
	ListByHousehold(ctx context.Context, userID string, filters *ListTemplatesFilters) ([]*RecurringMovementTemplate, error)
	ListByCategory(ctx context.Context, userID, categoryID string) ([]*RecurringMovementTemplate, error)
	ListByCategoryMap(ctx context.Context, userID string) (map[string][]*RecurringMovementTemplate, error) // NEW: returns all templates grouped by category_id
	GetPreFillData(ctx context.Context, userID, templateID string, invertRoles bool) (*PreFillData, error)
	Update(ctx context.Context, userID, id string, input *UpdateTemplateInput) (*RecurringMovementTemplate, error)
	Delete(ctx context.Context, userID, id string) error
	
	// CalculateTemplatesSum returns the sum of all template amounts for a category
	// Used by budgets service to validate that budget >= templates sum
	CalculateTemplatesSum(ctx context.Context, userID, categoryID string) (float64, error)
}
