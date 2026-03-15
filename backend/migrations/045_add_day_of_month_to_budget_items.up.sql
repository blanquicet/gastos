-- Add day_of_month directly to monthly_budget_items
-- This allows budget items created without a source template to store their day
ALTER TABLE monthly_budget_items
    ADD COLUMN day_of_month INT CHECK (day_of_month >= 1 AND day_of_month <= 31);

-- Backfill from source templates where available
UPDATE monthly_budget_items mbi
SET day_of_month = rmt.day_of_month
FROM recurring_movement_templates rmt
WHERE mbi.source_template_id = rmt.id
  AND rmt.day_of_month IS NOT NULL;
