# SPLIT Movements Implementation

**Date:** 2026-01-09  
**Status:** ✅ COMPLETE

## Overview

Implemented display of SPLIT movements (shared expenses) in the "Gastos del Hogar" tab, integrated with existing HOUSEHOLD movements.

## Requirements

### SPLIT Movement Display Logic:

1. **Inclusion Criteria:**
   - Only show SPLIT movements where at least one household member is in the participants list
   - This represents the household's actual expense share

2. **Amount Calculation:**
   - Sum the percentages of ALL household members who are participants
   - Display the adjusted amount (original amount × household participation percentage)
   - Example: If Jose (60%) and Caro (40%) are participants in a $100 SPLIT → show $100
   - Example: If only Jose (30%) is participant in a $100 SPLIT → show $30

3. **Exclusion:**
   - If NO household member is in the participants → exclude (it's a loan to others)

4. **Visual Distinction:**
   - SPLIT movements show "🤝 Compartido" badge instead of payment method badge
   - Green-tinted badge to distinguish from regular payment method badges

## Implementation Details

### Frontend Changes (`frontend/pages/home.js`)

#### 1. Updated `loadMovementsData()` function:

```javascript
async function loadMovementsData() {
  // Load both HOUSEHOLD and SPLIT movements in parallel
  const [householdResponse, splitResponse] = await Promise.all([
    fetch(`${API_URL}/movements?type=HOUSEHOLD&month=${currentMonth}`),
    fetch(`${API_URL}/movements?type=SPLIT&month=${currentMonth}`)
  ]);

  // Process SPLIT movements:
  // - Filter to only include household member participants
  // - Calculate adjusted amounts
  // - Mark as is_split for visual distinction

  // Combine HOUSEHOLD and processed SPLIT movements
  // Apply category and payment method filters
  // Display together in existing category hierarchy
}
```

**Key Logic:**
- Get household member IDs from `householdMembers` array
- Filter SPLIT participants to find household members
- Sum their percentages
- Adjust movement amount: `originalAmount × totalHouseholdPercentage`
- Add `is_split: true` flag and keep `original_amount` for reference

#### 2. Updated movement rendering:

```javascript
${movement.is_split 
  ? `<span class="entry-split-badge">🤝 Compartido</span>` 
  : movement.payment_method_name 
    ? `<span class="entry-payment-badge">${movement.payment_method_name}</span>` 
    : ''
}
```

Shows "Compartido" badge for SPLIT movements, payment method badge for HOUSEHOLD movements.

### CSS Changes (`frontend/styles.css`)

Added styling for `.entry-split-badge`:

```css
.entry-split-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  background-color: #dcfce7; /* Light green */
  color: #15803d; /* Dark green */
  text-transform: none;
  letter-spacing: 0.5px;
}
```

## Data Flow

1. **User loads home page**
2. **System fetches both movement types:**
   - `GET /movements?type=HOUSEHOLD&month=YYYY-MM`
   - `GET /movements?type=SPLIT&month=YYYY-MM`
3. **SPLIT processing:**
   - For each SPLIT movement, check participants
   - If household member(s) present → calculate adjusted amount
   - If no household members → exclude
4. **Combine & display:**
   - Merge HOUSEHOLD + filtered SPLIT movements
   - Apply category/payment method filters
   - Display in 3-level hierarchy (Groups → Categories → Movements)
5. **Visual distinction:**
   - SPLIT movements show "🤝 Compartido" badge
   - HOUSEHOLD movements show payment method badge

## Example Scenarios

### Scenario 1: Full household participation
- **Movement:** $100 grocery shopping
- **Participants:** Jose (60%), Caro (40%)
- **Displayed Amount:** $100 (100% household expense)
- **Badge:** "🤝 Compartido"

### Scenario 2: Partial household participation
- **Movement:** $200 dinner
- **Participants:** Jose (30%), Maria Isabel (70%)
- **Displayed Amount:** $60 (only Jose's 30%)
- **Badge:** "🤝 Compartido"

### Scenario 3: No household participation
- **Movement:** $150 gift for friend
- **Participants:** Maria Isabel (50%), Papá Caro (50%)
- **Displayed:** Not shown (excluded from view)

### Scenario 4: Regular household expense
- **Movement:** $50 utilities
- **Type:** HOUSEHOLD
- **Displayed Amount:** $50
- **Badge:** Payment method name (e.g., "Débito Jose")

## Backend Requirements (Already Implemented)

- ✅ `GET /movements?type=HOUSEHOLD` endpoint
- ✅ `GET /movements?type=SPLIT` endpoint
- ✅ Movements include `participants` array with percentages
- ✅ Participants have `participant_user_id` for household members
- ✅ Category field populated for SPLIT movements with household participation

## Testing Checklist

- [ ] Load home page and verify both HOUSEHOLD and SPLIT movements appear
- [ ] Verify SPLIT amounts are adjusted based on household participation
- [ ] Verify SPLIT movements excluded when no household members participate
- [ ] Verify "🤝 Compartido" badge appears for SPLIT movements
- [ ] Verify payment method badge appears for HOUSEHOLD movements
- [ ] Verify category grouping works correctly with mixed movement types
- [ ] Verify filters (category, payment method) work with combined movements
- [ ] Verify edit/delete actions work for both movement types
- [ ] Test with multiple household members in single SPLIT movement
- [ ] Test with partial household participation (only some members)

## Future Enhancements

### Phase 6: Préstamos Tab (Not Implemented Yet)
- Separate tab for DEBT_PAYMENT movements
- Display "who owes whom" summary
- Payment settlement tracking

### Possible Improvements:
- Add tooltip on "Compartido" badge showing all participants
- Show original vs. adjusted amount in edit mode
- Add filter to show only SPLIT or only HOUSEHOLD movements
- Visual indicator showing % of household participation

## Notes

- Category is mandatory for SPLIT movements with household participation (validated in backend)
- Original movement amount is preserved in `original_amount` field
- Household member list is loaded via `/movement-form-config` endpoint
- SPLIT movements integrate seamlessly with existing category hierarchy
- No UI changes needed for movement registration form (already supports SPLIT)

---

**Implementation completed:** 2026-01-09  
**Files modified:**
- `frontend/pages/home.js` (+103 lines, -60 lines)
- `frontend/styles.css` (+13 lines)
