-- Add missing Inversiones Jose and Inversiones Juntos categories to production

BEGIN;

DO $$
DECLARE
    v_household_id UUID;
    v_inversiones_id UUID;
BEGIN
    -- Get household ID
    SELECT id INTO v_household_id FROM households LIMIT 1;
    
    -- Get Inversiones group ID
    SELECT id INTO v_inversiones_id 
    FROM category_groups 
    WHERE household_id = v_household_id AND name = 'Inversiones';

    -- Add missing categories
    INSERT INTO categories (household_id, name, category_group_id, display_order)
    VALUES 
        (v_household_id, 'Inversiones Jose', v_inversiones_id, 2),
        (v_household_id, 'Inversiones Juntos', v_inversiones_id, 3)
    ON CONFLICT (household_id, name) DO NOTHING;

    RAISE NOTICE 'Added missing Inversiones categories';
END $$;

-- Verify
SELECT name FROM categories 
WHERE household_id = (SELECT id FROM households LIMIT 1) 
  AND name LIKE 'Inversiones%' 
ORDER BY name;

COMMIT;
