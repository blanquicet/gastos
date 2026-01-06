-- Create movement_type enum
CREATE TYPE movement_type AS ENUM ('HOUSEHOLD', 'SPLIT', 'DEBT_PAYMENT');

-- Create movements table
CREATE TABLE movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    -- Movement type and metadata
    type movement_type NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    category VARCHAR(100), -- Required for HOUSEHOLD and DEBT_PAYMENT (when payer is household member), nullable for SPLIT
    movement_date DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'COP',
    
    -- Payer (user or contact - exactly one required)
    payer_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    payer_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    CHECK (
        (payer_user_id IS NOT NULL AND payer_contact_id IS NULL) OR 
        (payer_user_id IS NULL AND payer_contact_id IS NOT NULL)
    ),
    
    -- Counterparty (only for DEBT_PAYMENT - user or contact)
    counterparty_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    counterparty_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    CHECK (
        -- For DEBT_PAYMENT, exactly one counterparty required
        -- For other types, both must be NULL
        (type = 'DEBT_PAYMENT' AND (
            (counterparty_user_id IS NOT NULL AND counterparty_contact_id IS NULL) OR 
            (counterparty_user_id IS NULL AND counterparty_contact_id IS NOT NULL)
        )) OR
        (type != 'DEBT_PAYMENT' AND counterparty_user_id IS NULL AND counterparty_contact_id IS NULL)
    ),
    
    -- Payment method (required for HOUSEHOLD, conditional for SPLIT/DEBT_PAYMENT)
    -- When payer is external contact, payment_method_id can be NULL
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE RESTRICT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_movements_household ON movements(household_id);
CREATE INDEX idx_movements_type ON movements(type);
CREATE INDEX idx_movements_date ON movements(movement_date);
CREATE INDEX idx_movements_household_date ON movements(household_id, movement_date DESC);
CREATE INDEX idx_movements_household_type ON movements(household_id, type);

-- Indexes for payer (partial indexes - only when not null)
CREATE INDEX idx_movements_payer_user ON movements(payer_user_id) WHERE payer_user_id IS NOT NULL;
CREATE INDEX idx_movements_payer_contact ON movements(payer_contact_id) WHERE payer_contact_id IS NOT NULL;

-- Indexes for counterparty (partial indexes - only when not null)
CREATE INDEX idx_movements_counterparty_user ON movements(counterparty_user_id) WHERE counterparty_user_id IS NOT NULL;
CREATE INDEX idx_movements_counterparty_contact ON movements(counterparty_contact_id) WHERE counterparty_contact_id IS NOT NULL;

-- Index for payment method (partial index - only when not null)
CREATE INDEX idx_movements_payment_method ON movements(payment_method_id) WHERE payment_method_id IS NOT NULL;

-- Comment on table
COMMENT ON TABLE movements IS 'Stores all financial movements (HOUSEHOLD, SPLIT, DEBT_PAYMENT)';
COMMENT ON COLUMN movements.type IS 'Movement type: HOUSEHOLD (household expense), SPLIT (shared/split expense), DEBT_PAYMENT (debt payment/settlement)';
COMMENT ON COLUMN movements.payer_user_id IS 'Payer when they are a household member (user). Mutually exclusive with payer_contact_id';
COMMENT ON COLUMN movements.payer_contact_id IS 'Payer when they are an external contact. Mutually exclusive with payer_user_id';
COMMENT ON COLUMN movements.counterparty_user_id IS 'Only for DEBT_PAYMENT: who receives/owes the payment (household member)';
COMMENT ON COLUMN movements.counterparty_contact_id IS 'Only for DEBT_PAYMENT: who receives/owes the payment (external contact)';
COMMENT ON COLUMN movements.payment_method_id IS 'Payment method used. Required for HOUSEHOLD, optional for SPLIT/DEBT_PAYMENT when payer is external';
