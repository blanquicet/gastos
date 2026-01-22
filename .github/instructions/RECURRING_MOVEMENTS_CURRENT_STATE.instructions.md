# Recurring Movements - Current Implementation State

**Date:** 2026-01-25 22:55 UTC  
**Last Commit:** eeb1da0c5e0f (Jan 22, 2026)  
**Status:** 95% Complete - Ready for final polish

---

## ✅ What's Working (95%)

### Backend (100% Complete)
- ✅ All migrations applied (030-033)
- ✅ Full CRUD API with 8 endpoints
- ✅ Scheduler running every 12 hours
- ✅ Role inversion logic
- ✅ 61 tests passing (38 unit + 23 integration)
- ✅ Optimized endpoints (templates in /movement-form-config)

### Frontend - Movement Integration (100% Complete)
- ✅ Template dropdown in movement registration form
- ✅ Pre-fill logic (FIXED amounts, participant data)
- ✅ Role inversion for DEBT_PAYMENT
- ✅ Auto-generated badge (🔁) on movements
- ✅ Scope modal for editing/deleting auto-generated movements
- ✅ Performance optimized (single API call)

### Frontend - Template Management (95% Complete)
- ✅ **CREATE**: Full modal with all fields working
  - Movement type selection (HOUSEHOLD, SPLIT, DEBT_PAYMENT)
  - Fixed vs Variable amount
  - Auto-generate toggle + recurrence pattern
  - Day of month picker (1-28)
  - Participant management for SPLIT
  - Payment method selection
  - Category selection
  - API integration (POST /api/recurring-movements)
  - Form validation
  - Templates display after creation

- ✅ **DELETE**: Working with confirmation
  - Three-dots menu on template items
  - Confirmation dialog
  - API integration (DELETE /api/recurring-movements/:id)
  - Templates refresh after deletion

- ⚠️ **EDIT**: Placeholder only
  - Shows alert: "Editar template: {id} (por implementar)"
  - Menu item exists, handler is stub
  - **TODO**: Load template, populate modal, call PUT endpoint

### Template Display
- ✅ Templates show as individual items in Presupuesto tab
- ✅ Format: Name | Amount | Schedule
- ✅ Payment method badges (like Gastos tab)
- ✅ Sorted: auto_generate first, then by amount
- ✅ Expandable categories (chevron)
- ✅ Three-dots menu with edit/delete options
- ✅ Visual design matches movements

---

## ⚠️ What's Pending (5%)

### 1. Template Edit Functionality (1-2 hours)
**Current behavior:** Shows alert "por implementar"

**What needs to be done:**
1. Load template data: `GET /api/recurring-movements/:id`
2. Populate `showTemplateModal()` with existing data
3. Pre-fill all form fields:
   - Name, movement type, amount type
   - Fixed amount (if FIXED)
   - Auto-generate checkbox + day of month
   - Recurrence pattern
   - Participants (for SPLIT)
   - Payer/counterparty
   - Payment method
4. Update API call to `PUT /api/recurring-movements/:id`
5. Reload templates after successful update

**File to modify:** `frontend/pages/home.js` (around line 2792)

---

### 2. Delete with Scope Modal (30 mins)
**Current behavior:** Simple `confirm()` dialog

**What needs to be done:**
1. Replace `confirm()` with scope modal
2. Show three options:
   - THIS: Delete template only (keep generated movements)
   - FUTURE: Deactivate template (stop future generation)
   - ALL: Delete template + all generated movements
3. Use query parameter: `DELETE /api/recurring-movements/:id?scope={scope}`
4. Visual warning for scope=ALL (red background)

**File to modify:** `frontend/pages/home.js` (around line 2795)

---

## 🐛 Known Issues to Fix

**Will be provided by user...**

---

## 📋 Files Modified in Commit eeb1da0c5e0f

### frontend/pages/home.js (+600+ lines)
**Functions added/modified:**
- `showTemplateModal()` - Create/edit template modal (lines 2960-3600+)
- `handleAddTemplate()` - Handler for add template button (line 2952)
- `renderTemplateItem()` - Display template in list (line 629)
- `renderBudgets()` - Updated to show templates (line 473)
- `loadBudgetsData()` - Fetch and sort templates (line 1389)
- Event handlers for three-dots menus (lines 2703-2817)

**Template modal includes:**
- MovementFormState integration
- Dynamic field visibility
- Participant percentage management
- Equitable division toggle
- Value/percentage mode for participants
- Auto-generate configuration
- Payment method visibility logic
- Form validation
- API integration (POST)

### frontend/pages/registrar-movimiento.js (+30 lines)
**Changes:**
- Updated hint text for value/percentage mode
- Fixed decimal precision display
- Spinner removal for number inputs

### frontend/styles.css (-11 lines)
**Changes:**
- Removed `.template-entry` special styling
- Removed template-specific borders
- Templates now use same styles as movements

---

## 🎯 Next Steps

1. **Fix issues** (user will provide details)
2. **Implement edit functionality** (1-2 hours)
3. **Implement delete with scope modal** (30 mins)
4. **Final testing**
5. **Mark Phase 8 as complete**

---

## 💡 Testing Checklist

### Create Template
- [ ] HOUSEHOLD type with fixed amount
- [ ] SPLIT type with participants
- [ ] DEBT_PAYMENT type
- [ ] Auto-generate enabled/disabled
- [ ] Variable amount type
- [ ] Day of month validation (1-28)
- [ ] Participant percentage validation (sum to 100%)

### Delete Template
- [ ] Delete with confirmation
- [ ] Templates refresh after delete
- [ ] Error handling

### Edit Template (when implemented)
- [ ] Load existing template data
- [ ] Update all fields
- [ ] Update participants
- [ ] Change auto-generate settings
- [ ] Templates refresh after update

### Integration
- [ ] Templates appear in movement form dropdown
- [ ] Pre-fill works correctly
- [ ] Auto-generated movements show badge
- [ ] Scope editing works for auto-generated movements

---

**Ready to proceed with:**
1. Viewing/fixing the issues you'll show me
2. Implementing edit functionality
3. Implementing delete with scope modal
