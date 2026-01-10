-- Migrate existing movement categories to category_id references
-- This migration creates default categories for existing households and links movements

DO $$
DECLARE
    household_record RECORD;
    category_record RECORD;
    movement_record RECORD;
BEGIN
    -- For each existing household
    FOR household_record IN 
        SELECT DISTINCT id FROM households
    LOOP
        -- Get distinct categories from movements for this household
        FOR category_record IN
            SELECT DISTINCT category 
            FROM movements 
            WHERE household_id = household_record.id 
              AND category IS NOT NULL
            ORDER BY category
        LOOP
            -- Insert category if it doesn't exist (use ON CONFLICT to handle duplicates)
            INSERT INTO categories (household_id, name, is_active, display_order)
            VALUES (
                household_record.id, 
                category_record.category,
                TRUE,
                0
            )
            ON CONFLICT (household_id, name) DO NOTHING;
        END LOOP;
    END LOOP;

    -- Now update movements to reference category_id
    FOR movement_record IN
        SELECT m.id, m.household_id, m.category
        FROM movements m
        WHERE m.category IS NOT NULL
          AND m.category_id IS NULL
    LOOP
        -- Find matching category and update movement
        UPDATE movements m
        SET category_id = c.id
        FROM categories c
        WHERE c.household_id = movement_record.household_id
          AND c.name = movement_record.category
          AND m.id = movement_record.id;
    END LOOP;

    RAISE NOTICE 'Migration completed: movements linked to categories';
END $$;
