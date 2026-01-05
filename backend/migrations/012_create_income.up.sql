-- Create income_type enum
CREATE TYPE income_type AS ENUM (
    -- Real Income (increases net worth)
    'salary',              -- Sueldo mensual
    'bonus',               -- Bono, prima, aguinaldo
    'freelance',           -- Trabajo independiente
    'reimbursement',       -- Reembolso de gastos
    'gift',                -- Regalo en dinero
    'sale',                -- Venta de algo (carro, mueble)
    'other_income',        -- Otro ingreso real
    
    -- Internal Movements (doesn't increase net worth)
    'savings_withdrawal',  -- Retiro de ahorros previos (bolsillos, CDT)
    'previous_balance',    -- Sobrante del mes anterior
    'debt_collection',     -- Cobro de deuda
    'account_transfer',    -- Transferencia entre cuentas propias
    'adjustment'           -- Ajuste contable
);

-- Create income table
CREATE TABLE income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    
    -- Income details
    type income_type NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    description VARCHAR(255) NOT NULL,
    income_date DATE NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT income_positive_amount CHECK (amount > 0)
);

-- Indexes
CREATE INDEX idx_income_household ON income(household_id);
CREATE INDEX idx_income_member ON income(member_id);
CREATE INDEX idx_income_account ON income(account_id);
CREATE INDEX idx_income_type ON income(type);
CREATE INDEX idx_income_date ON income(income_date);
CREATE INDEX idx_income_household_date ON income(household_id, income_date);
CREATE INDEX idx_income_household_type ON income(household_id, type);
