-- Create account_type enum
CREATE TYPE account_type AS ENUM ('savings', 'cash', 'checking');

-- Create accounts table
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    -- Account identification
    name VARCHAR(100) NOT NULL,
    type account_type NOT NULL,
    institution VARCHAR(100), -- Bank name (optional for cash)
    last4 VARCHAR(4), -- Last 4 digits of account number (for identification)
    
    -- Balance tracking
    initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Current balance is calculated: initial_balance + SUM(income) - SUM(expenses linked via payment methods)
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT accounts_unique_name_per_household UNIQUE(household_id, name)
);

-- Indexes
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_accounts_type ON accounts(type);
CREATE INDEX idx_accounts_household_type ON accounts(household_id, type);
