package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ToolExecutor executes chat function-calling tools against the database.
type ToolExecutor struct {
	pool   *pgxpool.Pool
}

// NewToolExecutor creates a new tool executor.
func NewToolExecutor(pool *pgxpool.Pool) *ToolExecutor {
	return &ToolExecutor{pool: pool}
}

// ToolDefinitions returns the tool definitions for the LLM.
func ToolDefinitions() []Tool {
	monthParam := map[string]any{
		"type":        "string",
		"description": "Month in YYYY-MM format. Example: 2026-02",
	}

	return []Tool{
		{
			Name:        "get_movements_summary",
			Description: "Get a summary of household expenses for a given month, optionally filtered by category name. Returns totals by category and top individual movements as evidence.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month":    monthParam,
					"category": map[string]any{"type": "string", "description": "Optional category name to filter by (e.g. 'Mercado', 'Salidas juntos')"},
				},
				"required": []string{"month"},
			},
		},
		{
			Name:        "get_income_summary",
			Description: "Get a summary of household income for a given month. Returns total income and top individual income records as evidence.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month": monthParam,
				},
				"required": []string{"month"},
			},
		},
		{
			Name:        "get_budget_status",
			Description: "Get budget vs actual spending for a given month. Shows each category's budget amount and actual spent amount.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month": monthParam,
				},
				"required": []string{"month"},
			},
		},
		{
			Name:        "get_top_expenses",
			Description: "Get the top N largest individual expenses for a given month.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month": monthParam,
					"limit": map[string]any{"type": "integer", "description": "Number of results (default 10, max 20)"},
				},
				"required": []string{"month"},
			},
		},
		{
			Name:        "compare_months",
			Description: "Compare total spending between two months, optionally filtered by category.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month1":   map[string]any{"type": "string", "description": "First month in YYYY-MM format"},
					"month2":   map[string]any{"type": "string", "description": "Second month in YYYY-MM format"},
					"category": map[string]any{"type": "string", "description": "Optional category name to filter by"},
				},
				"required": []string{"month1", "month2"},
			},
		},
	}
}

// Evidence is a single record backing up a query result.
type Evidence struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Date        string  `json:"date"`
	Category    string  `json:"category,omitempty"`
}

// --- Tool Execution ---

// ExecuteTool routes a tool call to the appropriate handler.
func (te *ToolExecutor) ExecuteTool(ctx context.Context, householdID, name, argsJSON string) (string, error) {
	var args map[string]any
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", fmt.Errorf("invalid tool arguments: %w", err)
	}

	var result any
	var err error

	switch name {
	case "get_movements_summary":
		result, err = te.getMovementsSummary(ctx, householdID, args)
	case "get_income_summary":
		result, err = te.getIncomeSummary(ctx, householdID, args)
	case "get_budget_status":
		result, err = te.getBudgetStatus(ctx, householdID, args)
	case "get_top_expenses":
		result, err = te.getTopExpenses(ctx, householdID, args)
	case "compare_months":
		result, err = te.compareMonths(ctx, householdID, args)
	default:
		return "", fmt.Errorf("unknown tool: %s", name)
	}

	if err != nil {
		return "", err
	}

	out, err := json.Marshal(result)
	if err != nil {
		return "", fmt.Errorf("failed to marshal tool result: %w", err)
	}
	return string(out), nil
}

// --- Individual Tool Implementations ---

func (te *ToolExecutor) getMovementsSummary(ctx context.Context, householdID string, args map[string]any) (any, error) {
	month := getString(args, "month")
	category := getString(args, "category")

	start, end, err := MonthRange(month)
	if err != nil {
		return nil, err
	}

	type catSummary struct {
		Name  string  `json:"name"`
		Total float64 `json:"total"`
		Count int     `json:"count"`
	}

	// Query by category
	query := `SELECT COALESCE(c.name, 'Sin categoría') as category_name, 
	                 SUM(m.amount) as total, COUNT(*) as count
	          FROM movements m
	          LEFT JOIN categories c ON m.category_id = c.id
	          WHERE m.household_id = $1 
	            AND m.movement_date >= $2 AND m.movement_date < $3
	            AND m.type IN ('HOUSEHOLD', 'SPLIT')`
	qArgs := []any{householdID, start, end}

	if category != "" {
		query += ` AND c.name ILIKE $4`
		qArgs = append(qArgs, "%"+category+"%")
	}
	query += ` GROUP BY c.name ORDER BY total DESC`

	rows, err := te.pool.Query(ctx, query, qArgs...)
	if err != nil {
		return nil, fmt.Errorf("movements query failed: %w", err)
	}
	defer rows.Close()

	var categories []catSummary
	var grandTotal float64
	var grandCount int
	for rows.Next() {
		var cs catSummary
		if err := rows.Scan(&cs.Name, &cs.Total, &cs.Count); err != nil {
			return nil, err
		}
		categories = append(categories, cs)
		grandTotal += cs.Total
		grandCount += cs.Count
	}

	// Top evidence
	evidence, err := te.queryEvidence(ctx, householdID, start, end, category, 5)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"total":        grandTotal,
		"count":        grandCount,
		"period":       map[string]string{"start": start.Format(time.DateOnly), "end": end.AddDate(0, 0, -1).Format(time.DateOnly)},
		"by_category":  categories,
		"top_evidence": evidence,
	}, nil
}

func (te *ToolExecutor) getIncomeSummary(ctx context.Context, householdID string, args map[string]any) (any, error) {
	month := getString(args, "month")
	start, end, err := MonthRange(month)
	if err != nil {
		return nil, err
	}

	type incomeSummary struct {
		Type  string  `json:"type"`
		Total float64 `json:"total"`
		Count int     `json:"count"`
	}

	rows, err := te.pool.Query(ctx,
		`SELECT i.type::text, SUM(i.amount), COUNT(*)
		 FROM income i
		 WHERE i.household_id = $1 AND i.income_date >= $2 AND i.income_date < $3
		 GROUP BY i.type ORDER BY SUM(i.amount) DESC`,
		householdID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var byType []incomeSummary
	var total float64
	var count int
	for rows.Next() {
		var is incomeSummary
		if err := rows.Scan(&is.Type, &is.Total, &is.Count); err != nil {
			return nil, err
		}
		byType = append(byType, is)
		total += is.Total
		count += is.Count
	}

	// Top evidence
	evidenceRows, err := te.pool.Query(ctx,
		`SELECT i.id::text, i.description, i.amount, i.income_date::text
		 FROM income i
		 WHERE i.household_id = $1 AND i.income_date >= $2 AND i.income_date < $3
		 ORDER BY i.amount DESC LIMIT 5`,
		householdID, start, end)
	if err != nil {
		return nil, err
	}
	defer evidenceRows.Close()

	var evidence []Evidence
	for evidenceRows.Next() {
		var e Evidence
		if err := evidenceRows.Scan(&e.ID, &e.Description, &e.Amount, &e.Date); err != nil {
			return nil, err
		}
		evidence = append(evidence, e)
	}

	return map[string]any{
		"total":        total,
		"count":        count,
		"period":       map[string]string{"start": start.Format(time.DateOnly), "end": end.AddDate(0, 0, -1).Format(time.DateOnly)},
		"by_type":      byType,
		"top_evidence": evidence,
	}, nil
}

func (te *ToolExecutor) getBudgetStatus(ctx context.Context, householdID string, args map[string]any) (any, error) {
	month := getString(args, "month")
	start, end, err := MonthRange(month)
	if err != nil {
		return nil, err
	}

	type budgetRow struct {
		Category string  `json:"category"`
		Budget   float64 `json:"budget"`
		Spent    float64 `json:"spent"`
		Diff     float64 `json:"difference"`
	}

	rows, err := te.pool.Query(ctx,
		`SELECT c.name,
		        COALESCE(mb.amount, 0) as budget,
		        COALESCE(spent.total, 0) as spent
		 FROM categories c
		 LEFT JOIN monthly_budgets mb ON mb.category_id = c.id 
		      AND mb.month = $2 AND mb.household_id = $1
		 LEFT JOIN (
		     SELECT m.category_id, SUM(m.amount) as total
		     FROM movements m
		     WHERE m.household_id = $1 AND m.movement_date >= $2 AND m.movement_date < $3
		       AND m.type IN ('HOUSEHOLD', 'SPLIT')
		     GROUP BY m.category_id
		 ) spent ON spent.category_id = c.id
		 WHERE c.household_id = $1 AND c.is_active = true
		   AND (mb.amount > 0 OR spent.total > 0)
		 ORDER BY COALESCE(spent.total, 0) DESC`,
		householdID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var budgets []budgetRow
	var totalBudget, totalSpent float64
	for rows.Next() {
		var b budgetRow
		if err := rows.Scan(&b.Category, &b.Budget, &b.Spent); err != nil {
			return nil, err
		}
		b.Diff = b.Budget - b.Spent
		budgets = append(budgets, b)
		totalBudget += b.Budget
		totalSpent += b.Spent
	}

	return map[string]any{
		"total_budget": totalBudget,
		"total_spent":  totalSpent,
		"difference":   totalBudget - totalSpent,
		"period":       map[string]string{"start": start.Format(time.DateOnly), "end": end.AddDate(0, 0, -1).Format(time.DateOnly)},
		"categories":   budgets,
	}, nil
}

func (te *ToolExecutor) getTopExpenses(ctx context.Context, householdID string, args map[string]any) (any, error) {
	month := getString(args, "month")
	limit := getInt(args, "limit", 10)
	if limit > 20 {
		limit = 20
	}
	if limit < 1 {
		limit = 10
	}

	start, end, err := MonthRange(month)
	if err != nil {
		return nil, err
	}

	evidence, err := te.queryEvidence(ctx, householdID, start, end, "", limit)
	if err != nil {
		return nil, err
	}

	var total float64
	for _, e := range evidence {
		total += e.Amount
	}

	return map[string]any{
		"period":   map[string]string{"start": start.Format(time.DateOnly), "end": end.AddDate(0, 0, -1).Format(time.DateOnly)},
		"count":    len(evidence),
		"expenses": evidence,
	}, nil
}

func (te *ToolExecutor) compareMonths(ctx context.Context, householdID string, args map[string]any) (any, error) {
	month1 := getString(args, "month1")
	month2 := getString(args, "month2")
	category := getString(args, "category")

	start1, end1, err := MonthRange(month1)
	if err != nil {
		return nil, err
	}
	start2, end2, err := MonthRange(month2)
	if err != nil {
		return nil, err
	}

	queryMonth := func(start, end time.Time) (float64, int, error) {
		query := `SELECT COALESCE(SUM(m.amount), 0), COUNT(*)
		          FROM movements m
		          LEFT JOIN categories c ON m.category_id = c.id
		          WHERE m.household_id = $1
		            AND m.movement_date >= $2 AND m.movement_date < $3
		            AND m.type IN ('HOUSEHOLD', 'SPLIT')`
		qArgs := []any{householdID, start, end}
		if category != "" {
			query += ` AND c.name ILIKE $4`
			qArgs = append(qArgs, "%"+category+"%")
		}

		var total float64
		var count int
		err := te.pool.QueryRow(ctx, query, qArgs...).Scan(&total, &count)
		return total, count, err
	}

	total1, count1, err := queryMonth(start1, end1)
	if err != nil {
		return nil, err
	}
	total2, count2, err := queryMonth(start2, end2)
	if err != nil {
		return nil, err
	}

	diff := total2 - total1
	var pctChange float64
	if total1 > 0 {
		pctChange = (diff / total1) * 100
	}

	return map[string]any{
		"month1":         map[string]any{"month": month1, "total": total1, "count": count1},
		"month2":         map[string]any{"month": month2, "total": total2, "count": count2},
		"difference":     diff,
		"percent_change": pctChange,
		"category":       category,
	}, nil
}

// --- Helpers ---

func (te *ToolExecutor) queryEvidence(ctx context.Context, householdID string, start, end time.Time, category string, limit int) ([]Evidence, error) {
	query := `SELECT m.id::text, COALESCE(m.description, ''), m.amount, 
	                 m.movement_date::text, COALESCE(c.name, 'Sin categoría')
	          FROM movements m
	          LEFT JOIN categories c ON m.category_id = c.id
	          WHERE m.household_id = $1 
	            AND m.movement_date >= $2 AND m.movement_date < $3
	            AND m.type IN ('HOUSEHOLD', 'SPLIT')`
	qArgs := []any{householdID, start, end}

	if category != "" {
		query += ` AND c.name ILIKE $4`
		qArgs = append(qArgs, "%"+category+"%")
		query += fmt.Sprintf(` ORDER BY m.amount DESC LIMIT %d`, limit)
	} else {
		query += fmt.Sprintf(` ORDER BY m.amount DESC LIMIT %d`, limit)
	}

	rows, err := te.pool.Query(ctx, query, qArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var evidence []Evidence
	for rows.Next() {
		var e Evidence
		if err := rows.Scan(&e.ID, &e.Description, &e.Amount, &e.Date, &e.Category); err != nil {
			return nil, err
		}
		evidence = append(evidence, e)
	}
	return evidence, nil
}

func getString(args map[string]any, key string) string {
	if v, ok := args[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getInt(args map[string]any, key string, defaultVal int) int {
	if v, ok := args[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	return defaultVal
}
