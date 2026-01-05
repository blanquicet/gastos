package income

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// repository implements Repository using PostgreSQL
type repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new income repository
func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

// Create creates a new income entry
func (r *repository) Create(ctx context.Context, input *CreateIncomeInput, householdID string) (*Income, error) {
	var income Income
	err := r.pool.QueryRow(ctx, `
		INSERT INTO income (
			household_id, member_id, account_id, type, amount, description, income_date
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, household_id, member_id, account_id, type, amount, description, 
		          income_date, created_at, updated_at
	`, householdID, input.MemberID, input.AccountID, input.Type, input.Amount,
		input.Description, input.IncomeDate).Scan(
		&income.ID,
		&income.HouseholdID,
		&income.MemberID,
		&income.AccountID,
		&income.Type,
		&income.Amount,
		&income.Description,
		&income.IncomeDate,
		&income.CreatedAt,
		&income.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	// Get member and account names
	enriched, err := r.enrichIncome(ctx, &income)
	if err != nil {
		return nil, err
	}

	return enriched, nil
}

// GetByID retrieves an income entry by ID
func (r *repository) GetByID(ctx context.Context, id string) (*Income, error) {
	var income Income
	err := r.pool.QueryRow(ctx, `
		SELECT i.id, i.household_id, i.member_id, i.account_id, i.type, i.amount, 
		       i.description, i.income_date, i.created_at, i.updated_at,
		       u.name as member_name, a.name as account_name
		FROM income i
		JOIN users u ON i.member_id = u.id
		JOIN accounts a ON i.account_id = a.id
		WHERE i.id = $1
	`, id).Scan(
		&income.ID,
		&income.HouseholdID,
		&income.MemberID,
		&income.AccountID,
		&income.Type,
		&income.Amount,
		&income.Description,
		&income.IncomeDate,
		&income.CreatedAt,
		&income.UpdatedAt,
		&income.MemberName,
		&income.AccountName,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrIncomeNotFound
		}
		return nil, err
	}

	return &income, nil
}

// ListByHousehold retrieves all income entries for a household with optional filters
func (r *repository) ListByHousehold(ctx context.Context, householdID string, filters *ListIncomeFilters) ([]*Income, error) {
	query := `
		SELECT i.id, i.household_id, i.member_id, i.account_id, i.type, i.amount, 
		       i.description, i.income_date, i.created_at, i.updated_at,
		       u.name as member_name, a.name as account_name
		FROM income i
		JOIN users u ON i.member_id = u.id
		JOIN accounts a ON i.account_id = a.id
		WHERE i.household_id = $1
	`

	var args []interface{}
	args = append(args, householdID)
	argNum := 2

	// Apply filters
	if filters != nil {
		if filters.MemberID != nil {
			query += fmt.Sprintf(" AND i.member_id = $%d", argNum)
			args = append(args, *filters.MemberID)
			argNum++
		}
		if filters.AccountID != nil {
			query += fmt.Sprintf(" AND i.account_id = $%d", argNum)
			args = append(args, *filters.AccountID)
			argNum++
		}
		if filters.Month != nil {
			query += fmt.Sprintf(" AND TO_CHAR(i.income_date, 'YYYY-MM') = $%d", argNum)
			args = append(args, *filters.Month)
			argNum++
		}
		if filters.StartDate != nil {
			query += fmt.Sprintf(" AND i.income_date >= $%d", argNum)
			args = append(args, *filters.StartDate)
			argNum++
		}
		if filters.EndDate != nil {
			query += fmt.Sprintf(" AND i.income_date <= $%d", argNum)
			args = append(args, *filters.EndDate)
			argNum++
		}
	}

	query += " ORDER BY i.income_date DESC, i.created_at DESC"

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var incomes []*Income
	for rows.Next() {
		var income Income
		err := rows.Scan(
			&income.ID,
			&income.HouseholdID,
			&income.MemberID,
			&income.AccountID,
			&income.Type,
			&income.Amount,
			&income.Description,
			&income.IncomeDate,
			&income.CreatedAt,
			&income.UpdatedAt,
			&income.MemberName,
			&income.AccountName,
		)
		if err != nil {
			return nil, err
		}
		incomes = append(incomes, &income)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return incomes, nil
}

// GetTotals calculates totals for income entries with breakdown by type
func (r *repository) GetTotals(ctx context.Context, householdID string, filters *ListIncomeFilters) (*IncomeTotals, error) {
	// Build query with same filters as ListByHousehold
	query := `
		SELECT 
			i.type,
			i.member_id,
			u.name as member_name,
			i.account_id,
			a.name as account_name,
			SUM(i.amount) as total
		FROM income i
		JOIN users u ON i.member_id = u.id
		JOIN accounts a ON i.account_id = a.id
		WHERE i.household_id = $1
	`

	var args []interface{}
	args = append(args, householdID)
	argNum := 2

	// Apply same filters
	if filters != nil {
		if filters.MemberID != nil {
			query += fmt.Sprintf(" AND i.member_id = $%d", argNum)
			args = append(args, *filters.MemberID)
			argNum++
		}
		if filters.AccountID != nil {
			query += fmt.Sprintf(" AND i.account_id = $%d", argNum)
			args = append(args, *filters.AccountID)
			argNum++
		}
		if filters.Month != nil {
			query += fmt.Sprintf(" AND TO_CHAR(i.income_date, 'YYYY-MM') = $%d", argNum)
			args = append(args, *filters.Month)
			argNum++
		}
		if filters.StartDate != nil {
			query += fmt.Sprintf(" AND i.income_date >= $%d", argNum)
			args = append(args, *filters.StartDate)
			argNum++
		}
		if filters.EndDate != nil {
			query += fmt.Sprintf(" AND i.income_date <= $%d", argNum)
			args = append(args, *filters.EndDate)
			argNum++
		}
	}

	query += " GROUP BY i.type, i.member_id, u.name, i.account_id, a.name"

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	totals := &IncomeTotals{
		ByMember:  make(map[string]*MemberTotals),
		ByAccount: make(map[string]float64),
		ByType:    make(map[IncomeType]float64),
	}

	for rows.Next() {
		var (
			incomeType  IncomeType
			memberID    string
			memberName  string
			accountID   string
			accountName string
			amount      float64
		)

		err := rows.Scan(&incomeType, &memberID, &memberName, &accountID, &accountName, &amount)
		if err != nil {
			return nil, err
		}

		// Total amount
		totals.TotalAmount += amount

		// By type (real income vs internal movements)
		if incomeType.IsRealIncome() {
			totals.RealIncomeAmount += amount
		} else {
			totals.InternalMovementsAmount += amount
		}

		// By type breakdown
		totals.ByType[incomeType] += amount

		// By member
		if _, exists := totals.ByMember[memberName]; !exists {
			totals.ByMember[memberName] = &MemberTotals{}
		}
		totals.ByMember[memberName].Total += amount
		if incomeType.IsRealIncome() {
			totals.ByMember[memberName].RealIncome += amount
		} else {
			totals.ByMember[memberName].InternalMovements += amount
		}

		// By account
		totals.ByAccount[accountName] += amount
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return totals, nil
}

// Update updates an income entry
func (r *repository) Update(ctx context.Context, id string, input *UpdateIncomeInput) (*Income, error) {
	// Build dynamic update query
	setParts := []string{}
	args := []interface{}{}
	argNum := 1

	if input.AccountID != nil {
		setParts = append(setParts, fmt.Sprintf("account_id = $%d", argNum))
		args = append(args, *input.AccountID)
		argNum++
	}
	if input.Type != nil {
		setParts = append(setParts, fmt.Sprintf("type = $%d", argNum))
		args = append(args, *input.Type)
		argNum++
	}
	if input.Amount != nil {
		setParts = append(setParts, fmt.Sprintf("amount = $%d", argNum))
		args = append(args, *input.Amount)
		argNum++
	}
	if input.Description != nil {
		setParts = append(setParts, fmt.Sprintf("description = $%d", argNum))
		args = append(args, *input.Description)
		argNum++
	}
	if input.IncomeDate != nil {
		setParts = append(setParts, fmt.Sprintf("income_date = $%d", argNum))
		args = append(args, *input.IncomeDate)
		argNum++
	}

	if len(setParts) == 0 {
		// Nothing to update, just return existing income
		return r.GetByID(ctx, id)
	}

	// Add updated_at
	setParts = append(setParts, fmt.Sprintf("updated_at = $%d", argNum))
	args = append(args, time.Now())
	argNum++

	// Add id to args
	args = append(args, id)

	query := fmt.Sprintf(`
		UPDATE income
		SET %s
		WHERE id = $%d
		RETURNING id, household_id, member_id, account_id, type, amount, description, 
		          income_date, created_at, updated_at
	`, strings.Join(setParts, ", "), argNum)

	var income Income
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&income.ID,
		&income.HouseholdID,
		&income.MemberID,
		&income.AccountID,
		&income.Type,
		&income.Amount,
		&income.Description,
		&income.IncomeDate,
		&income.CreatedAt,
		&income.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrIncomeNotFound
		}
		return nil, err
	}

	// Enrich with names
	enriched, err := r.enrichIncome(ctx, &income)
	if err != nil {
		return nil, err
	}

	return enriched, nil
}

// Delete deletes an income entry
func (r *repository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM income
		WHERE id = $1
	`, id)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrIncomeNotFound
	}

	return nil
}

// CountByAccount counts income entries for a specific account
func (r *repository) CountByAccount(ctx context.Context, accountID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM income WHERE account_id = $1
	`, accountID).Scan(&count)

	return count, err
}

// enrichIncome fetches member and account names for an income entry
func (r *repository) enrichIncome(ctx context.Context, income *Income) (*Income, error) {
	err := r.pool.QueryRow(ctx, `
		SELECT u.name, a.name
		FROM users u, accounts a
		WHERE u.id = $1 AND a.id = $2
	`, income.MemberID, income.AccountID).Scan(&income.MemberName, &income.AccountName)

	if err != nil {
		return nil, err
	}

	return income, nil
}
