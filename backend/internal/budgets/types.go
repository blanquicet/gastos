package budgets

import (
	"context"
	"errors"
	"time"
)

// Errors for budget operations
var (
	ErrBudgetNotFound     = errors.New("budget not found")
	ErrNotAuthorized      = errors.New("not authorized")
	ErrInvalidAmount      = errors.New("amount must be non-negative")
	ErrInvalidMonth       = errors.New("invalid month format (must be YYYY-MM)")
	ErrCategoryNotFound   = errors.New("category not found")
	ErrNoHousehold        = errors.New("user does not belong to a household")
	ErrBudgetsExist       = errors.New("budgets already exist for target month")
)

// MonthlyBudget represents a budget for a category in a specific month
type MonthlyBudget struct {
	ID          string    `json:"id"`
	HouseholdID string    `json:"household_id"`
	CategoryID  string    `json:"category_id"`
	Month       time.Time `json:"month"` // First day of month
	Amount      float64   `json:"amount"`
	Currency    string    `json:"currency"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// BudgetWithSpent represents a budget with calculated spent amount
type BudgetWithSpent struct {
	ID            string  `json:"id"`
	CategoryID    string  `json:"category_id"`
	CategoryName  string  `json:"category_name"`
	CategoryGroup *string `json:"category_group,omitempty"`
	Icon          *string `json:"icon,omitempty"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	Spent         float64 `json:"spent"`
	Percentage    float64 `json:"percentage"` // (spent / amount) * 100
	Status        string  `json:"status"`     // "under_budget" | "on_track" | "exceeded"
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// BudgetTotals represents total budget and spent for a month
type BudgetTotals struct {
	TotalBudget float64 `json:"total_budget"`
	TotalSpent  float64 `json:"total_spent"`
	Percentage  float64 `json:"percentage"`
}

// GetBudgetResponse represents the response for getting budgets for a month
type GetBudgetResponse struct {
	Month   string              `json:"month"` // YYYY-MM format
	Budgets []*BudgetWithSpent  `json:"budgets"`
	Totals  *BudgetTotals       `json:"totals"`
}

// SetBudgetInput represents input for setting/updating a budget
type SetBudgetInput struct {
	CategoryID string  `json:"category_id"`
	Month      string  `json:"month"` // YYYY-MM format
	Amount     float64 `json:"amount"`
}

// Validate validates the set budget input
func (i *SetBudgetInput) Validate() error {
	if i.CategoryID == "" {
		return errors.New("category_id is required")
	}
	if i.Month == "" {
		return ErrInvalidMonth
	}
	// Validate month format YYYY-MM
	_, err := time.Parse("2006-01", i.Month)
	if err != nil {
		return ErrInvalidMonth
	}
	if i.Amount < 0 {
		return ErrInvalidAmount
	}
	return nil
}

// CopyBudgetsInput represents input for copying budgets from one month to another
type CopyBudgetsInput struct {
	FromMonth string `json:"from_month"` // YYYY-MM format
	ToMonth   string `json:"to_month"`   // YYYY-MM format
}

// Validate validates the copy budgets input
func (i *CopyBudgetsInput) Validate() error {
	if i.FromMonth == "" || i.ToMonth == "" {
		return ErrInvalidMonth
	}
	
	fromDate, err := time.Parse("2006-01", i.FromMonth)
	if err != nil {
		return ErrInvalidMonth
	}
	
	toDate, err := time.Parse("2006-01", i.ToMonth)
	if err != nil {
		return ErrInvalidMonth
	}
	
	// Ensure toMonth is after fromMonth
	if !toDate.After(fromDate) {
		return errors.New("to_month must be after from_month")
	}
	
	return nil
}

// Repository defines the interface for budget data access
type Repository interface {
	// GetByMonth returns budgets for a specific month with spent amounts calculated
	GetByMonth(ctx context.Context, householdID, month string) ([]*BudgetWithSpent, error)
	
	// Set creates or updates a budget for a category and month (upsert)
	Set(ctx context.Context, householdID string, input *SetBudgetInput) (*MonthlyBudget, error)
	
	// Delete deletes a budget by ID
	Delete(ctx context.Context, id string) error
	
	// GetByID returns a budget by ID
	GetByID(ctx context.Context, id string) (*MonthlyBudget, error)
	
	// CopyBudgets copies all budgets from one month to another
	CopyBudgets(ctx context.Context, householdID, fromMonth, toMonth string) (int, error)
	
	// GetSpentForCategory returns total spent for a category in a month
	GetSpentForCategory(ctx context.Context, householdID, categoryID, month string) (float64, error)
}

// Service defines the interface for budget business logic
type Service interface {
	// GetByMonth returns budgets for a month with status indicators
	GetByMonth(ctx context.Context, userID, month string) (*GetBudgetResponse, error)
	
	// Set creates or updates a budget
	Set(ctx context.Context, userID string, input *SetBudgetInput) (*MonthlyBudget, error)
	
	// Delete deletes a budget
	Delete(ctx context.Context, userID, budgetID string) error
	
	// CopyBudgets copies budgets from one month to another
	CopyBudgets(ctx context.Context, userID string, input *CopyBudgetsInput) (int, error)
}

// CalculateBudgetStatus determines the status based on percentage
func CalculateBudgetStatus(percentage float64) string {
	if percentage < 80.0 {
		return "under_budget"
	} else if percentage < 100.0 {
		return "on_track"
	}
	return "exceeded"
}

// ParseMonth parses a month string (YYYY-MM) to a time.Time (first day of month)
func ParseMonth(month string) (time.Time, error) {
	return time.Parse("2006-01", month)
}

// FormatMonth formats a time.Time to month string (YYYY-MM)
func FormatMonth(t time.Time) string {
	return t.Format("2006-01")
}
