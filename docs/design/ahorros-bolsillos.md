# Plan: Ahorros / Bolsillos (Savings Pockets Feature)

## Context

Users need a way to track savings goals within the app — inspired by Nu's "cajitas" and Bancolombia's "bolsillos". Currently the app has accounts (savings/cash/checking) and income types (including `savings_withdrawal`), but no dedicated pocket/goal system. This feature adds:

- A **dedicated `/ahorros` page** with consolidated total and per-pocket progress bars
- **Pocket CRUD** (name, icon, color, goal amount)
- **Deposits** (account → pocket) and **withdrawals** (pocket → account)
- **"Pagar desde bolsillo"** integration in the existing expense form
- **Per-pocket detail view** with configuration and transaction history tabs

## Architecture Decision: New `pockets` + `pocket_transactions` Tables

**Why not reuse the `accounts` table?**
1. Pockets need fields accounts don't have: `goal_amount`, `icon`, `color`
2. Account balance formula in `accounts/repository.go:GetBalance()` (lines 282-308) is already complex — adding pocket logic is risky
3. All existing code filters accounts by type (`CanReceiveIncome()`, dropdowns) — adding `pocket` to the ENUM touches dozens of queries
4. Pocket transactions are simple bilateral (pocket ↔ account), unlike movements with payer/counterparty/participants

We do **NOT** modify the `movement_type` ENUM. Pocket transactions are their own entity.

## Key Design Decisions

### Deposits always create a linked HOUSEHOLD movement

Every deposit to a pocket **always** creates a linked HOUSEHOLD movement visible in the Gastos tab. There is no toggle — `category_id` is **mandatory** for deposits. This ensures all money leaving an account is tracked as an expense with proper categorization.

### Linked movements have NULL `payment_method_id` (no double-counting)

The linked HOUSEHOLD movement has `payment_method_id = NULL`. The account balance impact comes **only** from the `pocket_transactions` path in `GetBalance()`, not from the movement. If the movement also had a `payment_method_id` linked to the source account, the expense would be subtracted twice.

This requires relaxing the HOUSEHOLD validation in `movements/types.go` from Phase 1: allow NULL `PaymentMethodID` when the movement is linked to a pocket (has `source_pocket_id`).

### Linked movement description format

Auto-generated: `"Depósito a {pocket_name}: {user_description}"`

### Unidirectional editing (pocket → movement)

Pocket transactions and their linked movements maintain a **single source of truth** — the pocket_transaction:

- **Edit from Ahorros page:** Allowed. Changes to the pocket_transaction propagate automatically to the linked movement (amount, description, date, category).
- **Edit from Gastos tab:** **Not allowed.** The movement shows a message: *"Este gasto está vinculado a un bolsillo. Editarlo desde Ahorros."* with a link to the pocket detail page.
- **Delete from Ahorros:** Confirmation modal: *"¿Eliminar esta transacción? También se eliminará el gasto asociado en Gastos."* Cascades to delete the linked movement. Audit logs for both deletions.
- **Delete from Gastos:** Confirmation modal: *"Este gasto está vinculado al bolsillo {pocket_name}. Al eliminarlo también se eliminará la transacción del bolsillo. ¿Continuar?"* Cascades to delete the pocket_transaction. Audit logs for both deletions.

Same rules apply for Phase 2 "Pagar desde bolsillo" movements.

### Withdrawals have no category

`category_id` is only relevant for deposits (to create the linked movement). Withdrawals don't create linked movements and don't have a category field in the UI.

### `source_pocket_id` on movements from Phase 1

Originally planned for Phase 2, but since every deposit creates a linked movement, adding `source_pocket_id` to the `movements` table in Phase 1 allows the Gastos tab to display the pocket name (e.g., "📥 Vacaciones") from day one.

---

## Phase 1: Core Pockets (Backend + Frontend)

### Step 1: Migration 047 — Create `pockets` table

**File:** `backend/migrations/047_create_pockets.up.sql`

```sql
CREATE TABLE pockets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10) NOT NULL DEFAULT '💰',
    color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
    goal_amount DECIMAL(15, 2) CHECK (goal_amount IS NULL OR goal_amount > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pockets_unique_name_per_household UNIQUE(household_id, name)
);

CREATE INDEX idx_pockets_household ON pockets(household_id);
CREATE INDEX idx_pockets_owner ON pockets(owner_id);
CREATE INDEX idx_pockets_household_active ON pockets(household_id) WHERE is_active = TRUE;
```

**File:** `backend/migrations/047_create_pockets.down.sql` → `DROP TABLE IF EXISTS pockets;`

### Step 2: Migration 048 — Create `pocket_transactions` table

**File:** `backend/migrations/048_create_pocket_transactions.up.sql`

```sql
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
```

**File:** `backend/migrations/048_create_pocket_transactions.down.sql`:
```sql
DROP TABLE IF EXISTS pocket_transactions;
DROP TYPE IF EXISTS pocket_transaction_type;
```

### Step 3: Migration 049 — Add `source_pocket_id` to movements

**File:** `backend/migrations/049_add_source_pocket_to_movements.up.sql`

```sql
ALTER TABLE movements ADD COLUMN source_pocket_id UUID REFERENCES pockets(id) ON DELETE SET NULL;
CREATE INDEX idx_movements_source_pocket ON movements(source_pocket_id) WHERE source_pocket_id IS NOT NULL;
```

**File:** `backend/migrations/049_add_source_pocket_to_movements.down.sql`:
```sql
DROP INDEX IF EXISTS idx_movements_source_pocket;
ALTER TABLE movements DROP COLUMN IF EXISTS source_pocket_id;
```

### Step 4: Update `movements/types.go` — Relax HOUSEHOLD validation

**File:** `backend/internal/movements/types.go`

- Add `SourcePocketID *string` and `SourcePocketName *string` to `Movement` struct (after line 84)
- Add `SourcePocketID *string` to `CreateMovementInput` struct (after line 130)
- Relax HOUSEHOLD validation: allow NULL `PaymentMethodID` when `SourcePocketID` is set

### Step 5: Update `movements/repository.go` — Include `source_pocket_id`

Include `source_pocket_id` in INSERT/SELECT queries. Add `LEFT JOIN pockets pk ON m.source_pocket_id = pk.id` for pocket name.

### Step 6: Backend package `internal/pockets/`

**New files:**

| File | Contents |
|------|----------|
| `types.go` | `Pocket`, `PocketTransaction`, `PocketSummary` structs; `CreatePocketInput`, `UpdatePocketInput`, `DepositInput`, `WithdrawInput` with `Validate()` methods; `Repository` and `Service` interfaces |
| `repository.go` | PostgreSQL implementation — CRUD for pockets, CRUD for transactions, balance calculation via `SUM(CASE WHEN type='DEPOSIT' THEN amount ELSE -amount END)` |
| `service.go` | Business logic — auth checks, overdraft prevention, linked HOUSEHOLD movement creation on deposits, edit propagation to linked movements, cascading deletes, soft delete with balance check |
| `handlers.go` | HTTP handlers following existing pattern (`getUserFromRequest`, `getUserHousehold`, `respondJSON`, `respondError`) |

**Key business rules in service:**
- **Deposit:** Validate pocket active + account belongs to household. `category_id` is mandatory. Always creates a linked HOUSEHOLD movement with `source_pocket_id` set, `payment_method_id` NULL, `payer_user_id` = logged-in user, description = `"Depósito a {pocket_name}: {description}"`.
- **Edit deposit:** Updates pocket_transaction fields. Propagates changes to linked movement: amount, category_id, movement_date, and re-generates description.
- **Edit withdrawal:** Updates pocket_transaction fields. No linked movement to update. Validates new amount doesn't cause negative pocket balance.
- **Withdraw:** Check `balance >= amount` (no overdraft). Use `SELECT ... FOR UPDATE` for concurrency. No category field.
- **Delete pocket_transaction:** If DEPOSIT, check resulting pocket balance ≥ 0. If linked movement exists, cascade delete it. Create audit logs for both. If WITHDRAWAL, always allowed to delete.
- **Deactivate:** Requires `?force=true` query param if balance > 0. Soft delete (`is_active = false`).
- **Max 20 pockets per household** (soft limit in service).

### Step 7: Update `accounts/repository.go` — GetBalance()

**File:** `backend/internal/accounts/repository.go` (lines 282-298)

Add pocket transaction impact to balance formula:
```sql
- COALESCE((SELECT SUM(pt.amount) FROM pocket_transactions pt
            WHERE pt.source_account_id = a.id AND pt.type = 'DEPOSIT'), 0)
+ COALESCE((SELECT SUM(pt.amount) FROM pocket_transactions pt
            WHERE pt.destination_account_id = a.id AND pt.type = 'WITHDRAWAL'), 0)
```

Deposits from account → pocket reduce account balance. Withdrawals from pocket → account increase it.

**Important:** The linked HOUSEHOLD movement has `payment_method_id = NULL`, so it does NOT affect account balance through the movement path. Only the pocket_transaction affects it.

### Step 8: Update `audit/types.go`

**File:** `backend/internal/audit/types.go` (after line 78)

```go
ActionPocketCreated            Action = "POCKET_CREATED"
ActionPocketUpdated            Action = "POCKET_UPDATED"
ActionPocketDeactivated        Action = "POCKET_DEACTIVATED"
ActionPocketTransactionCreated Action = "POCKET_TRANSACTION_CREATED"
ActionPocketTransactionUpdated Action = "POCKET_TRANSACTION_UPDATED"
ActionPocketTransactionDeleted Action = "POCKET_TRANSACTION_DELETED"
```

### Step 9: Wire in `httpserver/server.go`

**File:** `backend/internal/httpserver/server.go`

Add import for `pockets` package. Create repo/service/handler. Register routes:

```
POST   /api/pockets                    → HandleCreate
GET    /api/pockets                    → HandleList
GET    /api/pockets/summary            → HandleGetSummary  (register BEFORE /{id})
GET    /api/pockets/{id}               → HandleGetByID
PATCH  /api/pockets/{id}               → HandleUpdate
DELETE /api/pockets/{id}               → HandleDelete
POST   /api/pockets/{id}/deposit       → HandleDeposit
POST   /api/pockets/{id}/withdraw      → HandleWithdraw
GET    /api/pockets/{id}/transactions  → HandleListTransactions
PATCH  /api/pocket-transactions/{id}   → HandleEditTransaction
DELETE /api/pocket-transactions/{id}   → HandleDeleteTransaction
```

### Step 10: API integration tests

**File:** `backend/tests/api-integration/test-pockets.sh`

Test: create pocket, list, deposit (verify linked movement created with `source_pocket_id`), withdraw, edit deposit (verify linked movement updated), overdraft prevention (422), summary totals, deactivate with/without balance, verify account balance affected, delete transaction (verify linked movement cascade deleted).

### Step 11: E2E tests with Playwright

**File:** `backend/tests/e2e/pockets.spec.js`

E2E tests covering the full UI flow: create pocket, deposit from account, verify pocket balance, verify account balance, verify movement appears in Gastos, verify movement is not editable from Gastos (shows "Editar desde Ahorros" message), withdraw to account, edit pocket config, delete pocket transaction (verify confirmation modal and cascade), delete pocket with balance (verify force confirmation).

### Step 12: Frontend — Ahorros page

**File:** `frontend/pages/ahorros.js` (NEW)

Single page handling both list and detail views via `?pocket={id}` query parameter:

**List view (no query param):**
- Header with Navbar + "Ahorros" title
- Consolidated total card (gradient purple background)
- Pocket cards grid: icon, name, balance, progress bar (if goal), owner name
- Empty state: "Crea tu primer bolsillo" with illustration
- FAB "+" button → create modal (name, icon picker, color picker, optional goal, owner selector)

**Detail view (`?pocket={id}`):**
- Back button → `/ahorros`
- Pocket header: icon + name + balance
- Progress card (if goal set) with large progress bar
- Action buttons: "Depositar" (green) + "Retirar" (red)
- Two tabs: "Movimientos" | "Configuración"
  - Movimientos: chronological transaction list with date, type icon (⬆️/⬇️), description, amount (+green/-red). Each transaction is editable (inline or modal) and deletable (with confirmation modal).
  - Configuración: edit name/icon/color/goal + danger zone "Eliminar bolsillo"

**Deposit modal:** Amount, source account selector, category selector (mandatory), description, date
**Withdraw modal:** Amount (max = balance), destination account selector, description, date (no category field)

**Delete transaction confirmation modals:**
- From Ahorros (deposit): *"¿Eliminar esta transacción? También se eliminará el gasto asociado en Gastos."*
- From Ahorros (withdrawal): *"¿Eliminar esta transacción?"*

### Step 13: Frontend — Route registration

**File:** `frontend/app.js`

Add `case 'ahorros'` to `loadPage()` switch. Register `/ahorros` route following existing pattern (auth check → load page → render → setup).

### Step 14: Frontend — Navbar link

**File:** `frontend/components/navbar.js`

Add `💰 Ahorros` link in the dropdown menu, **before** "✨ Asistente".

### Step 15: Frontend — CSS styles

**File:** `frontend/styles.css`

Add ~150 lines for: `.pockets-total-card`, `.pocket-card`, `.pocket-icon`, `.progress-bar`, `.progress-fill`, `.pocket-actions`, `.icon-picker-grid`, `.color-picker-row`, `.pocket-tx-list`, `.pocket-tx-item`, empty state styles.

### Step 16: Frontend — Show pocket source in Gastos tab + block editing

**File:** `frontend/pages/home.js`

- Where payment method name is shown, check for `source_pocket_name` and display `📥 {pocket_name}` instead.
- When a movement has `source_pocket_id`, the edit button shows a message: *"Este gasto está vinculado al bolsillo {pocket_name}. Editarlo desde Ahorros."* with a link to `#/ahorros?pocket={pocket_id}`.
- Delete button on linked movements shows confirmation modal: *"Este gasto está vinculado al bolsillo {pocket_name}. Al eliminarlo también se eliminará la transacción del bolsillo. ¿Continuar?"*

---

## Phase 2: Expense Integration ("Pagar desde bolsillo")

### Step 17: Add `SpendFromPocket` to pockets service

**File:** `backend/internal/pockets/service.go`

New method: atomically creates a HOUSEHOLD movement (with `source_pocket_id` set, `payment_method_id` NULL) + a pocket WITHDRAWAL transaction (with `linked_movement_id`). The movement's payer is the logged-in user.

### Step 18: Wire `HandleSpend` endpoint

**File:** `backend/internal/httpserver/server.go`

```
POST /api/pockets/{id}/spend → HandleSpend
```

### Step 19: Update movement form config

**File:** `backend/internal/movements/handler.go`

Add `Pockets` field to `FormConfigResponse` so the frontend can show them as a separate dropdown when pockets exist.

### Step 20: Frontend — "Desde bolsillo" in expense form

**File:** `frontend/pages/registrar-movimiento.js`

Only shown if the user has at least one active pocket (check `pockets` array in form config):
- Show a "Desde bolsillo" checkbox/option
- When enabled, show a new dropdown to select the pocket (with icon, name, and balance)
- Hide the payment method selector (since `payment_method_id` will be NULL)
- Show pocket balance and warn if amount exceeds balance
- On submit, call `POST /api/pockets/{id}/spend` instead of normal movement creation

### Step 21: Frontend — "Desde bolsillo" in Gastos tab

**File:** `frontend/pages/home.js`

Already handled in Phase 1 Step 16 (`source_pocket_name` display). Phase 2 "spend" movements will also have `source_pocket_id` set, so they'll automatically show `📥 {pocket_name}` and follow the same edit/delete rules as Phase 1 deposit-linked movements.

---

## Edge Cases & Business Rules

| # | Case | Decision |
|---|------|----------|
| 1 | Pocket reaches goal | Allow deposits beyond goal. Show 🎉 badge. Progress bar caps visually at 100%, text shows actual (e.g., "105%"). |
| 2 | No goal (open-ended) | `goal_amount = NULL`. No progress bar, only balance. Use case: emergency fund. |
| 3 | Who can own pockets | Only household members (users), not contacts. |
| 4 | Visibility | All household members see all pockets. Only owner can modify/transact. |
| 5 | Currency | Always COP. |
| 6 | Recurring contributions | Phase 3 (future). |
| 7 | Overdraft | Prevented. Service checks `amount <= balance` before withdraw/spend. HTTP 422. |
| 8 | Delete pocket with balance | Requires `?force=true`. Without: error + balance shown. With: soft delete, money untracked. Confirmation modal in UI. |
| 9 | Account balance impact | Deposits decrease source account balance (via pocket_transaction in GetBalance). Withdrawals increase destination account balance. Linked movements have `payment_method_id = NULL` to avoid double-counting. |
| 10 | No accounts exist | Can create pockets but cannot deposit/withdraw. Show "Primero crea una cuenta bancaria". |
| 11 | Concurrency | `SELECT ... FOR UPDATE` on pocket balance checks within DB transactions. |
| 12 | Max pockets | 20 per household (soft limit in service). |
| 13 | Duplicate name | UNIQUE constraint per household. Error: "Ya existe un bolsillo con ese nombre". |
| 14 | Delete transaction | Deposits: check resulting balance ≥ 0, cascade delete linked movement + audit logs for both. Withdrawals: always allowed, no linked movement. |
| 15 | Deposits always create linked movement | Every deposit creates a HOUSEHOLD movement with `source_pocket_id`, `payment_method_id = NULL`, `payer_user_id = logged-in user`, description = `"Depósito a {pocket_name}: {description}"`. `category_id` is mandatory. |
| 16 | Editing linked movements | Unidirectional: edits from Ahorros propagate to linked movement. From Gastos, editing is blocked with message: "Este gasto está vinculado a un bolsillo. Editarlo desde Ahorros." |
| 17 | Deleting linked movements from Gastos | Allowed with confirmation modal: "Este gasto está vinculado al bolsillo {name}. Al eliminarlo también se eliminará la transacción del bolsillo. ¿Continuar?" Cascade deletes both + audit logs. |
| 18 | Deleting pocket_transaction from Ahorros | Confirmation modal: "¿Eliminar esta transacción? También se eliminará el gasto asociado en Gastos." Cascade deletes both + audit logs. |
| 19 | Withdrawals have no category | `category_id` is only for deposits. Withdrawal form does not show category selector. |

## Files Summary

### New Files (Phase 1)
- `backend/migrations/047_create_pockets.{up,down}.sql`
- `backend/migrations/048_create_pocket_transactions.{up,down}.sql`
- `backend/migrations/049_add_source_pocket_to_movements.{up,down}.sql`
- `backend/internal/pockets/types.go`
- `backend/internal/pockets/repository.go`
- `backend/internal/pockets/service.go`
- `backend/internal/pockets/handlers.go`
- `backend/tests/api-integration/test-pockets.sh`
- `backend/tests/e2e/pockets.spec.js`
- `frontend/pages/ahorros.js`

### Modified Files (Phase 1)
- `backend/internal/httpserver/server.go` — wire pockets package, register routes
- `backend/internal/audit/types.go` — add 6 pocket audit actions
- `backend/internal/accounts/repository.go` — update `GetBalance()` formula (line 282)
- `backend/internal/movements/types.go` — add `SourcePocketID`/`SourcePocketName`, relax HOUSEHOLD validation (allow NULL `PaymentMethodID` when `SourcePocketID` is set)
- `backend/internal/movements/repository.go` — include `source_pocket_id` in INSERT/SELECT queries, add LEFT JOIN for pocket name
- `frontend/app.js` — add `/ahorros` route + `loadPage` case
- `frontend/components/navbar.js` — add "💰 Ahorros" menu item before "✨ Asistente"
- `frontend/styles.css` — add ~150 lines pocket CSS
- `frontend/pages/home.js` — show `📥 {pocket_name}` for linked movements, block editing with message, delete confirmation modal

### New/Modified Files (Phase 2)
- `backend/internal/pockets/service.go` — add `SpendFromPocket()` method
- `backend/internal/pockets/handlers.go` — add `HandleSpend`
- `backend/internal/httpserver/server.go` — register `/api/pockets/{id}/spend` route
- `backend/internal/movements/handler.go` — add `Pockets` to `FormConfigResponse`
- `frontend/pages/registrar-movimiento.js` — "Desde bolsillo" dropdown (only if pockets exist)

## Verification

1. Run migrations: `migrate -path ./backend/migrations -database "$DB_URL" up`
2. Build: `cd backend && go build ./...`
3. Unit tests: `cd backend && go test ./...`
4. Integration tests: `cd backend/tests/api-integration && ./test-pockets.sh`
5. E2E tests: `cd backend/tests && npm run test:pockets`
6. Manual test:
   - Create pocket via UI → verify appears in list
   - Deposit from account → verify pocket balance increases, account balance decreases, movement appears in Gastos with `📥 {pocket_name}`
   - Verify movement in Gastos is NOT editable (shows "Editar desde Ahorros" message)
   - Edit deposit from Ahorros → verify linked movement updated in Gastos
   - Delete deposit from Ahorros → verify confirmation modal, linked movement also deleted
   - Delete linked movement from Gastos → verify confirmation modal, pocket_transaction also deleted
   - Withdraw to account → verify pocket balance decreases, account balance increases, no movement in Gastos
   - Attempt overdraft → verify blocked
   - Edit pocket config → verify saved
   - Delete pocket with balance → verify force required
   - (Phase 2) Pay expense "desde bolsillo" → verify HOUSEHOLD movement created with `source_pocket_id`, pocket balance decreased
   - (Phase 2) Verify "Desde bolsillo" option only appears if user has pockets
