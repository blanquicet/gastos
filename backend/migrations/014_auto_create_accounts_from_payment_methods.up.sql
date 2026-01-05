-- Auto-create savings accounts from existing debit_card payment methods
INSERT INTO accounts (household_id, name, type, institution, last4, initial_balance, notes)
SELECT 
  pm.household_id,
  CASE 
    WHEN pm.institution IS NOT NULL AND pm.institution != '' 
    THEN 'Cuenta de ahorros ' || pm.institution
    ELSE 'Cuenta de ahorros ' || pm.name
  END as name,
  'savings'::account_type,
  pm.institution,
  pm.last4,
  0 as initial_balance, -- Start at 0, users can update
  'Auto-creada desde método de pago: ' || pm.name as notes
FROM payment_methods pm
WHERE pm.type = 'debit_card'
  AND NOT EXISTS (
    SELECT 1 FROM accounts a 
    WHERE a.household_id = pm.household_id 
    AND a.name = CASE 
      WHEN pm.institution IS NOT NULL AND pm.institution != '' 
      THEN 'Cuenta de ahorros ' || pm.institution
      ELSE 'Cuenta de ahorros ' || pm.name
    END
  );

-- Link the debit payment methods to the newly created accounts
UPDATE payment_methods pm
SET account_id = a.id
FROM accounts a
WHERE pm.type = 'debit_card'
  AND pm.household_id = a.household_id
  AND a.type = 'savings'
  AND (
    (pm.institution IS NOT NULL AND pm.institution != '' AND a.name = 'Cuenta de ahorros ' || pm.institution)
    OR
    (pm.institution IS NULL OR pm.institution = '' AND a.name = 'Cuenta de ahorros ' || pm.name)
  )
  AND a.notes LIKE 'Auto-creada desde método de pago:%';

-- For each household with cash payment method, create cash account if not exists
INSERT INTO accounts (household_id, name, type, initial_balance, notes)
SELECT DISTINCT
  pm.household_id,
  'Efectivo en Casa' as name,
  'cash'::account_type,
  0 as initial_balance,
  'Cuenta de efectivo auto-creada' as notes
FROM payment_methods pm
WHERE pm.type = 'cash'
  AND NOT EXISTS (
    SELECT 1 FROM accounts a 
    WHERE a.household_id = pm.household_id 
    AND a.type = 'cash'
    AND a.name = 'Efectivo en Casa'
  );

-- Link cash payment methods to cash accounts
UPDATE payment_methods pm
SET account_id = a.id
FROM accounts a
WHERE pm.type = 'cash'
  AND pm.household_id = a.household_id
  AND a.type = 'cash'
  AND a.name = 'Efectivo en Casa';
