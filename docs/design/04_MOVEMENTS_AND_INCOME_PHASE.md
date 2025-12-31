# Phase 4: Movement Registration Split & Income Tracking

> **Status:** 📋 PLANNED
>
> This phase describes the restructuring of movement registration into two focused flows (Gastos and Préstamos) and the introduction of income tracking.

**Architecture:**

- Authentication: PostgreSQL + Go backend
- Households & Payment Methods: PostgreSQL + Go backend  
- Movement storage: n8n → Google Sheets (current, will migrate to PostgreSQL later)
- Income storage: PostgreSQL + Go backend (new)

**Relationship to other phases:**

- See `01_AUTH_PHASE.md` for authentication implementation
- See `02_HOUSEHOLD_PHASE.md` for household/members/contacts management
- See `03_PAYMENT_METHODS_PHASE.md` for payment methods
- See `00_N8N_PHASE.md` for current movement registration (being split)
- See `FUTURE_VISION.md` for long-term product direction

---

## 🎯 Goals

### Primary Goals

1. **Split movement registration into two focused flows:**
   - `/gastos`: For household expenses (FAMILIAR) and shared expenses (COMPARTIDO)
   - `/prestamos`: For loans and loan payments (simplified UX for COMPARTIDO + PAGO_DEUDA)

2. **Introduce income tracking:**
   - Allow household members to register monthly income
   - Associate income with debit payment methods
   - Enable future cash flow analysis (Phase 5)

### Why This Change?

**Current problem:**
- Single `/registrar-movimiento` page tries to handle 3 different mental models:
  - Household expenses (groceries, rent, utilities)
  - Shared/split expenses (dinner with friends)
  - Loans (lending/borrowing money)
  
**User confusion:**
- "I just want to lend money to someone" → forced to think about "participants" and "percentages"
- "I'm paying back a loan" → mixed with general debt payments
- Mental model mismatch reduces clarity and increases friction

**Solution:**
- Two separate, focused UIs that match user intent
- Same underlying data model (no DB changes needed)
- Simpler, clearer user experience

---

## 📊 Movement Registration Split

### High-Level Approach

**No database changes** - Only UX reorganization:

| Movement Type in DB | Old UI                  | New UI         | Notes                                    |
| ------------------- | ----------------------- | -------------- | ---------------------------------------- |
| `FAMILIAR`          | `/registrar-movimiento` | `/gastos`      | Household expense (groceries, rent, etc) |
| `COMPARTIDO`        | `/registrar-movimiento` | `/gastos`      | Split expense (dinner, trip, etc)        |
| `COMPARTIDO` (100%) | `/registrar-movimiento` | `/prestamos`   | Loan (one participant at 100%)           |
| `PAGO_DEUDA`        | `/registrar-movimiento` | `/prestamos`   | Loan payment or debt settlement          |

**Key principle:** Same data model, different user journeys.

---

## 🏗️ Page 1: `/gastos` (Household & Shared Expenses)

### Purpose

Register expenses that are either:
- **FAMILIAR**: Household expenses paid by one person for the household
- **COMPARTIDO**: Expenses shared/split among multiple people

### UI Flow

#### Step 1: Choose Expense Type

```
┌─────────────────────────────────────────┐
│         Registrar Gasto                 │
├─────────────────────────────────────────┤
│ ¿Qué tipo de gasto es?                  │
│                                         │
│ ○ Gasto del hogar                       │
│   Pagado por un miembro para el hogar   │
│   (ej: mercado, arriendo, servicios)    │
│                                         │
│ ○ Gasto compartido                      │
│   Dividido entre varias personas        │
│   (ej: cena, viaje, regalo)             │
└─────────────────────────────────────────┘
```

#### Step 2a: FAMILIAR (Household Expense)

```
┌─────────────────────────────────────────┐
│         Gasto del Hogar                 │
├─────────────────────────────────────────┤
│ Monto: _____________ COP                │
│ Descripción: ______________________     │
│ Método de pago: [Dropdown]              │
│ Categoría: [Dropdown] (required)        │
│ Fecha: [Date picker]                    │
│                                         │
│         [Guardar]  [Cancelar]           │
└─────────────────────────────────────────┘
```

**Fields:**
- **Tipo** = `FAMILIAR` (hidden, set automatically)
- **Monto** (required)
- **Descripción** (required)
- **Método de pago** (required) - Only household payment methods
- **Categoría** (required) - All categories EXCEPT "Préstamo"
- **Fecha** (defaults to today)

**Hidden fields** (auto-filled):
- **Pagador** = Current logged-in user
- **Mes** = YYYY-MM (computed)
- **Semana** = YYYY-W## (computed)

#### Step 2b: COMPARTIDO (Shared Expense)

```
┌─────────────────────────────────────────┐
│        Gasto Compartido                 │
├─────────────────────────────────────────┤
│ Monto: _____________ COP                │
│ Descripción: ______________________     │
│ ¿Quién pagó?: [Dropdown]                │
│ Método de pago: [Dropdown] (if Jose/Caro)│
│ Fecha: [Date picker]                    │
│                                         │
│ ¿Cómo dividir el gasto?                 │
│ ○ Equitativamente entre todos           │
│ ○ Por porcentajes                       │
│                                         │
│ Participantes:                          │
│ ☑ Jose      [____%] (if percentages)    │
│ ☑ Caro      [____%]                     │
│ ☐ Daniel    [____%]                     │
│ ...                                     │
│                                         │
│ Total: 100% ✓                           │
│                                         │
│         [Guardar]  [Cancelar]           │
└─────────────────────────────────────────┘
```

**Fields:**
- **Tipo** = `COMPARTIDO` (hidden, set automatically)
- **Monto** (required)
- **Descripción** (required)
- **Pagador** (required) - Household members + contacts
- **Método de pago** (conditional) - Only if Pagador is household member
- **Participantes** (required, min 2) - Cannot select payer as participant
- **División** - Equitativa (default) or Porcentajes
- **Fecha** (defaults to today)

**Validation:**
- At least 2 participants (excluding payer)
- If porcentajes: sum must equal 100%
- Cannot have payer as participant (auto-excluded)

**Hidden fields:**
- **Categoría** = Empty (shared expenses don't use categories)
- **Mes** = YYYY-MM (computed)
- **Semana** = YYYY-W## (computed)

**Note on participants:**
When pagador changes, participants list resets (current behavior, keep as-is).

---

## 🏗️ Page 2: `/prestamos` (Loans & Loan Payments)

### Purpose

Register financial transactions between people:
- **Préstamos**: Lending money to someone
- **Pagos de préstamo**: Receiving loan payment or paying back a loan

### UI Flow

#### Step 1: Choose Transaction Type

```
┌─────────────────────────────────────────┐
│         Préstamos                       │
├─────────────────────────────────────────┤
│ ¿Qué quieres registrar?                 │
│                                         │
│ ○ Hacer un préstamo                     │
│   Le prestas dinero a alguien           │
│                                         │
│ ○ Pagar un préstamo                     │
│   Pagas o recibes pago de préstamo      │
└─────────────────────────────────────────┘
```

#### Step 2a: Hacer Préstamo (Lend Money)

```
┌─────────────────────────────────────────┐
│         Hacer Préstamo                  │
├─────────────────────────────────────────┤
│ ¿A quién le prestas?: [Dropdown]        │
│ Monto: _____________ COP                │
│ Descripción: ______________________     │
│ Método de pago: [Dropdown]              │
│ Fecha: [Date picker]                    │
│                                         │
│         [Guardar]  [Cancelar]           │
└─────────────────────────────────────────┘
```

**Backend mapping:**
- **Tipo** = `COMPARTIDO`
- **Pagador** = Current logged-in user
- **Método de pago** = Selected payment method
- **Participantes** = Selected person at 100%
- **Categoría** = "Préstamo" (auto-set)
- **Monto** = Entered amount
- **Descripción** = Entered description
- **Fecha** = Selected date

**Fields:**
- **A quién** (required) - Household members + contacts (excluding self)
- **Monto** (required)
- **Descripción** (required)
- **Método de pago** (required)
- **Fecha** (defaults to today)

**Hidden fields** (auto-filled):
- **Tipo** = `COMPARTIDO`
- **Pagador** = Logged-in user
- **Participantes** = [Selected person: 100%]
- **Categoría** = "Préstamo"
- **Mes** = YYYY-MM (computed)
- **Semana** = YYYY-W## (computed)

#### Step 2b: Pagar Préstamo (Loan Payment)

```
┌─────────────────────────────────────────┐
│       Pagar/Recibir Préstamo            │
├─────────────────────────────────────────┤
│ ¿Quién paga?:    [Dropdown - Pagador]   │
│ ¿A quién le paga?: [Dropdown - Tomador] │
│ Monto: _____________ COP                │
│ Descripción: ______________________     │
│ Método de pago: [Dropdown] (conditional)│
│ Fecha: [Date picker]                    │
│                                         │
│         [Guardar]  [Cancelar]           │
└─────────────────────────────────────────┘
```

**Backend mapping:**
- **Tipo** = `PAGO_DEUDA`
- **Pagador** = Selected payer
- **Contraparte** = Selected recipient
- **Método de pago** = Selected payment method (if payer is household member)
- **Categoría** = "Préstamo" (if payer is household member)
- **Monto** = Entered amount
- **Descripción** = Entered description
- **Fecha** = Selected date

**Fields:**
- **Pagador** (required) - Household members + contacts
- **Tomador** (required) - Household members + contacts (cannot be same as Pagador)
- **Monto** (required)
- **Descripción** (required)
- **Método de pago** (conditional) - Only if Pagador is household member
- **Fecha** (defaults to today)

**Validation:**
- Pagador ≠ Contraparte (cannot pay yourself)

**Hidden fields:**
- **Tipo** = `PAGO_DEUDA`
- **Categoría** = "Préstamo" (if pagador is household member), else empty
- **Mes** = YYYY-MM (computed)
- **Semana** = YYYY-W## (computed)

**Direction semantics** (same as current):
- If `Pagador = me` → I'm paying (cash-out)
- If `Contraparte = me` → I'm receiving payment (cash-in)

---

## 💰 Income Tracking

### Overview

Allow household members to register income throughout the month to enable future cash flow analysis and answer the question: "Can I cover my credit card and loan payments this month?"

### Core Concepts

**Who can register income?**
- Only household members (not external contacts)

**When?**
- Multiple income entries per member per month
- Examples: salary, bonus, freelance payment, gift, etc.

**Where does income go?**
- Income is associated with a debit payment method
- This represents where the money is deposited

### Open Design Question ⚠️

**DECISION NEEDED BEFORE IMPLEMENTATION:**

Should income be tied to existing payment methods or separate accounts?

**Option A: Use existing debit payment methods**
- ✅ Simpler - reuse existing infrastructure
- ✅ Realistic - salary goes to debit account
- ❌ Requires users to have at least one debit payment method
- ❌ Confusion: "payment method" vs "account where income arrives"
- ❌ Debit card ≠ bank account (conceptually different but practically same)

**Option B: Separate "accounts" concept**
- ✅ Clearer separation: accounts receive income, payment methods spend it
- ✅ More aligned with FUTURE_VISION.md (Section 4.5 - Accounts)
- ✅ Natural evolution path
- ❌ More complex - new entity type
- ❌ Need to link accounts ↔ payment methods eventually
- ❌ Duplication risk (same debit account appears twice)

**Recommendation:**
- Start with **Option A** (use debit payment methods) for speed
- Validate with users
- Migrate to **Option B** (separate accounts) when moving to PostgreSQL
- This is a good time to make the decision since we're about to migrate movements to PostgreSQL

**For this phase:** Proceed with Option A unless decided otherwise before implementation.

---

### Database Schema (PostgreSQL)

```sql
-- New table: income
CREATE TABLE income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    description VARCHAR(255) NOT NULL,
    income_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT income_positive_amount CHECK (amount > 0)
);

-- Indexes
CREATE INDEX idx_income_household ON income(household_id);
CREATE INDEX idx_income_member ON income(member_id);
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

-- Ensure payment method is debit type
-- NOTE: This assumes payment_methods has a 'type' field
-- If not, skip this constraint for now
ALTER TABLE income
ADD CONSTRAINT income_payment_method_is_debit
CHECK (
    EXISTS (
        SELECT 1 FROM payment_methods
        WHERE id = income.payment_method_id
        AND type = 'debit_card'
    )
);
```

### API Endpoints

#### Create Income

```
POST /api/households/:household_id/income
```

**Request:**
```json
{
  "member_id": "uuid",
  "payment_method_id": "uuid",
  "amount": 5000000,
  "description": "Salario Enero 2025",
  "income_date": "2025-01-15"
}
```

**Validation:**
- User must be household member or owner
- Member must belong to household
- Payment method must exist and belong to household
- Payment method must be type `debit_card`
- Amount must be positive
- Income date required

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "household_id": "uuid",
  "member_id": "uuid",
  "payment_method_id": "uuid",
  "amount": 5000000,
  "description": "Salario Enero 2025",
  "income_date": "2025-01-15",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}
```

#### List Income

```
GET /api/households/:household_id/income
GET /api/households/:household_id/income?member_id=uuid
GET /api/households/:household_id/income?month=2025-01
```

**Query params:**
- `member_id` (optional) - Filter by specific member
- `month` (optional) - Filter by month (YYYY-MM format)
- `start_date` (optional) - Filter by date range start
- `end_date` (optional) - Filter by date range end

**Authorization:**
- User must be household member

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "household_id": "uuid",
    "member_id": "uuid",
    "member_name": "Jose",
    "payment_method_id": "uuid",
    "payment_method_name": "Débito Jose",
    "amount": 5000000,
    "description": "Salario Enero 2025",
    "income_date": "2025-01-15",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  }
]
```

#### Update Income

```
PATCH /api/households/:household_id/income/:id
```

**Request:**
```json
{
  "payment_method_id": "uuid",  // optional
  "amount": 5200000,             // optional
  "description": "Salario + Bono", // optional
  "income_date": "2025-01-15"    // optional
}
```

**Authorization:**
- User must be household member
- Can only update income records for their household

**Response:** `200 OK` (same format as create)

#### Delete Income

```
DELETE /api/households/:household_id/income/:id
```

**Authorization:**
- User must be household member
- Can only delete income records for their household

**Response:** `204 No Content`

### Frontend UI

#### Navigation

Add new link in household menu/profile:

```
Mi Hogar
  ├── Detalles del hogar
  ├── Métodos de pago
  └── Ingresos del mes      ← NEW
```

#### Income Registration Page

```
┌─────────────────────────────────────────┐
│         Ingresos del Mes                │
├─────────────────────────────────────────┤
│ Mes: Enero 2025                         │
│                                         │
│ [+ Agregar ingreso]                     │
│                                         │
│ Ingresos registrados (3):               │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ Jose - Salario                    │   │
│ │ $5,000,000 → Débito Jose          │   │
│ │ 15 Ene 2025          [Editar] [X] │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ Jose - Freelance                  │   │
│ │ $800,000 → Débito Jose            │   │
│ │ 22 Ene 2025          [Editar] [X] │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ Caro - Salario                    │   │
│ │ $4,500,000 → Débito Caro          │   │
│ │ 30 Ene 2025          [Editar] [X] │   │
│ └───────────────────────────────────┘   │
│                                         │
│ Total del hogar: $10,300,000            │
└─────────────────────────────────────────┘
```

#### Add/Edit Income Form

```
┌─────────────────────────────────────────┐
│         Agregar Ingreso                 │
├─────────────────────────────────────────┤
│ ¿Para quién?: [Dropdown - Members only] │
│ Monto: _____________ COP                │
│ Descripción: ______________________     │
│ Cuenta destino: [Dropdown - Debit only] │
│ Fecha: [Date picker]                    │
│                                         │
│         [Guardar]  [Cancelar]           │
└─────────────────────────────────────────┘
```

**Fields:**
- **Miembro** (required) - Only household members
- **Monto** (required, positive number)
- **Descripción** (required)
- **Cuenta destino** (required) - Only debit payment methods from household
- **Fecha** (required, defaults to today)

**Validation:**
- Amount must be positive
- Only debit payment methods allowed
- Date cannot be in the future (optional, can allow future income)

---

## 🔄 Migration Plan

### Phase 4.1: Split Movement Registration

**Week 1-2:**
1. Create new page `/gastos`
   - Implement FAMILIAR flow
   - Implement COMPARTIDO flow
   - Keep same backend (n8n webhook)
   - Reuse existing components/logic

2. Create new page `/prestamos`
   - Implement "Hacer préstamo" flow (→ COMPARTIDO)
   - Implement "Pagar préstamo" flow (→ PAGO_DEUDA)
   - Keep same backend (n8n webhook)
   - Auto-set Categoría = "Préstamo"

3. Update navigation
   - Add links to `/gastos` and `/prestamos`
   - Keep `/registrar-movimiento` for backwards compatibility (with deprecation notice)
   - Or immediately redirect `/registrar-movimiento` → `/gastos`

4. Update categories list
   - Remove "Préstamo" from FAMILIAR and COMPARTIDO dropdowns
   - Keep "Préstamo" category in backend (used by `/prestamos`)

**Testing:**
- Verify n8n webhook receives correct data for all flows
- Verify Google Sheets has correct Tipo, Categoría, Participantes
- Test edge cases (changing pagador, percentage validation, etc.)

### Phase 4.2: Income Tracking

**Week 3-4:**
1. Backend implementation
   - Create migration for `income` table
   - Implement service layer (create, list, update, delete)
   - Implement HTTP handlers
   - Add routes to server
   - Add validation (member in household, debit-only, etc.)

2. Frontend implementation
   - Create `/ingresos` page
   - List income entries (filterable by month)
   - Add/edit income form
   - Delete income
   - Show monthly total

3. Integration
   - Add link in household menu
   - Test CRUD operations
   - Verify only household members can access
   - Verify payment method filtering (debit only)

**Testing:**
- Unit tests for service layer
- E2E tests for API endpoints
- Frontend integration tests
- Multi-household isolation tests

---

## 📋 Category Changes

### Current Categories (from 00_N8N_PHASE.md)

Remove "Préstamo" from user-selectable categories in `/gastos` and `/registrar-movimiento`:

```diff
- Préstamo                              ← REMOVE from FAMILIAR/COMPARTIDO dropdowns
+ (Still exists in backend, auto-used by /prestamos)
```

### Updated Category Rules

| Movement Flow     | Category Behavior                                |
| ----------------- | ------------------------------------------------ |
| `/gastos` → FAMILIAR | Required, dropdown (all except "Préstamo")    |
| `/gastos` → COMPARTIDO | Not used (empty)                             |
| `/prestamos` → Préstamo | Auto-set to "Préstamo" (hidden)             |
| `/prestamos` → Pago     | Auto-set to "Préstamo" if household member   |

---

## 🎨 UX Principles

### Simplicity
- Each page has ONE clear purpose
- Minimal cognitive load
- Hide complexity when not needed

### Consistency
- Same visual language across all pages
- Reuse components (dropdowns, date picker, amount input)
- Consistent validation messages

### Progressive Disclosure
- Show fields only when relevant
- Default to most common case (equitative split, today's date)
- Advanced options available but not prominent

### Mobile-First
- All forms work well on mobile
- Large touch targets
- Minimal typing required (dropdowns over text input)

---

## 🚀 Future Enhancements (Phase 5+)

### Cash Flow Analysis

With income tracking in place, future phases can implement:

**Monthly Balance Dashboard:**
```
Enero 2025
──────────────────────────────
Ingresos:           $10,300,000
Gastos con crédito:  -$2,500,000
Préstamos por pagar:   -$800,000
──────────────────────────────
Balance proyectado:  $7,000,000 ✓
```

**Indicators:**
- ✅ Green: Income covers expenses + loans
- ⚠️ Yellow: Tight, but manageable
- ❌ Red: Shortfall, need to adjust

**Projections:**
- "Based on this month's spending, will you be able to pay your credit cards?"
- "You have $X available after loan payments"
- "You're short $X for this month's obligations"

### Account Abstraction

Migrate from "payment methods" to "accounts + payment methods":
- **Accounts**: Where money lives (bank account, cash)
- **Payment Methods**: How you spend (debit card, credit card linked to account)
- Income → Accounts
- Expenses → Payment Methods → Accounts

### Recurring Income

- Mark income as "recurring" (monthly salary)
- Auto-suggest based on previous months
- One-click to register this month's salary

---

## 📚 Related Documentation

- `FUTURE_VISION.md` - Section 4.4 (Credit Cards & Cash Reality)
- `00_N8N_PHASE.md` - Current movement registration implementation
- `03_PAYMENT_METHODS_PHASE.md` - Payment methods management

---

## ✅ Success Criteria

### Phase 4.1 (Movement Split)
- [ ] `/gastos` page functional for FAMILIAR and COMPARTIDO
- [ ] `/prestamos` page functional for loans and payments
- [ ] Both pages write to n8n webhook correctly
- [ ] No regressions in existing movement registration
- [ ] "Préstamo" category removed from user-facing dropdowns
- [ ] UI is mobile-friendly and accessible

### Phase 4.2 (Income Tracking)
- [ ] Income CRUD operations working
- [ ] Only household members can register income
- [ ] Only debit payment methods selectable
- [ ] Monthly filtering working
- [ ] Total calculations correct
- [ ] Multi-household isolation verified

---

## 🤔 Open Questions

1. **Account vs Payment Method for Income** ⚠️ NEEDS DECISION
   - Use existing debit payment methods?
   - Or introduce separate "accounts" concept?
   - Decision impacts schema and migration complexity

2. **Income Date Validation**
   - Allow future dates (planned income)?
   - Or restrict to past/present only?

3. **Bulk Income Import**
   - Support importing multiple income entries at once?
   - Or one-by-one is sufficient?

4. **Income Categories**
   - Should income have categories (Salary, Freelance, Gift)?
   - Or just free-text description?

5. **Income Visibility**
   - Can all household members see everyone's income?
   - Or only owner can see?
   - Current assumption: all members can see (transparency principle)

---

## 🔧 Technical Notes

### n8n Webhook (Unchanged)

Both `/gastos` and `/prestamos` continue using:
```
POST https://n8n.blanquicet.com.co/webhook/movimientos/reportar
```

Same payload structure as current `/registrar-movimiento`.

### Routing

Update `staticwebapp.config.json` or router.js to handle:
- `/gastos`
- `/prestamos`
- `/ingresos`

### Component Reuse

Extract shared components:
- `AmountInput` - Currency input with COP formatting
- `DatePicker` - Date selection
- `ParticipantSelector` - Multi-select for participants
- `PaymentMethodDropdown` - Filter by type, household
- `CategoryDropdown` - Dynamic based on context

---

## 📝 Implementation Checklist

### Phase 4.1: Movement Split

**Backend:**
- [ ] No changes needed (uses existing n8n webhook)

**Frontend:**
- [ ] Create `/gastos` page
  - [ ] FAMILIAR flow
  - [ ] COMPARTIDO flow
  - [ ] Form validation
  - [ ] Success/error handling
- [ ] Create `/prestamos` page
  - [ ] "Hacer préstamo" flow
  - [ ] "Pagar préstamo" flow
  - [ ] Auto-set Categoría = "Préstamo"
  - [ ] Form validation
- [ ] Update category dropdown (remove "Préstamo" for user selection)
- [ ] Update navigation/menu
- [ ] Mobile responsive design
- [ ] Handle `/registrar-movimiento` (redirect or deprecation notice)

**Testing:**
- [ ] E2E tests for `/gastos` flows
- [ ] E2E tests for `/prestamos` flows
- [ ] Verify n8n receives correct data
- [ ] Verify Google Sheets updates correctly

### Phase 4.2: Income Tracking

**Database:**
- [ ] Create migration for `income` table
- [ ] Add indexes
- [ ] Add constraints

**Backend:**
- [ ] Income repository (CRUD)
- [ ] Income service (business logic)
- [ ] Income HTTP handlers
- [ ] Add routes to server
- [ ] Validation logic
- [ ] Authorization checks

**Frontend:**
- [ ] Create `/ingresos` page
- [ ] List income entries
- [ ] Filter by month
- [ ] Add/edit income form
- [ ] Delete income
- [ ] Show monthly total
- [ ] Payment method dropdown (debit only)
- [ ] Mobile responsive design

**Testing:**
- [ ] Unit tests for repository
- [ ] Unit tests for service
- [ ] HTTP handler tests
- [ ] E2E API tests
- [ ] Frontend integration tests
- [ ] Multi-household isolation tests

**Documentation:**
- [ ] API documentation
- [ ] User guide
- [ ] Update FUTURE_VISION.md if needed

---

## 🎯 Summary

This phase improves UX clarity by:
1. **Splitting movement registration** into two focused flows (Gastos vs Préstamos)
2. **Introducing income tracking** to enable future cash flow analysis
3. **Maintaining data compatibility** with current n8n/Google Sheets backend
4. **Setting foundation** for Phase 5 (cash reality checks and balance projections)

The changes are primarily UX improvements with minimal backend changes (only income tracking requires new PostgreSQL tables). This allows rapid implementation while maintaining stability.
