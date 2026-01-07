# Gastos View Implementation Summary

## Date
2026-01-07

## Overview
Implemented the "Gastos" (Household Movements) view in the Resume/Home page with hierarchical category grouping (3-level: Category Groups → Sub-Categories → Individual Movements). Category groups are centralized in the backend for consistency.

## Key Features Implemented

### 1. Default Tab
- ✅ Changed default active tab from "Ingresos" to "Gastos"
- Page now loads with gastos view by default

### 2. Data Loading
- ✅ Added `loadMovementsData()` function
- ✅ Fetches HOUSEHOLD movements from `/movements?type=HOUSEHOLD&month=YYYY-MM`
- ✅ API response includes `category_groups` from backend
- ✅ Client-side filtering by category and payment method

### 3. Hierarchical Category Display (3-Level Grouping)
- ✅ **Level 1: Category Groups** (Casa, Jose, Caro, Carro, Ahorros, Inversiones, Ocio)
  - Group icon, name, total amount, percentage of all expenses
  - Click to expand/collapse categories within the group
- ✅ **Level 2: Sub-Categories** (e.g., "Gastos fijos", "Vida cotidiana")
  - Simplified category names (prefix stripped: "Casa - Gastos fijos" → "Gastos fijos")
  - Category icon, name, total amount, percentage relative to group total
  - Click to expand/collapse individual movements
- ✅ **Level 3: Individual Movements**
  - Description, amount, date, payment method badge
- ✅ Ungrouped categories display as top-level cards (e.g., "Gastos médicos")
- ✅ "Préstamo" category is filtered out (hidden from view)

### 4. Backend Category Groups Centralization
- ✅ Added `CategoryGroup` struct in `backend/internal/movements/types.go`
- ✅ Added `GetDefaultCategoryGroups()` function with hardcoded mappings:
  - **Casa** (7 categories): Casa - Gastos fijos, Casa - Provisionar mes entrante, Casa - Cositas para casa, Casa - Imprevistos, Kellys, Mercado, Regalos
  - **Jose** (3 categories): Jose - Vida cotidiana, Jose - Gastos fijos, Jose - Imprevistos
  - **Caro** (3 categories): Caro - Vida cotidiana, Caro - Gastos fijos, Caro - Imprevistos
  - **Carro** (4 categories): Uber/Gasolina/Peajes/Parqueaderos, Pago de SOAT/impuestos/mantenimiento, Carro - Seguro, Carro - Imprevistos
  - **Ahorros** (4 categories): Ahorros para SOAT/impuestos/mantenimiento, Ahorros para cosas de la casa, Ahorros para vacaciones, Ahorros para regalos
  - **Inversiones** (3 categories): Inversiones Caro, Inversiones Jose, Inversiones Juntos
  - **Ocio** (2 categories): Vacaciones, Salidas juntos
  - **Ungrouped** (1 category): Gastos médicos
  - **Hidden** (1 category): Préstamo (filtered out in frontend)
- ✅ Modified `ListByHousehold()` to include category_groups in API response
- ✅ Frontend uses API response category_groups (no hardcoded grouping logic)
- 📝 TODO: Move category groups to database per-household when implementing category management UI

### 5. Category Icons
- ✅ **Category Group Icons**: Casa 🏠, Jose 👨, Caro 👩, Carro 🚗, Ahorros 🏦, Inversiones 📈, Ocio 🎉
- ✅ **Individual Category Icons** (26 categories mapped):
  - Casa: 🏠 💰 🏡 ⚡ 🧹 🛒 🎁
  - Jose: 👨 👨‍💼 ⚡
  - Caro: 👩 👩‍💼 ⚡
  - Carro: 🚗 📋 🛡️ ⚡
  - Ahorros: 🏦 (all 4 categories)
  - Inversiones: 📈 (all 3 categories)
  - Ocio: ✈️ 🍽️
  - Ungrouped: ⚕️ 💸
  - Fallback: 💵

### 6. Movement Entry Display
- ✅ Show: Description, Amount, Date
- ✅ Display payment method badge (right-aligned, blue color)
- ✅ Badge styling merged with member badge (shared base styles)
- ✅ NO three-dots menu (no edit/delete actions)

### 7. Filter Functionality
- ✅ Filter by **category** (multi-select)
  - Grouped by backend category groups
  - Group checkboxes to select/deselect entire groups
  - Expandable/collapsible category groups
  - "Préstamo" excluded from filter options
- ✅ Filter by **payment method** (multi-select)
  - Dynamically populated from loaded movement data
- ✅ "Todos" and "Limpiar" buttons for each filter section
- ✅ "Mostrar todo" button to reset all filters
- ✅ "Aplicar" button to apply selected filters

### 8. Empty State
- ✅ Shows "No hay gastos registrados este mes" when no data
- ✅ "+ Agregar gasto" button that redirects to `/registrar-movimiento?tipo=GASTO`

### 8. Month Navigation
- ✅ Reused month selector from income view
- ✅ Updates movements data when changing months
- ✅ Shows loading state during data fetch

### 9. Tab Switching
- ✅ Maintains separate data for gastos and ingresos tabs
- ✅ Loads data on-demand when switching tabs
- ✅ Preserves month selection across tabs

## Code Changes

### Files Modified

1. **frontend/pages/home.js**
   - Changed default tab: `activeTab = 'gastos'`
   - Added state variables:
     - `selectedCategories`
     - `selectedPaymentMethods`
   - New functions:
     - `loadMovementsData()` - Load HOUSEHOLD movements
     - `groupCategories()` - Group categories by prefix
     - `renderMovementsFilterDropdown()` - Filter UI for gastos
     - `renderMovementCategories()` - Display gastos categories
     - `setupMovementsFilterListeners()` - Handle filter interactions
   - Updated functions:
     - `render()` - Show gastos content by default
     - `refreshDisplay()` - Handle both gastos and ingresos
     - `setupCategoryListeners()` - Handle both tab types
     - `setupFilterListeners()` - Dispatch to tab-specific handlers
     - `setupMonthNavigation()` - Load correct data based on active tab
     - `setup()` - Load movements data on initial load

2. **frontend/styles.css**
   - Added `.entry-payment-badge` style:
     - Light blue background (#e0f2fe)
     - Blue text (#0369a1)
     - Same size/shape as member badge

## API Integration

### Endpoint Used
```
GET /movements?type=HOUSEHOLD&month=YYYY-MM
```

### Response Structure
```javascript
{
  "movements": [
    {
      "id": "uuid",
      "type": "HOUSEHOLD",
      "description": "Mercado luego de vacaciones",
      "amount": 404390,
      "category": "Mercado",
      "movement_date": "2026-01-05T00:00:00Z",
      "payer_name": "Jose",
      "payment_method_id": "uuid",
      "payment_method_name": "Nequi Jose",
      "created_at": "..."
    }
  ],
  "totals": {
    "total_amount": 39053783,
    "by_category": {
      "Casa - Gastos fijos": 7120150,
      "Mercado": 3648098
    }
  },
  "category_groups": [
    {
      "name": "Casa",
      "categories": ["Casa - Gastos fijos", "Casa - Provisionar mes entrante", ...]
    },
    {
      "name": "Jose",
      "categories": ["Jose - Vida cotidiana", "Jose - Gastos fijos", ...]
    }
  ]
}
```

## Filter Logic

### Category Filter
- **Empty array `[]`**: Show all categories
- **null**: Show nothing (all unchecked)
- **Array with category names**: Show only selected categories
- **"Préstamo" category**: Always filtered out (hidden from view and filter options)

### Payment Method Filter
- **Empty array `[]`**: Show all payment methods
- **null**: Show nothing (all unchecked)
- **Array with IDs**: Show only selected payment methods

### Category Grouping
Categories are grouped by backend `category_groups` response:
- Frontend uses API response to get group mappings
- Ungrouped categories (not in any group) display as top-level cards or in "Otros" group
- "Préstamo" is filtered out before grouping (never displayed)

## User Experience

### Navigation Flow
1. User lands on home page → **Gastos tab active** by default
2. Movements loaded for current month
3. User can:
   - Click category cards to expand/collapse details
   - Use month navigation to change periods
   - Apply filters by category and payment method
   - Click "+ Agregar gasto" to add new expense
   - Switch to Ingresos or Tarjetas tabs

### Visual Hierarchy (Hierarchical Grouped View)
```
Resumen mensual [Menu]
━━━━━━━━━━━━━━━━━━━━
[Gastos*] [Ingresos] [Tarjetas]
━━━━━━━━━━━━━━━━━━━━
← Diciembre | Enero 2026 | Febrero →

Total
$39,053,783
━━━━━━━━━━━━━━━━━━━━
🏠 Casa                   25.5%
   $9,950,248
   └─ 🛒 Mercado         36.6%
      $3,648,098
      └─ Mercado luego de vacaciones
         $404,390                [Nequi Jose]
         5 Ene 2026
      └─ Mercado Euro
         $122,584                [Efectivo]
         3 Dic 2025
   └─ 🏠 Gastos fijos    71.5%
      $7,120,150
      [Click to expand]

👨 Jose                   18.2%
   $7,103,568
   [Click to expand]
━━━━━━━━━━━━━━━━━━━━
                    [🔍] [+]
```

## Future Enhancements (Not Included)

- ❌ Edit/delete movements (three-dots menu left for later)
- ❌ Filter by member/payer
- ❌ SPLIT and DEBT_PAYMENT movements (separate views)
- ❌ Payment method display in entry list

## Testing Recommendations

1. **Load gastos page** - Verify default tab is "Gastos"
2. **Month navigation** - Change months, verify data updates
3. **Category expansion** - Click categories, verify entries shown
4. **Filter by category** - Select/deselect categories, verify filtering
5. **Filter by payment method** - Select/deselect, verify filtering
6. **Tab switching** - Switch to Ingresos, verify it still works
7. **Empty state** - Check month with no movements
8. **Add button** - Verify redirects to movement form with tipo=GASTO

## Notes

- Hierarchical 3-level grouping: Category Groups → Sub-Categories → Movements
- Category groups centralized in backend (GetDefaultCategoryGroups)
- Simplified category names strip group prefix for display
- Payment method badge has distinct color (blue) vs member badge (gray)
- "Préstamo" category completely hidden from view and filters
- Ungrouped categories ("Gastos médicos") display as top-level cards
- Database schema unchanged - full category names still stored ("Casa - Gastos fijos")

---

## Known Issues

### Issue 1: Categories appearing in "Otros" group instead of their assigned groups
**Status**: ✅ RESOLVED  
**Description**: Some categories (e.g., "Pago de SOAT/impuestos/mantenimiento") were appearing in "Otros" group in the frontend even though they were correctly mapped to "Carro" group in the backend.

**Root Cause**:
The `getCategoryGroups()` function in `frontend/pages/home.js` (lines 772-811) was filtering out category groups that had no movements in the current month (line 790). This caused their categories to not be in the `categoryToGroup` lookup map, leading to them being incorrectly assigned to "Otros" group.

**Fix Applied**:
Simplified `getCategoryGroups()` to directly return backend category groups from API response without filtering. The function now:
1. Returns `movementsData.category_groups` directly if available from API
2. Returns empty array as fallback (no client-side group creation)
3. No longer filters categories by movement availability

**Result**:
- All 7 category groups (Casa, Jose, Caro, Carro, Ahorros, Inversiones, Ocio) now display correctly
- "Otros" group only appears for categories genuinely not in any backend group (e.g., "Gastos médicos")
- Categories without movements still appear in their correct groups (groups/categories with 0 movements are hidden by the display logic)

---

## Code Files Modified

**Backend:**
- `backend/internal/movements/types.go`: Added CategoryGroup struct, GetDefaultCategoryGroups() function, category_groups field in ListMovementsResponse
- `backend/internal/movements/service.go`: Updated ListByHousehold() to include category_groups in response

**Frontend:**
- `frontend/pages/home.js`: Complete gastos view implementation with 3-level hierarchical grouping (811+ lines added/modified)
- `frontend/styles.css`: Added payment badge styles and sub-category card styles (71+ lines added)

**Documentation:**
- `GASTOS_VIEW_IMPLEMENTATION.md`: This file
