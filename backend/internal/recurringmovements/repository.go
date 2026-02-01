package recurringmovements

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

// NewRepository creates a new recurring movements repository
func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

// Create creates a new recurring movement template (and participants if SPLIT type)
func (r *repository) Create(ctx context.Context, input *CreateTemplateInput, householdID string) (*RecurringMovementTemplate, error) {
	// Start transaction
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Set defaults
	isActive := true
	if input.IsActive != nil {
		isActive = *input.IsActive
	}
	autoGenerate := false
	if input.AutoGenerate != nil {
		autoGenerate = *input.AutoGenerate
	}

	// Calculate next_scheduled_date if auto_generate is true
	var nextScheduled *time.Time
	if autoGenerate && input.StartDate != nil && input.StartDate.Valid {
		next := calculateNextScheduledDate(input.StartDate.Time, input.RecurrencePattern, input.DayOfMonth, input.DayOfYear)
		nextScheduled = &next
	}

	// Insert template
	var template RecurringMovementTemplate
	
	// Convert StartDate to *time.Time
	var startDate *time.Time
	if input.StartDate != nil {
		startDate = input.StartDate.ToTimePtr()
	}
	
	err = tx.QueryRow(ctx, `
		INSERT INTO recurring_movement_templates (
			household_id, name, description, is_active,
			type, category_id,
			amount, currency,
			auto_generate,
			payer_user_id, payer_contact_id,
			counterparty_user_id, counterparty_contact_id,
			payment_method_id,
			recurrence_pattern, day_of_month, day_of_year,
			start_date,
			next_scheduled_date
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
		RETURNING id, household_id, name, description, is_active,
		          type, category_id,
		          amount, currency,
		          auto_generate,
		          payer_user_id, payer_contact_id,
		          counterparty_user_id, counterparty_contact_id,
		          payment_method_id,
		          recurrence_pattern, day_of_month, day_of_year,
		          start_date,
		          last_generated_date, next_scheduled_date,
		          created_at, updated_at
	`,
		householdID, input.Name, input.Description, isActive,
		input.MovementType, input.CategoryID,
		input.Amount, "COP", // Currency defaults to COP
		autoGenerate,
		input.PayerUserID, input.PayerContactID,
		input.CounterpartyUserID, input.CounterpartyContactID,
		input.PaymentMethodID, 
		input.RecurrencePattern, input.DayOfMonth, input.DayOfYear,
		startDate, 
		nextScheduled,
	).Scan(
		&template.ID,
		&template.HouseholdID,
		&template.Name,
		&template.Description,
		&template.IsActive,
		&template.MovementType,
		&template.CategoryID,
		&template.Amount,
		&template.Currency,
		&template.AutoGenerate,
		&template.PayerUserID,
		&template.PayerContactID,
		&template.CounterpartyUserID,
		&template.CounterpartyContactID,
		&template.PaymentMethodID,
		
		&template.RecurrencePattern,
		&template.DayOfMonth,
		&template.DayOfYear,
		&template.StartDate,
		
		&template.LastGeneratedDate,
		&template.NextScheduledDate,
		&template.CreatedAt,
		&template.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Insert participants if SPLIT type
	if input.MovementType != nil && *input.MovementType == "SPLIT" && len(input.Participants) > 0 {
		for _, p := range input.Participants {
			_, err := tx.Exec(ctx, `
				INSERT INTO recurring_movement_participants (
					template_id, participant_user_id, participant_contact_id, percentage
				)
				VALUES ($1, $2, $3, $4)
			`, template.ID, p.ParticipantUserID, p.ParticipantContactID, p.Percentage)
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
	enriched, err := r.GetByID(ctx, template.ID)
	if err != nil {
		return nil, err
	}

	return enriched, nil
}

// GetByID retrieves a template by ID with all joins
func (r *repository) GetByID(ctx context.Context, id string) (*RecurringMovementTemplate, error) {
	var template RecurringMovementTemplate
	
	query := `
		SELECT 
			t.id, t.household_id, t.name, t.description, t.is_active,
			t.type, t.category_id,
			t.amount, t.currency,
			t.auto_generate,
			t.payer_user_id, t.payer_contact_id,
			t.counterparty_user_id, t.counterparty_contact_id,
			t.payment_method_id,
			t.recurrence_pattern, t.day_of_month, t.day_of_year,
			t.start_date,
			t.last_generated_date, t.next_scheduled_date,
			t.created_at, t.updated_at,
			-- Payer name
			COALESCE(payer_user.name, payer_contact.name) as payer_name,
			-- Counterparty name
			COALESCE(counterparty_user.name, counterparty_contact.name) as counterparty_name,
			-- Payment method name
			pm.name as payment_method_name
			-- Receiver account name
		FROM recurring_movement_templates t
		LEFT JOIN users payer_user ON t.payer_user_id = payer_user.id
		LEFT JOIN contacts payer_contact ON t.payer_contact_id = payer_contact.id
		LEFT JOIN users counterparty_user ON t.counterparty_user_id = counterparty_user.id
		LEFT JOIN contacts counterparty_contact ON t.counterparty_contact_id = counterparty_contact.id
		LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
		WHERE t.id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&template.ID,
		&template.HouseholdID,
		&template.Name,
		&template.Description,
		&template.IsActive,
		&template.MovementType,
		&template.CategoryID,
		&template.Amount,
		&template.Currency,
		&template.AutoGenerate,
		&template.PayerUserID,
		&template.PayerContactID,
		&template.CounterpartyUserID,
		&template.CounterpartyContactID,
		&template.PaymentMethodID,
		
		&template.RecurrencePattern,
		&template.DayOfMonth,
		&template.DayOfYear,
		&template.StartDate,
		
		&template.LastGeneratedDate,
		&template.NextScheduledDate,
		&template.CreatedAt,
		&template.UpdatedAt,
		&template.PayerName,
		&template.CounterpartyName,
		&template.PaymentMethodName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTemplateNotFound
		}
		return nil, err
	}

	// Get participants if SPLIT type
	if template.MovementType != nil && *template.MovementType == "SPLIT" {
		participants, err := r.getParticipants(ctx, template.ID)
		if err != nil {
			return nil, err
		}
		template.Participants = participants
	}

	return &template, nil
}

// getParticipants retrieves participants for a template
func (r *repository) getParticipants(ctx context.Context, templateID string) ([]TemplateParticipant, error) {
	query := `
		SELECT 
			p.id, p.template_id,
			p.participant_user_id, p.participant_contact_id,
			p.percentage, p.created_at,
			COALESCE(u.name, c.name) as participant_name
		FROM recurring_movement_participants p
		LEFT JOIN users u ON p.participant_user_id = u.id
		LEFT JOIN contacts c ON p.participant_contact_id = c.id
		WHERE p.template_id = $1
		ORDER BY p.created_at ASC
	`

	rows, err := r.pool.Query(ctx, query, templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var participants []TemplateParticipant
	for rows.Next() {
		var p TemplateParticipant
		err := rows.Scan(
			&p.ID,
			&p.TemplateID,
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

// ListByHousehold retrieves all templates for a household with optional filters
func (r *repository) ListByHousehold(ctx context.Context, householdID string, filters *ListTemplatesFilters) ([]*RecurringMovementTemplate, error) {
	query := `
		SELECT 
			t.id, t.household_id, t.name, t.description, t.is_active,
			t.type, t.category_id,
			t.amount, t.currency,
			t.auto_generate,
			t.payer_user_id, t.payer_contact_id,
			t.counterparty_user_id, t.counterparty_contact_id,
			t.payment_method_id,
			t.recurrence_pattern, t.day_of_month, t.day_of_year,
			t.start_date,
			t.last_generated_date, t.next_scheduled_date,
			t.created_at, t.updated_at,
			COALESCE(payer_user.name, payer_contact.name) as payer_name,
			COALESCE(counterparty_user.name, counterparty_contact.name) as counterparty_name,
			pm.name as payment_method_name
		FROM recurring_movement_templates t
		LEFT JOIN users payer_user ON t.payer_user_id = payer_user.id
		LEFT JOIN contacts payer_contact ON t.payer_contact_id = payer_contact.id
		LEFT JOIN users counterparty_user ON t.counterparty_user_id = counterparty_user.id
		LEFT JOIN contacts counterparty_contact ON t.counterparty_contact_id = counterparty_contact.id
		LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
		WHERE t.household_id = $1
	`

	var conditions []string
	args := []interface{}{householdID}
	argIndex := 2

	// Apply filters
	if filters != nil {
		if filters.CategoryID != nil {
			conditions = append(conditions, fmt.Sprintf("t.category_id = $%d", argIndex))
			args = append(args, *filters.CategoryID)
			argIndex++
		}
		if filters.IsActive != nil {
			conditions = append(conditions, fmt.Sprintf("t.is_active = $%d", argIndex))
			args = append(args, *filters.IsActive)
			argIndex++
		}
		if filters.MovementType != nil {
			conditions = append(conditions, fmt.Sprintf("t.type = $%d", argIndex))
			args = append(args, *filters.MovementType)
			argIndex++
		}
	}

	if len(conditions) > 0 {
		query += " AND " + strings.Join(conditions, " AND ")
	}

	query += " ORDER BY t.name ASC"

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []*RecurringMovementTemplate
	for rows.Next() {
		var t RecurringMovementTemplate
		err := rows.Scan(
			&t.ID,
			&t.HouseholdID,
			&t.Name,
			&t.Description,
			&t.IsActive,
			&t.MovementType,
			&t.CategoryID,
			
			&t.Amount,
			&t.Currency,
			&t.AutoGenerate,
			&t.PayerUserID,
			&t.PayerContactID,
			&t.CounterpartyUserID,
			&t.CounterpartyContactID,
			&t.PaymentMethodID,
			&t.RecurrencePattern,
			&t.DayOfMonth,
			&t.DayOfYear,
			&t.StartDate,
			&t.LastGeneratedDate,
			&t.NextScheduledDate,
			&t.CreatedAt,
			&t.UpdatedAt,
			&t.PayerName,
			&t.CounterpartyName,
			&t.PaymentMethodName,
		)
		if err != nil {
			return nil, err
		}

		// Get participants if SPLIT type
		if t.MovementType != nil && *t.MovementType == "SPLIT" {
			participants, err := r.getParticipants(ctx, t.ID)
			if err != nil {
				return nil, err
			}
			t.Participants = participants
		}

		templates = append(templates, &t)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return templates, nil
}

// ListByCategory retrieves all active templates for a specific category
func (r *repository) ListByCategory(ctx context.Context, categoryID string) ([]*RecurringMovementTemplate, error) {
	query := `
		SELECT 
			t.id, t.household_id, t.name, t.description, t.is_active,
			t.type, t.category_id,
			t.amount, t.currency,
			t.auto_generate,
			t.payer_user_id, t.payer_contact_id,
			t.counterparty_user_id, t.counterparty_contact_id,
			t.payment_method_id,
			t.recurrence_pattern, t.day_of_month, t.day_of_year,
			t.start_date,
			t.last_generated_date, t.next_scheduled_date,
			t.created_at, t.updated_at,
			COALESCE(payer_user.name, payer_contact.name) as payer_name,
			COALESCE(counterparty_user.name, counterparty_contact.name) as counterparty_name,
			pm.name as payment_method_name
		FROM recurring_movement_templates t
		LEFT JOIN users payer_user ON t.payer_user_id = payer_user.id
		LEFT JOIN contacts payer_contact ON t.payer_contact_id = payer_contact.id
		LEFT JOIN users counterparty_user ON t.counterparty_user_id = counterparty_user.id
		LEFT JOIN contacts counterparty_contact ON t.counterparty_contact_id = counterparty_contact.id
		LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
		WHERE t.category_id = $1 AND t.is_active = true
		ORDER BY t.name ASC
	`

	rows, err := r.pool.Query(ctx, query, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []*RecurringMovementTemplate
	for rows.Next() {
		var t RecurringMovementTemplate
		err := rows.Scan(
			&t.ID,
			&t.HouseholdID,
			&t.Name,
			&t.Description,
			&t.IsActive,
			&t.MovementType,
			&t.CategoryID,
			
			&t.Amount,
			&t.Currency,
			&t.AutoGenerate,
			&t.PayerUserID,
			&t.PayerContactID,
			&t.CounterpartyUserID,
			&t.CounterpartyContactID,
			&t.PaymentMethodID,
			&t.RecurrencePattern,
			&t.DayOfMonth,
			&t.DayOfYear,
			&t.StartDate,
			&t.LastGeneratedDate,
			&t.NextScheduledDate,
			&t.CreatedAt,
			&t.UpdatedAt,
			&t.PayerName,
			&t.CounterpartyName,
			&t.PaymentMethodName,
		)
		if err != nil {
			return nil, err
		}

		// Get participants if SPLIT type
		if t.MovementType != nil && *t.MovementType == "SPLIT" {
			participants, err := r.getParticipants(ctx, t.ID)
			if err != nil {
				return nil, err
			}
			t.Participants = participants
		}

		templates = append(templates, &t)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return templates, nil
}

// ListPendingAutoGeneration retrieves templates that need to generate movements
func (r *repository) ListPendingAutoGeneration(ctx context.Context, now time.Time) ([]*RecurringMovementTemplate, error) {
	query := `
		SELECT 
			t.id, t.household_id, t.name, t.description, t.is_active,
			t.type, t.category_id,
			t.amount, t.currency,
			t.auto_generate,
			t.payer_user_id, t.payer_contact_id,
			t.counterparty_user_id, t.counterparty_contact_id,
			t.payment_method_id,
			t.recurrence_pattern, t.day_of_month, t.day_of_year,
			t.start_date,
			t.last_generated_date, t.next_scheduled_date,
			t.created_at, t.updated_at,
			COALESCE(payer_user.name, payer_contact.name) as payer_name,
			COALESCE(counterparty_user.name, counterparty_contact.name) as counterparty_name,
			pm.name as payment_method_name
		FROM recurring_movement_templates t
		LEFT JOIN users payer_user ON t.payer_user_id = payer_user.id
		LEFT JOIN contacts payer_contact ON t.payer_contact_id = payer_contact.id
		LEFT JOIN users counterparty_user ON t.counterparty_user_id = counterparty_user.id
		LEFT JOIN contacts counterparty_contact ON t.counterparty_contact_id = counterparty_contact.id
		LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
		WHERE t.is_active = true
		  AND t.auto_generate = true
		  AND t.next_scheduled_date IS NOT NULL
		  AND t.next_scheduled_date <= $1
		ORDER BY t.next_scheduled_date ASC
	`

	rows, err := r.pool.Query(ctx, query, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []*RecurringMovementTemplate
	for rows.Next() {
		var t RecurringMovementTemplate
		err := rows.Scan(
			&t.ID,
			&t.HouseholdID,
			&t.Name,
			&t.Description,
			&t.IsActive,
			&t.MovementType,
			&t.CategoryID,
			
			&t.Amount,
			&t.Currency,
			&t.AutoGenerate,
			&t.PayerUserID,
			&t.PayerContactID,
			&t.CounterpartyUserID,
			&t.CounterpartyContactID,
			&t.PaymentMethodID,
			&t.RecurrencePattern,
			&t.DayOfMonth,
			&t.DayOfYear,
			&t.StartDate,
			&t.LastGeneratedDate,
			&t.NextScheduledDate,
			&t.CreatedAt,
			&t.UpdatedAt,
			&t.PayerName,
			&t.CounterpartyName,
			&t.PaymentMethodName,
		)
		if err != nil {
			return nil, err
		}

		// Get participants if SPLIT type
		if t.MovementType != nil && *t.MovementType == "SPLIT" {
			participants, err := r.getParticipants(ctx, t.ID)
			if err != nil {
				return nil, err
			}
			t.Participants = participants
		}

		templates = append(templates, &t)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return templates, nil
}

// Update updates a template
func (r *repository) Update(ctx context.Context, id string, input *UpdateTemplateInput) (*RecurringMovementTemplate, error) {
	// Build dynamic update query
	var setClauses []string
	var args []interface{}
	argIndex := 1

	if input.Name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", argIndex))
		args = append(args, *input.Name)
		argIndex++
	}
	if input.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argIndex))
		args = append(args, *input.Description)
		argIndex++
	}
	if input.IsActive != nil {
		setClauses = append(setClauses, fmt.Sprintf("is_active = $%d", argIndex))
		args = append(args, *input.IsActive)
		argIndex++
	}
	if input.Amount != nil {
		setClauses = append(setClauses, fmt.Sprintf("amount = $%d", argIndex))
		args = append(args, *input.Amount)
		argIndex++
	}
	if input.MovementType != nil {
		setClauses = append(setClauses, fmt.Sprintf("type = $%d", argIndex))
		args = append(args, *input.MovementType)
		argIndex++
	}
	if input.CategoryID != nil {
		setClauses = append(setClauses, fmt.Sprintf("category_id = $%d", argIndex))
		args = append(args, *input.CategoryID)
		argIndex++
	}
	if input.AutoGenerate != nil {
		setClauses = append(setClauses, fmt.Sprintf("auto_generate = $%d", argIndex))
		args = append(args, *input.AutoGenerate)
		argIndex++
	}
	if input.RecurrencePattern != nil {
		setClauses = append(setClauses, fmt.Sprintf("recurrence_pattern = $%d", argIndex))
		args = append(args, *input.RecurrencePattern)
		argIndex++
	}
	if input.DayOfMonth != nil {
		setClauses = append(setClauses, fmt.Sprintf("day_of_month = $%d", argIndex))
		args = append(args, *input.DayOfMonth)
		argIndex++
	}
	if input.DayOfYear != nil {
		setClauses = append(setClauses, fmt.Sprintf("day_of_year = $%d", argIndex))
		args = append(args, *input.DayOfYear)
		argIndex++
	}
	if input.StartDate != nil {
		if input.StartDate.Valid {
			setClauses = append(setClauses, fmt.Sprintf("start_date = $%d", argIndex))
			args = append(args, input.StartDate.Time)
		} else {
			setClauses = append(setClauses, fmt.Sprintf("start_date = $%d", argIndex))
			args = append(args, nil)
		}
		argIndex++
	}
	
	// Payer fields - handle clearing when type changes
	if input.PayerUserID != nil {
		setClauses = append(setClauses, fmt.Sprintf("payer_user_id = $%d", argIndex))
		args = append(args, *input.PayerUserID)
		argIndex++
	} else if input.ClearPayer {
		setClauses = append(setClauses, fmt.Sprintf("payer_user_id = $%d", argIndex))
		args = append(args, nil)
		argIndex++
	}
	if input.PayerContactID != nil {
		setClauses = append(setClauses, fmt.Sprintf("payer_contact_id = $%d", argIndex))
		args = append(args, *input.PayerContactID)
		argIndex++
	} else if input.ClearPayer {
		setClauses = append(setClauses, fmt.Sprintf("payer_contact_id = $%d", argIndex))
		args = append(args, nil)
		argIndex++
	}
	
	// Counterparty fields
	if input.CounterpartyUserID != nil {
		setClauses = append(setClauses, fmt.Sprintf("counterparty_user_id = $%d", argIndex))
		args = append(args, *input.CounterpartyUserID)
		argIndex++
	} else if input.ClearCounterparty {
		setClauses = append(setClauses, fmt.Sprintf("counterparty_user_id = $%d", argIndex))
		args = append(args, nil)
		argIndex++
	}
	if input.CounterpartyContactID != nil {
		setClauses = append(setClauses, fmt.Sprintf("counterparty_contact_id = $%d", argIndex))
		args = append(args, *input.CounterpartyContactID)
		argIndex++
	} else if input.ClearCounterparty {
		setClauses = append(setClauses, fmt.Sprintf("counterparty_contact_id = $%d", argIndex))
		args = append(args, nil)
		argIndex++
	}
	
	if input.PaymentMethodID != nil {
		if *input.PaymentMethodID == "" {
			// Empty string means clear the field
			setClauses = append(setClauses, fmt.Sprintf("payment_method_id = $%d", argIndex))
			args = append(args, nil)
		} else {
			setClauses = append(setClauses, fmt.Sprintf("payment_method_id = $%d", argIndex))
			args = append(args, *input.PaymentMethodID)
		}
		argIndex++
	}
	if input.ReceiverAccountID != nil {
		if *input.ReceiverAccountID == "" {
			// Empty string means clear the field
			setClauses = append(setClauses, fmt.Sprintf("receiver_account_id = $%d", argIndex))
			args = append(args, nil)
		} else {
			setClauses = append(setClauses, fmt.Sprintf("receiver_account_id = $%d", argIndex))
			args = append(args, *input.ReceiverAccountID)
		}
		argIndex++
	} else if input.ClearReceiverAccount {
		setClauses = append(setClauses, fmt.Sprintf("receiver_account_id = $%d", argIndex))
		args = append(args, nil)
		argIndex++
	}

	if len(setClauses) == 0 && len(input.Participants) == 0 {
		// Nothing to update, just return current template
		return r.GetByID(ctx, id)
	}

	// Always update updated_at
	setClauses = append(setClauses, fmt.Sprintf("updated_at = $%d", argIndex))
	args = append(args, time.Now())
	argIndex++

	// Add ID as last parameter
	args = append(args, id)

	query := fmt.Sprintf(`
		UPDATE recurring_movement_templates
		SET %s
		WHERE id = $%d
	`, strings.Join(setClauses, ", "), argIndex)

	_, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return nil, err
	}

	// Update participants if provided
	if len(input.Participants) > 0 {
		// Delete existing participants
		_, err = r.pool.Exec(ctx, `
			DELETE FROM recurring_movement_participants
			WHERE template_id = $1
		`, id)
		if err != nil {
			return nil, err
		}
		
		// Insert new participants
		for _, p := range input.Participants {
			_, err = r.pool.Exec(ctx, `
				INSERT INTO recurring_movement_participants (template_id, participant_user_id, participant_contact_id, percentage)
				VALUES ($1, $2, $3, $4)
			`, id, p.ParticipantUserID, p.ParticipantContactID, p.Percentage)
			if err != nil {
				return nil, err
			}
		}
	}

	// Return updated template
	return r.GetByID(ctx, id)
}

// UpdateGenerationTracking updates last_generated_date and next_scheduled_date
func (r *repository) UpdateGenerationTracking(ctx context.Context, id string, lastGenerated, nextScheduled time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE recurring_movement_templates
		SET last_generated_date = $1,
		    next_scheduled_date = $2,
		    updated_at = $3
		WHERE id = $4
	`, lastGenerated, nextScheduled, time.Now(), id)
	
	return err
}

// Delete deletes a template
func (r *repository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM recurring_movement_templates
		WHERE id = $1
	`, id)
	
	if err != nil {
		return err
	}
	
	if result.RowsAffected() == 0 {
		return ErrTemplateNotFound
	}
	
	return nil
}

// calculateNextScheduledDate calculates the next scheduled date for a template
func calculateNextScheduledDate(from time.Time, pattern *RecurrencePattern, dayOfMonth, dayOfYear *int) time.Time {
	if pattern == nil {
		return from
	}

	switch *pattern {
	case RecurrenceMonthly:
		// Next month, same day
		if dayOfMonth == nil {
			return from.AddDate(0, 1, 0)
		}
		
		// Get next occurrence of dayOfMonth
		year, month, _ := from.Date()
		day := *dayOfMonth
		
		// Try current month first
		next := time.Date(year, month, day, 0, 0, 0, 0, from.Location())
		if next.After(from) {
			return next
		}
		
		// Otherwise next month
		next = time.Date(year, month+1, day, 0, 0, 0, 0, from.Location())
		
		// Handle month overflow (e.g., day 31 in February)
		if next.Month() != month+1 && next.Month() != 1 { // 1 = January (overflow from December)
			// Go to last day of target month
			next = time.Date(year, month+1, 1, 0, 0, 0, 0, from.Location()).AddDate(0, 1, -1)
		}
		
		return next
		
	case RecurrenceYearly:
		// Next year, same day of year
		if dayOfYear == nil {
			return from.AddDate(1, 0, 0)
		}
		
		year := from.Year()
		
		// Try current year first
		next := time.Date(year, 1, 1, 0, 0, 0, 0, from.Location()).AddDate(0, 0, *dayOfYear-1)
		if next.After(from) {
			return next
		}
		
		// Otherwise next year
		return time.Date(year+1, 1, 1, 0, 0, 0, 0, from.Location()).AddDate(0, 0, *dayOfYear-1)
		
	case RecurrenceOneTime:
		// No next date for one-time
		return from
		
	default:
		return from
	}
}
