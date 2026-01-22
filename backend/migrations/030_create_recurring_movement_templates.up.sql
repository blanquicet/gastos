-- Migration 031: Create recurring_movement_templates table
-- Templates for recurring movements (gastos periódicos)
-- Can auto-generate movements AND/OR serve as dropdown pre-fill templates

-- Create recurrence_pattern enum
CREATE TYPE recurrence_pattern AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');

-- Create recurring_movement_templates table
CREATE TABLE recurring_movement_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    -- Template metadata
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Movement template data
    type movement_type NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    
    -- Amount configuration (always required - either exact or estimated)
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'COP',
    
    -- Auto-generation configuration
    auto_generate BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Payer (user or contact - exactly one required)
    payer_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    payer_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    CHECK (
        (payer_user_id IS NOT NULL AND payer_contact_id IS NULL) OR 
        (payer_user_id IS NULL AND payer_contact_id IS NOT NULL)
    ),
    
    -- Counterparty (only for DEBT_PAYMENT type)
    counterparty_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    counterparty_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    CHECK (
        (type = 'DEBT_PAYMENT' AND (
            (counterparty_user_id IS NOT NULL AND counterparty_contact_id IS NULL) OR 
            (counterparty_user_id IS NULL AND counterparty_contact_id IS NOT NULL)
        )) OR
        (type != 'DEBT_PAYMENT' AND counterparty_user_id IS NULL AND counterparty_contact_id IS NULL)
    ),
    
    -- Payment method
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE RESTRICT,
    
    -- Recurrence settings (only for auto_generate=true)
    recurrence_pattern recurrence_pattern,
    day_of_month INT CHECK (day_of_month >= 1 AND day_of_month <= 31),
    month_of_year INT CHECK (month_of_year >= 1 AND month_of_year <= 12),
    day_of_year INT CHECK (day_of_year >= 1 AND day_of_year <= 31),
    
    -- Schedule tracking (only for auto_generate=true)
    start_date DATE,
    last_generated_date DATE,
    next_scheduled_date DATE,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(household_id, name),
    CHECK (name != ''),
    
    -- Auto-generation validation
    CHECK (
        (auto_generate = TRUE AND recurrence_pattern IS NOT NULL AND start_date IS NOT NULL) OR
        (auto_generate = FALSE)
    ),
    -- Recurrence pattern validation (only checked if auto_generate=true)
    CHECK (
        auto_generate = FALSE OR
        (recurrence_pattern = 'MONTHLY' AND day_of_month IS NOT NULL AND month_of_year IS NULL AND day_of_year IS NULL) OR
        (recurrence_pattern = 'YEARLY' AND day_of_month IS NULL AND month_of_year IS NOT NULL AND day_of_year IS NOT NULL) OR
        (recurrence_pattern = 'ONE_TIME' AND day_of_month IS NULL AND month_of_year IS NULL AND day_of_year IS NULL)
    )
);

-- Indexes
CREATE INDEX idx_recurring_templates_household ON recurring_movement_templates(household_id);
CREATE INDEX idx_recurring_templates_household_active ON recurring_movement_templates(household_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_recurring_templates_category ON recurring_movement_templates(category_id);
CREATE INDEX idx_recurring_templates_next_scheduled ON recurring_movement_templates(next_scheduled_date) WHERE is_active = TRUE AND auto_generate = TRUE;
CREATE INDEX idx_recurring_templates_household_category ON recurring_movement_templates(household_id, category_id) WHERE is_active = TRUE;

-- Comments
COMMENT ON TABLE recurring_movement_templates IS 'Templates for recurring movements (gastos periódicos). Can auto-generate movements on schedule AND/OR provide dropdown pre-fill templates.';
COMMENT ON COLUMN recurring_movement_templates.name IS 'Template name shown in UI dropdown (e.g., "Arriendo", "Servicios (Energía)")';
COMMENT ON COLUMN recurring_movement_templates.amount IS 'Amount - always required. For auto-generate: exact value. For manual: estimated value (can be adjusted when creating movement).';
COMMENT ON COLUMN recurring_movement_templates.auto_generate IS 'If true, automatically creates movements on schedule. If false, only appears in dropdown for manual pre-fill.';
COMMENT ON COLUMN recurring_movement_templates.recurrence_pattern IS 'How often to auto-generate (only if auto_generate=true): MONTHLY, YEARLY, ONE_TIME';
COMMENT ON COLUMN recurring_movement_templates.day_of_month IS 'Day of month for MONTHLY recurrence (1-31)';
COMMENT ON COLUMN recurring_movement_templates.month_of_year IS 'Month for YEARLY recurrence (1-12)';
COMMENT ON COLUMN recurring_movement_templates.day_of_year IS 'Day within month for YEARLY recurrence (1-31)';
COMMENT ON COLUMN recurring_movement_templates.start_date IS 'Date to start auto-generating movements (only if auto_generate=true)';
COMMENT ON COLUMN recurring_movement_templates.last_generated_date IS 'Last date a movement was auto-generated (only if auto_generate=true)';
COMMENT ON COLUMN recurring_movement_templates.next_scheduled_date IS 'Next scheduled auto-generation date (only if auto_generate=true)';
