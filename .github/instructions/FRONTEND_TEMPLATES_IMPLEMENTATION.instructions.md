# Frontend Template Management - Inline Items Design (UPDATED)

**Date:** 2026-01-20  
**Approach:** Show templates as INDIVIDUAL ITEMS within category (same pattern as movements in Gastos tab)

---

## 🎯 Correct UX Pattern (User Approved)

Templates appear as **individual items** when category is expanded, exactly like movements in Gastos tab.

### Visual Structure

```
Presupuesto Tab > Casa (Group)
└── Gastos fijos (Category) - Presupuesto: $3,200,000 [⋮]
                                                        ├── Agregar gasto predefinido
                                                        ├── Editar presupuesto
                                                        └── Eliminar presupuesto
    ▼ Click to expand:
    │
    ├── 🔁 Arriendo - $3,200,000 - Auto día 1 [⋮]     ← PERIODIC template (auto_generate=true)
    │                                                  ├── Editar
    │                                                  └── Eliminar (with scope)
    │
    ├── 🔁 Servicios - Variable - Manual [⋮]          ← MANUAL template (auto_generate=false)
                                                       ├── Editar
                                                       └── Eliminar (with scope)
```

**Naming:** "Gastos predefinidos" (not "Gastos periódicos") - more accurate since not all are recurring.

**Sort order:**
1. Periodic templates (auto_generate=true) first
2. Manual templates (auto_generate=false) second
3. Within each group: by amount (highest to lowest)
4. Variable amounts treated as 0 for sorting

**Pattern matches Gastos tab:**
```
Gastos Tab > Casa (Group)
└── Gastos fijos (Category) [Click to expand] ▼
    │
    ├── Arriendo                       ← MOVEMENT ITEM
    │   ├── $3,200,000 - 2025-01-01
    │   └── [⋮] Editar / Eliminar
    │
    └── Luz
        ├── $100,000 - 2025-01-05
        └── [⋮] Editar / Eliminar
```

---

## 📐 Detailed HTML Structure

### Presupuesto Tab - Category Card (Modified)

```html
<div class="expense-group-card">
  <!-- Group Header (Casa) -->
  <div class="expense-group-header">
    <div class="expense-group-icon-container">
      <span class="expense-group-icon">🏠</span>
    </div>
    <div class="expense-group-info">
      <div class="expense-group-name">Casa</div>
      <div class="expense-group-amount">$3,200,000</div>
    </div>
    <svg class="expense-group-chevron">...</svg>
  </div>
  
  <!-- Group Details (Categories) -->
  <div class="expense-group-details hidden" id="budget-group-details-casa">
    
    <!-- Category: Gastos fijos -->
    <div class="budget-category-item">
      
      <!-- Category Header (Gastos fijos) -->
      <div class="expense-category-header" onclick="toggleCategoryDetails('gastos-fijos')">
        <div class="expense-category-info">
          <span class="expense-category-name">Gastos fijos</span>
          <span class="expense-category-amount">Presupuesto: $3,200,000</span>
        </div>
        <svg class="category-chevron">...</svg>
      </div>
      
      <!-- Category Details (Templates + Budget actions) -->
      <div class="expense-category-details hidden" id="category-details-gastos-fijos">
        
        <!-- TEMPLATE 1: Arriendo -->
        <div class="movement-detail-entry template-entry" data-template-id="abc-123">
          <div class="entry-info">
            <span class="entry-description">
              <span class="template-icon">🔁</span>
              Arriendo
            </span>
            <span class="entry-amount">$3,200,000</span>
            <div class="entry-date">Auto día 1</div>
          </div>
          <div class="entry-actions">
            <button class="three-dots-btn">⋮</button>
            <div class="three-dots-menu">
              <button class="menu-item" data-action="edit-template">Editar</button>
              <button class="menu-item menu-item-danger" data-action="delete-template">Eliminar</button>
            </div>
          </div>
        </div>
        
        <!-- TEMPLATE 2: Servicios -->
        <div class="movement-detail-entry template-entry" data-template-id="def-456">
          <div class="entry-info">
            <span class="entry-description">
              <span class="template-icon">🔁</span>
              Servicios
            </span>
            <span class="entry-amount">Variable</span>
            <div class="entry-date">Manual</div>
          </div>
          <div class="entry-actions">
            <button class="three-dots-btn">⋮</button>
            <div class="three-dots-menu">
              <button class="menu-item" data-action="edit-template">Editar</button>
              <button class="menu-item menu-item-danger" data-action="delete-template">Eliminar</button>
            </div>
          </div>
        </div>
        
        <!-- BUDGET ACTIONS (at bottom) -->
        <div class="category-actions-footer">
          <button class="btn-secondary btn-block" data-action="add-template" data-category-id="gastos-fijos">
            + Agregar gasto periódico
          </button>
          
          <div class="budget-actions-group">
            <button class="btn-outline" data-action="edit-budget">
              Editar presupuesto
            </button>
            <button class="btn-outline-danger" data-action="delete-budget">
              Eliminar presupuesto
            </button>
          </div>
        </div>
        
      </div>
    </div>
    
  </div>
</div>
```

---

## 🎨 CSS Additions

```css
/* Template Entry (reuses movement-detail-entry) */
.template-entry {
  background: #f8f9fa; /* Slightly different background */
  border-left: 3px solid #007bff; /* Blue accent */
}

.template-entry:hover {
  background: #e9ecef;
}

.template-icon {
  font-size: 16px;
  margin-right: 8px;
}

/* Category Actions Footer */
.category-actions-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #dee2e6;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-block {
  width: 100%;
  padding: 10px;
  font-weight: 500;
}

.budget-actions-group {
  display: flex;
  gap: 8px;
}

.budget-actions-group button {
  flex: 1;
  padding: 8px;
  font-size: 13px;
}

.btn-outline {
  background: white;
  border: 1px solid #dee2e6;
  color: #495057;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline:hover {
  border-color: #007bff;
  color: #007bff;
  background: #f0f8ff;
}

.btn-outline-danger {
  background: white;
  border: 1px solid #dc3545;
  color: #dc3545;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline-danger:hover {
  background: #dc3545;
  color: white;
}
```

---

## 🔧 Implementation Steps

### Step 1: Modify renderBudgets() to Fetch Templates (30 mins)

```javascript
// Global variable
let templatesData = null; // {categoryId: [templates]}

/**
 * Load budgets and templates
 */
async function loadBudgetsData() {
  try {
    const [budgetsResponse, templatesResponse] = await Promise.all([
      fetch(`${API_URL}/budgets?month=${selectedMonth}&year=${selectedYear}`, {
        credentials: 'include'
      }),
      fetch(`${API_URL}/recurring-movements`, {
        credentials: 'include'
      })
    ]);
    
    if (!budgetsResponse.ok) throw new Error('Error al cargar presupuestos');
    if (!templatesResponse.ok) throw new Error('Error al cargar gastos periódicos');
    
    budgetsData = await budgetsResponse.json();
    const templatesArray = await templatesResponse.json();
    
    // Group templates by category_id
    templatesData = {};
    templatesArray.templates?.forEach(t => {
      if (!templatesData[t.category_id]) {
        templatesData[t.category_id] = [];
      }
      templatesData[t.category_id].push(t);
    });
    
  } catch (error) {
    console.error('Error loading budgets data:', error);
    throw error;
  }
}
```

### Step 2: Modify renderBudgetItem() to Include Templates (1 hour)

```javascript
const renderBudgetItem = (budget, groupName) => {
  const hasBudget = budget.amount > 0;
  const simplifiedName = getSimplifiedCategoryName(budget.category_name || 'Sin nombre', groupName);
  const safeCategoryId = budget.category_id.replace(/[^a-zA-Z0-9]/g, '-');
  
  // Get templates for this category
  const templates = templatesData[budget.category_id] || [];
  
  return `
    <div class="budget-category-item">
      <!-- Category Header (clickable to expand) -->
      <div class="expense-category-header" onclick="toggleCategoryDetails('${safeCategoryId}')">
        <div class="expense-category-info">
          <span class="expense-category-name">${simplifiedName}</span>
          <span class="expense-category-amount">
            ${hasBudget 
              ? `Presupuesto: ${formatCurrency(budget.amount)}` 
              : 'Sin presupuesto'}
          </span>
        </div>
        <svg class="category-chevron" width="16" height="16">...</svg>
      </div>
      
      <!-- Category Details (Templates + Actions) -->
      <div class="expense-category-details hidden" id="category-details-${safeCategoryId}">
        
        <!-- TEMPLATES LIST -->
        ${templates.map(template => renderTemplateItem(template)).join('')}
        
        <!-- If no templates, show empty state -->
        ${templates.length === 0 ? `
          <div class="empty-templates-message">
            <p style="text-align: center; color: #6c757d; padding: 16px; font-size: 14px;">
              No hay gastos periódicos configurados
            </p>
          </div>
        ` : ''}
        
        <!-- CATEGORY ACTIONS FOOTER -->
        <div class="category-actions-footer">
          <button class="btn-secondary btn-block" 
                  data-action="add-template" 
                  data-category-id="${budget.category_id}"
                  data-category-name="${simplifiedName}">
            + Agregar gasto periódico
          </button>
          
          <div class="budget-actions-group">
            ${hasBudget ? `
              <button class="btn-outline" 
                      data-action="edit-budget" 
                      data-budget-id="${budget.id}"
                      data-category-id="${budget.category_id}"
                      data-amount="${budget.amount}"
                      data-category-name="${simplifiedName}">
                Editar presupuesto
              </button>
              <button class="btn-outline-danger" 
                      data-action="delete-budget" 
                      data-budget-id="${budget.id}"
                      data-category-name="${simplifiedName}">
                Eliminar presupuesto
              </button>
            ` : `
              <button class="btn-outline" 
                      data-action="add-budget" 
                      data-category-id="${budget.category_id}"
                      data-category-name="${simplifiedName}">
                Agregar presupuesto
              </button>
            `}
          </div>
        </div>
        
      </div>
    </div>
  `;
};
```

### Step 3: Create renderTemplateItem() Function (30 mins)

```javascript
/**
 * Render individual template item (similar to movement-detail-entry)
 */
function renderTemplateItem(template) {
  const amountDisplay = template.amount_type === 'FIXED' 
    ? formatCurrency(template.amount) 
    : 'Variable';
  
  const scheduleDisplay = template.auto_generate
    ? `Auto día ${template.day_of_month}`
    : 'Manual';
  
  return `
    <div class="movement-detail-entry template-entry" data-template-id="${template.id}">
      <div class="entry-info">
        <span class="entry-description">
          <span class="template-icon">🔁</span>
          ${template.name}
        </span>
        <span class="entry-amount">${amountDisplay}</span>
        <div class="entry-date">${scheduleDisplay}</div>
      </div>
      <div class="entry-actions">
        <button class="three-dots-btn" data-template-id="${template.id}">⋮</button>
        <div class="three-dots-menu" id="template-menu-${template.id}">
          <button class="menu-item" 
                  data-action="edit-template" 
                  data-template-id="${template.id}">
            Editar
          </button>
          <button class="menu-item menu-item-danger" 
                  data-action="delete-template" 
                  data-template-id="${template.id}">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Toggle category details visibility
 */
function toggleCategoryDetails(categoryId) {
  const details = document.getElementById(`category-details-${categoryId}`);
  const header = details.previousElementSibling;
  const chevron = header.querySelector('.category-chevron');
  
  details.classList.toggle('hidden');
  chevron.classList.toggle('rotated'); // CSS: .rotated { transform: rotate(90deg); }
}
```

### Step 4: Template Form Modal (2-3 hours)

Same as previous design - create comprehensive form modal with:
- Name, movement type, amount type (FIXED/VARIABLE)
- Auto-generate toggle + schedule
- Participants/payer for SPLIT
- Receiver account for HOUSEHOLD/INCOME

```javascript
async function showTemplateFormModal(categoryId, categoryName, templateId = null) {
  const isEdit = templateId !== null;
  let template = null;
  
  if (isEdit) {
    const response = await fetch(`${API_URL}/recurring-movements/${templateId}`, {
      credentials: 'include'
    });
    template = await response.json();
  }
  
  // Fetch form config
  const formConfig = await fetchFormConfig();
  
  // Show modal with form
  // ... (full form implementation as in previous doc)
}
```

### Step 5: Event Handlers (30 mins)

```javascript
/**
 * Setup event handlers for Presupuesto tab
 */
function setupPresupuestoEventHandlers() {
  document.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    
    const action = target.dataset.action;
    
    // Add template
    if (action === 'add-template') {
      const categoryId = target.dataset.categoryId;
      const categoryName = target.dataset.categoryName;
      await showTemplateFormModal(categoryId, categoryName);
    }
    
    // Edit template
    if (action === 'edit-template') {
      const templateId = target.dataset.templateId;
      await showTemplateFormModal(null, null, templateId);
    }
    
    // Delete template (with scope modal)
    if (action === 'delete-template') {
      const templateId = target.dataset.templateId;
      await handleDeleteTemplate(templateId);
    }
    
    // Add/Edit/Delete budget (existing handlers)
    // ...
  });
}
```

### Step 6: Delete with Scope Modal (30 mins)

**Reuse existing scope modal from movement list:**

```javascript
async function handleDeleteTemplate(templateId) {
  // Reuse showScopeModal from home.js
  showScopeModal('delete', async (scope) => {
    try {
      const response = await fetch(
        `${API_URL}/recurring-movements/${templateId}?scope=${scope}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );
      
      if (!response.ok) throw new Error('Error al eliminar');
      
      showSuccess('Gasto periódico eliminado', 
        `Se eliminó correctamente (scope: ${scope})`);
      
      // Reload Presupuesto tab
      await loadBudgetsData();
      const container = document.getElementById('presupuesto-tab');
      container.innerHTML = renderBudgets();
      setupPresupuestoEventHandlers();
      
    } catch (error) {
      showError('Error', error.message);
    }
  });
}
```

---

## 📊 Data Flow

### On Presupuesto Tab Load:
```javascript
1. loadBudgetsData()
   ├── GET /api/budgets?month=X&year=Y
   └── GET /api/recurring-movements
       └── Group by category_id → templatesData

2. renderBudgets()
   └── For each category:
       ├── Render category header
       └── Render category details:
           ├── renderTemplateItem() for each template
           └── Render action buttons
```

### On Template Create/Edit:
```javascript
1. showTemplateFormModal(categoryId, categoryName, templateId?)
   ├── If edit: GET /api/recurring-movements/{id}
   ├── GET /api/movement-form-config (for members, contacts, accounts)
   └── Render form modal

2. On submit:
   ├── POST /api/recurring-movements (create)
   └── PUT /api/recurring-movements/{id} (update)

3. Reload:
   ├── loadBudgetsData()
   └── Re-render Presupuesto tab
```

---

## ✅ Advantages of This Approach

1. **100% consistent with Gastos tab pattern**
2. **Familiar UX** - users already know how to use it
3. **Clean visual hierarchy:**
   - Group (Casa)
   - Category (Gastos fijos)
   - Templates (Arriendo, Servicios)
4. **All actions at category level** - no confusion
5. **Reuses existing CSS classes** - minimal new styles

---

## 📅 Implementation Timeline

| Step | Task | Time |
|------|------|------|
| 1 | Fetch templates + group by category | 30 mins |
| 2 | Modify renderBudgetItem() | 1 hour |
| 3 | Create renderTemplateItem() | 30 mins |
| 4 | Template form modal (full CRUD) | 2-3 hours |
| 5 | Event handlers | 30 mins |
| 6 | Delete with scope | 30 mins |
| **Total** | | **5-6 hours** |

---

## ✅ User Decisions (CONFIRMED)

1. **Category default state:** ✅ Collapsed (same as Gastos tab)
2. **Naming:** ✅ "Gastos predefinidos" (more accurate than "periódicos")
3. **Sort order:** ✅ Periodic first, then manual, then by amount (high to low)
4. **Category actions:** ✅ Three-dots menu on category header (not footer)
5. **Empty state message:** ✅ Show "No hay gastos predefinidos configurados"
6. **CSS:** ✅ Reuse Gastos tab CSS (movement-detail-entry, etc.)

---

## 🚀 Ready to Implement

All decisions confirmed. Starting implementation now.
