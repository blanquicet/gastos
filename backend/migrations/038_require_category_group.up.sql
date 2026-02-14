-- Make category_group_id NOT NULL (all categories must belong to a group)

-- First, assign any ungrouped categories to a default group
-- For each household that has ungrouped categories, create or find a default group
DO $$
DECLARE
    h_id UUID;
    g_id UUID;
BEGIN
    FOR h_id IN
        SELECT DISTINCT household_id FROM categories WHERE category_group_id IS NULL
    LOOP
        -- Check if household already has a group called "Otros"
        SELECT id INTO g_id FROM category_groups WHERE household_id = h_id AND name = 'Otros';
        IF g_id IS NULL THEN
            INSERT INTO category_groups (id, household_id, name, icon, display_order, is_active)
            VALUES (gen_random_uuid(), h_id, 'Otros', '📦', 999, true)
            RETURNING id INTO g_id;
        END IF;
        -- Assign ungrouped categories to this group
        UPDATE categories SET category_group_id = g_id
        WHERE household_id = h_id AND category_group_id IS NULL;
    END LOOP;
END $$;

ALTER TABLE categories ALTER COLUMN category_group_id SET NOT NULL;
