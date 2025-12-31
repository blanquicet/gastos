# Payment Methods & Dynamic Movement Configuration

> **Current Status:** 📋 PLANNED
>
> This phase introduces payment methods management and dynamic user/contact lists
> for the movement registration form, replacing hardcoded values with data from
> the household context.

**Architecture:**

- Authentication & Households: PostgreSQL (see `01_AUTH_PHASE.md`, `02_HOUSEHOLD_PHASE.md`)
- Movement storage: n8n → Google Sheets (unchanged from `00_N8N_PHASE.md`)
- **NEW:** Payment methods → PostgreSQL
- **NEW:** Dynamic users list from household members + contacts

**Relationship to other phases:**

- Builds on top of `02_HOUSEHOLD_PHASE.md` (household & contacts required)
- Prepares foundation for Phase 4 (shared movements with cross-household sync)
- See `FUTURE_VISION.md` sections 4.5, 5 for full context

---

## 🎯 Goals

1. **Replace hardcoded users with household data**
   - `DEFAULT_USERS` → Household members + Active contacts
   - `PRIMARY_USERS` → Household members only
   - Dynamic dropdown population based on user's household

2. **Payment methods management**
   - Users can create/edit/delete payment methods
   - Payment methods belong to a user (owner)
   - Can be shared with entire household (visible/usable by all members)
   - Replaces hardcoded `PAYMENT_METHODS` array

3. **Contact activation/deactivation**
   - Contacts can be marked as "active" or "inactive"
   - Only active contacts appear in movement dropdowns
   - Prevents dropdown from getting too long with one-off contacts
   - All contacts still visible in household management page

4. **Categories remain hardcoded (for now)**
   - Categories will be customizable per household in Phase 4
   - For now, keep the current `CATEGORIES` array

---

## 📊 Data Model

### New Tables

#### `payment_methods`

Represents payment methods (credit cards, bank accounts, cash, etc.)

```sql
CREATE TYPE payment_method_type AS ENUM (
  'credit_card',
  'debit_card',
  'bank_account',
  'cash',
  'digital_wallet',
  'other'
);

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  type payment_method_type NOT NULL,

  -- Sharing
  is_shared_with_household BOOLEAN NOT NULL DEFAULT FALSE,

  -- Optional metadata
  last4 VARCHAR(4), -- Last 4 digits of card/account
  institution VARCHAR(100), -- Bank name, card issuer, wallet provider
  notes TEXT,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: prevent duplicate names per household
  UNIQUE(household_id, name)
);

CREATE INDEX idx_payment_methods_household ON payment_methods(household_id);
CREATE INDEX idx_payment_methods_owner ON payment_methods(owner_id);
CREATE INDEX idx_payment_methods_active ON payment_methods(is_active) WHERE is_active = TRUE;
```

**Business rules:**

- **Owner**: The user who created/owns the payment method
- **Shared**: If `is_shared_with_household = TRUE`, all household members can:
  - See it in their payment method dropdowns
  - Use it to register movements (pagador field)
  - View it in the payment methods list
- **Shared**: If `is_shared_with_household = FALSE`, only the owner can use it
- **Active**: Only active payment methods appear in dropdowns
- **Deletion**: Owner can delete their own payment methods
  - If the payment method was used in past movements (Google Sheets), deletion is logical (is_active = FALSE)
  - In future phases with movement history in DB, we'll add validation

**Examples:**

```
Owner: Jose
Name: "Débito Jose"
Type: debit_card
Shared: TRUE → Caro can use it to register movements paid by Caro with Jose's debit card

Owner: Caro
Name: "Nu Caro"
Type: credit_card
Shared: TRUE → Jose can use it to register movements paid by Jose with Caro's credit card

Owner: Jose
Name: "AMEX Personal"
Type: credit_card
Shared: FALSE → Only Jose can use it (Caro doesn't see it in her payment methods list)
```

### Modified Tables

#### `contacts` - Add `is_active` field

```sql
ALTER TABLE contacts
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_contacts_active ON contacts(is_active) WHERE is_active = TRUE;
```

**Business rules:**

- **Active contacts**: Appear in movement registration dropdowns
- **Inactive contacts**:
  - Still visible in household management page (with visual indicator)
  - Can be reactivated at any time
  - Do NOT appear in movement dropdowns
  - Useful for one-off contacts (vacation trip buddy, one-time transaction)

**Use case:**
```
Jose adds "Pedro" as contact for a weekend trip
They split expenses during the trip
After trip ends, Jose marks Pedro as "inactive"
Pedro no longer clutters the dropdown in daily movements
If they travel again, Jose can reactivate Pedro
```

---

## 🔌 Backend API

### Payment Methods Endpoints

#### Create payment method
```
POST /api/payment-methods
Authorization: Bearer <token>

Body:
{
  "name": "Débito Jose",
  "type": "debit_card",
  "is_shared_with_household": true,
  "last4": "1234",
  "institution": "Banco de Bogotá",
  "notes": "Cuenta principal"
}

Response 201:
{
  "id": "uuid",
  "household_id": "uuid",
  "owner_id": "uuid",
  "name": "Débito Jose",
  "type": "debit_card",
  "is_shared_with_household": true,
  "last4": "1234",
  "institution": "Banco de Bogotá",
  "notes": "Cuenta principal",
  "is_active": true,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}

Errors:
400 - Missing required fields, invalid type
409 - Payment method with that name already exists in household
404 - User has no household
```

**Business logic:**
- User must belong to a household
- Automatically set `household_id` from user's household
- Automatically set `owner_id` from authenticated user
- Validate `name` is unique within household
- Validate `type` is valid enum value

#### List payment methods
```
GET /api/payment-methods
Authorization: Bearer <token>

Response 200:
[
  {
    "id": "uuid",
    "name": "Débito Jose",
    "type": "debit_card",
    "owner_id": "uuid",
    "owner_name": "Jose Test",
    "is_shared_with_household": true,
    "last4": "1234",
    "institution": "Banco de Bogotá",
    "is_active": true
  },
  ...
]

Errors:
404 - User has no household
```

**Business logic:**
- Return all payment methods for user's household WHERE:
  - `owner_id = current_user.id` (own methods) OR
  - `is_shared_with_household = TRUE` (shared by others)
- Include owner name for each method (join with users table)
- Order by: shared first, then by name

#### Update payment method
```
PATCH /api/payment-methods/:id
Authorization: Bearer <token>

Body (all fields optional):
{
  "name": "Débito Jose Principal",
  "is_shared_with_household": false,
  "is_active": true,
  "notes": "Updated notes"
}

Response 200:
{
  "id": "uuid",
  ...updated fields
}

Errors:
404 - Payment method not found
403 - Not the owner
409 - Name already exists in household
```

**Business logic:**
- Only owner can update
- Cannot change `type`, `owner_id`, `household_id`
- Validate name uniqueness if name is being changed

#### Delete payment method
```
DELETE /api/payment-methods/:id
Authorization: Bearer <token>

Response 204: (no content)

Errors:
404 - Payment method not found
403 - Not the owner
```

**Business logic:**
- Only owner can delete
- For Phase 3: hard delete (movements only in Google Sheets)
- For future phases: soft delete if referenced in movements table

### Contact Activation Endpoint

#### Update contact active status
```
PATCH /api/contacts/:id
Authorization: Bearer <token>

Body:
{
  "is_active": false
}

Response 200:
{
  "id": "uuid",
  "name": "Pedro",
  "email": "pedro@example.com",
  "is_active": false,
  ...
}

Errors:
404 - Contact not found
403 - Contact doesn't belong to user's household
```

**Business logic:**
- Only household members can update contacts
- Can toggle `is_active` between true/false
- Other fields updated via existing PATCH /api/contacts/:id endpoint

### Movement Form Data Endpoint

#### Get movement form configuration
```
GET /api/movement-form-config
Authorization: Bearer <token>

Response 200:
{
  "users": [
    {
      "id": "uuid",
      "name": "Jose",
      "type": "member",
      "is_primary": true
    },
    {
      "id": "uuid",
      "name": "Caro",
      "type": "member",
      "is_primary": true
    },
    {
      "id": "uuid",
      "name": "Maria Isabel",
      "type": "contact",
      "is_primary": false,
      "has_account": false
    },
    ...
  ],
  "payment_methods": [
    {
      "id": "uuid",
      "name": "Débito Jose",
      "type": "debit_card",
      "owner_name": "Jose"
    },
    ...
  ],
  "categories": [
    "Mercado",
    "Uber/Gasolina/Peajes/Parqueaderos",
    ...
  ]
}

Errors:
404 - User has no household
```

**Business logic:**

**Users list:**
- Household members (type: "member", is_primary: true)
- Active contacts only (type: "contact", is_primary: false)
- Ordered: members first, then contacts alphabetically

**Payment methods:**
- Own payment methods OR shared payment methods
- Active only
- Ordered: owner's methods first, then shared, alphabetically

**Categories:**
- Hardcoded for now (from backend configuration)
- Future: per-household customizable categories

---

## 🎨 Frontend Implementation

### Step 1: Payment Methods Management UI

**Location:** Add new page `/payment-methods` (accessed from profile)

**UI Components:**

1. **Payment Methods List**
   ```
   ┌─────────────────────────────────────────┐
   │ Métodos de pago                         │
   │                                         │
   │ + Agregar método de pago                │
   │                                         │
   │ ┌─────────────────────────────────────┐ │
   │ │ 💳 Débito Jose                      │ │
   │ │ Tarjeta Débito • ****1234           │ │
   │ │ 👥 Compartido con el hogar          │ │
   │ │ [Editar] [Desactivar]               │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ ┌─────────────────────────────────────┐ │
   │ │ 💳 Nu Caro                          │ │
   │ │ Tarjeta de Crédito • ****5678       │ │
   │ │ 👤 Personal (Caro)                  │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ ┌─────────────────────────────────────┐ │
   │ │ 💵 Efectivo                         │ │
   │ │ Efectivo                            │ │
   │ │ 👥 Compartido con el hogar          │ │
   │ │ [Editar] [Desactivar]               │ │
   │ └─────────────────────────────────────┘ │
   └─────────────────────────────────────────┘
   ```

2. **Add/Edit Payment Method Form**
   ```
   ┌─────────────────────────────────────────┐
   │ Agregar método de pago                  │
   │                                         │
   │ Nombre *                                │
   │ ┌─────────────────────────────────────┐ │
   │ │ Ej: AMEX Jose                       │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ Tipo *                                  │
   │ ┌─────────────────────────────────────┐ │
   │ │ ▾ Tarjeta de débito                 │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ Últimos 4 dígitos (opcional)            │
   │ ┌─────────────────────────────────────┐ │
   │ │ 1234                                │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ Banco/Institución (opcional)            │
   │ ┌─────────────────────────────────────┐ │
   │ │ Bancolombia                         │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ ☐ Compartir con el hogar                │
   │                                         │
   │ Notas (opcional)                        │
   │ ┌─────────────────────────────────────┐ │
   │ │ Tarjeta principal                   │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ [Guardar] [Cancelar]                    │
   └─────────────────────────────────────────┘
   ```

**Validation:**
- Name: required, 1-100 characters
- Type: required, must be valid enum
- Last4: optional, exactly 4 digits if provided
- Institution: optional, max 100 characters

### Step 2: Contact Active/Inactive Toggle

**Location:** Household page (`/hogar`), contacts section

**UI Update:**

```
Contactos (3)                    + Agregar contacto

┌─────────────────────────────────────────────┐
│ MI  Maria Isabel                            │
│     mariaisabel@example.com                 │
│     [Editar] [Desactivar]                   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🚫 Pedro                                     │
│     pedro@example.com                       │
│     Inactivo                                │
│     [Editar] [Activar]                      │
└─────────────────────────────────────────────┘
```

**Behavior:**

- Active contacts: normal display, "Desactivar" button
- Inactive contacts: grayed out with 🚫 icon, "Activar" button
- Clicking toggle updates via PATCH /api/contacts/:id

### Step 3: Dynamic Movement Form

**Location:** `/registrar-movimiento`

**Changes:**

1. **Remove hardcoded arrays** from `registrar-movimiento.js`:
   ```javascript
   // DELETE these:
   const DEFAULT_USERS = [...];
   const PRIMARY_USERS = [...];
   const PAYMENT_METHODS = [...];
   ```

2. **Fetch data on page load:**
   ```javascript
   async function loadFormConfig() {
     const response = await fetch('/api/movement-form-config', {
       headers: { 'Authorization': `Bearer ${getToken()}` }
     });
     const config = await response.json();
     
     // Populate dropdowns
     populateUsersDropdown(config.users);
     populatePaymentMethodsDropdown(config.payment_methods);
     populateCategoriesDropdown(config.categories);
   }
   ```

3. **User dropdowns** (pagador, tomador, participants):
   - Show household members + active contacts
   - Group by type (members first, then contacts) - optional visual separator

4. **Payment methods dropdown**:
   - Show user's own + shared methods
   - Display format: "Débito Jose" or "Nu Caro (Caro)" for clarity

### Step 4: Navigation Updates

Add "Métodos de pago" to profile page.

---

## ✅ Implementation Checklist

### Backend

- [ ] **Database migrations**
  - [ ] Create `payment_methods` table
  - [ ] Create `payment_method_type` enum
  - [ ] Add `is_active` column to `contacts` table
  - [ ] Add indexes

- [ ] **Payment Methods API**
  - [ ] POST /api/payment-methods (create)
  - [ ] GET /api/payment-methods (list)
  - [ ] PATCH /api/payment-methods/:id (update)
  - [ ] DELETE /api/payment-methods/:id (delete)
  - [ ] Validation: name uniqueness per household
  - [ ] Validation: owner can only modify own methods
  - [ ] Permission check: shared vs. personal

- [ ] **Contacts API Update**
  - [ ] PATCH /api/contacts/:id - support `is_active` field
  - [ ] Update GET /api/contacts to include `is_active`

- [ ] **Movement Form Config API**
  - [ ] GET /api/movement-form-config
  - [ ] Return users (members + active contacts)
  - [ ] Return payment methods (own + shared)
  - [ ] Return categories (hardcoded)

### Frontend

- [ ] **Payment Methods Page**
  - [ ] Create `/frontend/pages/payment-methods.js`
  - [ ] List all payment methods with owner info
  - [ ] Visual distinction: own vs. shared
  - [ ] Visual distinction: active vs. inactive
  - [ ] Add payment method form (modal or inline)
  - [ ] Edit payment method form
  - [ ] Activate/deactivate payment method
  - [ ] Delete payment method with confirmation
  - [ ] Form validation

- [ ] **Household Page Updates**
  - [ ] Show active/inactive status on contacts
  - [ ] Add "Activar/Desactivar" button to each contact
  - [ ] Visual indicator for inactive contacts
  - [ ] Update contact list after toggle

- [ ] **Movement Registration Page Updates**
  - [ ] Remove hardcoded DEFAULT_USERS, PRIMARY_USERS, PAYMENT_METHODS
  - [ ] Fetch config from GET /api/movement-form-config
  - [ ] Populate user dropdowns dynamically
  - [ ] Populate payment methods dropdown dynamically
  - [ ] Keep categories hardcoded (from config)
  - [ ] Handle empty state (no payment methods → show message)

- [ ] **Navigation**
  - [ ] Add "Métodos de pago" to hamburger menu
  - [ ] Update router.js to handle /payment-methods route

### Testing

- [ ] **Backend E2E Tests** (`backend/tests/e2e/payment-methods.test.js`)
  - [ ] Create payment method
  - [ ] List payment methods (own + shared)
  - [ ] Update payment method (owner only)
  - [ ] Delete payment method (owner only)
  - [ ] Share payment method with household
  - [ ] Verify non-owner cannot modify
  - [ ] Activate/deactivate payment method
  - [ ] Name uniqueness validation

- [ ] **Backend E2E Tests** (`backend/tests/e2e/household-management.test.js`)
  - [ ] Update contact active status
  - [ ] Verify inactive contacts not in form config
  - [ ] Verify active contacts in form config

- [ ] **Frontend Manual Testing**
  - [ ] Create household with members
  - [ ] Add payment methods (personal and shared)
  - [ ] Verify movement form shows correct payment methods
  - [ ] Add contacts, mark some inactive
  - [ ] Verify movement form shows only active contacts
  - [ ] Verify inactive contacts visible in household page
  - [ ] Test across different users in same household

### Documentation

- [ ] Update `02_HOUSEHOLD_PHASE.md` status to COMPLETE
- [ ] Mark `03_PAYMENT_METHODS_PHASE.md` as IN_PROGRESS when started
- [ ] Update FUTURE_VISION.md if needed

---

## 🚀 Migration Strategy

### For Existing Users

1. **Payment methods:**
   - Users need to manually create their payment methods
   - Add onboarding flow: "Configure tus métodos de pago"
   - Optionally: pre-populate based on hardcoded list (one-time migration script)

2. **Contacts:**
   - All existing contacts default to `is_active = TRUE`
   - No data migration needed

3. **Movement form:**
   - If user has no payment methods → show message: "Agrega métodos de pago desde tu perfil"
   - If user has no household → redirect to create household (already implemented)

---

## 🔮 Future Enhancements (Phase 4+)

- **Custom categories per household** (replace hardcoded list)
- **Payment method icons/colors** (visual customization)
- **Default payment method** (pre-select in form)
- **Payment method usage statistics** (most used, last used)
- **Cross-household payment method visibility** (if sharing expenses with external users)
- **Credit card tracking** (due dates, limits, statements) - see FUTURE_VISION.md section 4.4
- **Account balances** (track actual money in each method)

---

## ❓ Open Questions

1. **Should we allow users to reorder payment methods?**
   - Suggestion: Yes, add `display_order` field in future iteration
   - For now: alphabetical order is fine

2. **Should inactive payment methods be hidden or shown?**
   - Suggestion: Show in payment methods page with visual indicator
   - Hide from movement form dropdowns
   - Similar to inactive contacts

3. **Should we validate payment method usage before deletion?**
   - Phase 3: No validation (movements only in Google Sheets)
   - Phase 4+: Yes, prevent deletion if referenced in movements table
   - For now: allow deletion, rely on soft delete (is_active = FALSE)

4. **Migration: Should we auto-create payment methods from hardcoded list?**
   - User manually creates (clean slate)

---

## 📝 Notes

- This phase is purely additive - no breaking changes to existing functionality
- Movement registration still works during implementation (uses hardcoded arrays)
- Can be implemented incrementally:
  - Step 1: Payment methods backend + frontend
  - Step 2: Contact activation toggle
  - Step 3: Dynamic movement form
- Categories remain hardcoded intentionally (deferred to Phase 4)
