package categorygroups

import (
	"context"
	"errors"
	"time"
)

// Errors for category group operations
var (
	ErrGroupNotFound    = errors.New("Grupo no encontrado")
	ErrNotAuthorized    = errors.New("No autorizado")
	ErrGroupNameRequired = errors.New("El nombre del grupo es obligatorio")
	ErrGroupNameTooLong = errors.New("El nombre del grupo debe tener máximo 100 caracteres")
	ErrGroupNameExists  = errors.New("Ya existe un grupo con este nombre")
	ErrGroupHasCategories = errors.New("No se puede eliminar el grupo porque tiene categorías")
	ErrIconTooLong      = errors.New("El ícono debe tener máximo 10 caracteres")
	ErrIconRequired     = errors.New("El ícono es obligatorio")
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
	ID       string `json:"id"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

// CreateCategoryGroupInput represents input for creating a category group
type CreateCategoryGroupInput struct {
	Name string  `json:"name"`
	Icon *string `json:"icon,omitempty"`
}

// Validate validates the create input
func (i *CreateCategoryGroupInput) Validate() error {
	if i.Name == "" {
		return ErrGroupNameRequired
	}
	if len(i.Name) > 100 {
		return ErrGroupNameTooLong
	}
	if i.Icon == nil || *i.Icon == "" {
		return ErrIconRequired
	}
	if len(*i.Icon) > 10 {
		return ErrIconTooLong
	}
	return nil
}

// UpdateCategoryGroupInput represents input for updating a category group
type UpdateCategoryGroupInput struct {
	Name     *string `json:"name,omitempty"`
	Icon     *string `json:"icon,omitempty"`
	IsActive *bool   `json:"is_active,omitempty"`
}

// Validate validates the update input
func (i *UpdateCategoryGroupInput) Validate() error {
	if i.Name != nil {
		if *i.Name == "" {
			return ErrGroupNameRequired
		}
		if len(*i.Name) > 100 {
			return ErrGroupNameTooLong
		}
	}
	if i.Icon != nil && len(*i.Icon) > 10 {
		return ErrIconTooLong
	}
	return nil
}

// Repository defines the interface for category_groups data access
type Repository interface {
	ListByHousehold(ctx context.Context, householdID string, includeInactive bool) ([]*CategoryGroup, error)
	GetByID(ctx context.Context, id string) (*CategoryGroup, error)
	Create(ctx context.Context, householdID string, input *CreateCategoryGroupInput) (*CategoryGroup, error)
	Update(ctx context.Context, id string, input *UpdateCategoryGroupInput) (*CategoryGroup, error)
	Delete(ctx context.Context, id string) error
	HasCategories(ctx context.Context, id string) (bool, error)
}

// Service defines the interface for category_groups business logic
type Service interface {
	ListByHousehold(ctx context.Context, userID string, includeInactive bool) ([]*CategoryGroup, error)
	Create(ctx context.Context, userID string, input *CreateCategoryGroupInput) (*CategoryGroup, error)
	Update(ctx context.Context, userID, id string, input *UpdateCategoryGroupInput) (*CategoryGroup, error)
	Delete(ctx context.Context, userID, id string) error
}
