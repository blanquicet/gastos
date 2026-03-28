-- Move category_id from pocket_transactions to pockets table.
-- Each pocket always uses the same category, so storing it per-transaction is redundant.
-- The service resolves categories lazily on the first deposit (resolvePocketCategory).

-- 1. Add category_id to pockets
ALTER TABLE pockets ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- 2. Backfill: only copy category_id from transactions whose category belongs to the
--    "Ahorros" group AND whose name matches the pocket name (auto-created categories).
--    Manually-named categories (e.g. "Para vacaciones") are stale and should be
--    re-resolved on the next deposit.
UPDATE pockets p
SET category_id = sub.category_id
FROM (
    SELECT DISTINCT ON (pt.pocket_id) pt.pocket_id, pt.category_id
    FROM pocket_transactions pt
    JOIN categories c ON pt.category_id = c.id
    JOIN category_groups cg ON c.category_group_id = cg.id
    JOIN pockets pk ON pt.pocket_id = pk.id
    WHERE pt.type = 'DEPOSIT'
      AND pt.category_id IS NOT NULL
      AND cg.name = 'Ahorros'
      AND c.name = pk.name
    ORDER BY pt.pocket_id, pt.created_at ASC
) sub
WHERE p.id = sub.pocket_id;

-- 3. Drop the constraint that required category_id on deposits
ALTER TABLE pocket_transactions DROP CONSTRAINT IF EXISTS pocket_tx_deposit_requires_category;

-- 4. Drop category_id from pocket_transactions
ALTER TABLE pocket_transactions DROP COLUMN IF EXISTS category_id;
