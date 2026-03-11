package paymentmethods

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

// NewRepository creates a new payment method repository
func NewRepository(pool *pgxpool.Pool) Repository {
return &repository{pool: pool}
}

// Create creates a new payment method
func (r *repository) Create(ctx context.Context, pm *PaymentMethod) (*PaymentMethod, error) {
	var result PaymentMethod
	var isActiveFromDB bool
	err := r.pool.QueryRow(ctx, `
		INSERT INTO payment_methods (
			household_id, owner_id, name, type, is_shared_with_household,
			last4, institution, notes, is_active, cutoff_day, linked_account_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, household_id, owner_id, name, type, is_shared_with_household,
		          last4, institution, notes, is_active, created_at, updated_at,
		          cutoff_day, linked_account_id
	`, pm.HouseholdID, pm.OwnerID, pm.Name, pm.Type, pm.IsSharedWithHousehold,
	   pm.Last4, pm.Institution, pm.Notes, pm.IsActive, pm.CutoffDay, pm.LinkedAccountID).Scan(
		&result.ID,
		&result.HouseholdID,
		&result.OwnerID,
		&result.Name,
		&result.Type,
		&result.IsSharedWithHousehold,
		&result.Last4,
		&result.Institution,
		&result.Notes,
		&isActiveFromDB,
		&result.CreatedAt,
		&result.UpdatedAt,
		&result.CutoffDay,
		&result.LinkedAccountID,
	)

	if err != nil {
		// Check for unique constraint violation
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrPaymentMethodNameExists
		}
		return nil, err
	}

	result.IsActive = isActiveFromDB
	return &result, nil
}

// GetByID retrieves a payment method by ID
func (r *repository) GetByID(ctx context.Context, id string) (*PaymentMethod, error) {
var pm PaymentMethod
err := r.pool.QueryRow(ctx, `
SELECT pm.id, pm.household_id, pm.owner_id, pm.name, pm.type,
       pm.is_shared_with_household, pm.last4, pm.institution, pm.notes,
       pm.is_active, pm.created_at, pm.updated_at, u.name as owner_name,
       pm.cutoff_day, pm.linked_account_id, a.name as linked_account_name
FROM payment_methods pm
JOIN users u ON pm.owner_id = u.id
LEFT JOIN accounts a ON pm.linked_account_id = a.id
WHERE pm.id = $1
`, id).Scan(
&pm.ID,
&pm.HouseholdID,
&pm.OwnerID,
&pm.Name,
&pm.Type,
&pm.IsSharedWithHousehold,
&pm.Last4,
&pm.Institution,
&pm.Notes,
&pm.IsActive,
&pm.CreatedAt,
&pm.UpdatedAt,
&pm.OwnerName,
&pm.CutoffDay,
&pm.LinkedAccountID,
&pm.LinkedAccountName,
)

if err != nil {
if errors.Is(err, pgx.ErrNoRows) {
return nil, ErrPaymentMethodNotFound
}
return nil, err
}

return &pm, nil
}

// Update updates a payment method
func (r *repository) Update(ctx context.Context, pm *PaymentMethod) (*PaymentMethod, error) {
	var result PaymentMethod
	var isActiveFromDB bool
	err := r.pool.QueryRow(ctx, `
		UPDATE payment_methods
		SET name = $1, is_shared_with_household = $2, last4 = $3,
		    institution = $4, notes = $5, is_active = $6, updated_at = NOW(),
		    cutoff_day = $7, linked_account_id = $8
		WHERE id = $9
		RETURNING id, household_id, owner_id, name, type, is_shared_with_household,
		          last4, institution, notes, is_active, created_at, updated_at,
		          cutoff_day, linked_account_id
	`, pm.Name, pm.IsSharedWithHousehold, pm.Last4, pm.Institution, pm.Notes, pm.IsActive,
	   pm.CutoffDay, pm.LinkedAccountID, pm.ID).Scan(
		&result.ID,
		&result.HouseholdID,
		&result.OwnerID,
		&result.Name,
		&result.Type,
		&result.IsSharedWithHousehold,
		&result.Last4,
		&result.Institution,
		&result.Notes,
		&isActiveFromDB,
		&result.CreatedAt,
		&result.UpdatedAt,
		&result.CutoffDay,
		&result.LinkedAccountID,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPaymentMethodNotFound
		}
		// Check for unique constraint violation
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrPaymentMethodNameExists
		}
		return nil, err
	}

	result.IsActive = isActiveFromDB
	return &result, nil
}

// Delete soft-deletes a payment method by setting is_active = false.
// This preserves referential integrity with movements that reference it.
func (r *repository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `
		UPDATE payment_methods SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true
	`, id)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrPaymentMethodNotFound
	}

	return nil
}

// ListByHousehold retrieves all payment methods for a household
func (r *repository) ListByHousehold(ctx context.Context, householdID string) ([]*PaymentMethod, error) {
rows, err := r.pool.Query(ctx, `
SELECT pm.id, pm.household_id, pm.owner_id, pm.name, pm.type,
       pm.is_shared_with_household, pm.last4, pm.institution, pm.notes,
       pm.is_active, pm.created_at, pm.updated_at, u.name as owner_name,
       pm.cutoff_day, pm.linked_account_id, a.name as linked_account_name
FROM payment_methods pm
JOIN users u ON pm.owner_id = u.id
LEFT JOIN accounts a ON pm.linked_account_id = a.id
WHERE pm.household_id = $1 AND pm.is_active = true
ORDER BY pm.is_shared_with_household DESC, pm.name ASC
`, householdID)

if err != nil {
return nil, err
}
defer rows.Close()

var methods []*PaymentMethod
for rows.Next() {
var pm PaymentMethod
err := rows.Scan(
&pm.ID,
&pm.HouseholdID,
&pm.OwnerID,
&pm.Name,
&pm.Type,
&pm.IsSharedWithHousehold,
&pm.Last4,
&pm.Institution,
&pm.Notes,
&pm.IsActive,
&pm.CreatedAt,
&pm.UpdatedAt,
&pm.OwnerName,
&pm.CutoffDay,
&pm.LinkedAccountID,
&pm.LinkedAccountName,
)
if err != nil {
return nil, err
}
methods = append(methods, &pm)
}

if err = rows.Err(); err != nil {
return nil, err
}

return methods, nil
}

// FindByName finds a payment method by name in a household
func (r *repository) FindByName(ctx context.Context, householdID, name string) (*PaymentMethod, error) {
var pm PaymentMethod
err := r.pool.QueryRow(ctx, `
SELECT id, household_id, owner_id, name, type, is_shared_with_household,
       last4, institution, notes, is_active, created_at, updated_at,
       cutoff_day, linked_account_id
FROM payment_methods
WHERE household_id = $1 AND name = $2 AND is_active = true
`, householdID, name).Scan(
&pm.ID,
&pm.HouseholdID,
&pm.OwnerID,
&pm.Name,
&pm.Type,
&pm.IsSharedWithHousehold,
&pm.Last4,
&pm.Institution,
&pm.Notes,
&pm.IsActive,
&pm.CreatedAt,
&pm.UpdatedAt,
&pm.CutoffDay,
&pm.LinkedAccountID,
)

if err != nil {
if errors.Is(err, pgx.ErrNoRows) {
return nil, ErrPaymentMethodNotFound
}
return nil, err
}

return &pm, nil
}
