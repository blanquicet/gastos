package budgets

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type budgetItemsRepository struct {
	pool *pgxpool.Pool
}

// NewBudgetItemsRepository creates a new budget items repository
func NewBudgetItemsRepository(pool *pgxpool.Pool) BudgetItemsRepository {
	return &budgetItemsRepository{pool: pool}
}

func (r *budgetItemsRepository) ListByMonth(ctx context.Context, householdID, month string) ([]*MonthlyBudgetItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT 
			i.id, i.household_id, i.category_id, i.month,
			i.name, i.description, i.amount, i.currency,
			i.movement_type, i.auto_generate,
			i.payer_user_id, i.payer_contact_id,
			i.counterparty_user_id, i.counterparty_contact_id,
			i.payment_method_id, i.receiver_account_id,
			i.source_template_id,
			i.created_at, i.updated_at,
			COALESCE(pu.name, pc.name) as payer_name,
			COALESCE(cu.name, cc.name) as counterparty_name,
			pm.name as payment_method_name,
			ra.name as receiver_account_name
		FROM monthly_budget_items i
		LEFT JOIN users pu ON i.payer_user_id = pu.id
		LEFT JOIN contacts pc ON i.payer_contact_id = pc.id
		LEFT JOIN users cu ON i.counterparty_user_id = cu.id
		LEFT JOIN contacts cc ON i.counterparty_contact_id = cc.id
		LEFT JOIN payment_methods pm ON i.payment_method_id = pm.id
		LEFT JOIN accounts ra ON i.receiver_account_id = ra.id
		WHERE i.household_id = $1 AND i.month = ($2 || '-01')::DATE
		ORDER BY i.auto_generate DESC, i.amount DESC, i.name ASC
	`, householdID, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*MonthlyBudgetItem
	for rows.Next() {
		var item MonthlyBudgetItem
		err := rows.Scan(
			&item.ID, &item.HouseholdID, &item.CategoryID, &item.Month,
			&item.Name, &item.Description, &item.Amount, &item.Currency,
			&item.MovementType, &item.AutoGenerate,
			&item.PayerUserID, &item.PayerContactID,
			&item.CounterpartyUserID, &item.CounterpartyContactID,
			&item.PaymentMethodID, &item.ReceiverAccountID,
			&item.SourceTemplateID,
			&item.CreatedAt, &item.UpdatedAt,
			&item.PayerName, &item.CounterpartyName,
			&item.PaymentMethodName, &item.ReceiverAccountName,
		)
		if err != nil {
			return nil, err
		}

		// Load participants for SPLIT items
		if item.MovementType != nil && *item.MovementType == "SPLIT" {
			participants, err := r.getParticipants(ctx, item.ID)
			if err != nil {
				return nil, err
			}
			item.Participants = participants
		}

		items = append(items, &item)
	}
	return items, rows.Err()
}

func (r *budgetItemsRepository) getParticipants(ctx context.Context, itemID string) ([]BudgetItemParticipant, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.budget_item_id,
			p.participant_user_id, p.participant_contact_id,
			p.percentage,
			COALESCE(u.name, c.name) as participant_name
		FROM monthly_budget_item_participants p
		LEFT JOIN users u ON p.participant_user_id = u.id
		LEFT JOIN contacts c ON p.participant_contact_id = c.id
		WHERE p.budget_item_id = $1
	`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var participants []BudgetItemParticipant
	for rows.Next() {
		var p BudgetItemParticipant
		err := rows.Scan(&p.ID, &p.BudgetItemID,
			&p.ParticipantUserID, &p.ParticipantContactID,
			&p.Percentage, &p.ParticipantName)
		if err != nil {
			return nil, err
		}
		participants = append(participants, p)
	}
	return participants, rows.Err()
}

func (r *budgetItemsRepository) GetByID(ctx context.Context, id string) (*MonthlyBudgetItem, error) {
	var item MonthlyBudgetItem
	err := r.pool.QueryRow(ctx, `
		SELECT 
			i.id, i.household_id, i.category_id, i.month,
			i.name, i.description, i.amount, i.currency,
			i.movement_type, i.auto_generate,
			i.payer_user_id, i.payer_contact_id,
			i.counterparty_user_id, i.counterparty_contact_id,
			i.payment_method_id, i.receiver_account_id,
			i.source_template_id,
			i.created_at, i.updated_at,
			COALESCE(pu.name, pc.name) as payer_name,
			COALESCE(cu.name, cc.name) as counterparty_name,
			pm.name as payment_method_name,
			ra.name as receiver_account_name
		FROM monthly_budget_items i
		LEFT JOIN users pu ON i.payer_user_id = pu.id
		LEFT JOIN contacts pc ON i.payer_contact_id = pc.id
		LEFT JOIN users cu ON i.counterparty_user_id = cu.id
		LEFT JOIN contacts cc ON i.counterparty_contact_id = cc.id
		LEFT JOIN payment_methods pm ON i.payment_method_id = pm.id
		LEFT JOIN accounts ra ON i.receiver_account_id = ra.id
		WHERE i.id = $1
	`, id).Scan(
		&item.ID, &item.HouseholdID, &item.CategoryID, &item.Month,
		&item.Name, &item.Description, &item.Amount, &item.Currency,
		&item.MovementType, &item.AutoGenerate,
		&item.PayerUserID, &item.PayerContactID,
		&item.CounterpartyUserID, &item.CounterpartyContactID,
		&item.PaymentMethodID, &item.ReceiverAccountID,
		&item.SourceTemplateID,
		&item.CreatedAt, &item.UpdatedAt,
		&item.PayerName, &item.CounterpartyName,
		&item.PaymentMethodName, &item.ReceiverAccountName,
	)
	if err != nil {
		return nil, err
	}

	if item.MovementType != nil && *item.MovementType == "SPLIT" {
		participants, err := r.getParticipants(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		item.Participants = participants
	}

	return &item, nil
}

func (r *budgetItemsRepository) Create(ctx context.Context, householdID string, input *CreateBudgetItemInput) (*MonthlyBudgetItem, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var item MonthlyBudgetItem
	err = tx.QueryRow(ctx, `
		INSERT INTO monthly_budget_items (
			household_id, category_id, month,
			name, description, amount, currency,
			movement_type, auto_generate,
			payer_user_id, payer_contact_id,
			counterparty_user_id, counterparty_contact_id,
			payment_method_id, receiver_account_id,
			source_template_id
		) VALUES ($1, $2, ($3 || '-01')::DATE, $4, $5, $6, 'COP', $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING id, household_id, category_id, month,
			name, description, amount, currency,
			movement_type, auto_generate,
			payer_user_id, payer_contact_id,
			counterparty_user_id, counterparty_contact_id,
			payment_method_id, receiver_account_id,
			source_template_id,
			created_at, updated_at
	`, householdID, input.CategoryID, input.Month,
		input.Name, input.Description, input.Amount,
		input.MovementType, input.AutoGenerate,
		input.PayerUserID, input.PayerContactID,
		input.CounterpartyUserID, input.CounterpartyContactID,
		input.PaymentMethodID, input.ReceiverAccountID,
		input.SourceTemplateID,
	).Scan(
		&item.ID, &item.HouseholdID, &item.CategoryID, &item.Month,
		&item.Name, &item.Description, &item.Amount, &item.Currency,
		&item.MovementType, &item.AutoGenerate,
		&item.PayerUserID, &item.PayerContactID,
		&item.CounterpartyUserID, &item.CounterpartyContactID,
		&item.PaymentMethodID, &item.ReceiverAccountID,
		&item.SourceTemplateID,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Insert participants
	for _, p := range input.Participants {
		_, err := tx.Exec(ctx, `
			INSERT INTO monthly_budget_item_participants (
				budget_item_id, participant_user_id, participant_contact_id, percentage
			) VALUES ($1, $2, $3, $4)
		`, item.ID, p.ParticipantUserID, p.ParticipantContactID, p.Percentage)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *budgetItemsRepository) Update(ctx context.Context, id string, input *UpdateBudgetItemInput) (*MonthlyBudgetItem, error) {
	// Build dynamic UPDATE
	sets := []string{"updated_at = NOW()"}
	args := []interface{}{id}
	argIdx := 2

	if input.Name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, *input.Name)
		argIdx++
	}
	if input.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *input.Description)
		argIdx++
	}
	if input.Amount != nil {
		sets = append(sets, fmt.Sprintf("amount = $%d", argIdx))
		args = append(args, *input.Amount)
		argIdx++
	}
	if input.MovementType != nil {
		sets = append(sets, fmt.Sprintf("movement_type = $%d", argIdx))
		args = append(args, *input.MovementType)
		argIdx++
	}
	if input.AutoGenerate != nil {
		sets = append(sets, fmt.Sprintf("auto_generate = $%d", argIdx))
		args = append(args, *input.AutoGenerate)
		argIdx++
	}
	if input.PayerUserID != nil {
		sets = append(sets, fmt.Sprintf("payer_user_id = $%d", argIdx))
		args = append(args, *input.PayerUserID)
		argIdx++
	}
	if input.PayerContactID != nil {
		sets = append(sets, fmt.Sprintf("payer_contact_id = $%d", argIdx))
		args = append(args, *input.PayerContactID)
		argIdx++
	}
	if input.ClearPayer {
		sets = append(sets, "payer_user_id = NULL, payer_contact_id = NULL")
	}
	if input.CounterpartyUserID != nil {
		sets = append(sets, fmt.Sprintf("counterparty_user_id = $%d", argIdx))
		args = append(args, *input.CounterpartyUserID)
		argIdx++
	}
	if input.CounterpartyContactID != nil {
		sets = append(sets, fmt.Sprintf("counterparty_contact_id = $%d", argIdx))
		args = append(args, *input.CounterpartyContactID)
		argIdx++
	}
	if input.ClearCounterparty {
		sets = append(sets, "counterparty_user_id = NULL, counterparty_contact_id = NULL")
	}
	if input.PaymentMethodID != nil {
		sets = append(sets, fmt.Sprintf("payment_method_id = $%d", argIdx))
		args = append(args, *input.PaymentMethodID)
		argIdx++
	}
	if input.ReceiverAccountID != nil {
		sets = append(sets, fmt.Sprintf("receiver_account_id = $%d", argIdx))
		args = append(args, *input.ReceiverAccountID)
		argIdx++
	}
	if input.ClearReceiverAccount {
		sets = append(sets, "receiver_account_id = NULL")
	}

	query := fmt.Sprintf(`UPDATE monthly_budget_items SET %s WHERE id = $1
		RETURNING id, household_id, category_id, month,
			name, description, amount, currency,
			movement_type, auto_generate,
			payer_user_id, payer_contact_id,
			counterparty_user_id, counterparty_contact_id,
			payment_method_id, receiver_account_id,
			source_template_id,
			created_at, updated_at`,
		strings.Join(sets, ", "))

	var item MonthlyBudgetItem
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&item.ID, &item.HouseholdID, &item.CategoryID, &item.Month,
		&item.Name, &item.Description, &item.Amount, &item.Currency,
		&item.MovementType, &item.AutoGenerate,
		&item.PayerUserID, &item.PayerContactID,
		&item.CounterpartyUserID, &item.CounterpartyContactID,
		&item.PaymentMethodID, &item.ReceiverAccountID,
		&item.SourceTemplateID,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Update participants if provided
	if input.Participants != nil {
		// Delete existing participants and re-insert
		_, _ = r.pool.Exec(ctx, `DELETE FROM monthly_budget_item_participants WHERE budget_item_id = $1`, id)
		for _, p := range input.Participants {
			_, err := r.pool.Exec(ctx, `
				INSERT INTO monthly_budget_item_participants (
					budget_item_id, participant_user_id, participant_contact_id, percentage
				) VALUES ($1, $2, $3, $4)
			`, id, p.ParticipantUserID, p.ParticipantContactID, p.Percentage)
			if err != nil {
				return nil, err
			}
		}
	}

	return &item, nil
}

func (r *budgetItemsRepository) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM monthly_budget_items WHERE id = $1`, id)
	return err
}

func (r *budgetItemsRepository) HasItemsForMonth(ctx context.Context, householdID, month string) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM monthly_budget_items 
		WHERE household_id = $1 AND month = ($2 || '-01')::DATE
	`, householdID, month).Scan(&count)
	return count > 0, err
}

func (r *budgetItemsRepository) CopyItemsToMonth(ctx context.Context, householdID, fromMonth, toMonth string) (int, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// Copy items
	rows, err := tx.Query(ctx, `
		INSERT INTO monthly_budget_items (
			household_id, category_id, month,
			name, description, amount, currency,
			movement_type, auto_generate,
			payer_user_id, payer_contact_id,
			counterparty_user_id, counterparty_contact_id,
			payment_method_id, receiver_account_id,
			source_template_id
		)
		SELECT 
			household_id, category_id, ($2 || '-01')::DATE,
			name, description, amount, currency,
			movement_type, auto_generate,
			payer_user_id, payer_contact_id,
			counterparty_user_id, counterparty_contact_id,
			payment_method_id, receiver_account_id,
			source_template_id
		FROM monthly_budget_items
		WHERE household_id = $1 AND month = ($3 || '-01')::DATE
		ON CONFLICT (household_id, category_id, month, name) DO NOTHING
		RETURNING id, source_template_id
	`, householdID, toMonth, fromMonth)
	if err != nil {
		return 0, err
	}

	// Collect new item IDs mapped to source templates for participant copy
	type idPair struct {
		newID      string
		templateID *string
	}
	var newItems []idPair
	for rows.Next() {
		var pair idPair
		if err := rows.Scan(&pair.newID, &pair.templateID); err != nil {
			rows.Close()
			return 0, err
		}
		newItems = append(newItems, pair)
	}
	rows.Close()

	// Copy participants from source month items to new month items
	for _, pair := range newItems {
		// Find the corresponding source item by name match
		_, err := tx.Exec(ctx, `
			INSERT INTO monthly_budget_item_participants (
				budget_item_id, participant_user_id, participant_contact_id, percentage
			)
			SELECT $1, p.participant_user_id, p.participant_contact_id, p.percentage
			FROM monthly_budget_item_participants p
			JOIN monthly_budget_items src ON p.budget_item_id = src.id
			JOIN monthly_budget_items dst ON dst.id = $1
			WHERE src.household_id = $2
				AND src.month = ($3 || '-01')::DATE
				AND src.name = dst.name
				AND src.category_id = dst.category_id
			ON CONFLICT DO NOTHING
		`, pair.newID, householdID, fromMonth)
		if err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(newItems), nil
}

func (r *budgetItemsRepository) DeleteItemsForMonth(ctx context.Context, householdID, month string) (int64, error) {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM monthly_budget_items 
		WHERE household_id = $1 AND month = ($2 || '-01')::DATE
	`, householdID, month)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

func (r *budgetItemsRepository) DeleteFutureItems(ctx context.Context, householdID, afterMonth string) (int64, error) {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM monthly_budget_items 
		WHERE household_id = $1 AND month > ($2 || '-01')::DATE
	`, householdID, afterMonth)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

func (r *budgetItemsRepository) UpdateAllMonths(ctx context.Context, householdID, categoryID, name string, input *UpdateBudgetItemInput) (int64, error) {
	// Build dynamic UPDATE for all months
	sets := []string{"updated_at = NOW()"}
	args := []interface{}{householdID, categoryID, name}
	argIdx := 4

	if input.Amount != nil {
		sets = append(sets, fmt.Sprintf("amount = $%d", argIdx))
		args = append(args, *input.Amount)
		argIdx++
	}
	if input.Name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, *input.Name)
		argIdx++
	}
	if input.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *input.Description)
		argIdx++
	}
	if input.MovementType != nil {
		sets = append(sets, fmt.Sprintf("movement_type = $%d", argIdx))
		args = append(args, *input.MovementType)
		argIdx++
	}
	if input.PaymentMethodID != nil {
		sets = append(sets, fmt.Sprintf("payment_method_id = $%d", argIdx))
		args = append(args, *input.PaymentMethodID)
		argIdx++
	}
	if input.PayerUserID != nil {
		sets = append(sets, fmt.Sprintf("payer_user_id = $%d", argIdx))
		args = append(args, *input.PayerUserID)
		argIdx++
	}
	if input.PayerContactID != nil {
		sets = append(sets, fmt.Sprintf("payer_contact_id = $%d", argIdx))
		args = append(args, *input.PayerContactID)
		argIdx++
	}

	query := fmt.Sprintf(`UPDATE monthly_budget_items SET %s 
		WHERE household_id = $1 AND category_id = $2 AND name = $3`,
		strings.Join(sets, ", "))

	result, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

func (r *budgetItemsRepository) GetDistinctMonths(ctx context.Context, householdID, categoryID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT TO_CHAR(month, 'YYYY-MM') as m
		FROM monthly_budget_items
		WHERE household_id = $1 AND category_id = $2
		ORDER BY m
	`, householdID, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var months []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err != nil {
			return nil, err
		}
		months = append(months, m)
	}
	return months, rows.Err()
}

func (r *budgetItemsRepository) GetMostRecentMonth(ctx context.Context, householdID string, beforeMonth string) (string, error) {
	var month string
	err := r.pool.QueryRow(ctx, `
		SELECT TO_CHAR(month, 'YYYY-MM')
		FROM monthly_budget_items
		WHERE household_id = $1 AND month < ($2 || '-01')::DATE
		ORDER BY month DESC
		LIMIT 1
	`, householdID, beforeMonth).Scan(&month)
	if err != nil {
		return "", err
	}
	return month, nil
}
