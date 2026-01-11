package categories

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresRepository implements Repository using PostgreSQL
type PostgresRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresRepository creates a new category repository
func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

// Create creates a new category
func (r *PostgresRepository) Create(ctx context.Context, householdID string, input *CreateCategoryInput) (*Category, error) {
	// Check if name already exists
	exists, err := r.CheckNameExists(ctx, householdID, input.Name, "")
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrCategoryNameExists
	}

	// Get max display_order for the household
	var maxOrder int
	err = r.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(display_order), 0)
		FROM categories
		WHERE household_id = $1
	`, householdID).Scan(&maxOrder)
	if err != nil {
		return nil, err
	}

	// Create category
	var category Category
	err = r.pool.QueryRow(ctx, `
		INSERT INTO categories (household_id, name, category_group, icon, color, display_order)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, household_id, name, category_group, icon, color, display_order, is_active, created_at, updated_at
	`, householdID, input.Name, input.CategoryGroup, input.Icon, input.Color, maxOrder+1).Scan(
		&category.ID,
		&category.HouseholdID,
		&category.Name,
		&category.CategoryGroup,
		&category.Icon,
		&category.Color,
		&category.DisplayOrder,
		&category.IsActive,
		&category.CreatedAt,
		&category.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return nil, ErrCategoryNameExists
		}
		return nil, err
	}

	return &category, nil
}

// GetByID retrieves a category by ID
func (r *PostgresRepository) GetByID(ctx context.Context, id string) (*Category, error) {
	var category Category
	err := r.pool.QueryRow(ctx, `
		SELECT id, household_id, name, color, display_order, is_active, created_at, updated_at
		FROM categories
		WHERE id = $1
	`, id).Scan(
		&category.ID,
		&category.HouseholdID,
		&category.Name,
		&category.Color,
		&category.DisplayOrder,
		&category.IsActive,
		&category.CreatedAt,
		&category.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrCategoryNotFound
	}
	if err != nil {
		return nil, err
	}
	return &category, nil
}

// ListByHousehold retrieves all categories for a household
func (r *PostgresRepository) ListByHousehold(ctx context.Context, householdID string, includeInactive bool) ([]*Category, error) {
	query := `
		SELECT id, household_id, name, category_group, icon, color, display_order, is_active, created_at, updated_at
		FROM categories
		WHERE household_id = $1
	`
	if !includeInactive {
		query += " AND is_active = TRUE"
	}
	query += " ORDER BY display_order ASC, name ASC"

	rows, err := r.pool.Query(ctx, query, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []*Category
	for rows.Next() {
		var category Category
		err := rows.Scan(
			&category.ID,
			&category.HouseholdID,
			&category.Name,
			&category.CategoryGroup,
			&category.Icon,
			&category.Color,
			&category.DisplayOrder,
			&category.IsActive,
			&category.CreatedAt,
			&category.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		categories = append(categories, &category)
	}

	return categories, rows.Err()
}

// Update updates a category
func (r *PostgresRepository) Update(ctx context.Context, id string, input *UpdateCategoryInput) (*Category, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Get current category to access household_id
	var householdID string
	err = tx.QueryRow(ctx, `SELECT household_id FROM categories WHERE id = $1`, id).Scan(&householdID)
	if err == pgx.ErrNoRows {
		return nil, ErrCategoryNotFound
	}
	if err != nil {
		return nil, err
	}

	// Check name uniqueness if name is being updated
	if input.Name != nil {
		exists, err := r.CheckNameExists(ctx, householdID, *input.Name, id)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, ErrCategoryNameExists
		}
	}

	// Build dynamic UPDATE query
	query := `UPDATE categories SET updated_at = NOW()`
	args := []interface{}{}
	argPos := 1

	if input.Name != nil {
		argPos++
		query += fmt.Sprintf(", name = $%d", argPos)
		args = append(args, *input.Name)
	}
	if input.CategoryGroup != nil {
		argPos++
		query += fmt.Sprintf(", category_group = $%d", argPos)
		args = append(args, *input.CategoryGroup)
	}
	if input.Icon != nil {
		argPos++
		query += fmt.Sprintf(", icon = $%d", argPos)
		args = append(args, *input.Icon)
	}
	if input.Color != nil {
		argPos++
		query += fmt.Sprintf(", color = $%d", argPos)
		args = append(args, *input.Color)
	}
	if input.DisplayOrder != nil {
		argPos++
		query += fmt.Sprintf(", display_order = $%d", argPos)
		args = append(args, *input.DisplayOrder)
	}
	if input.IsActive != nil {
		argPos++
		query += fmt.Sprintf(", is_active = $%d", argPos)
		args = append(args, *input.IsActive)
	}

	query += " WHERE id = $1 RETURNING id, household_id, name, category_group, icon, color, display_order, is_active, created_at, updated_at"
	args = append([]interface{}{id}, args...)

	var category Category
	err = tx.QueryRow(ctx, query, args...).Scan(
		&category.ID,
		&category.HouseholdID,
		&category.Name,
		&category.CategoryGroup,
		&category.Icon,
		&category.Color,
		&category.DisplayOrder,
		&category.IsActive,
		&category.CreatedAt,
		&category.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrCategoryNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrCategoryNameExists
		}
		return nil, err
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &category, nil
}

// Delete deletes a category
func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	// Check if category is used in movements
	inUse, err := r.IsUsedInMovements(ctx, id)
	if err != nil {
		return err
	}
	if inUse {
		return ErrCategoryInUse
	}

	result, err := r.pool.Exec(ctx, `DELETE FROM categories WHERE id = $1`, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrCategoryNotFound
	}

	return nil
}

// CheckNameExists checks if a category name already exists in a household
func (r *PostgresRepository) CheckNameExists(ctx context.Context, householdID, name, excludeID string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM categories WHERE household_id = $1 AND name = $2`
	args := []interface{}{householdID, name}

	if excludeID != "" {
		query += " AND id != $3"
		args = append(args, excludeID)
	}

	err := r.pool.QueryRow(ctx, query, args...).Scan(&count)
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

// IsUsedInMovements checks if a category is used in any movements
func (r *PostgresRepository) IsUsedInMovements(ctx context.Context, categoryID string) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM movements WHERE category_id = $1
	`, categoryID).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// Reorder updates the display_order for multiple categories
func (r *PostgresRepository) Reorder(ctx context.Context, householdID string, categoryIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Update each category with its new display_order
	for i, categoryID := range categoryIDs {
		result, err := tx.Exec(ctx, `
			UPDATE categories
			SET display_order = $1, updated_at = NOW()
			WHERE id = $2 AND household_id = $3
		`, i, categoryID, householdID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrCategoryNotFound
		}
	}

	return tx.Commit(ctx)
}

// CreateDefaultCategories creates the default categories for a new household
func (r *PostgresRepository) CreateDefaultCategories(ctx context.Context, householdID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	defaults := GetDefaultCategories()
	for _, def := range defaults {
		var group *string
		if def.CategoryGroup != "" {
			group = &def.CategoryGroup
		}

		_, err := tx.Exec(ctx, `
			INSERT INTO categories (household_id, name, category_group, display_order)
			VALUES ($1, $2, $3, $4)
		`, householdID, def.Name, group, def.DisplayOrder)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
