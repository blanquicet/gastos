package categories

import (
	"context"
	"errors"
	"time"
)

// Errors for category operations
var (
	ErrCategoryNotFound      = errors.New("category not found")
	ErrNotAuthorized         = errors.New("not authorized")
	ErrCategoryNameRequired  = errors.New("category name is required")
	ErrCategoryNameTooLong   = errors.New("category name must be at most 100 characters")
	ErrCategoryNameExists    = errors.New("category with this name already exists in household")
	ErrCategoryInUse         = errors.New("category cannot be deleted because it is used in movements")
	ErrNoHousehold           = errors.New("user does not belong to a household")
	ErrInvalidDisplayOrder   = errors.New("invalid display order")
)

// Category represents an expense category
type Category struct {
	ID            string    `json:"id"`
	HouseholdID   string    `json:"household_id"`
	Name          string    `json:"name"`
	CategoryGroup *string   `json:"category_group,omitempty"`
	Icon          *string   `json:"icon,omitempty"`
	Color         *string   `json:"color,omitempty"`
	DisplayOrder  int       `json:"display_order"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// CreateCategoryInput represents input for creating a category
type CreateCategoryInput struct {
	Name          string  `json:"name"`
	CategoryGroup *string `json:"category_group,omitempty"`
	Icon          *string `json:"icon,omitempty"`
	Color         *string `json:"color,omitempty"`
}

// Validate validates the create category input
func (i *CreateCategoryInput) Validate() error {
	if i.Name == "" {
		return ErrCategoryNameRequired
	}
	if len(i.Name) > 100 {
		return ErrCategoryNameTooLong
	}
	if i.Icon != nil && len(*i.Icon) > 10 {
		return errors.New("icon must be at most 10 characters")
	}
	if i.Color != nil && len(*i.Color) > 20 {
		return errors.New("color must be at most 20 characters")
	}
	if i.CategoryGroup != nil && len(*i.CategoryGroup) > 100 {
		return errors.New("category group must be at most 100 characters")
	}
	return nil
}

// UpdateCategoryInput represents input for updating a category
type UpdateCategoryInput struct {
	Name          *string `json:"name,omitempty"`
	CategoryGroup *string `json:"category_group,omitempty"`
	Icon          *string `json:"icon,omitempty"`
	Color         *string `json:"color,omitempty"`
	DisplayOrder  *int    `json:"display_order,omitempty"`
	IsActive      *bool   `json:"is_active,omitempty"`
}

// Validate validates the update category input
func (i *UpdateCategoryInput) Validate() error {
	if i.Name != nil {
		if *i.Name == "" {
			return ErrCategoryNameRequired
		}
		if len(*i.Name) > 100 {
			return ErrCategoryNameTooLong
		}
	}
	if i.Icon != nil && len(*i.Icon) > 10 {
		return errors.New("icon must be at most 10 characters")
	}
	if i.Color != nil && len(*i.Color) > 20 {
		return errors.New("color must be at most 20 characters")
	}
	if i.CategoryGroup != nil && len(*i.CategoryGroup) > 100 {
		return errors.New("category group must be at most 100 characters")
	}
	if i.DisplayOrder != nil && *i.DisplayOrder < 0 {
		return ErrInvalidDisplayOrder
	}
	return nil
}

// ListCategoriesResponse represents the response for listing categories
type ListCategoriesResponse struct {
	Categories []*Category            `json:"categories"`
	Grouped    map[string][]*Category `json:"grouped"`
}

// ReorderCategoriesInput represents input for reordering categories
type ReorderCategoriesInput struct {
	CategoryIDs []string `json:"category_ids"`
}

// Validate validates the reorder input
func (i *ReorderCategoriesInput) Validate() error {
	if len(i.CategoryIDs) == 0 {
		return errors.New("category_ids is required")
	}
	return nil
}

// Repository defines the interface for category data access
type Repository interface {
	Create(ctx context.Context, householdID string, input *CreateCategoryInput) (*Category, error)
	GetByID(ctx context.Context, id string) (*Category, error)
	ListByHousehold(ctx context.Context, householdID string, includeInactive bool) ([]*Category, error)
	Update(ctx context.Context, id string, input *UpdateCategoryInput) (*Category, error)
	Delete(ctx context.Context, id string) error
	CheckNameExists(ctx context.Context, householdID, name, excludeID string) (bool, error)
	IsUsedInMovements(ctx context.Context, categoryID string) (bool, error)
	Reorder(ctx context.Context, householdID string, categoryIDs []string) error
	CreateDefaultCategories(ctx context.Context, householdID string) error
}

// Service defines the interface for category business logic
type Service interface {
	Create(ctx context.Context, userID string, input *CreateCategoryInput) (*Category, error)
	GetByID(ctx context.Context, userID, id string) (*Category, error)
	ListByHousehold(ctx context.Context, userID string, includeInactive bool) (*ListCategoriesResponse, error)
	Update(ctx context.Context, userID, id string, input *UpdateCategoryInput) (*Category, error)
	Delete(ctx context.Context, userID, id string) error
	Reorder(ctx context.Context, userID string, input *ReorderCategoriesInput) error
}

// DefaultCategory represents a default category to create
type DefaultCategory struct {
	Name          string
	CategoryGroup string
	DisplayOrder  int
}

// GetDefaultCategories returns the default categories to create for new households
func GetDefaultCategories() []DefaultCategory {
	return []DefaultCategory{
		// Casa group
		{"Casa - Gastos fijos", "Casa", 1},
		{"Casa - Cositas para casa", "Casa", 2},
		{"Casa - Provisionar mes entrante", "Casa", 3},
		{"Casa - Imprevistos", "Casa", 4},
		{"Kellys", "Casa", 5},
		{"Mercado", "Casa", 6},
		
		// Jose group
		{"Jose - Vida cotidiana", "Jose", 10},
		{"Jose - Gastos fijos", "Jose", 11},
		{"Jose - Imprevistos", "Jose", 12},
		
		// Caro group
		{"Caro - Vida cotidiana", "Caro", 20},
		{"Caro - Gastos fijos", "Caro", 21},
		{"Caro - Imprevistos", "Caro", 22},
		
		// Carro group
		{"Uber/Gasolina/Peajes/Parqueaderos", "Carro", 30},
		{"Pago de SOAT/impuestos/mantenimiento", "Carro", 31},
		{"Carro - Seguro", "Carro", 32},
		{"Carro - Imprevistos", "Carro", 33},
		
		// Ahorros group
		{"Ahorros para SOAT/impuestos/mantenimiento", "Ahorros", 40},
		{"Ahorros para cosas de la casa", "Ahorros", 41},
		{"Ahorros para vacaciones", "Ahorros", 42},
		{"Ahorros para regalos", "Ahorros", 43},
		
		// Inversiones group
		{"Inversiones Caro", "Inversiones", 50},
		{"Inversiones Jose", "Inversiones", 51},
		{"Inversiones Juntos", "Inversiones", 52},
		
		// Diversión group
		{"Vacaciones", "Diversión", 60},
		{"Salidas juntos", "Diversión", 61},
		
		// Ungrouped
		{"Regalos", "", 100},
		{"Gastos médicos", "", 101},
		{"Préstamo", "", 102},
	}
}
