package categorygroups

import (
	"context"
	"time"
)

// CategoryGroup represents a category group with its categories
type CategoryGroup struct {
	ID           string     `json:"id"`
	HouseholdID  string     `json:"household_id"`
	Name         string     `json:"name"`
	Icon         *string    `json:"icon,omitempty"`
	DisplayOrder int        `json:"display_order"`
	IsActive     bool       `json:"is_active"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	Categories   []Category `json:"categories"` // Categories belonging to this group
}

// Category represents a simplified category (for listing within groups)
type Category struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Icon *string `json:"icon,omitempty"`
}

// Repository defines the interface for category_groups data access
type Repository interface {
	// ListByHousehold returns all category groups with their categories for a household
	ListByHousehold(ctx context.Context, householdID string) ([]*CategoryGroup, error)
}

// Service defines the interface for category_groups business logic
type Service interface {
	// ListByHousehold returns all category groups with their categories for the current user's household
	ListByHousehold(ctx context.Context, userID string) ([]*CategoryGroup, error)
}
