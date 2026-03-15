-- Remove day_of_month from monthly_budget_items
ALTER TABLE monthly_budget_items DROP COLUMN IF EXISTS day_of_month;
