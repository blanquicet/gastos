# Phase 11: Onboarding Wizard

## Problema

Cuando un usuario nuevo se registra y crea su hogar, queda en la página de perfil sin saber qué hacer. No hay guía de los pasos necesarios para empezar a usar la app.

## Solución

Onboarding en dos partes:
1. **Modal wizard** — Aparece una sola vez después de crear el hogar, guía paso a paso
2. **Checklist persistente** — Banner en home (estilo link-request-banner) hasta completar setup

## Estilo Visual

Reutilizar el estilo de `.link-request-banner` (dark cards con gradient `#374151 → #4b5563`, icono en cuadro con fondo semi-transparente, título blanco, subtítulo gris).

### Wizard (modal con slides)

```
┌──────── Modal Overlay ────────┐
│  ┌─────────────────────────┐  │
│  │  Dark card (banner style) │  │
│  │  📂  Categorías           │  │
│  │  Ya creamos categorías    │  │
│  │  comunes para ti          │  │
│  │                           │  │
│  │  ● ○ ○ ○ ○  (1/5)        │  │
│  │                           │  │
│  │  [Siguiente →]            │  │
│  │  Omitir                   │  │
│  └─────────────────────────┘  │
└───────────────────────────────┘
```

### Checklist (banner en home)

```
┌── Dark banner (link-request-banner style) ──┐
│ 📋  Configura tu hogar (2/5)         ✕     │
│     Siguiente: Agregar método de pago  ›     │
└─────────────────────────────────────────────┘
```

Al hacer click, navega al paso pendiente. Al completar todos, desaparece.

## Pasos del Onboarding

| # | Icono | Título | Descripción | Acción |
|---|-------|--------|-------------|--------|
| 1 | 📂 | Categorías | Ya creamos categorías comunes. Personaliza en Mi hogar | Informativo |
| 2 | 💳 | Método de pago | Para registrar gastos necesitas al menos uno | Botón → abre modal existente |
| 3 | 🏦 | Cuenta bancaria | Para ingresos y recibir pagos | Botón → abre modal existente |
| 4 | 👥 | Miembros y contactos | Miembros comparten finanzas, contactos son externos | Informativo + link /hogar |
| 5 | ✨ | ¡Listo! | Ya puedes registrar tu primer gasto | Botón → /registrar-movimiento |

## Detección de Completitud

| Paso | Fuente de datos | Condición |
|------|----------------|-----------|
| Categorías | Siempre ✅ | Pre-creadas automáticamente |
| Método de pago | formConfig.payment_methods | `length > 0` |
| Cuenta bancaria | formConfig.accounts | `length > 0` |
| Miembros/contactos | localStorage | flag `onboarding_step4_done` |
| Primer gasto | movementsData | `movements.length > 0` |

## Implementación

### 1. Modal wizard + CSS

**Archivo**: `frontend/pages/home.js`, `frontend/styles.css`

- Crear función `showOnboardingWizard()` con 5 pasos
- Reutilizar clase `.link-request-banner` para el estilo de cada step card
- Modal overlay con card central que cambia de contenido (slides)
- Step indicator (dots) y botones Anterior/Siguiente
- Pasos 2-3: botón "Agregar ahora" abre modal existente de profile.js
- "Omitir" cierra y guarda `onboarding_wizard_completed` en localStorage
- Agregar `data-testid="onboarding-wizard"` y `data-testid="skip-wizard"` para e2e tests
- Al final: recarga home para mostrar checklist

### 2. Checklist banner en home

**Archivo**: `frontend/pages/home.js`

- Función `renderOnboardingChecklist()` 
- Un solo banner (estilo link-request-banner) que muestra progreso y siguiente paso
- Se inserta antes del contenido de tabs en `setup()` si no está completada
- Detecta estado de cada paso via datos ya cargados (formConfig, movements)
- Click → navega/ejecuta la acción del paso pendiente
- ✕ para cerrar (guarda `onboarding_dismissed` en localStorage)
- Auto-desaparece cuando todos los pasos están ✅

### 3. Conectar wizard con creación de hogar

**Archivo**: `frontend/pages/home.js`

- Después de crear hogar exitosamente, llamar `showOnboardingWizard()` en vez de redirigir a /perfil
- Actualizar handler del botón "Crear mi hogar" en `renderNoHouseholdState()`

### 4. Actualizar E2E tests

**Archivos**: `backend/tests/e2e/*.js` (todos los que crean hogar)

Los 18 tests e2e crean hogares como parte del setup y asumen que después de crear el hogar pueden navegar inmediatamente. El wizard modal rompería este flujo.

Agregar en cada test que crea hogar, después del success modal:

```javascript
// Handle onboarding wizard if it appears
const wizardSkip = page.locator('[data-testid="skip-wizard"]');
if (await wizardSkip.isVisible({ timeout: 2000 }).catch(() => false)) {
  await wizardSkip.click();
  await page.waitForTimeout(500);
}
```

## Sin cambios en backend

Todo es frontend. Las categorías ya se pre-crean automáticamente via `GetDefaultCategories()`. Los modals de crear método de pago y cuenta ya existen en `profile.js`.
