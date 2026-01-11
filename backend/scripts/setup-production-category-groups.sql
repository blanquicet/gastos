-- Script to setup category groups in production and assign categories to them
-- This is needed because the migration creates groups based on an old category_group
-- field that didn't exist in production

BEGIN;

-- Get household ID
DO $$
DECLARE
    v_household_id UUID;
    v_casa_id UUID;
    v_jose_id UUID;
    v_caro_id UUID;
    v_carro_id UUID;
    v_ahorros_id UUID;
    v_inversiones_id UUID;
    v_diversion_id UUID;
    v_otros_id UUID;
BEGIN
    -- Get household ID (assuming single household in production)
    SELECT id INTO v_household_id FROM households LIMIT 1;

    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'No household found';
    END IF;

    RAISE NOTICE 'Using household ID: %', v_household_id;

    -- Create or get category groups
    INSERT INTO category_groups (household_id, name, icon, display_order)
    VALUES 
        (v_household_id, 'Casa', '🏠', 1),
        (v_household_id, 'Jose', '🤴🏾', 2),
        (v_household_id, 'Caro', '👸', 3),
        (v_household_id, 'Carro', '🏎️', 4),
        (v_household_id, 'Ahorros', '🏦', 5),
        (v_household_id, 'Inversiones', '📈', 6),
        (v_household_id, 'Diversión', '🎉', 7)
    ON CONFLICT (household_id, name) DO UPDATE SET
        icon = EXCLUDED.icon,
        display_order = EXCLUDED.display_order;

    -- Get group IDs
    SELECT id INTO v_casa_id FROM category_groups WHERE household_id = v_household_id AND name = 'Casa';
    SELECT id INTO v_jose_id FROM category_groups WHERE household_id = v_household_id AND name = 'Jose';
    SELECT id INTO v_caro_id FROM category_groups WHERE household_id = v_household_id AND name = 'Caro';
    SELECT id INTO v_carro_id FROM category_groups WHERE household_id = v_household_id AND name = 'Carro';
    SELECT id INTO v_ahorros_id FROM category_groups WHERE household_id = v_household_id AND name = 'Ahorros';
    SELECT id INTO v_inversiones_id FROM category_groups WHERE household_id = v_household_id AND name = 'Inversiones';
    SELECT id INTO v_diversion_id FROM category_groups WHERE household_id = v_household_id AND name = 'Diversión';
    SELECT id INTO v_otros_id FROM category_groups WHERE household_id = v_household_id AND name = 'Otros';

    -- Assign categories to groups based on name patterns
    -- Casa group
    UPDATE categories SET category_group_id = v_casa_id, display_order = 1
    WHERE household_id = v_household_id AND name = 'Casa - Gastos fijos';
    
    UPDATE categories SET category_group_id = v_casa_id, display_order = 2
    WHERE household_id = v_household_id AND name = 'Casa - Cositas para casa';
    
    UPDATE categories SET category_group_id = v_casa_id, display_order = 3
    WHERE household_id = v_household_id AND name = 'Casa - Provisionar mes entrante';
    
    UPDATE categories SET category_group_id = v_casa_id, display_order = 4
    WHERE household_id = v_household_id AND name = 'Casa - Imprevistos';
    
    UPDATE categories SET category_group_id = v_casa_id, display_order = 5
    WHERE household_id = v_household_id AND name = 'Kellys';
    
    UPDATE categories SET category_group_id = v_casa_id, display_order = 6
    WHERE household_id = v_household_id AND name = 'Mercado';
    
    UPDATE categories SET category_group_id = v_casa_id, display_order = 7
    WHERE household_id = v_household_id AND name = 'Regalos';

    -- Jose group
    UPDATE categories SET category_group_id = v_jose_id, display_order = 1
    WHERE household_id = v_household_id AND name = 'Jose - Gastos fijos';
    
    UPDATE categories SET category_group_id = v_jose_id, display_order = 2
    WHERE household_id = v_household_id AND name = 'Jose - Vida cotidiana';
    
    UPDATE categories SET category_group_id = v_jose_id, display_order = 3
    WHERE household_id = v_household_id AND name = 'Jose - Imprevistos';

    -- Caro group
    UPDATE categories SET category_group_id = v_caro_id, display_order = 1
    WHERE household_id = v_household_id AND name = 'Caro - Gastos fijos';
    
    UPDATE categories SET category_group_id = v_caro_id, display_order = 2
    WHERE household_id = v_household_id AND name = 'Caro - Vida cotidiana';
    
    UPDATE categories SET category_group_id = v_caro_id, display_order = 3
    WHERE household_id = v_household_id AND name = 'Caro - Imprevistos';

    -- Carro group
    UPDATE categories SET category_group_id = v_carro_id, display_order = 1
    WHERE household_id = v_household_id AND name = 'Pago de SOAT/impuestos/mantenimiento';
    
    UPDATE categories SET category_group_id = v_carro_id, display_order = 2
    WHERE household_id = v_household_id AND name = 'Carro - Seguro';
    
    UPDATE categories SET category_group_id = v_carro_id, display_order = 3
    WHERE household_id = v_household_id AND name = 'Uber/Gasolina/Peajes/Parqueaderos';
    
    UPDATE categories SET category_group_id = v_carro_id, display_order = 4
    WHERE household_id = v_household_id AND name = 'Carro - Imprevistos';

    -- Ahorros group
    UPDATE categories SET category_group_id = v_ahorros_id, display_order = 1
    WHERE household_id = v_household_id AND name = 'Ahorros para SOAT/impuestos/mantenimiento';
    
    UPDATE categories SET category_group_id = v_ahorros_id, display_order = 2
    WHERE household_id = v_household_id AND name = 'Ahorros para cosas de la casa';
    
    UPDATE categories SET category_group_id = v_ahorros_id, display_order = 3
    WHERE household_id = v_household_id AND name = 'Ahorros para vacaciones';
    
    UPDATE categories SET category_group_id = v_ahorros_id, display_order = 4
    WHERE household_id = v_household_id AND name = 'Ahorros para regalos';

    -- Inversiones group
    UPDATE categories SET category_group_id = v_inversiones_id, display_order = 1
    WHERE household_id = v_household_id AND name = 'Inversiones Caro';
    
    UPDATE categories SET category_group_id = v_inversiones_id, display_order = 2
    WHERE household_id = v_household_id AND name = 'Inversiones Jose';
    
    UPDATE categories SET category_group_id = v_inversiones_id, display_order = 3
    WHERE household_id = v_household_id AND name = 'Inversiones Juntos';

    -- Diversión group
    UPDATE categories SET category_group_id = v_diversion_id, display_order = 1
    WHERE household_id = v_household_id AND name = 'Salidas juntos';
    
    UPDATE categories SET category_group_id = v_diversion_id, display_order = 2
    WHERE household_id = v_household_id AND name = 'Vacaciones';

    -- Otros group (Gastos médicos, Préstamo, etc.)
    UPDATE categories SET category_group_id = v_otros_id, display_order = 1
    WHERE household_id = v_household_id AND name = 'Gastos médicos';
    
    UPDATE categories SET category_group_id = v_otros_id, display_order = 2
    WHERE household_id = v_household_id AND name = 'Préstamo';

    RAISE NOTICE 'Categories reassigned successfully';
END $$;

-- Show final result
SELECT 
    cg.icon || ' ' || cg.name as grupo,
    COUNT(c.id) as count,
    string_agg(c.name, ', ' ORDER BY c.display_order, c.name) as categorias
FROM category_groups cg
LEFT JOIN categories c ON c.category_group_id = cg.id AND c.is_active = true
WHERE cg.household_id = (SELECT id FROM households LIMIT 1)
GROUP BY cg.id, cg.name, cg.icon, cg.display_order
ORDER BY cg.display_order;

COMMIT;
