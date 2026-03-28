CREATE TABLE pockets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10) NOT NULL DEFAULT '💰',
    color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
    goal_amount DECIMAL(15, 2) CHECK (goal_amount IS NULL OR goal_amount > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pockets_unique_name_per_household UNIQUE(household_id, name)
);

CREATE INDEX idx_pockets_household ON pockets(household_id);
CREATE INDEX idx_pockets_owner ON pockets(owner_id);
CREATE INDEX idx_pockets_household_active ON pockets(household_id) WHERE is_active = TRUE;
