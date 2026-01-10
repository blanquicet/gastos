-- Drop indexes
DROP INDEX IF EXISTS idx_monthly_budgets_category_month;
DROP INDEX IF EXISTS idx_monthly_budgets_household_month;
DROP INDEX IF EXISTS idx_monthly_budgets_category;
DROP INDEX IF EXISTS idx_monthly_budgets_household;

-- Drop table
DROP TABLE IF EXISTS monthly_budgets;
