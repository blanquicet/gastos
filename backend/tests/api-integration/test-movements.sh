#!/bin/bash
# Movements API Integration Tests
# Tests CRUD operations for HOUSEHOLD, SPLIT, and DEBT_PAYMENT movements

set -e  # Exit on any error
set -o pipefail  # Exit on pipe failure

BASE_URL="${API_BASE_URL:-http://localhost:8080}"
COOKIES_FILE="/tmp/gastos-movements-test-cookies.txt"
JOSE_EMAIL="jose+movements$(date +%s%N)@test.com"
CARO_EMAIL="caro+movements$(date +%s%N)@test.com"
PASSWORD="Test1234!"
DEBUG="${DEBUG:-false}"

# Curl flags based on debug mode
CURL_FLAGS="-s"
if [ "$DEBUG" = "true" ]; then
  CURL_FLAGS="-v"
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${YELLOW}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║     🧪 Gastos Movements API Integration Tests         ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Clean up
rm -f $COOKIES_FILE

# Error handler
error_handler() {
  local line=$1
  echo -e "\n${RED}╔════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ✗ TEST FAILED at line $line${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
  if [ -n "$LAST_RESPONSE" ]; then
    echo -e "${YELLOW}Last API Response:${NC}"
    echo "$LAST_RESPONSE" | jq '.' 2>/dev/null || echo "$LAST_RESPONSE"
  fi
  exit 1
}

trap 'error_handler $LINENO' ERR

# Wrapper for curl that captures response
api_call() {
  LAST_RESPONSE=$(curl "$@")
  echo "$LAST_RESPONSE"
}

# Helper function
run_test() {
  echo -e "${CYAN}▶ $1${NC}"
}

# ═══════════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════════

run_test "Health Check"
HEALTH=$(api_call $CURL_FLAGS $BASE_URL/health)
echo "$HEALTH" | jq -e '.status == "healthy"' > /dev/null
echo -e "${GREEN}✓ Server is healthy${NC}\n"

run_test "Register Jose"
REGISTER=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$JOSE_EMAIL\",\"name\":\"Jose\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE)
echo "$REGISTER" | jq -e '.message' > /dev/null
echo -e "${GREEN}✓ Jose registered${NC}\n"

run_test "Get Current User"
ME=$(api_call $CURL_FLAGS $BASE_URL/me -b $COOKIES_FILE)
JOSE_ID=$(echo "$ME" | jq -r '.id')
[ "$JOSE_ID" != "null" ] && [ -n "$JOSE_ID" ]
echo -e "${GREEN}✓ Got user ID: $JOSE_ID${NC}\n"

run_test "Create Household"
CREATE_HOUSEHOLD=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d '{"name":"Casa Jose & Caro"}')
HOUSEHOLD_ID=$(echo "$CREATE_HOUSEHOLD" | jq -r '.id')
[ "$HOUSEHOLD_ID" != "null" ] && [ -n "$HOUSEHOLD_ID" ]
echo -e "${GREEN}✓ Created household: $HOUSEHOLD_ID${NC}\n"

run_test "Register Caro (for member tests)"
CARO_COOKIES="/tmp/gastos-caro-cookies.txt"
CARO_REGISTER=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$CARO_EMAIL\",\"name\":\"Caro\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $CARO_COOKIES)
# Get Caro's ID by logging her in
CARO_ME=$(api_call $CURL_FLAGS $BASE_URL/me -b $CARO_COOKIES)
CARO_ID=$(echo "$CARO_ME" | jq -r '.id')
[ "$CARO_ID" != "null" ] && [ -n "$CARO_ID" ]
echo -e "${GREEN}✓ Registered Caro: $CARO_ID${NC}\n"

run_test "Add Caro to Household"
ADD_MEMBER=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD_ID/members \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$CARO_EMAIL\"}")
echo "$ADD_MEMBER" | jq -e '.id' > /dev/null
echo "$ADD_MEMBER" | jq -e '.role == "member"' > /dev/null
echo -e "${GREEN}✓ Added Caro to household${NC}\n"

run_test "Create Payment Method (Debit)"
CREATE_PM=$(api_call $CURL_FLAGS -X POST $BASE_URL/payment-methods \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Débito Jose\",\"type\":\"debit_card\",\"is_shared_with_household\":true}")
PM_ID=$(echo "$CREATE_PM" | jq -r '.id')
[ "$PM_ID" != "null" ] && [ -n "$PM_ID" ]
echo -e "${GREEN}✓ Created payment method: $PM_ID${NC}\n"

run_test "Create Credit Card"
CREATE_CC=$(api_call $CURL_FLAGS -X POST $BASE_URL/payment-methods \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d '{"name":"AMEX Jose","type":"credit_card","is_shared_with_household":true}')
CC_ID=$(echo "$CREATE_CC" | jq -r '.id')
[ "$CC_ID" != "null" ] && [ -n "$CC_ID" ]
echo -e "${GREEN}✓ Created credit card: $CC_ID${NC}\n"

run_test "Create Contact (External Person)"
CREATE_CONTACT=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD_ID/contacts \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d '{"name":"Maria","email":"maria@example.com"}')
CONTACT_ID=$(echo "$CREATE_CONTACT" | jq -r '.id')
[ "$CONTACT_ID" != "null" ] && [ -n "$CONTACT_ID" ]
echo -e "${GREEN}✓ Created contact: $CONTACT_ID${NC}\n"

# ═══════════════════════════════════════════════════════════
# HOUSEHOLD MOVEMENTS
# ═══════════════════════════════════════════════════════════

run_test "[HOUSEHOLD] Create household expense"
CREATE_HOUSEHOLD_MOV=$(api_call $CURL_FLAGS -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"HOUSEHOLD\",
    \"description\":\"Mercado del mes\",
    \"amount\":250000,
    \"category\":\"Mercado\",
    \"movement_date\":\"2026-01-15\",
    \"payer_user_id\":\"$JOSE_ID\",
    \"payment_method_id\":\"$PM_ID\"
  }")
HOUSEHOLD_MOV_ID=$(echo "$CREATE_HOUSEHOLD_MOV" | jq -r '.id')
[ "$HOUSEHOLD_MOV_ID" != "null" ] && [ -n "$HOUSEHOLD_MOV_ID" ]
echo "$CREATE_HOUSEHOLD_MOV" | jq -e '.type == "HOUSEHOLD"' > /dev/null
echo "$CREATE_HOUSEHOLD_MOV" | jq -e '.amount == 250000' > /dev/null
echo "$CREATE_HOUSEHOLD_MOV" | jq -e '.payer_name' > /dev/null
echo -e "${GREEN}✓ Created HOUSEHOLD movement: $HOUSEHOLD_MOV_ID${NC}\n"

run_test "[HOUSEHOLD] Require category"
HOUSEHOLD_NO_CATEGORY=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"HOUSEHOLD\",
    \"description\":\"Test\",
    \"amount\":100000,
    \"movement_date\":\"2026-01-15\",
    \"payer_user_id\":\"$JOSE_ID\",
    \"payment_method_id\":\"$PM_ID\"
  }")
[ "$HOUSEHOLD_NO_CATEGORY" = "400" ]
echo -e "${GREEN}✓ Rejected HOUSEHOLD without category${NC}\n"

run_test "[HOUSEHOLD] Require payment method"
HOUSEHOLD_NO_PM=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"HOUSEHOLD\",
    \"description\":\"Test\",
    \"amount\":100000,
    \"category\":\"Mercado\",
    \"movement_date\":\"2026-01-15\",
    \"payer_user_id\":\"$JOSE_ID\"
  }")
[ "$HOUSEHOLD_NO_PM" = "400" ]
echo -e "${GREEN}✓ Rejected HOUSEHOLD without payment method${NC}\n"

# ═══════════════════════════════════════════════════════════
# SPLIT MOVEMENTS
# ═══════════════════════════════════════════════════════════

run_test "[SPLIT] Create split expense (50/50)"
CREATE_SPLIT=$(api_call $CURL_FLAGS -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"SPLIT\",
    \"description\":\"Cena con Maria\",
    \"amount\":120000,
    \"movement_date\":\"2026-01-16\",
    \"payer_user_id\":\"$JOSE_ID\",
    \"payment_method_id\":\"$CC_ID\",
    \"participants\":[
      {\"participant_user_id\":\"$JOSE_ID\",\"percentage\":0.5},
      {\"participant_contact_id\":\"$CONTACT_ID\",\"percentage\":0.5}
    ]
  }")
SPLIT_MOV_ID=$(echo "$CREATE_SPLIT" | jq -r '.id')
[ "$SPLIT_MOV_ID" != "null" ] && [ -n "$SPLIT_MOV_ID" ]
echo "$CREATE_SPLIT" | jq -e '.type == "SPLIT"' > /dev/null
echo "$CREATE_SPLIT" | jq -e '.participants | length == 2' > /dev/null
echo -e "${GREEN}✓ Created SPLIT movement: $SPLIT_MOV_ID${NC}\n"

run_test "[SPLIT] Require participants"
SPLIT_NO_PARTICIPANTS=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"SPLIT\",
    \"description\":\"Test\",
    \"amount\":100000,
    \"movement_date\":\"2026-01-15\",
    \"payer_user_id\":\"$JOSE_ID\"
  }")
[ "$SPLIT_NO_PARTICIPANTS" = "400" ]
echo -e "${GREEN}✓ Rejected SPLIT without participants${NC}\n"

run_test "[SPLIT] Validate percentage sum (must be 100%)"
SPLIT_BAD_PCT=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"SPLIT\",
    \"description\":\"Test\",
    \"amount\":100000,
    \"movement_date\":\"2026-01-15\",
    \"payer_user_id\":\"$JOSE_ID\",
    \"participants\":[
      {\"participant_user_id\":\"$JOSE_ID\",\"percentage\":0.6},
      {\"participant_user_id\":\"$CARO_ID\",\"percentage\":0.3}
    ]
  }")
[ "$SPLIT_BAD_PCT" = "400" ]
echo -e "${GREEN}✓ Rejected SPLIT with invalid percentage sum${NC}\n"

run_test "[SPLIT] Create with custom percentages (30/70)"
CREATE_SPLIT_CUSTOM=$(api_call $CURL_FLAGS -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"SPLIT\",
    \"description\":\"Compra compartida\",
    \"amount\":100000,
    \"movement_date\":\"2026-01-17\",
    \"payer_user_id\":\"$JOSE_ID\",
    \"participants\":[
      {\"participant_user_id\":\"$JOSE_ID\",\"percentage\":0.3},
      {\"participant_user_id\":\"$CARO_ID\",\"percentage\":0.7}
    ]
  }")
echo "$CREATE_SPLIT_CUSTOM" | jq -e '.participants[0].percentage == 0.3' > /dev/null
echo "$CREATE_SPLIT_CUSTOM" | jq -e '.participants[1].percentage == 0.7' > /dev/null
echo -e "${GREEN}✓ Created SPLIT with custom percentages${NC}\n"

# ═══════════════════════════════════════════════════════════
# DEBT_PAYMENT MOVEMENTS
# ═══════════════════════════════════════════════════════════

run_test "[DEBT_PAYMENT] Create debt payment (Jose pays Maria)"
CREATE_DEBT=$(api_call $CURL_FLAGS -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"DEBT_PAYMENT\",
    \"description\":\"Pago deuda del almuerzo\",
    \"amount\":60000,
    \"category\":\"Préstamo\",
    \"movement_date\":\"2026-01-18\",
    \"payer_user_id\":\"$JOSE_ID\",
    \"counterparty_contact_id\":\"$CONTACT_ID\",
    \"payment_method_id\":\"$PM_ID\"
  }")
DEBT_MOV_ID=$(echo "$CREATE_DEBT" | jq -r '.id')
[ "$DEBT_MOV_ID" != "null" ] && [ -n "$DEBT_MOV_ID" ]
echo "$CREATE_DEBT" | jq -e '.type == "DEBT_PAYMENT"' > /dev/null
echo "$CREATE_DEBT" | jq -e '.counterparty_name' > /dev/null
echo -e "${GREEN}✓ Created DEBT_PAYMENT movement: $DEBT_MOV_ID${NC}\n"

run_test "[DEBT_PAYMENT] Require counterparty"
DEBT_NO_COUNTERPARTY=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"DEBT_PAYMENT\",
    \"description\":\"Test\",
    \"amount\":100000,
    \"category\":\"Préstamo\",
    \"movement_date\":\"2026-01-15\",
    \"payer_user_id\":\"$JOSE_ID\"
  }")
[ "$DEBT_NO_COUNTERPARTY" = "400" ]
echo -e "${GREEN}✓ Rejected DEBT_PAYMENT without counterparty${NC}\n"

run_test "[DEBT_PAYMENT] External payer (contact pays Jose)"
CREATE_DEBT_EXTERNAL=$(api_call $CURL_FLAGS -X POST $BASE_URL/movements \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"DEBT_PAYMENT\",
    \"description\":\"Maria me paga\",
    \"amount\":40000,
    \"movement_date\":\"2026-01-19\",
    \"payer_contact_id\":\"$CONTACT_ID\",
    \"counterparty_user_id\":\"$JOSE_ID\"
  }")
echo "$CREATE_DEBT_EXTERNAL" | jq -e '.type == "DEBT_PAYMENT"' > /dev/null
echo "$CREATE_DEBT_EXTERNAL" | jq -e '.payer_name' > /dev/null
echo -e "${GREEN}✓ Created DEBT_PAYMENT with external payer${NC}\n"

# ═══════════════════════════════════════════════════════════
# LIST, GET, UPDATE, DELETE
# ═══════════════════════════════════════════════════════════

run_test "List all movements"
LIST_MOVEMENTS=$(api_call $CURL_FLAGS -X GET $BASE_URL/movements -b $COOKIES_FILE)
MOVEMENT_COUNT=$(echo "$LIST_MOVEMENTS" | jq '.movements | length')
[ "$MOVEMENT_COUNT" -ge "5" ]
echo "$LIST_MOVEMENTS" | jq -e '.totals.total_amount' > /dev/null
echo "$LIST_MOVEMENTS" | jq -e '.totals.by_type' > /dev/null
echo -e "${GREEN}✓ Listed $MOVEMENT_COUNT movements with totals${NC}\n"

run_test "Filter by type (HOUSEHOLD)"
LIST_HOUSEHOLD=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=HOUSEHOLD" -b $COOKIES_FILE)
HOUSEHOLD_COUNT=$(echo "$LIST_HOUSEHOLD" | jq '.movements | length')
[ "$HOUSEHOLD_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Filtered by type: $HOUSEHOLD_COUNT HOUSEHOLD movements${NC}\n"

run_test "Filter by month"
LIST_MONTH=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?month=2026-01" -b $COOKIES_FILE)
MONTH_COUNT=$(echo "$LIST_MONTH" | jq '.movements | length')
[ "$MONTH_COUNT" -ge "5" ]
echo -e "${GREEN}✓ Filtered by month: $MONTH_COUNT movements${NC}\n"

run_test "Get movement by ID"
GET_MOVEMENT=$(api_call $CURL_FLAGS -X GET $BASE_URL/movements/$SPLIT_MOV_ID -b $COOKIES_FILE)
echo "$GET_MOVEMENT" | jq -e '.id == "'$SPLIT_MOV_ID'"' > /dev/null
echo "$GET_MOVEMENT" | jq -e '.type == "SPLIT"' > /dev/null
echo "$GET_MOVEMENT" | jq -e '.participants | length == 2' > /dev/null
echo "$GET_MOVEMENT" | jq -e '.payer_name == "Jose"' > /dev/null
echo "$GET_MOVEMENT" | jq -e '.payment_method_name == "AMEX Jose"' > /dev/null
# Verify participant details
PARTICIPANT_1_PCT=$(echo "$GET_MOVEMENT" | jq -r '.participants[0].percentage')
PARTICIPANT_2_PCT=$(echo "$GET_MOVEMENT" | jq -r '.participants[1].percentage')
TOTAL_PCT=$(echo "$PARTICIPANT_1_PCT + $PARTICIPANT_2_PCT" | bc)
[ "$TOTAL_PCT" = "1.0" ] || [ "$TOTAL_PCT" = "1" ]
echo "$GET_MOVEMENT" | jq -e '.participants[0].participant_name' > /dev/null
echo "$GET_MOVEMENT" | jq -e '.participants[1].participant_name' > /dev/null
echo -e "${GREEN}✓ Retrieved SPLIT movement with 2 participants (percentages sum to 100%)${NC}\n"

run_test "Update movement"
UPDATE_MOVEMENT=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/movements/$HOUSEHOLD_MOV_ID \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d '{"amount":280000,"description":"Mercado del mes + extras"}')
echo "$UPDATE_MOVEMENT" | jq -e '.amount == 280000' > /dev/null
echo "$UPDATE_MOVEMENT" | jq -e '.description == "Mercado del mes + extras"' > /dev/null
echo -e "${GREEN}✓ Updated movement${NC}\n"

run_test "Delete movement"
DELETE_RESULT=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X DELETE $BASE_URL/movements/$DEBT_MOV_ID -b $COOKIES_FILE)
[ "$DELETE_RESULT" = "204" ]
echo -e "${GREEN}✓ Deleted movement${NC}\n"

run_test "Verify deletion (404 on GET)"
GET_DELETED=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X GET $BASE_URL/movements/$DEBT_MOV_ID -b $COOKIES_FILE)
[ "$GET_DELETED" = "404" ]
echo -e "${GREEN}✓ Confirmed deletion${NC}\n"

# ═══════════════════════════════════════════════════════════
# AUTHORIZATION TESTS
# ═══════════════════════════════════════════════════════════

run_test "Prevent unauthorized access (no session)"
UNAUTHORIZED=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X GET $BASE_URL/movements)
[ "$UNAUTHORIZED" = "401" ]
echo -e "${GREEN}✓ Rejected unauthorized access${NC}\n"

# ═══════════════════════════════════════════════════════════
# DATA INTEGRITY VALIDATION (using API)
# ═══════════════════════════════════════════════════════════

run_test "Verify all created movements exist in list"
FINAL_LIST=$(api_call $CURL_FLAGS -X GET $BASE_URL/movements -b $COOKIES_FILE)
FINAL_COUNT=$(echo "$FINAL_LIST" | jq '.movements | length')
# Created 5, deleted 1 = 4 remaining
[ "$FINAL_COUNT" = "4" ]
echo -e "${GREEN}✓ Confirmed 4 movements in database (5 created - 1 deleted)${NC}\n"

run_test "Verify SPLIT movements have participants with correct percentages"
# Get the custom SPLIT movement (30/70)
SPLIT_LIST=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=SPLIT" -b $COOKIES_FILE)
SPLIT_COUNT=$(echo "$SPLIT_LIST" | jq '.movements | length')
[ "$SPLIT_COUNT" = "2" ]
# Check that both SPLIT movements have participants
SPLITS_WITH_PARTICIPANTS=$(echo "$SPLIT_LIST" | jq '[.movements[] | select(.participants != null and (.participants | length) > 0)] | length')
[ "$SPLITS_WITH_PARTICIPANTS" = "2" ]
# Verify one has 30/70 split
HAS_CUSTOM_SPLIT=$(echo "$SPLIT_LIST" | jq '[.movements[].participants[] | select(.percentage == 0.3 or .percentage == 0.7)] | length >= 2')
[ "$HAS_CUSTOM_SPLIT" = "true" ]
echo -e "${GREEN}✓ Both SPLIT movements have participants with correct percentages${NC}\n"

run_test "Verify HOUSEHOLD movements have NO participants"
HOUSEHOLD_LIST=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=HOUSEHOLD" -b $COOKIES_FILE)
HOUSEHOLD_WITH_PARTICIPANTS=$(echo "$HOUSEHOLD_LIST" | jq '[.movements[] | select(.participants != null and (.participants | length) > 0)] | length')
[ "$HOUSEHOLD_WITH_PARTICIPANTS" = "0" ]
echo -e "${GREEN}✓ HOUSEHOLD movements have no participants${NC}\n"

run_test "Verify DEBT_PAYMENT movements have counterparty info"
DEBT_LIST=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=DEBT_PAYMENT" -b $COOKIES_FILE)
DEBT_COUNT=$(echo "$DEBT_LIST" | jq '.movements | length')
[ "$DEBT_COUNT" = "1" ]  # Created 2, deleted 1 = 1 remaining
# Verify it has counterparty name
echo "$DEBT_LIST" | jq -e '.movements[0].counterparty_name != null' > /dev/null
echo -e "${GREEN}✓ DEBT_PAYMENT has counterparty information${NC}\n"

run_test "Verify totals calculation is correct"
TOTAL_AMOUNT=$(echo "$FINAL_LIST" | jq '.totals.total_amount')
# HOUSEHOLD (280000 after update) + SPLIT (120000) + SPLIT (100000) + DEBT (40000) = 540000
[ "$TOTAL_AMOUNT" = "540000" ]
BY_TYPE_COUNT=$(echo "$FINAL_LIST" | jq '.totals.by_type | length')
[ "$BY_TYPE_COUNT" -ge "1" ]  # At least one type has totals
echo -e "${GREEN}✓ Totals calculated correctly: $TOTAL_AMOUNT COP${NC}\n"

run_test "Verify participant names are enriched (not just IDs)"
SPLIT_DETAIL=$(api_call $CURL_FLAGS -X GET $BASE_URL/movements/$SPLIT_MOV_ID -b $COOKIES_FILE)
PARTICIPANT_NAMES=$(echo "$SPLIT_DETAIL" | jq '[.participants[].participant_name] | length')
[ "$PARTICIPANT_NAMES" = "2" ]
# Verify names are actual strings, not null
echo "$SPLIT_DETAIL" | jq -e '.participants[0].participant_name | type == "string"' > /dev/null
echo "$SPLIT_DETAIL" | jq -e '.participants[1].participant_name | type == "string"' > /dev/null
echo -e "${GREEN}✓ Participant names are enriched from user/contact tables${NC}\n"

# ═══════════════════════════════════════════════════════════
# DEBT CONSOLIDATION (for Resume page)
# ═══════════════════════════════════════════════════════════

run_test "Get debt consolidation (who owes whom)"
DEBTS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements/debts/consolidate" -b $COOKIES_FILE)
DEBTS_COUNT=$(echo "$DEBTS" | jq '.balances | length')
# We should have some debt balances from SPLIT movements
[ "$DEBTS_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Debt consolidation calculated: $DEBTS_COUNT balance(s)${NC}\n"

run_test "Verify debt consolidation has required fields"
echo "$DEBTS" | jq -e '.balances[0].debtor_id' > /dev/null
echo "$DEBTS" | jq -e '.balances[0].debtor_name' > /dev/null
echo "$DEBTS" | jq -e '.balances[0].creditor_id' > /dev/null
echo "$DEBTS" | jq -e '.balances[0].creditor_name' > /dev/null
echo "$DEBTS" | jq -e '.balances[0].amount' > /dev/null
echo "$DEBTS" | jq -e '.balances[0].currency' > /dev/null
echo -e "${GREEN}✓ Debt balances have all required fields (names, IDs, amounts)${NC}\n"

run_test "Verify debt consolidation with month filter"
DEBTS_JAN=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements/debts/consolidate?month=2026-01" -b $COOKIES_FILE)
echo "$DEBTS_JAN" | jq -e '.month == "2026-01"' > /dev/null
JAN_DEBTS_COUNT=$(echo "$DEBTS_JAN" | jq '.balances | length')
[ "$JAN_DEBTS_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Month filter works: $JAN_DEBTS_COUNT balance(s) in 2026-01${NC}\n"

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║                  ✓ ALL TESTS PASSED                   ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo "Test Summary:"
echo "  ✓ HOUSEHOLD movements: create, validate, enforce rules"
echo "  ✓ SPLIT movements: create with participants, validate percentages"
echo "  ✓ DEBT_PAYMENT movements: create, handle external payers"
echo "  ✓ List, filter, get, update, delete operations"
echo "  ✓ Authorization and error handling"
echo "  ✓ Data integrity: participants, percentages, enriched names, totals"
echo "  ✓ Debt consolidation: calculate who owes whom (for Resume page)"
echo ""
echo "Backend is ready for Phase 5 (Movements) 🚀"
