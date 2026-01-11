-- Script to add missing categories based on original GetDefaultCategoryGroups mapping
-- These categories exist in the original mapping but weren't created because
-- they had no movements in the legacy data
--
-- Usage:
--   psql $DATABASE_URL -f scripts/add-missing-categories.sql

BEGIN;

-- Get household ID for blanquicet@gmail.com
DO $$
DECLARE
    v_household_id UUID;
    v_casa_group_id UUID;
    v_jose_group_id UUID;
    v_caro_group_id UUID;
    v_carro_group_id UUID;
    v_ahorros_group_id UUID;
    v_inversiones_group_id UUID;
BEGIN
    -- Get household ID
    SELECT hm.household_id INTO v_household_id
    FROM household_members hm
    JOIN users u ON u.id = hm.user_id
    WHERE u.email = 'blanquicet@gmail.com'
    LIMIT 1;

    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Household not found for blanquicet@gmail.com';
    END IF;

    -- Get group IDs
    SELECT id INTO v_casa_group_id FROM category_groups WHERE household_id = v_household_id AND name = 'Casa';
    SELECT id INTO v_jose_group_id FROM category_groups WHERE household_id = v_household_id AND name = 'Jose';
    SELECT id INTO v_caro_group_id FROM category_groups WHERE household_id = v_household_id AND name = 'Caro';
    SELECT id INTO v_carro_group_id FROM category_groups WHERE household_id = v_household_id AND name = 'Carro';
    SELECT id INTO v_ahorros_group_id FROM category_groups WHERE household_id = v_household_id AND name = 'Ahorros';
    SELECT id INTO v_inversiones_group_id FROM category_groups WHERE household_id = v_household_id AND name = 'Inversiones';

    -- Add missing Casa categories
    INSERT INTO categories (household_id, name, category_group_id, display_order)
    VALUES 
        (v_household_id, 'Casa - Imprevistos', v_casa_group_id, 4)
    ON CONFLICT (household_id, name) DO NOTHING;

    -- Add missing Jose categories
    INSERT INTO categories (household_id, name, category_group_id, display_order)
    VALUES 
        (v_household_id, 'Jose - Imprevistos', v_jose_group_id, 3)
    ON CONFLICT (household_id, name) DO NOTHING;

    -- Add missing Caro categories
    INSERT INTO categories (household_id, name, category_group_id, display_order)
    VALUES 
        (v_household_id, 'Caro - Imprevistos', v_caro_group_id, 4)
    ON CONFLICT (household_id, name) DO NOTHING;

    -- Add missing Carro categories
    INSERT INTO categories (household_id, name, category_group_id, display_order)
    VALUES 
        (v_household_id, 'Carro - Imprevistos', v_carro_group_id, 4)
    ON CONFLICT (household_id, name) DO NOTHING;

    -- Add missing Ahorros categories
    INSERT INTO categories (household_id, name, category_group_id, display_order)
    VALUES 
        (v_household_id, 'Ahorros para cosas de la casa', v_ahorros_group_id, 2),
        (v_household_id, 'Ahorros para vacaciones', v_ahorros_group_id, 3),
        (v_household_id, 'Ahorros para regalos', v_ahorros_group_id, 4)
    ON CONFLICT (household_id, name) DO NOTHING;
    
    RAISE NOTICE 'Added % Ahorros categories', (SELECT COUNT(*) FROM categories WHERE household_id = v_household_id AND category_group_id = v_ahorros_group_id AND name LIKE 'Ahorros para%');

    -- Add missing Inversiones category
    INSERT INTO categories (household_id, name, category_group_id, display_order)
    VALUES 
        (v_household_id, 'Inversiones Caro', v_inversiones_group_id, 1)
    ON CONFLICT (household_id, name) DO NOTHING;

    RAISE NOTICE 'Missing categories added successfully for household %', v_household_id;
END $$;

-- Show final category count
SELECT 
    cg.name as group_name,
    COUNT(c.id) as category_count,
    string_agg(c.name, ', ' ORDER BY c.display_order, c.name) as categories
FROM category_groups cg
LEFT JOIN categories c ON c.category_group_id = cg.id AND c.is_active = true
WHERE cg.household_id = (
    SELECT hm.household_id 
    FROM household_members hm 
    JOIN users u ON u.id = hm.user_id 
    WHERE u.email = 'blanquicet@gmail.com' 
    LIMIT 1
)
GROUP BY cg.id, cg.name, cg.display_order
ORDER BY cg.display_order;

COMMIT;
