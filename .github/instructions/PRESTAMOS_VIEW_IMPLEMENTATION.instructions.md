# Préstamos View Implementation

## Overview

Implemented a complete 3-level drill-down view for tracking debts and loans between household members in the home page. The view provides visibility into who owes whom and which movements created those debts.

## Architecture

### Data Flow

1. **Backend Endpoints Used**:
   - `GET /movements/debts/consolidate?month=YYYY-MM` - Net debt balances
   - `GET /movements?type=SPLIT&month=YYYY-MM` - SPLIT movements
   - `GET /movements?type=DEBT_PAYMENT&month=YYYY-MM` - DEBT_PAYMENT movements

2. **Frontend State**:
   - `loansData` - Stores debt consolidation response (net balances)
   - `loanMovements` - Combined array of SPLIT and DEBT_PAYMENT movements

3. **Client-Side Filtering**:
   - All movement filtering happens in the frontend
   - Movements are filtered by debtor/creditor pair and direction
   - Amounts are calculated on-the-fly for SPLIT participants

### Three-Level Hierarchy

#### Level 1: Debt Pairs (renderLoansCards)
- **Display**: Cards showing net debt between two people
- **Format**: `🤝 [Debtor] → $X COP → [Creditor]`
- **Data Source**: `loansData.balances` from consolidation endpoint
- **Interaction**: Click to expand and see Level 2

#### Level 2: Directional Breakdown (renderLoanDetails)
- **Display**: Two directional items (if both > 0)
  - "Debtor le debe a Creditor: $X" - Total debt in one direction
  - "Creditor le debe a Debtor: $Y" - Total debt in reverse direction
- **Data Source**: Calculated from `loanMovements` by:
  - SPLIT: Payer is creditor, participants are debtors (amount × percentage)
  - DEBT_PAYMENT: Payment from A to B creates reverse debt visualization
- **Interaction**: Click direction item to see Level 3

#### Level 3: Individual Movements (renderLoanMovements)
- **Display**: List of movements that created the debt
- **Details Shown**:
  - Movement description
  - Date
  - Category (if applicable)
  - Amount (portion for SPLIT, full for DEBT_PAYMENT)
  - Percentage (for SPLIT movements)
  - Three-dot menu (edit/delete)
- **Data Source**: Filtered `loanMovements` by debtor/creditor pair and direction

## Implementation Details

### New Functions

#### Data Loading
```javascript
async function loadLoansData()
```
- Fetches consolidation data and movements in parallel
- Combines SPLIT and DEBT_PAYMENT into `loanMovements`
- Called on tab switch and month navigation

#### Rendering
```javascript
function renderLoansCards()           // Level 1
function renderLoanDetails(debtorId, creditorId)  // Level 2
function renderLoanMovements(debtorId, creditorId, direction)  // Level 3
```

#### Event Listeners
```javascript
function setupLoansListeners()        // Level 1 card clicks
function setupLoanDetailsListeners(debtorId, creditorId)  // Level 2 direction clicks
function setupLoanMovementListeners() // Level 3 action menus
async function handleDeleteLoanMovement(movementId)  // Delete handler
```

### Calculation Logic

#### SPLIT Movements
- **Debt Direction**: Participants owe the payer
- **Amount Calculation**: `movement.amount * participant.percentage`
- **Example**: 
  - Movement: $100k paid by Alice, Bob is 50% participant
  - Result: Bob owes Alice $50k

#### DEBT_PAYMENT Movements
- **Debt Direction**: Shows as reverse debt (payment creates obligation)
- **Amount**: Full movement amount
- **Example**:
  - Movement: $30k paid from Alice to Bob
  - Result: Shown in "Bob le debe a Alice" (creates reverse debt)

### CSS Reuse

The implementation reuses existing CSS classes:
- `.expense-group-card` - Level 1 debt pair cards
- `.expense-group-header` - Card header with icon and amounts
- `.expense-group-details` - Expandable Level 2 container
- `.expense-category-item` - Level 2 direction items
- `.category-movements` - Level 3 movements container
- `.movement-detail-entry` - Individual movement rows
- `.three-dots-btn` / `.three-dots-menu` - Action menus

### Integration Points

#### Tab Switching
- Added 'prestamos' case to tab click handler
- Loads loans data if not already loaded
- Renders loans view with month selector

#### Month Navigation
- Added 'prestamos' case to prev/next month handlers
- Calls `loadLoansData()` when month changes
- Uses `showLoadingState()` during fetch

#### Display Refresh
- Updated `refreshDisplay()` to handle `loans-container`
- Updated `showLoadingState()` to show spinner in loans view
- Calls `setupLoansListeners()` after re-render

## User Flow

1. User clicks "Préstamos" tab
2. System fetches consolidation and movements for current month
3. Level 1 displays cards for each debt pair with net amount
4. User clicks a debt pair card
5. Level 2 shows breakdown: "A owes B: $X" and/or "B owes A: $Y"
6. User clicks a direction item
7. Level 3 shows individual movements with details
8. User can edit/delete movements from three-dot menu
9. Delete triggers reload of loans data and refresh

## Edge Cases Handled

- **No loans**: Shows empty state with 💸 icon
- **Single direction**: Only shows the direction with debt > 0.01
- **Both directions**: Shows both if amounts are > 0.01
- **No movements for pair**: Shows "No hay movimientos" message
- **Menu overflow**: Three-dot menus position above if near bottom of screen
- **Month change**: Loads new data and refreshes entire view
- **Delete action**: Reloads all loans data to ensure consistency

## Future Enhancements

Potential improvements for later:
1. Add filter to show only specific members' debts
2. Add "settle debt" button to create DEBT_PAYMENT directly
3. Show debt trend over months (graph)
4. Export debt summary as PDF
5. Notification when debt exceeds threshold
6. Quick action to split debt 50/50
7. Show payment history timeline

## Testing Checklist

- [ ] Tab switches to Préstamos correctly
- [ ] Month navigation loads correct data
- [ ] Level 1 cards display correct net amounts
- [ ] Level 2 shows correct directional breakdowns
- [ ] Level 3 shows correct movements and amounts
- [ ] SPLIT percentages display correctly
- [ ] Edit button navigates to movement form
- [ ] Delete button removes movement and refreshes
- [ ] Empty state shows when no loans
- [ ] Loading spinner appears during data fetch
- [ ] Three-dot menus position correctly
- [ ] Works with different screen sizes

## Files Modified

- `frontend/pages/home.js` - All implementation (496 lines added)

## Commit

```
feat: Implement Préstamos view with 3-level drill-down

- Added loadLoansData() to fetch debt consolidation and movements
- Implemented renderLoansCards() for Level 1 (debt pairs with net amounts)
- Implemented renderLoanDetails() for Level 2 (breakdown by direction)
- Implemented renderLoanMovements() for Level 3 (individual movements)
- Added setupLoansListeners() and nested listener functions
- Integrated loans view into tab switching and month navigation
- Updated refreshDisplay() and showLoadingState() to support loans
- Reuses existing CSS classes (expense-group-card, expense-category-item, etc.)
```
