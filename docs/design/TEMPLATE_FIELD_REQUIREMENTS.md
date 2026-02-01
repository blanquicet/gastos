# Template Field Requirements

> This document defines the field requirements for recurring movement templates based on their use case.
> 
> **Status**: ✅ Implemented in both backend (`recurringmovements/types.go`) and frontend (`home.js`)

## Overview

Templates serve two purposes:
1. **Form Pre-fill**: Pre-populate the movement registration form when selected (movement_type required)
2. **Auto-generate**: Automatically create movements on a schedule (full movement details required)

The required fields depend on whether auto-generate is enabled.

> **Note**: Budget-only amounts (without movement details) are handled by editing the budget directly, not by creating templates. The budget can be higher than the sum of templates, allowing for "additional undetailed" amounts.

---

## Field Requirements by Use Case

| Field | Form Pre-fill | Auto-generate |
|-------|---------------|---------------|
| **Core fields** |
| `name` | ✅ Required | ✅ Required |
| `category_id` | Conditional* | Conditional* |
| `amount` | ✅ Required | ✅ Required |
| `movement_type` | ✅ Required | ✅ Required |
| **Payer/Counterparty** |
| `payer_user_id` | Pre-fills if set | ✅ Required (SPLIT, DEBT_PAYMENT) |
| `payer_contact_id` | Pre-fills if set | ✅ Required (SPLIT, DEBT_PAYMENT) |
| `counterparty_user_id` | Pre-fills if set | ✅ Required (DEBT_PAYMENT only) |
| `counterparty_contact_id` | Pre-fills if set | ✅ Required (DEBT_PAYMENT only) |
| **Payment & Accounts** |
| `payment_method_id` | Pre-fills if set | See table below |
| `receiver_account_id` | Pre-fills if set | See table below |
| **Participants (SPLIT only)** |
| `participants[]` | Pre-fills if set | ✅ Required (SPLIT only) |
| **Schedule** |
| `recurrence_pattern` | ❌ | ✅ Required |
| `day_of_month` | ❌ | ✅ Required (MONTHLY) |
| `day_of_year` | ❌ | ✅ Required (YEARLY) |
| `start_date` | ❌ | ✅ Required |

> **Note**: For SPLIT and DEBT_PAYMENT, exactly one of `payer_user_id` OR `payer_contact_id` is required when auto-generate is enabled. For HOUSEHOLD, payer is implicit (the household pays as a unit).

---

## Category Requirements (NEW - 2026-02-01)

**Category is conditionally required** based on whether the movement represents a real household expense.

### Logic

| Movement Type | Payer | Participants | Category Required? | Reason |
|---------------|-------|--------------|-------------------|--------|
| **HOUSEHOLD** | - | - | ✅ **Always** | Real household expense |
| **SPLIT** | Member | Any member participant | ✅ **Yes** | Household member benefited |
| **SPLIT** | Member | **All** contacts | ❌ **No** | Loan to third party (money out, expected back) |
| **SPLIT** | Contact | - | ✅ **Yes** | Third party paid for household |
| **DEBT_PAYMENT** | Any | Any | ❌ **Never** | Just money movement, not an expense |

### Key Insight

**Loans to external parties (SPLIT with payer=member and all participants=contacts)** don't need a category because:
1. The money is expected to return
2. It's not a real household expense
3. These movements are filtered out of the "Gastos" view anyway

**Example:**
- Jose lends $500k to Prebby → SPLIT with payer=Jose, participant=Prebby@100%
- This is NOT a household expense, just money movement
- No category needed, doesn't show in Gastos tab

### Implementation

The logic is centralized in `frontend/utils.js`:

```javascript
export function isCategoryRequired({ effectiveTipo, tipo, participants, usersData }) {
  // LOAN type never requires category (it's just money movement)
  if (tipo === 'LOAN') return false;
  
  // DEBT_PAYMENT never requires category (just money movement)
  if (effectiveTipo === 'DEBT_PAYMENT') return false;
  
  // HOUSEHOLD always requires category (it's a real household expense)
  if (effectiveTipo === 'HOUSEHOLD') return true;
  
  // SPLIT: check if any participant is a household member
  if (effectiveTipo === 'SPLIT') {
    if (!participants || participants.length === 0) return false;
    
    // Check if any participant is a household member
    const hasHouseholdParticipant = participants.some(p => {
      // Support both formats: {name} or {user_id}
      let user = null;
      if (p.name && typeof usersData === 'object' && !Array.isArray(usersData)) {
        user = usersData[p.name];
      } else if (p.user_id && Array.isArray(usersData)) {
        user = usersData.find(u => u.id === p.user_id);
      }
      return user && user.type === 'member';
    });
    
    return hasHouseholdParticipant;
  }
  
  return false;
}
```

This function is used by:
- `registrar-movimiento.js` - Movement registration form
- `home.js` - Template modal

---

## Payer Requirements (Auto-generate)

| Movement Type | Payer Required? | Who can be payer? |
|---------------|-----------------|-------------------|
| HOUSEHOLD | ❌ No (implicit) | N/A - household pays as unit |
| SPLIT | ✅ Yes | Member or Contact (`payer_user_id` OR `payer_contact_id`) |
| DEBT_PAYMENT | ✅ Yes | Member or Contact (`payer_user_id` OR `payer_contact_id`) |

> **Note**: For HOUSEHOLD, the payer is implicit (the household). We only track the payment method to know where the money came from (credit card, debit, cash, etc.).

---

## Payment Method Requirements (Auto-generate)

The `payment_method_id` tracks where the money came from (credit card, debit, cash).

| Movement Type | Payer is Member | Payer is Contact | No Payer (implicit) |
|---------------|-----------------|------------------|---------------------|
| HOUSEHOLD | N/A | N/A | ✅ Required |
| SPLIT | ✅ Required | ❌ Not needed | N/A |
| DEBT_PAYMENT | ✅ Required | ❌ Not needed | N/A |

> **Note**: For HOUSEHOLD, payment method is always required since we need to track where the money came from (especially for credit card debt tracking).

---

## Receiver Account Requirements (Auto-generate)

The `receiver_account_id` is only applicable for DEBT_PAYMENT when the counterparty (who receives the payment) is a household member.

| Movement Type | Counterparty | `receiver_account_id` |
|---------------|--------------|----------------------|
| HOUSEHOLD | N/A | ❌ N/A |
| SPLIT | N/A | ❌ N/A |
| DEBT_PAYMENT | Member | ✅ Required |
| DEBT_PAYMENT | Contact | ❌ Not needed |

---

## Minimum Fields by Use Case

### Form Pre-fill (no auto-generate)
Template that pre-fills the movement form when selected. Only `movement_type` is additionally required beyond core fields; all other fields are optional and will pre-fill if provided:
```json
{
  "name": "Arriendo",
  "category_id": "uuid-here", 
  "amount": 3200000,
  "movement_type": "SPLIT",
  "auto_generate": false,
  
  // Optional - will pre-fill if provided
  "payer_contact_id": "landlord-uuid",
  "participants": [
    {"participant_user_id": "jose-uuid", "percentage": 0.5},
    {"participant_user_id": "caro-uuid", "percentage": 0.5}
  ]
}
```

### Auto-generate
Fully configured template that creates movements automatically:
```json
{
  "name": "Arriendo",
  "category_id": "uuid-here",
  "amount": 3200000,
  "movement_type": "SPLIT",
  "auto_generate": true,
  
  // Required for auto-generate
  "payer_contact_id": "landlord-uuid",
  "participants": [
    {"participant_user_id": "jose-uuid", "percentage": 0.5},
    {"participant_user_id": "caro-uuid", "percentage": 0.5}
  ],
  "recurrence_pattern": "MONTHLY",
  "day_of_month": 1,
  "start_date": "2026-02-01"
}
```

---

## Validation Logic Summary

```
ALWAYS REQUIRED: name, amount, movement_type

CATEGORY_ID REQUIREMENT:
    IF movement_type = HOUSEHOLD:
        REQUIRE: category_id (always a real expense)
    IF movement_type = SPLIT:
        IF any participant is a household member:
            REQUIRE: category_id (household benefited)
        ELSE (all participants are contacts):
            OPTIONAL: category_id (loan to third party)
    IF movement_type = DEBT_PAYMENT:
        OPTIONAL: category_id (just money movement)

IF auto_generate = true:
    REQUIRE: recurrence_pattern, day_of_month/day_of_year, start_date
    
    IF movement_type = HOUSEHOLD:
        // Payer is implicit (household pays as unit)
        REQUIRE: payment_method_id
        
    IF movement_type = SPLIT:
        REQUIRE: payer (user OR contact)
        REQUIRE: participants[]
        IF payer is member:
            REQUIRE: payment_method_id
            
    IF movement_type = DEBT_PAYMENT:
        REQUIRE: payer (user OR contact)
        REQUIRE: counterparty (user OR contact)
        IF payer is member:
            REQUIRE: payment_method_id
        IF counterparty is member:
            REQUIRE: receiver_account_id

ELSE (auto_generate = false OR not set):
    // Form pre-fill mode - movement_type is required but all other fields optional
    // Just validate what's provided (e.g., if participants provided, percentages must sum to 100%)
```

---

## Comparison: Auto-generate Template vs Registrar Movimiento

**✅ CONFIRMED: Both use identical validation logic.**

Auto-generate templates create movements automatically, so they must follow the exact same field requirements as the movement registration form (`registrar-movimiento.js` and `movements/types.go`).

### HOUSEHOLD

| Field | Template (Auto-generate) | Registrar Movimiento | Match? |
|-------|-------------------------|---------------------|--------|
| `payer` | ❌ Not needed (implicit) | ✅ Auto-set to `currentUser` | ✅ Both implicit |
| `payment_method_id` | ✅ Required | ✅ Required | ✅ |
| `category_id` | ✅ Required | ✅ Required | ✅ |
| `participants` | ❌ Not allowed | ❌ Not allowed | ✅ |
| `counterparty` | ❌ Not allowed | ❌ Not allowed | ✅ |

**Note**: Backend requires `payer_user_id` (validation line 164-168), but frontend auto-sets it to `currentUser.id` (line 2057-2060). User never chooses - it's implicit. For templates, we should NOT require payer for HOUSEHOLD.

### SPLIT

| Field | Template (Auto-generate) | Registrar Movimiento | Match? |
|-------|-------------------------|---------------------|--------|
| `payer` | ✅ Required | ✅ Required | ✅ |
| `payment_method_id` | ✅ If payer is member | ✅ If payer is member | ✅ |
| `category_id` | Conditional* | Conditional* | ✅ |
| `participants` | ✅ Required | ✅ Required | ✅ |
| `counterparty` | ❌ Not allowed | ❌ Not allowed | ✅ |

**\* Category for SPLIT**: Required only if any participant is a household member. If all participants are contacts (loan to third party), category is optional.

### DEBT_PAYMENT

| Field | Template (Auto-generate) | Registrar Movimiento | Match? |
|-------|-------------------------|---------------------|--------|
| `payer` | ✅ Required | ✅ Required | ✅ |
| `payment_method_id` | ✅ If payer is member | ✅ If payer is member | ✅ |
| `category_id` | ❌ Optional | ❌ Optional | ✅ |
| `counterparty` | ✅ Required | ✅ Required | ✅ |
| `receiver_account_id` | ✅ If counterparty is member | ✅ If counterparty is member | ✅ |
| `participants` | ❌ Not allowed | ❌ Not allowed | ✅ |

### Summary

| Movement Type | Match? | Notes |
|---------------|--------|-------|
| HOUSEHOLD | ✅ Yes | Payer is implicit in both (auto-set to current user) |
| SPLIT | ✅ Yes | All fields match |
| DEBT_PAYMENT | ✅ Yes | All fields match |

### Key Insight: HOUSEHOLD Payer

For **HOUSEHOLD**, the "payer" is always implicit:
- **Movement form**: Frontend auto-sets `payer_user_id = currentUser.id`
- **Auto-generate**: Should auto-set when creating movement (not stored in template)

The backend currently requires `payer_user_id` for all movements, but for HOUSEHOLD this is redundant. The template should NOT store payer for HOUSEHOLD - it should be determined at generation time.

---

## Implementation Status

✅ **Migration 035** applied:
- Updated payer constraint: SPLIT/DEBT_PAYMENT require payer only for auto_generate=true; HOUSEHOLD must NOT have payer
- Updated counterparty constraint: DEBT_PAYMENT requires counterparty only for auto_generate=true
- Added `receiver_account_id` column for DEBT_PAYMENT when counterparty is a member

✅ **Backend (`recurringmovements/types.go`)** updated:
- `MovementType` changed to pointer type (*movements.MovementType)
- `Validate()` rewritten with two-tier logic (form pre-fill vs auto-generate)
- Added `ReceiverAccountID` field

✅ **Frontend (`home.js`)** updated:
- Movement type dropdown is now required (no "solo para presupuesto" option)
- Auto-generate checkbox still controls which fields are mandatory
- Type-specific field validation only enforced for auto-generate mode
- Form pre-fill mode allows movement details to be optional
- Category is pre-selected and disabled when opening from within a category

> **Note**: Budget-only values (without creating templates) are set by editing the budget amount directly. The budget can exceed the sum of templates, allowing for "additional undetailed" expenses.

---

## Related Documents

- [08_RECURRING_MOVEMENTS_PHASE.md](./08_RECURRING_MOVEMENTS_PHASE.md) - Full phase design
- [06_BUDGETS_PHASE.md](./06_BUDGETS_PHASE.md) - Budgets and categories context
