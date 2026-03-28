# Ahorros / Bolsillos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add savings pockets (bolsillos) feature — dedicated `/ahorros` page with pocket CRUD, deposits/withdrawals, linked HOUSEHOLD movements, and account balance integration.

**Architecture:** New `pockets` + `pocket_transactions` tables with a dedicated `internal/pockets/` Go package (types, repository, service, handlers). Deposits always create linked HOUSEHOLD movements with `source_pocket_id` set and `payment_method_id = NULL` to avoid double-counting in account balances. Editing is unidirectional: pocket_transaction is the source of truth, changes propagate to linked movements.

**Tech Stack:** Go 1.22+ (backend), PostgreSQL 16 (pgx v5), vanilla ES6 JavaScript (frontend), Playwright (E2E tests)

**Design doc:** `docs/design/ahorros-bolsillos.md`

---

## Task 1: Database Migrations (047, 048, 049)

**Files:**
- Create: `backend/migrations/047_create_pockets.up.sql`
- Create: `backend/migrations/047_create_pockets.down.sql`
- Create: `backend/migrations/048_create_pocket_transactions.up.sql`
- Create: `backend/migrations/048_create_pocket_transactions.down.sql`
- Create: `backend/migrations/049_add_source_pocket_to_movements.up.sql`
- Create: `backend/migrations/049_add_source_pocket_to_movements.down.sql`

- [ ] **Step 1: Create migration 047 — pockets table**

Write `backend/migrations/047_create_pockets.up.sql`:
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

Write `backend/migrations/047_create_pockets.down.sql`:
```sql
DROP TABLE IF EXISTS pockets;
```

- [ ] **Step 2: Create migration 048 — pocket_transactions table**

Write `backend/migrations/048_create_pocket_transactions.up.sql`:
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

Write `backend/migrations/048_create_pocket_transactions.down.sql`:
```sql
DROP TABLE IF EXISTS pocket_transactions;
DROP TYPE IF EXISTS pocket_transaction_type;
```

- [ ] **Step 3: Create migration 049 — add source_pocket_id to movements**

Write `backend/migrations/049_add_source_pocket_to_movements.up.sql`:
```sql
ALTER TABLE movements ADD COLUMN source_pocket_id UUID REFERENCES pockets(id) ON DELETE SET NULL;
CREATE INDEX idx_movements_source_pocket ON movements(source_pocket_id) WHERE source_pocket_id IS NOT NULL;
```

Write `backend/migrations/049_add_source_pocket_to_movements.down.sql`:
```sql
DROP INDEX IF EXISTS idx_movements_source_pocket;
ALTER TABLE movements DROP COLUMN IF EXISTS source_pocket_id;
```

- [ ] **Step 4: Run migrations and verify**

```bash
cd backend && export DB_URL="postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable"
migrate -path ./migrations -database "$DB_URL" up
migrate -path ./migrations -database "$DB_URL" version
# Expected: 49
```

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/047_create_pockets.up.sql backend/migrations/047_create_pockets.down.sql \
  backend/migrations/048_create_pocket_transactions.up.sql backend/migrations/048_create_pocket_transactions.down.sql \
  backend/migrations/049_add_source_pocket_to_movements.up.sql backend/migrations/049_add_source_pocket_to_movements.down.sql
git commit -m "feat: add migrations for pockets, pocket_transactions, and source_pocket_id on movements"
```

---

## Task 2: Update Audit Types and Movements Types

**Files:**
- Modify: `backend/internal/audit/types.go` (line 78 — add pocket audit actions)
- Modify: `backend/internal/movements/types.go` (add SourcePocketID fields, relax HOUSEHOLD validation)

- [ ] **Step 1: Add pocket audit actions**

In `backend/internal/audit/types.go`, after line 78 (`ActionCreditCardPaymentDeleted`), before the closing `)`, add:

```go
// Pockets
ActionPocketCreated            Action = "POCKET_CREATED"
ActionPocketUpdated            Action = "POCKET_UPDATED"
ActionPocketDeactivated        Action = "POCKET_DEACTIVATED"
ActionPocketTransactionCreated Action = "POCKET_TRANSACTION_CREATED"
ActionPocketTransactionUpdated Action = "POCKET_TRANSACTION_UPDATED"
ActionPocketTransactionDeleted Action = "POCKET_TRANSACTION_DELETED"
```

- [ ] **Step 2: Add SourcePocketID to Movement struct**

In `backend/internal/movements/types.go`, add to the `Movement` struct after `GeneratedFromTemplateID` (after line 84):

```go
	// Source pocket (when movement was created from a pocket deposit/spend)
	SourcePocketID   *string `json:"source_pocket_id,omitempty"`
	SourcePocketName *string `json:"source_pocket_name,omitempty"` // Populated from join
```

- [ ] **Step 3: Add SourcePocketID to CreateMovementInput**

In `backend/internal/movements/types.go`, add to `CreateMovementInput` after `GeneratedFromTemplateID` (after line 130):

```go
	// Source pocket (set when movement is created from a pocket transaction)
	SourcePocketID *string `json:"source_pocket_id,omitempty"`
```

- [ ] **Step 4: Relax HOUSEHOLD validation for pocket-linked movements**

In `backend/internal/movements/types.go`, in the `Validate()` method, replace the HOUSEHOLD payment method check (lines 178-181):

```go
		// Payment method required (unless linked to a pocket)
		if (i.PaymentMethodID == nil || *i.PaymentMethodID == "") && (i.SourcePocketID == nil || *i.SourcePocketID == "") {
			return ErrPaymentMethodRequired
		}
```

- [ ] **Step 5: Verify build**

```bash
cd backend && go build ./...
```
Expected: Success (no errors)

- [ ] **Step 6: Commit**

```bash
git add backend/internal/audit/types.go backend/internal/movements/types.go
git commit -m "feat: add pocket audit actions and SourcePocketID to movements types"
```

---

## Task 3: Update Movements Repository (source_pocket_id in queries)

**Files:**
- Modify: `backend/internal/movements/repository.go`

- [ ] **Step 1: Update Create method to include source_pocket_id**

In `repository.go`, in the `Create` method's INSERT statement, add `source_pocket_id` to both the column list and VALUES. Add the `input.SourcePocketID` parameter to the QueryRow args.

- [ ] **Step 2: Update GetByID query to LEFT JOIN pockets**

In the `GetByID` method's SELECT, add:
```sql
m.source_pocket_id,
pk.name as source_pocket_name,
```
And add to the FROM clause:
```sql
LEFT JOIN pockets pk ON m.source_pocket_id = pk.id
```
Add corresponding `&m.SourcePocketID, &m.SourcePocketName` to the Scan.

- [ ] **Step 3: Update ListByHousehold query similarly**

Add `source_pocket_id` and `source_pocket_name` (via LEFT JOIN pockets) to the list query. Add Scan fields.

- [ ] **Step 4: Update the Update method**

In the Update method, add `source_pocket_id` to the dynamic SET clause and RETURNING clause. Add Scan field.

- [ ] **Step 5: Verify build and run existing tests**

```bash
cd backend && go build ./...
cd backend && go test ./...
```
Expected: Build succeeds, all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/movements/repository.go
git commit -m "feat: include source_pocket_id in movements repository queries"
```

---

## Task 4: Update Account Balance (GetBalance)

**Files:**
- Modify: `backend/internal/accounts/repository.go` (lines 282-298)

- [ ] **Step 1: Add pocket transaction impact to GetBalance**

In `backend/internal/accounts/repository.go`, update the `GetBalance` method's SQL query. After the credit_card_payments line (line 294), before `as current_balance`, add:

```sql
			- COALESCE((SELECT SUM(pt.amount) FROM pocket_transactions pt
			            WHERE pt.source_account_id = a.id AND pt.type = 'DEPOSIT'), 0)
			+ COALESCE((SELECT SUM(pt.amount) FROM pocket_transactions pt
			            WHERE pt.destination_account_id = a.id AND pt.type = 'WITHDRAWAL'), 0)
```

The full query becomes:
```sql
SELECT
    a.initial_balance
    + COALESCE((SELECT SUM(i.amount) FROM income i WHERE i.account_id = a.id), 0)
    + COALESCE((SELECT SUM(m.amount) FROM movements m
                WHERE m.receiver_account_id = a.id), 0)
    - COALESCE((SELECT SUM(m.amount) FROM movements m
                JOIN payment_methods pm ON m.payment_method_id = pm.id
                WHERE COALESCE(pm.linked_account_id, pm.account_id) = a.id), 0)
    - COALESCE((SELECT SUM(ccp.amount) FROM credit_card_payments ccp
                WHERE ccp.source_account_id = a.id), 0)
    - COALESCE((SELECT SUM(pt.amount) FROM pocket_transactions pt
                WHERE pt.source_account_id = a.id AND pt.type = 'DEPOSIT'), 0)
    + COALESCE((SELECT SUM(pt.amount) FROM pocket_transactions pt
                WHERE pt.destination_account_id = a.id AND pt.type = 'WITHDRAWAL'), 0)
    as current_balance
FROM accounts a
WHERE a.id = $1
```

- [ ] **Step 2: Verify build and existing tests**

```bash
cd backend && go build ./...
cd backend && go test ./...
```
Expected: All pass. No pocket_transactions exist yet, so COALESCE returns 0.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/accounts/repository.go
git commit -m "feat: include pocket transactions in account balance calculation"
```

---

## Task 5: Pockets Package — types.go

**Files:**
- Create: `backend/internal/pockets/types.go`

- [ ] **Step 1: Create types.go**

Create `backend/internal/pockets/types.go` with:

```go
package pockets

import (
	"context"
	"errors"
	"strings"
	"time"
)

// Errors
var (
	ErrPocketNotFound      = errors.New("pocket not found")
	ErrPocketNameExists    = errors.New("pocket name already exists in household")
	ErrPocketNotActive     = errors.New("pocket is not active")
	ErrNotAuthorized       = errors.New("not authorized")
	ErrInsufficientBalance = errors.New("insufficient pocket balance")
	ErrMaxPocketsReached   = errors.New("maximum number of pockets reached (20)")
	ErrPocketHasBalance    = errors.New("pocket has remaining balance")
	ErrTransactionNotFound = errors.New("pocket transaction not found")
	ErrCategoryRequired    = errors.New("category is required for deposits")
	ErrDeleteWouldOverdraft = errors.New("deleting this deposit would cause negative balance")
)

// PocketTransactionType represents the type of pocket transaction
type PocketTransactionType string

const (
	TransactionTypeDeposit    PocketTransactionType = "DEPOSIT"
	TransactionTypeWithdrawal PocketTransactionType = "WITHDRAWAL"
)

// Pocket represents a savings pocket
type Pocket struct {
	ID          string    `json:"id"`
	HouseholdID string    `json:"household_id"`
	OwnerID     string    `json:"owner_id"`
	OwnerName   string    `json:"owner_name,omitempty"`
	Name        string    `json:"name"`
	Icon        string    `json:"icon"`
	Color       string    `json:"color"`
	GoalAmount  *float64  `json:"goal_amount,omitempty"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// Calculated fields
	Balance *float64 `json:"balance,omitempty"`
}

// PocketTransaction represents a deposit or withdrawal
type PocketTransaction struct {
	ID                   string                `json:"id"`
	PocketID             string                `json:"pocket_id"`
	HouseholdID          string                `json:"household_id"`
	Type                 PocketTransactionType `json:"type"`
	Amount               float64               `json:"amount"`
	Description          *string               `json:"description,omitempty"`
	TransactionDate      time.Time             `json:"transaction_date"`
	CategoryID           *string               `json:"category_id,omitempty"`
	CategoryName         *string               `json:"category_name,omitempty"`
	SourceAccountID      *string               `json:"source_account_id,omitempty"`
	SourceAccountName    *string               `json:"source_account_name,omitempty"`
	DestinationAccountID *string               `json:"destination_account_id,omitempty"`
	DestinationAccountName *string             `json:"destination_account_name,omitempty"`
	LinkedMovementID     *string               `json:"linked_movement_id,omitempty"`
	CreatedBy            string                `json:"created_by"`
	CreatedByName        string                `json:"created_by_name,omitempty"`
	CreatedAt            time.Time             `json:"created_at"`
}

// PocketSummary represents aggregated pocket data for the summary endpoint
type PocketSummary struct {
	TotalBalance float64   `json:"total_balance"`
	TotalGoal    *float64  `json:"total_goal,omitempty"`
	PocketCount  int       `json:"pocket_count"`
	Pockets      []*Pocket `json:"pockets"`
}

// CreatePocketInput contains data for creating a pocket
type CreatePocketInput struct {
	HouseholdID string
	OwnerID     string
	Name        string
	Icon        string
	Color       string
	GoalAmount  *float64
}

func (i *CreatePocketInput) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if i.Name == "" {
		return errors.New("pocket name is required")
	}
	if len(i.Name) > 100 {
		return errors.New("pocket name must be 100 characters or less")
	}
	if i.HouseholdID == "" {
		return errors.New("household ID is required")
	}
	if i.OwnerID == "" {
		return errors.New("owner ID is required")
	}
	if i.Icon == "" {
		i.Icon = "💰"
	}
	if i.Color == "" {
		i.Color = "#6366f1"
	}
	if i.GoalAmount != nil && *i.GoalAmount <= 0 {
		return errors.New("goal amount must be positive")
	}
	return nil
}

// UpdatePocketInput contains data for updating a pocket
type UpdatePocketInput struct {
	ID         string
	Name       *string
	Icon       *string
	Color      *string
	GoalAmount *float64
	ClearGoal  bool // Set to true to remove goal_amount
}

func (i *UpdatePocketInput) Validate() error {
	if i.ID == "" {
		return errors.New("pocket ID is required")
	}
	if i.Name != nil {
		*i.Name = strings.TrimSpace(*i.Name)
		if *i.Name == "" {
			return errors.New("pocket name cannot be empty")
		}
		if len(*i.Name) > 100 {
			return errors.New("pocket name must be 100 characters or less")
		}
	}
	if i.GoalAmount != nil && *i.GoalAmount <= 0 {
		return errors.New("goal amount must be positive")
	}
	return nil
}

// DepositInput contains data for depositing into a pocket
type DepositInput struct {
	PocketID        string
	Amount          float64
	Description     string
	TransactionDate time.Time
	CategoryID      string
	SourceAccountID string
	CreatedBy       string
}

func (i *DepositInput) Validate() error {
	if i.PocketID == "" {
		return errors.New("pocket ID is required")
	}
	if i.Amount <= 0 {
		return errors.New("amount must be positive")
	}
	if i.CategoryID == "" {
		return ErrCategoryRequired
	}
	if i.SourceAccountID == "" {
		return errors.New("source account is required")
	}
	if i.TransactionDate.IsZero() {
		return errors.New("transaction date is required")
	}
	if i.CreatedBy == "" {
		return errors.New("created_by is required")
	}
	return nil
}

// WithdrawInput contains data for withdrawing from a pocket
type WithdrawInput struct {
	PocketID             string
	Amount               float64
	Description          string
	TransactionDate      time.Time
	DestinationAccountID string
	CreatedBy            string
}

func (i *WithdrawInput) Validate() error {
	if i.PocketID == "" {
		return errors.New("pocket ID is required")
	}
	if i.Amount <= 0 {
		return errors.New("amount must be positive")
	}
	if i.DestinationAccountID == "" {
		return errors.New("destination account is required")
	}
	if i.TransactionDate.IsZero() {
		return errors.New("transaction date is required")
	}
	if i.CreatedBy == "" {
		return errors.New("created_by is required")
	}
	return nil
}

// EditTransactionInput contains data for editing a pocket transaction
type EditTransactionInput struct {
	ID              string
	Amount          *float64
	Description     *string
	TransactionDate *time.Time
	CategoryID      *string // Only for deposits
	SourceAccountID *string // Only for deposits
	DestinationAccountID *string // Only for withdrawals
}

func (i *EditTransactionInput) Validate() error {
	if i.ID == "" {
		return errors.New("transaction ID is required")
	}
	if i.Amount != nil && *i.Amount <= 0 {
		return errors.New("amount must be positive")
	}
	return nil
}

// Repository defines the interface for pocket data access
type Repository interface {
	// Pockets
	Create(ctx context.Context, pocket *Pocket) (*Pocket, error)
	GetByID(ctx context.Context, id string) (*Pocket, error)
	Update(ctx context.Context, pocket *Pocket) (*Pocket, error)
	Deactivate(ctx context.Context, id string) error
	ListByHousehold(ctx context.Context, householdID string) ([]*Pocket, error)
	ListActiveByHousehold(ctx context.Context, householdID string) ([]*Pocket, error)
	CountByHousehold(ctx context.Context, householdID string) (int, error)
	FindByName(ctx context.Context, householdID, name string) (*Pocket, error)
	GetBalance(ctx context.Context, id string) (float64, error)
	GetBalanceForUpdate(ctx context.Context, tx interface{}, id string) (float64, error)

	// Transactions
	CreateTransaction(ctx context.Context, tx *PocketTransaction) (*PocketTransaction, error)
	GetTransactionByID(ctx context.Context, id string) (*PocketTransaction, error)
	UpdateTransaction(ctx context.Context, id string, input *EditTransactionInput) (*PocketTransaction, error)
	DeleteTransaction(ctx context.Context, id string) error
	ListTransactions(ctx context.Context, pocketID string) ([]*PocketTransaction, error)
	GetTransactionByLinkedMovementID(ctx context.Context, movementID string) (*PocketTransaction, error)

	// DB transaction support
	BeginTx(ctx context.Context) (interface{}, error)
	CommitTx(ctx context.Context, tx interface{}) error
	RollbackTx(ctx context.Context, tx interface{}) error
	CreateTransactionInTx(ctx context.Context, tx interface{}, ptx *PocketTransaction) (*PocketTransaction, error)
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && go build ./internal/pockets/...
```
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add backend/internal/pockets/types.go
git commit -m "feat: add pockets package types, inputs, and interfaces"
```

---

## Task 6: Pockets Package — repository.go

**Files:**
- Create: `backend/internal/pockets/repository.go`

- [ ] **Step 1: Create repository.go**

Create `backend/internal/pockets/repository.go` following the patterns from `accounts/repository.go`:

The repository must implement all methods from the `Repository` interface defined in types.go. Key implementation details:

- Use `pgxpool.Pool` for connection management (same as accounts)
- `Create` — INSERT with RETURNING, handle unique constraint violation (error code "23505") → `ErrPocketNameExists`
- `GetByID` — SELECT with JOIN to users for owner_name, then call `GetBalance` to populate calculated field
- `Update` — UPDATE with RETURNING, handle unique constraint violation
- `Deactivate` — UPDATE `is_active = false, updated_at = NOW()`
- `ListByHousehold` — SELECT all pockets (active + inactive) with owner_name and balance calculation for each
- `ListActiveByHousehold` — SELECT WHERE `is_active = TRUE`
- `CountByHousehold` — `SELECT COUNT(*) WHERE is_active = TRUE`
- `FindByName` — SELECT WHERE `household_id = $1 AND name = $2`
- `GetBalance` — `SELECT COALESCE(SUM(CASE WHEN type='DEPOSIT' THEN amount ELSE -amount END), 0) FROM pocket_transactions WHERE pocket_id = $1`
- `GetBalanceForUpdate` — Same query but with `FOR UPDATE` lock, executed within a transaction
- `CreateTransaction` — INSERT pocket_transaction with RETURNING, then enrich via GetTransactionByID
- `GetTransactionByID` — SELECT with LEFT JOINs to categories, accounts, users for names
- `UpdateTransaction` — Dynamic SET clause (like movements/repository.go Update pattern)
- `DeleteTransaction` — DELETE with row count verification
- `ListTransactions` — SELECT ordered by `transaction_date DESC, created_at DESC`
- `GetTransactionByLinkedMovementID` — SELECT WHERE `linked_movement_id = $1`
- `BeginTx/CommitTx/RollbackTx` — Wrap `pgxpool.Pool.Begin()` returning `pgx.Tx`

- [ ] **Step 2: Verify build**

```bash
cd backend && go build ./internal/pockets/...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/pockets/repository.go
git commit -m "feat: add pockets repository with PostgreSQL implementation"
```

---

## Task 7: Pockets Package — service.go

**Files:**
- Create: `backend/internal/pockets/service.go`

- [ ] **Step 1: Create service.go**

Create `backend/internal/pockets/service.go` following patterns from `accounts/service.go`. The service needs these dependencies:

```go
type Service struct {
	repo          Repository
	movementsRepo movements.Repository  // For creating/updating/deleting linked movements
	accountsRepo  accounts.Repository   // For validating accounts belong to household
	householdRepo households.HouseholdRepository
	auditService  audit.Service
	logger        *slog.Logger
}
```

Implement these methods:

**Create(ctx, input CreatePocketInput)** — Validate input, check max 20 pockets, check name uniqueness, verify owner is household member, create pocket, audit log.

**GetByID(ctx, id, householdID string)** — Get pocket, verify household, return.

**ListByHousehold(ctx, householdID string)** — Return all active pockets with balances.

**GetSummary(ctx, householdID string)** — Return PocketSummary with total balance, total goal, and all active pockets.

**Update(ctx, userID, householdID string, input UpdatePocketInput)** — Validate input, verify pocket belongs to household, **verify pocket.OwnerID == userID** (only owner can modify), check name uniqueness if changed, update, audit log.

**Deactivate(ctx, id, userID, householdID string, force bool)** — **Verify pocket.OwnerID == userID** (only owner can deactivate). If balance > 0 and !force, return ErrPocketHasBalance. Otherwise soft-delete, audit log.

**Deposit(ctx, input DepositInput)** — Critical method. **Must be atomic (use DB transaction):**
1. Validate input (category_id mandatory)
2. Verify pocket is active and belongs to household
3. **Verify pocket.OwnerID == input.CreatedBy** (only owner can deposit)
4. Verify source account belongs to household
5. Get pocket name for movement description
6. **Begin DB transaction**
7. Create HOUSEHOLD movement (via movementsRepo): `description = "Depósito a {pocket_name}: {input.Description}"`, `payer_user_id = input.CreatedBy`, `category_id = input.CategoryID`, `source_pocket_id = pocket.ID`, `payment_method_id = nil`
8. Create pocket_transaction with `linked_movement_id = movement.ID`
9. **Commit transaction** (if either fails, rollback both)
10. Audit log for both

**Withdraw(ctx, input WithdrawInput)** — Critical method:
1. Validate input
2. Verify pocket is active and belongs to household
3. **Verify pocket.OwnerID == input.CreatedBy** (only owner can withdraw)
4. Verify destination account belongs to household
5. Begin transaction
6. `GetBalanceForUpdate` — lock pocket balance
7. Check `balance >= input.Amount` → ErrInsufficientBalance
8. Create pocket_transaction (no linked movement, no category)
9. Commit transaction
10. Audit log

**EditTransaction(ctx, userID, householdID string, input EditTransactionInput)** —
1. Get existing transaction
2. Verify pocket belongs to household
3. **Verify pocket.OwnerID == userID** (only owner can edit)
4. If WITHDRAWAL and amount changed: check new balance wouldn't go negative
5. Update transaction fields
6. If DEPOSIT and linked movement exists: propagate changes to movement (amount, category, date, regenerate description)
7. Audit log for transaction update (and movement update if applicable)

**DeleteTransaction(ctx, transactionID, userID, householdID string)** —
1. Get existing transaction
2. Verify pocket belongs to household
3. **Verify pocket.OwnerID == userID** (only owner can delete)
4. If DEPOSIT: check deleting won't cause negative balance (removing a deposit DECREASES the pocket balance, so check: current_balance - this_deposit_amount >= 0)
5. If linked_movement_id exists: delete the linked movement, audit log MOVEMENT_DELETED
6. Delete the pocket_transaction
7. Audit log POCKET_TRANSACTION_DELETED

**DeleteTransactionByMovementID(ctx, movementID, householdID string)** — Called when deleting a linked movement from Gastos:
1. Find pocket_transaction by linked_movement_id
2. If found: delete the pocket_transaction, audit log
3. The movement itself is deleted by the caller (movements service)

- [ ] **Step 2: Verify build**

```bash
cd backend && go build ./internal/pockets/...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/pockets/service.go
git commit -m "feat: add pockets service with business logic, deposits, withdrawals, and cascading operations"
```

---

## Task 8: Pockets Package — handlers.go

**Files:**
- Create: `backend/internal/pockets/handlers.go`

- [ ] **Step 1: Create handlers.go**

Create `backend/internal/pockets/handlers.go` following the exact pattern from `accounts/handlers.go`:

```go
type Handler struct {
	service       *Service
	logger        *slog.Logger
	authSvc       *auth.Service
	householdRepo households.HouseholdRepository
	cookieName    string
}
```

Include the same helper methods: `getUserFromRequest`, `getUserHousehold`, `respondJSON`, `respondError`.

Implement these handlers:

- `HandleCreate` — POST /api/pockets — Parse `CreatePocketRequest{OwnerID, Name, Icon, Color, GoalAmount}`, verify owner is household member, call service.Create
- `HandleList` — GET /api/pockets — Get household, call service.ListByHousehold
- `HandleGetSummary` — GET /api/pockets/summary — Get household, call service.GetSummary
- `HandleGetByID` — GET /api/pockets/{id} — Get household, call service.GetByID
- `HandleUpdate` — PATCH /api/pockets/{id} — Parse `UpdatePocketRequest{Name, Icon, Color, GoalAmount, ClearGoal}`, call service.Update
- `HandleDelete` — DELETE /api/pockets/{id} — Check `?force=true` query param, call service.Deactivate
- `HandleDeposit` — POST /api/pockets/{id}/deposit — Parse `DepositRequest{Amount, Description, TransactionDate, CategoryID, SourceAccountID}`, call service.Deposit
- `HandleWithdraw` — POST /api/pockets/{id}/withdraw — Parse `WithdrawRequest{Amount, Description, TransactionDate, DestinationAccountID}`, call service.Withdraw
- `HandleListTransactions` — GET /api/pockets/{id}/transactions — Call repo.ListTransactions
- `HandleEditTransaction` — PATCH /api/pocket-transactions/{id} — Parse EditTransactionRequest, call service.EditTransaction
- `HandleDeleteTransaction` — DELETE /api/pocket-transactions/{id} — Call service.DeleteTransaction

Error mapping (follow accounts pattern):
- `ErrPocketNotFound` → 404
- `ErrNotAuthorized` → 403
- `ErrPocketNameExists` → 409
- `ErrInsufficientBalance` → 422
- `ErrMaxPocketsReached` → 422
- `ErrPocketHasBalance` → 422
- `ErrPocketNotActive` → 422
- `ErrDeleteWouldOverdraft` → 422
- Validation errors → 400

- [ ] **Step 2: Verify build**

```bash
cd backend && go build ./internal/pockets/...
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/pockets/handlers.go
git commit -m "feat: add pockets HTTP handlers"
```

---

## Task 9: Wire Pockets in HTTP Server + Update Movements Delete

**Files:**
- Modify: `backend/internal/httpserver/server.go`
- Modify: `backend/internal/movements/service.go` (Delete method — cascade to pocket_transaction)
- Modify: `backend/internal/movements/types.go` (Add setter method to Service interface)

**Important:** `movements.NewService()` returns the `Service` interface (not concrete type). To add the `SetDeletePocketTransactionFn` callback, we need to add it to the interface, or use a different pattern. The cleanest approach (matching how `budgetItemsService.SetSyncTemplateFn` works — `BudgetItemsService` is a concrete `*BudgetItemsService` type) is to **add the setter to the `service` struct and add a type-specific helper**. Since `NewService` returns the interface, we'll use a closure wired in `server.go` that the movements repo can call directly.

**Alternative (simpler) approach:** Add a `deletePocketTransactionFn` field and setter directly on the unexported `service` struct. In `server.go`, use a type assertion `movementsService.(*movements.service)` — but `service` is unexported so this won't work.

**Chosen approach:** Add `SetDeletePocketTransactionFn` to the `Service` interface in `movements/types.go`. This is the simplest change.

- [ ] **Step 1: Add SetDeletePocketTransactionFn to movements Service interface**

In `backend/internal/movements/types.go`, add to the `Service` interface (around line 391):
```go
	SetDeletePocketTransactionFn(fn func(ctx context.Context, movementID, householdID string) error)
```

In `backend/internal/movements/service.go`, add the field and setter:
```go
// Add field to service struct:
deletePocketTransactionFn func(ctx context.Context, movementID, householdID string) error

// Add setter method:
func (s *service) SetDeletePocketTransactionFn(fn func(ctx context.Context, movementID, householdID string) error) {
	s.deletePocketTransactionFn = fn
}
```

In the `Delete` method, before `s.repo.Delete()`, add:
```go
	// Cascade delete linked pocket transaction (if any)
	if s.deletePocketTransactionFn != nil {
		if err := s.deletePocketTransactionFn(ctx, id, existing.HouseholdID); err != nil {
			s.logger.Error("failed to cascade delete pocket transaction", "movement_id", id, "error", err)
			// Continue with movement deletion even if pocket cascade fails
		}
	}
```

- [ ] **Step 2: Wire pockets package in server.go**

In `backend/internal/httpserver/server.go`:

1. Add import: `"github.com/blanquicet/conti/backend/internal/pockets"`

2. After the credit cards section (around line 411), add:
```go
	// Create pockets service and handler
	pocketsRepo := pockets.NewRepository(pool)
	pocketsService := pockets.NewService(
		pocketsRepo,
		movementsRepo,
		accountsRepo,
		householdRepo,
		auditService,
		logger,
	)
	pocketsHandler := pockets.NewHandler(
		pocketsService,
		authService,
		householdRepo,
		cfg.SessionCookieName,
		logger,
	)

	// Wire cascade delete: when a linked movement is deleted from Gastos,
	// also delete the pocket_transaction that references it
	movementsService.SetDeletePocketTransactionFn(func(ctx context.Context, movementID, householdID string) error {
		return pocketsService.DeleteTransactionByMovementID(ctx, movementID, householdID)
	})
```

3. In the route registration section (after credit cards routes, around line 563), add:
```go
	// Pockets endpoints
	mux.HandleFunc("POST /api/pockets", pocketsHandler.HandleCreate)
	mux.HandleFunc("GET /api/pockets", pocketsHandler.HandleList)
	mux.HandleFunc("GET /api/pockets/summary", pocketsHandler.HandleGetSummary)
	mux.HandleFunc("GET /api/pockets/{id}", pocketsHandler.HandleGetByID)
	mux.HandleFunc("PATCH /api/pockets/{id}", pocketsHandler.HandleUpdate)
	mux.HandleFunc("DELETE /api/pockets/{id}", pocketsHandler.HandleDelete)
	mux.HandleFunc("POST /api/pockets/{id}/deposit", pocketsHandler.HandleDeposit)
	mux.HandleFunc("POST /api/pockets/{id}/withdraw", pocketsHandler.HandleWithdraw)
	mux.HandleFunc("GET /api/pockets/{id}/transactions", pocketsHandler.HandleListTransactions)
	mux.HandleFunc("PATCH /api/pocket-transactions/{id}", pocketsHandler.HandleEditTransaction)
	mux.HandleFunc("DELETE /api/pocket-transactions/{id}", pocketsHandler.HandleDeleteTransaction)
```

**Important:** Register `/api/pockets/summary` BEFORE `/api/pockets/{id}` to avoid the `{id}` pattern matching "summary".

- [ ] **Step 3: Verify build**

```bash
cd backend && go build ./...
```
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add backend/internal/httpserver/server.go backend/internal/movements/service.go
git commit -m "feat: wire pockets package in HTTP server and add cascade delete from movements"
```

---

## Task 10: API Integration Tests

**Files:**
- Create: `backend/tests/api-integration/test-pockets.sh`

- [ ] **Step 1: Create integration test script**

Create `backend/tests/api-integration/test-pockets.sh` following the pattern from `test-api.sh`. The script should:

1. Set up: register user, login (save cookie), create household, create category, create account
2. **Test pocket CRUD:**
   - Create pocket → 201, verify response fields
   - Create duplicate name → 409
   - List pockets → 200, verify count
   - Get pocket by ID → 200
   - Update pocket (name, icon, color, goal) → 200
   - Get summary → 200, verify totals
3. **Test deposit:**
   - Deposit with category → 201
   - Verify pocket balance increased
   - Verify linked HOUSEHOLD movement created (GET /movements, check source_pocket_id)
   - Verify account balance decreased
4. **Test withdrawal:**
   - Withdraw → 201
   - Verify pocket balance decreased
   - Verify account balance increased
   - Attempt overdraft → 422
5. **Test edit transaction:**
   - Edit deposit amount → 200
   - Verify linked movement amount updated
6. **Test delete transaction:**
   - Delete deposit → 204
   - Verify linked movement also deleted
7. **Test deactivate pocket:**
   - Create pocket with balance
   - Delete without force → 422
   - Delete with ?force=true → 204
8. **Test max pockets limit:**
   - Create 20 pockets → all 201
   - Create 21st → 422
9. Cleanup: delete test data

Make the script executable: `chmod +x backend/tests/api-integration/test-pockets.sh`

- [ ] **Step 2: Run the integration tests**

```bash
# Start backend first (in separate terminal): cd backend && go run cmd/api/main.go
cd backend/tests/api-integration && ./test-pockets.sh
```
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api-integration/test-pockets.sh
git commit -m "test: add API integration tests for pockets feature"
```

---

## Task 11: Frontend — Route Registration + Navbar

**Files:**
- Modify: `frontend/app.js`
- Modify: `frontend/components/navbar.js`

- [ ] **Step 1: Add ahorros to loadPage switch**

In `frontend/app.js`, in the `loadPage` function's switch statement (around line 29), add:
```javascript
      case 'ahorros': pageCache[name] = await import('./pages/ahorros.js'); break;
```

- [ ] **Step 2: Register /ahorros route**

In `frontend/app.js`, in the `initRouter` function, after the chat route registration, add a new route following the same pattern as `/registrar-movimiento`:

```javascript
  router.route('/ahorros', async () => {
    const { authenticated, user } = await checkAuth();

    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    const AhorrosPage = await loadPage('ahorros');
    const appEl = document.getElementById('app');
    appEl.innerHTML = AhorrosPage.render(user);
    await AhorrosPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });
```

- [ ] **Step 3: Add navbar link**

In `frontend/components/navbar.js`, in the `render` function, add the Ahorros link **before** the Asistente link (before line 39):

```javascript
      <a href="/ahorros" class="dropdown-item ${activeRoute === '/ahorros' ? 'active' : ''}" data-route="/ahorros">
        💰 Ahorros
      </a>
```

- [ ] **Step 4: Verify manually**

Open browser, navigate to app, check navbar has "💰 Ahorros" link, clicking it navigates to `/ahorros` (will show blank/error until the page module is created).

- [ ] **Step 5: Commit**

```bash
git add frontend/app.js frontend/components/navbar.js
git commit -m "feat: add /ahorros route registration and navbar link"
```

---

## Task 12: Frontend — Ahorros Page (List View)

**Files:**
- Create: `frontend/pages/ahorros.js`
- Modify: `frontend/styles.css`

**Important — Router same-path guard:** The router has `if (this.currentRoute === pathname) return;` (router.js line 31). Both the list view (`/ahorros`) and detail view (`/ahorros?pocket={id}`) share the same pathname. This means `router.navigate('/ahorros?pocket=xxx')` from the list view will be **ignored** by the router.

**Solution:** Handle view switching **inside** `ahorros.js` without relying on the router for list↔detail transitions:
1. The `setup()` function reads `window.location.search` to detect `?pocket={id}`
2. Clicking a pocket card updates the URL with `window.history.pushState(...)` and re-renders internally (calls a `renderView()` function)
3. The back button updates the URL and re-renders internally
4. Listen to `popstate` events within the page to handle browser back/forward
5. This is the same pattern `home.js` uses for tab switching and query parameters

- [ ] **Step 1: Create ahorros.js with list view**

Create `frontend/pages/ahorros.js` exporting `render(user)` and `setup()`.

The **list view** (default, no `?pocket=` query param) shows:
- Navbar (import from `../components/navbar.js`)
- "Ahorros" title
- Consolidated total card (gradient purple: `#6366f1` → `#8b5cf6`)
- Grid of pocket cards: icon, name, balance (formatted COP with `Intl.NumberFormat('es-CO')`), progress bar (if goal), owner name
- Empty state when no pockets: "Crea tu primer bolsillo 💰" with description text
- FAB "+" button in bottom-right corner → opens create pocket modal

**Create pocket modal:** Name input, icon picker grid (preset emoji list: 💰🏖️🏠🎓🚗💊🎁🛡️🎯✈️🏋️💻📱🎮🐶👶🎵📚🔧💍), color picker row (preset colors: #6366f1, #8b5cf6, #ec4899, #f43f5e, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7), optional goal amount input, owner selector (household members dropdown).

Clicking a pocket card navigates to `#/ahorros?pocket={id}`.

API calls:
- `GET /api/pockets/summary` — for list view data
- `GET /accounts` — for the deposit/withdraw account selectors (cached for modals)
- `GET /categories` — for the category selector in deposit modal
- `POST /api/pockets` — create pocket

- [ ] **Step 2: Add CSS styles for list view**

In `frontend/styles.css`, add styles for:
- `.pockets-page` container
- `.pockets-total-card` — gradient background, large balance text
- `.pockets-grid` — responsive grid (CSS grid, min 280px columns)
- `.pocket-card` — card with shadow, clickable, hover effect
- `.pocket-icon` — large emoji display
- `.pocket-progress-bar` — background track + colored fill bar
- `.pocket-empty-state` — centered, muted text
- `.pocket-fab` — floating action button, bottom-right fixed
- `.pocket-modal` — modal overlay + centered card
- `.icon-picker-grid` — emoji grid layout
- `.color-picker-row` — horizontal color circles

- [ ] **Step 3: Verify manually**

Start backend, navigate to `/ahorros`, verify:
- Empty state shows when no pockets
- Create modal opens on FAB click
- Can create a pocket → appears in grid
- Total card shows correct balance (0 for new pocket)

- [ ] **Step 4: Commit**

```bash
git add frontend/pages/ahorros.js frontend/styles.css
git commit -m "feat: add ahorros page with pocket list view and create modal"
```

---

## Task 13: Frontend — Ahorros Page (Detail View)

**Files:**
- Modify: `frontend/pages/ahorros.js`
- Modify: `frontend/styles.css`

- [ ] **Step 1: Add detail view to ahorros.js**

When `?pocket={id}` is present in the URL, show the detail view instead of list:

- Back button "← Ahorros" → navigates to `/ahorros`
- Pocket header: large icon + name + balance (formatted COP)
- Progress card (if goal_amount set): large progress bar, percentage text (cap display at 100%, show actual like "105%"), 🎉 badge if >= 100%
- Action buttons row: "Depositar" (green, #22c55e) + "Retirar" (red, #f43f5e)
- Two tabs: "Movimientos" | "Configuración"

**Movimientos tab:**
- Chronological transaction list
- Each item: date, type icon (⬆️ deposit / ⬇️ withdrawal), description, amount (+green for deposit / -red for withdrawal)
- Each item has edit (✏️) and delete (🗑️) buttons
- Edit opens a modal pre-filled with current values
- Delete shows confirmation modal (different text for deposit vs withdrawal)

**Configuración tab:**
- Edit form: name, icon picker, color picker, goal amount (with clear goal checkbox)
- Danger zone: "Eliminar bolsillo" red button → confirmation modal (different if balance > 0)

**Deposit modal:** Amount, source account dropdown, category dropdown (mandatory), description, date picker (defaults to today). **If no accounts exist, disable deposit/withdraw buttons and show "Primero crea una cuenta bancaria" message.**

**Withdraw modal:** Amount (shows max = current balance), destination account dropdown, description, date picker (defaults to today). **No category field.**

API calls:
- `GET /api/pockets/{id}` — pocket details with balance
- `GET /api/pockets/{id}/transactions` — transaction list
- `POST /api/pockets/{id}/deposit` — deposit
- `POST /api/pockets/{id}/withdraw` — withdraw
- `PATCH /api/pockets/{id}` — update config
- `DELETE /api/pockets/{id}?force=true` — deactivate
- `PATCH /api/pocket-transactions/{id}` — edit transaction
- `DELETE /api/pocket-transactions/{id}` — delete transaction

- [ ] **Step 2: Add CSS for detail view**

Add to `frontend/styles.css`:
- `.pocket-detail-header` — large icon + name layout
- `.pocket-progress-card` — large progress bar card
- `.pocket-actions` — button row, flexbox, gap
- `.pocket-tabs` — tab headers with active underline
- `.pocket-tx-list` — transaction list container
- `.pocket-tx-item` — single transaction row with amount coloring
- `.pocket-config-form` — settings form layout
- `.pocket-danger-zone` — red bordered section
- `.pocket-deposit-btn`, `.pocket-withdraw-btn` — green/red action buttons

- [ ] **Step 3: Verify manually**

Test full flow: create pocket → deposit → see transaction in list → edit deposit → verify updated → withdraw → verify balance → delete transaction → verify confirmation modal → edit config → deactivate pocket.

- [ ] **Step 4: Commit**

```bash
git add frontend/pages/ahorros.js frontend/styles.css
git commit -m "feat: add pocket detail view with transactions, deposits, withdrawals, and configuration"
```

---

## Task 14: Frontend — Gastos Tab Integration (home.js)

**Files:**
- Modify: `frontend/pages/home.js`

- [ ] **Step 1: Show pocket source in Gastos tab**

In `frontend/pages/home.js`, find where payment method name is displayed for movements in the Gastos tab. Add a check: if the movement has `source_pocket_name`, display `📥 {source_pocket_name}` instead of the payment method name.

- [ ] **Step 2: Block editing of pocket-linked movements**

When a movement has `source_pocket_id`:
- Replace the edit button/action with a message or disabled button
- On click, show a toast/alert: "Este gasto está vinculado al bolsillo {source_pocket_name}. Editarlo desde Ahorros."
- Optionally make it a link to `#/ahorros?pocket={source_pocket_id}`

- [ ] **Step 3: Add delete confirmation for pocket-linked movements**

When deleting a movement that has `source_pocket_id`:
- Show a custom confirmation modal: "Este gasto está vinculado al bolsillo {source_pocket_name}. Al eliminarlo también se eliminará la transacción del bolsillo. ¿Continuar?"
- The backend handles the cascade (movements service calls pockets service via the callback)

- [ ] **Step 4: Verify manually**

1. Create pocket, make deposit with category
2. Go to home page → Gastos tab
3. Find the linked movement → verify shows "📥 {pocket_name}" instead of payment method
4. Try to edit → verify blocked with message
5. Delete → verify confirmation modal mentions pocket cascade

- [ ] **Step 5: Commit**

```bash
git add frontend/pages/home.js
git commit -m "feat: show pocket source in Gastos tab, block editing, and cascade delete confirmation"
```

---

## Task 15: E2E Tests with Playwright

**Files:**
- Create: `backend/tests/e2e/pockets.js`
- Modify: `backend/tests/package.json`

- [ ] **Step 1: Create E2E test file**

Create `backend/tests/e2e/pockets.js` (NOT `.spec.js` — follow existing naming convention) following the pattern from `household-management.js`:

- Use Playwright for browser automation
- Use `pg` Pool for direct database setup/teardown
- Test flow:
  1. Register user and create household (or use existing test helper)
  2. Create an account (via API or UI)
  3. Create a category (via API or DB)
  4. Navigate to `/ahorros` → verify empty state
  5. Create pocket via FAB + modal → verify appears in grid
  6. Click pocket → verify detail view loads
  7. Deposit from account → verify balance updates, transaction appears
  8. Navigate to home → verify movement in Gastos with "📥" icon
  9. Verify edit is blocked on pocket-linked movement in Gastos
  10. Navigate back to ahorros detail → withdraw → verify balance
  11. Attempt overdraft → verify error message
  12. Edit transaction → verify amount updated
  13. Delete transaction → verify confirmation modal, cascade
  14. Edit pocket config → verify saved
  15. Delete pocket → verify force confirmation if balance > 0
  16. Cleanup: delete test data from DB

- [ ] **Step 2: Add npm scripts**

In `backend/tests/package.json`, add to `scripts`:
```json
"test:pockets": "node e2e/pockets.js"
```

Also append `&& node e2e/pockets.js` to the existing `test:e2e` script.

- [ ] **Step 3: Run E2E tests**

```bash
cd backend/tests && npm run test:pockets
```
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add backend/tests/e2e/pockets.js backend/tests/package.json
git commit -m "test: add E2E Playwright tests for pockets feature"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && go test ./...
cd backend && go test -race ./...
```
Expected: All pass

- [ ] **Step 2: Run integration tests**

```bash
cd backend/tests/api-integration && ./test-pockets.sh
```
Expected: All pass

- [ ] **Step 3: Run E2E tests**

```bash
cd backend/tests && npm run test:pockets
```
Expected: All pass

- [ ] **Step 4: Full build verification**

```bash
cd backend && go build ./...
```
Expected: Success

- [ ] **Step 5: Final manual smoke test**

Full end-to-end flow:
1. Create pocket → appears in list with 0 balance
2. Deposit $100,000 → pocket balance $100,000, account balance -$100,000, movement in Gastos
3. Edit deposit to $150,000 → both pocket and Gastos movement updated
4. Withdraw $50,000 → pocket balance $100,000, account balance -$100,000
5. Attempt withdraw $200,000 → error (insufficient)
6. In Gastos tab → pocket movement shows "📥", edit blocked, delete shows cascade warning
7. Delete deposit from Ahorros → movement gone from Gastos too
8. Delete pocket → works (balance is 0 after deletion of deposit)

- [ ] **Step 6: Commit any fixes**

If any fixes were needed during verification, commit them.

---

## Phase 2 Tasks (separate implementation cycle)

Phase 2 ("Pagar desde bolsillo") is intentionally deferred. It builds on Phase 1 and includes:
- Task P2-1: Add `SpendFromPocket` method to pockets service + `HandleSpend` handler
- Task P2-2: Wire `/api/pockets/{id}/spend` route in server.go
- Task P2-3: Add `Pockets` field to `FormConfigResponse` in movements handler
- Task P2-4: Frontend — "Desde bolsillo" dropdown in `registrar-movimiento.js`
- Task P2-5: Integration + E2E tests for spend-from-pocket flow

These tasks will be planned in a separate document after Phase 1 is complete and verified.
