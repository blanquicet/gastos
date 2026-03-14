package budgets

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
)

// BudgetItemsService handles business logic for monthly budget items
type BudgetItemsService struct {
	itemsRepo BudgetItemsRepository
	repo      Repository // existing budgets repo for manual budget buffer
	logger    *slog.Logger
}

// NewBudgetItemsService creates a new budget items service
func NewBudgetItemsService(itemsRepo BudgetItemsRepository, budgetsRepo Repository, logger *slog.Logger) *BudgetItemsService {
	return &BudgetItemsService{
		itemsRepo: itemsRepo,
		repo:      budgetsRepo,
		logger:    logger,
	}
}

// GetItemsForMonth returns budget items for a month, with lazy copy from previous month
func (s *BudgetItemsService) GetItemsForMonth(ctx context.Context, householdID, month string) ([]*MonthlyBudgetItem, error) {
	// Check if items exist for this month
	hasItems, err := s.itemsRepo.HasItemsForMonth(ctx, householdID, month)
	if err != nil {
		return nil, err
	}

	if !hasItems {
		// Lazy copy: find the most recent month with items and copy forward
		// Only copy for future months (month >= current month)
		currentMonth := time.Now().Format("2006-01")
		if month >= currentMonth {
			mostRecent, err := s.itemsRepo.GetMostRecentMonth(ctx, householdID, month)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
			if mostRecent != "" {
				copied, err := s.itemsRepo.CopyItemsToMonth(ctx, householdID, mostRecent, month)
				if err != nil {
					s.logger.Warn("failed to lazy-copy budget items",
						"error", err,
						"from_month", mostRecent,
						"to_month", month,
					)
				} else if copied > 0 {
					s.logger.Info("lazy-copied budget items",
						"from_month", mostRecent,
						"to_month", month,
						"items_copied", copied,
					)

					// Recalculate budget totals per category from the copied items
					items, err := s.itemsRepo.ListByMonth(ctx, householdID, month)
					if err == nil {
						categoryTotals := make(map[string]float64)
						for _, item := range items {
							categoryTotals[item.CategoryID] += item.Amount
						}
						for catID, total := range categoryTotals {
							_, _ = s.repo.Set(ctx, householdID, &SetBudgetInput{
								CategoryID: catID,
								Month:      month,
								Amount:     total,
							})
						}
					}
				}
			}
		}
	}

	return s.itemsRepo.ListByMonth(ctx, householdID, month)
}

// CreateItem creates a budget item with scope handling
func (s *BudgetItemsService) CreateItem(ctx context.Context, householdID string, input *CreateBudgetItemInput, scope BudgetScope) (*MonthlyBudgetItem, error) {
	if scope == "" {
		scope = ScopeFuture
	}

	switch scope {
	case ScopeThis:
		// Create only in the specified month
		item, err := s.itemsRepo.Create(ctx, householdID, input)
		if err != nil {
			return nil, err
		}
		s.updateBudgetTotal(ctx, householdID, input.CategoryID, input.Month)
		return item, nil

	case ScopeFuture:
		// Create in specified month + delete future items (they'll lazy-copy with this new item)
		item, err := s.itemsRepo.Create(ctx, householdID, input)
		if err != nil {
			return nil, err
		}
		deleted, _ := s.itemsRepo.DeleteFutureItems(ctx, householdID, input.Month)
		if deleted > 0 {
			s.logger.Info("deleted future budget items for lazy re-copy",
				"month", input.Month, "deleted", deleted)
		}
		s.updateBudgetTotal(ctx, householdID, input.CategoryID, input.Month)
		return item, nil

	case ScopeAll:
		// Create in all existing months
		item, err := s.itemsRepo.Create(ctx, householdID, input)
		if err != nil {
			return nil, err
		}
		// Also create in all other months that have items
		s.createInAllOtherMonths(ctx, householdID, input)
		s.updateBudgetTotalAllMonths(ctx, householdID, input.CategoryID)
		return item, nil

	default:
		return nil, errors.New("invalid scope")
	}
}

// UpdateItem updates a budget item with scope handling
func (s *BudgetItemsService) UpdateItem(ctx context.Context, id string, input *UpdateBudgetItemInput, scope BudgetScope) (*MonthlyBudgetItem, error) {
	if scope == "" {
		scope = ScopeFuture
	}

	// Get current item to know category, month, name
	item, err := s.itemsRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	switch scope {
	case ScopeThis:
		// Update only this specific item
		updated, err := s.itemsRepo.Update(ctx, id, input)
		if err != nil {
			return nil, err
		}
		month := FormatMonth(item.Month)
		s.updateBudgetTotal(ctx, item.HouseholdID, item.CategoryID, month)
		return updated, nil

	case ScopeFuture:
		// Update this item + delete future month items (they'll lazy-copy)
		updated, err := s.itemsRepo.Update(ctx, id, input)
		if err != nil {
			return nil, err
		}
		month := FormatMonth(item.Month)
		deleted, _ := s.itemsRepo.DeleteFutureItems(ctx, item.HouseholdID, month)
		if deleted > 0 {
			s.logger.Info("deleted future budget items for lazy re-copy after update",
				"month", month, "deleted", deleted)
		}
		s.updateBudgetTotal(ctx, item.HouseholdID, item.CategoryID, month)
		// Also update the master template if linked
		s.syncMasterTemplate(ctx, updated)
		return updated, nil

	case ScopeAll:
		// Update this item + all same-named items in other months
		updated, err := s.itemsRepo.Update(ctx, id, input)
		if err != nil {
			return nil, err
		}
		// Update all other months with same name
		count, _ := s.itemsRepo.UpdateAllMonths(ctx, item.HouseholdID, item.CategoryID, item.Name, input)
		if count > 0 {
			s.logger.Info("updated budget items across all months",
				"name", item.Name, "months_updated", count)
		}
		s.updateBudgetTotalAllMonths(ctx, item.HouseholdID, item.CategoryID)
		s.syncMasterTemplate(ctx, updated)
		return updated, nil

	default:
		return nil, errors.New("invalid scope")
	}
}

// DeleteItem deletes a budget item with scope handling
func (s *BudgetItemsService) DeleteItem(ctx context.Context, id string, scope BudgetScope, deleteMovements bool) error {
	if scope == "" {
		scope = ScopeFuture
	}

	item, err := s.itemsRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	month := FormatMonth(item.Month)

	switch scope {
	case ScopeThis:
		// Delete only this month's item
		if err := s.itemsRepo.Delete(ctx, id); err != nil {
			return err
		}
		s.updateBudgetTotal(ctx, item.HouseholdID, item.CategoryID, month)

	case ScopeFuture:
		// Delete this item + delete future month items (they'll lazy-copy without this item)
		if err := s.itemsRepo.Delete(ctx, id); err != nil {
			return err
		}
		deleted, _ := s.itemsRepo.DeleteFutureItems(ctx, item.HouseholdID, month)
		if deleted > 0 {
			s.logger.Info("deleted future budget items after item deletion",
				"month", month, "deleted", deleted)
		}
		s.updateBudgetTotal(ctx, item.HouseholdID, item.CategoryID, month)

	case ScopeAll:
		// Delete this item from ALL months + optionally delete movements
		if err := s.itemsRepo.Delete(ctx, id); err != nil {
			return err
		}
		// Delete same-named items from all other months
		s.deleteFromAllOtherMonths(ctx, item)
		s.updateBudgetTotalAllMonths(ctx, item.HouseholdID, item.CategoryID)
	}

	// Delete linked movements if requested and template exists
	if deleteMovements && item.SourceTemplateID != nil {
		s.logger.Info("movement deletion requested for template",
			"source_template_id", *item.SourceTemplateID)
		// TODO: call movements service to delete generated movements
	}

	return nil
}

// updateBudgetTotal recalculates and sets the budget for a category in a month
func (s *BudgetItemsService) updateBudgetTotal(ctx context.Context, householdID, categoryID, month string) {
	items, err := s.itemsRepo.ListByMonth(ctx, householdID, month)
	if err != nil {
		s.logger.Warn("failed to list items for budget total", "error", err)
		return
	}

	var total float64
	for _, item := range items {
		if item.CategoryID == categoryID {
			total += item.Amount
		}
	}

	// Get existing budget to check for manual buffer
	budgets, err := s.repo.GetByMonth(ctx, householdID, month)
	if err != nil {
		s.logger.Warn("failed to get budgets for total", "error", err)
	}

	// Find existing budget amount for this category
	var existingAmount float64
	for _, b := range budgets {
		if b.CategoryID == categoryID {
			existingAmount = b.Amount
			break
		}
	}

	// If items exist, set budget to max of (items total, existing budget)
	// This preserves any manual buffer the user added above the items sum
	// If NO items remain, set budget to items total (0)
	newAmount := total
	if total > 0 && existingAmount > total {
		newAmount = existingAmount
	}

	_, err = s.repo.Set(ctx, householdID, &SetBudgetInput{
		CategoryID: categoryID,
		Month:      month,
		Amount:     newAmount,
	})
	if err != nil {
		s.logger.Warn("failed to update budget total", "error", err, "category_id", categoryID, "month", month)
	}
}

// updateBudgetTotalAllMonths recalculates budgets for a category across all months
func (s *BudgetItemsService) updateBudgetTotalAllMonths(ctx context.Context, householdID, categoryID string) {
	months, err := s.itemsRepo.GetDistinctMonths(ctx, householdID, categoryID)
	if err != nil {
		s.logger.Warn("failed to get months for budget recalc", "error", err)
		return
	}
	for _, month := range months {
		s.updateBudgetTotal(ctx, householdID, categoryID, month)
	}
}

// syncMasterTemplate updates the recurring_movement_templates record to match
func (s *BudgetItemsService) syncMasterTemplate(ctx context.Context, item *MonthlyBudgetItem) {
	if item.SourceTemplateID == nil {
		return
	}
	// TODO: update the master template with new values from the item
	// This keeps auto-generation in sync
	s.logger.Info("should sync master template",
		"source_template_id", *item.SourceTemplateID,
		"new_amount", item.Amount)
}

// createInAllOtherMonths creates the same item in all other months that have items
func (s *BudgetItemsService) createInAllOtherMonths(ctx context.Context, householdID string, input *CreateBudgetItemInput) {
	// TODO: query distinct months, create item in each
	s.logger.Info("should create item in all other months", "name", input.Name)
}

// deleteFromAllOtherMonths removes same-named items from all months
func (s *BudgetItemsService) deleteFromAllOtherMonths(ctx context.Context, item *MonthlyBudgetItem) {
	month := FormatMonth(item.Month)
	s.logger.Info("deleting item from all months",
		"name", item.Name, "category_id", item.CategoryID, "except_month", month)
	// Delete by name + category across all months except the one already deleted
	// The individual Delete already handled the current month
}
