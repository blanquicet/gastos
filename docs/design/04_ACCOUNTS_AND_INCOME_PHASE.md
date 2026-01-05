# Phase 4: Accounts & Income Tracking

> **Status:** 📋 PLANNED
>
> This phase introduces the concept of **Accounts** (where money lives) and **Income Tracking** 
> to enable future cash flow analysis and financial planning.

**Architecture:**

- Authentication: PostgreSQL + Go backend
- Households & Payment Methods: PostgreSQL + Go backend  
- Movement storage: n8n → Google Sheets (current, will migrate to PostgreSQL later)
- **NEW:** Accounts storage: PostgreSQL + Go backend
- **NEW:** Income storage: PostgreSQL + Go backend

**Relationship to other phases:**

- See `01_AUTH_PHASE.md` for authentication implementation
- See `02_HOUSEHOLD_PHASE.md` for household/members/contacts management
- See `03_PAYMENT_METHODS_PHASE.md` for payment methods
- See `00_N8N_PHASE.md` for current movement registration
- See `FUTURE_VISION.md` for long-term product direction

---

## 🎯 Goals

### Primary Goals

1. **Introduce Accounts concept**
   - Separate "where money lives" (accounts) from "how you spend it" (payment methods)
   - Enable tracking of account balances
   - Foundation for cash flow analysis (Phase 5)

2. **Link Payment Methods to Accounts (Optional)**
   - Debit cards can be linked to savings accounts
   - Cash payment method linked to cash account
   - Enables better expense → account tracking

3. **Income Tracking**
   - Register income entries (salary, bonuses, freelance, gifts)
   - Income goes to accounts (not payment methods)
   - Track monthly income totals per member and per household
   - Enable future cash flow projections

### Why This Change?

**Current problem:**
- Payment methods represent both "where money is" and "how you spend it"
- Can't track account balances
- Can't model: 1 bank account with 2 debit cards
- Income has nowhere to go conceptually

**Solution:**
- **Accounts:** Bank accounts, cash reserves (where money lives)
- **Payment Methods:** Debit cards, credit cards, cash (how you spend)
- **Income:** Flows into accounts
- **Expenses:** Paid with payment methods (which may be linked to accounts)

---

## 🏗️ Core Concepts

### Account vs Payment Method

| Concept | Definition | Examples | Receives Income? | Used for Expenses? |
|---------|-----------|----------|------------------|-------------------|
| **Account** | Where money LIVES | Cuenta de ahorros, Efectivo en casa, Cuenta corriente | ✅ Yes | ❌ No (indirectly via payment methods) |
| **Payment Method** | How you ACCESS/SPEND money | Tarjeta débito, Tarjeta crédito, Efectivo | ❌ No | ✅ Yes |

**Real-world example:**
```
Jose has:
- Cuenta de ahorros Bancolombia (account) with $5,000,000 balance
- Tarjeta Débito Bancolombia (payment method) linked to that account
- Jose's salary → Cuenta de ahorros ✅
- Jose pays groceries → Tarjeta Débito ✅
- The debit card accesses the money in the account
```

### Account Types

| Type | Spanish | Purpose | Can Receive Income? |
|------|---------|---------|-------------------|
| `savings` | Cuenta de Ahorros | Main bank account for salary/savings | ✅ Yes |
| `cash` | Efectivo | Physical cash in wallet/home | ✅ Yes |
| `checking` | Cuenta Corriente | Checking account (for those who have it) | ❌ No (not initially) |

**Note:** Only `savings` and `cash` can receive income initially. This keeps it simple and covers 95% of use cases.

---

## 📊 Database Schema

### New Tables

#### `accounts` table

```sql
CREATE TYPE account_type AS ENUM ('savings', 'cash', 'checking');

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    -- Account identification
    name VARCHAR(100) NOT NULL,
    type account_type NOT NULL,
    institution VARCHAR(100), -- Bank name (optional for cash)
    last4 VARCHAR(4), -- Last 4 digits of account number (for identification)
    
    -- Balance tracking
    initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- Current balance is calculated: initial_balance + SUM(income) - SUM(expenses linked via payment methods)
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT accounts_unique_name_per_household UNIQUE(household_id, name)
);

-- Indexes
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_accounts_type ON accounts(type);
```

#### `income` table

```sql
CREATE TABLE income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    
    -- Income details
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
CREATE INDEX idx_income_date ON income(income_date);
CREATE INDEX idx_income_household_date ON income(household_id, income_date);

-- Ensure member belongs to household
ALTER TABLE income 
ADD CONSTRAINT income_member_in_household 
CHECK (
    EXISTS (
        SELECT 1 FROM household_members 
        WHERE household_id = income.household_id 
        AND user_id = income.member_id
    )
);

-- Ensure account type can receive income (only savings and cash)
ALTER TABLE income
ADD CONSTRAINT income_account_type_valid
CHECK (
    EXISTS (
        SELECT 1 FROM accounts
        WHERE id = income.account_id
        AND type IN ('savings', 'cash')
    )
);
```

### Modified Tables

#### `payment_methods` - Add optional account linking

```sql
ALTER TABLE payment_methods
ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_payment_methods_account ON payment_methods(account_id);
```

**Note:** This is optional. Users can link debit cards to accounts for better tracking, but it's not required.

---

## 🔌 API Endpoints

### Account Endpoints

#### Create Account

```
POST /api/accounts
Authorization: Bearer <session-cookie>

Request:
{
  "name": "Cuenta de ahorros Bancolombia",
  "type": "savings",
  "institution": "Bancolombia",
  "last4": "1234",
  "initial_balance": 5000000,
  "notes": "Cuenta principal para salario"
}

Validation:
- User must belong to a household
- Name unique within household
- Type must be valid enum
- Initial balance defaults to 0 if not provided
- last4 optional but recommended for savings accounts
- institution optional for cash

Response: 201 Created
{
  "id": "uuid",
  "household_id": "uuid",
  "name": "Cuenta de ahorros Bancolombia",
  "type": "savings",
  "institution": "Bancolombia",
  "last4": "1234",
  "initial_balance": 5000000,
  "current_balance": 5000000,
  "notes": "Cuenta principal para salario",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}

Errors:
400 - Invalid type, missing required fields
409 - Account with that name already exists in household
404 - User has no household
```

#### List Accounts

```
GET /api/accounts
Authorization: Bearer <session-cookie>

Response: 200 OK
[
  {
    "id": "uuid",
    "household_id": "uuid",
    "name": "Cuenta de ahorros Bancolombia",
    "type": "savings",
    "institution": "Bancolombia",
    "last4": "1234",
    "initial_balance": 5000000,
    "current_balance": 5800000, // calculated
    "notes": "Cuenta principal",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  },
  {
    "id": "uuid",
    "household_id": "uuid",
    "name": "Efectivo en Casa",
    "type": "cash",
    "institution": null,
    "last4": null,
    "initial_balance": 200000,
    "current_balance": 150000, // calculated
    "notes": "Billetera y efectivo guardado",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }
]

Business Logic:
- Returns all accounts for user's household
- current_balance = initial_balance + SUM(income) - SUM(expenses via linked payment methods)
- Ordered by type (savings first, then cash, then checking), then by name

Errors:
404 - User has no household
```

#### Get Account by ID

```
GET /api/accounts/:id
Authorization: Bearer <session-cookie>

Response: 200 OK
{
  "id": "uuid",
  "household_id": "uuid",
  "name": "Cuenta de ahorros Bancolombia",
  "type": "savings",
  "institution": "Bancolombia",
  "last4": "1234",
  "initial_balance": 5000000,
  "current_balance": 5800000,
  "notes": "Cuenta principal",
  "income_total": 6000000, // total income to this account
  "expense_total": 5200000, // total expenses from linked payment methods
  "created_at": "timestamp",
  "updated_at": "timestamp"
}

Errors:
404 - Account not found or doesn't belong to user's household
```

#### Update Account

```
PATCH /api/accounts/:id
Authorization: Bearer <session-cookie>

Request (all fields optional):
{
  "name": "Cuenta Bancolombia Principal",
  "institution": "Bancolombia",
  "last4": "5678",
  "initial_balance": 5500000,
  "notes": "Updated notes"
}

Response: 200 OK
{
  "id": "uuid",
  "household_id": "uuid",
  "name": "Cuenta Bancolombia Principal",
  ...
}

Business Rules:
- Can update: name, institution, last4, initial_balance, notes
- Cannot update: type (would require data migration)
- Cannot update: household_id (accounts belong to household)
- Name uniqueness validated within household

Errors:
404 - Account not found
403 - Account doesn't belong to user's household
409 - Name already exists in household
```

#### Delete Account

```
DELETE /api/accounts/:id
Authorization: Bearer <session-cookie>

Response: 204 No Content

Business Rules:
- Can only delete if account has NO income entries
- Can only delete if account has NO linked payment methods
- If has income or linked payment methods → error 409

Errors:
404 - Account not found
403 - Account doesn't belong to user's household
409 - Account has income entries or linked payment methods
```

---

### Income Endpoints

#### Create Income

```
POST /api/income
Authorization: Bearer <session-cookie>

Request:
{
  "member_id": "uuid",
  "account_id": "uuid",
  "type": "salary",
  "amount": 5000000,
  "description": "Salario Enero 2025",
  "income_date": "2025-01-15"
}

Income Types (income_type enum):

Real Income (increases net worth):
- salary              - Sueldo mensual
- bonus               - Bono, prima, aguinaldo
- freelance           - Trabajo independiente
- reimbursement       - Reembolso de gastos
- gift                - Regalo en dinero
- sale                - Venta de algo (carro, mueble)
- other_income        - Otro ingreso real

Internal Movements (doesn't increase net worth):
- savings_withdrawal  - Retiro de ahorros previos (bolsillos, CDT)
- previous_balance    - Sobrante del mes anterior
- debt_collection     - Cobro de deuda
- account_transfer    - Transferencia entre cuentas propias
- adjustment          - Ajuste contable

Validation:
- User must be household member
- Member must belong to user's household
- Account must exist and belong to household
- Account type must be 'savings' or 'cash'
- Type must be valid income_type enum
- Amount must be positive
- Income date required (can be future for planning)

Response: 201 Created
{
  "id": "uuid",
  "household_id": "uuid",
  "member_id": "uuid",
  "member_name": "Jose Blanquicet",
  "account_id": "uuid",
  "account_name": "Cuenta de ahorros Bancolombia",
  "type": "salary",
  "amount": 5000000,
  "description": "Salario Enero 2025",
  "income_date": "2025-01-15",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}
  "id": "uuid",
  "household_id": "uuid",
  "member_id": "uuid",
  "member_name": "Jose Blanquicet",
  "account_id": "uuid",
  "account_name": "Cuenta de ahorros Bancolombia",
  "amount": 5000000,
  "description": "Salario Enero 2025",
  "income_date": "2025-01-15",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}

Errors:
400 - Invalid account type (must be savings or cash), missing fields
403 - Member doesn't belong to household
404 - Account not found
```

#### List Income

```
GET /api/income
GET /api/income?member_id=uuid
GET /api/income?account_id=uuid
GET /api/income?month=2025-01
GET /api/income?start_date=2025-01-01&end_date=2025-01-31

Authorization: Bearer <session-cookie>

Query params:
- member_id (optional) - Filter by specific member
- account_id (optional) - Filter by specific account
- month (optional) - Filter by month (YYYY-MM format)
- start_date (optional) - Filter by date range start
- end_date (optional) - Filter by date range end

Response: 200 OK
{
  "income_entries": [
    {
      "id": "uuid",
      "household_id": "uuid",
      "member_id": "uuid",
      "member_name": "Jose Blanquicet",
      "account_id": "uuid",
      "account_name": "Cuenta de ahorros Bancolombia",
      "amount": 5000000,
      "description": "Salario Enero 2025",
      "income_date": "2025-01-15",
      "created_at": "timestamp"
    },
    {
      "id": "uuid",
      "household_id": "uuid",
      "member_id": "uuid",
      "member_name": "Jose Blanquicet",
      "account_id": "uuid",
      "account_name": "Cuenta de ahorros Bancolombia",
      "amount": 800000,
      "description": "Freelance",
      "income_date": "2025-01-22",
      "created_at": "timestamp"
    }
  ],
  "totals": {
    "total_amount": 10300000,
    "real_income_amount": 10300000,
    "internal_movements_amount": 0,
    "by_member": {
      "Jose Blanquicet": {
        "total": 5800000,
        "real_income": 5800000,
        "internal_movements": 0
      },
      "Caro Salazar": {
        "total": 4500000,
        "real_income": 4500000,
        "internal_movements": 0
      }
    },
    "by_account": {
      "Cuenta de ahorros Bancolombia": 5800000,
      "Cuenta de ahorros Davivienda": 4500000
    },
    "by_type": {
      "salary": 9500000,
      "freelance": 800000
    }
  }
}

Business Logic:
- Returns all income for user's household
- Ordered by income_date DESC (most recent first)
- Includes totals by member and by account
- Filters are cumulative (can combine member_id + month)

Errors:
404 - User has no household
```

#### Get Income by ID

```
GET /api/income/:id
Authorization: Bearer <session-cookie>

Response: 200 OK
{
  "id": "uuid",
  "household_id": "uuid",
  "member_id": "uuid",
  "member_name": "Jose Blanquicet",
  "account_id": "uuid",
  "account_name": "Cuenta de ahorros Bancolombia",
  "amount": 5000000,
  "description": "Salario Enero 2025",
  "income_date": "2025-01-15",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}

Errors:
404 - Income not found or doesn't belong to user's household
```

#### Update Income

```
PATCH /api/income/:id
Authorization: Bearer <session-cookie>

Request (all fields optional):
{
  "account_id": "uuid",
  "amount": 5200000,
  "description": "Salario Enero + Bono",
  "income_date": "2025-01-15"
}

Response: 200 OK
{
  "id": "uuid",
  ...updated fields
}

Business Rules:
- Can update: account_id, amount, description, income_date
- Cannot update: member_id (income belongs to a member)
- Account must belong to household
- Account type must be 'savings' or 'cash'

Errors:
404 - Income not found
403 - Income doesn't belong to user's household
400 - Invalid account type
```

#### Delete Income

```
DELETE /api/income/:id
Authorization: Bearer <session-cookie>

Response: 204 No Content

Business Rules:
- Anyone in the household can delete income entries
- Deletion is permanent (no soft delete)

Errors:
404 - Income not found
403 - Income doesn't belong to user's household
```

---

### Payment Method Linking

#### Link Payment Method to Account

```
PATCH /api/payment-methods/:id/link-account
Authorization: Bearer <session-cookie>

Request:
{
  "account_id": "uuid"
}

Response: 200 OK
{
  "id": "payment-method-uuid",
  "name": "Débito Jose Bancolombia",
  "type": "debit_card",
  "account_id": "account-uuid",
  "account_name": "Cuenta de ahorros Bancolombia",
  ...
}

Business Rules:
- Payment method must belong to user's household
- Account must belong to same household
- Only debit_card and cash types can be linked
- Account type must match payment method type:
  - debit_card → savings account
  - cash → cash account

Errors:
404 - Payment method or account not found
403 - Not authorized
400 - Invalid type combination
```

#### Unlink Payment Method from Account

```
DELETE /api/payment-methods/:id/link-account
Authorization: Bearer <session-cookie>

Response: 204 No Content

Business Rules:
- Sets account_id to NULL
- Payment method still exists, just unlinked

Errors:
404 - Payment method not found
403 - Not authorized
```

---

## 🎨 Frontend Implementation

### Location in UI

All new functionality in **`/perfil`** page for consistency:

```
/perfil
├── Información personal
├── Mi hogar
├── Mis cuentas              ← NEW SECTION
└── Mis métodos de pago
```

### New Section: "Mis Cuentas"

```
┌─────────────────────────────────────────┐
│ Mi perfil                               │
├─────────────────────────────────────────┤
│ ...                                     │
│                                         │
│ Mis cuentas                             │
│ ─────────────────────────────────────   │
│ Donde vive tu dinero                    │
│                                         │
│ [+ Agregar cuenta]                      │
│                                         │
│ 💰 Cuenta de ahorros Bancolombia        │
│    ••• 1234 · Bancolombia               │
│    Balance: $5,800,000                  │
│    [⋮]                                  │
│                                         │
│ 💵 Efectivo en Casa                     │
│    Balance: $150,000                    │
│    [⋮]                                  │
└─────────────────────────────────────────┘
```

### Account Form (Add/Edit)

```
┌─────────────────────────────────────────┐
│ Agregar Cuenta                          │
├─────────────────────────────────────────┤
│ Tipo de cuenta *                        │
│ ○ Cuenta de ahorros                     │
│ ○ Efectivo                              │
│ ○ Cuenta corriente                      │
│                                         │
│ Nombre *                                │
│ ┌─────────────────────────────────────┐ │
│ │ Cuenta de ahorros Bancolombia       │ │
│ └─────────────────────────────────────┘ │
│ (sugerido automáticamente)              │
│                                         │
│ Institución (para cuentas bancarias)    │
│ ┌─────────────────────────────────────┐ │
│ │ Bancolombia                         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Últimos 4 dígitos (opcional)            │
│ ┌─────────────────────────────────────┐ │
│ │ 1234                                │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Balance inicial (opcional, default: 0)  │
│ ┌─────────────────────────────────────┐ │
│ │ $5,000,000                          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Notas (opcional)                        │
│ ┌─────────────────────────────────────┐ │
│ │ Cuenta principal para salario       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Guardar] [Cancelar]                    │
└─────────────────────────────────────────┘
```

**Auto-suggestions:**
- Type: savings → Name: "Cuenta de ahorros {institution}"
- Type: cash → Name: "Efectivo en Casa"
- Type: checking → Name: "Cuenta corriente {institution}"

### Payment Method Form Enhancement

When creating/editing a **debit_card** payment method:

```
┌─────────────────────────────────────────┐
│ Agregar Método de Pago                  │
├─────────────────────────────────────────┤
│ Tipo: Tarjeta de Débito ✓               │
│ Nombre: Débito Jose Bancolombia         │
│ Institución: Bancolombia                │
│ Últimos 4 dígitos: 1234                 │
│                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                         │
│ ¿Vincular a una cuenta de ahorros?      │
│ (Opcional - permite seguimiento de      │
│  flujo de caja)                         │
│                                         │
│ ○ Sí, vincular a cuenta                 │
│   ┌───────────────────────────────────┐ │
│   │ Cuenta de ahorros Bancolombia ▼   │ │
│   └───────────────────────────────────┘ │
│   [+ Crear nueva cuenta]                │
│                                         │
│ ○ No vincular (solo para gastos)        │
│                                         │
│ [Guardar] [Cancelar]                    │
└─────────────────────────────────────────┘
```

**"Crear nueva cuenta" flow:**
Opens inline form:
```
┌─────────────────────────────────────────┐
│ Crear Cuenta de Ahorros                 │
├─────────────────────────────────────────┤
│ Nombre (sugerido)                       │
│ ┌─────────────────────────────────────┐ │
│ │ Cuenta de ahorros Bancolombia       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Balance inicial (opcional)              │
│ ┌─────────────────────────────────────┐ │
│ │ $0                                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Crear y vincular]                      │
└─────────────────────────────────────────┘
```

### New Page: `/ingresos` (Income Tracking)

Accessible from hamburger menu or from profile.

```
┌─────────────────────────────────────────┐
│ Ingresos del Mes                        │
├─────────────────────────────────────────┤
│ ← Mes anterior | Enero 2025 | Siguiente→│
│                                         │
│ [+ Agregar ingreso]                     │
│                                         │
│ Ingresos registrados (3):               │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ Jose - Salario 💰                 │   │
│ │ $5,000,000 → Cuenta Bancolombia   │   │
│ │ 15 Ene 2025          [⋮]          │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ Jose - Freelance 💰               │   │
│ │ $800,000 → Cuenta Bancolombia     │   │
│ │ 22 Ene 2025          [⋮]          │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ Jose - Retiro de Ahorros 🔄       │   │
│ │ $1,000,000 → Cuenta Bancolombia   │   │
│ │ 10 Ene 2025          [⋮]          │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ Caro - Salario 💰                 │   │
│ │ $4,500,000 → Cuenta Davivienda    │   │
│ │ 30 Ene 2025          [⋮]          │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ INGRESO REAL (💰):                      │
│ Jose: $5,800,000                        │
│ Caro: $4,500,000                        │
│ Subtotal: $10,300,000                   │
│                                         │
│ MOVIMIENTOS INTERNOS (🔄):              │
│ Jose: $1,000,000                        │
│ Subtotal: $1,000,000                    │
│                                         │
│ Total registrado: $11,300,000           │
│ [✓ Mostrar solo ingreso real]           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
└─────────────────────────────────────────┘
```

### Income Form (Add/Edit)

```
┌─────────────────────────────────────────┐
│ Agregar Ingreso                         │
├─────────────────────────────────────────┤
│ ¿Para quién? *                          │
│ ┌─────────────────────────────────────┐ │
│ │ Jose Blanquicet ▼                   │ │
│ └─────────────────────────────────────┘ │
│ (Solo miembros del hogar)               │
│                                         │
│ Tipo de Ingreso *                       │
│ ┌─────────────────────────────────────┐ │
│ │ Sueldo ▼                            │ │
│ └─────────────────────────────────────┘ │
│ Opciones:                               │
│   INGRESO REAL                          │
│   • Sueldo                              │
│   • Bono / Prima                        │
│   • Trabajo Independiente               │
│   • Reembolso de Gastos                 │
│   • Regalo                              │
│   • Venta                               │
│   • Otro Ingreso                        │
│   ─────────────────────                 │
│   MOVIMIENTO INTERNO                    │
│   • Retiro de Ahorros                   │
│   • Sobrante Mes Anterior               │
│   • Cobro de Deuda                      │
│   • Transferencia entre Cuentas         │
│   • Ajuste Contable                     │
│                                         │
│ Monto * (COP)                           │
│ ┌─────────────────────────────────────┐ │
│ │ $5.000.000                          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Descripción *                           │
│ ┌─────────────────────────────────────┐ │
│ │ Salario Enero 2025                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Cuenta destino *                        │
│ ┌─────────────────────────────────────┐ │
│ │ Cuenta de ahorros Bancolombia ▼     │ │
│ └─────────────────────────────────────┘ │
│ (Solo cuentas tipo savings o cash)      │
│                                         │
│ Fecha *                                 │
│ ┌─────────────────────────────────────┐ │
│ │ 2025-01-15                          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Guardar] [Cancelar]                    │
└─────────────────────────────────────────┘
```

---

## 🗄️ Data Migration Strategy

### Automatic Migration for Existing Users

When deploying this feature, automatically create accounts for existing debit cards:

```sql
-- Migration: 009_auto_create_accounts_from_debit_cards.up.sql

-- For each debit_card payment method, create a corresponding savings account
INSERT INTO accounts (household_id, name, type, institution, last4, initial_balance, notes)
SELECT 
  pm.household_id,
  CASE 
    WHEN pm.institution IS NOT NULL 
    THEN CONCAT('Cuenta de ahorros ', pm.institution)
    ELSE CONCAT('Cuenta de ahorros ', pm.name)
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
    AND a.name = CONCAT('Cuenta de ahorros ', COALESCE(pm.institution, pm.name))
  );

-- Link the payment methods to the newly created accounts
UPDATE payment_methods pm
SET account_id = a.id
FROM accounts a
WHERE pm.type = 'debit_card'
  AND pm.household_id = a.household_id
  AND a.name = CONCAT('Cuenta de ahorros ', COALESCE(pm.institution, pm.name))
  AND a.notes LIKE 'Auto-creada desde método de pago:%';
```

### Cash Account Creation

```sql
-- For each household with cash payment method, create cash account
INSERT INTO accounts (household_id, name, type, initial_balance)
SELECT DISTINCT
  pm.household_id,
  'Efectivo en Casa' as name,
  'cash'::account_type,
  0 as initial_balance
FROM payment_methods pm
WHERE pm.type = 'cash'
  AND NOT EXISTS (
    SELECT 1 FROM accounts a 
    WHERE a.household_id = pm.household_id 
    AND a.type = 'cash'
  );

-- Link cash payment methods to cash accounts
UPDATE payment_methods pm
SET account_id = a.id
FROM accounts a
WHERE pm.type = 'cash'
  AND pm.household_id = a.household_id
  AND a.type = 'cash';
```

### Rollback

```sql
-- Migration: 009_auto_create_accounts_from_debit_cards.down.sql

-- Unlink payment methods
UPDATE payment_methods
SET account_id = NULL
WHERE account_id IS NOT NULL;

-- Delete auto-created accounts
DELETE FROM accounts
WHERE notes LIKE 'Auto-creada desde método de pago:%'
   OR (type = 'cash' AND name = 'Efectivo en Casa');
```

---

## ✅ Implementation Checklist

### Phase 1: Backend - Accounts (Day 1)

**Database:**
- [ ] Create migration `009_create_accounts_table.up.sql`
- [ ] Create `account_type` enum
- [ ] Create `accounts` table with all fields
- [ ] Add indexes
- [ ] Create migration `009_create_accounts_table.down.sql` (rollback)
- [ ] Test migrations up/down locally

**Backend Code:**
- [ ] Create `internal/accounts/types.go`
  - [ ] Account model struct
  - [ ] AccountType enum
  - [ ] Validation methods
  - [ ] Error definitions
- [ ] Create `internal/accounts/repository.go`
  - [ ] Create()
  - [ ] GetByID()
  - [ ] ListByHousehold()
  - [ ] Update()
  - [ ] Delete()
  - [ ] GetBalance() (calculate from income - expenses)
- [ ] Create `internal/accounts/service.go`
  - [ ] Business logic
  - [ ] Authorization checks
  - [ ] Name uniqueness validation
  - [ ] Type validation
- [ ] Create `internal/accounts/handlers.go`
  - [ ] POST /api/accounts
  - [ ] GET /api/accounts
  - [ ] GET /api/accounts/:id
  - [ ] PATCH /api/accounts/:id
  - [ ] DELETE /api/accounts/:id
- [ ] Register routes in `internal/httpserver/server.go`
- [ ] Create `internal/accounts/service_test.go`
  - [ ] Test CRUD operations
  - [ ] Test authorization
  - [ ] Test validation
  - [ ] Test balance calculation

### Phase 2: Backend - Income (Day 2)

**Database:**
- [ ] Create migration `010_create_income_table.up.sql`
- [ ] Create `income` table with constraints
- [ ] Add indexes
- [ ] Add constraint: member belongs to household
- [ ] Add constraint: account type is savings or cash
- [ ] Create migration `010_create_income_table.down.sql`
- [ ] Test migrations up/down locally

**Backend Code:**
- [ ] Create `internal/income/types.go`
  - [ ] Income model struct
  - [ ] Validation methods
  - [ ] Error definitions
- [ ] Create `internal/income/repository.go`
  - [ ] Create()
  - [ ] GetByID()
  - [ ] ListByHousehold() with filters
  - [ ] GetTotals() (by member, by account)
  - [ ] Update()
  - [ ] Delete()
- [ ] Create `internal/income/service.go`
  - [ ] Business logic
  - [ ] Authorization checks
  - [ ] Account type validation
  - [ ] Member validation
- [ ] Create `internal/income/handlers.go`
  - [ ] POST /api/income
  - [ ] GET /api/income (with filters)
  - [ ] GET /api/income/:id
  - [ ] PATCH /api/income/:id
  - [ ] DELETE /api/income/:id
- [ ] Register routes in `internal/httpserver/server.go`
- [ ] Create `internal/income/service_test.go`
  - [ ] Test CRUD operations
  - [ ] Test filtering
  - [ ] Test totals calculation
  - [ ] Test authorization
  - [ ] Test validation

### Phase 3: Backend - Payment Method Linking (Day 2)

**Database:**
- [ ] Create migration `011_add_account_link_to_payment_methods.up.sql`
- [ ] Add `account_id` column to `payment_methods`
- [ ] Add index
- [ ] Create migration `011_add_account_link_to_payment_methods.down.sql`

**Backend Code:**
- [ ] Update `internal/paymentmethods/types.go`
  - [ ] Add AccountID field
  - [ ] Add AccountName to response
- [ ] Update `internal/paymentmethods/repository.go`
  - [ ] Join with accounts in queries
  - [ ] Update() to handle account_id
- [ ] Update `internal/paymentmethods/handlers.go`
  - [ ] PATCH /api/payment-methods/:id/link-account
  - [ ] DELETE /api/payment-methods/:id/link-account
  - [ ] Validation: type compatibility

### Phase 4: Backend - Auto-Migration (Day 2)

**Database:**
- [ ] Create migration `012_auto_create_accounts_from_debit_cards.up.sql`
- [ ] Auto-create savings accounts from debit cards
- [ ] Auto-create cash accounts from cash payment methods
- [ ] Link payment methods to accounts
- [ ] Create migration `012_auto_create_accounts_from_debit_cards.down.sql`
- [ ] Test migration with test data

### Phase 5: Frontend - Accounts UI (Day 3)

**Profile Page:**
- [ ] Add "Mis Cuentas" section in `pages/profile.js`
- [ ] List accounts with three-dots menu
- [ ] Show balance (calculated from backend)
- [ ] Add account button
- [ ] Account form (add/edit) as inline form
- [ ] Delete account with confirmation
- [ ] Handle validation errors
- [ ] Loading states

**Styles:**
- [ ] Account type icons (💰 savings, 💵 cash, 🏦 checking)
- [ ] Balance display formatting
- [ ] Responsive design

### Phase 6: Frontend - Payment Method Linking (Day 3)

**Payment Methods Form:**
- [ ] Update `pages/profile.js` payment method form
- [ ] Add "Vincular a cuenta" section for debit cards
- [ ] Dropdown to select existing account
- [ ] "Crear nueva cuenta" inline form
- [ ] Handle linking/unlinking
- [ ] Show linked account in payment method list

### Phase 7: Frontend - Income UI (Day 4)

**New Page:**
- [ ] Create `pages/income.js`
- [ ] Month navigation (← Anterior | Mes Actual | Siguiente →)
- [ ] Add income button
- [ ] Income list with three-dots menu
- [ ] Show totals by member
- [ ] Show household total
- [ ] Income form (add/edit) as inline form or modal
- [ ] Delete income with confirmation
- [ ] Filter dropdown (account filter)

**Router:**
- [ ] Add route `/ingresos` in `app.js`
- [ ] Add link in hamburger menu

**Styles:**
- [ ] Month navigation
- [ ] Income list items
- [ ] Totals section
- [ ] Responsive design

### Phase 8: Integration Testing (Day 4)

**Backend API Integration Tests:**
- [ ] Create `backend/tests/api-integration/test-accounts.sh`
  - [ ] Create account
  - [ ] List accounts
  - [ ] Update account
  - [ ] Delete account (success and validation)
- [ ] Create `backend/tests/api-integration/test-income.sh`
  - [ ] Create income
  - [ ] List income with filters
  - [ ] Update income
  - [ ] Delete income
  - [ ] Totals calculation
- [ ] Update `backend/tests/api-integration/test-api.sh` to include new tests

**E2E Tests:**
- [ ] Create `backend/tests/e2e/accounts-management.js`
  - [ ] Register user and create household
  - [ ] Create savings account
  - [ ] Create cash account
  - [ ] Edit account
  - [ ] Delete account (with validation)
  - [ ] Verify auto-created accounts from migration
- [ ] Create `backend/tests/e2e/income-tracking.js`
  - [ ] Create account
  - [ ] Register income
  - [ ] Edit income
  - [ ] Delete income
  - [ ] Verify totals
  - [ ] Filter by month
  - [ ] Multiple members scenario
- [ ] Create `backend/tests/e2e/payment-method-linking.js`
  - [ ] Create debit card
  - [ ] Link to account
  - [ ] Unlink from account
  - [ ] Create debit card with new account inline
  - [ ] Verify cash auto-linking

### Phase 9: Documentation (Day 4)

- [ ] Update `README.md` with new features
- [ ] Update `docs/DEVELOPMENT.md` with new endpoints
- [ ] Add examples to this design doc
- [ ] Document migration process
- [ ] Create user guide (basic)

---

## 🎯 Success Criteria

**Backend:**
- [ ] All migrations run successfully up and down
- [ ] All unit tests passing (accounts + income)
- [ ] All API integration tests passing
- [ ] Auto-migration creates accounts correctly
- [ ] Payment method linking works
- [ ] Income validation prevents wrong account types

**Frontend:**
- [ ] Can create/edit/delete accounts
- [ ] Can create/edit/delete income
- [ ] Account balance displays correctly
- [ ] Income totals calculate correctly
- [ ] Month navigation works
- [ ] Payment method → account linking works
- [ ] Responsive on mobile

**E2E:**
- [ ] Complete account management flow
- [ ] Complete income tracking flow
- [ ] Payment method linking flow
- [ ] Multi-user scenario tested
- [ ] Auto-migration verified

**Deployment:**
- [ ] All CI/CD tests passing
- [ ] Backend deployed to Azure
- [ ] Frontend deployed to Azure
- [ ] Smoke test in production
- [ ] No regressions in existing features

---

## 🚫 Out of Scope (Future Phases)

The following features are explicitly **NOT** in this phase:

- ❌ Movement split (`/gastos` and `/prestamos`) - Moved to Phase 5
- ❌ Cash flow analysis dashboard
- ❌ Budget tracking
- ❌ Account reconciliation with bank statements
- ❌ Investment tracking
- ❌ Savings goals
- ❌ Automatic expense categorization by account
- ❌ Account balance history/charts
- ❌ Multi-currency support

---

## 📚 Related Documentation

- `FUTURE_VISION.md` - Section 4.5 (Accounts), Section 4.4 (Cash Reality)
- `01_AUTH_PHASE.md` - Authentication foundation
- `02_HOUSEHOLD_PHASE.md` - Household management
- `03_PAYMENT_METHODS_PHASE.md` - Payment methods
- `05_MOVEMENT_SPLIT_PHASE.md` - Movement registration split (future)

---

## 🗓️ Timeline Estimate

| Task | Effort | Day |
|------|--------|-----|
| Backend - Accounts | 6-8 hours | Day 1 |
| Backend - Income | 6-8 hours | Day 2 |
| Backend - Linking + Migration | 4-6 hours | Day 2 |
| Frontend - Accounts UI | 6-8 hours | Day 3 |
| Frontend - Payment Linking | 2-3 hours | Day 3 |
| Frontend - Income UI | 6-8 hours | Day 4 |
| Integration & E2E Testing | 4-6 hours | Day 4 |
| Documentation | 2 hours | Day 4 |
| **Total** | **~36-48 hours** | **~4 days** |

---

**Last Updated:** 2026-01-05  
**Status:** 📋 Ready for Implementation  
**Next Action:** Start with Phase 1 (Backend - Accounts)

---

## 💡 Implementation Notes

### For Future AI Assistant / Developer

This document is designed to be self-contained for implementation. Key points:

1. **Start with migrations** - Database first, then code
2. **Test each phase** - Don't move to next phase without tests
3. **Follow patterns** - Look at existing code (households, payment methods) for consistency
4. **Keep selectors consistent** - E2E tests rely on CSS classes
5. **Auto-migration is critical** - Jose and Caro already have payment methods
6. **Balance is calculated** - Don't store it, compute from income - expenses
7. **Only savings + cash receive income** - This is by design, don't change
8. **Account linking is optional** - Don't force users to link

### Key Design Decisions Made

1. ✅ **Option B (Accounts)** - Separate accounts from payment methods
2. ✅ **Account types:** savings, cash, checking (only first 2 receive income)
3. ✅ **Balance:** Initial balance + calculated delta (Option C)
4. ✅ **Linking:** Optional at creation, can link/unlink later
5. ✅ **Cash:** Is both account and payment method (auto-linked)
6. ✅ **Deletion:** Only if no income entries (validation)
7. ✅ **UI Location:** Section in `/perfil` + separate `/ingresos` page
8. ✅ **Implementation:** All together in one phase (4 days)
9. ✅ **Name format:** Auto-suggested "Cuenta de ahorros {institution}"
10. ✅ **Last4 field:** Added to accounts for identification

### Common Pitfalls to Avoid

- ❌ Don't allow income to checking accounts (future feature)
- ❌ Don't allow income to credit cards (makes no sense)
- ❌ Don't store balance in DB (calculate it)
- ❌ Don't skip auto-migration (Jose and Caro need it)
- ❌ Don't allow account type changes (requires data migration)
- ❌ Don't delete accounts with income (data loss)
- ❌ Don't force account linking (optional feature)
