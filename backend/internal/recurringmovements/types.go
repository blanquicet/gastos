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
	
	// Movement template fields
	MovementType movements.MovementType `json:"movement_type"` // HOUSEHOLD, SPLIT, DEBT_PAYMENT
	CategoryID   *string                `json:"category_id,omitempty"`
	
	// Amount configuration (always required - either exact or estimated)
	Amount   float64 `json:"amount"`   // Always required (NOT NULL in DB)
	Currency string  `json:"currency"`
	
	// Auto-generation flag
	AutoGenerate bool `json:"auto_generate"` // If true, auto-create movements
	
	// Payer template
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
	
	// Movement template
	MovementType movements.MovementType `json:"movement_type"`
	CategoryID   *string                `json:"category_id,omitempty"`
	
	// Amount - always required
	Amount float64 `json:"amount"`
	
	// Auto-generation
	AutoGenerate *bool `json:"auto_generate,omitempty"` // Defaults to false
	
	// Payer
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	
	// Counterparty
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	
	// Payment method
	PaymentMethodID *string `json:"payment_method_id,omitempty"`
	
	// Receiver account
	
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
func (i *CreateTemplateInput) Validate() error {
	// Validate name
	if i.Name == "" {
		return errors.New("name is required")
	}
	
	// Validate movement type
	if err := i.MovementType.Validate(); err != nil {
		return err
	}
	
	// Validate amount (always required)
	if i.Amount <= 0 {
		return ErrAmountRequired
	}
	
	// Validate auto-generate constraints
	if i.AutoGenerate != nil && *i.AutoGenerate {
		// Recurrence required for auto-generate
		if i.RecurrencePattern == nil || i.StartDate == nil || !i.StartDate.Valid {
			return ErrRecurrenceRequired
		}
		
		// Validate recurrence pattern
		if err := i.RecurrencePattern.Validate(); err != nil {
			return err
		}
		
		// Validate day fields based on pattern
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
	} else {
		// If recurrence is provided, validate it even if not auto-generating
		if i.RecurrencePattern != nil {
			if err := i.RecurrencePattern.Validate(); err != nil {
				return err
			}
		}
	}
	
	// Validate payer (exactly one)
	hasPayerUser := i.PayerUserID != nil && *i.PayerUserID != ""
	hasPayerContact := i.PayerContactID != nil && *i.PayerContactID != ""
	if !hasPayerUser && !hasPayerContact {
		return errors.New("exactly one payer (user or contact) is required")
	}
	if hasPayerUser && hasPayerContact {
		return errors.New("cannot specify both payer_user_id and payer_contact_id")
	}
	
	// Movement type specific validations
	switch i.MovementType {
	case movements.TypeSplit:
		// Participants required
		if len(i.Participants) == 0 {
			return ErrInvalidParticipants
		}
		// Validate participants
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
		// Check percentage sum (allow small floating point error)
		if totalPercentage < 0.9999 || totalPercentage > 1.0001 {
			return ErrInvalidPercentageSum
		}
		
	case movements.TypeDebtPayment:
		// Counterparty required
		hasCounterpartyUser := i.CounterpartyUserID != nil && *i.CounterpartyUserID != ""
		hasCounterpartyContact := i.CounterpartyContactID != nil && *i.CounterpartyContactID != ""
		if !hasCounterpartyUser && !hasCounterpartyContact {
			return errors.New("counterparty is required for DEBT_PAYMENT templates")
		}
		if hasCounterpartyUser && hasCounterpartyContact {
			return errors.New("cannot specify both counterparty_user_id and counterparty_contact_id")
		}
		// No participants
		if len(i.Participants) > 0 {
			return errors.New("participants not allowed for DEBT_PAYMENT templates")
		}
		
	case movements.TypeHousehold:
		// No participants
		if len(i.Participants) > 0 {
			return errors.New("participants not allowed for HOUSEHOLD templates")
		}
		// No counterparty
		if i.CounterpartyUserID != nil || i.CounterpartyContactID != nil {
			return errors.New("counterparty not allowed for HOUSEHOLD templates")
		}
	}
	
	return nil
}

// UpdateTemplateInput represents input for updating a template
type UpdateTemplateInput struct {
	Name              *string  `json:"name,omitempty"`
	Description       *string  `json:"description,omitempty"`
	IsActive          *bool    `json:"is_active,omitempty"`
	Amount            *float64 `json:"amount,omitempty"` // Changed from fixed_amount
	PaymentMethodID   *string  `json:"payment_method_id,omitempty"`
	
	// Cannot update: movement_type, auto_generate, recurrence_pattern
	// Cannot update: payer, counterparty, participants (too complex)
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
	TemplateID   string                 `json:"template_id"`
	TemplateName string                 `json:"template_name"`
	MovementType movements.MovementType `json:"movement_type"`
	Amount       *float64               `json:"amount,omitempty"` // Pre-filled from template
	
	PayerUserID    *string `json:"payer_user_id,omitempty"`
	PayerContactID *string `json:"payer_contact_id,omitempty"`
	
	CounterpartyUserID    *string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID *string `json:"counterparty_contact_id,omitempty"`
	
	PaymentMethodID   *string `json:"payment_method_id,omitempty"`
	
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
}
