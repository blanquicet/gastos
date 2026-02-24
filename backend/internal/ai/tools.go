package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/blanquicet/conti/backend/internal/accounts"
	"github.com/blanquicet/conti/backend/internal/budgets"
	"github.com/blanquicet/conti/backend/internal/categories"
	"github.com/blanquicet/conti/backend/internal/categorygroups"
	"github.com/blanquicet/conti/backend/internal/households"
	"github.com/blanquicet/conti/backend/internal/income"
	"github.com/blanquicet/conti/backend/internal/movements"
	"github.com/blanquicet/conti/backend/internal/paymentmethods"
)

// ToolExecutor executes chat tools by calling existing backend services.
// No direct DB queries — all data comes from the same services that power the UI tabs.
type ToolExecutor struct {
	movementsService  movements.Service
	incomeService     income.Service
	budgetService     *budgets.BudgetService
	categoriesRepo    categories.Repository
	categoryGroupRepo categorygroups.Repository
	paymentMethodRepo paymentmethods.Repository
	householdRepo     households.HouseholdRepository
	accountsRepo      accounts.Repository
}

// NewToolExecutor creates a new tool executor backed by existing services.
func NewToolExecutor(
	movementsService movements.Service,
	incomeService income.Service,
	budgetService *budgets.BudgetService,
	categoriesRepo categories.Repository,
	categoryGroupRepo categorygroups.Repository,
	paymentMethodRepo paymentmethods.Repository,
	householdRepo households.HouseholdRepository,
	accountsRepo accounts.Repository,
) *ToolExecutor {
	return &ToolExecutor{
		movementsService:  movementsService,
		incomeService:     incomeService,
		budgetService:     budgetService,
		categoriesRepo:    categoriesRepo,
		categoryGroupRepo: categoryGroupRepo,
		paymentMethodRepo: paymentMethodRepo,
		householdRepo:     householdRepo,
		accountsRepo:      accountsRepo,
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
			Description: "Get a summary of household expenses (HOUSEHOLD and SPLIT types) for a given month, optionally filtered by category or group name, and/or by date range. Returns totals by category with group info, and top individual movements.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month":      monthParam,
					"category":   map[string]any{"type": "string", "description": "Optional filter: category name or group name. Groups contain multiple categories."},
					"start_date": map[string]any{"type": "string", "description": "Optional: filter movements from this date (YYYY-MM-DD, inclusive). Use for specific day queries like 'ayer'."},
					"end_date":   map[string]any{"type": "string", "description": "Optional: filter movements up to this date (YYYY-MM-DD, inclusive). Use for specific day queries like 'ayer'."},
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
			Description: "Get net debts between household members and contacts for a given month. Shows who owes whom after netting SPLIT expenses and DEBT_PAYMENT payments. Consistent with the Préstamos tab. Can filter by a specific person (member or contact name).",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"month":  monthParam,
					"person": map[string]any{"type": "string", "description": "Optional: filter debts involving this person (member or contact name). Shows only balances where this person is debtor or creditor."},
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
		{
			Name:        "prepare_movement",
			Description: "Prepare a new household expense for the user to confirm. Resolves category and payment method names to IDs. Returns a draft that the user must confirm before it is created. Use this when the user wants to register/add a new expense. ONLY for type HOUSEHOLD (regular household expenses).",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"description":    map[string]any{"type": "string", "description": "What the expense is for (e.g. 'Mercado en el Euro')"},
					"amount":         map[string]any{"type": "number", "description": "Amount in COP (e.g. 50000)"},
					"category":       map[string]any{"type": "string", "description": "Category name. Optional — if omitted, the tool returns available options for the user to pick."},
					"payment_method": map[string]any{"type": "string", "description": "Payment method name. Optional — if omitted, the tool returns available options for the user to pick."},
					"date":           map[string]any{"type": "string", "description": "Date in YYYY-MM-DD format. Defaults to today if not specified."},
				},
				"required": []string{"amount"},
			},
		},
		{
			Name:        "prepare_loan",
			Description: "Prepare a loan (SPLIT) or debt payment (DEBT_PAYMENT) movement. Use SPLIT when someone lends money to another person (creates a debt). Use DEBT_PAYMENT when someone pays back a debt. The 'person' is the other party (not the logged-in user). Category is optional for loans — if omitted, the tool returns options.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"type":           map[string]any{"type": "string", "enum": []string{"SPLIT", "DEBT_PAYMENT"}, "description": "SPLIT = lending money (creates debt). DEBT_PAYMENT = paying back a debt."},
					"direction":      map[string]any{"type": "string", "enum": []string{"I_TO_THEM", "THEM_TO_ME"}, "description": "I_TO_THEM = I lent/paid them. THEM_TO_ME = they lent/paid me."},
					"person":         map[string]any{"type": "string", "description": "Name of the other person (household member or contact)."},
					"amount":         map[string]any{"type": "number", "description": "Amount in COP"},
					"description":    map[string]any{"type": "string", "description": "Description (e.g. 'Préstamo para compras')"},
					"category":       map[string]any{"type": "string", "description": "Category name. Only needed when type=SPLIT and direction=THEM_TO_ME and person is a contact (they lend us = household expense). Not needed for DEBT_PAYMENT or when I lend to someone."},
					"payment_method": map[string]any{"type": "string", "description": "Payment method name. Optional — if omitted, the tool returns available options."},
					"account":        map[string]any{"type": "string", "description": "Receiver account name (for DEBT_PAYMENT when counterparty is a household member). Optional — if omitted and multiple accounts exist, the tool returns available options."},
					"date":           map[string]any{"type": "string", "description": "Date in YYYY-MM-DD format. Defaults to today."},
				},
				"required": []string{"type", "direction", "person", "amount"},
			},
		},
	}
}

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
	case "prepare_movement":
		result, err = te.prepareMovement(ctx, householdID, userID, args)
	case "prepare_loan":
		result, err = te.prepareLoan(ctx, householdID, userID, args)
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
	startDateStr := getString(args, "start_date")
	endDateStr := getString(args, "end_date")

	// Parse optional date filters
	var startDate, endDate time.Time
	var hasDateFilter bool
	if startDateStr != "" {
		if t, err := time.ParseInLocation("2006-01-02", startDateStr, Bogota); err == nil {
			startDate = t
			hasDateFilter = true
		}
	}
	if endDateStr != "" {
		if t, err := time.ParseInLocation("2006-01-02", endDateStr, Bogota); err == nil {
			endDate = t.Add(24*time.Hour - time.Nanosecond) // end of day
			hasDateFilter = true
		}
	}

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

	// Apply date range filter
	if hasDateFilter {
		var dateFiltered []*movements.Movement
		for _, m := range allMovements {
			mDate := m.MovementDate.In(Bogota)
			if !startDate.IsZero() && mDate.Before(startDate) {
				continue
			}
			if !endDate.IsZero() && mDate.After(endDate) {
				continue
			}
			dateFiltered = append(dateFiltered, m)
		}
		allMovements = dateFiltered
	}

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
			"date":        inc.IncomeDate.In(Bogota).Format("2006-01-02"),
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
	personFilter := getString(args, "person")

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
		if b.Amount > 1.0 { // Consistent with backend: < $1 COP = settled
			// Apply person filter
			if personFilter != "" {
				if !containsInsensitive(b.DebtorName, personFilter) && !containsInsensitive(b.CreditorName, personFilter) {
					continue
				}
			}
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

// --- Prepare Movement (for creating from chat) ---

// MovementDraft is returned to the frontend for user confirmation before creation.
type MovementDraft struct {
	Action            string  `json:"action"` // always "confirm_movement"
	Type              string  `json:"type"`
	Description       string  `json:"description"`
	Amount            float64 `json:"amount"`
	CategoryID        string  `json:"category_id"`
	CategoryName      string  `json:"category_name"`
	CategoryGroup     string  `json:"category_group,omitempty"`
	PaymentMethodID   string  `json:"payment_method_id,omitempty"`
	PaymentMethodName string  `json:"payment_method_name,omitempty"`
	PayerUserID       string  `json:"payer_user_id,omitempty"`
	PayerContactID    string  `json:"payer_contact_id,omitempty"`
	PayerName         string  `json:"payer_name"`
	MovementDate      string  `json:"movement_date"`
	// For DEBT_PAYMENT
	CounterpartyUserID    string `json:"counterparty_user_id,omitempty"`
	CounterpartyContactID string `json:"counterparty_contact_id,omitempty"`
	CounterpartyName      string `json:"counterparty_name,omitempty"`
	ReceiverAccountID     string `json:"receiver_account_id,omitempty"`
	ReceiverAccountName   string `json:"receiver_account_name,omitempty"`
	// For SPLIT
	Participants []ParticipantDraft `json:"participants,omitempty"`
}

// ParticipantDraft holds participant info for SPLIT draft.
type ParticipantDraft struct {
	UserID    string  `json:"participant_user_id,omitempty"`
	ContactID string  `json:"participant_contact_id,omitempty"`
	Name      string  `json:"name"`
	Percentage float64 `json:"percentage"` // 0.0 to 1.0
}

func (te *ToolExecutor) prepareMovement(ctx context.Context, householdID, userID string, args map[string]any) (any, error) {
	description := getString(args, "description")
	amount := getFloat(args, "amount")
	categoryName := getString(args, "category")
	pmName := getString(args, "payment_method")
	dateStr := getString(args, "date")

	if description == "" {
		description = "Gasto"
	}
	if amount <= 0 {
		return map[string]string{"error": "El monto debe ser mayor a 0"}, nil
	}

	// Default date to today (Bogota)
	if dateStr == "" {
		dateStr = time.Now().In(Bogota).Format("2006-01-02")
	}

	// Resolve category by fuzzy name match
	cats, err := te.categoriesRepo.ListByHousehold(ctx, householdID, false)
	if err != nil {
		return nil, fmt.Errorf("failed to list categories: %w", err)
	}

	var matchedCat *categories.Category
	if categoryName != "" {
		// Handle "Group > Name" or "Group - Name" format (from option chips or LLM text)
		groupFilter := ""
		catNameFilter := categoryName
		if parts := strings.SplitN(categoryName, " > ", 2); len(parts) == 2 {
			groupFilter = parts[0]
			catNameFilter = parts[1]
		} else if parts := strings.SplitN(categoryName, " - ", 2); len(parts) == 2 {
			groupFilter = parts[0]
			catNameFilter = parts[1]
		}

		// Build group ID → name map for matching
		groupNames := make(map[string]string)
		groups, _ := te.categoryGroupRepo.ListByHousehold(ctx, householdID, false)
		for _, g := range groups {
			groupNames[g.ID] = g.Name
		}

		// Exact match (with optional group filter)
		var exactMatches []*categories.Category
		for _, c := range cats {
			if strings.EqualFold(c.Name, catNameFilter) {
				if groupFilter != "" {
					if c.CategoryGroupID != nil && strings.EqualFold(groupNames[*c.CategoryGroupID], groupFilter) {
						matchedCat = c
						break
					}
				} else {
					exactMatches = append(exactMatches, c)
				}
			}
		}
		// If no group filter and multiple exact matches → return options for disambiguation
		if matchedCat == nil && len(exactMatches) > 1 {
			var names []string
			for _, c := range exactMatches {
				displayName := c.Name
				if c.CategoryGroupID != nil {
					if gn, ok := groupNames[*c.CategoryGroupID]; ok {
						displayName = gn + " > " + c.Name
					}
				}
				names = append(names, displayName)
			}
			sort.Strings(names)
			return map[string]any{
				"error":                fmt.Sprintf("Hay %d categorías llamadas '%s'. ¿Cuál?", len(exactMatches), catNameFilter),
				"available_categories": names,
			}, nil
		}
		if matchedCat == nil && len(exactMatches) == 1 {
			matchedCat = exactMatches[0]
		}

		// Fuzzy match
		if matchedCat == nil {
			var fuzzyMatches []*categories.Category
			for _, c := range cats {
				if containsInsensitive(c.Name, catNameFilter) {
					fuzzyMatches = append(fuzzyMatches, c)
				}
			}
			if len(fuzzyMatches) > 1 {
				// Check if all fuzzy matches have different groups
				var names []string
				for _, c := range fuzzyMatches {
					displayName := c.Name
					if c.CategoryGroupID != nil {
						if gn, ok := groupNames[*c.CategoryGroupID]; ok {
							displayName = gn + " > " + c.Name
						}
					}
					names = append(names, displayName)
				}
				sort.Strings(names)
				return map[string]any{
					"error":                fmt.Sprintf("Hay %d categorías que coinciden con '%s'. ¿Cuál?", len(fuzzyMatches), catNameFilter),
					"available_categories": names,
				}, nil
			}
			if len(fuzzyMatches) == 1 {
				matchedCat = fuzzyMatches[0]
			}
		}
	}
	if matchedCat == nil {
		// Build group ID → name map
		groupNames := make(map[string]string)
		groups, _ := te.categoryGroupRepo.ListByHousehold(ctx, householdID, false)
		for _, g := range groups {
			groupNames[g.ID] = g.Name
		}

		// If user provided a category name, show only relevant matches (fuzzy)
		var relevantCats []*categories.Category
		if categoryName != "" {
			searchTerms := strings.Fields(strings.ToLower(categoryName))
			for _, c := range cats {
				gn := ""
				if c.CategoryGroupID != nil {
					gn = groupNames[*c.CategoryGroupID]
				}
				combined := strings.ToLower(gn + " " + c.Name)
				// Match if any search word appears in group+name, or name appears in search
				matched := false
				for _, term := range searchTerms {
					if strings.Contains(combined, term) {
						matched = true
						break
					}
				}
				if !matched && containsInsensitive(categoryName, c.Name) {
					matched = true
				}
				if matched {
					relevantCats = append(relevantCats, c)
				}
			}
		}
		// Fall back to all categories only if no relevant matches found
		if len(relevantCats) == 0 {
			relevantCats = cats
		}

		var names []string
		for _, c := range relevantCats {
			displayName := c.Name
			if c.CategoryGroupID != nil {
				if gn, ok := groupNames[*c.CategoryGroupID]; ok {
					displayName = gn + " > " + c.Name
				}
			}
			names = append(names, displayName)
		}
		sort.Strings(names)
		msg := "Selecciona la categoría"
		if categoryName != "" {
			msg = fmt.Sprintf("No encontré la categoría '%s'", categoryName)
		}
		return map[string]any{
			"error":                msg,
			"available_categories": names,
		}, nil
	}

	// Resolve payment method by fuzzy name match
	pms, err := te.paymentMethodRepo.ListByHousehold(ctx, householdID)
	if err != nil {
		return nil, fmt.Errorf("failed to list payment methods: %w", err)
	}

	var matchedPM *paymentmethods.PaymentMethod
	if pmName != "" {
		for _, pm := range pms {
			if strings.EqualFold(pm.Name, pmName) {
				matchedPM = pm
				break
			}
		}
		if matchedPM == nil {
			for _, pm := range pms {
				if containsInsensitive(pm.Name, pmName) {
					matchedPM = pm
					break
				}
			}
		}
	}
	if matchedPM == nil {
		var names []string
		for _, pm := range pms {
			names = append(names, pm.Name)
		}
		msg := "Selecciona el método de pago"
		if pmName != "" {
			msg = fmt.Sprintf("No encontré el método de pago '%s'", pmName)
		}
		return map[string]any{
			"error":                     msg,
			"available_payment_methods": names,
		}, nil
	}

	// Get payer name
	members, err := te.householdRepo.GetMembers(ctx, householdID)
	if err != nil {
		return nil, fmt.Errorf("failed to get members: %w", err)
	}
	payerName := "Usuario"
	for _, m := range members {
		if m.UserID == userID {
			payerName = m.UserName
			break
		}
	}

	// Get category group name if available
	groupName := ""
	// CategoryGroupID is available but name requires separate lookup
	// For the draft card, the category name is sufficient

	return &MovementDraft{
		Action:            "confirm_movement",
		Type:              "HOUSEHOLD",
		Description:       description,
		Amount:            amount,
		CategoryID:        matchedCat.ID,
		CategoryName:      matchedCat.Name,
		CategoryGroup:     groupName,
		PaymentMethodID:   matchedPM.ID,
		PaymentMethodName: matchedPM.Name,
		PayerUserID:       userID,
		PayerName:         payerName,
		MovementDate:      dateStr,
	}, nil
}

func (te *ToolExecutor) prepareLoan(ctx context.Context, householdID, userID string, args map[string]any) (any, error) {
	loanType := getString(args, "type")
	direction := getString(args, "direction")
	personName := getString(args, "person")
	amount := getFloat(args, "amount")
	description := getString(args, "description")
	categoryName := getString(args, "category")
	pmName := getString(args, "payment_method")
	accountName := getString(args, "account")
	dateStr := getString(args, "date")

	if amount <= 0 {
		return map[string]string{"error": "El monto debe ser mayor a 0"}, nil
	}
	if loanType != "SPLIT" && loanType != "DEBT_PAYMENT" {
		return map[string]string{"error": "type debe ser SPLIT o DEBT_PAYMENT"}, nil
	}
	if direction != "I_TO_THEM" && direction != "THEM_TO_ME" {
		return map[string]string{"error": "direction debe ser I_TO_THEM o THEM_TO_ME"}, nil
	}

	if dateStr == "" {
		dateStr = time.Now().In(Bogota).Format("2006-01-02")
	}

	// Resolve person: check members first, then contacts
	members, err := te.householdRepo.GetMembers(ctx, householdID)
	if err != nil {
		return nil, fmt.Errorf("failed to get members: %w", err)
	}
	contacts, err := te.householdRepo.ListContacts(ctx, householdID)
	if err != nil {
		return nil, fmt.Errorf("failed to list contacts: %w", err)
	}

	var personUserID, personContactID, resolvedPersonName string
	// Try member match
	for _, m := range members {
		if strings.EqualFold(m.UserName, personName) || containsInsensitive(m.UserName, personName) {
			personUserID = m.UserID
			resolvedPersonName = m.UserName
			break
		}
	}
	// Try contact match
	if personUserID == "" {
		for _, c := range contacts {
			if strings.EqualFold(c.Name, personName) || containsInsensitive(c.Name, personName) {
				personContactID = c.ID
				resolvedPersonName = c.Name
				break
			}
		}
	}
	if personUserID == "" && personContactID == "" {
		// Return available people as options
		var names []string
		for _, m := range members {
			if m.UserID != userID {
				names = append(names, m.UserName+" (miembro)")
			}
		}
		for _, c := range contacts {
			names = append(names, c.Name+" (contacto)")
		}
		sort.Strings(names)
		return map[string]any{
			"error":            fmt.Sprintf("No encontré a '%s'", personName),
			"available_people": names,
		}, nil
	}

	// Get current user name
	userName := "Usuario"
	for _, m := range members {
		if m.UserID == userID {
			userName = m.UserName
			break
		}
	}

	// Default description
	if description == "" {
		if loanType == "SPLIT" {
			description = fmt.Sprintf("Préstamo a %s", resolvedPersonName)
			if direction == "THEM_TO_ME" {
				description = fmt.Sprintf("Préstamo de %s", resolvedPersonName)
			}
		} else {
			description = fmt.Sprintf("Pago de préstamo a %s", resolvedPersonName)
			if direction == "THEM_TO_ME" {
				description = fmt.Sprintf("Pago de préstamo de %s", resolvedPersonName)
			}
		}
	}

	// Determine if category is needed based on type and direction
	// Rules (matching frontend updateCategoryVisibility):
	// - DEBT_PAYMENT: never (expense was categorized when loan was created)
	// - SPLIT + I_TO_THEM: payer is me (member) → no category (just a loan, not an expense)
	// - SPLIT + THEM_TO_ME + person is contact: payer is contact → needs category (we receive something)
	// - SPLIT + THEM_TO_ME + person is member: payer is member → no category
	needsCategory := false
	if loanType == "SPLIT" && direction == "THEM_TO_ME" && personContactID != "" {
		needsCategory = true
	}

	var matchedCat *categories.Category
	if needsCategory {
		cats, err := te.categoriesRepo.ListByHousehold(ctx, householdID, false)
		if err != nil {
			return nil, fmt.Errorf("failed to list categories: %w", err)
		}

		if categoryName != "" {
			groupNames := make(map[string]string)
			groups, _ := te.categoryGroupRepo.ListByHousehold(ctx, householdID, false)
			for _, g := range groups {
				groupNames[g.ID] = g.Name
			}
			// Handle "Group > Name" or "Group - Name" format
			groupFilter := ""
			catNameFilter := categoryName
			if parts := strings.SplitN(categoryName, " > ", 2); len(parts) == 2 {
				groupFilter = parts[0]
				catNameFilter = parts[1]
			} else if parts := strings.SplitN(categoryName, " - ", 2); len(parts) == 2 {
				groupFilter = parts[0]
				catNameFilter = parts[1]
			}
			for _, c := range cats {
				if strings.EqualFold(c.Name, catNameFilter) {
					if groupFilter == "" || (c.CategoryGroupID != nil && strings.EqualFold(groupNames[*c.CategoryGroupID], groupFilter)) {
						matchedCat = c
						break
					}
				}
			}
			if matchedCat == nil {
				for _, c := range cats {
					if containsInsensitive(c.Name, catNameFilter) {
						matchedCat = c
						break
					}
				}
			}
		}
		if matchedCat == nil {
			groupNames := make(map[string]string)
			groups, _ := te.categoryGroupRepo.ListByHousehold(ctx, householdID, false)
			for _, g := range groups {
				groupNames[g.ID] = g.Name
			}
			var names []string
			for _, c := range cats {
				displayName := c.Name
				if c.CategoryGroupID != nil {
					if gn, ok := groupNames[*c.CategoryGroupID]; ok {
						displayName = gn + " > " + c.Name
					}
				}
				names = append(names, displayName)
			}
			sort.Strings(names)
			msg := "Selecciona la categoría para el préstamo"
			if categoryName != "" {
				msg = fmt.Sprintf("No encontré la categoría '%s'", categoryName)
			}
			return map[string]any{
				"error":                msg,
				"available_categories": names,
			}, nil
		}
	}

	// Resolve payment method (for the payer)
	pms, err := te.paymentMethodRepo.ListByHousehold(ctx, householdID)
	if err != nil {
		return nil, fmt.Errorf("failed to list payment methods: %w", err)
	}

	// Only ask for payment method if the payer is a household member
	payerIsMember := (direction == "I_TO_THEM") || (direction == "THEM_TO_ME" && personUserID != "")
	var matchedPM *paymentmethods.PaymentMethod
	if payerIsMember {
		if pmName != "" {
			for _, pm := range pms {
				if strings.EqualFold(pm.Name, pmName) || containsInsensitive(pm.Name, pmName) {
					matchedPM = pm
					break
				}
			}
		}
		if matchedPM == nil {
			var names []string
			for _, pm := range pms {
				names = append(names, pm.Name)
			}
			msg := "Selecciona el método de pago"
			if pmName != "" {
				msg = fmt.Sprintf("No encontré el método de pago '%s'", pmName)
			}
			return map[string]any{
				"error":                     msg,
				"available_payment_methods": names,
			}, nil
		}
	}

	// Build draft based on type and direction
	draft := &MovementDraft{
		Action:       "confirm_movement",
		Type:         loanType,
		Description:  description,
		Amount:       amount,
		MovementDate: dateStr,
	}

	if matchedCat != nil {
		draft.CategoryID = matchedCat.ID
		draft.CategoryName = matchedCat.Name
	}

	if matchedPM != nil {
		draft.PaymentMethodID = matchedPM.ID
		draft.PaymentMethodName = matchedPM.Name
	}

	if loanType == "SPLIT" {
		if direction == "I_TO_THEM" {
			// I lent them: payer=me, participant=them
			draft.PayerUserID = userID
			draft.PayerName = userName
			p := ParticipantDraft{Name: resolvedPersonName, Percentage: 1.0}
			if personUserID != "" {
				p.UserID = personUserID
			} else {
				p.ContactID = personContactID
			}
			draft.Participants = []ParticipantDraft{p}
		} else {
			// They lent me: payer=them, participant=me
			draft.PayerName = resolvedPersonName
			if personUserID != "" {
				draft.PayerUserID = personUserID
			} else {
				draft.PayerContactID = personContactID
			}
			draft.Participants = []ParticipantDraft{
				{UserID: userID, Name: userName, Percentage: 1.0},
			}
		}
	} else { // DEBT_PAYMENT
		if direction == "I_TO_THEM" {
			// I paid them back: payer=me, counterparty=them
			draft.PayerUserID = userID
			draft.PayerName = userName
			draft.CounterpartyName = resolvedPersonName
			if personUserID != "" {
				draft.CounterpartyUserID = personUserID
			} else {
				draft.CounterpartyContactID = personContactID
			}
		} else {
			// They paid me back: payer=them, counterparty=me
			draft.PayerName = resolvedPersonName
			if personUserID != "" {
				draft.PayerUserID = personUserID
			} else {
				draft.PayerContactID = personContactID
			}
			draft.CounterpartyUserID = userID
			draft.CounterpartyName = userName
		}
	}

	// Resolve receiver account for DEBT_PAYMENT when counterparty is a household member
	if loanType == "DEBT_PAYMENT" && draft.CounterpartyUserID != "" {
		allAccounts, err := te.accountsRepo.ListByHousehold(ctx, householdID)
		if err != nil {
			return nil, fmt.Errorf("failed to list accounts: %w", err)
		}

		// Filter to accounts owned by the counterparty that can receive income
		var eligible []*accounts.Account
		for _, a := range allAccounts {
			if a.Type.CanReceiveIncome() && a.OwnerID == draft.CounterpartyUserID {
				eligible = append(eligible, a)
			}
		}

		// Try to match by name if user provided one
		var matchedAccount *accounts.Account
		if accountName != "" {
			for _, a := range eligible {
				if strings.EqualFold(a.Name, accountName) || containsInsensitive(a.Name, accountName) {
					matchedAccount = a
					break
				}
			}
		}

		if matchedAccount != nil {
			draft.ReceiverAccountID = matchedAccount.ID
			draft.ReceiverAccountName = matchedAccount.Name
		} else if len(eligible) == 1 {
			// Auto-select the counterparty's only account
			draft.ReceiverAccountID = eligible[0].ID
			draft.ReceiverAccountName = eligible[0].Name
		} else if len(eligible) > 1 {
			var names []string
			for _, a := range eligible {
				names = append(names, a.Name)
			}
			msg := "Selecciona la cuenta donde recibe el pago"
			if accountName != "" {
				msg = fmt.Sprintf("No encontré la cuenta '%s'", accountName)
			}
			return map[string]any{
				"error":              msg,
				"available_accounts": names,
			}, nil
		}
	}

	return draft, nil
}

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
		"date":        m.MovementDate.In(Bogota).Format("2006-01-02"),
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

func getFloat(args map[string]any, key string) float64 {
	if v, ok := args[key]; ok {
		switch n := v.(type) {
		case float64:
			return n
		case int:
			return float64(n)
		}
	}
	return 0
}

func stringOrDefault(s *string, def string) string {
	if s != nil {
		return *s
	}
	return def
}
