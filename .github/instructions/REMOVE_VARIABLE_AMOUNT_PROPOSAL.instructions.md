# Proposal: Remove FIXED/VARIABLE Amount Distinction

**Date:** 2026-01-25 23:20 UTC  
**Status:** Proposed - Ready to implement

---

## 🎯 Problem Statement

**Current implementation:**
- Templates have `amount_type` ENUM ('FIXED', 'VARIABLE')
- FIXED: Has amount, can auto-generate
- VARIABLE: No amount, cannot auto-generate, only pre-fills other fields

**Why this doesn't make sense:**
1. ❌ Templates are for **budgets** - you always need an estimated amount
2. ❌ VARIABLE templates don't save any amount (not even estimated)
3. ❌ Only benefit: Pre-fills category, payer, participants
4. ❌ Creates complexity with conditional validations
5. ❌ Extra field in UI (radio buttons for fixed/variable)

---

## ✅ Proposed Solution

**Simplify to:**
- **Amount is ALWAYS required** (either exact value or estimate)
- **`auto_generate` determines behavior:**
  - `true` → Auto-creates movements on schedule
  - `false` → Only pre-fills form (user can adjust amount)

**Remove:**
- `amount_type` enum completely
- Radio buttons in UI
- Conditional amount validation

---

## 📊 Use Cases

| Template | Amount | Auto-generate | Behavior |
|----------|--------|--------------|----------|
| Arriendo | $3.2M | ✅ Yes | Auto-creates monthly with exact $3.2M |
| Servicios (luz) | $150K (estimado) | ❌ No | Pre-fills $150K, user adjusts to real value |
| Netflix | $50K | ✅ Yes | Auto-creates monthly with $50K |
| Seguro anual | $500K | ❌ No | Pre-fills $500K once per year |

**Key insight:**
- For auto-generated: Amount is the **real value**
- For manual: Amount is the **estimated value** (useful for budgeting)

**In all cases:** You know approximately how much to expect!

---

## 🔧 Required Changes

### 1. Database Migration

**Create migration: 034_remove_amount_type.up.sql**

```sql
-- Drop the CHECK constraint that references amount_type
ALTER TABLE recurring_movement_templates 
  DROP CONSTRAINT IF EXISTS recurring_movement_templates_amount_check;

-- Make amount NOT NULL (currently nullable for VARIABLE)
UPDATE recurring_movement_templates 
  SET amount = 0 
  WHERE amount IS NULL;

ALTER TABLE recurring_movement_templates 
  ALTER COLUMN amount SET NOT NULL;

-- Drop amount_type column
ALTER TABLE recurring_movement_templates 
  DROP COLUMN amount_type;

-- Drop the amount_type enum
DROP TYPE IF EXISTS amount_type;

-- Add simple constraint: auto_generate requires amount > 0
ALTER TABLE recurring_movement_templates 
  ADD CONSTRAINT check_auto_generate_amount 
  CHECK (NOT auto_generate OR (auto_generate AND amount > 0));

-- Simplified: auto-generate can only be true if amount exists
-- But since amount is always required now, this is just: amount > 0 always
```

**Create migration: 034_remove_amount_type.down.sql**

```sql
-- Recreate amount_type enum
CREATE TYPE amount_type AS ENUM ('FIXED', 'VARIABLE');

-- Add amount_type column (default to FIXED)
ALTER TABLE recurring_movement_templates 
  ADD COLUMN amount_type amount_type NOT NULL DEFAULT 'FIXED';

-- Make amount nullable again
ALTER TABLE recurring_movement_templates 
  ALTER COLUMN amount DROP NOT NULL;

-- Drop new constraint
ALTER TABLE recurring_movement_templates 
  DROP CONSTRAINT IF EXISTS check_auto_generate_amount;

-- Recreate old constraint
ALTER TABLE recurring_movement_templates 
  ADD CONSTRAINT recurring_movement_templates_amount_check 
  CHECK (
    (amount_type = 'FIXED' AND amount > 0) OR 
    (amount_type = 'VARIABLE' AND amount IS NULL)
  );
```

---

### 2. Backend Changes

**File: `backend/internal/recurringmovements/types.go`**

```go
// REMOVE this enum:
type AmountType string
const (
    AmountTypeFixed    AmountType = "FIXED"
    AmountTypeVariable AmountType = "VARIABLE"
)

// UPDATE RecurringMovementTemplate struct:
type RecurringMovementTemplate struct {
    ID          string       `json:"id"`
    HouseholdID string       `json:"household_id"`
    Name        string       `json:"name"`
    Description *string      `json:"description,omitempty"`
    IsActive    bool         `json:"is_active"`
    Type        MovementType `json:"movement_type"`
    CategoryID  string       `json:"category_id"`
    
    // CHANGE: Remove AmountType, make Amount always required
    Amount      float64      `json:"amount"` // Always required (NOT nullable)
    
    Currency         string  `json:"currency"`
    AutoGenerate     bool    `json:"auto_generate"`
    // ... rest of fields
}
```

**File: `backend/internal/recurringmovements/service.go`**

```go
// UPDATE validation in Create/Update methods:
func (s *service) Create(ctx context.Context, userID string, input *CreateTemplateInput) (*RecurringMovementTemplate, error) {
    // Validate amount is always provided and > 0
    if input.Amount <= 0 {
        return nil, errors.New("amount is required and must be greater than 0")
    }
    
    // Auto-generate requires amount (already guaranteed by above check)
    if input.AutoGenerate && input.Amount <= 0 {
        return nil, errors.New("auto-generate requires amount to be set")
    }
    
    // REMOVE: amount_type validation
    // REMOVE: conditional amount validation based on amount_type
    
    // ... rest of logic
}
```

---

### 3. Frontend Changes

**File: `frontend/pages/home.js`**

**Remove from HTML (around line 3030):**
```html
<!-- DELETE THIS SECTION -->
<label class="field">
  <span>Tipo de monto *</span>
  <select id="template-amount-type" required>
    <option value="FIXED">Monto fijo (siempre el mismo)</option>
    <option value="VARIABLE">Monto variable (cambia cada mes)</option>
  </select>
</label>
```

**Update amount field (line 3039):**
```html
<!-- CHANGE from conditional to always visible -->
<label class="field">
  <span>Monto total *</span>
  <input type="text" id="template-amount" inputmode="decimal" placeholder="0" required />
</label>
```

**Remove JavaScript logic (around line 3462):**
```javascript
// DELETE: Amount type change listener
amountTypeSelect.addEventListener('change', (e) => {
  const isFixed = e.target.value === 'FIXED';
  amountField.classList.toggle('hidden', !isFixed);
  // ... rest
});
```

**Update auto-generate checkbox logic (around line 3505):**
```javascript
// SIMPLIFY: No need to disable for VARIABLE
autoGenerateCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) {
    dayField.classList.remove('hidden');
    document.getElementById('template-day').required = true;
    // Amount is already required, no need to change
  } else {
    dayField.classList.add('hidden');
    document.getElementById('template-day').required = false;
  }
});
```

**Update form submission (around line 3670):**
```javascript
const formData = {
  name: document.getElementById('template-name').value,
  description: document.getElementById('template-description').value || null,
  category_id: categoryId,
  
  // CHANGE: Remove amount_type, always send amount
  amount: parseNumber(document.getElementById('template-amount').value),
  
  auto_generate: autoGenerateCheckbox.checked,
  // ... rest
};
```

---

### 4. Migration Script for Existing Data

**File: `backend/scripts/migrate_variable_to_fixed.sql`**

```sql
-- Before running migration 034, fix any VARIABLE templates
-- Set a default estimated amount (e.g., 100,000 COP)

UPDATE recurring_movement_templates 
SET amount = 100000 
WHERE amount_type = 'VARIABLE' AND amount IS NULL;

-- Or prompt user to set amounts manually via UI before migration
```

---

## 📝 Implementation Checklist

### Phase 1: Database (30 mins)
- [ ] Create migration 034_remove_amount_type.up.sql
- [ ] Create migration 034_remove_amount_type.down.sql
- [ ] Handle existing VARIABLE templates (set default amounts)
- [ ] Run migration in dev environment
- [ ] Test migration rollback

### Phase 2: Backend (30 mins)
- [ ] Remove `AmountType` enum from types.go
- [ ] Update `RecurringMovementTemplate` struct
- [ ] Update validation in service.go (remove amount_type checks)
- [ ] Update repository.go (remove amount_type column references)
- [ ] Update handlers.go (remove amount_type from request/response)
- [ ] Run existing tests (fix any failures)

### Phase 3: Frontend (30 mins)
- [ ] Remove "Tipo de monto" dropdown from template modal
- [ ] Make amount field always visible and required
- [ ] Remove amount_type from form submission
- [ ] Simplify auto-generate checkbox logic
- [ ] Update hint text if needed
- [ ] Test template creation flow

### Phase 4: Testing (30 mins)
- [ ] Create template with amount + auto-generate
- [ ] Create template with amount (no auto-generate)
- [ ] Verify pre-fill works with estimated amounts
- [ ] Verify auto-generation works
- [ ] Test edit/delete (when implemented)

**Total estimated time:** ~2 hours

---

## 🎯 Benefits

1. ✅ **Simpler:** One less field, one less enum, one less validation
2. ✅ **More useful:** Always have an estimated amount for budgeting
3. ✅ **Clearer UX:** Amount is always required, no confusion
4. ✅ **Better for budgets:** You always know approximately how much to expect
5. ✅ **Less code:** Fewer conditionals, fewer edge cases

---

## ⚠️ Breaking Changes

**API Changes:**
- `amount_type` field removed from all requests/responses
- `amount` is now always required (was optional for VARIABLE)

**Database Changes:**
- `amount_type` column removed
- `amount` is now NOT NULL

**Migration Required:**
- Existing VARIABLE templates must have amounts set before migration

---

## 🤔 Decision Point

**When to implement:**

**Option A: Now (before edit/delete)**
- ✅ Simpler to implement (fewer templates in DB)
- ✅ Don't build features on top of flawed design
- ❌ Delays edit/delete implementation by ~2 hours

**Option B: After edit/delete**
- ✅ Complete current feature first
- ❌ More templates to migrate
- ❌ Need to update edit/delete code later

**Recommendation:** **Option A (Now)**
- The change is fundamental and affects the core data model
- Better to fix architecture before building more features
- 2 hours is reasonable delay

---

**User decision needed:** Proceed with implementation now? ✅
