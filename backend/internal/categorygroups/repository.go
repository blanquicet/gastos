package categorygroups

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// repository implements Repository using PostgreSQL
type repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new category groups repository
func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

// ListByHousehold returns all category groups with their categories for a household
func (r *repository) ListByHousehold(ctx context.Context, householdID string, includeInactive bool) ([]*CategoryGroup, error) {
	activeFilter := "AND cg.is_active = true"
	catActiveFilter := "AND c.is_active = true"
	if includeInactive {
		activeFilter = ""
		catActiveFilter = ""
	}

	query := fmt.Sprintf(`
		SELECT 
			cg.id, cg.household_id, cg.name, cg.icon, cg.display_order,
			cg.is_active, cg.created_at, cg.updated_at,
			c.id as category_id, c.name as category_name, c.is_active as category_is_active
		FROM category_groups cg
		LEFT JOIN categories c ON c.category_group_id = cg.id %s
		WHERE cg.household_id = $1 %s
		ORDER BY cg.name ASC, c.name ASC
	`, catActiveFilter, activeFilter)

	rows, err := r.pool.Query(ctx, query, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groupsMap := make(map[string]*CategoryGroup)
	var groupsOrder []string

	for rows.Next() {
		var (
			groupID           string
			groupHouseholdID  string
			groupName         string
			groupIcon         *string
			groupDisplayOrder int
			groupIsActive     bool
			groupCreatedAt    time.Time
			groupUpdatedAt    time.Time
			categoryID        *string
			categoryName      *string
			categoryIsActive  *bool
		)

		err := rows.Scan(
			&groupID, &groupHouseholdID, &groupName, &groupIcon,
			&groupDisplayOrder, &groupIsActive, &groupCreatedAt, &groupUpdatedAt,
			&categoryID, &categoryName, &categoryIsActive,
		)
		if err != nil {
			return nil, err
		}

		if _, exists := groupsMap[groupID]; !exists {
			groupsMap[groupID] = &CategoryGroup{
				ID:           groupID,
				HouseholdID:  groupHouseholdID,
				Name:         groupName,
				Icon:         groupIcon,
				DisplayOrder: groupDisplayOrder,
				IsActive:     groupIsActive,
				CreatedAt:    groupCreatedAt,
				UpdatedAt:    groupUpdatedAt,
				Categories:   []Category{},
			}
			groupsOrder = append(groupsOrder, groupID)
		}

		if categoryID != nil && categoryName != nil {
			isActive := true
			if categoryIsActive != nil {
				isActive = *categoryIsActive
			}
			groupsMap[groupID].Categories = append(groupsMap[groupID].Categories, Category{
				ID:       *categoryID,
				Name:     *categoryName,
				IsActive: isActive,
			})
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	groups := make([]*CategoryGroup, 0, len(groupsOrder))
	for _, groupID := range groupsOrder {
		groups = append(groups, groupsMap[groupID])
	}

	return groups, nil
}

// GetByID retrieves a category group by ID
func (r *repository) GetByID(ctx context.Context, id string) (*CategoryGroup, error) {
	var group CategoryGroup
	err := r.pool.QueryRow(ctx, `
		SELECT id, household_id, name, icon, display_order, is_active, created_at, updated_at
		FROM category_groups WHERE id = $1
	`, id).Scan(
		&group.ID, &group.HouseholdID, &group.Name, &group.Icon,
		&group.DisplayOrder, &group.IsActive, &group.CreatedAt, &group.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, err
	}
	group.Categories = []Category{}
	return &group, nil
}

// Create creates a new category group
func (r *repository) Create(ctx context.Context, householdID string, input *CreateCategoryGroupInput) (*CategoryGroup, error) {
	var group CategoryGroup
	err := r.pool.QueryRow(ctx, `
		INSERT INTO category_groups (household_id, name, icon)
		VALUES ($1, $2, $3)
		RETURNING id, household_id, name, icon, display_order, is_active, created_at, updated_at
	`, householdID, input.Name, input.Icon).Scan(
		&group.ID, &group.HouseholdID, &group.Name, &group.Icon,
		&group.DisplayOrder, &group.IsActive, &group.CreatedAt, &group.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrGroupNameExists
		}
		return nil, err
	}
	group.Categories = []Category{}
	return &group, nil
}

// Update updates a category group
func (r *repository) Update(ctx context.Context, id string, input *UpdateCategoryGroupInput) (*CategoryGroup, error) {
	query := `UPDATE category_groups SET updated_at = NOW()`
	args := []interface{}{}
	argPos := 1

	if input.Name != nil {
		argPos++
		query += fmt.Sprintf(", name = $%d", argPos)
		args = append(args, *input.Name)
	}
	if input.Icon != nil {
		argPos++
		query += fmt.Sprintf(", icon = $%d", argPos)
		args = append(args, *input.Icon)
	}
	if input.IsActive != nil {
		argPos++
		query += fmt.Sprintf(", is_active = $%d", argPos)
		args = append(args, *input.IsActive)
	}

	query += " WHERE id = $1 RETURNING id, household_id, name, icon, display_order, is_active, created_at, updated_at"
	args = append([]interface{}{id}, args...)

	var group CategoryGroup
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&group.ID, &group.HouseholdID, &group.Name, &group.Icon,
		&group.DisplayOrder, &group.IsActive, &group.CreatedAt, &group.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrGroupNameExists
		}
		return nil, err
	}
	group.Categories = []Category{}
	return &group, nil
}

// Delete hard-deletes a category group
func (r *repository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `DELETE FROM category_groups WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrGroupNotFound
	}
	return nil
}

// HasCategories checks if a group has any categories
func (r *repository) HasCategories(ctx context.Context, id string) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM categories WHERE category_group_id = $1`, id).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
