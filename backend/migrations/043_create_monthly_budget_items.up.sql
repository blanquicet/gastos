-- monthly_budget_items: per-month snapshot of each budget line item
-- Each row = one budgeted expense for a specific month
-- Replaces the global template → per-month budget auto-calculation approach

CREATE TABLE monthly_budget_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of month (YYYY-MM-01)

    -- Budget item definition (full snapshot, no inheritance)
    name VARCHAR(200) NOT NULL,
    description TEXT,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'COP',

    -- Movement pre-fill fields (for form dropdown)
    movement_type movement_type, -- HOUSEHOLD, SPLIT, DEBT_PAYMENT (nullable = budget display only)
    auto_generate BOOLEAN NOT NULL DEFAULT false,

    -- Payer (for SPLIT and DEBT_PAYMENT)
    payer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    payer_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

    -- Counterparty (for DEBT_PAYMENT)
    counterparty_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    counterparty_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

    -- Payment method
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,

    -- Receiver account (for DEBT_PAYMENT when counterparty is household member)
    receiver_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

    -- Link to master template (for auto-generation scheduler)
    source_template_id UUID REFERENCES recurring_movement_templates(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One item per name per category per month
    UNIQUE(household_id, category_id, month, name)
);

-- Participants for SPLIT items (per-month, linked to budget item)
CREATE TABLE monthly_budget_item_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_item_id UUID NOT NULL REFERENCES monthly_budget_items(id) ON DELETE CASCADE,
    participant_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    participant_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    percentage NUMERIC(5, 4) NOT NULL CHECK (percentage > 0 AND percentage <= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Exactly one participant type
    CHECK (
        (participant_user_id IS NOT NULL AND participant_contact_id IS NULL) OR
        (participant_user_id IS NULL AND participant_contact_id IS NOT NULL)
    ),
    UNIQUE(budget_item_id, participant_user_id),
    UNIQUE(budget_item_id, participant_contact_id)
);

-- Indexes for common queries
CREATE INDEX idx_mbi_household_month ON monthly_budget_items(household_id, month);
CREATE INDEX idx_mbi_category_month ON monthly_budget_items(category_id, month);
CREATE INDEX idx_mbi_household_category_month ON monthly_budget_items(household_id, category_id, month);
CREATE INDEX idx_mbi_source_template ON monthly_budget_items(source_template_id) WHERE source_template_id IS NOT NULL;
CREATE INDEX idx_mbi_participants_item ON monthly_budget_item_participants(budget_item_id);

-- Migrate existing data: create monthly_budget_items from recurring_movement_templates
-- For each template, create items for all months that have budgets in that category
INSERT INTO monthly_budget_items (
    household_id, category_id, month,
    name, description, amount, currency,
    movement_type, auto_generate,
    payer_user_id, payer_contact_id,
    counterparty_user_id, counterparty_contact_id,
    payment_method_id, receiver_account_id,
    source_template_id
)
SELECT DISTINCT
    t.household_id, t.category_id, mb.month,
    t.name, t.description, t.amount, t.currency,
    t.type, t.auto_generate,
    t.payer_user_id, t.payer_contact_id,
    t.counterparty_user_id, t.counterparty_contact_id,
    t.payment_method_id, t.receiver_account_id,
    t.id
FROM recurring_movement_templates t
JOIN monthly_budgets mb ON mb.household_id = t.household_id AND mb.category_id = t.category_id
WHERE t.is_active = true;

-- Migrate participants for the newly created items
INSERT INTO monthly_budget_item_participants (
    budget_item_id, participant_user_id, participant_contact_id, percentage
)
SELECT
    mbi.id, rmp.participant_user_id, rmp.participant_contact_id, rmp.percentage
FROM monthly_budget_items mbi
JOIN recurring_movement_participants rmp ON rmp.template_id = mbi.source_template_id;
