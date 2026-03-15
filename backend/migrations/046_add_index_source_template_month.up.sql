-- Add partial index for looking up budget items by source template + month
-- Used by the generator to find per-month overrides when auto-generating movements
CREATE INDEX idx_budget_items_source_template_month
ON monthly_budget_items (source_template_id, month)
WHERE source_template_id IS NOT NULL;
