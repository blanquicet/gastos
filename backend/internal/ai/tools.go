package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/blanquicet/conti/backend/internal/budgets"
	"github.com/blanquicet/conti/backend/internal/income"
	"github.com/blanquicet/conti/backend/internal/movements"
)

// ToolExecutor executes chat tools by calling existing backend services.
// No direct DB queries — all data comes from the same services that power the UI tabs.
type ToolExecutor struct {
	movementsService movements.Service
	incomeService    income.Service
	budgetService    *budgets.BudgetService
}

// NewToolExecutor creates a new tool executor backed by existing services.
func NewToolExecutor(movementsService movements.Service, incomeService income.Service, budgetService *budgets.BudgetService) *ToolExecutor {
	return &ToolExecutor{
		movementsService: movementsService,
		incomeService:    incomeService,
		budgetService:    budgetService,
	}
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
			Description: "Get a summary of household expenses (HOUSEHOLD and SPLIT types) for a given month, optionally filtered by category or group name. Returns totals by category with group info, and top individual movements.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month":    monthParam,
					"category": map[string]any{"type": "string", "description": "Optional filter: category name or group name. Groups contain multiple categories."},
				},
				"required": []string{"month"},
			},
		},
		{
			Name:        "get_income_summary",
			Description: "Get a summary of household income for a given month. Returns total income and top individual income records.",
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
			Description: "Get budget vs actual spending for a given month. Shows each category's budget, actual spent, and status (under_budget, on_track, exceeded).",
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
					"category": map[string]any{"type": "string", "description": "Optional filter: category name or group name"},
				},
				"required": []string{"month1", "month2"},
			},
		},
		{
			Name:        "get_debt_summary",
			Description: "Get net debts between household members for a given month. Shows who owes whom after netting SPLIT expenses and DEBT_PAYMENT payments. Consistent with the Préstamos tab.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month": monthParam,
				},
				"required": []string{"month"},
			},
		},
		{
			Name:        "get_spending_by_payment_method",
			Description: "Get spending breakdown by payment method (credit card, debit card, cash, etc.) for a given month.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month": monthParam,
				},
				"required": []string{"month"},
			},
		},
		{
			Name:        "get_spending_by_member",
			Description: "Get spending breakdown by household member (who paid) for a given month.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month": monthParam,
				},
				"required": []string{"month"},
			},
		},
	}
}

// --- Tool Execution ---

// ExecuteTool routes a tool call to the appropriate handler.
func (te *ToolExecutor) ExecuteTool(ctx context.Context, householdID, userID, name, argsJSON string) (string, error) {
	var args map[string]any
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", fmt.Errorf("invalid tool arguments: %w", err)
	}

	var result any
	var err error

	switch name {
	case "get_movements_summary":
		result, err = te.getMovementsSummary(ctx, userID, args)
	case "get_income_summary":
		result, err = te.getIncomeSummary(ctx, userID, args)
	case "get_budget_status":
		result, err = te.getBudgetStatus(ctx, userID, args)
	case "get_top_expenses":
		result, err = te.getTopExpenses(ctx, userID, args)
	case "compare_months":
		result, err = te.compareMonths(ctx, userID, args)
	case "get_debt_summary":
		result, err = te.getDebtSummary(ctx, userID, args)
	case "get_spending_by_payment_method":
		result, err = te.getSpendingByPaymentMethod(ctx, userID, args)
	case "get_spending_by_member":
		result, err = te.getSpendingByMember(ctx, userID, args)
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

// --- Tool Implementations (all use existing services) ---

func (te *ToolExecutor) getMovementsSummary(ctx context.Context, userID string, args map[string]any) (any, error) {
	month := getString(args, "month")
	categoryFilter := getString(args, "category")

	typeHousehold := movements.TypeHousehold
	resp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
		Type:  &typeHousehold,
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	// Also get SPLIT movements
	typeSplit := movements.TypeSplit
	splitResp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
		Type:  &typeSplit,
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	allMovements := append(resp.Movements, splitResp.Movements...)

	// Group by category (with group name), optionally filter
	type catSummary struct {
		Group string  `json:"group"`
		Name  string  `json:"name"`
		Total float64 `json:"total"`
		Count int     `json:"count"`
	}
	catMap := make(map[string]*catSummary)

	for _, m := range allMovements {
		groupName := ""
		catName := "Sin categoría"
		if m.CategoryGroupName != nil {
			groupName = *m.CategoryGroupName
		}
		if m.CategoryName != nil {
			catName = *m.CategoryName
		}

		// Apply category/group filter
		if categoryFilter != "" {
			if !containsInsensitive(catName, categoryFilter) && !containsInsensitive(groupName, categoryFilter) {
				continue
			}
		}

		key := groupName + ">" + catName
		if _, ok := catMap[key]; !ok {
			catMap[key] = &catSummary{Group: groupName, Name: catName}
		}
		catMap[key].Total += m.Amount
		catMap[key].Count++
	}

	var categories []catSummary
	var grandTotal float64
	var grandCount int
	for _, cs := range catMap {
		categories = append(categories, *cs)
		grandTotal += cs.Total
		grandCount += cs.Count
	}
	sort.Slice(categories, func(i, j int) bool { return categories[i].Total > categories[j].Total })

	// Top evidence (largest movements matching filter)
	var filtered []*movements.Movement
	for _, m := range allMovements {
		if categoryFilter != "" {
			groupName := ""
			catName := ""
			if m.CategoryGroupName != nil {
				groupName = *m.CategoryGroupName
			}
			if m.CategoryName != nil {
				catName = *m.CategoryName
			}
			if !containsInsensitive(catName, categoryFilter) && !containsInsensitive(groupName, categoryFilter) {
				continue
			}
		}
		filtered = append(filtered, m)
	}
	sort.Slice(filtered, func(i, j int) bool { return filtered[i].Amount > filtered[j].Amount })
	if len(filtered) > 5 {
		filtered = filtered[:5]
	}

	var evidence []map[string]any
	for _, m := range filtered {
		evidence = append(evidence, movementToEvidence(m))
	}

	return map[string]any{
		"total":        grandTotal,
		"count":        grandCount,
		"month":        month,
		"by_category":  categories,
		"top_evidence": evidence,
	}, nil
}

func (te *ToolExecutor) getIncomeSummary(ctx context.Context, userID string, args map[string]any) (any, error) {
	month := getString(args, "month")

	resp, err := te.incomeService.ListByHousehold(ctx, userID, &income.ListIncomeFilters{
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	var evidence []map[string]any
	entries := resp.IncomeEntries
	sort.Slice(entries, func(i, j int) bool { return entries[i].Amount > entries[j].Amount })
	for i, inc := range entries {
		if i >= 5 {
			break
		}
		evidence = append(evidence, map[string]any{
			"description": inc.Description,
			"amount":      inc.Amount,
			"date":        inc.IncomeDate.Format("2006-01-02"),
			"type":        string(inc.Type),
			"member":      inc.MemberName,
			"account":     inc.AccountName,
		})
	}

	return map[string]any{
		"total":        resp.Totals.TotalAmount,
		"real_income":  resp.Totals.RealIncomeAmount,
		"count":        len(resp.IncomeEntries),
		"month":        month,
		"by_type":      resp.Totals.ByType,
		"top_evidence": evidence,
	}, nil
}

func (te *ToolExecutor) getBudgetStatus(ctx context.Context, userID string, args map[string]any) (any, error) {
	month := getString(args, "month")

	resp, err := te.budgetService.GetByMonth(ctx, userID, month)
	if err != nil {
		return nil, err
	}

	type budgetRow struct {
		Group    string  `json:"group"`
		Category string  `json:"category"`
		Budget   float64 `json:"budget"`
		Spent    float64 `json:"spent"`
		Diff     float64 `json:"difference"`
		Status   string  `json:"status"`
	}

	var rows []budgetRow
	for _, b := range resp.Budgets {
		if b.Amount == 0 && b.Spent == 0 {
			continue
		}
		group := ""
		if b.CategoryGroupName != nil {
			group = *b.CategoryGroupName
		}
		rows = append(rows, budgetRow{
			Group:    group,
			Category: b.CategoryName,
			Budget:   b.Amount,
			Spent:    b.Spent,
			Diff:     b.Amount - b.Spent,
			Status:   b.Status,
		})
	}

	return map[string]any{
		"total_budget": resp.Totals.TotalBudget,
		"total_spent":  resp.Totals.TotalSpent,
		"difference":   resp.Totals.TotalBudget - resp.Totals.TotalSpent,
		"month":        month,
		"categories":   rows,
	}, nil
}

func (te *ToolExecutor) getTopExpenses(ctx context.Context, userID string, args map[string]any) (any, error) {
	month := getString(args, "month")
	limit := getInt(args, "limit", 10)
	if limit > 20 {
		limit = 20
	}
	if limit < 1 {
		limit = 10
	}

	typeHousehold := movements.TypeHousehold
	resp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
		Type:  &typeHousehold,
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	typeSplit := movements.TypeSplit
	splitResp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
		Type:  &typeSplit,
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	all := append(resp.Movements, splitResp.Movements...)
	sort.Slice(all, func(i, j int) bool { return all[i].Amount > all[j].Amount })
	if len(all) > limit {
		all = all[:limit]
	}

	var evidence []map[string]any
	for _, m := range all {
		evidence = append(evidence, movementToEvidence(m))
	}

	return map[string]any{
		"month":    month,
		"count":    len(evidence),
		"expenses": evidence,
	}, nil
}

func (te *ToolExecutor) compareMonths(ctx context.Context, userID string, args map[string]any) (any, error) {
	month1 := getString(args, "month1")
	month2 := getString(args, "month2")
	categoryFilter := getString(args, "category")

	queryMonth := func(month string) (float64, int, error) {
		typeHousehold := movements.TypeHousehold
		resp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
			Type:  &typeHousehold,
			Month: &month,
		})
		if err != nil {
			return 0, 0, err
		}
		typeSplit := movements.TypeSplit
		splitResp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
			Type:  &typeSplit,
			Month: &month,
		})
		if err != nil {
			return 0, 0, err
		}

		all := append(resp.Movements, splitResp.Movements...)
		var total float64
		var count int
		for _, m := range all {
			if categoryFilter != "" {
				groupName := ""
				catName := ""
				if m.CategoryGroupName != nil {
					groupName = *m.CategoryGroupName
				}
				if m.CategoryName != nil {
					catName = *m.CategoryName
				}
				if !containsInsensitive(catName, categoryFilter) && !containsInsensitive(groupName, categoryFilter) {
					continue
				}
			}
			total += m.Amount
			count++
		}
		return total, count, nil
	}

	total1, count1, err := queryMonth(month1)
	if err != nil {
		return nil, err
	}
	total2, count2, err := queryMonth(month2)
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
		"category":       categoryFilter,
	}, nil
}

func (te *ToolExecutor) getDebtSummary(ctx context.Context, userID string, args map[string]any) (any, error) {
	month := getString(args, "month")

	result, err := te.movementsService.GetDebtConsolidation(ctx, userID, &month)
	if err != nil {
		return nil, fmt.Errorf("debt consolidation failed: %w", err)
	}

	type balance struct {
		Debtor   string  `json:"debtor"`
		Creditor string  `json:"creditor"`
		Amount   float64 `json:"net_amount"`
	}

	var balances []balance
	for _, b := range result.Balances {
		if b.Amount > 0.01 {
			balances = append(balances, balance{
				Debtor:   b.DebtorName,
				Creditor: b.CreditorName,
				Amount:   b.Amount,
			})
		}
	}

	summary := map[string]float64{}
	if result.Summary != nil {
		summary["they_owe_us"] = result.Summary.TheyOweUs
		summary["we_owe"] = result.Summary.WeOwe
	}

	return map[string]any{
		"month":       month,
		"balances":    balances,
		"summary":     summary,
		"total_pairs": len(balances),
	}, nil
}

func (te *ToolExecutor) getSpendingByPaymentMethod(ctx context.Context, userID string, args map[string]any) (any, error) {
	month := getString(args, "month")

	typeHousehold := movements.TypeHousehold
	resp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
		Type:  &typeHousehold,
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	typeSplit := movements.TypeSplit
	splitResp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
		Type:  &typeSplit,
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	type pmSummary struct {
		Name  string  `json:"payment_method"`
		Total float64 `json:"total"`
		Count int     `json:"count"`
	}

	pmMap := make(map[string]*pmSummary)
	for _, m := range append(resp.Movements, splitResp.Movements...) {
		name := "Sin método"
		if m.PaymentMethodName != nil {
			name = *m.PaymentMethodName
		}
		if _, ok := pmMap[name]; !ok {
			pmMap[name] = &pmSummary{Name: name}
		}
		pmMap[name].Total += m.Amount
		pmMap[name].Count++
	}

	var methods []pmSummary
	var total float64
	for _, pm := range pmMap {
		methods = append(methods, *pm)
		total += pm.Total
	}
	sort.Slice(methods, func(i, j int) bool { return methods[i].Total > methods[j].Total })

	return map[string]any{
		"month":           month,
		"total":           total,
		"payment_methods": methods,
	}, nil
}

func (te *ToolExecutor) getSpendingByMember(ctx context.Context, userID string, args map[string]any) (any, error) {
	month := getString(args, "month")

	typeHousehold := movements.TypeHousehold
	resp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
		Type:  &typeHousehold,
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	typeSplit := movements.TypeSplit
	splitResp, err := te.movementsService.ListByHousehold(ctx, userID, &movements.ListMovementsFilters{
		Type:  &typeSplit,
		Month: &month,
	})
	if err != nil {
		return nil, err
	}

	type memberSummary struct {
		Name  string  `json:"member"`
		Total float64 `json:"total"`
		Count int     `json:"count"`
	}

	memMap := make(map[string]*memberSummary)
	for _, m := range append(resp.Movements, splitResp.Movements...) {
		name := m.PayerName
		if name == "" {
			name = "Desconocido"
		}
		if _, ok := memMap[name]; !ok {
			memMap[name] = &memberSummary{Name: name}
		}
		memMap[name].Total += m.Amount
		memMap[name].Count++
	}

	var members []memberSummary
	var total float64
	for _, ms := range memMap {
		members = append(members, *ms)
		total += ms.Total
	}
	sort.Slice(members, func(i, j int) bool { return members[i].Total > members[j].Total })

	return map[string]any{
		"month":   month,
		"total":   total,
		"members": members,
	}, nil
}

// --- Helpers ---

func movementToEvidence(m *movements.Movement) map[string]any {
	group := ""
	category := "Sin categoría"
	if m.CategoryGroupName != nil {
		group = *m.CategoryGroupName
	}
	if m.CategoryName != nil {
		category = *m.CategoryName
	}
	return map[string]any{
		"id":          m.ID,
		"description": m.Description,
		"amount":      m.Amount,
		"date":        m.MovementDate.Format("2006-01-02"),
		"group":       group,
		"category":    category,
		"payer":       m.PayerName,
	}
}

func containsInsensitive(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
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

func stringOrDefault(s *string, def string) string {
	if s != nil {
		return *s
	}
	return def
}
