-- Rollback: Make movement_type and payer required again

-- 1. Drop the new constraints
ALTER TABLE recurring_movement_templates 
    DROP CONSTRAINT IF EXISTS recurring_movement_templates_payer_check;

ALTER TABLE recurring_movement_templates 
    DROP CONSTRAINT IF EXISTS recurring_movement_templates_counterparty_check;

-- 2. Make movement_type NOT NULL again (will fail if any NULL values exist)
ALTER TABLE recurring_movement_templates 
    ALTER COLUMN type SET NOT NULL;

-- 3. Re-add the original payer constraint (exactly one required)
ALTER TABLE recurring_movement_templates 
    ADD CONSTRAINT recurring_movement_templates_check CHECK (
        (payer_user_id IS NOT NULL AND payer_contact_id IS NULL) OR 
        (payer_user_id IS NULL AND payer_contact_id IS NOT NULL)
    );

-- 4. Re-add the original counterparty constraint
ALTER TABLE recurring_movement_templates 
    ADD CONSTRAINT recurring_movement_templates_check1 CHECK (
        (type = 'DEBT_PAYMENT' AND (
            (counterparty_user_id IS NOT NULL AND counterparty_contact_id IS NULL) OR 
            (counterparty_user_id IS NULL AND counterparty_contact_id IS NOT NULL)
        )) OR
        (type != 'DEBT_PAYMENT' AND counterparty_user_id IS NULL AND counterparty_contact_id IS NULL)
    );

-- 5. Drop the receiver_account_id column
DROP INDEX IF EXISTS idx_recurring_movement_templates_receiver_account;
ALTER TABLE recurring_movement_templates DROP COLUMN IF EXISTS receiver_account_id;
