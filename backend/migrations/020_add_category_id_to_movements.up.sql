-- Add category_id foreign key to movements table
ALTER TABLE movements 
ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE RESTRICT;

-- Create index for performance
CREATE INDEX idx_movements_category ON movements(category_id) WHERE category_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN movements.category_id IS 'Reference to category (replaces string-based category field)';
