-- Create monthly_budgets table
CREATE TABLE monthly_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Month and amount
    month DATE NOT NULL, -- Stored as first day of month (YYYY-MM-01)
    amount DECIMAL(15, 2) NOT NULL CHECK (amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'COP',
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(household_id, category_id, month)
);

-- Indexes
CREATE INDEX idx_monthly_budgets_household ON monthly_budgets(household_id);
CREATE INDEX idx_monthly_budgets_category ON monthly_budgets(category_id);
CREATE INDEX idx_monthly_budgets_household_month ON monthly_budgets(household_id, month);
CREATE INDEX idx_monthly_budgets_category_month ON monthly_budgets(category_id, month);

-- Comments
COMMENT ON TABLE monthly_budgets IS 'Monthly budget amounts per category per household';
COMMENT ON COLUMN monthly_budgets.month IS 'First day of month (e.g., 2025-01-01 for January 2025)';
COMMENT ON COLUMN monthly_budgets.amount IS 'Budget amount for this category in this month (>= 0)';
