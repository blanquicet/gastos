# Continuation Prompt: Gastos View - Fix Category Grouping Issue & E2E Testing

## Context
The Gastos (household expenses) view has been implemented with a 3-level hierarchical grouping system (Category Groups → Sub-Categories → Movements). Category groups are centralized in the backend (`backend/internal/movements/types.go::GetDefaultCategoryGroups()`), and the frontend displays them with simplified names and progressive disclosure.

**Current Status:**
- ✅ Backend category mappings updated with 7 groups (Casa, Jose, Caro, Carro, Ahorros, Inversiones, Ocio)
- ✅ Frontend displays hierarchical grouped view
- ✅ Payment method badges styled and displayed
- ✅ Filter functionality implemented
- ✅ "Préstamo" category filtered out from view
- ✅ "Regalos" moved to Casa group
- 🔴 **ISSUE**: Categories appearing in "Otros" group instead of their assigned groups
- ⏳ E2E tests need to be updated/verified

## ✅ Problem Fixed

### Issue 1: Categories Appearing in Wrong Group (RESOLVED)
**Description:** Some categories (e.g., "Pago de SOAT/impuestos/mantenimiento") were displaying in an "Otros" group in the frontend, even though they were correctly mapped to "Carro" group in the backend.

**Root Cause Found:**
Line 790 in `getCategoryGroups()` function (`frontend/pages/home.js`) was filtering category groups to only show those with movements in the current month:
```javascript
const availableCategories = group.categories.filter(cat => allCategories.includes(cat));
```

This caused categories without movements to be excluded from the `categoryToGroup` lookup map, defaulting to "Otros" group.

**Fix Applied:**
Simplified `getCategoryGroups()` to directly return backend category groups from API response without any filtering:
```javascript
function getCategoryGroups() {
  if (movementsData?.category_groups && movementsData.category_groups.length > 0) {
    return movementsData.category_groups;
  }
  return [];
}
```

**Result:**
- All 7 groups (Casa, Jose, Caro, Carro, Ahorros, Inversiones, Ocio) now display correctly
- "Otros" only appears for genuinely ungrouped categories (e.g., "Gastos médicos")
- Categories without movements are still correctly mapped to their groups
- "Préstamo" remains hidden as intended

## Task 2: Update E2E Tests

After fixing the category grouping issue, update the E2E tests to cover:

1. **Gastos view default tab test**
   - Verify page loads with "Gastos" tab active by default
   - Verify movements are displayed

2. **Hierarchical grouping test**
   - Verify category groups are displayed (Casa, Jose, Caro, etc.)
   - Verify clicking a group expands to show sub-categories
   - Verify clicking a sub-category expands to show movements
   - Verify payment method badges are displayed

3. **Filter functionality test**
   - Test filtering by category groups
   - Test filtering by individual categories
   - Test filtering by payment method
   - Test "Todos" and "Limpiar" buttons

4. **Category exclusions test**
   - Verify "Préstamo" category is never displayed
   - Verify "Préstamo" is not in filter dropdown

5. **Month navigation test**
   - Verify changing months loads correct data
   - Verify month selection persists when switching tabs

## Files to Review/Modify

### Backend
- `backend/internal/movements/types.go` (lines 263-336): Category group definitions
- `backend/internal/movements/service.go` (line 227): Where category_groups are added to response
- `backend/internal/movements/repository.go`: Verify movement queries

### Frontend
- `frontend/pages/home.js`:
  - Lines 772-811: `getCategoryGroups()` - **PRIMARY SUSPECT**
  - Lines 688-745: `loadMovementsData()` - Check API call and response handling
  - Lines 946-1089: `renderMovementCategories()` - Check grouping logic
  - Lines 816-915: `renderMovementsFilterDropdown()` - Filter UI generation
  - Lines 974-993: Where "Otros" group is created for ungrouped categories

### Tests
- `backend/tests/e2e/*.spec.js`: E2E test files that need updates

## Key Category Mappings (for reference)

```go
// backend/internal/movements/types.go
Casa: 7 categories (Casa - Gastos fijos, Casa - Provisionar mes entrante, Casa - Cositas para casa, Casa - Imprevistos, Kellys, Mercado, Regalos)
Jose: 3 categories (Jose - Vida cotidiana, Jose - Gastos fijos, Jose - Imprevistos)
Caro: 3 categories (Caro - Vida cotidiana, Caro - Gastos fijos, Caro - Imprevistos)
Carro: 4 categories (Uber/Gasolina/Peajes/Parqueaderos, Pago de SOAT/impuestos/mantenimiento, Carro - Seguro, Carro - Imprevistos)
Ahorros: 4 categories (Ahorros para SOAT/impuestos/mantenimiento, Ahorros para cosas de la casa, Ahorros para vacaciones, Ahorros para regalos)
Inversiones: 3 categories (Inversiones Caro, Inversiones Jose, Inversiones Juntos)
Ocio: 2 categories (Vacaciones, Salidas juntos)
Ungrouped: Gastos médicos
Hidden: Préstamo
```

## How to Get Household ID (for testing)

```javascript
// In browser DevTools console:
localStorage.getItem('householdId')
```

Or check Network tab → `/api/v1/movements` request → URL parameter

## Testing Checklist

- [ ] Fix category grouping issue
- [ ] Verify all 7 groups display correctly
- [ ] Verify "Préstamo" is hidden
- [ ] Verify ungrouped categories work
- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Test filter functionality
- [ ] Test month navigation
- [ ] Update E2E tests for gastos view
- [ ] Run E2E tests and verify they pass
- [ ] Update documentation if changes are made

## Documentation
See `GASTOS_VIEW_IMPLEMENTATION.md` for full implementation details.
