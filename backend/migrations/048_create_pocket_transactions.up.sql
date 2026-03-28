CREATE TYPE pocket_transaction_type AS ENUM ('DEPOSIT', 'WITHDRAWAL');

CREATE TABLE pocket_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pocket_id UUID NOT NULL REFERENCES pockets(id) ON DELETE RESTRICT,
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    type pocket_transaction_type NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    description VARCHAR(255),
    transaction_date DATE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    source_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    destination_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    linked_movement_id UUID REFERENCES movements(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pocket_tx_deposit_accounts CHECK (
        (type = 'DEPOSIT' AND source_account_id IS NOT NULL AND destination_account_id IS NULL) OR
        (type = 'WITHDRAWAL' AND source_account_id IS NULL AND destination_account_id IS NOT NULL)
    ),
    CONSTRAINT pocket_tx_deposit_requires_category CHECK (
        type != 'DEPOSIT' OR category_id IS NOT NULL
    )
);

CREATE INDEX idx_pocket_tx_pocket ON pocket_transactions(pocket_id);
CREATE INDEX idx_pocket_tx_household ON pocket_transactions(household_id);
CREATE INDEX idx_pocket_tx_pocket_date ON pocket_transactions(pocket_id, transaction_date DESC);
CREATE INDEX idx_pocket_tx_source_account ON pocket_transactions(source_account_id) WHERE source_account_id IS NOT NULL;
CREATE INDEX idx_pocket_tx_dest_account ON pocket_transactions(destination_account_id) WHERE destination_account_id IS NOT NULL;
CREATE INDEX idx_pocket_tx_linked_movement ON pocket_transactions(linked_movement_id) WHERE linked_movement_id IS NOT NULL;
