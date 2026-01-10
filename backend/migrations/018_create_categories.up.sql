-- Create categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    -- Category info
    name VARCHAR(100) NOT NULL,
    category_group VARCHAR(100), -- Optional grouping (Casa, Jose, Caro, Carro, etc.)
    
    -- UI metadata
    icon VARCHAR(10), -- Emoji or icon identifier
    color VARCHAR(20), -- Hex color or color name
    display_order INT NOT NULL DEFAULT 0,
    
    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(household_id, name),
    CHECK (name != '')
);

-- Indexes
CREATE INDEX idx_categories_household ON categories(household_id);
CREATE INDEX idx_categories_household_active ON categories(household_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_categories_household_group ON categories(household_id, category_group);
CREATE INDEX idx_categories_display_order ON categories(household_id, display_order);

-- Comments
COMMENT ON TABLE categories IS 'Expense categories per household (customizable, moved from hardcoded list)';
COMMENT ON COLUMN categories.name IS 'Category name (unique per household)';
COMMENT ON COLUMN categories.category_group IS 'Optional grouping for UI organization (Casa, Jose, Caro, etc.)';
COMMENT ON COLUMN categories.display_order IS 'Order for display in UI (lower numbers first)';
COMMENT ON COLUMN categories.is_active IS 'Whether category appears in movement dropdowns';
