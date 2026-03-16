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
	itemsRepo      BudgetItemsRepository
	logger         *slog.Logger
	syncTemplateFn func(ctx context.Context, templateID string, item *MonthlyBudgetItem) error
	budgetSyncFn   func(ctx context.Context, householdID, categoryID, month string) error
}

// NewBudgetItemsService creates a new budget items service
func NewBudgetItemsService(itemsRepo BudgetItemsRepository, logger *slog.Logger) *BudgetItemsService {
	return &BudgetItemsService{
		itemsRepo: itemsRepo,
		logger:    logger,
	}
}

// SetSyncTemplateFn sets the function used to sync budget item changes back to the master template
func (s *BudgetItemsService) SetSyncTemplateFn(fn func(ctx context.Context, templateID string, item *MonthlyBudgetItem) error) {
	s.syncTemplateFn = fn
}

// SetBudgetSyncFn sets the function used to auto-sync monthly_budgets after item mutations
func (s *BudgetItemsService) SetBudgetSyncFn(fn func(ctx context.Context, householdID, categoryID, month string) error) {
	s.budgetSyncFn = fn
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
				}
			}
		}
	}

	return s.itemsRepo.ListByMonth(ctx, householdID, month)
}

// GetItemByID returns a single budget item, verifying household ownership
func (s *BudgetItemsService) GetItemByID(ctx context.Context, householdID, id string) (*MonthlyBudgetItem, error) {
	item, err := s.itemsRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if item.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}
	return item, nil
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
		s.syncBudgetTotal(ctx, householdID, input.CategoryID, input.Month)
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
		s.syncBudgetTotal(ctx, householdID, input.CategoryID, input.Month)
		return item, nil

	case ScopeAll:
		// Create in all existing months
		item, err := s.itemsRepo.Create(ctx, householdID, input)
		if err != nil {
			return nil, err
		}
		// Also create in all other months that have items
		s.createInAllOtherMonths(ctx, householdID, input)
		// Sync budget totals for ALL affected months
		s.syncBudgetAllMonths(ctx, householdID, input.CategoryID)
		return item, nil

	default:
		return nil, errors.New("invalid scope")
	}
}

// UpdateItem updates a budget item with scope handling
func (s *BudgetItemsService) UpdateItem(ctx context.Context, householdID, id string, input *UpdateBudgetItemInput, scope BudgetScope) (*MonthlyBudgetItem, error) {
	if scope == "" {
		scope = ScopeFuture
	}

	// Get current item to know category, month, name
	item, err := s.itemsRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if item.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	switch scope {
	case ScopeThis:
		// Update only this specific item
		updated, err := s.itemsRepo.Update(ctx, id, input)
		if err != nil {
			return nil, err
		}
		s.syncBudgetTotal(ctx, householdID, item.CategoryID, FormatMonth(item.Month))
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
		// Also update the master template if linked
		s.syncMasterTemplate(ctx, updated)
		s.syncBudgetTotal(ctx, householdID, item.CategoryID, month)
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
		s.syncMasterTemplate(ctx, updated)
		// Sync budget totals for ALL affected months
		s.syncBudgetAllMonths(ctx, householdID, item.CategoryID)
		return updated, nil

	default:
		return nil, errors.New("invalid scope")
	}
}

// DeleteItem deletes a budget item with scope handling
func (s *BudgetItemsService) DeleteItem(ctx context.Context, householdID, id string, scope BudgetScope) error {
	if scope == "" {
		scope = ScopeFuture
	}

	item, err := s.itemsRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if item.HouseholdID != householdID {
		return ErrNotAuthorized
	}

	month := FormatMonth(item.Month)

	switch scope {
	case ScopeThis:
		// Delete only this month's item
		if err := s.itemsRepo.Delete(ctx, id); err != nil {
			return err
		}

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

	case ScopeAll:
		// Delete this item from ALL months
		if err := s.itemsRepo.Delete(ctx, id); err != nil {
			return err
		}
		// Delete same-named items from all other months
		s.deleteFromAllOtherMonths(ctx, item)
		// Sync budget totals for ALL affected months
		s.syncBudgetAllMonths(ctx, householdID, item.CategoryID)
		return nil
	}

	// For ScopeThis and ScopeFuture, sync only the affected month
	s.syncBudgetTotal(ctx, householdID, item.CategoryID, month)

	return nil
}

// syncBudgetTotal auto-syncs the monthly_budgets record after item mutations
func (s *BudgetItemsService) syncBudgetTotal(ctx context.Context, householdID, categoryID, month string) {
	if s.budgetSyncFn == nil {
		return
	}
	if err := s.budgetSyncFn(ctx, householdID, categoryID, month); err != nil {
		s.logger.Warn("failed to sync budget total after item mutation",
			"error", err,
			"household_id", householdID,
			"category_id", categoryID,
			"month", month,
		)
	}
}

// syncBudgetAllMonths syncs budget totals for every month that has items in this category
func (s *BudgetItemsService) syncBudgetAllMonths(ctx context.Context, householdID, categoryID string) {
	if s.budgetSyncFn == nil {
		return
	}
	months, err := s.itemsRepo.GetDistinctMonths(ctx, householdID, categoryID)
	if err != nil {
		s.logger.Warn("failed to get distinct months for budget sync", "error", err)
		return
	}
	for _, m := range months {
		s.syncBudgetTotal(ctx, householdID, categoryID, m)
	}
}

// syncMasterTemplate updates the recurring_movement_templates record to match
func (s *BudgetItemsService) syncMasterTemplate(ctx context.Context, item *MonthlyBudgetItem) {
	if item.SourceTemplateID == nil || s.syncTemplateFn == nil {
		return
	}
	if err := s.syncTemplateFn(ctx, *item.SourceTemplateID, item); err != nil {
		s.logger.Warn("failed to sync master template", "error", err, "template_id", *item.SourceTemplateID)
	}
}

// createInAllOtherMonths creates the same item in all other months that have items
func (s *BudgetItemsService) createInAllOtherMonths(ctx context.Context, householdID string, input *CreateBudgetItemInput) {
	months, err := s.itemsRepo.GetDistinctMonths(ctx, householdID, input.CategoryID)
	if err != nil {
		s.logger.Warn("failed to get months for ScopeAll create", "error", err)
		return
	}
	for _, m := range months {
		if m == input.Month {
			continue // already created in this month
		}
		_, err := s.itemsRepo.CreateInMonth(ctx, householdID, input, m)
		if err != nil {
			s.logger.Warn("failed to create item in month", "error", err, "month", m, "name", input.Name)
		}
	}
}

// deleteFromAllOtherMonths removes same-named items from all months
func (s *BudgetItemsService) deleteFromAllOtherMonths(ctx context.Context, item *MonthlyBudgetItem) {
	deleted, err := s.itemsRepo.DeleteByNameAndCategory(ctx, item.HouseholdID, item.CategoryID, item.Name)
	if err != nil {
		s.logger.Warn("failed to delete items from all months", "error", err)
		return
	}
	if deleted > 0 {
		s.logger.Info("deleted budget items from all months",
			"name", item.Name, "category_id", item.CategoryID, "deleted", deleted)
	}
}
