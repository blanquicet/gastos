-- Auto-create savings accounts from existing debit_card payment methods
-- Include owner name to make accounts unique
INSERT INTO accounts (household_id, name, type, institution, last4, initial_balance, notes)
SELECT 
  pm.household_id,
  CASE 
    WHEN pm.institution IS NOT NULL AND pm.institution != '' 
    THEN 'Cuenta de ahorros ' || u.name || ' ' || pm.institution
    ELSE 'Cuenta de ahorros ' || u.name
  END as name,
  'savings'::account_type,
  pm.institution,
  pm.last4,
  0 as initial_balance,
  'Auto-creada desde método de pago: ' || pm.name as notes
FROM payment_methods pm
JOIN users u ON pm.owner_id = u.id
WHERE pm.type = 'debit_card';

-- Link the debit payment methods to the newly created accounts
UPDATE payment_methods pm
SET account_id = a.id
FROM accounts a, users u
WHERE pm.owner_id = u.id
  AND pm.type = 'debit_card'
  AND pm.household_id = a.household_id
  AND a.type = 'savings'
  AND (
    (pm.institution IS NOT NULL AND pm.institution != '' AND a.name = 'Cuenta de ahorros ' || u.name || ' ' || pm.institution)
    OR
    ((pm.institution IS NULL OR pm.institution = '') AND a.name = 'Cuenta de ahorros ' || u.name)
  )
  AND a.notes LIKE 'Auto-creada desde método de pago:%';

-- For each household with cash payment method, create cash account per owner
INSERT INTO accounts (household_id, name, type, initial_balance, notes)
SELECT DISTINCT
  pm.household_id,
  'Efectivo ' || u.name as name,
  'cash'::account_type,
  0 as initial_balance,
  'Cuenta de efectivo auto-creada' as notes
FROM payment_methods pm
JOIN users u ON pm.owner_id = u.id
WHERE pm.type = 'cash';

-- Link cash payment methods to cash accounts
UPDATE payment_methods pm
SET account_id = a.id
FROM accounts a, users u
WHERE pm.owner_id = u.id
  AND pm.type = 'cash'
  AND pm.household_id = a.household_id
  AND a.type = 'cash'
  AND a.name = 'Efectivo ' || u.name;
