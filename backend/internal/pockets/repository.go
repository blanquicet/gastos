package pockets

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// repository implements Repository using PostgreSQL
type repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new pocket repository
func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

// Create creates a new pocket
func (r *repository) Create(ctx context.Context, pocket *Pocket) (*Pocket, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO pockets (household_id, owner_id, name, icon, goal_amount, note)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, pocket.HouseholdID, pocket.OwnerID, pocket.Name, pocket.Icon, pocket.GoalAmount, pocket.Note).Scan(&id)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrPocketNameExists
		}
		return nil, err
	}

	return r.GetByID(ctx, id)
}

// GetByID retrieves a pocket by ID with owner name and balance
func (r *repository) GetByID(ctx context.Context, id string) (*Pocket, error) {
	var pocket Pocket
	err := r.pool.QueryRow(ctx, `
		SELECT p.id, p.household_id, p.owner_id, u.name as owner_name,
		       p.name, p.icon, p.goal_amount, p.note, p.category_id, p.is_active,
		       p.created_at, p.updated_at
		FROM pockets p
		JOIN users u ON p.owner_id = u.id
		WHERE p.id = $1
	`, id).Scan(
		&pocket.ID,
		&pocket.HouseholdID,
		&pocket.OwnerID,
		&pocket.OwnerName,
		&pocket.Name,
		&pocket.Icon,
		&pocket.GoalAmount,
		&pocket.Note,
		&pocket.CategoryID,
		&pocket.IsActive,
		&pocket.CreatedAt,
		&pocket.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPocketNotFound
		}
		return nil, err
	}

	balance, err := r.GetBalance(ctx, pocket.ID)
	if err != nil {
		return nil, err
	}
	pocket.Balance = &balance

	return &pocket, nil
}

// Update updates a pocket's mutable fields
func (r *repository) Update(ctx context.Context, pocket *Pocket) (*Pocket, error) {
	result, err := r.pool.Exec(ctx, `
		UPDATE pockets
		SET name = $1, icon = $2, goal_amount = $3, note = $4, category_id = $5, updated_at = NOW()
		WHERE id = $6
	`, pocket.Name, pocket.Icon, pocket.GoalAmount, pocket.Note, pocket.CategoryID, pocket.ID)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrPocketNameExists
		}
		return nil, err
	}

	if result.RowsAffected() == 0 {
		return nil, ErrPocketNotFound
	}

	return r.GetByID(ctx, pocket.ID)
}

// Deactivate sets a pocket as inactive
func (r *repository) Deactivate(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `
		UPDATE pockets SET is_active = false, updated_at = NOW() WHERE id = $1
	`, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrPocketNotFound
	}

	return nil
}

// ListByHousehold retrieves all pockets for a household (active and inactive)
func (r *repository) ListByHousehold(ctx context.Context, householdID string) ([]*Pocket, error) {
	return r.listPockets(ctx, householdID, false)
}

// ListActiveByHousehold retrieves only active pockets for a household
func (r *repository) ListActiveByHousehold(ctx context.Context, householdID string) ([]*Pocket, error) {
	return r.listPockets(ctx, householdID, true)
}

// listPockets is the shared implementation for listing pockets
func (r *repository) listPockets(ctx context.Context, householdID string, activeOnly bool) ([]*Pocket, error) {
	query := `
		SELECT p.id, p.household_id, p.owner_id, u.name as owner_name,
		       p.name, p.icon, p.goal_amount, p.note, p.category_id, p.is_active,
		       p.created_at, p.updated_at
		FROM pockets p
		JOIN users u ON p.owner_id = u.id
		WHERE p.household_id = $1
	`
	if activeOnly {
		query += ` AND p.is_active = TRUE`
	}
	query += ` ORDER BY p.name ASC`

	rows, err := r.pool.Query(ctx, query, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pockets []*Pocket
	for rows.Next() {
		var pocket Pocket
		err := rows.Scan(
			&pocket.ID,
			&pocket.HouseholdID,
			&pocket.OwnerID,
			&pocket.OwnerName,
			&pocket.Name,
			&pocket.Icon,
			&pocket.GoalAmount,
			&pocket.Note,
			&pocket.CategoryID,
			&pocket.IsActive,
			&pocket.CreatedAt,
			&pocket.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		balance, err := r.GetBalance(ctx, pocket.ID)
		if err != nil {
			return nil, err
		}
		pocket.Balance = &balance

		pockets = append(pockets, &pocket)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return pockets, nil
}

// CountByHousehold returns the count of active pockets in a household
func (r *repository) CountByHousehold(ctx context.Context, householdID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM pockets WHERE household_id = $1 AND is_active = TRUE
	`, householdID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// FindByName finds a pocket by name within a household, returns nil,nil if not found
func (r *repository) FindByName(ctx context.Context, householdID, name string) (*Pocket, error) {
	var pocket Pocket
	err := r.pool.QueryRow(ctx, `
		SELECT p.id, p.household_id, p.owner_id, u.name as owner_name,
		       p.name, p.icon, p.goal_amount, p.note, p.category_id, p.is_active,
		       p.created_at, p.updated_at
		FROM pockets p
		JOIN users u ON p.owner_id = u.id
		WHERE p.household_id = $1 AND p.name = $2
	`, householdID, name).Scan(
		&pocket.ID,
		&pocket.HouseholdID,
		&pocket.OwnerID,
		&pocket.OwnerName,
		&pocket.Name,
		&pocket.Icon,
		&pocket.GoalAmount,
		&pocket.Note,
		&pocket.CategoryID,
		&pocket.IsActive,
		&pocket.CreatedAt,
		&pocket.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	balance, err := r.GetBalance(ctx, pocket.ID)
	if err != nil {
		return nil, err
	}
	pocket.Balance = &balance

	return &pocket, nil
}

// GetBalance calculates the current balance of a pocket from its transactions
func (r *repository) GetBalance(ctx context.Context, id string) (float64, error) {
	var balance float64
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(
			SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END),
			0
		)
		FROM pocket_transactions
		WHERE pocket_id = $1
	`, id).Scan(&balance)
	if err != nil {
		return 0, err
	}
	return balance, nil
}

// GetBalanceForUpdate calculates the pocket balance within a transaction, locking the pocket row
func (r *repository) GetBalanceForUpdate(ctx context.Context, tx any, id string) (float64, error) {
	pgxTx, ok := tx.(pgx.Tx)
	if !ok {
		return 0, fmt.Errorf("invalid transaction type")
	}

	// Lock the pocket row to prevent concurrent modifications
	_, err := pgxTx.Exec(ctx, `SELECT id FROM pockets WHERE id = $1 FOR UPDATE`, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrPocketNotFound
		}
		return 0, err
	}

	var balance float64
	err = pgxTx.QueryRow(ctx, `
		SELECT COALESCE(
			SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END),
			0
		)
		FROM pocket_transactions
		WHERE pocket_id = $1
	`, id).Scan(&balance)
	if err != nil {
		return 0, err
	}

	return balance, nil
}

// --- Pocket Transactions ---

// CreateTransaction creates a new pocket transaction
func (r *repository) CreateTransaction(ctx context.Context, ptx *PocketTransaction) (*PocketTransaction, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO pocket_transactions (
			pocket_id, household_id, type, amount, description, transaction_date,
			source_account_id, destination_account_id, linked_movement_id, created_by
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
	`, ptx.PocketID, ptx.HouseholdID, ptx.Type, ptx.Amount, ptx.Description,
		ptx.TransactionDate, ptx.SourceAccountID,
		ptx.DestinationAccountID, ptx.LinkedMovementID, ptx.CreatedBy).Scan(&id)

	if err != nil {
		return nil, err
	}

	return r.GetTransactionByID(ctx, id)
}

// GetTransactionByID retrieves a pocket transaction by ID with enriched names
func (r *repository) GetTransactionByID(ctx context.Context, id string) (*PocketTransaction, error) {
	var ptx PocketTransaction
	err := r.pool.QueryRow(ctx, `
		SELECT pt.id, pt.pocket_id, pt.household_id, pt.type, pt.amount,
		       pt.description, pt.transaction_date,
		       pt.source_account_id, sa.name as source_account_name,
		       pt.destination_account_id, da.name as destination_account_name,
		       pt.linked_movement_id, pt.created_by, u.name as created_by_name,
		       pt.created_at
		FROM pocket_transactions pt
		LEFT JOIN accounts sa ON pt.source_account_id = sa.id
		LEFT JOIN accounts da ON pt.destination_account_id = da.id
		JOIN users u ON pt.created_by = u.id
		WHERE pt.id = $1
	`, id).Scan(
		&ptx.ID,
		&ptx.PocketID,
		&ptx.HouseholdID,
		&ptx.Type,
		&ptx.Amount,
		&ptx.Description,
		&ptx.TransactionDate,
		&ptx.SourceAccountID,
		&ptx.SourceAccountName,
		&ptx.DestinationAccountID,
		&ptx.DestinationAccountName,
		&ptx.LinkedMovementID,
		&ptx.CreatedBy,
		&ptx.CreatedByName,
		&ptx.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTransactionNotFound
		}
		return nil, err
	}

	return &ptx, nil
}

// UpdateTransaction dynamically updates fields on a pocket transaction
func (r *repository) UpdateTransaction(ctx context.Context, id string, input *EditTransactionInput) (*PocketTransaction, error) {
	var setClauses []string
	var args []any
	argNum := 1

	if input.Amount != nil {
		setClauses = append(setClauses, fmt.Sprintf("amount = $%d", argNum))
		args = append(args, *input.Amount)
		argNum++
	}
	if input.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argNum))
		args = append(args, *input.Description)
		argNum++
	}
	if input.TransactionDate != nil {
		setClauses = append(setClauses, fmt.Sprintf("transaction_date = $%d", argNum))
		args = append(args, *input.TransactionDate)
		argNum++
	}
	if input.SourceAccountID != nil {
		setClauses = append(setClauses, fmt.Sprintf("source_account_id = $%d", argNum))
		args = append(args, *input.SourceAccountID)
		argNum++
	}
	if input.DestinationAccountID != nil {
		setClauses = append(setClauses, fmt.Sprintf("destination_account_id = $%d", argNum))
		args = append(args, *input.DestinationAccountID)
		argNum++
	}

	if len(setClauses) == 0 {
		return r.GetTransactionByID(ctx, id)
	}

	query := fmt.Sprintf("UPDATE pocket_transactions SET %s WHERE id = $%d",
		strings.Join(setClauses, ", "), argNum)
	args = append(args, id)

	result, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return nil, err
	}

	if result.RowsAffected() == 0 {
		return nil, ErrTransactionNotFound
	}

	return r.GetTransactionByID(ctx, id)
}

// DeleteTransaction deletes a pocket transaction by ID
func (r *repository) DeleteTransaction(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM pocket_transactions WHERE id = $1
	`, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrTransactionNotFound
	}

	return nil
}

// ListTransactions retrieves all transactions for a pocket, ordered by date descending
func (r *repository) ListTransactions(ctx context.Context, pocketID string) ([]*PocketTransaction, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT pt.id, pt.pocket_id, pt.household_id, pt.type, pt.amount,
		       pt.description, pt.transaction_date,
		       pt.source_account_id, sa.name as source_account_name,
		       pt.destination_account_id, da.name as destination_account_name,
		       pt.linked_movement_id, pt.created_by, u.name as created_by_name,
		       pt.created_at
		FROM pocket_transactions pt
		LEFT JOIN accounts sa ON pt.source_account_id = sa.id
		LEFT JOIN accounts da ON pt.destination_account_id = da.id
		JOIN users u ON pt.created_by = u.id
		WHERE pt.pocket_id = $1
		ORDER BY pt.transaction_date DESC, pt.created_at DESC
	`, pocketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []*PocketTransaction
	for rows.Next() {
		var ptx PocketTransaction
		err := rows.Scan(
			&ptx.ID,
			&ptx.PocketID,
			&ptx.HouseholdID,
			&ptx.Type,
			&ptx.Amount,
			&ptx.Description,
			&ptx.TransactionDate,
			&ptx.SourceAccountID,
			&ptx.SourceAccountName,
			&ptx.DestinationAccountID,
			&ptx.DestinationAccountName,
			&ptx.LinkedMovementID,
			&ptx.CreatedBy,
			&ptx.CreatedByName,
			&ptx.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, &ptx)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return transactions, nil
}

// GetTransactionByLinkedMovementID finds a pocket transaction linked to a movement, returns nil,nil if not found
func (r *repository) GetTransactionByLinkedMovementID(ctx context.Context, movementID string) (*PocketTransaction, error) {
	var ptx PocketTransaction
	err := r.pool.QueryRow(ctx, `
		SELECT pt.id, pt.pocket_id, pt.household_id, pt.type, pt.amount,
		       pt.description, pt.transaction_date,
		       pt.source_account_id, sa.name as source_account_name,
		       pt.destination_account_id, da.name as destination_account_name,
		       pt.linked_movement_id, pt.created_by, u.name as created_by_name,
		       pt.created_at
		FROM pocket_transactions pt
		LEFT JOIN accounts sa ON pt.source_account_id = sa.id
		LEFT JOIN accounts da ON pt.destination_account_id = da.id
		JOIN users u ON pt.created_by = u.id
		WHERE pt.linked_movement_id = $1
	`, movementID).Scan(
		&ptx.ID,
		&ptx.PocketID,
		&ptx.HouseholdID,
		&ptx.Type,
		&ptx.Amount,
		&ptx.Description,
		&ptx.TransactionDate,
		&ptx.SourceAccountID,
		&ptx.SourceAccountName,
		&ptx.DestinationAccountID,
		&ptx.DestinationAccountName,
		&ptx.LinkedMovementID,
		&ptx.CreatedBy,
		&ptx.CreatedByName,
		&ptx.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &ptx, nil
}

// --- DB Transaction Support ---

// BeginTx starts a new database transaction
func (r *repository) BeginTx(ctx context.Context) (any, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	return tx, nil
}

// CommitTx commits a database transaction
func (r *repository) CommitTx(ctx context.Context, tx any) error {
	pgxTx, ok := tx.(pgx.Tx)
	if !ok {
		return fmt.Errorf("invalid transaction type")
	}
	return pgxTx.Commit(ctx)
}

// RollbackTx rolls back a database transaction
func (r *repository) RollbackTx(ctx context.Context, tx any) error {
	pgxTx, ok := tx.(pgx.Tx)
	if !ok {
		return fmt.Errorf("invalid transaction type")
	}
	return pgxTx.Rollback(ctx)
}

// CreateTransactionInTx creates a pocket transaction within an existing database transaction.
// Returns basic fields only (no enriched names) since the tx may not be committed yet.
func (r *repository) CreateTransactionInTx(ctx context.Context, tx any, ptx *PocketTransaction) (*PocketTransaction, error) {
	pgxTx, ok := tx.(pgx.Tx)
	if !ok {
		return nil, fmt.Errorf("invalid transaction type")
	}

	var result PocketTransaction
	err := pgxTx.QueryRow(ctx, `
		INSERT INTO pocket_transactions (
			pocket_id, household_id, type, amount, description, transaction_date,
			source_account_id, destination_account_id, linked_movement_id, created_by
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, pocket_id, household_id, type, amount, description, transaction_date,
		          source_account_id, destination_account_id, linked_movement_id,
		          created_by, created_at
	`, ptx.PocketID, ptx.HouseholdID, ptx.Type, ptx.Amount, ptx.Description,
		ptx.TransactionDate, ptx.SourceAccountID,
		ptx.DestinationAccountID, ptx.LinkedMovementID, ptx.CreatedBy).Scan(
		&result.ID,
		&result.PocketID,
		&result.HouseholdID,
		&result.Type,
		&result.Amount,
		&result.Description,
		&result.TransactionDate,
		&result.SourceAccountID,
		&result.DestinationAccountID,
		&result.LinkedMovementID,
		&result.CreatedBy,
		&result.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &result, nil
}
