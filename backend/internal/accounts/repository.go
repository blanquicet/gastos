package accounts

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// repository implements Repository using PostgreSQL
type repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new account repository
func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

// Create creates a new account
func (r *repository) Create(ctx context.Context, account *Account) (*Account, error) {
	var result Account
	err := r.pool.QueryRow(ctx, `
		INSERT INTO accounts (
			household_id, owner_id, name, type, institution, last4, initial_balance, notes
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, household_id, owner_id, name, type, institution, last4, initial_balance, 
		          notes, created_at, updated_at
	`, account.HouseholdID, account.OwnerID, account.Name, account.Type, account.Institution,
		account.Last4, account.InitialBalance, account.Notes).Scan(
		&result.ID,
		&result.HouseholdID,
		&result.OwnerID,
		&result.Name,
		&result.Type,
		&result.Institution,
		&result.Last4,
		&result.InitialBalance,
		&result.Notes,
		&result.CreatedAt,
		&result.UpdatedAt,
	)

	if err != nil {
		// Check for unique constraint violation
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrAccountNameExists
		}
		return nil, err
	}

	return &result, nil
}

// GetByID retrieves an account by ID
func (r *repository) GetByID(ctx context.Context, id string) (*Account, error) {
	var account Account
	err := r.pool.QueryRow(ctx, `
		SELECT a.id, a.household_id, a.owner_id, u.name as owner_name, a.name, a.type, 
		       a.institution, a.last4, a.initial_balance, a.notes, 
		       a.created_at, a.updated_at
		FROM accounts a
		JOIN users u ON a.owner_id = u.id
		WHERE a.id = $1
	`, id).Scan(
		&account.ID,
		&account.HouseholdID,
		&account.OwnerID,
		&account.OwnerName,
		&account.Name,
		&account.Type,
		&account.Institution,
		&account.Last4,
		&account.InitialBalance,
		&account.Notes,
		&account.CreatedAt,
		&account.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAccountNotFound
		}
		return nil, err
	}

	// Calculate current balance
	balance, err := r.GetBalance(ctx, id)
	if err != nil {
		return nil, err
	}
	account.CurrentBalance = &balance

	return &account, nil
}

// Update updates an account
func (r *repository) Update(ctx context.Context, account *Account) (*Account, error) {
	var result Account
	err := r.pool.QueryRow(ctx, `
		UPDATE accounts
		SET name = $2, institution = $3, last4 = $4, initial_balance = $5, 
		    notes = $6, updated_at = NOW()
		WHERE id = $1
		RETURNING id, household_id, owner_id, name, type, institution, last4, initial_balance, 
		          notes, created_at, updated_at
	`, account.ID, account.Name, account.Institution, account.Last4,
		account.InitialBalance, account.Notes).Scan(
		&result.ID,
		&result.HouseholdID,
		&result.OwnerID,
		&result.Name,
		&result.Type,
		&result.Institution,
		&result.Last4,
		&result.InitialBalance,
		&result.Notes,
		&result.CreatedAt,
		&result.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAccountNotFound
		}
		// Check for unique constraint violation
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrAccountNameExists
		}
		return nil, err
	}

	// Calculate current balance
	balance, err := r.GetBalance(ctx, result.ID)
	if err != nil {
		return nil, err
	}
	result.CurrentBalance = &balance

	return &result, nil
}

// Delete deletes an account
func (r *repository) Delete(ctx context.Context, id string) error {
	// Check if account has income entries
	var incomeCount int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM income WHERE account_id = $1
	`, id).Scan(&incomeCount)
	if err != nil {
		return err
	}
	if incomeCount > 0 {
		return ErrAccountHasIncome
	}

	// Check if account has linked payment methods
	var pmCount int
	err = r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM payment_methods WHERE account_id = $1
	`, id).Scan(&pmCount)
	if err != nil {
		return err
	}
	if pmCount > 0 {
		return ErrAccountHasLinkedPaymentMethods
	}

	// Delete the account
	result, err := r.pool.Exec(ctx, `
		DELETE FROM accounts WHERE id = $1
	`, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrAccountNotFound
	}

	return nil
}

// ListByHousehold retrieves all accounts for a household
func (r *repository) ListByHousehold(ctx context.Context, householdID string) ([]*Account, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT a.id, a.household_id, a.owner_id, u.name as owner_name, a.name, a.type, 
		       a.institution, a.last4, a.initial_balance, a.notes, 
		       a.created_at, a.updated_at
		FROM accounts a
		JOIN users u ON a.owner_id = u.id
		WHERE a.household_id = $1
		ORDER BY 
			CASE type
				WHEN 'savings' THEN 1
				WHEN 'cash' THEN 2
				WHEN 'checking' THEN 3
			END,
			name ASC
	`, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []*Account
	for rows.Next() {
		var account Account
		err := rows.Scan(
			&account.ID,
			&account.HouseholdID,
			&account.OwnerID,
			&account.OwnerName,
			&account.Name,
			&account.Type,
			&account.Institution,
			&account.Last4,
			&account.InitialBalance,
			&account.Notes,
			&account.CreatedAt,
			&account.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		// Calculate current balance for each account
		balance, err := r.GetBalance(ctx, account.ID)
		if err != nil {
			return nil, err
		}
		account.CurrentBalance = &balance

		accounts = append(accounts, &account)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return accounts, nil
}

// FindByName finds an account by name within a household
func (r *repository) FindByName(ctx context.Context, householdID, name string) (*Account, error) {
	var account Account
	err := r.pool.QueryRow(ctx, `
		SELECT id, household_id, name, type, institution, last4, initial_balance, 
		       notes, created_at, updated_at
		FROM accounts
		WHERE household_id = $1 AND name = $2
	`, householdID, name).Scan(
		&account.ID,
		&account.HouseholdID,
		&account.Name,
		&account.Type,
		&account.Institution,
		&account.Last4,
		&account.InitialBalance,
		&account.Notes,
		&account.CreatedAt,
		&account.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAccountNotFound
		}
		return nil, err
	}

	return &account, nil
}

// GetBalance calculates the current balance of an account
// Current balance = initial_balance + SUM(income) - SUM(movements via debit cards) - SUM(credit card payments)
func (r *repository) GetBalance(ctx context.Context, id string) (float64, error) {
	var balance float64
	err := r.pool.QueryRow(ctx, `
		SELECT 
			a.initial_balance 
			+ COALESCE((SELECT SUM(i.amount) FROM income i WHERE i.account_id = a.id), 0)
			- COALESCE((SELECT SUM(m.amount) FROM movements m 
			            JOIN payment_methods pm ON m.payment_method_id = pm.id 
			            WHERE pm.account_id = a.id), 0)
			- COALESCE((SELECT SUM(ccp.amount) FROM credit_card_payments ccp 
			            WHERE ccp.source_account_id = a.id), 0)
			as current_balance
		FROM accounts a
		WHERE a.id = $1
	`, id).Scan(&balance)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrAccountNotFound
		}
		return 0, err
	}

	return balance, nil
}
