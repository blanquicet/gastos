#!/bin/bash
# Budget Inheritance & Scope API Integration Tests
# Tests budget inheritance (LATERAL JOIN fallback), budget scope (THIS/FUTURE/ALL),
# and template delete scope (THIS/ALL)

set -e
set -o pipefail

BASE_URL="${API_BASE_URL:-http://localhost:8080}"
COOKIES_FILE="/tmp/gastos-scope-cookies.txt"
EMAIL="test+scope$(date +%s%N)@test.com"
PASSWORD="Test1234!"
DEBUG="${DEBUG:-false}"
DATABASE_URL="${DATABASE_URL:-postgresql://conti:conti_dev_password@localhost:5432/conti?sslmode=disable}"

CURL_FLAGS="-s"
if [ "$DEBUG" = "true" ]; then
  CURL_FLAGS="-v"
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${YELLOW}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  🧪 Budget Inheritance & Scope Integration Tests          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

rm -f $COOKIES_FILE

error_handler() {
  local line=$1
  echo -e "\n${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ✗ TEST FAILED at line $line${NC}"
  echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
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
# SETUP
# ═══════════════════════════════════════════════════════════

run_test "Health Check"
HEALTH=$(api_call $CURL_FLAGS $BASE_URL/health)
echo "$HEALTH" | jq -e '.status == "healthy"' > /dev/null
echo -e "${GREEN}✓ Server is healthy${NC}\n"

run_test "Register User"
REGISTER_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"name\":\"Scope Test User\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE)
echo -e "${GREEN}✓ User registered${NC}\n"

run_test "Get User ID"
ME_RESPONSE=$(api_call $CURL_FLAGS -X GET $BASE_URL/me \
  -b $COOKIES_FILE)
USER_ID=$(echo "$ME_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ User ID retrieved (ID: $USER_ID)${NC}\n"

run_test "Create Household"
HOUSEHOLD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Scope Test Household"}')
HOUSEHOLD_ID=$(echo "$HOUSEHOLD_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Household created (ID: $HOUSEHOLD_ID)${NC}\n"

run_test "Create Category Group"
GROUP_RESPONSE=$(api_call $CURL_FLAGS -X POST "$BASE_URL/category-groups" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Scope Test Group","icon":"🧪"}')
GROUP_ID=$(echo "$GROUP_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Group created (ID: $GROUP_ID)${NC}\n"

run_test "Create Category A"
CAT_A_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/categories \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Scope Cat A\",\"category_group_id\":\"$GROUP_ID\"}")
CAT_A_ID=$(echo "$CAT_A_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Category A created (ID: $CAT_A_ID)${NC}\n"

run_test "Create Category B"
CAT_B_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/categories \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Scope Cat B\",\"category_group_id\":\"$GROUP_ID\"}")
CAT_B_ID=$(echo "$CAT_B_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Category B created (ID: $CAT_B_ID)${NC}\n"

# Use fixed months to avoid GNU date arithmetic issues (e.g., March 31 - 1 month = March 3)
PREV_MONTH="2025-06"
CURRENT_MONTH="2025-07"
NEXT_MONTH="2025-08"
MONTH_AFTER_NEXT="2025-09"

echo -e "${CYAN}Months: prev=$PREV_MONTH current=$CURRENT_MONTH next=$NEXT_MONTH after=$MONTH_AFTER_NEXT${NC}\n"

# ═══════════════════════════════════════════════════════════
# BUDGET INHERITANCE TESTS
# ═══════════════════════════════════════════════════════════

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Budget Inheritance (LATERAL JOIN fallback)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

run_test "Set budget for Category A in current month"
SET_BUDGET=$(api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_A_ID\",\"month\":\"$CURRENT_MONTH\",\"amount\":500000,\"scope\":\"THIS\"}")
BUDGET_ID_A=$(echo "$SET_BUDGET" | jq -r '.id')
echo -e "${GREEN}✓ Budget set for current month: 500,000 (ID: $BUDGET_ID_A)${NC}\n"

run_test "Query next month — should INHERIT current month's budget"
BUDGETS_NEXT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$NEXT_MONTH" \
  -b $COOKIES_FILE)
INHERITED_AMOUNT=$(echo "$BUDGETS_NEXT" | jq -r ".budgets[] | select(.category_id == \"$CAT_A_ID\") | .amount")
if [ "$INHERITED_AMOUNT" = "500000" ]; then
  echo -e "${GREEN}✓ Next month inherits budget: $INHERITED_AMOUNT${NC}\n"
else
  echo -e "${RED}✗ Expected 500000 but got '$INHERITED_AMOUNT'${NC}"
  exit 1
fi

run_test "Query month-after-next — should also inherit"
BUDGETS_AFTER=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$MONTH_AFTER_NEXT" \
  -b $COOKIES_FILE)
INHERITED_AMOUNT=$(echo "$BUDGETS_AFTER" | jq -r ".budgets[] | select(.category_id == \"$CAT_A_ID\") | .amount")
if [ "$INHERITED_AMOUNT" = "500000" ]; then
  echo -e "${GREEN}✓ Month+2 also inherits budget: $INHERITED_AMOUNT${NC}\n"
else
  echo -e "${RED}✗ Expected 500000 but got '$INHERITED_AMOUNT'${NC}"
  exit 1
fi

run_test "Query previous month — should NOT have budget (nothing before current)"
BUDGETS_PREV=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$PREV_MONTH" \
  -b $COOKIES_FILE)
PREV_BUDGET=$(echo "$BUDGETS_PREV" | jq -r ".budgets[] | select(.category_id == \"$CAT_A_ID\") | .amount" 2>/dev/null || echo "")
if [ -z "$PREV_BUDGET" ] || [ "$PREV_BUDGET" = "null" ] || [ "$PREV_BUDGET" = "0" ]; then
  echo -e "${GREEN}✓ Previous month has no budget (correct — no fallback backwards): $PREV_BUDGET${NC}\n"
else
  echo -e "${RED}✗ Expected no budget for prev month but got $PREV_BUDGET${NC}"
  exit 1
fi

run_test "Override next month with explicit budget"
SET_NEXT=$(api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_A_ID\",\"month\":\"$NEXT_MONTH\",\"amount\":700000,\"scope\":\"FUTURE\"}")
echo -e "${GREEN}✓ Next month overridden with 700,000 (scope=FUTURE so month+2 inherits)${NC}\n"

run_test "Next month shows explicit value, not inherited"
BUDGETS_NEXT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$NEXT_MONTH" \
  -b $COOKIES_FILE)
EXPLICIT_AMOUNT=$(echo "$BUDGETS_NEXT" | jq -r ".budgets[] | select(.category_id == \"$CAT_A_ID\") | .amount")
if [ "$EXPLICIT_AMOUNT" = "700000" ]; then
  echo -e "${GREEN}✓ Next month has explicit budget: $EXPLICIT_AMOUNT${NC}\n"
else
  echo -e "${RED}✗ Expected 700000 but got '$EXPLICIT_AMOUNT'${NC}"
  exit 1
fi

run_test "Month+2 inherits from next month (most recent <= requested)"
BUDGETS_AFTER=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$MONTH_AFTER_NEXT" \
  -b $COOKIES_FILE)
INHERITED_FROM_NEXT=$(echo "$BUDGETS_AFTER" | jq -r ".budgets[] | select(.category_id == \"$CAT_A_ID\") | .amount")
if [ "$INHERITED_FROM_NEXT" = "700000" ]; then
  echo -e "${GREEN}✓ Month+2 now inherits from next month: $INHERITED_FROM_NEXT${NC}\n"
else
  echo -e "${RED}✗ Expected 700000 but got '$INHERITED_FROM_NEXT'${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════
# BUDGET SCOPE TESTS
# ═══════════════════════════════════════════════════════════

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Budget Scope (THIS / FUTURE / ALL)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Clean up: delete existing budgets for Cat B to start fresh
# First set explicit budgets for multiple months
run_test "Set budget for Cat B in current month (scope=THIS)"
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$CURRENT_MONTH\",\"amount\":100000,\"scope\":\"THIS\"}" > /dev/null
echo -e "${GREEN}✓ Cat B current = 100,000${NC}\n"

run_test "Set budget for Cat B in next month (scope=THIS)"
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$NEXT_MONTH\",\"amount\":200000,\"scope\":\"THIS\"}" > /dev/null
echo -e "${GREEN}✓ Cat B next = 200,000${NC}\n"

run_test "Set budget for Cat B in month+2 (scope=THIS)"
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$MONTH_AFTER_NEXT\",\"amount\":300000,\"scope\":\"THIS\"}" > /dev/null
echo -e "${GREEN}✓ Cat B month+2 = 300,000${NC}\n"

# --- Test scope=THIS ---
run_test "Update Cat B current month with scope=THIS (150k)"
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$CURRENT_MONTH\",\"amount\":150000,\"scope\":\"THIS\"}" > /dev/null
echo -e "${GREEN}✓ Updated current month to 150,000${NC}\n"

run_test "Verify scope=THIS: current changed, next/month+2 unchanged"
B_CURRENT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$CURRENT_MONTH" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")
B_NEXT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$NEXT_MONTH" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")
B_AFTER=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$MONTH_AFTER_NEXT" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")

if [ "$B_CURRENT" = "150000" ] && [ "$B_NEXT" = "200000" ] && [ "$B_AFTER" = "300000" ]; then
  echo -e "${GREEN}✓ scope=THIS correct: current=150k, next=200k, month+2=300k${NC}\n"
else
  echo -e "${RED}✗ Expected 150k/200k/300k but got $B_CURRENT/$B_NEXT/$B_AFTER${NC}"
  exit 1
fi

# --- Test scope=FUTURE ---
run_test "Update Cat B current month with scope=FUTURE (400k)"
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$CURRENT_MONTH\",\"amount\":400000,\"scope\":\"FUTURE\"}" > /dev/null
echo -e "${GREEN}✓ Updated current month to 400,000 with scope=FUTURE${NC}\n"

run_test "Verify scope=FUTURE: current changed, future records deleted (inherit 400k)"
B_CURRENT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$CURRENT_MONTH" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")
B_NEXT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$NEXT_MONTH" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")
B_AFTER=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$MONTH_AFTER_NEXT" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")

if [ "$B_CURRENT" = "400000" ] && [ "$B_NEXT" = "400000" ] && [ "$B_AFTER" = "400000" ]; then
  echo -e "${GREEN}✓ scope=FUTURE correct: all months show 400k (future inherits)${NC}\n"
else
  echo -e "${RED}✗ Expected 400k/400k/400k but got $B_CURRENT/$B_NEXT/$B_AFTER${NC}"
  exit 1
fi

# --- Test scope=ALL ---
# First create distinct records again
run_test "Re-create distinct budgets for scope=ALL test"
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$NEXT_MONTH\",\"amount\":500000,\"scope\":\"THIS\"}" > /dev/null
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$MONTH_AFTER_NEXT\",\"amount\":600000,\"scope\":\"THIS\"}" > /dev/null
echo -e "${GREEN}✓ Cat B: current=400k, next=500k, month+2=600k${NC}\n"

run_test "Update Cat B with scope=ALL (250k)"
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$CURRENT_MONTH\",\"amount\":250000,\"scope\":\"ALL\"}" > /dev/null
echo -e "${GREEN}✓ Updated with scope=ALL to 250,000${NC}\n"

run_test "Verify scope=ALL: ALL records updated to 250k"
B_CURRENT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$CURRENT_MONTH" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")
B_NEXT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$NEXT_MONTH" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")
B_AFTER=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$MONTH_AFTER_NEXT" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")

if [ "$B_CURRENT" = "250000" ] && [ "$B_NEXT" = "250000" ] && [ "$B_AFTER" = "250000" ]; then
  echo -e "${GREEN}✓ scope=ALL correct: all months updated to 250k${NC}\n"
else
  echo -e "${RED}✗ Expected 250k/250k/250k but got $B_CURRENT/$B_NEXT/$B_AFTER${NC}"
  exit 1
fi

# --- Test default scope ---
run_test "Default scope is FUTURE when not specified"
# Set distinct values first
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$NEXT_MONTH\",\"amount\":999000,\"scope\":\"THIS\"}" > /dev/null

# Now update current month WITHOUT scope field — should default to FUTURE
api_call $CURL_FLAGS -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$CURRENT_MONTH\",\"amount\":350000}" > /dev/null

B_NEXT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/budgets/$NEXT_MONTH" -b $COOKIES_FILE | jq -r ".budgets[] | select(.category_id == \"$CAT_B_ID\") | .amount")

# FUTURE should have deleted the next month override, so it inherits 350k
if [ "$B_NEXT" = "350000" ]; then
  echo -e "${GREEN}✓ Default scope=FUTURE: next month inherits 350k${NC}\n"
else
  echo -e "${RED}✗ Expected 350000 but got '$B_NEXT' (default scope may not be FUTURE)${NC}"
  exit 1
fi

# --- Test invalid scope ---
run_test "Reject invalid scope value"
INVALID_SCOPE_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X PUT "$BASE_URL/budgets" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"category_id\":\"$CAT_B_ID\",\"month\":\"$CURRENT_MONTH\",\"amount\":100000,\"scope\":\"INVALID\"}")
HTTP_CODE=$(echo "$INVALID_SCOPE_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✓ Invalid scope correctly rejected (400)${NC}\n"
else
  echo -e "${RED}✗ Expected 400 but got $HTTP_CODE${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════
# TEMPLATE DELETE SCOPE TESTS
# ═══════════════════════════════════════════════════════════

# Template tests need the real current month because the auto-generator
# creates movements dated in the actual current calendar month
REAL_CURRENT_MONTH=$(date +"%Y-%m")

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Template Delete Scope (THIS / ALL)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Create a contact for template payer
run_test "Create Contact for template tests"
CONTACT_RESPONSE=$(api_call $CURL_FLAGS -X POST "$BASE_URL/households/$HOUSEHOLD_ID/contacts" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Template Test Contact","email":"template-contact@test.com"}')
CONTACT_ID=$(echo "$CONTACT_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Contact created (ID: $CONTACT_ID)${NC}\n"

# --- Test scope=THIS (deactivate only) ---
run_test "Create template for scope=THIS delete test"
TEMPLATE_THIS=$(api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Scope THIS Template\",
    \"movement_type\": \"SPLIT\",
    \"category_id\": \"$CAT_A_ID\",
    \"amount\": 100000,
    \"auto_generate\": true,
    \"recurrence_pattern\": \"MONTHLY\",
    \"day_of_month\": 15,
    \"start_date\": \"2025-01-01\",
    \"payer_contact_id\": \"$CONTACT_ID\",
    \"participants\": [{\"participant_user_id\": \"$USER_ID\", \"percentage\": 1.0}]
  }")
TEMPLATE_THIS_ID=$(echo "$TEMPLATE_THIS" | jq -r '.id')
echo -e "${GREEN}✓ Template created (ID: $TEMPLATE_THIS_ID)${NC}\n"

run_test "Trigger auto-generation to create a movement from template"
api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements/generate" \
  -b $COOKIES_FILE > /dev/null
echo -e "${GREEN}✓ Generator triggered${NC}\n"

run_test "Verify auto-generated movement exists"
MOVEMENTS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=SPLIT&month=$REAL_CURRENT_MONTH" \
  -b $COOKIES_FILE)
GENERATED_COUNT=$(echo "$MOVEMENTS" | jq "[.movements[] | select(.generated_from_template_id == \"$TEMPLATE_THIS_ID\")] | length")
if [ "$GENERATED_COUNT" -ge "1" ]; then
  GENERATED_MOVEMENT_ID=$(echo "$MOVEMENTS" | jq -r "[.movements[] | select(.generated_from_template_id == \"$TEMPLATE_THIS_ID\")][0].id")
  echo -e "${GREEN}✓ Found $GENERATED_COUNT auto-generated movement(s) (ID: $GENERATED_MOVEMENT_ID)${NC}\n"
else
  echo -e "${RED}✗ Expected at least 1 auto-generated movement${NC}"
  exit 1
fi

run_test "Delete template with scope=THIS (hard delete)"
DELETE_THIS_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X DELETE \
  "$BASE_URL/api/recurring-movements/$TEMPLATE_THIS_ID?scope=THIS" \
  -b $COOKIES_FILE)
HTTP_CODE=$(echo "$DELETE_THIS_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✓ Template deleted (204)${NC}\n"
else
  echo -e "${RED}✗ Expected 204 but got $HTTP_CODE${NC}"
  exit 1
fi

run_test "Verify template is hard-deleted (GET returns 404)"
TEMPLATE_CHECK_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X GET \
  "$BASE_URL/api/recurring-movements/$TEMPLATE_THIS_ID" \
  -b $COOKIES_FILE)
HTTP_CODE=$(echo "$TEMPLATE_CHECK_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "404" ]; then
  echo -e "${GREEN}✓ Template is hard-deleted (404 returned)${NC}\n"
else
  echo -e "${RED}✗ Expected 404 but got $HTTP_CODE${NC}"
  exit 1
fi

run_test "Verify auto-generated movement still exists (scope=THIS keeps movements)"
MOVEMENTS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=SPLIT&month=$REAL_CURRENT_MONTH" \
  -b $COOKIES_FILE)
STILL_EXISTS=$(echo "$MOVEMENTS" | jq "[.movements[] | select(.id == \"$GENERATED_MOVEMENT_ID\")] | length")
if [ "$STILL_EXISTS" -ge "1" ]; then
  echo -e "${GREEN}✓ Auto-generated movement still exists after scope=THIS delete${NC}\n"
else
  echo -e "${RED}✗ Movement was deleted — scope=THIS should keep movements${NC}"
  exit 1
fi

# --- Test scope=ALL (delete template + movements) ---
run_test "Create template for scope=ALL delete test"
TEMPLATE_ALL=$(api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Scope ALL Template\",
    \"movement_type\": \"SPLIT\",
    \"category_id\": \"$CAT_A_ID\",
    \"amount\": 200000,
    \"auto_generate\": true,
    \"recurrence_pattern\": \"MONTHLY\",
    \"day_of_month\": 20,
    \"start_date\": \"2025-01-01\",
    \"payer_contact_id\": \"$CONTACT_ID\",
    \"participants\": [{\"participant_user_id\": \"$USER_ID\", \"percentage\": 1.0}]
  }")
TEMPLATE_ALL_ID=$(echo "$TEMPLATE_ALL" | jq -r '.id')
echo -e "${GREEN}✓ Template created (ID: $TEMPLATE_ALL_ID)${NC}\n"

run_test "Trigger auto-generation for second template"
api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements/generate" \
  -b $COOKIES_FILE > /dev/null
echo -e "${GREEN}✓ Generator triggered${NC}\n"

run_test "Verify auto-generated movement exists for ALL template"
MOVEMENTS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=SPLIT&month=$REAL_CURRENT_MONTH" \
  -b $COOKIES_FILE)
GENERATED_ALL_COUNT=$(echo "$MOVEMENTS" | jq "[.movements[] | select(.generated_from_template_id == \"$TEMPLATE_ALL_ID\")] | length")
if [ "$GENERATED_ALL_COUNT" -ge "1" ]; then
  echo -e "${GREEN}✓ Found $GENERATED_ALL_COUNT auto-generated movement(s)${NC}\n"
else
  echo -e "${RED}✗ Expected at least 1 auto-generated movement${NC}"
  exit 1
fi

run_test "Delete template with scope=ALL (delete template + movements)"
DELETE_ALL_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X DELETE \
  "$BASE_URL/api/recurring-movements/$TEMPLATE_ALL_ID?scope=ALL" \
  -b $COOKIES_FILE)
HTTP_CODE=$(echo "$DELETE_ALL_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✓ Template deleted with scope=ALL (204)${NC}\n"
else
  echo -e "${RED}✗ Expected 204 but got $HTTP_CODE${NC}"
  exit 1
fi

run_test "Verify template is completely deleted (404)"
TEMPLATE_CHECK_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X GET \
  "$BASE_URL/api/recurring-movements/$TEMPLATE_ALL_ID" \
  -b $COOKIES_FILE)
HTTP_CODE=$(echo "$TEMPLATE_CHECK_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "404" ]; then
  echo -e "${GREEN}✓ Template is gone (404)${NC}\n"
else
  echo -e "${RED}✗ Expected 404 but got $HTTP_CODE${NC}"
  exit 1
fi

run_test "Verify auto-generated movements were deleted (scope=ALL)"
MOVEMENTS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=SPLIT&month=$REAL_CURRENT_MONTH" \
  -b $COOKIES_FILE)
REMAINING=$(echo "$MOVEMENTS" | jq "[.movements[] | select(.generated_from_template_id == \"$TEMPLATE_ALL_ID\")] | length")
if [ "$REMAINING" = "0" ]; then
  echo -e "${GREEN}✓ All auto-generated movements deleted${NC}\n"
else
  echo -e "${RED}✗ Expected 0 movements but found $REMAINING${NC}"
  exit 1
fi

# --- Test default scope (should be THIS) ---
run_test "Create template for default scope test"
TEMPLATE_DEFAULT=$(api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Default Scope Template\",
    \"movement_type\": \"SPLIT\",
    \"category_id\": \"$CAT_B_ID\",
    \"amount\": 50000,
    \"auto_generate\": false,
    \"payer_contact_id\": \"$CONTACT_ID\",
    \"participants\": [{\"participant_user_id\": \"$USER_ID\", \"percentage\": 1.0}]
  }")
TEMPLATE_DEFAULT_ID=$(echo "$TEMPLATE_DEFAULT" | jq -r '.id')
echo -e "${GREEN}✓ Template created (ID: $TEMPLATE_DEFAULT_ID)${NC}\n"

run_test "Delete template without scope parameter (default=THIS)"
DELETE_DEFAULT_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X DELETE \
  "$BASE_URL/api/recurring-movements/$TEMPLATE_DEFAULT_ID" \
  -b $COOKIES_FILE)
HTTP_CODE=$(echo "$DELETE_DEFAULT_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✓ Template deleted with default scope (204)${NC}\n"
else
  echo -e "${RED}✗ Expected 204 but got $HTTP_CODE${NC}"
  exit 1
fi

run_test "Verify default scope hard-deleted template"
TEMPLATE_DEFAULT_CHECK_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X GET \
  "$BASE_URL/api/recurring-movements/$TEMPLATE_DEFAULT_ID" \
  -b $COOKIES_FILE)
HTTP_CODE=$(echo "$TEMPLATE_DEFAULT_CHECK_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "404" ]; then
  echo -e "${GREEN}✓ Default scope correctly hard-deleted template${NC}\n"
else
  echo -e "${RED}✗ Expected 404 but got $HTTP_CODE${NC}"
  exit 1
fi

# --- Test invalid scope ---
run_test "Reject invalid template delete scope"
# Create another template to test with
TEMPLATE_INVALID=$(api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Invalid Scope Template\",
    \"movement_type\": \"SPLIT\",
    \"category_id\": \"$CAT_B_ID\",
    \"amount\": 10000,
    \"auto_generate\": false,
    \"payer_contact_id\": \"$CONTACT_ID\",
    \"participants\": [{\"participant_user_id\": \"$USER_ID\", \"percentage\": 1.0}]
  }")
TEMPLATE_INVALID_ID=$(echo "$TEMPLATE_INVALID" | jq -r '.id')

INVALID_DELETE_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X DELETE \
  "$BASE_URL/api/recurring-movements/$TEMPLATE_INVALID_ID?scope=INVALID" \
  -b $COOKIES_FILE)
HTTP_CODE=$(echo "$INVALID_DELETE_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✓ Invalid scope correctly rejected (400)${NC}\n"
else
  echo -e "${RED}✗ Expected 400 but got $HTTP_CODE${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════
# TEMPLATE EDIT SCOPE TESTS
# ═══════════════════════════════════════════════════════════
echo -e "\n${YELLOW}=== Template Edit Scope Tests ===${NC}\n"

# --- Test scope=THIS (update template only, movements untouched) ---
run_test "Create template for scope=THIS edit test"
EDIT_THIS_TEMPLATE=$(api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Edit This Template\",
    \"movement_type\": \"SPLIT\",
    \"category_id\": \"$CAT_A_ID\",
    \"amount\": 100000,
    \"auto_generate\": true,
    \"recurrence_pattern\": \"MONTHLY\",
    \"day_of_month\": 15,
    \"start_date\": \"2025-01-01\",
    \"payer_contact_id\": \"$CONTACT_ID\",
    \"participants\": [{\"participant_user_id\": \"$USER_ID\", \"percentage\": 1.0}]
  }")
EDIT_THIS_ID=$(echo "$EDIT_THIS_TEMPLATE" | jq -r '.id')
echo -e "${GREEN}✓ Template created (ID: $EDIT_THIS_ID)${NC}\n"

run_test "Trigger auto-generation for edit-this template"
api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements/generate" -b $COOKIES_FILE > /dev/null
echo -e "${GREEN}✓ Auto-generation triggered${NC}\n"

run_test "Verify movement exists before edit"
MOVEMENTS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?type=SPLIT&month=$REAL_CURRENT_MONTH" -b $COOKIES_FILE)
EDIT_THIS_MOVEMENT_ID=$(echo "$MOVEMENTS" | jq -r "[.movements[] | select(.generated_from_template_id == \"$EDIT_THIS_ID\")][0].id")
EDIT_THIS_MOVEMENT_AMOUNT=$(echo "$MOVEMENTS" | jq -r "[.movements[] | select(.generated_from_template_id == \"$EDIT_THIS_ID\")][0].amount")
if [ "$EDIT_THIS_MOVEMENT_ID" != "null" ] && [ -n "$EDIT_THIS_MOVEMENT_ID" ]; then
  echo -e "${GREEN}✓ Movement exists (ID: $EDIT_THIS_MOVEMENT_ID, amount: $EDIT_THIS_MOVEMENT_AMOUNT)${NC}\n"
else
  echo -e "${RED}✗ No movement found for template${NC}"
  exit 1
fi

run_test "Update template with scope=THIS (template only)"
UPDATED=$(api_call $CURL_FLAGS -X PUT "$BASE_URL/api/recurring-movements/$EDIT_THIS_ID?scope=THIS" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\": \"Edit This Updated\", \"amount\": 200000}")
UPDATED_NAME=$(echo "$UPDATED" | jq -r '.name')
UPDATED_AMOUNT=$(echo "$UPDATED" | jq -r '.amount')
if [ "$UPDATED_NAME" = "Edit This Updated" ] && [ "$UPDATED_AMOUNT" = "200000" ]; then
  echo -e "${GREEN}✓ Template updated (name: $UPDATED_NAME, amount: $UPDATED_AMOUNT)${NC}\n"
else
  echo -e "${RED}✗ Template not updated correctly (name: $UPDATED_NAME, amount: $UPDATED_AMOUNT)${NC}"
  exit 1
fi

run_test "Verify movement NOT updated with scope=THIS"
MOVEMENT_CHECK=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements/$EDIT_THIS_MOVEMENT_ID" -b $COOKIES_FILE)
MOVEMENT_AMOUNT=$(echo "$MOVEMENT_CHECK" | jq -r '.amount')
if [ "$MOVEMENT_AMOUNT" = "100000" ]; then
  echo -e "${GREEN}✓ Movement still has original amount ($MOVEMENT_AMOUNT) — scope=THIS correct${NC}\n"
else
  echo -e "${RED}✗ Expected movement amount 100000 but got $MOVEMENT_AMOUNT${NC}"
  exit 1
fi

# --- Test scope=ALL (update template + all movements) ---
run_test "Update template with scope=ALL (template + movements)"
UPDATED_ALL=$(api_call $CURL_FLAGS -X PUT "$BASE_URL/api/recurring-movements/$EDIT_THIS_ID?scope=ALL" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\": \"Edit All Updated\", \"amount\": 300000}")
UPDATED_ALL_NAME=$(echo "$UPDATED_ALL" | jq -r '.name')
UPDATED_ALL_AMOUNT=$(echo "$UPDATED_ALL" | jq -r '.amount')
if [ "$UPDATED_ALL_NAME" = "Edit All Updated" ] && [ "$UPDATED_ALL_AMOUNT" = "300000" ]; then
  echo -e "${GREEN}✓ Template updated (name: $UPDATED_ALL_NAME, amount: $UPDATED_ALL_AMOUNT)${NC}\n"
else
  echo -e "${RED}✗ Template not updated correctly (name: $UPDATED_ALL_NAME, amount: $UPDATED_ALL_AMOUNT)${NC}"
  exit 1
fi

run_test "Verify movement WAS updated with scope=ALL"
MOVEMENT_CHECK_ALL=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements/$EDIT_THIS_MOVEMENT_ID" -b $COOKIES_FILE)
MOVEMENT_AMOUNT_ALL=$(echo "$MOVEMENT_CHECK_ALL" | jq -r '.amount')
MOVEMENT_DESC_ALL=$(echo "$MOVEMENT_CHECK_ALL" | jq -r '.description')
if [ "$MOVEMENT_AMOUNT_ALL" = "300000" ]; then
  echo -e "${GREEN}✓ Movement amount updated to $MOVEMENT_AMOUNT_ALL — scope=ALL correct${NC}\n"
else
  echo -e "${RED}✗ Expected movement amount 300000 but got $MOVEMENT_AMOUNT_ALL${NC}"
  exit 1
fi

run_test "Verify movement description updated with scope=ALL"
if [ "$MOVEMENT_DESC_ALL" = "Edit All Updated" ]; then
  echo -e "${GREEN}✓ Movement description updated to '$MOVEMENT_DESC_ALL'${NC}\n"
else
  echo -e "${RED}✗ Expected description 'Edit All Updated' but got '$MOVEMENT_DESC_ALL'${NC}"
  exit 1
fi

# --- Test default scope for edit (should be THIS) ---
run_test "Update template without scope param (default=THIS)"
UPDATED_DEFAULT=$(api_call $CURL_FLAGS -X PUT "$BASE_URL/api/recurring-movements/$EDIT_THIS_ID" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\": 400000}")
if [ "$(echo "$UPDATED_DEFAULT" | jq -r '.amount')" = "400000" ]; then
  echo -e "${GREEN}✓ Template updated to 400000 with default scope${NC}\n"
else
  echo -e "${RED}✗ Template update failed${NC}"
  exit 1
fi

run_test "Verify movement NOT updated with default scope"
MOVEMENT_CHECK_DEFAULT=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements/$EDIT_THIS_MOVEMENT_ID" -b $COOKIES_FILE)
MOVEMENT_AMOUNT_DEFAULT=$(echo "$MOVEMENT_CHECK_DEFAULT" | jq -r '.amount')
if [ "$MOVEMENT_AMOUNT_DEFAULT" = "300000" ]; then
  echo -e "${GREEN}✓ Movement still has 300000 (from previous ALL update) — default=THIS correct${NC}\n"
else
  echo -e "${RED}✗ Expected 300000 but got $MOVEMENT_AMOUNT_DEFAULT${NC}"
  exit 1
fi

# --- Test invalid scope for edit ---
run_test "Reject invalid template edit scope"
INVALID_EDIT_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X PUT \
  "$BASE_URL/api/recurring-movements/$EDIT_THIS_ID?scope=INVALID" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\": 500000}")
HTTP_CODE=$(echo "$INVALID_EDIT_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✓ Invalid edit scope correctly rejected (400)${NC}\n"
else
  echo -e "${RED}✗ Expected 400 but got $HTTP_CODE${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════

echo -e "${YELLOW}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ ALL TESTS PASSED                                      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}Budget Inheritance:${NC}"
echo "  ✓ Budget from current month inherits to future months"
echo "  ✓ No backward inheritance (previous months unaffected)"
echo "  ✓ Explicit override takes precedence"
echo "  ✓ Inheritance picks most recent budget <= requested month"
echo ""
echo -e "${GREEN}Budget Scope:${NC}"
echo "  ✓ scope=THIS updates only the specified month"
echo "  ✓ scope=FUTURE updates this month + deletes future overrides"
echo "  ✓ scope=ALL updates all existing budget records"
echo "  ✓ Default scope is FUTURE when not specified"
echo "  ✓ Invalid scope rejected with 400"
echo ""
echo -e "${GREEN}Template Delete Scope:${NC}"
echo "  ✓ scope=THIS hard-deletes template, keeps movements"
echo "  ✓ scope=ALL hard-deletes template + all auto-generated movements"
echo "  ✓ Default scope=THIS hard-deletes"
echo "  ✓ Invalid scope rejected with 400"
echo ""
echo -e "${GREEN}Template Edit Scope:${NC}"
echo "  ✓ scope=THIS updates template only, movements untouched"
echo "  ✓ scope=ALL updates template + all auto-generated movements (amount + description)"
echo "  ✓ Default scope=THIS when no scope param"
echo "  ✓ Invalid scope rejected with 400"

# Clean up
rm -f $COOKIES_FILE
