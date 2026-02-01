-- Migration: Make movement_type and payer optional for budget-display-only templates
-- See docs/design/TEMPLATE_FIELD_REQUIREMENTS.md for rationale

-- 1. Make movement_type nullable (budget display only doesn't need it)
ALTER TABLE recurring_movement_templates 
    ALTER COLUMN type DROP NOT NULL;

-- 2. Drop the payer constraint (payer only required for SPLIT and DEBT_PAYMENT)
ALTER TABLE recurring_movement_templates 
    DROP CONSTRAINT IF EXISTS recurring_movement_templates_check;

-- 3. Clear payer_user_id for existing HOUSEHOLD templates (payer is implicit for HOUSEHOLD)
-- This is necessary because the new constraint requires HOUSEHOLD to NOT have a payer
UPDATE recurring_movement_templates 
    SET payer_user_id = NULL, payer_contact_id = NULL 
    WHERE type = 'HOUSEHOLD';

-- 4. Add new payer constraint that only applies when type is SPLIT or DEBT_PAYMENT AND auto_generate=true
-- For HOUSEHOLD, payer is implicit (the household pays as a unit)
-- For budget-display-only (type IS NULL), payer is not needed
-- For form pre-fill (auto_generate=false), payer is optional
ALTER TABLE recurring_movement_templates 
    ADD CONSTRAINT recurring_movement_templates_payer_check CHECK (
        -- HOUSEHOLD: payer not allowed (implicit)
        (type = 'HOUSEHOLD' AND payer_user_id IS NULL AND payer_contact_id IS NULL) OR
        
        -- SPLIT/DEBT_PAYMENT with auto_generate=true: exactly one payer required
        (type IN ('SPLIT', 'DEBT_PAYMENT') AND auto_generate = true AND (
            (payer_user_id IS NOT NULL AND payer_contact_id IS NULL) OR 
            (payer_user_id IS NULL AND payer_contact_id IS NOT NULL)
        )) OR
        
        -- SPLIT/DEBT_PAYMENT with auto_generate=false: payer optional (at most one)
        (type IN ('SPLIT', 'DEBT_PAYMENT') AND auto_generate = false AND (
            (payer_user_id IS NULL AND payer_contact_id IS NULL) OR
            (payer_user_id IS NOT NULL AND payer_contact_id IS NULL) OR 
            (payer_user_id IS NULL AND payer_contact_id IS NOT NULL)
        )) OR
        
        -- Budget display only (type IS NULL): no payer needed
        (type IS NULL AND payer_user_id IS NULL AND payer_contact_id IS NULL)
    );

-- 5. Update counterparty constraint - only required for DEBT_PAYMENT with auto_generate=true
ALTER TABLE recurring_movement_templates 
    DROP CONSTRAINT IF EXISTS recurring_movement_templates_check1;

ALTER TABLE recurring_movement_templates 
    ADD CONSTRAINT recurring_movement_templates_counterparty_check CHECK (
        -- DEBT_PAYMENT with auto_generate=true: counterparty required (exactly one)
        (type = 'DEBT_PAYMENT' AND auto_generate = true AND (
            (counterparty_user_id IS NOT NULL AND counterparty_contact_id IS NULL) OR 
            (counterparty_user_id IS NULL AND counterparty_contact_id IS NOT NULL)
        )) OR
        -- DEBT_PAYMENT with auto_generate=false: counterparty optional (at most one)
        (type = 'DEBT_PAYMENT' AND auto_generate = false AND (
            (counterparty_user_id IS NULL AND counterparty_contact_id IS NULL) OR
            (counterparty_user_id IS NOT NULL AND counterparty_contact_id IS NULL) OR 
            (counterparty_user_id IS NULL AND counterparty_contact_id IS NOT NULL)
        )) OR
        -- Other types (HOUSEHOLD, SPLIT, NULL): no counterparty allowed
        (type != 'DEBT_PAYMENT' AND counterparty_user_id IS NULL AND counterparty_contact_id IS NULL) OR
        (type IS NULL AND counterparty_user_id IS NULL AND counterparty_contact_id IS NULL)
    );

-- 6. Add receiver_account_id column (for DEBT_PAYMENT when counterparty is a member)
ALTER TABLE recurring_movement_templates 
    ADD COLUMN IF NOT EXISTS receiver_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT;

-- 7. Create index for receiver_account_id
CREATE INDEX IF NOT EXISTS idx_recurring_movement_templates_receiver_account 
    ON recurring_movement_templates(receiver_account_id) 
    WHERE receiver_account_id IS NOT NULL;
