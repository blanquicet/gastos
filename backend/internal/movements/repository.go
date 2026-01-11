package movements

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// repository implements Repository using PostgreSQL
type repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new movements repository
func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

// Create creates a new movement (and participants if SPLIT type)
func (r *repository) Create(ctx context.Context, input *CreateMovementInput, householdID string) (*Movement, error) {
	// Start transaction
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Insert movement
	var movement Movement
	err = tx.QueryRow(ctx, `
		INSERT INTO movements (
			household_id, type, description, amount, category_id, movement_date, currency,
			payer_user_id, payer_contact_id,
			counterparty_user_id, counterparty_contact_id,
			payment_method_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, household_id, type, description, amount, category_id, movement_date,
		          currency, payer_user_id, payer_contact_id,
		          counterparty_user_id, counterparty_contact_id,
		          payment_method_id, created_at, updated_at
	`,
		householdID, input.Type, input.Description, input.Amount, input.CategoryID,
		input.MovementDate, "COP", // Currency defaults to COP
		input.PayerUserID, input.PayerContactID,
		input.CounterpartyUserID, input.CounterpartyContactID,
		input.PaymentMethodID,
	).Scan(
		&movement.ID,
		&movement.HouseholdID,
		&movement.Type,
		&movement.Description,
		&movement.Amount,
		&movement.CategoryID,
		&movement.MovementDate,
		&movement.Currency,
		&movement.PayerUserID,
		&movement.PayerContactID,
		&movement.CounterpartyUserID,
		&movement.CounterpartyContactID,
		&movement.PaymentMethodID,
		&movement.CreatedAt,
		&movement.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Insert participants if SPLIT type
	if input.Type == TypeSplit && len(input.Participants) > 0 {
		for _, p := range input.Participants {
			_, err := tx.Exec(ctx, `
				INSERT INTO movement_participants (
					movement_id, participant_user_id, participant_contact_id, percentage
				)
				VALUES ($1, $2, $3, $4)
			`, movement.ID, p.ParticipantUserID, p.ParticipantContactID, p.Percentage)
			if err != nil {
				return nil, err
			}
		}
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Enrich with names
	enriched, err := r.GetByID(ctx, movement.ID)
	if err != nil {
		return nil, err
	}

	return enriched, nil
}

// GetByID retrieves a movement by ID with all joins
func (r *repository) GetByID(ctx context.Context, id string) (*Movement, error) {
	var movement Movement
	
	// Get movement with payer, counterparty, and payment method names
	query := `
		SELECT 
			m.id, m.household_id, m.type, m.description, m.amount, m.category,
			m.movement_date, m.currency,
			m.payer_user_id, m.payer_contact_id,
			m.counterparty_user_id, m.counterparty_contact_id,
			m.payment_method_id,
			m.created_at, m.updated_at,
			-- Payer name (user or contact)
			COALESCE(payer_user.name, payer_contact.name) as payer_name,
			-- Counterparty name (user or contact, if exists)
			COALESCE(counterparty_user.name, counterparty_contact.name) as counterparty_name,
			-- Payment method name (if exists)
			pm.name as payment_method_name
		FROM movements m
		LEFT JOIN users payer_user ON m.payer_user_id = payer_user.id
		LEFT JOIN contacts payer_contact ON m.payer_contact_id = payer_contact.id
		LEFT JOIN users counterparty_user ON m.counterparty_user_id = counterparty_user.id
		LEFT JOIN contacts counterparty_contact ON m.counterparty_contact_id = counterparty_contact.id
		LEFT JOIN payment_methods pm ON m.payment_method_id = pm.id
		WHERE m.id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&movement.ID,
		&movement.HouseholdID,
		&movement.Type,
		&movement.Description,
		&movement.Amount,
		&movement.Category,
		&movement.MovementDate,
		&movement.Currency,
		&movement.PayerUserID,
		&movement.PayerContactID,
		&movement.CounterpartyUserID,
		&movement.CounterpartyContactID,
		&movement.PaymentMethodID,
		&movement.CreatedAt,
		&movement.UpdatedAt,
		&movement.PayerName,
		&movement.CounterpartyName,
		&movement.PaymentMethodName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMovementNotFound
		}
		return nil, err
	}

	// Get participants if SPLIT type
	if movement.Type == TypeSplit {
		participants, err := r.getParticipants(ctx, movement.ID)
		if err != nil {
			return nil, err
		}
		movement.Participants = participants
	}

	return &movement, nil
}

// getParticipants retrieves participants for a movement
func (r *repository) getParticipants(ctx context.Context, movementID string) ([]Participant, error) {
	query := `
		SELECT 
			mp.id, mp.movement_id,
			mp.participant_user_id, mp.participant_contact_id,
			mp.percentage, mp.created_at,
			COALESCE(u.name, c.name) as participant_name
		FROM movement_participants mp
		LEFT JOIN users u ON mp.participant_user_id = u.id
		LEFT JOIN contacts c ON mp.participant_contact_id = c.id
		WHERE mp.movement_id = $1
		ORDER BY mp.created_at ASC
	`

	rows, err := r.pool.Query(ctx, query, movementID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var participants []Participant
	for rows.Next() {
		var p Participant
		err := rows.Scan(
			&p.ID,
			&p.MovementID,
			&p.ParticipantUserID,
			&p.ParticipantContactID,
			&p.Percentage,
			&p.CreatedAt,
			&p.ParticipantName,
		)
		if err != nil {
			return nil, err
		}
		participants = append(participants, p)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return participants, nil
}

// GetCategoryIDByName looks up a category ID by name within a household
func (r *repository) GetCategoryIDByName(ctx context.Context, householdID string, categoryName string) (string, error) {
	var categoryID string
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM categories
		WHERE household_id = $1 AND name = $2 AND is_active = true
		LIMIT 1
	`, householdID, categoryName).Scan(&categoryID)
	
	if err != nil {
		return "", err
	}
	
	return categoryID, nil
}

// ListByHousehold retrieves all movements for a household with optional filters
func (r *repository) ListByHousehold(ctx context.Context, householdID string, filters *ListMovementsFilters) ([]*Movement, error) {
	query := `
		SELECT 
			m.id, m.household_id, m.type, m.description, m.amount, m.category,
			m.movement_date, m.currency,
			m.payer_user_id, m.payer_contact_id,
			m.counterparty_user_id, m.counterparty_contact_id,
			m.payment_method_id,
			m.created_at, m.updated_at,
			COALESCE(payer_user.name, payer_contact.name) as payer_name,
			COALESCE(counterparty_user.name, counterparty_contact.name) as counterparty_name,
			pm.name as payment_method_name,
			c.id as category_id,
			c.name as category_name,
			cg.id as category_group_id,
			cg.name as category_group_name,
			cg.icon as category_group_icon
		FROM movements m
		LEFT JOIN users payer_user ON m.payer_user_id = payer_user.id
		LEFT JOIN contacts payer_contact ON m.payer_contact_id = payer_contact.id
		LEFT JOIN users counterparty_user ON m.counterparty_user_id = counterparty_user.id
		LEFT JOIN contacts counterparty_contact ON m.counterparty_contact_id = counterparty_contact.id
		LEFT JOIN payment_methods pm ON m.payment_method_id = pm.id
		LEFT JOIN categories c ON m.category_id = c.id
		LEFT JOIN category_groups cg ON c.category_group_id = cg.id
		WHERE m.household_id = $1
	`

	var args []interface{}
	args = append(args, householdID)
	argNum := 2

	// Apply filters
	if filters != nil {
		if filters.Type != nil {
			query += fmt.Sprintf(" AND m.type = $%d", argNum)
			args = append(args, *filters.Type)
			argNum++
		}
		if filters.Month != nil {
			query += fmt.Sprintf(" AND TO_CHAR(m.movement_date, 'YYYY-MM') = $%d", argNum)
			args = append(args, *filters.Month)
			argNum++
		}
		if filters.StartDate != nil {
			query += fmt.Sprintf(" AND m.movement_date >= $%d", argNum)
			args = append(args, *filters.StartDate)
			argNum++
		}
		if filters.EndDate != nil {
			query += fmt.Sprintf(" AND m.movement_date <= $%d", argNum)
			args = append(args, *filters.EndDate)
			argNum++
		}
		if filters.MemberID != nil {
			query += fmt.Sprintf(" AND m.payer_user_id = $%d", argNum)
			args = append(args, *filters.MemberID)
			argNum++
		}
	}

	query += " ORDER BY m.movement_date DESC, m.created_at DESC"

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	movements := make([]*Movement, 0)
	for rows.Next() {
		var m Movement
		err := rows.Scan(
			&m.ID,
			&m.HouseholdID,
			&m.Type,
			&m.Description,
			&m.Amount,
			&m.Category,
			&m.MovementDate,
			&m.Currency,
			&m.PayerUserID,
			&m.PayerContactID,
			&m.CounterpartyUserID,
			&m.CounterpartyContactID,
			&m.PaymentMethodID,
			&m.CreatedAt,
			&m.UpdatedAt,
			&m.PayerName,
			&m.CounterpartyName,
			&m.PaymentMethodName,
			&m.CategoryID,
			&m.CategoryName,
			&m.CategoryGroupID,
			&m.CategoryGroupName,
			&m.CategoryGroupIcon,
		)
		if err != nil {
			return nil, err
		}

		// Load participants if SPLIT
		if m.Type == TypeSplit {
			participants, err := r.getParticipants(ctx, m.ID)
			if err != nil {
				return nil, err
			}
			m.Participants = participants
		}

		movements = append(movements, &m)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return movements, nil
}

// GetTotals calculates totals for movements
func (r *repository) GetTotals(ctx context.Context, householdID string, filters *ListMovementsFilters) (*MovementTotals, error) {
	// Build WHERE clause
	whereClause := "WHERE m.household_id = $1"
	var args []interface{}
	args = append(args, householdID)
	argNum := 2

	if filters != nil {
		if filters.Type != nil {
			whereClause += fmt.Sprintf(" AND m.type = $%d", argNum)
			args = append(args, *filters.Type)
			argNum++
		}
		if filters.Month != nil {
			whereClause += fmt.Sprintf(" AND TO_CHAR(m.movement_date, 'YYYY-MM') = $%d", argNum)
			args = append(args, *filters.Month)
			argNum++
		}
		if filters.StartDate != nil {
			whereClause += fmt.Sprintf(" AND m.movement_date >= $%d", argNum)
			args = append(args, *filters.StartDate)
			argNum++
		}
		if filters.EndDate != nil {
			whereClause += fmt.Sprintf(" AND m.movement_date <= $%d", argNum)
			args = append(args, *filters.EndDate)
			argNum++
		}
		if filters.MemberID != nil {
			whereClause += fmt.Sprintf(" AND m.payer_user_id = $%d", argNum)
			args = append(args, *filters.MemberID)
			argNum++
		}
	}

	totals := &MovementTotals{
		ByType:          make(map[MovementType]float64),
		ByCategory:      make(map[string]float64),
		ByPaymentMethod: make(map[string]float64),
	}

	// Get total amount
	err := r.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT COALESCE(SUM(amount), 0) FROM movements m %s
	`, whereClause), args...).Scan(&totals.TotalAmount)
	if err != nil {
		return nil, err
	}

	// Get totals by type
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT type, SUM(amount) FROM movements m %s GROUP BY type
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var movType MovementType
		var sum float64
		if err := rows.Scan(&movType, &sum); err != nil {
			return nil, err
		}
		totals.ByType[movType] = sum
	}
	rows.Close()

	// Get totals by category
	rows, err = r.pool.Query(ctx, fmt.Sprintf(`
		SELECT category, SUM(amount) 
		FROM movements m 
		%s AND category IS NOT NULL 
		GROUP BY category
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var category string
		var sum float64
		if err := rows.Scan(&category, &sum); err != nil {
			return nil, err
		}
		totals.ByCategory[category] = sum
	}
	rows.Close()

	// Get totals by payment method
	rows, err = r.pool.Query(ctx, fmt.Sprintf(`
		SELECT pm.name, SUM(m.amount) 
		FROM movements m 
		JOIN payment_methods pm ON m.payment_method_id = pm.id
		%s AND m.payment_method_id IS NOT NULL
		GROUP BY pm.name
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var pmName string
		var sum float64
		if err := rows.Scan(&pmName, &sum); err != nil {
			return nil, err
		}
		totals.ByPaymentMethod[pmName] = sum
	}

	return totals, nil
}

// Update updates a movement
func (r *repository) Update(ctx context.Context, id string, input *UpdateMovementInput) (*Movement, error) {
	// Start a transaction for updating movement and participants
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Build SET clause dynamically for movement table
	var setClauses []string
	var args []interface{}
	argNum := 1

	if input.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argNum))
		args = append(args, *input.Description)
		argNum++
	}
	if input.Amount != nil {
		setClauses = append(setClauses, fmt.Sprintf("amount = $%d", argNum))
		args = append(args, *input.Amount)
		argNum++
	}
	if input.Category != nil {
		setClauses = append(setClauses, fmt.Sprintf("category = $%d", argNum))
		args = append(args, *input.Category)
		argNum++
	}
	if input.MovementDate != nil {
		setClauses = append(setClauses, fmt.Sprintf("movement_date = $%d", argNum))
		args = append(args, *input.MovementDate)
		argNum++
	}
	if input.PaymentMethodID != nil {
		setClauses = append(setClauses, fmt.Sprintf("payment_method_id = $%d", argNum))
		args = append(args, *input.PaymentMethodID)
		argNum++
	}
	
	// When updating payer, clear the other payer field (user vs contact are mutually exclusive)
	if input.PayerUserID != nil {
		setClauses = append(setClauses, fmt.Sprintf("payer_user_id = $%d", argNum))
		args = append(args, *input.PayerUserID)
		argNum++
		// Clear payer_contact_id when setting payer_user_id
		setClauses = append(setClauses, "payer_contact_id = NULL")
	}
	if input.PayerContactID != nil {
		setClauses = append(setClauses, fmt.Sprintf("payer_contact_id = $%d", argNum))
		args = append(args, *input.PayerContactID)
		argNum++
		// Clear payer_user_id when setting payer_contact_id
		setClauses = append(setClauses, "payer_user_id = NULL")
	}
	
	// When updating counterparty, clear the other counterparty field (user vs contact are mutually exclusive)
	if input.CounterpartyUserID != nil {
		setClauses = append(setClauses, fmt.Sprintf("counterparty_user_id = $%d", argNum))
		args = append(args, *input.CounterpartyUserID)
		argNum++
		// Clear counterparty_contact_id when setting counterparty_user_id
		setClauses = append(setClauses, "counterparty_contact_id = NULL")
	}
	if input.CounterpartyContactID != nil {
		setClauses = append(setClauses, fmt.Sprintf("counterparty_contact_id = $%d", argNum))
		args = append(args, *input.CounterpartyContactID)
		argNum++
		// Clear counterparty_user_id when setting counterparty_contact_id
		setClauses = append(setClauses, "counterparty_user_id = NULL")
	}

	if len(setClauses) > 0 {
		// Always update updated_at
		setClauses = append(setClauses, fmt.Sprintf("updated_at = $%d", argNum))
		args = append(args, "NOW()")
		argNum++

		// Add ID for WHERE clause
		args = append(args, id)

		query := fmt.Sprintf(`
			UPDATE movements 
			SET %s 
			WHERE id = $%d
			RETURNING id
		`, strings.Join(setClauses, ", "), argNum)

		var updatedID string
		err := tx.QueryRow(ctx, query, args...).Scan(&updatedID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrMovementNotFound
			}
			return nil, err
		}
	}

	// Update participants if provided
	if input.Participants != nil {
		// Delete existing participants
		_, err = tx.Exec(ctx, "DELETE FROM movement_participants WHERE movement_id = $1", id)
		if err != nil {
			return nil, err
		}

		// Insert new participants
		for _, p := range *input.Participants {
			query := `
				INSERT INTO movement_participants (
					movement_id, participant_user_id, participant_contact_id, percentage
				) VALUES ($1, $2, $3, $4)
			`
			_, err = tx.Exec(ctx, query, id, p.ParticipantUserID, p.ParticipantContactID, p.Percentage)
			if err != nil {
				return nil, err
			}
		}
	}

	// Commit transaction
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetByID(ctx, id)
}

// Delete deletes a movement
func (r *repository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, "DELETE FROM movements WHERE id = $1", id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrMovementNotFound
	}

	return nil
}
