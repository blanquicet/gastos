package budgets

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresRepository implements Repository using PostgreSQL
type PostgresRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresRepository creates a new budget repository
func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

// GetByMonth returns budgets for a specific month with spent amounts calculated
func (r *PostgresRepository) GetByMonth(ctx context.Context, householdID, month string) ([]*BudgetWithSpent, error) {
	// Parse month
	monthDate, err := ParseMonth(month)
	if err != nil {
		return nil, ErrInvalidMonth
	}

	query := `
		SELECT 
			mb.id,
			c.id as category_id,
			c.name as category_name,
			cg.id as category_group_id,
			cg.name as category_group_name,
			cg.icon as category_group_icon,
			cg.display_order as group_display_order,
			COALESCE(mb.amount, 0) as amount,
			COALESCE(mb.currency, 'COP') as currency,
			COALESCE(SUM(m.amount), 0) as spent,
			mb.created_at,
			mb.updated_at
		FROM categories c
		LEFT JOIN category_groups cg ON cg.id = c.category_group_id
		LEFT JOIN monthly_budgets mb ON mb.category_id = c.id 
			AND mb.household_id = $1
			AND mb.month = $2
		LEFT JOIN movements m ON m.category_id = c.id 
			AND m.household_id = $1
			AND DATE_TRUNC('month', m.movement_date) = $2
		WHERE c.household_id = $1
			AND c.is_active = true
		GROUP BY mb.id, c.id, c.name, cg.id, cg.name, cg.icon, cg.display_order, c.display_order, mb.amount, mb.currency, mb.created_at, mb.updated_at
		ORDER BY cg.display_order NULLS LAST, c.display_order ASC, c.name ASC
	`

	rows, err := r.pool.Query(ctx, query, householdID, monthDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var budgets []*BudgetWithSpent
	for rows.Next() {
		var budget BudgetWithSpent
		err := rows.Scan(
			&budget.ID,
			&budget.CategoryID,
			&budget.CategoryName,
			&budget.CategoryGroupID,
			&budget.CategoryGroupName,
			&budget.CategoryGroupIcon,
			&budget.GroupDisplayOrder,
			&budget.Amount,
			&budget.Currency,
			&budget.Spent,
			&budget.CreatedAt,
			&budget.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		// Calculate percentage and status
		if budget.Amount > 0 {
			budget.Percentage = (budget.Spent / budget.Amount) * 100
		} else {
			budget.Percentage = 0
		}
		budget.Status = CalculateBudgetStatus(budget.Percentage)

		budgets = append(budgets, &budget)
	}

	return budgets, rows.Err()
}

// Set creates or updates a budget for a category and month (upsert)
func (r *PostgresRepository) Set(ctx context.Context, householdID string, input *SetBudgetInput) (*MonthlyBudget, error) {
	// Parse month
	monthDate, err := ParseMonth(input.Month)
	if err != nil {
		return nil, ErrInvalidMonth
	}

	// Upsert budget
	var budget MonthlyBudget
	err = r.pool.QueryRow(ctx, `
		INSERT INTO monthly_budgets (household_id, category_id, month, amount, currency)
		VALUES ($1, $2, $3, $4, 'COP')
		ON CONFLICT (household_id, category_id, month)
		DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()
		RETURNING id, household_id, category_id, month, amount, currency, created_at, updated_at
	`, householdID, input.CategoryID, monthDate, input.Amount).Scan(
		&budget.ID,
		&budget.HouseholdID,
		&budget.CategoryID,
		&budget.Month,
		&budget.Amount,
		&budget.Currency,
		&budget.CreatedAt,
		&budget.UpdatedAt,
	)
	if err != nil {
		// Check if category exists
		if err.Error() == "violates foreign key constraint" {
			return nil, ErrCategoryNotFound
		}
		return nil, err
	}

	return &budget, nil
}

// Delete deletes a budget by ID
func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `DELETE FROM monthly_budgets WHERE id = $1`, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrBudgetNotFound
	}

	return nil
}

// GetByID returns a budget by ID
func (r *PostgresRepository) GetByID(ctx context.Context, id string) (*MonthlyBudget, error) {
	var budget MonthlyBudget
	err := r.pool.QueryRow(ctx, `
		SELECT id, household_id, category_id, month, amount, currency, created_at, updated_at
		FROM monthly_budgets
		WHERE id = $1
	`, id).Scan(
		&budget.ID,
		&budget.HouseholdID,
		&budget.CategoryID,
		&budget.Month,
		&budget.Amount,
		&budget.Currency,
		&budget.CreatedAt,
		&budget.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrBudgetNotFound
	}
	if err != nil {
		return nil, err
	}
	return &budget, nil
}

// CopyBudgets copies all budgets from one month to another
func (r *PostgresRepository) CopyBudgets(ctx context.Context, householdID, fromMonth, toMonth string) (int, error) {
	fromDate, err := ParseMonth(fromMonth)
	if err != nil {
		return 0, ErrInvalidMonth
	}

	toDate, err := ParseMonth(toMonth)
	if err != nil {
		return 0, ErrInvalidMonth
	}

	// Check if budgets already exist for target month
	var count int
	err = r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM monthly_budgets
		WHERE household_id = $1 AND month = $2
	`, householdID, toDate).Scan(&count)
	if err != nil {
		return 0, err
	}
	if count > 0 {
		return 0, ErrBudgetsExist
	}

	// Copy budgets
	result, err := r.pool.Exec(ctx, `
		INSERT INTO monthly_budgets (household_id, category_id, month, amount, currency)
		SELECT household_id, category_id, $2, amount, currency
		FROM monthly_budgets
		WHERE household_id = $1 AND month = $3
	`, householdID, toDate, fromDate)
	if err != nil {
		return 0, err
	}

	return int(result.RowsAffected()), nil
}

// GetSpentForCategory returns total spent for a category in a month
func (r *PostgresRepository) GetSpentForCategory(ctx context.Context, householdID, categoryID, month string) (float64, error) {
	monthDate, err := ParseMonth(month)
	if err != nil {
		return 0, ErrInvalidMonth
	}

	var spent float64
	err = r.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0)
		FROM movements
		WHERE household_id = $1
			AND category_id = $2
			AND DATE_TRUNC('month', movement_date) = $3
	`, householdID, categoryID, monthDate).Scan(&spent)
	if err != nil {
		return 0, err
	}

	return spent, nil
}

// DeleteFutureRecords deletes all budget records for a category after the specified month
func (r *PostgresRepository) DeleteFutureRecords(ctx context.Context, householdID, categoryID, afterMonth string) (int64, error) {
	monthDate, err := ParseMonth(afterMonth)
	if err != nil {
		return 0, ErrInvalidMonth
	}
	result, err := r.pool.Exec(ctx, `
		DELETE FROM monthly_budgets
		WHERE household_id = $1 AND category_id = $2 AND month > $3
	`, householdID, categoryID, monthDate)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

// UpdateAllRecords updates all budget records for a category to a new amount
func (r *PostgresRepository) UpdateAllRecords(ctx context.Context, householdID, categoryID string, amount float64) (int64, error) {
	result, err := r.pool.Exec(ctx, `
		UPDATE monthly_budgets SET amount = $3, updated_at = NOW()
		WHERE household_id = $1 AND category_id = $2
	`, householdID, categoryID, amount)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}
