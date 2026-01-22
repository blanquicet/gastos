# Recurring Movements - Tareas Pendientes

**Última actualización:** 2026-01-25 22:55 UTC  
**Estado Backend:** ✅ COMPLETE (including optimization)  
**Estado Frontend:** ✅ 95% COMPLETE (Create/Delete implemented, Edit pending)  

---

## ✅ Completado

### Backend (100%)
- ✅ Migration 030: Added category_id to movements
- ✅ Migration 031: Created recurring_movement_templates table
- ✅ Migration 032: Added generated_from_template_id to movements
- ✅ Migration 033: Created recurring_movement_participants table
- ✅ Created `internal/recurringmovements` package (2,300+ lines)
- ✅ Implemented 8 HTTP endpoints (CRUD + pre-fill + manual trigger)
- ✅ Implemented scheduler (runs every 12 hours)
- ✅ Implemented role inversion logic (SPLIT → DEBT_PAYMENT)
- ✅ **OPTIMIZATION:** `/movement-form-config` includes templates map (single API call)
- ✅ Unit tests: 38 tests passing (11.3% coverage)
- ✅ Integration tests: 23 tests passing (including optimization test)

### Frontend - Movement Form (100%)
- ✅ Agregar campo "¿Cuál gasto periódico?" (dropdown)
- ✅ Fetch templates al seleccionar categoría (`GET /recurring-movements/by-category/:id`)
- ✅ Pre-llenar formulario al seleccionar template (`GET /recurring-movements/prefill/:id`)
- ✅ Manejar templates FIXED (amount disabled) vs VARIABLE (editable)
- ✅ Role inversion automático para DEBT_PAYMENT
- ✅ Clear template selection cuando cambia tipo de movimiento

**Archivos modificados:**
- `frontend/pages/registrar-movimiento.js` (+235 líneas)
- 5 funciones nuevas agregadas

### Frontend - Movement List (100%)
- ✅ Badge 🔁 en movimientos con `generated_from_template_id`
- ✅ Modal de scope para editar/eliminar con 3 opciones (THIS, FUTURE, ALL)
- ✅ Confirmación visual diferente para scope=ALL delete (fondo rojo)
- ✅ Integración con handlers de edit/delete

**Archivos modificados:**
- `frontend/pages/home.js` (+143 líneas)
- `frontend/styles.css` (+98 líneas)

### Frontend - Template Management UI (95% - Commit eeb1da0c5e0f)
- ✅ **Template Display** in Presupuesto tab as individual items
  - Display format: Name | Amount (or "Variable") | Schedule ("Cada día X" / "Manual")
  - Payment method badges (matching Gastos tab design)
  - Sorted by auto_generate first, then by amount
  - Visual design matches regular movements (no emoji, no special borders)
- ✅ **Template Creation Modal** - Full-featured form
  - All movement types: HOUSEHOLD, SPLIT, DEBT_PAYMENT
  - Fixed vs Variable amount selection
  - Auto-generate toggle with day-of-month picker (1-28)
  - Recurrence pattern (MONTHLY/YEARLY) with validation
  - Participant management for SPLIT movements
  - Payment method selection (conditional based on payer)
  - Dynamic field visibility based on selections
  - Integrated with MovementFormState component
  - Responsive mobile-friendly layout
  - Decimal precision (2 decimals for amounts/percentages)
- ✅ **Template Deletion** - Working with confirmation
  - Three-dots menu with proper positioning
  - Simple confirm() dialog
  - DELETE /api/recurring-movements/:id API integration
  - Templates reload after deletion
- ⚠️ **Template Editing** - Placeholder only (shows alert "por implementar")

**Archivos modificados (commit eeb1da0c5e0f):**
- `frontend/pages/home.js` (+600+ líneas)
- `frontend/pages/registrar-movimiento.js` (+30 líneas)
- `frontend/styles.css` (-11 líneas, cleanup)

**Stats:** 3 files changed, 682 insertions, 139 deletions

---

## 🔧 Tareas Pendientes

### 0. Frontend - Template Editing (Prioridad: **ALTA**) ⚠️

**Estado:** ⚠️ PLACEHOLDER - Shows alert "por implementar"

**Problema:** Users can create and delete templates, but cannot edit existing ones.

**Objetivo:** Implement edit template functionality

**Tareas:**
- [ ] Load template data via GET /api/recurring-movements/:id
- [ ] Populate showTemplateModal with existing template data
- [ ] Use PUT /api/recurring-movements/:id for updates
- [ ] Handle participants loading for SPLIT templates
- [ ] Reload templates after successful update

**Archivos a modificar:**
- `frontend/pages/home.js` - Update edit-template handler (currently line 2792)

**Tiempo estimado:** 1-2 hours

---

### 1. Template Delete with Scope Modal (Prioridad: MEDIA)

**Estado:** ⚠️ PARTIAL - Uses simple confirm(), no scope options

**Problema:** When deleting a template, users don't get scope options (THIS, FUTURE, ALL).

**Objetivo:** Add scope modal like movements have

**Tareas:**
- [ ] Replace simple confirm() with scope modal
- [ ] Show options: THIS (delete template only), FUTURE (deactivate future), ALL (delete all)
- [ ] Use DELETE /api/recurring-movements/:id?scope={scope}
- [ ] Visual confirmation for scope=ALL (red background)

**Archivos a modificar:**
- `frontend/pages/home.js` - Update delete-template handler (currently line 2795)

**Tiempo estimado:** 30 minutes

---

### 2. Frontend Optimizations (Prioridad: ALTA)

**A) Optimizar fetch de templates**
- ✅ Modificar `/movement-form-config` para incluir templates por categoría (BACKEND DONE)
- ✅ Actualizar frontend para usar templates del formConfig inicial
- ✅ Eliminar fetch individual por categoría (`fetchTemplatesByCategory()`)
- ✅ Un solo llamado inicial vs N llamadas (una por categoría)

**B) Arreglar limitaciones**
- ✅ Agregar loading spinner durante fetch de template prefill data
- ✅ Implementar scope parameter en edit form (extraer de URL y pasar a PUT)
- ✅ Mejorar confirmación para scope=ALL delete (advertencia adicional)

**Tiempo estimado:** 1-2 horas (backend ya completo) ✅ **COMPLETO**

---

### 2. Backend - "Saldar" Endpoint (Prioridad: MEDIA)

**Objetivo:** Endpoint para pre-llenar DEBT_PAYMENT desde Préstamos view

**Tareas:**
- [ ] Crear `GET /api/loans/debt-payment-prefill` endpoint
  - Modos: `single` (un movimiento) o `complete` (deuda completa persona-a-persona)
  - Parámetros: `?mode=single&movement_id=X` o `?mode=complete&from_user_id=X&to_user_id=Y`
- [ ] Detectar si movimiento tiene `generated_from_template_id`
  - Si tiene: Fetch template para pre-fill completo
  - Si no: Pre-fill solo con datos del movimiento (sin category/template)
- [ ] Generar descripción inteligente
  - Single: "Pago de {descripción_original}"
  - Complete: "Pago total: {nombre_from} a {nombre_to}"
- [ ] Agregar suma de deuda total para mode=complete

**Archivos a modificar:**
- `backend/internal/loans/handler.go` - Agregar nuevo endpoint
- `backend/internal/loans/service.go` - Lógica de pre-fill
- `backend/internal/httpserver/server.go` - Registrar endpoint

**Tests:**
- [ ] Integration test: Saldar movimiento con template
- [ ] Integration test: Saldar movimiento sin template
- [ ] Integration test: Saldar deuda completa (mismo template)
- [ ] Integration test: Saldar deuda completa (templates mixtos)

**Tiempo estimado:** 2 horas

---

### 4. Frontend - "Saldar" Integration (Prioridad: MEDIA)

**Objetivo:** Agregar botones "Saldar" en Préstamos view

**Tareas:**
- [ ] Agregar "Saldar deuda completa" a menú de tres puntos a nivel de persona
  - Al hacer click: Fetch pre-fill data (mode=complete)
- [ ] Agregar "Saldar" a menú de tres puntos a nivel de movimiento
  - Al hacer click: Fetch pre-fill data (mode=single)
- [ ] Guardar pre-fill data en sessionStorage
- [ ] Navegar a tab "Gastos" (cambiar tab activo)
- [ ] En Gastos tab:
  - Detectar sessionStorage con pre-fill data
  - Pre-llenar formulario completo
  - Si tiene template_id: Pre-seleccionar en dropdown SIN hacer fetch adicional
  - Permitir editar amount (pago parcial)
- [ ] Limpiar sessionStorage después de registrar o cancelar

**Archivos a modificar:**
- `frontend/pages/prestamos.js` - Agregar botones y fetch pre-fill
- `frontend/pages/gastos.js` - Detectar sessionStorage y pre-llenar
- `frontend/services/loanService.js` - Agregar función para fetch pre-fill

**Tiempo estimado:** 2-3 horas

---

### 5. E2E Testing (Prioridad: BAJA)

**Objetivo:** Probar flujos completos de usuario

**Tareas:**
- [ ] Test: Crear template FIXED con auto-generate
- [ ] Test: Esperar a que scheduler genere movimiento (o trigger manual)
- [ ] Test: Verificar movimiento aparece con badge 🔁
- [ ] Test: Editar movimiento con scope=FUTURE
- [ ] Test: Verificar template y movimientos futuros actualizados
- [ ] Test: Eliminar movimiento con scope=ALL
- [ ] Test: Verificar template desactivado y movimientos eliminados
- [ ] Test: Crear template VARIABLE y usarlo manualmente
- [ ] Test: "Saldar" movimiento con template
- [ ] Test: "Saldar" deuda completa

**Herramienta:** Playwright o Cypress (a definir)

**Tiempo estimado:** 3 horas

---

### 6. Initial Templates para Jose & Caro (Prioridad: BAJA)

**Objetivo:** Crear templates iniciales vía SQL

**Templates a crear:**
```sql
-- 1. Arriendo (SPLIT, FIXED 3.2M, auto-generate día 1 de cada mes)
INSERT INTO recurring_movement_templates (...) VALUES (...);

-- 2. Servicios (SPLIT, VARIABLE, manual only)
INSERT INTO recurring_movement_templates (...) VALUES (...);

-- 3. Internet (HOUSEHOLD, FIXED 85K, auto-generate día 5 de cada mes)
INSERT INTO recurring_movement_templates (...) VALUES (...);
```

**Tiempo estimado:** 30 minutos

---

### 7. Advanced Monitoring (Prioridad: BAJA)

**Objetivo:** Mejorar observabilidad del scheduler

**Tareas:**
- [ ] Agregar structured logging con request IDs
- [ ] Crear endpoint de health check para scheduler
  - `GET /api/recurring-movements/scheduler/health`
  - Retornar: última ejecución, templates procesados, errores
- [ ] Agregar métricas:
  - Count de templates por household
  - Count de movimientos generados por día
  - Intentos fallidos de generación
- [ ] Considerar tabla de audit log para scheduler runs

**Tiempo estimado:** 2 horas

---

## 📋 Orden Sugerido de Implementación

### Iteración 1: Core Frontend (4 horas)
1. Frontend - Movement Form (template dropdown + pre-fill)
2. Frontend - Movement List (badge + scope editing)

### Iteración 2: "Saldar" Feature (4-5 horas)
3. Backend - "Saldar" Endpoint
4. Frontend - "Saldar" Integration

### Iteración 3: Polish & Testing (4 horas)
5. E2E Testing
6. Initial Templates para Jose & Caro
7. Advanced Monitoring (opcional)

**Total estimado:** 12-13 horas

---

## 🚀 Próximo Paso Recomendado

**Comenzar con:** Frontend - Template Management UI (Tarea #0) 🚨

**Razón:** 
- ✅ Backend está 100% completo y tested
- ✅ Movement forms ya usan templates (dropdown + pre-fill working)
- ❌ **PERO** users no pueden crear templates desde la UI
- ❌ Current workaround: Direct DB inserts or API calls (not production-ready)

**Este es el único bloqueador para producción.** Una vez implementado, users podrán:
1. Crear templates desde Presupuesto tab
2. Configurar monto (FIXED/VARIABLE)
3. Configurar auto-generación (día del mes)
4. Ver/editar/eliminar templates existentes

**Alternativa:** Si quieres, puedo crear templates manualmente vía SQL para Jose & Caro mientras implementamos la UI.

**Decisiones necesarias:**
1. ¿Presupuesto tab o Hogar page para template management?
2. ¿Implementar Category Management también, o skip por ahora?
3. ¿Backend optimization para template_count en /budgets?

Ver `RECURRING_MOVEMENTS_FRONTEND_MANAGEMENT.md` para análisis completo de opciones.
