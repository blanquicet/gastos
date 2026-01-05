-- Unlink payment methods
UPDATE payment_methods
SET account_id = NULL
WHERE account_id IS NOT NULL;

-- Delete auto-created accounts
DELETE FROM accounts
WHERE notes LIKE 'Auto-creada desde método de pago:%'
   OR notes = 'Cuenta de efectivo auto-creada';
