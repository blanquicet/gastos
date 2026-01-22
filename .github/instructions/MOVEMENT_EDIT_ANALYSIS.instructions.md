# Análisis: Implementación de Edición de Gastos

> **Status:** ✅ COMPLETE (2026-01-07)
>
> La funcionalidad de editar y eliminar gastos está completamente implementada
> tanto en backend como frontend.

## Resumen
Funcionalidad completa para editar gastos desde el dashboard, similar a como funciona con ingresos.

---

## 1. Backend - Estado Actual ✅ COMPLETE

### Endpoints Existentes
El backend tiene implementada la funcionalidad de edición:

```
PATCH /movements/{id}
DELETE /movements/{id}
GET /movements/{id}
```

### Estructura de Actualización

**UpdateMovementInput** (ya existe en `backend/internal/movements/types.go`):
```go
type UpdateMovementInput struct {
    Description  *string    `json:"description,omitempty"`
    Amount       *float64   `json:"amount,omitempty"`
    Category     *string    `json:"category,omitempty"`
    MovementDate *time.Time `json:"movement_date,omitempty"`
    // Note: No se puede actualizar type, payer, counterparty, o payment_method
}
```

### Limitaciones de Edición (por diseño)
**NO se pueden editar** los siguientes campos:
- `type` (HOUSEHOLD, SPLIT, DEBT_PAYMENT)
- `payer_user_id` / `payer_contact_id`
- `counterparty_user_id` / `counterparty_contact_id`
- `payment_method_id`

**Razón**: Estos campos son fundamentales para la estructura del movimiento. Cambiarlos requeriría validaciones complejas y podría crear inconsistencias.

### ✅ Backend Completado
- ✅ Handler: `HandleUpdate` implementado
- ✅ Service: `Update` con validación y autorización
- ✅ Repository: `Update` con SQL dinámico
- ✅ Validaciones: amount > 0, description no vacía
- ✅ Autorización: Verifica que el usuario pertenezca al household

---

## 2. Tests Backend - Completado ✅

### Tests Implementados

#### 2.1. Unit Tests (Completado)
**Ubicación**: `backend/internal/movements/service_test.go`

Casos de prueba:
1. ✅ Actualizar descripción exitosamente
2. ✅ Actualizar monto exitosamente
3. ✅ Actualizar categoría exitosamente
4. ✅ Actualizar fecha exitosamente
5. ✅ Actualizar múltiples campos a la vez
6. ✅ Error: monto inválido (≤ 0)
7. ✅ Error: descripción vacía
8. ✅ Error: movimiento no encontrado
9. ✅ Error: usuario sin autorización (otro household)
10. ✅ No cambios (retorna movimiento actual)

#### 2.2. Integration Tests (Completado)
**Ubicación**: Incluidos en los 41 tests de integración

Casos de prueba:
1. ✅ PATCH /movements/{id} - Actualización exitosa
2. ✅ PATCH /movements/{id} - 401 sin autenticación
3. ✅ PATCH /movements/{id} - 403 sin autorización
4. ✅ PATCH /movements/{id} - 404 movimiento no existe
5. ✅ PATCH /movements/{id} - 400 validación falla
6. ✅ Verificar que updated_at se actualiza

#### 2.3. E2E Tests (Mejorar)
**Ubicación**: `backend/tests/e2e/movement-familiar.js` (ya existe)

**Agregar nuevo Step 11**:
```javascript
// STEP 11: Test Movement Edit
console.log('📝 Step 11: Testing movement edit...');

// Navigate to home
await page.goto(`${appUrl}/`);
await page.waitForTimeout(2000);

// Click Gastos tab
const gastosTab = page.locator('button.tab-btn').filter({ hasText: 'Gastos' });
await gastosTab.click();
await page.waitForTimeout(1500);

// Find "Mercado del mes" movement and click edit
// Click three-dots menu
await page.locator('[data-movement-id="..."]').locator('.three-dots-btn').click();
await page.waitForTimeout(300);

// Click "Editar" option
await page.locator('.three-dots-menu .menu-item[data-action="edit"]').click();
await page.waitForTimeout(1000);

// Should navigate to edit form (new page or modal)
// Verify form is pre-filled with current values
const descriptionValue = await page.locator('#descripcion').inputValue();
if (descriptionValue !== 'Mercado del mes') {
  throw new Error('Description not pre-filled correctly');
}

// Edit description and amount
await page.locator('#descripcion').fill('Mercado mensual editado');
await page.locator('#valor').fill('280000'); // Changed from 250000

// Submit changes
await page.locator('#submitBtn').click();
await page.waitForTimeout(2000);

// Verify success message
const statusText = await page.locator('#status').textContent();
if (!statusText.includes('actualizado')) {
  throw new Error('Expected update success message');
}

// Navigate back to dashboard and verify changes
await page.goto(`${appUrl}/`);
await page.waitForTimeout(2000);

// Verify new description and amount
// (similar logic to Step 9 but checking for "Mercado mensual editado" and $280,000)

console.log('✅ Movement edit verified');
```

---

## 3. Frontend - Completado ✅

### 3.1. Home Page (Dashboard) - Implementado

**Archivo**: `frontend/pages/home.js`

#### ✅ Cambio 1: Three-Dots Menu en Movements (Implementado)
Three-dots menu agregado a cada entrada de movimiento con opciones de editar y eliminar.
```javascript
<div class="movement-detail-entry">
  <div class="entry-info">
    <span class="entry-description">${movement.description || 'Sin descripción'}</span>
    <span class="entry-amount">${formatCurrency(movement.amount)}</span>
    <div class="entry-date">${formatDate(movement.movement_date)}</div>
  </div>
  <div class="entry-actions">
    ${movement.payment_method_name ? `<span class="entry-payment-badge">${movement.payment_method_name}</span>` : ''}
  </div>
</div>
```

**Cambiar a**:
```javascript
<div class="movement-detail-entry">
  <div class="entry-info">
    <span class="entry-description">${movement.description || 'Sin descripción'}</span>
    <span class="entry-amount">${formatCurrency(movement.amount)}</span>
    <div class="entry-date">${formatDate(movement.movement_date)}</div>
  </div>
  <div class="entry-actions">
    ${movement.payment_method_name ? `<span class="entry-payment-badge">${movement.payment_method_name}</span>` : ''}
    <button class="three-dots-btn" data-movement-id="${movement.id}">⋮</button>
    <div class="three-dots-menu" id="movement-menu-${movement.id}">
      <button class="menu-item" data-action="edit" data-id="${movement.id}">Editar</button>
      <button class="menu-item" data-action="delete" data-id="${movement.id}">Eliminar</button>
    </div>
  </div>
</div>
```

#### Cambio 2: Agregar Event Listeners para Movement Three-Dots
**Ubicación**: Función `setupCategoryListeners()` (línea ~1145)

**Agregar después de los listeners de income**:
```javascript
// Movement three-dots menu toggle
document.querySelectorAll('.three-dots-btn[data-movement-id]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const movementId = e.currentTarget.dataset.movementId;
    const menu = document.getElementById(`movement-menu-${movementId}`);
    
    // Close all other menus
    document.querySelectorAll('.three-dots-menu').forEach(m => {
      if (m.id !== `movement-menu-${movementId}`) {
        m.style.display = 'none';
      }
    });
    
    // Toggle this menu
    if (menu) {
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
  });
});

// Movement three-dots menu actions
document.querySelectorAll('.three-dots-menu .menu-item[data-action]').forEach(btn => {
  // Only for movement menus (not income)
  if (!btn.closest('[id^="movement-menu-"]')) return;
  
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const action = e.currentTarget.dataset.action;
    const id = e.currentTarget.dataset.id;

    // Close menu
    document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');

    if (action === 'edit') {
      await handleEditMovement(id);
    } else if (action === 'delete') {
      await handleDeleteMovement(id);
    }
  });
});
```

#### Cambio 3: Implementar `handleEditMovement`
**Ubicación**: Después de `handleDeleteIncome` (línea ~1320)

```javascript
/**
 * Handle edit movement
 */
async function handleEditMovement(movementId) {
  // Navigate to edit form with movement ID
  router.navigate(`/registrar-movimiento?tipo=GASTO&edit=${movementId}`);
}
```

#### Cambio 4: Implementar `handleDeleteMovement`
**Ubicación**: Después de `handleEditMovement`

```javascript
/**
 * Handle delete movement
 */
async function handleDeleteMovement(movementId) {
  const confirmed = await showConfirmation(
    '¿Estás seguro?',
    'Esta acción no se puede deshacer.'
  );
  
  if (!confirmed) return;

  try {
    const response = await fetch(`/movements/${movementId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Error al eliminar el movimiento');
    }

    showSuccess('Movimiento eliminado correctamente');
    
    // Refresh movements data
    await loadMovements();
    refreshDisplay();
    
  } catch (error) {
    console.error('Error deleting movement:', error);
    showError(error.message || 'Error al eliminar el movimiento');
  }
}
```

### 3.2. Movement Form Page - Modificaciones

**Archivo**: `frontend/pages/registrar-movimiento.js`

#### Cambio 1: Detectar Modo Edición
**Ubicación**: Inicio de `render()` o `mount()`

```javascript
export function mount() {
  // Check if we're in edit mode
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('edit');
  const isEditMode = !!editId;
  
  if (isEditMode) {
    loadMovementForEdit(editId);
  }
  
  // ... resto del código
}
```

#### Cambio 2: Cargar Movimiento para Edición
**Ubicación**: Nueva función

```javascript
/**
 * Load movement data for editing
 */
async function loadMovementForEdit(movementId) {
  try {
    const response = await fetch(`/movements/${movementId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Error al cargar el movimiento');
    }
    
    const movement = await response.json();
    
    // Store in global state
    currentEditMovement = movement;
    
    // Pre-fill form fields
    document.getElementById('descripcion').value = movement.description || '';
    document.getElementById('valor').value = movement.amount || '';
    
    if (movement.category) {
      const categoriaSelect = document.getElementById('categoria');
      if (categoriaSelect) {
        categoriaSelect.value = movement.category;
      }
    }
    
    if (movement.movement_date) {
      const dateInput = document.getElementById('fecha');
      if (dateInput) {
        // Convert to YYYY-MM-DD format
        const date = new Date(movement.movement_date);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
      }
    }
    
    // Update button text
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.textContent = 'Actualizar Movimiento';
    }
    
    // Update page title
    const pageTitle = document.querySelector('h1');
    if (pageTitle) {
      pageTitle.textContent = 'Editar Movimiento';
    }
    
    // Note: Cannot edit payment method, payer, type
    // Disable those fields
    const paymentMethodSelect = document.getElementById('metodo');
    if (paymentMethodSelect) {
      paymentMethodSelect.disabled = true;
      paymentMethodSelect.title = 'No se puede cambiar el método de pago';
    }
    
  } catch (error) {
    console.error('Error loading movement:', error);
    showError('Error al cargar el movimiento para editar');
    router.navigate('/');
  }
}
```

#### Cambio 3: Modificar Función de Submit
**Ubicación**: Función `handleSubmit` o similar

```javascript
async function handleSubmit(e) {
  e.preventDefault();
  
  const isEditMode = !!currentEditMovement;
  
  // Gather form data
  const formData = {
    description: document.getElementById('descripcion').value,
    amount: parseFloat(document.getElementById('valor').value),
    category: document.getElementById('categoria').value,
    movement_date: document.getElementById('fecha').value,
  };
  
  try {
    let response;
    
    if (isEditMode) {
      // PATCH /movements/{id}
      response = await fetch(`/movements/${currentEditMovement.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
    } else {
      // POST /movements (existing create logic)
      response = await fetch('/movements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(fullMovementData) // includes payer, payment_method, etc.
      });
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }
    
    const successMessage = isEditMode 
      ? 'Movimiento actualizado correctamente'
      : 'Movimiento registrado correctamente';
    
    showSuccess(successMessage);
    
    // Reset and navigate
    currentEditMovement = null;
    router.navigate('/');
    
  } catch (error) {
    console.error('Error submitting movement:', error);
    showError(error.message || 'Error al guardar el movimiento');
  }
}
```

### 3.3. CSS - Reutilizar Estilos Existentes ✅

Los estilos de `.three-dots-btn`, `.three-dots-menu`, `.menu-item` ya están definidos en `frontend/styles.css` para los ingresos. Solo necesitamos asegurarnos de que sean reutilizables.

**Verificar** que estos estilos NO estén acoplados a `.income-detail-entry` y funcionen también con `.movement-detail-entry`.

Si es necesario, agregar:
```css
/* Ensure three-dots work for both income and movement entries */
.income-detail-entry .three-dots-btn,
.movement-detail-entry .three-dots-btn {
  /* existing styles */
}

.income-detail-entry .three-dots-menu,
.movement-detail-entry .three-dots-menu {
  /* existing styles */
}
```

---

## 4. Plan de Implementación

### Fase 1: Backend Tests (Prioridad Alta)
1. ✅ Crear unit tests para `service.Update()`
2. ✅ Crear integration tests para `PATCH /movements/{id}`
3. ✅ Ejecutar tests y verificar coverage

### Fase 2: E2E Tests (Prioridad Media)
1. ✅ Mejorar `movement-familiar.js` con Step 11 (edit test)
2. ✅ Ejecutar E2E test completo

### Fase 3: Frontend - Dashboard (Prioridad Alta)
1. ✅ Agregar three-dots menu a movement entries
2. ✅ Implementar event listeners
3. ✅ Implementar `handleEditMovement`
4. ✅ Implementar `handleDeleteMovement`

### Fase 4: Frontend - Edit Form (Prioridad Alta)
1. ✅ Detectar modo edición via URL param `?edit={id}`
2. ✅ Implementar `loadMovementForEdit`
3. ✅ Pre-fill form fields
4. ✅ Modificar submit handler para PATCH vs POST
5. ✅ Deshabilitar campos no editables

### Fase 5: Testing Manual (Prioridad Alta)
1. ✅ Crear movimiento FAMILIAR
2. ✅ Editar desde dashboard
3. ✅ Verificar que cambios se reflejan
4. ✅ Probar validaciones (monto negativo, descripción vacía)
5. ✅ Probar delete
6. ✅ Verificar que campos bloqueados no se pueden editar

### Fase 6: Limpieza y Documentación
1. ✅ Actualizar README con nueva funcionalidad
2. ✅ Commit y push

---

## 5. Limitaciones y Notas

### Limitaciones de Edición
Como se mencionó, NO se pueden editar:
- Tipo de movimiento (HOUSEHOLD, SPLIT, DEBT_PAYMENT)
- Pagador (payer)
- Contraparte (counterparty) - solo para DEBT_PAYMENT
- Método de pago

**Para estos cambios**, el usuario debe:
1. Eliminar el movimiento actual
2. Crear uno nuevo con los datos correctos

### Movimientos SPLIT
Para movimientos tipo SPLIT con participantes:
- La edición solo afecta los campos básicos (descripción, monto, categoría, fecha)
- Los participantes y sus porcentajes NO se pueden editar desde esta pantalla
- Si se cambia el monto, los porcentajes se mantienen pero las cantidades por participante cambiarán

**Futura mejora**: Pantalla dedicada para editar participantes de SPLIT movements.

### Sincronización con Google Sheets
Como indica el código del backend:
```go
// Note: We don't dual-write updates to n8n for now
// Google Sheets will have the original data until migration
```

Los cambios **NO se sincronizan** con Google Sheets. Solo afectan la base de datos PostgreSQL.

---

## 6. Archivos a Modificar

### Backend
- ❌ Ninguno (ya está implementado)

### Backend Tests (CREAR)
- 📝 `backend/internal/movements/service_test.go` - unit tests para Update
- 📝 `backend/tests/integration/movements_test.go` - integration tests
- 📝 `backend/tests/e2e/movement-familiar.js` - agregar Step 11

### Frontend (MODIFICAR)
- 📝 `frontend/pages/home.js`
  - Agregar three-dots menu en movements
  - Implementar event listeners
  - Implementar handleEditMovement
  - Implementar handleDeleteMovement
  
- 📝 `frontend/pages/registrar-movimiento.js`
  - Detectar modo edición
  - Cargar movimiento para editar
  - Pre-fill form
  - Modificar submit para PATCH
  - Deshabilitar campos no editables

### CSS (VERIFICAR)
- 📝 `frontend/styles.css` - verificar que estilos three-dots sean reutilizables

---

## 7. Estimación de Esfuerzo

| Fase | Esfuerzo | Prioridad |
|------|----------|-----------|
| Backend Tests | 2-3 horas | Alta |
| E2E Tests | 1 hora | Media |
| Frontend Dashboard | 2 horas | Alta |
| Frontend Edit Form | 3 horas | Alta |
| Testing Manual | 1 hora | Alta |
| **TOTAL** | **9-10 horas** | - |

---

## 8. Siguiente Paso Recomendado

**Empezar por Backend Tests** para asegurar que la funcionalidad existente funciona correctamente antes de construir el frontend sobre ella.

1. ✅ Crear `backend/internal/movements/service_test.go`
2. ✅ Implementar los 10 casos de prueba unitarios
3. ✅ Ejecutar `go test ./internal/movements/...`
4. ✅ Verificar coverage > 80%

Luego proceder con el frontend.
