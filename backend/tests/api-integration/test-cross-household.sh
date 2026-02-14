#!/bin/bash
# Cross-Household Debt Visibility Integration Tests
# Tests that users linked as contacts in other households can see shared debts

set -e
set -o pipefail

BASE_URL="${API_BASE_URL:-http://localhost:8080}"
DATABASE_URL="${DATABASE_URL:-postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable}"
COOKIES_JOSE="/tmp/gastos-cross-jose-cookies.txt"
COOKIES_MARIA="/tmp/gastos-cross-maria-cookies.txt"
TIMESTAMP=$(date +%s%N)
JOSE_EMAIL="jose+cross${TIMESTAMP}@test.com"
MARIA_EMAIL="maria+cross${TIMESTAMP}@test.com"
PASSWORD="Test1234!"
DEBUG="${DEBUG:-false}"

CURL_FLAGS="-s"
if [ "$DEBUG" = "true" ]; then
  CURL_FLAGS="-v"
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${YELLOW}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   🧪 Cross-Household Debt Visibility Integration Tests    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

rm -f $COOKIES_JOSE $COOKIES_MARIA

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

api_call() {
  LAST_RESPONSE=$(curl "$@")
  echo "$LAST_RESPONSE"
}

run_test() {
  echo -e "${CYAN}▶ $1${NC}"
}

# ═══════════════════════════════════════════════════════════
# SETUP: Two users, two households
# ═══════════════════════════════════════════════════════════

run_test "Register Jose"
api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$JOSE_EMAIL\",\"name\":\"Jose Test\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_JOSE > /dev/null
echo -e "${GREEN}✓ Jose registered${NC}\n"

run_test "Get Jose's info"
JOSE_ME=$(api_call $CURL_FLAGS $BASE_URL/me -b $COOKIES_JOSE)
JOSE_ID=$(echo "$JOSE_ME" | jq -r '.id')
[ -n "$JOSE_ID" ] && [ "$JOSE_ID" != "null" ]
echo -e "${GREEN}✓ Jose ID: $JOSE_ID${NC}\n"

run_test "Create Jose's Household"
JOSE_HOUSEHOLD=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -b $COOKIES_JOSE \
  -H "Content-Type: application/json" \
  -d '{"name":"Hogar de Jose"}')
JOSE_HOUSEHOLD_ID=$(echo "$JOSE_HOUSEHOLD" | jq -r '.id')
[ -n "$JOSE_HOUSEHOLD_ID" ] && [ "$JOSE_HOUSEHOLD_ID" != "null" ]
echo -e "${GREEN}✓ Jose's household: $JOSE_HOUSEHOLD_ID${NC}\n"

run_test "Register Maria"
api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$MARIA_EMAIL\",\"name\":\"Maria Isabel\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_MARIA > /dev/null
echo -e "${GREEN}✓ Maria registered${NC}\n"

run_test "Get Maria's info"
MARIA_ME=$(api_call $CURL_FLAGS $BASE_URL/me -b $COOKIES_MARIA)
MARIA_ID=$(echo "$MARIA_ME" | jq -r '.id')
[ -n "$MARIA_ID" ] && [ "$MARIA_ID" != "null" ]
echo -e "${GREEN}✓ Maria ID: $MARIA_ID${NC}\n"

run_test "Create Maria's Household"
MARIA_HOUSEHOLD=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -b $COOKIES_MARIA \
  -H "Content-Type: application/json" \
  -d '{"name":"Hogar de Maria"}')
MARIA_HOUSEHOLD_ID=$(echo "$MARIA_HOUSEHOLD" | jq -r '.id')
[ -n "$MARIA_HOUSEHOLD_ID" ] && [ "$MARIA_HOUSEHOLD_ID" != "null" ]
echo -e "${GREEN}✓ Maria's household: $MARIA_HOUSEHOLD_ID${NC}\n"

# ═══════════════════════════════════════════════════════════
# SETUP: Jose adds Maria as a linked contact
# ═══════════════════════════════════════════════════════════

run_test "Jose adds Maria as contact (with linked_user_id)"
# Create contact and then link it via DB
CREATE_CONTACT=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$JOSE_HOUSEHOLD_ID/contacts \
  -b $COOKIES_JOSE \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Maria Isabel\",\"email\":\"$MARIA_EMAIL\"}")
MARIA_CONTACT_ID=$(echo "$CREATE_CONTACT" | jq -r '.id')
[ -n "$MARIA_CONTACT_ID" ] && [ "$MARIA_CONTACT_ID" != "null" ]

# Link the contact to Maria's user account via DB
if [ -n "$CI" ] || psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null 2>&1; then
  PAGER=cat psql "$DATABASE_URL" -c "UPDATE contacts SET linked_user_id = '$MARIA_ID' WHERE id = '$MARIA_CONTACT_ID';" > /dev/null 2>&1
else
  docker compose exec -T postgres psql -U conti -d conti -c "UPDATE contacts SET linked_user_id = '$MARIA_ID' WHERE id = '$MARIA_CONTACT_ID';" > /dev/null 2>&1
fi
echo -e "${GREEN}✓ Maria is a linked contact in Jose's household: $MARIA_CONTACT_ID${NC}\n"

# ═══════════════════════════════════════════════════════════
# SETUP: Jose creates a payment method
# ═══════════════════════════════════════════════════════════

run_test "Create Jose's payment method"
CREATE_PM=$(api_call $CURL_FLAGS -X POST $BASE_URL/payment-methods \
  -b $COOKIES_JOSE \
  -H "Content-Type: application/json" \
  -d '{"name":"Débito Jose","type":"debit_card","is_shared_with_household":true}')
PM_ID=$(echo "$CREATE_PM" | jq -r '.id')
[ -n "$PM_ID" ] && [ "$PM_ID" != "null" ]
echo -e "${GREEN}✓ Payment method created${NC}\n"

# ═══════════════════════════════════════════════════════════
# CREATE SPLIT MOVEMENTS in Jose's household involving Maria
# ═══════════════════════════════════════════════════════════

CURRENT_MONTH=$(date +%Y-%m)

run_test "Jose creates SPLIT movement: Arriendo (Jose pays, Maria participates 50%)"
SPLIT1=$(api_call $CURL_FLAGS -X POST $BASE_URL/movements \
  -b $COOKIES_JOSE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"SPLIT\",
    \"description\": \"Arriendo enero\",
    \"amount\": 2000000,
    \"movement_date\": \"$(date +%Y-%m-01)\",
    \"payer_user_id\": \"$JOSE_ID\",
    \"payment_method_id\": \"$PM_ID\",
    \"participants\": [
      {\"participant_user_id\": \"$JOSE_ID\", \"percentage\": 0.5},
      {\"participant_contact_id\": \"$MARIA_CONTACT_ID\", \"percentage\": 0.5}
    ]
  }")
SPLIT1_ID=$(echo "$SPLIT1" | jq -r '.id')
[ -n "$SPLIT1_ID" ] && [ "$SPLIT1_ID" != "null" ]
echo -e "${GREEN}✓ SPLIT movement created: $SPLIT1_ID (Maria owes Jose $1,000,000)${NC}\n"

run_test "Jose creates SPLIT movement: Mercado (Maria contact pays, Jose participates)"
SPLIT2=$(api_call $CURL_FLAGS -X POST $BASE_URL/movements \
  -b $COOKIES_JOSE \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"SPLIT\",
    \"description\": \"Mercado semanal\",
    \"amount\": 400000,
    \"movement_date\": \"$(date +%Y-%m-05)\",
    \"payer_contact_id\": \"$MARIA_CONTACT_ID\",
    \"participants\": [
      {\"participant_user_id\": \"$JOSE_ID\", \"percentage\": 0.5},
      {\"participant_contact_id\": \"$MARIA_CONTACT_ID\", \"percentage\": 0.5}
    ]
  }")
SPLIT2_ID=$(echo "$SPLIT2" | jq -r '.id')
[ -n "$SPLIT2_ID" ] && [ "$SPLIT2_ID" != "null" ]
echo -e "${GREEN}✓ SPLIT movement created: $SPLIT2_ID (Jose owes Maria $200,000)${NC}\n"

# ═══════════════════════════════════════════════════════════
# VERIFY: Jose's debt consolidation shows debts with Maria contact
# ═══════════════════════════════════════════════════════════

run_test "Jose's debt consolidation (should show Maria as contact)"
JOSE_DEBTS=$(api_call $CURL_FLAGS "$BASE_URL/movements/debts/consolidate?month=$CURRENT_MONTH" \
  -b $COOKIES_JOSE)
echo "$JOSE_DEBTS" | jq -e '.balances | length > 0' > /dev/null

# Jose's consolidation should use the CONTACT_ID for Maria (not her user_id)
# because in Jose's household, Maria is a contact
JOSE_BALANCE_COUNT=$(echo "$JOSE_DEBTS" | jq '.balances | length')
[ "$JOSE_BALANCE_COUNT" -ge 1 ]
echo -e "${GREEN}✓ Jose sees debts: $JOSE_BALANCE_COUNT balance(s)${NC}\n"

# ═══════════════════════════════════════════════════════════
# VERIFY: Maria's debt consolidation shows cross-household debts
# ═══════════════════════════════════════════════════════════

run_test "Maria's debt consolidation (should include cross-household debts)"
MARIA_DEBTS=$(api_call $CURL_FLAGS "$BASE_URL/movements/debts/consolidate?month=$CURRENT_MONTH" \
  -b $COOKIES_MARIA)

# Maria should see debts from Jose's household
MARIA_BALANCE_COUNT=$(echo "$MARIA_DEBTS" | jq '.balances | length')
[ "$MARIA_BALANCE_COUNT" -ge 1 ]
echo -e "${GREEN}✓ Maria sees $MARIA_BALANCE_COUNT balance(s) from cross-household${NC}\n"

run_test "Maria's debts include cross-household flag"
# At least one balance should be marked as cross-household
HAS_CROSS=$(echo "$MARIA_DEBTS" | jq '[.balances[] | select(.is_cross_household == true)] | length')
[ "$HAS_CROSS" -ge 1 ]
echo -e "${GREEN}✓ Cross-household flag is set on balances${NC}\n"

run_test "Maria's movements include source household name"
# Check movements have source_household_name
HAS_SOURCE=$(echo "$MARIA_DEBTS" | jq '[.balances[].movements[] | select(.source_household_name != null and .source_household_name != "")] | length')
[ "$HAS_SOURCE" -ge 1 ]
echo -e "${GREEN}✓ Source household name is set on movements${NC}\n"

run_test "Verify net debt amount is correct"
# Maria owes Jose: 1,000,000 (50% of 2M Arriendo)
# Jose owes Maria: 200,000 (50% of 400K Mercado)
# Net: Maria owes Jose 800,000

# Find the balance involving Maria's user_id
NET_AMOUNT=$(echo "$MARIA_DEBTS" | jq "[.balances[] | select(
  (.debtor_id == \"$MARIA_ID\" and .creditor_id == \"$JOSE_ID\") or
  (.debtor_id == \"$JOSE_ID\" and .creditor_id == \"$MARIA_ID\")
)] | .[0].amount")
[ -n "$NET_AMOUNT" ] && [ "$NET_AMOUNT" != "null" ]

# Check the net amount is 800,000 (with floating point tolerance)
EXPECTED=800000
DIFF=$(echo "$NET_AMOUNT - $EXPECTED" | bc 2>/dev/null || python3 -c "print(abs($NET_AMOUNT - $EXPECTED))")
IS_CLOSE=$(python3 -c "print(1 if abs($NET_AMOUNT - $EXPECTED) < 1 else 0)")
[ "$IS_CLOSE" = "1" ]
echo -e "${GREEN}✓ Net debt amount correct: $NET_AMOUNT (expected ~$EXPECTED)${NC}\n"

run_test "Verify debtor/creditor direction"
# Maria should be the debtor (she owes Jose)
DEBTOR_ID=$(echo "$MARIA_DEBTS" | jq -r "[.balances[] | select(
  (.debtor_id == \"$MARIA_ID\" and .creditor_id == \"$JOSE_ID\") or
  (.debtor_id == \"$JOSE_ID\" and .creditor_id == \"$MARIA_ID\")
)] | .[0].debtor_id")
[ "$DEBTOR_ID" = "$MARIA_ID" ]
echo -e "${GREEN}✓ Maria is correctly shown as debtor${NC}\n"

run_test "Verify Maria sees correct number of movements"
# Should see 2 movements: Arriendo (debt) + Mercado (reverse)
MOVEMENT_COUNT=$(echo "$MARIA_DEBTS" | jq "[.balances[] | select(
  (.debtor_id == \"$MARIA_ID\" and .creditor_id == \"$JOSE_ID\") or
  (.debtor_id == \"$JOSE_ID\" and .creditor_id == \"$MARIA_ID\")
)] | .[0].movements | length")
[ "$MOVEMENT_COUNT" -eq 2 ]
echo -e "${GREEN}✓ Maria sees 2 movements (Arriendo + Mercado)${NC}\n"

run_test "Verify movement IDs use Maria's user_id (translated from contact_id)"
# The movements should reference Maria's actual user_id, not her contact_id in Jose's household
HAS_CONTACT_ID=$(echo "$MARIA_DEBTS" | jq "[.balances[] | .movements[] | select(.payer_id == \"$MARIA_CONTACT_ID\")] | length")
[ "$HAS_CONTACT_ID" -eq 0 ]
echo -e "${GREEN}✓ Contact IDs correctly translated to user IDs${NC}\n"

# ═══════════════════════════════════════════════════════════
# VERIFY: Jose's consolidation is UNCHANGED
# ═══════════════════════════════════════════════════════════

run_test "Jose's consolidation is unchanged (no cross-household flag)"
JOSE_CROSS=$(echo "$JOSE_DEBTS" | jq '[.balances[] | select(.is_cross_household == true)] | length')
[ "$JOSE_CROSS" -eq 0 ]
echo -e "${GREEN}✓ Jose's debts have no cross-household flag (as expected)${NC}\n"

# ═══════════════════════════════════════════════════════════
# VERIFY: Maria cannot see debts without linked contact
# ═══════════════════════════════════════════════════════════

run_test "Unlinked contact: Remove linked_user_id and verify no cross-household debts"
# Temporarily unlink
if [ -n "$CI" ] || psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null 2>&1; then
  PAGER=cat psql "$DATABASE_URL" -c "UPDATE contacts SET linked_user_id = NULL WHERE id = '$MARIA_CONTACT_ID';" > /dev/null 2>&1
else
  docker compose exec -T postgres psql -U conti -d conti -c "UPDATE contacts SET linked_user_id = NULL WHERE id = '$MARIA_CONTACT_ID';" > /dev/null 2>&1
fi

MARIA_DEBTS_UNLINKED=$(api_call $CURL_FLAGS "$BASE_URL/movements/debts/consolidate?month=$CURRENT_MONTH" \
  -b $COOKIES_MARIA)
UNLINKED_COUNT=$(echo "$MARIA_DEBTS_UNLINKED" | jq '.balances | length')
[ "$UNLINKED_COUNT" -eq 0 ]

# Re-link
if [ -n "$CI" ] || psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null 2>&1; then
  PAGER=cat psql "$DATABASE_URL" -c "UPDATE contacts SET linked_user_id = '$MARIA_ID' WHERE id = '$MARIA_CONTACT_ID';" > /dev/null 2>&1
else
  docker compose exec -T postgres psql -U conti -d conti -c "UPDATE contacts SET linked_user_id = '$MARIA_ID' WHERE id = '$MARIA_CONTACT_ID';" > /dev/null 2>&1
fi
echo -e "${GREEN}✓ Without linked_user_id, Maria sees 0 cross-household debts${NC}\n"

# ═══════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════

rm -f $COOKIES_JOSE $COOKIES_MARIA

echo -e "\n${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✓ ALL TESTS PASSED                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo "Test Summary:"
echo "  ✓ Two independent users with separate households"
echo "  ✓ Contact linking via linked_user_id"
echo "  ✓ SPLIT movements in one household visible to linked user"
echo "  ✓ Cross-household flag set on balances and movements"
echo "  ✓ Source household name included"
echo "  ✓ Contact IDs translated to user IDs"
echo "  ✓ Net debt amounts calculated correctly"
echo "  ✓ Debtor/creditor direction correct"
echo "  ✓ Original household consolidation unchanged"
echo "  ✓ Unlinking removes cross-household visibility"
echo ""
echo "Cross-Household Debt Visibility is working! 🔗"
