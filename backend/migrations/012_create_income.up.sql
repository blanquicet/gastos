-- Create income table
CREATE TABLE income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    
    -- Income details
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    description VARCHAR(255) NOT NULL,
    income_date DATE NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT income_positive_amount CHECK (amount > 0)
);

-- Indexes
CREATE INDEX idx_income_household ON income(household_id);
CREATE INDEX idx_income_member ON income(member_id);
CREATE INDEX idx_income_account ON income(account_id);
CREATE INDEX idx_income_date ON income(income_date);
CREATE INDEX idx_income_household_date ON income(household_id, income_date);
