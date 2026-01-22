# Frontend Template Management - Plan & Recommendations

**Date:** 2026-01-20  
**Status:** Planning phase  

---

## 📋 Current State

### ✅ What's Already Implemented

**Backend (100% COMPLETE):**
- ✅ Full CRUD API for recurring movement templates
- ✅ 8 endpoints including create, update, delete, list
- ✅ Role inversion logic (SPLIT ↔ DEBT_PAYMENT)
- ✅ Scheduler for auto-generation (every 12 hours)
- ✅ Scope editing (THIS, FUTURE, ALL)
- ✅ 38 unit tests + 23 integration tests passing

**Frontend (Movement Forms COMPLETE):**
- ✅ Template dropdown in movement registration form
- ✅ Pre-fill logic when template selected
- ✅ Auto-generated badge (🔁) in movement list
- ✅ Scope modal for editing/deleting auto-generated movements
- ✅ Performance optimizations (70%+ API call reduction)

### ❌ What's Missing

**Frontend (Template Management UI):**
- ❌ No UI to CREATE new recurring movement templates
- ❌ No UI to EDIT existing templates
- ❌ No UI to VIEW list of templates
- ❌ No UI to DELETE/deactivate templates
- ❌ No way for users to configure:
  - Which categories have templates
  - Template amount (FIXED vs VARIABLE)
  - Auto-generation schedule (day of month/year)
  - Template participants/payers

**Current Workaround:**
- Users must create templates via direct DB insert or API calls (curl)
- This is NOT user-friendly for production

---

## 🎯 Where to Add Template Management UI?

### Option 1: In Presupuesto Tab (Home Page) ⭐ **RECOMMENDED**

**Location:** `frontend/pages/home.js` - Presupuesto tab

**Reasoning:**
1. **Logical grouping:** Budgets and recurring movements both deal with planned expenses
2. **Already has category grouping:** Presupuesto tab already shows categories grouped by Group
3. **Existing UI patterns:** Three-dots menu, modals, forms already exist
4. **User mental model:** "I'm planning my monthly expenses" → budgets + recurring expenses

**How it would work:**
```
Presupuesto Tab (Current)
├── [📋 Copiar del mes anterior]
├── [⚙️ Gestionar categorías] → Category management (future)
├── Total Presupuestado: $X,XXX
└── Categories grouped by Group
    ├── Casa
    │   ├── Gastos fijos - Budget: $3,200,000
    │   └── Servicios - Budget: $200,000
    └── ...

Presupuesto Tab (Proposed)
├── [📋 Copiar del mes anterior]
├── [⚙️ Gestionar categorías] → Category management (future)
├── Total Presupuestado: $X,XXX
└── Categories grouped by Group
    ├── Casa
    │   ├── Gastos fijos
    │   │   ├── Budget: $3,200,000
    │   │   └── 🔁 Gastos periódicos: 2 configurados ← NEW
    │   │        └── Three-dots menu:
    │   │            ├── Ver gastos periódicos
    │   │            └── Agregar gasto periódico
    │   └── Servicios - Budget: $200,000
    └── ...
```

**Pros:**
- ✅ Natural fit (budgets + recurring = financial planning)
- ✅ Reuses existing UI components
- ✅ Category grouping already done
- ✅ Less code changes

**Cons:**
- ⚠️ Tab might become overloaded (but manageable)

---

### Option 2: In Hogar Page (Household Settings)

**Location:** `frontend/pages/household.js` - New "Gastos Periódicos" section

**Reasoning:**
1. **Configuration area:** Hogar page is for household setup/configuration
2. **Separate concern:** Keeps planning (Presupuesto) separate from config (Hogar)
3. **Room for expansion:** Could add more advanced features later

**How it would work:**
```
Hogar Page (Current)
├── Mi hogar (header with 🏠)
├── Miembros (section)
├── Contactos (section)
└── Métodos de pago compartidos (section)

Hogar Page (Proposed)
├── Mi hogar (header with 🏠)
├── Miembros (section)
├── Contactos (section)
├── Métodos de pago compartidos (section)
└── Gastos Periódicos (section) ← NEW
    ├── [+ Crear gasto periódico]
    └── List of templates by category
        ├── Casa > Gastos fijos
        │   ├── Arriendo - $3,200,000 - Auto (día 1)
        │   └── Servicios - Variable - Manual
        └── ...
```

**Pros:**
- ✅ Clear separation of concerns
- ✅ Dedicated space for configuration
- ✅ Won't clutter Presupuesto tab

**Cons:**
- ❌ Less discoverable (users might not think to look there)
- ❌ Disconnect from budgets (users plan both together)
- ❌ More navigation (Hogar → Presupuesto back and forth)

---

### Option 3: New Dedicated Page/Tab

**Location:** New route `/gastos-periodicos` or new tab in Home

**Reasoning:**
1. **Full focus:** Dedicated space for complex configuration
2. **Scalability:** Room for advanced features (history, analytics)

**Pros:**
- ✅ Maximum space for features
- ✅ No cluttering existing pages

**Cons:**
- ❌ Another navigation item (app complexity)
- ❌ Disconnect from related features
- ❌ Most users won't have many templates (overkill?)

---

## 🏆 Final Recommendation: **Option 1 (Presupuesto Tab)**

**Why:**
1. Users think: "I need to set my monthly rent" → this is budgeting
2. Budget + recurring movement often same category (rent is both)
3. Minimal UI changes (reuse existing patterns)
4. Keeps related features together

**Implementation Plan:**

### Phase 1: Category Management (Foundation)
**Time: 3-4 hours**

Currently Presupuesto tab says: *"Crea categorías desde 'Gestionar categorías'"* but that button exists and just shows TODO alert.

1. Implement "Gestionar categorías" button functionality
   - Shows modal with list of categories
   - Can add/edit/delete categories
   - Can assign to groups
   - Can set icons
   
2. Files to modify:
   - `frontend/pages/home.js` - Add category management modal
   - Backend already has `/categories` CRUD endpoints

**Note:** This is optional - we can skip if you want to focus only on templates and manage categories via DB for now.

---

### Phase 2: Template Management UI (Core)
**Time: 4-5 hours**

Add template management to Presupuesto tab:

1. **Show template count per category:**
   ```html
   <div class="budget-category-item">
     <div class="expense-category-info">
       <div class="expense-category-name">Gastos fijos</div>
       <div class="expense-category-amount">
         <span>Budget: $3,200,000</span>
         <span class="template-count">🔁 2 periódicos</span> ← NEW
       </div>
     </div>
   </div>
   ```

2. **Add "Gestionar gastos periódicos" to three-dots menu:**
   ```
   Three-dots menu (per category):
   ├── Editar presupuesto
   ├── Eliminar presupuesto
   └── Gestionar gastos periódicos ← NEW
   ```

3. **Create Template Management Modal:**
   - Opens when user clicks "Gestionar gastos periódicos"
   - Shows list of templates for that category
   - [+ Agregar gasto periódico] button
   - Each template shows:
     - Name
     - Amount (or "Variable")
     - Schedule (Auto día X, or "Manual")
     - Edit/Delete buttons

4. **Create Template Form Modal:**
   - Opens when adding/editing template
   - Fields:
     - ✅ Nombre (text input)
     - ✅ Tipo de movimiento (dropdown: SPLIT, HOUSEHOLD, INCOME, DEBT_PAYMENT)
     - ✅ Monto (if FIXED): number input
     - ✅ Tipo de monto: FIXED / VARIABLE (radio buttons)
     - ✅ ¿Auto-generar? (checkbox - only if FIXED)
     - ✅ Si auto-generar:
       - Frecuencia (MONTHLY / YEARLY)
       - Día del mes (1-28 for MONTHLY)
       - Mes + día (for YEARLY)
     - ✅ Pagador (for SPLIT/DEBT_PAYMENT)
     - ✅ Participantes (for SPLIT)
     - ✅ Cuenta receptora (for HOUSEHOLD/INCOME)

5. **API Integration:**
   - `POST /api/recurring-movements` - Create template
   - `PUT /api/recurring-movements/:id` - Update template
   - `DELETE /api/recurring-movements/:id` - Delete template
   - `GET /api/recurring-movements/by-category/:id` - List templates (already exists)

6. **Files to modify:**
   - `frontend/pages/home.js` - Add template count, menu item, modals
   - `frontend/styles.css` - Template modal styles

---

## 📝 Detailed Implementation Steps

### Step 1: Update Presupuesto rendering to show template count
```javascript
// In renderBudgetItem()
const renderBudgetItem = (budget, groupName) => {
  const hasBudget = budget.amount > 0;
  const simplifiedName = getSimplifiedCategoryName(...);
  
  // NEW: Fetch template count for this category
  const templateCount = getTemplatecountForCategory(budget.category_id);
  
  return `
    <div class="budget-category-item">
      <div class="expense-category-info">
        <div class="expense-category-name">${simplifiedName}</div>
        <div class="expense-category-amount">
          <span>${hasBudget ? formatCurrency(budget.amount) : '...'}</span>
          ${templateCount > 0 ? `
            <span class="template-count-badge">🔁 ${templateCount}</span>
          ` : ''}
        </div>
      </div>
      <button class="three-dots-btn">⋮</button>
    </div>
  `;
};
```

### Step 2: Add menu item to three-dots menu
```javascript
<div class="three-dots-menu">
  ${hasBudget ? `
    <button data-action="edit-budget">Editar presupuesto</button>
    <button data-action="delete-budget">Eliminar presupuesto</button>
  ` : `
    <button data-action="add-budget">Agregar presupuesto</button>
  `}
  <button data-action="manage-templates" data-category-id="${budget.category_id}">
    Gestionar gastos periódicos
  </button>
</div>
```

### Step 3: Create Template List Modal
```javascript
function showTemplateListModal(categoryId, categoryName) {
  const templates = await fetchTemplatesByCategory(categoryId);
  
  const modal = `
    <div class="modal">
      <div class="modal-content">
        <h2>Gastos Periódicos - ${categoryName}</h2>
        
        <button class="btn-primary" onclick="showTemplateFormModal(${categoryId})">
          + Agregar gasto periódico
        </button>
        
        <div class="templates-list">
          ${templates.map(template => `
            <div class="template-item">
              <div class="template-info">
                <strong>${template.name}</strong>
                <span>${template.amount_type === 'FIXED' ? formatCurrency(template.amount) : 'Variable'}</span>
                <span>${template.auto_generate ? `Auto (día ${template.day_of_month})` : 'Manual'}</span>
              </div>
              <button onclick="editTemplate(${template.id})">Editar</button>
              <button onclick="deleteTemplate(${template.id})">Eliminar</button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}
```

### Step 4: Create Template Form Modal
```javascript
function showTemplateFormModal(categoryId, templateId = null) {
  const isEdit = templateId !== null;
  const template = isEdit ? await fetchTemplate(templateId) : null;
  
  const modal = `
    <div class="modal">
      <div class="modal-content">
        <h2>${isEdit ? 'Editar' : 'Crear'} Gasto Periódico</h2>
        
        <form id="template-form">
          <label>Nombre</label>
          <input name="name" value="${template?.name || ''}" required>
          
          <label>Tipo de movimiento</label>
          <select name="movement_type">
            <option value="SPLIT">SPLIT (dividir gasto)</option>
            <option value="HOUSEHOLD">HOUSEHOLD (gasto del hogar)</option>
            <option value="INCOME">INCOME (ingreso)</option>
            <option value="DEBT_PAYMENT">DEBT_PAYMENT (pago de deuda)</option>
          </select>
          
          <label>Tipo de monto</label>
          <div class="radio-group">
            <input type="radio" name="amount_type" value="FIXED" checked>
            <label>Fijo</label>
            <input type="radio" name="amount_type" value="VARIABLE">
            <label>Variable</label>
          </div>
          
          <div id="fixed-amount-section">
            <label>Monto</label>
            <input type="number" name="amount">
            
            <label>
              <input type="checkbox" name="auto_generate">
              Auto-generar mensualmente
            </label>
            
            <div id="schedule-section" style="display: none;">
              <label>Frecuencia</label>
              <select name="recurrence_type">
                <option value="MONTHLY">Mensual</option>
                <option value="YEARLY">Anual</option>
              </select>
              
              <label>Día del mes</label>
              <input type="number" name="day_of_month" min="1" max="28">
            </div>
          </div>
          
          <!-- Participants section for SPLIT -->
          <div id="participants-section">
            <!-- Payer, participants, etc. -->
          </div>
          
          <button type="submit">Guardar</button>
          <button type="button" onclick="closeModal()">Cancelar</button>
        </form>
      </div>
    </div>
  `;
}
```

---

## 🎯 Questions for You

Before I start implementing:

1. **Do you want Category Management first?**
   - Option A: Implement full category CRUD in Presupuesto tab (3-4 hours)
   - Option B: Skip for now, add categories via DB manually (faster)
   - **My recommendation:** Option B for now - focus on templates

2. **Template count - where to fetch?**
   - Option A: Add `template_count` to `/budgets` endpoint (backend change)
   - Option B: Fetch separately when rendering Presupuesto tab
   - **My recommendation:** Option A - cleaner, one API call

3. **Simplified form for MVP?**
   - Should first version support ALL movement types (SPLIT, HOUSEHOLD, etc.)?
   - Or start with just SPLIT (most common for recurring expenses)?
   - **My recommendation:** Support all types from the start (backend already handles it)

4. **Do you agree with Presupuesto tab placement?**
   - Or would you prefer Hogar page or dedicated page?

---

## 📊 Time Estimates

| Phase | Task | Time |
|-------|------|------|
| 1 (Optional) | Category Management UI | 3-4 hours |
| 2A | Show template count in Presupuesto | 30 mins |
| 2B | Template list modal | 1 hour |
| 2C | Template form modal (full) | 2-3 hours |
| 2D | API integration & testing | 1 hour |
| **Total (without categories)** | | **4-5 hours** |
| **Total (with categories)** | | **7-9 hours** |

---

## ✅ Next Steps

Let me know your preferences:

1. Presupuesto tab vs Hogar page vs dedicated page?
2. Category management now or later?
3. Backend change for template_count or frontend-only?
4. Full movement type support or SPLIT only for MVP?

Then I'll:
1. Update all documentation with current status
2. Create detailed implementation plan
3. Start building the template management UI

**¿Qué te parece? ¿Vamos con Presupuesto tab y templates solamente (skip categories por ahora)?**
