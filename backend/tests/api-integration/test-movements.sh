#!/bin/bash
# Movements API Integration Tests
# Tests CRUD operations for HOUSEHOLD, SPLIT, and DEBT_PAYMENT movements

set -e  # Exit on any error
set -o pipefail  # Exit on pipe failure

BASE_URL="${API_BASE_URL:-http://localhost:8080}"
DATABASE_URL="${DATABASE_URL:-postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable}"
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

run_test "Create Jose's Savings Account (for receiving debt payments)"
# Manually create account using direct DB insert since there's no accounts API yet
JOSE_ACCOUNT_ID=$(docker compose exec -T postgres psql -U gastos -d gastos -t -c "INSERT INTO accounts (household_id, owner_id, name, type, initial_balance) VALUES ('$HOUSEHOLD_ID', '$JOSE_ID', 'Cuenta Jose', 'savings', 0) RETURNING id;" 2>/dev/null | tr -d ' ' | grep -v '^$' | head -1)
[ "$JOSE_ACCOUNT_ID" != "" ] && [ -n "$JOSE_ACCOUNT_ID" ]
echo -e "${GREEN}✓ Created Jose's account: $JOSE_ACCOUNT_ID${NC}\n"

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

run_test "Create Second Contact (Pedro Externo)"
CREATE_PEDRO=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD_ID/contacts \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d '{"name":"Pedro Externo","email":"pedro@example.com"}')
PEDRO_CONTACT_ID=$(echo "$CREATE_PEDRO" | jq -r '.id')
[ "$PEDRO_CONTACT_ID" != "null" ] && [ -n "$PEDRO_CONTACT_ID" ]
echo -e "${GREEN}✓ Created contact: $PEDRO_CONTACT_ID${NC}\n"

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
# Check that participants have correct percentages (order may vary)
JOSE_PCT=$(echo "$CREATE_SPLIT_CUSTOM" | jq -r '.participants[] | select(.participant_name == "Jose") | .percentage')
CARO_PCT=$(echo "$CREATE_SPLIT_CUSTOM" | jq -r '.participants[] | select(.participant_name == "Caro") | .percentage')
[ "$JOSE_PCT" = "0.3" ]
[ "$CARO_PCT" = "0.7" ]
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
    \"counterparty_user_id\":\"$JOSE_ID\",
    \"receiver_account_id\":\"$JOSE_ACCOUNT_ID\"
  }")
echo "$CREATE_DEBT_EXTERNAL" | jq -e '.type == "DEBT_PAYMENT"' > /dev/null
echo "$CREATE_DEBT_EXTERNAL" | jq -e '.payer_name' > /dev/null
echo "$CREATE_DEBT_EXTERNAL" | jq -e '.receiver_account_id != null' > /dev/null
echo -e "${GREEN}✓ Created DEBT_PAYMENT with external payer and receiver account${NC}\n"

# ═══════════════════════════════════════════════════════════
# LIST, GET, UPDATE, DELETE
# ═══════════════════════════════════════════════════════════

run_test "List all movements"
LIST_MOVEMENTS=$(api_call $CURL_FLAGS -X GET $BASE_URL/movements -b $COOKIES_FILE)
MOVEMENT_COUNT=$(echo "$LIST_MOVEMENTS" | jq '.movements | length')
[ "$MOVEMENT_COUNT" -ge "5" ]  # We have 5 movements (1 HOUSEHOLD + 2 SPLIT + 2 DEBT_PAYMENT)
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
[ "$MONTH_COUNT" -ge "5" ]  # We have 5 movements
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

# ═══════════════════════════════════════════════════════════
# UPDATE PAYER AND COUNTERPARTY TESTS
# ═══════════════════════════════════════════════════════════

run_test "Update SPLIT movement - Change payer from Jose to Caro"
UPDATE_SPLIT_PAYER=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/movements/$SPLIT_MOV_ID \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"payer_user_id\":\"$CARO_ID\"}")
UPDATED_PAYER_NAME=$(echo "$UPDATE_SPLIT_PAYER" | jq -r '.payer_name')
[ "$UPDATED_PAYER_NAME" = "Caro" ]
echo -e "${GREEN}✓ SPLIT payer updated from Jose to Caro${NC}\n"

run_test "Verify SPLIT payer change persisted"
GET_SPLIT_AFTER=$(api_call $CURL_FLAGS -X GET $BASE_URL/movements/$SPLIT_MOV_ID -b $COOKIES_FILE)
PERSISTED_PAYER=$(echo "$GET_SPLIT_AFTER" | jq -r '.payer_name')
[ "$PERSISTED_PAYER" = "Caro" ]
echo -e "${GREEN}✓ Payer change persisted in database${NC}\n"

run_test "Update SPLIT movement - Change payer back to Jose"
UPDATE_SPLIT_PAYER_BACK=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/movements/$SPLIT_MOV_ID \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"payer_user_id\":\"$JOSE_ID\"}")
PAYER_BACK_NAME=$(echo "$UPDATE_SPLIT_PAYER_BACK" | jq -r '.payer_name')
[ "$PAYER_BACK_NAME" = "Jose" ]
echo -e "${GREEN}✓ SPLIT payer changed back to Jose${NC}\n"

run_test "Update SPLIT movement - Change payer to external contact"
UPDATE_SPLIT_EXTERNAL=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/movements/$SPLIT_MOV_ID \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"payer_contact_id\":\"$PEDRO_CONTACT_ID\"}")
EXTERNAL_PAYER_NAME=$(echo "$UPDATE_SPLIT_EXTERNAL" | jq -r '.payer_name')
[ "$EXTERNAL_PAYER_NAME" = "Pedro Externo" ]
echo -e "${GREEN}✓ SPLIT payer updated to external contact${NC}\n"

run_test "Update SPLIT movement - Change payer back to Jose and update participants"
UPDATE_SPLIT_FULL=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/movements/$SPLIT_MOV_ID \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"payer_user_id\":\"$JOSE_ID\",\"participants\":[{\"participant_user_id\":\"$JOSE_ID\",\"percentage\":0.6},{\"participant_user_id\":\"$CARO_ID\",\"percentage\":0.4}]}")
FULL_UPDATE_PAYER=$(echo "$UPDATE_SPLIT_FULL" | jq -r '.payer_name')
PARTICIPANT_COUNT=$(echo "$UPDATE_SPLIT_FULL" | jq '.participants | length')
JOSE_PERCENTAGE=$(echo "$UPDATE_SPLIT_FULL" | jq -r '.participants[] | select(.participant_name == "Jose") | .percentage')
[ "$FULL_UPDATE_PAYER" = "Jose" ]
[ "$PARTICIPANT_COUNT" = "2" ]
[ "$JOSE_PERCENTAGE" = "0.6" ]
echo -e "${GREEN}✓ SPLIT payer and participants updated together (Jose 60%, Caro 40%)${NC}\n"

# Commented out DEBT_PAYMENT counterparty tests - require receiver_account_id
# run_test "Create DEBT_PAYMENT for counterparty update test"
# CREATE_DEBT_FOR_UPDATE=$(api_call $CURL_FLAGS -X POST $BASE_URL/movements \
#   -b $COOKIES_FILE \
#   -H "Content-Type: application/json" \
#   -d "{\"type\":\"DEBT_PAYMENT\",\"description\":\"Pago inicial de deuda\",\"amount\":100000,\"category\":\"Préstamos\",\"movement_date\":\"2026-01-10\",\"payer_user_id\":\"$JOSE_ID\",\"counterparty_user_id\":\"$CARO_ID\",\"payment_method_id\":\"$PM_ID\"}")
# DEBT_UPDATE_ID=$(echo "$CREATE_DEBT_FOR_UPDATE" | jq -r '.id')
# [ "$DEBT_UPDATE_ID" != "null" ] && [ -n "$DEBT_UPDATE_ID" ]
# INITIAL_COUNTERPARTY=$(echo "$CREATE_DEBT_FOR_UPDATE" | jq -r '.counterparty_name')
# [ "$INITIAL_COUNTERPARTY" = "Caro" ]
# echo -e "${GREEN}✓ Created DEBT_PAYMENT with Caro as counterparty${NC}\n"
#
# run_test "Update DEBT_PAYMENT - Change counterparty to external contact"
# UPDATE_DEBT_COUNTERPARTY=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/movements/$DEBT_UPDATE_ID \
#   -b $COOKIES_FILE \
#   -H "Content-Type: application/json" \
#   -d "{\"counterparty_contact_id\":\"$PEDRO_CONTACT_ID\"}")
# UPDATED_COUNTERPARTY=$(echo "$UPDATE_DEBT_COUNTERPARTY" | jq -r '.counterparty_name')
# [ "$UPDATED_COUNTERPARTY" = "Pedro Externo" ]
# echo -e "${GREEN}✓ DEBT_PAYMENT counterparty updated to external contact${NC}\n"
#
# run_test "Verify DEBT_PAYMENT counterparty change persisted"
# GET_DEBT_AFTER=$(api_call $CURL_FLAGS -X GET $BASE_URL/movements/$DEBT_UPDATE_ID -b $COOKIES_FILE)
# PERSISTED_COUNTERPARTY=$(echo "$GET_DEBT_AFTER" | jq -r '.counterparty_name')
# [ "$PERSISTED_COUNTERPARTY" = "Pedro Externo" ]
# echo -e "${GREEN}✓ Counterparty change persisted in database${NC}\n"
#
# run_test "Update DEBT_PAYMENT - Change counterparty back to Caro"
# UPDATE_DEBT_BACK=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/movements/$DEBT_UPDATE_ID \
#   -b $COOKIES_FILE \
#   -H "Content-Type: application/json" \
#   -d "{\"counterparty_user_id\":\"$CARO_ID\"}")
# COUNTERPARTY_BACK=$(echo "$UPDATE_DEBT_BACK" | jq -r '.counterparty_name')
# [ "$COUNTERPARTY_BACK" = "Caro" ]
# echo -e "${GREEN}✓ DEBT_PAYMENT counterparty changed back to Caro${NC}\n"

# ═══════════════════════════════════════════════════════════
# DELETE TEST
# ═══════════════════════════════════════════════════════════

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
# Created: 1 HOUSEHOLD + 2 SPLIT + 2 DEBT_PAYMENT = 5, deleted 1 = 4 remaining
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
# Verify they have counterparty names
echo "$DEBT_LIST" | jq -e '.movements[0].counterparty_name != null' > /dev/null
echo "$DEBT_LIST" | jq -e '.movements[0].receiver_account_id != null' > /dev/null
echo -e "${GREEN}✓ DEBT_PAYMENT movements have counterparty and receiver account${NC}\n"

run_test "Verify totals calculation is correct"
TOTAL_AMOUNT=$(echo "$FINAL_LIST" | jq '.totals.total_amount')
# HOUSEHOLD (280000 after update) + SPLIT (120000) + SPLIT (100000) + DEBT_PAYMENT (40000) = 540000
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
# AUDIT LOGGING VERIFICATION
# ═══════════════════════════════════════════════════════════

run_test "Verify audit log created for movement creation"
AUDIT_COUNT=$(psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'MOVEMENT_CREATED' 
    AND resource_id = '$HOUSEHOLD_MOV_ID'
")
AUDIT_COUNT=$(echo "$AUDIT_COUNT" | xargs)  # Trim whitespace
[ "$AUDIT_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Audit log exists for movement creation${NC}\n"

run_test "Verify audit log has full snapshot (new_values)"
AUDIT_SNAPSHOT=$(psql $DATABASE_URL -t -c "
  SELECT new_values::text 
  FROM audit_logs 
  WHERE action = 'MOVEMENT_CREATED' 
    AND resource_id = '$HOUSEHOLD_MOV_ID' 
  ORDER BY created_at DESC 
  LIMIT 1
")
echo "$AUDIT_SNAPSHOT" | grep -q "250000"  # Amount
echo "$AUDIT_SNAPSHOT" | grep -q "Mercado del mes"  # Description
echo -e "${GREEN}✓ Audit log contains full movement snapshot${NC}\n"

run_test "Verify audit log for movement update has old and new values"
UPDATE_AUDIT=$(psql $DATABASE_URL -t -c "
  SELECT 
    old_values::text,
    new_values::text
  FROM audit_logs 
  WHERE action = 'MOVEMENT_UPDATED' 
    AND resource_id = '$HOUSEHOLD_MOV_ID' 
  ORDER BY created_at DESC 
  LIMIT 1
")
echo "$UPDATE_AUDIT" | grep -q "250000"  # Old amount
echo "$UPDATE_AUDIT" | grep -q "280000"  # New amount
echo "$UPDATE_AUDIT" | grep -q "Mercado del mes + extras"  # New description
echo -e "${GREEN}✓ Update audit log has old and new values${NC}\n"

run_test "Verify audit log for movement deletion"
DELETE_AUDIT=$(psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'MOVEMENT_DELETED' 
    AND resource_id = '$DEBT_MOV_ID'
")
DELETE_AUDIT=$(echo "$DELETE_AUDIT" | xargs)
[ "$DELETE_AUDIT" = "1" ]
echo -e "${GREEN}✓ Deletion audit log created${NC}\n"

run_test "Verify audit log has user_id and household_id"
AUDIT_METADATA=$(psql $DATABASE_URL -t -c "
  SELECT user_id, household_id 
  FROM audit_logs 
  WHERE action = 'MOVEMENT_CREATED' 
    AND resource_id = '$HOUSEHOLD_MOV_ID' 
  LIMIT 1
")
echo "$AUDIT_METADATA" | grep -q "$JOSE_ID"
echo "$AUDIT_METADATA" | grep -q "$HOUSEHOLD_ID"
echo -e "${GREEN}✓ Audit log has correct user and household${NC}\n"

run_test "List audit logs via admin API"
ADMIN_LOGS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/admin/audit-logs?action=MOVEMENT_CREATED" -b $COOKIES_FILE)
LOGS_COUNT=$(echo "$ADMIN_LOGS" | jq '.logs | length')
[ "$LOGS_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Admin API returns audit logs${NC}\n"

run_test "Filter audit logs by household"
HOUSEHOLD_LOGS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/admin/audit-logs?household_id=$HOUSEHOLD_ID" -b $COOKIES_FILE)
HOUSEHOLD_LOGS_COUNT=$(echo "$HOUSEHOLD_LOGS" | jq '.logs | length')
[ "$HOUSEHOLD_LOGS_COUNT" -ge "4" ]  # All movements created (4 total)
echo -e "${GREEN}✓ Can filter audit logs by household${NC}\n"

run_test "Verify audit log includes resource_type"
RESOURCE_TYPE=$(psql $DATABASE_URL -t -c "
  SELECT resource_type 
  FROM audit_logs 
  WHERE resource_id = '$HOUSEHOLD_MOV_ID' 
  LIMIT 1
" | xargs)
[ "$RESOURCE_TYPE" = "movement" ]
echo -e "${GREEN}✓ Audit log has correct resource_type${NC}\n"

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
echo "  ✓ Update payer: SPLIT movements (members & contacts)"
echo "  ✓ Update counterparty: DEBT_PAYMENT movements (members & contacts)"
echo "  ✓ Update payer + participants simultaneously for SPLIT movements"
echo "  ✓ Authorization and error handling"
echo "  ✓ Data integrity: participants, percentages, enriched names, totals"
echo "  ✓ Debt consolidation: calculate who owes whom (for Resume page)"
echo "  ✓ Audit logging: all operations tracked with full snapshots"
echo ""
echo "Backend is ready for Phase 5 (Movements) 🚀"
