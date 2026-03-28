-- Reverse: move category_id back to pocket_transactions

-- 1. Add category_id back to pocket_transactions
ALTER TABLE pocket_transactions ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- 2. Backfill: copy the pocket's category_id to all its deposit transactions
UPDATE pocket_transactions pt
SET category_id = p.category_id
FROM pockets p
WHERE pt.pocket_id = p.id AND pt.type = 'DEPOSIT' AND p.category_id IS NOT NULL;

-- 3. Re-add the constraint
ALTER TABLE pocket_transactions ADD CONSTRAINT pocket_tx_deposit_requires_category CHECK (
    type != 'DEPOSIT' OR category_id IS NOT NULL
);

-- 4. Drop category_id from pockets
ALTER TABLE pockets DROP COLUMN category_id;
