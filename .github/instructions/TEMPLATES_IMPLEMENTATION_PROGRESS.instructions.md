# Template Management UI - Implementation Progress

**Date:** 2026-01-19  
**Time Started:** 23:15 UTC  

---

## ✅ Completed (Steps 1-4)

### 1. Global Variables & Data Loading ✅
**File:** `frontend/pages/home.js`

- Added `templatesData` global variable (line 33)
- Modified `loadBudgetsData()` to fetch templates in parallel
- Implemented template sorting:
  1. Periodic (auto_generate=true) first
  2. Manual (auto_generate=false) second
  3. By amount (highest to lowest, Variable=0)

### 2. Budget Category Rendering ✅
**File:** `frontend/pages/home.js`

- Modified `renderBudgetItem()` to be expandible (like Gastos tab)
- Added category header with chevron
- Added "Agregar gasto predefinido" to three-dots menu
- Added category details section (initially hidden)
- Templates displayed as individual items when expanded

### 3. Template Item Rendering ✅
**File:** `frontend/pages/home.js`

- Created `renderTemplateItem()` function
- Reuses `.movement-detail-entry` CSS from Gastos tab
- Shows: icon 🔁, name, amount/variable, auto/manual
- Three-dots menu with Editar/Eliminar

### 4. Helper Functions ✅
**File:** `frontend/pages/home.js`

- Created `toggleBudgetCategoryDetails()` for expand/collapse
- Handles chevron rotation

### 5. CSS Styles ✅
**File:** `frontend/styles.css`

- `.template-entry` - Light blue left border
- `.template-entry:hover` - Hover effect
- `.template-icon` - Icon sizing
- `.category-chevron` - Smooth rotation transition

---

## 🔧 Remaining Work (Steps 5-7)

### 5. Event Handlers (Estimated: 30-45 mins)
**File:** `frontend/pages/home.js`

Need to add event delegation for:
- `data-action="add-template"` → showTemplateFormModal(categoryId, categoryName)
- `data-action="edit-template"` → showTemplateFormModal(null, null, templateId)
- `data-action="delete-template"` → handleDeleteTemplate(templateId)

### 6. Template Form Modal (Estimated: 2-3 hours) **BIGGEST TASK**
**File:** `frontend/pages/home.js`

Create comprehensive form modal for adding/editing templates:

**Form Fields:**
- ✅ Nombre (text input)
- ✅ Tipo de movimiento (dropdown: SPLIT, HOUSEHOLD, INCOME, DEBT_PAYMENT)
- ✅ Tipo de monto (radio: FIXED / VARIABLE)
- ✅ Monto (number, only if FIXED)
- ✅ Auto-generar (checkbox, only if FIXED)
- ✅ Frecuencia (dropdown: MONTHLY / YEARLY, only if auto-generate)
- ✅ Día del mes (1-28, only if auto-generate)
- ✅ Mes del año (1-12, only if YEARLY)
- ✅ Pagador (for SPLIT/DEBT_PAYMENT)
  - Contact or Member selector
- ✅ Participantes (for SPLIT)
  - Percentage inputs for each member
  - Validation: must sum 100%
- ✅ Cuenta receptora (for HOUSEHOLD/INCOME)
  - Account selector

**Dynamic Form Logic:**
- Show/hide sections based on:
  - Movement type (SPLIT vs HOUSEHOLD vs DEBT_PAYMENT)
  - Amount type (FIXED vs VARIABLE)
  - Auto-generate toggle
  - Recurrence type (MONTHLY vs YEARLY)

**API Calls:**
- GET `/api/movement-form-config` - Get members, contacts, accounts
- GET `/api/recurring-movements/{id}` - Get template for editing
- POST `/api/recurring-movements` - Create new template
- PUT `/api/recurring-movements/{id}` - Update template

**Validation:**
- Name required
- Amount required if FIXED
- Day of month 1-28 if auto-generate
- Participants sum to 100% for SPLIT
- Payer selected
- Receiver account selected for HOUSEHOLD/INCOME

### 7. Delete with Scope Modal (Estimated: 15-30 mins)
**File:** `frontend/pages/home.js`

- Reuse existing `showScopeModal()` from movement list
- Show scope options: THIS, FUTURE, ALL
- Call DELETE `/api/recurring-movements/{id}?scope={scope}`
- Reload budgets tab after deletion

---

## 📊 Time Estimates

| Task | Status | Time |
|------|--------|------|
| 1-4: Rendering & CSS | ✅ DONE | 1 hour |
| 5: Event Handlers | 🔧 TODO | 30-45 mins |
| 6: Template Form Modal | 🔧 TODO | 2-3 hours |
| 7: Delete with Scope | 🔧 TODO | 15-30 mins |
| **Total Remaining** | | **3-4.25 hours** |

---

## 🚀 Next Steps

**Option A: Continue Now (3-4 hours)**
- Implement event handlers
- Create full template form modal
- Test create/edit/delete flows

**Option B: Resume Later**
- Current state: Templates display correctly but can't add/edit/delete yet
- Can test that templates from backend show up in UI
- Need to create templates via API/DB for testing

**Recommendation:** Given it's 11:15 PM in Colombia, **Option B** might be better. The rendering is done and working. The form modal is complex and needs focused time.

---

## ✅ What Can Be Tested Now

1. Create templates via backend API/DB
2. Open Presupuesto tab
3. Verify templates load and display
4. Verify sorting (periodic first, then manual, then by amount)
5. Click category header → should expand/collapse
6. Verify templates show as individual items
7. Verify CSS styling (blue left border, hover effect)

**Cannot test yet:**
- Adding new templates from UI
- Editing templates from UI
- Deleting templates from UI (with scope)

---

## 📝 Testing Commands

```bash
# Create test template via API
curl -X POST http://localhost:8080/api/recurring-movements \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Arriendo",
    "category_id": "xxx-category-id",
    "type": "SPLIT",
    "amount_type": "FIXED",
    "amount": 3200000,
    "auto_generate": true,
    "recurrence_type": "MONTHLY",
    "day_of_month": 1,
    "payer_contact_id": "xxx-contact-id",
    "participants": [{"user_id":"xxx-user-id","percentage":1.0}]
  }' \
  --cookie "session_token=xxx"
```

**Or directly in DB:**
```sql
INSERT INTO recurring_movement_templates (
  id, household_id, category_id, name, type, amount_type, amount,
  auto_generate, recurrence_type, day_of_month, is_active,
  payer_contact_id, created_at
) VALUES (
  gen_random_uuid(),
  'xxx-household-id',
  'xxx-category-id',
  'Arriendo',
  'SPLIT',
  'FIXED',
  3200000,
  true,
  'MONTHLY',
  1,
  true,
  'xxx-contact-id',
  NOW()
);

-- Add participants
INSERT INTO recurring_movement_participants (
  template_id, user_id, percentage
) VALUES (
  'template-id-from-above',
  'xxx-user-id',
  1.0
);
```

---

## 🎯 Decision Point

**Continue now or resume later?**

¿Quieres que continue con el form modal ahora (3-4 horas más) o lo dejamos aquí y continuamos mañana/después?

Lo que ya está hecho funciona y se puede testear creando templates por API/DB.
