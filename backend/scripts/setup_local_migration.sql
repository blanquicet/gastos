-- Setup para migración local
-- Household: 0743465f-7f5a-4762-ae84-5cfaab0150e8 (Hogar Caro Test)
-- Jose: 264ed555-cd04-4d74-a47d-f21d40469eaf (blanquicet@gmail.com)
-- Caro: 25b9a767-dc17-4461-9ed2-3ed77186ba0c (krosala19@gmail.com)

-- Crear payment methods
INSERT INTO payment_methods (household_id, owner_id, name, type, is_shared_with_household) VALUES
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', '264ed555-cd04-4d74-a47d-f21d40469eaf', 'Débito Jose', 'debit_card', true),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', '25b9a767-dc17-4461-9ed2-3ed77186ba0c', 'Débito Caro', 'debit_card', true),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', '264ed555-cd04-4d74-a47d-f21d40469eaf', 'AMEX Jose', 'credit_card', true),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', '264ed555-cd04-4d74-a47d-f21d40469eaf', 'MasterCard Oro Jose', 'credit_card', true),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', '25b9a767-dc17-4461-9ed2-3ed77186ba0c', 'Nu Caro', 'credit_card', true)
ON CONFLICT (household_id, name) DO NOTHING;

-- Mostrar los IDs creados
SELECT 
  id,
  name,
  type
FROM payment_methods 
WHERE household_id = '0743465f-7f5a-4762-ae84-5cfaab0150e8'
ORDER BY name;
