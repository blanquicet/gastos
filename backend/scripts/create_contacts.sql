-- Crear contactos necesarios para la migración
-- Household: 0743465f-7f5a-4762-ae84-5cfaab0150e8 (Hogar Caro Test)

INSERT INTO contacts (household_id, name, notes) VALUES
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Papá Caro', 'Padre de Caro'),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Maria Isabel', 'Familia'),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Mamá Caro', 'Madre de Caro'),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Prebby', 'Amigo/a'),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Kelly Carolina', 'Amiga'),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Mamá Jose', 'Madre de Jose'),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Diana', 'Prima Diana'),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Tia Elodia', 'Tía Elodia'),
  ('0743465f-7f5a-4762-ae84-5cfaab0150e8', 'Primo Juanda', 'Primo Juanda');

-- Mostrar los contactos creados
SELECT 
  id,
  name
FROM contacts 
WHERE household_id = '0743465f-7f5a-4762-ae84-5cfaab0150e8'
ORDER BY name;
