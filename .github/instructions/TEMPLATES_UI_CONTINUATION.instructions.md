# Templates UI - Continuation for Tomorrow

**Date:** 2026-01-19  
**Status:** Template rendering in Presupuesto tab - PARTIALLY WORKING  
**Time Remaining:** 3-4 hours

## 🔴 CURRENT ISSUE

The layout is not rendering correctly. The "No hay gastos predefinidos configurados" message appears in the wrong place (next to the category name instead of below when expanded).

### Problem Analysis
The HTML structure in `renderBudgetItem()` might not be matching the CSS expectations. Need to debug:

1. **Inspect the actual DOM** - Use browser DevTools to see the rendered HTML structure
2. **Compare with Gastos tab** - The category expansion works perfectly there
3. **Check CSS selectors** - Verify `.expense-category-details` is being hidden/shown correctly
4. **Verify chevron rotation** - Should rotate when expanding/collapsing

### Files Involved
- `frontend/pages/home.js` - Lines 511-565 (renderBudgetItem function)
- `frontend/styles.css` - Lines 3681-3700 (template styles)

### What Was Changed Today
1. ✅ Added `templatesData = {}` global variable (line 33)
2. ✅ Modified `loadBudgetsData()` to fetch templates with sorting (lines 1389-1453)
3. ✅ Modified `renderBudgetItem()` to be expandable (lines 511-565)
4. ✅ Created `renderTemplateItem()` function (lines 628-661)
5. ✅ Created `toggleBudgetCategoryDetails()` and exposed to window (lines 668-686)
6. ✅ Added template CSS styles to `frontend/styles.css`

### What's Working
- ✅ Templates fetch from backend API
- ✅ Templates sorted correctly (periodic → manual → by amount)
- ✅ Function is globally accessible (no more "not defined" error)
- ✅ Chevron appears in UI

### What's NOT Working
- ❌ Layout/positioning is incorrect
- ❌ "No hay gastos predefinidos" message appears in wrong location
- ❌ Details section might not be expanding correctly

---

## 🎯 TOMORROW'S TASKS

### **IMMEDIATE FIX (15-30 mins)**

#### Step 1: Debug the HTML Structure
```bash
# Open browser DevTools on Presupuesto tab
# Inspect a category element
# Compare structure with a category in Gastos tab
```

#### Step 2: Fix the Layout Issue
Look at how Gastos tab renders categories with movements:
- File: `frontend/pages/home.js`
- Function: `renderCategoryCard()` around line ~1900
- Compare the HTML structure with `renderBudgetItem()`

**Key questions to answer:**
1. Is `.expense-category-details` getting the `hidden` class correctly?
2. Is the three-dots menu positioned correctly?
3. Is the chevron in the right place?

#### Step 3: Verify CSS
Check that these classes exist and are correct:
- `.budget-category-item` - container
- `.expense-category-header` - clickable header
- `.expense-category-details` - expandable section
- `.hidden` - display: none
- `.category-chevron` - rotation animation

### **MAIN IMPLEMENTATION (3-4 hours)**

Once layout is fixed, continue with:

#### 1. Add Event Handlers (30-45 mins)

**File:** `frontend/pages/home.js`

Add event delegation for the three-dots menus (similar to how it's done for movements):

```javascript
// Find where other event listeners are set up (around line 4000+)
// Add this in initialization section:

document.addEventListener('click', (e) => {
  // Handle three-dots button in Presupuesto tab
  if (e.target.closest('.three-dots-btn') && activeTab === 'presupuesto') {
    const btn = e.target.closest('.three-dots-btn');
    const categoryId = btn.dataset.categoryId;
    const menu = document.getElementById(`budget-menu-${categoryId}`);
    
    // Close other menus
    document.querySelectorAll('.three-dots-menu').forEach(m => {
      if (m !== menu) m.classList.remove('show');
    });
    
    menu.classList.toggle('show');
    e.stopPropagation();
  }
  
  // Handle menu item clicks
  if (e.target.dataset.action) {
    const action = e.target.dataset.action;
    
    switch(action) {
      case 'add-template':
        showTemplateFormModal(
          e.target.dataset.categoryId, 
          e.target.dataset.categoryName
        );
        break;
        
      case 'edit-template':
        showTemplateFormModal(
          null, 
          null, 
          e.target.dataset.templateId
        );
        break;
        
      case 'delete-template':
        handleDeleteTemplate(e.target.dataset.templateId);
        break;
        
      case 'add-budget':
      case 'edit-budget':
      case 'delete-budget':
        // These should already be implemented - verify they work
        break;
    }
    
    // Close menu
    document.querySelectorAll('.three-dots-menu').forEach(m => m.classList.remove('show'));
  }
});
```

#### 2. Create Template Form Modal (2-3 hours) - BIGGEST TASK

**File:** `frontend/pages/home.js`

This is complex because it has many dynamic sections. Reference the existing movement form for structure.

```javascript
async function showTemplateFormModal(categoryId, categoryName, templateId = null) {
  const isEdit = !!templateId;
  
  // Fetch form config (members, contacts, accounts)
  const formConfig = await fetchMovementFormConfig();
  
  // If editing, fetch template data
  let templateData = null;
  if (isEdit) {
    const response = await fetch(`/api/recurring-movements/${templateId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    templateData = await response.json();
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'template-form-modal';
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h3>${isEdit ? 'Editar' : 'Agregar'} Gasto Predefinido</h3>
        <button class="modal-close" onclick="document.getElementById('template-form-modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <form id="template-form">
          <!-- Name (required) -->
          <div class="form-group">
            <label>Nombre *</label>
            <input type="text" id="template-name" required 
                   value="${templateData?.name || ''}" 
                   placeholder="ej. Arriendo, Servicios, Netflix">
          </div>
          
          <!-- Category (read-only if creating, can change if editing) -->
          <div class="form-group">
            <label>Categoría</label>
            <select id="template-category" ${!isEdit ? 'disabled' : ''}>
              ${isEdit ? 
                formConfig.categories.map(cat => 
                  `<option value="${cat.id}" ${cat.id === templateData?.category_id ? 'selected' : ''}>${cat.name}</option>`
                ).join('') :
                `<option value="${categoryId}">${categoryName}</option>`
              }
            </select>
          </div>
          
          <!-- Movement Type -->
          <div class="form-group">
            <label>Tipo de movimiento *</label>
            <select id="template-type" required>
              <option value="SPLIT" ${templateData?.movement_type === 'SPLIT' ? 'selected' : ''}>División (SPLIT)</option>
              <option value="HOUSEHOLD" ${templateData?.movement_type === 'HOUSEHOLD' ? 'selected' : ''}>Hogar (HOUSEHOLD)</option>
              <option value="INCOME" ${templateData?.movement_type === 'INCOME' ? 'selected' : ''}>Ingreso (INCOME)</option>
              <option value="DEBT_PAYMENT" ${templateData?.movement_type === 'DEBT_PAYMENT' ? 'selected' : ''}>Pago de deuda (DEBT_PAYMENT)</option>
            </select>
          </div>
          
          <!-- Amount Type -->
          <div class="form-group">
            <label>Tipo de monto *</label>
            <select id="template-amount-type" required>
              <option value="FIXED" ${!templateData || templateData?.amount_type === 'FIXED' ? 'selected' : ''}>Fijo</option>
              <option value="VARIABLE" ${templateData?.amount_type === 'VARIABLE' ? 'selected' : ''}>Variable</option>
            </select>
          </div>
          
          <!-- Amount (only for FIXED) -->
          <div class="form-group" id="template-amount-group">
            <label>Monto *</label>
            <input type="number" id="template-amount" step="0.01" 
                   value="${templateData?.amount || ''}" 
                   placeholder="0.00">
          </div>
          
          <!-- Auto-generate toggle (only for FIXED) -->
          <div class="form-group" id="template-auto-generate-group">
            <label>
              <input type="checkbox" id="template-auto-generate" 
                     ${templateData?.auto_generate ? 'checked' : ''}>
              Auto-generar movimiento
            </label>
          </div>
          
          <!-- Recurrence (only if auto-generate is ON) -->
          <div class="form-group hidden" id="template-recurrence-group">
            <label>Recurrencia *</label>
            <select id="template-recurrence-type">
              <option value="MONTHLY" ${!templateData || templateData?.recurrence_type === 'MONTHLY' ? 'selected' : ''}>Mensual</option>
              <option value="YEARLY" ${templateData?.recurrence_type === 'YEARLY' ? 'selected' : ''}>Anual</option>
            </select>
          </div>
          
          <!-- Recurrence Day -->
          <div class="form-group hidden" id="template-recurrence-day-group">
            <label>Día de generación *</label>
            <input type="number" id="template-recurrence-day" min="1" max="31" 
                   value="${templateData?.recurrence_day || 1}">
            <small>Para mensual: 1-31. Para anual: día del año (1-365)</small>
          </div>
          
          <!-- Payer (for SPLIT, HOUSEHOLD, DEBT_PAYMENT) -->
          <div class="form-group hidden" id="template-payer-group">
            <label>Pagador *</label>
            <select id="template-payer-type">
              <option value="member">Miembro</option>
              <option value="contact">Contacto</option>
            </select>
            <select id="template-payer-id">
              <!-- Populated dynamically -->
            </select>
          </div>
          
          <!-- Participants (for SPLIT, HOUSEHOLD) -->
          <div class="form-group hidden" id="template-participants-group">
            <label>Participantes *</label>
            <div id="template-participants-list">
              <!-- Populated dynamically -->
            </div>
            <small>Total debe sumar 100%</small>
          </div>
          
          <!-- Recipient (for INCOME) -->
          <div class="form-group hidden" id="template-recipient-group">
            <label>Beneficiario *</label>
            <select id="template-recipient-id">
              ${formConfig.members.map(m => 
                `<option value="${m.id}">${m.name}</option>`
              ).join('')}
            </select>
          </div>
          
          <!-- Counterpart (for DEBT_PAYMENT) -->
          <div class="form-group hidden" id="template-counterpart-group">
            <label>Contraparte *</label>
            <select id="template-counterpart-type">
              <option value="member">Miembro</option>
              <option value="contact">Contacto</option>
            </select>
            <select id="template-counterpart-id">
              <!-- Populated dynamically -->
            </select>
          </div>
          
          <!-- Description (optional) -->
          <div class="form-group">
            <label>Descripción</label>
            <textarea id="template-description" rows="3">${templateData?.description || ''}</textarea>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('template-form-modal').remove()">Cancelar</button>
        <button class="btn-primary" id="template-form-submit">${isEdit ? 'Actualizar' : 'Crear'}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners for dynamic form behavior
  setupTemplateFormDynamics(formConfig, templateData);
}

function setupTemplateFormDynamics(formConfig, templateData) {
  // Amount type change
  document.getElementById('template-amount-type').addEventListener('change', (e) => {
    const isFixed = e.target.value === 'FIXED';
    document.getElementById('template-amount-group').classList.toggle('hidden', !isFixed);
    document.getElementById('template-auto-generate-group').classList.toggle('hidden', !isFixed);
    
    if (!isFixed) {
      document.getElementById('template-auto-generate').checked = false;
      document.getElementById('template-recurrence-group').classList.add('hidden');
      document.getElementById('template-recurrence-day-group').classList.add('hidden');
    }
  });
  
  // Auto-generate toggle
  document.getElementById('template-auto-generate').addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    document.getElementById('template-recurrence-group').classList.toggle('hidden', !isEnabled);
    document.getElementById('template-recurrence-day-group').classList.toggle('hidden', !isEnabled);
  });
  
  // Movement type change - show/hide relevant sections
  document.getElementById('template-type').addEventListener('change', (e) => {
    const type = e.target.value;
    
    // Hide all type-specific fields
    document.getElementById('template-payer-group').classList.add('hidden');
    document.getElementById('template-participants-group').classList.add('hidden');
    document.getElementById('template-recipient-group').classList.add('hidden');
    document.getElementById('template-counterpart-group').classList.add('hidden');
    
    // Show relevant fields
    if (type === 'SPLIT' || type === 'HOUSEHOLD' || type === 'DEBT_PAYMENT') {
      document.getElementById('template-payer-group').classList.remove('hidden');
    }
    
    if (type === 'SPLIT' || type === 'HOUSEHOLD') {
      document.getElementById('template-participants-group').classList.remove('hidden');
    }
    
    if (type === 'INCOME') {
      document.getElementById('template-recipient-group').classList.remove('hidden');
    }
    
    if (type === 'DEBT_PAYMENT') {
      document.getElementById('template-counterpart-group').classList.remove('hidden');
    }
  });
  
  // Payer type change - populate dropdown
  document.getElementById('template-payer-type').addEventListener('change', (e) => {
    const type = e.target.value;
    const dropdown = document.getElementById('template-payer-id');
    const options = type === 'member' ? formConfig.members : formConfig.contacts;
    dropdown.innerHTML = options.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  });
  
  // Counterpart type change
  document.getElementById('template-counterpart-type').addEventListener('change', (e) => {
    const type = e.target.value;
    const dropdown = document.getElementById('template-counterpart-id');
    const options = type === 'member' ? formConfig.members : formConfig.contacts;
    dropdown.innerHTML = options.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  });
  
  // Form submit
  document.getElementById('template-form-submit').addEventListener('click', async () => {
    await handleTemplateFormSubmit(templateData?.id);
  });
  
  // Trigger initial state based on template data or defaults
  document.getElementById('template-type').dispatchEvent(new Event('change'));
  document.getElementById('template-amount-type').dispatchEvent(new Event('change'));
  if (templateData?.auto_generate) {
    document.getElementById('template-auto-generate').dispatchEvent(new Event('change'));
  }
}

async function handleTemplateFormSubmit(templateId) {
  // Collect form data
  const formData = {
    name: document.getElementById('template-name').value.trim(),
    category_id: document.getElementById('template-category').value,
    movement_type: document.getElementById('template-type').value,
    amount_type: document.getElementById('template-amount-type').value,
    description: document.getElementById('template-description').value.trim() || null,
  };
  
  // Validate required fields
  if (!formData.name) {
    alert('El nombre es obligatorio');
    return;
  }
  
  // Add amount if FIXED
  if (formData.amount_type === 'FIXED') {
    const amount = parseFloat(document.getElementById('template-amount').value);
    if (!amount || amount <= 0) {
      alert('El monto debe ser mayor a 0 para montos fijos');
      return;
    }
    formData.amount = amount;
    
    // Add auto-generate and recurrence
    formData.auto_generate = document.getElementById('template-auto-generate').checked;
    
    if (formData.auto_generate) {
      formData.recurrence_type = document.getElementById('template-recurrence-type').value;
      formData.recurrence_day = parseInt(document.getElementById('template-recurrence-day').value);
      
      if (!formData.recurrence_day || formData.recurrence_day < 1) {
        alert('El día de recurrencia es obligatorio');
        return;
      }
    }
  } else {
    formData.auto_generate = false;
  }
  
  // Add type-specific fields
  const movementType = formData.movement_type;
  
  if (movementType === 'SPLIT' || movementType === 'HOUSEHOLD' || movementType === 'DEBT_PAYMENT') {
    const payerType = document.getElementById('template-payer-type').value;
    const payerId = document.getElementById('template-payer-id').value;
    
    if (payerType === 'member') {
      formData.payer_member_id = payerId;
    } else {
      formData.payer_contact_id = payerId;
    }
  }
  
  if (movementType === 'SPLIT' || movementType === 'HOUSEHOLD') {
    // Collect participants
    const participants = [];
    document.querySelectorAll('.participant-row').forEach(row => {
      const memberId = row.querySelector('.participant-member').value;
      const percentage = parseFloat(row.querySelector('.participant-percentage').value);
      if (memberId && percentage > 0) {
        participants.push({ member_id: memberId, percentage });
      }
    });
    
    // Validate percentages sum to 100
    const totalPercentage = participants.reduce((sum, p) => sum + p.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      alert('Los porcentajes deben sumar 100%');
      return;
    }
    
    formData.participants = participants;
  }
  
  if (movementType === 'INCOME') {
    formData.recipient_member_id = document.getElementById('template-recipient-id').value;
  }
  
  if (movementType === 'DEBT_PAYMENT') {
    const counterpartType = document.getElementById('template-counterpart-type').value;
    const counterpartId = document.getElementById('template-counterpart-id').value;
    
    if (counterpartType === 'member') {
      formData.counterpart_member_id = counterpartId;
    } else {
      formData.counterpart_contact_id = counterpartId;
    }
  }
  
  // Submit to API
  try {
    const url = templateId 
      ? `/api/recurring-movements/${templateId}` 
      : '/api/recurring-movements';
    const method = templateId ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(formData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al guardar template');
    }
    
    // Close modal
    document.getElementById('template-form-modal').remove();
    
    // Reload Presupuesto tab
    await loadBudgetsData();
    renderBudgets();
    
    showSuccessMessage(templateId ? 'Template actualizado' : 'Template creado');
  } catch (error) {
    console.error('Error submitting template:', error);
    alert(error.message);
  }
}
```

#### 3. Delete Template with Scope Modal (15-30 mins)

**File:** `frontend/pages/home.js`

Reuse the existing `showScopeModal()` function:

```javascript
async function handleDeleteTemplate(templateId) {
  // Fetch template to check if it has auto_generate
  const response = await fetch(`/api/recurring-movements/${templateId}`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  const template = await response.json();
  
  if (!template.auto_generate) {
    // Simple deletion (no scope needed)
    if (confirm('¿Seguro que deseas eliminar este gasto predefinido?')) {
      await deleteTemplateWithScope(templateId, 'THIS');
    }
    return;
  }
  
  // Show scope modal
  showScopeModal(
    'delete',
    null, // movementId (not needed for templates)
    async (scope) => {
      await deleteTemplateWithScope(templateId, scope);
    }
  );
}

async function deleteTemplateWithScope(templateId, scope) {
  try {
    const response = await fetch(`/api/recurring-movements/${templateId}?scope=${scope}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al eliminar template');
    }
    
    // Reload Presupuesto tab
    await loadBudgetsData();
    renderBudgets();
    
    showSuccessMessage('Template eliminado');
  } catch (error) {
    console.error('Error deleting template:', error);
    alert(error.message);
  }
}
```

---

## 📋 TESTING CHECKLIST

Once all is implemented, test these scenarios:

### Template Creation
- [ ] Create FIXED template with auto_generate=true (MONTHLY on day 1)
- [ ] Create FIXED template with auto_generate=false (manual only)
- [ ] Create VARIABLE template (should not show auto_generate option)
- [ ] Verify validation: name required, amount required for FIXED, percentages sum 100%

### Template Editing
- [ ] Edit FIXED auto-generated template → should show all fields pre-filled
- [ ] Edit VARIABLE template → amount field should be hidden
- [ ] Change from FIXED to VARIABLE → auto-generate should disappear
- [ ] Change movement type → relevant fields should show/hide

### Template Deletion
- [ ] Delete manual template → simple confirmation
- [ ] Delete auto-generated template → scope modal appears
- [ ] Delete with scope=THIS → only template deleted, movements stay
- [ ] Delete with scope=FUTURE → template + future movements deleted
- [ ] Delete with scope=ALL → template + all movements deleted

### UI/UX
- [ ] Templates display under categories when expanded
- [ ] Templates sorted: periodic first, then manual, then by amount
- [ ] "No hay gastos predefinidos" shows when no templates
- [ ] Three-dots menu works on categories
- [ ] Chevron rotates when expanding/collapsing

---

## 🐛 DEBUGGING COMMANDS

### Create test template via API
```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jose@example.com","password":"password123"}' | jq -r '.token')

# Get category ID
curl -s http://localhost:8080/api/budgets/2026-01 \
  -H "Authorization: Bearer $TOKEN" | jq '.budgets[0].category_id'

# Create FIXED auto-generated template
curl -X POST http://localhost:8080/api/recurring-movements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Arriendo",
    "category_id": "CATEGORY_ID_HERE",
    "movement_type": "SPLIT",
    "amount_type": "FIXED",
    "amount": 3200000,
    "auto_generate": true,
    "recurrence_type": "MONTHLY",
    "recurrence_day": 1,
    "payer_contact_id": "CONTACT_ID_HERE",
    "participants": [
      {"member_id": "MEMBER_ID_HERE", "percentage": 100}
    ]
  }'

# Create VARIABLE manual template
curl -X POST http://localhost:8080/api/recurring-movements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Servicios (Energía)",
    "category_id": "CATEGORY_ID_HERE",
    "movement_type": "SPLIT",
    "amount_type": "VARIABLE",
    "auto_generate": false,
    "payer_contact_id": "CONTACT_ID_HERE",
    "participants": [
      {"member_id": "MEMBER_ID_HERE", "percentage": 100}
    ]
  }'
```

### Check templates in DB
```bash
docker exec -it gastos-postgres psql -U postgres -d gastos -c \
  "SELECT id, name, amount_type, auto_generate, recurrence_type FROM recurring_movements;"
```

### Backend logs
```bash
docker logs -f gastos-backend
```

---

## 📚 REFERENCE FILES

**Key files to reference:**
- `frontend/pages/home.js` - Lines 2177-2283 (showScopeModal - reuse this)
- `frontend/pages/home.js` - Lines 2744-3147 (movement form modal - use as reference)
- `docs/design/08_RECURRING_MOVEMENTS_PHASE.md` - Complete spec
- `TEMPLATES_IMPLEMENTATION_PROGRESS.md` - Progress tracking

**Backend endpoints:**
- `GET /api/recurring-movements` - List all templates
- `GET /api/recurring-movements/{id}` - Get single template
- `POST /api/recurring-movements` - Create template
- `PUT /api/recurring-movements/{id}` - Update template
- `DELETE /api/recurring-movements/{id}?scope={scope}` - Delete template

**Testing:**
- `backend/tests/api-integration/test-recurring-movements.sh` - 23 tests passing
- Can manually create templates to test rendering before form is done

---

## ✅ WHEN DONE

Update these files:
1. `TEMPLATES_IMPLEMENTATION_PROGRESS.md` - Mark all steps complete
2. `docs/design/08_RECURRING_MOVEMENTS_PHASE.md` - Update "Overall Status" table
3. `RECURRING_MOVEMENTS_SUMMARY.md` - Add completion notes

Then test the full flow:
1. Create a template via UI
2. Verify it appears in the category
3. Edit the template
4. Use it in movement form (verify dropdown appears and prefills)
5. Delete the template with different scopes

---

## 🎯 CONTINUATION PROMPT FOR TOMORROW

**Copy/paste this to continue:**

```
Continue implementing the Templates Management UI in the Presupuesto tab. 

Current status:
- Template rendering is PARTIALLY working but layout is broken
- The "No hay gastos predefinidos" message appears in wrong location
- Need to fix HTML structure to match Gastos tab pattern

Steps:
1. First, debug and fix the layout issue (compare with Gastos tab renderCategoryCard)
2. Then add event handlers for three-dots menu
3. Then create the template form modal (2-3 hours - biggest task)
4. Finally, implement delete with scope modal

Reference file: TEMPLATES_UI_CONTINUATION.md for detailed instructions.
```

---

**Good luck tomorrow! 🚀**
