#!/bin/bash
# Pockets Extended API Integration Test Suite
# Tests edge cases, bugs, and scenarios not covered by test-pockets.sh

set -e
set -o pipefail

BASE_URL="${API_BASE_URL:-http://localhost:8080}"
COOKIES_FILE="/tmp/pockets-ext-test-cookies.txt"
COOKIES_FILE_2="/tmp/pockets-ext-test-cookies2.txt"
TIMESTAMP=$(date +%s%N)
EMAIL="pockets-ext-test+${TIMESTAMP}@test.com"
EMAIL_2="pockets-ext-test2+${TIMESTAMP}@test.com"
PASSWORD="Test1234!"
DEBUG="${DEBUG:-false}"

CURL_FLAGS="-s"
if [ "$DEBUG" = "true" ]; then
  CURL_FLAGS="-v"
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${YELLOW}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║  🐷 Pockets EXTENDED API Integration Tests             ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Clean up
rm -f $COOKIES_FILE
rm -f $COOKIES_FILE_2

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
# SETUP: Register user, create household, account
# ═══════════════════════════════════════════════════════════

echo -e "${BLUE}═══ SETUP ═══${NC}\n"

run_test "Register User 1 (Owner)"
REGISTER_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"name\":\"Pocket Ext Tester\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE)
echo "$REGISTER_RESPONSE" | jq -e '.message' > /dev/null
echo -e "${GREEN}✓ User 1 registered${NC}\n"

run_test "Get Current User"
ME_RESPONSE=$(api_call $CURL_FLAGS $BASE_URL/me -b $COOKIES_FILE)
USER_ID=$(echo "$ME_RESPONSE" | jq -r '.id')
[ "$USER_ID" != "null" ] && [ -n "$USER_ID" ]
echo -e "${GREEN}✓ User ID: $USER_ID${NC}\n"

run_test "Create Household"
HOUSEHOLD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Test Household Pockets Ext"}')
HOUSEHOLD_ID=$(echo "$HOUSEHOLD_RESPONSE" | jq -r '.id')
[ "$HOUSEHOLD_ID" != "null" ] && [ -n "$HOUSEHOLD_ID" ]
echo -e "${GREEN}✓ Household created: $HOUSEHOLD_ID${NC}\n"

run_test "Create Savings Account"
ACCOUNT_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/accounts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Savings Ext\",\"type\":\"savings\",\"initial_balance\":1000000}")
ACCOUNT_ID=$(echo "$ACCOUNT_RESPONSE" | jq -r '.id')
[ "$ACCOUNT_ID" != "null" ] && [ -n "$ACCOUNT_ID" ]
echo -e "${GREEN}✓ Savings account created: $ACCOUNT_ID${NC}\n"

run_test "Create Payment Method (Debit)"
PM_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/payment-methods \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Debit Ext\",\"type\":\"debit_card\",\"account_id\":\"$ACCOUNT_ID\"}")
PM_ID=$(echo "$PM_RESPONSE" | jq -r '.id')
[ "$PM_ID" != "null" ] && [ -n "$PM_ID" ]
echo -e "${GREEN}✓ Payment method created: $PM_ID${NC}\n"

TODAY=$(date +%Y-%m-%d)

# ═══════════════════════════════════════════════════════════
# 2. LINKED MOVEMENT PROPERTIES
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ LINKED MOVEMENT PROPERTIES ═══${NC}\n"

run_test "Create Pocket for Linked Movement Tests"
POCKET_LM_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Linked Mov Test\",\"icon\":\"🔗\"}")
POCKET_LM_ID=$(echo "$POCKET_LM_RESPONSE" | jq -r '.id')
[ "$POCKET_LM_ID" != "null" ] && [ -n "$POCKET_LM_ID" ]
echo -e "${GREEN}✓ Pocket created: $POCKET_LM_ID${NC}\n"

run_test "Deposit to Get Linked Movement"
DEPOSIT_LM_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_LM_ID/deposit \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":50000,\"description\":\"Test linked props\",\"transaction_date\":\"$TODAY\",\"source_account_id\":\"$ACCOUNT_ID\"}")
DEPOSIT_LM_ID=$(echo "$DEPOSIT_LM_RESPONSE" | jq -r '.id')
LINKED_MOV_ID=$(echo "$DEPOSIT_LM_RESPONSE" | jq -r '.linked_movement_id')
[ "$DEPOSIT_LM_ID" != "null" ] && [ -n "$DEPOSIT_LM_ID" ]
[ "$LINKED_MOV_ID" != "null" ] && [ -n "$LINKED_MOV_ID" ]
echo -e "${GREEN}✓ Deposit created: $DEPOSIT_LM_ID, linked_movement_id=$LINKED_MOV_ID${NC}\n"

run_test "GET Linked Movement by ID and Verify Properties"
MOV_RESPONSE=$(api_call $CURL_FLAGS "$BASE_URL/movements/$LINKED_MOV_ID" -b $COOKIES_FILE)

# Verify source_pocket_id matches pocket ID
MOV_SOURCE_POCKET=$(echo "$MOV_RESPONSE" | jq -r '.source_pocket_id')
[ "$MOV_SOURCE_POCKET" = "$POCKET_LM_ID" ]
echo -e "${GREEN}  ✓ source_pocket_id = $MOV_SOURCE_POCKET (matches pocket)${NC}"

# Verify payment_method_id is null (pocket deposits don't use payment methods)
MOV_PM_ID=$(echo "$MOV_RESPONSE" | jq -r '.payment_method_id')
[ "$MOV_PM_ID" = "null" ]
echo -e "${GREEN}  ✓ payment_method_id = null (correct for pocket deposits)${NC}"

# Verify type is HOUSEHOLD
MOV_TYPE=$(echo "$MOV_RESPONSE" | jq -r '.type')
[ "$MOV_TYPE" = "HOUSEHOLD" ]
echo -e "${GREEN}  ✓ type = HOUSEHOLD${NC}"

# Verify description starts with "Depósito a {pocket_name}:"
MOV_DESC=$(echo "$MOV_RESPONSE" | jq -r '.description')
EXPECTED_PREFIX="Depósito a Linked Mov Test:"
echo "$MOV_DESC" | grep -q "^${EXPECTED_PREFIX}" || { echo "Expected description to start with '$EXPECTED_PREFIX', got '$MOV_DESC'"; false; }
echo -e "${GREEN}  ✓ description = '$MOV_DESC' (starts with expected prefix)${NC}"

# Verify payer_user_id matches logged-in user
MOV_PAYER=$(echo "$MOV_RESPONSE" | jq -r '.payer_user_id')
[ "$MOV_PAYER" = "$USER_ID" ]
echo -e "${GREEN}  ✓ payer_user_id = $MOV_PAYER (matches current user)${NC}"

# Verify category_id is auto-resolved (not null)
MOV_CAT_ID=$(echo "$MOV_RESPONSE" | jq -r '.category_id')
[ "$MOV_CAT_ID" != "null" ] && [ -n "$MOV_CAT_ID" ]
echo -e "${GREEN}  ✓ category_id = $MOV_CAT_ID (auto-resolved)${NC}"

echo -e "${GREEN}✓ All linked movement properties verified${NC}\n"

# ═══════════════════════════════════════════════════════════
# 4. WITHDRAWAL HAS NO LINKED MOVEMENT
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ WITHDRAWAL HAS NO LINKED MOVEMENT ═══${NC}\n"

# Count movements before withdrawal
MOVEMENTS_BEFORE_WD=$(api_call $CURL_FLAGS "$BASE_URL/movements" -b $COOKIES_FILE)
MOV_COUNT_BEFORE_WD=$(echo "$MOVEMENTS_BEFORE_WD" | jq '.movements | length')

run_test "Create Withdrawal"
WD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_LM_ID/withdraw \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":10000,\"description\":\"Test no linked mov\",\"transaction_date\":\"$TODAY\",\"destination_account_id\":\"$ACCOUNT_ID\"}")
WD_ID=$(echo "$WD_RESPONSE" | jq -r '.id')
WD_LINKED_MOV=$(echo "$WD_RESPONSE" | jq -r '.linked_movement_id')
[ "$WD_ID" != "null" ] && [ -n "$WD_ID" ]
# Withdrawal should have no linked movement
[ "$WD_LINKED_MOV" = "null" ]
echo -e "${GREEN}✓ Withdrawal created: $WD_ID, linked_movement_id=null${NC}\n"

run_test "Verify No New Movement Was Created for Withdrawal"
MOVEMENTS_AFTER_WD=$(api_call $CURL_FLAGS "$BASE_URL/movements" -b $COOKIES_FILE)
MOV_COUNT_AFTER_WD=$(echo "$MOVEMENTS_AFTER_WD" | jq '.movements | length')
[ "$MOV_COUNT_AFTER_WD" -eq "$MOV_COUNT_BEFORE_WD" ]
echo -e "${GREEN}✓ Movement count unchanged: $MOV_COUNT_BEFORE_WD → $MOV_COUNT_AFTER_WD (no linked movement for withdrawal)${NC}\n"

# Clean up withdrawal for next tests
DELETE_WD_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/api/pocket-transactions/$WD_ID \
  -b $COOKIES_FILE)
[ "$DELETE_WD_CODE" = "204" ]

# ═══════════════════════════════════════════════════════════
# 5. EDIT DEPOSIT DESCRIPTION → VERIFY LINKED MOVEMENT DESCRIPTION
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ EDIT DEPOSIT DESCRIPTION → LINKED MOVEMENT DESCRIPTION ═══${NC}\n"

run_test "Edit Deposit Description to 'Updated desc'"
EDIT_DESC_RESPONSE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/api/pocket-transactions/$DEPOSIT_LM_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"description":"Updated desc"}')
EDITED_DESC=$(echo "$EDIT_DESC_RESPONSE" | jq -r '.description')
[ "$EDITED_DESC" = "Updated desc" ]
echo -e "${GREEN}✓ Pocket transaction description updated to: '$EDITED_DESC'${NC}\n"

run_test "Verify Linked Movement Description Updated"
MOV_AFTER_EDIT=$(api_call $CURL_FLAGS "$BASE_URL/movements/$LINKED_MOV_ID" -b $COOKIES_FILE)
MOV_DESC_AFTER_EDIT=$(echo "$MOV_AFTER_EDIT" | jq -r '.description')
EXPECTED_LINKED_DESC="Depósito a Linked Mov Test: Updated desc"
[ "$MOV_DESC_AFTER_EDIT" = "$EXPECTED_LINKED_DESC" ]
echo -e "${GREEN}✓ Linked movement description = '$MOV_DESC_AFTER_EDIT'${NC}\n"

# ═══════════════════════════════════════════════════════════
# 7. CASCADE DELETE FROM GASTOS SIDE
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ CASCADE DELETE FROM GASTOS SIDE ═══${NC}\n"

run_test "Create Pocket for Cascade Delete Test"
POCKET_CD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Cascade Delete\",\"icon\":\"🗑️\"}")
POCKET_CD_ID=$(echo "$POCKET_CD_RESPONSE" | jq -r '.id')
[ "$POCKET_CD_ID" != "null" ] && [ -n "$POCKET_CD_ID" ]
echo -e "${GREEN}✓ Pocket created: $POCKET_CD_ID${NC}\n"

run_test "Deposit 80000 (get linked_movement_id)"
DEP_CD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_CD_ID/deposit \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":80000,\"description\":\"Cascade test deposit\",\"transaction_date\":\"$TODAY\",\"source_account_id\":\"$ACCOUNT_ID\"}")
DEP_CD_ID=$(echo "$DEP_CD_RESPONSE" | jq -r '.id')
DEP_CD_LINKED_MOV=$(echo "$DEP_CD_RESPONSE" | jq -r '.linked_movement_id')
[ "$DEP_CD_ID" != "null" ] && [ -n "$DEP_CD_ID" ]
[ "$DEP_CD_LINKED_MOV" != "null" ] && [ -n "$DEP_CD_LINKED_MOV" ]
echo -e "${GREEN}✓ Deposit created: $DEP_CD_ID, linked_movement=$DEP_CD_LINKED_MOV${NC}\n"

run_test "Delete Linked Movement from Gastos Side (DELETE /movements/{id})"
DELETE_MOV_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/movements/$DEP_CD_LINKED_MOV" \
  -b $COOKIES_FILE)
[ "$DELETE_MOV_CODE" = "204" ]
echo -e "${GREEN}✓ Linked movement deleted from Gastos side (HTTP 204)${NC}\n"

run_test "Verify Pocket Transaction Was Also Deleted (cascade)"
TXN_CD_LIST=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_CD_ID/transactions -b $COOKIES_FILE)
TXN_CD_COUNT=$(echo "$TXN_CD_LIST" | jq 'length')
[ "$TXN_CD_COUNT" -eq "0" ]
echo -e "${GREEN}✓ Pocket transactions are empty after cascade delete (count=$TXN_CD_COUNT)${NC}\n"

run_test "Verify Pocket Balance is 0 After Cascade Delete"
POCKET_CD_AFTER=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_CD_ID -b $COOKIES_FILE)
CD_BALANCE=$(echo "$POCKET_CD_AFTER" | jq -r '.balance')
[ "$CD_BALANCE" = "0" ]
echo -e "${GREEN}✓ Pocket balance = $CD_BALANCE (expected 0)${NC}\n"

# ═══════════════════════════════════════════════════════════
# 9. NON-OWNER CANNOT DEPOSIT/WITHDRAW/UPDATE/DELETE
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ HOUSEHOLD MEMBER AUTHORIZATION ═══${NC}\n"

run_test "Register User 2 (Member)"
REGISTER2_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_2\",\"name\":\"Pocket Member\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE_2)
echo "$REGISTER2_RESPONSE" | jq -e '.message' > /dev/null
echo -e "${GREEN}✓ User 2 registered${NC}\n"

run_test "Get User 2 ID"
ME2_RESPONSE=$(api_call $CURL_FLAGS $BASE_URL/me -b $COOKIES_FILE_2)
USER2_ID=$(echo "$ME2_RESPONSE" | jq -r '.id')
[ "$USER2_ID" != "null" ] && [ -n "$USER2_ID" ]
echo -e "${GREEN}✓ User 2 ID: $USER2_ID${NC}\n"

run_test "Add User 2 to Household as Member"
ADD_MEMBER=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD_ID/members \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_2\"}")
echo "$ADD_MEMBER" | jq -e '.id' > /dev/null
echo -e "${GREEN}✓ User 2 added to household as member${NC}\n"

# Create a pocket owned by User 1 for member access tests
run_test "Create Pocket Owned by User 1 for Auth Tests"
POCKET_AUTH_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Auth Test Pocket\",\"icon\":\"🔒\",\"goal_amount\":200000}")
POCKET_AUTH_ID=$(echo "$POCKET_AUTH_RESPONSE" | jq -r '.id')
[ "$POCKET_AUTH_ID" != "null" ] && [ -n "$POCKET_AUTH_ID" ]
echo -e "${GREEN}✓ Pocket created by User 1: $POCKET_AUTH_ID${NC}\n"

# User 2 needs an account in the household
run_test "Create Account for User 2"
ACCOUNT2_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/accounts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE_2 \
  -d "{\"owner_id\":\"$USER2_ID\",\"name\":\"Savings User2\",\"type\":\"savings\",\"initial_balance\":500000}")
ACCOUNT2_ID=$(echo "$ACCOUNT2_RESPONSE" | jq -r '.id')
[ "$ACCOUNT2_ID" != "null" ] && [ -n "$ACCOUNT2_ID" ]
echo -e "${GREEN}✓ Account for User 2: $ACCOUNT2_ID${NC}\n"

run_test "User 2: Deposit to User 1's Pocket → 200 (household member allowed)"
AUTH_DEP_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/pockets/$POCKET_AUTH_ID/deposit \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE_2 \
  -d "{\"amount\":10000,\"description\":\"Member deposit\",\"transaction_date\":\"$TODAY\",\"source_account_id\":\"$ACCOUNT2_ID\"}")
[ "$AUTH_DEP_CODE" = "201" ]
echo -e "${GREEN}✓ User 2 deposit allowed (HTTP $AUTH_DEP_CODE)${NC}\n"

run_test "User 2: Withdraw from User 1's Pocket → 200 (household member allowed)"
AUTH_WD_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/pockets/$POCKET_AUTH_ID/withdraw \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE_2 \
  -d "{\"amount\":5000,\"description\":\"Member withdrawal\",\"transaction_date\":\"$TODAY\",\"destination_account_id\":\"$ACCOUNT2_ID\"}")
[ "$AUTH_WD_CODE" = "201" ]
echo -e "${GREEN}✓ User 2 withdrawal allowed (HTTP $AUTH_WD_CODE)${NC}\n"

run_test "User 2: Update User 1's Pocket → 200 (household member allowed)"
AUTH_UPD_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X PATCH $BASE_URL/api/pockets/$POCKET_AUTH_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE_2 \
  -d '{"name":"Renamed By Member"}')
[ "$AUTH_UPD_CODE" = "200" ]
echo -e "${GREEN}✓ User 2 update allowed (HTTP $AUTH_UPD_CODE)${NC}\n"

run_test "User 2: Delete User 1's Pocket → 204 (household member allowed)"
AUTH_DEL_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/api/pockets/$POCKET_AUTH_ID?force=true" \
  -b $COOKIES_FILE_2)
[ "$AUTH_DEL_CODE" = "204" ]
echo -e "${GREEN}✓ User 2 delete allowed (HTTP $AUTH_DEL_CODE)${NC}\n"

# ═══════════════════════════════════════════════════════════
# 10. DEPOSIT TO INACTIVE POCKET → 422
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ DEPOSIT TO INACTIVE POCKET ═══${NC}\n"

run_test "Create Pocket to Deactivate"
POCKET_INACT_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Deactivate Me\",\"icon\":\"❌\"}")
POCKET_INACT_ID=$(echo "$POCKET_INACT_RESPONSE" | jq -r '.id')
[ "$POCKET_INACT_ID" != "null" ] && [ -n "$POCKET_INACT_ID" ]
echo -e "${GREEN}✓ Pocket created: $POCKET_INACT_ID${NC}\n"

run_test "Deactivate Pocket (DELETE with no balance, no force needed)"
DEACT_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/api/pockets/$POCKET_INACT_ID \
  -b $COOKIES_FILE)
[ "$DEACT_CODE" = "204" ]
echo -e "${GREEN}✓ Pocket deactivated (HTTP 204)${NC}\n"

run_test "Deposit to Inactive Pocket → 422"
INACT_DEP_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/pockets/$POCKET_INACT_ID/deposit \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":10000,\"description\":\"To inactive pocket\",\"transaction_date\":\"$TODAY\",\"source_account_id\":\"$ACCOUNT_ID\"}")
[ "$INACT_DEP_CODE" = "422" ]
echo -e "${GREEN}✓ Deposit to inactive pocket correctly rejected (HTTP $INACT_DEP_CODE)${NC}\n"

run_test "Withdraw from Inactive Pocket → 422"
INACT_WD_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/pockets/$POCKET_INACT_ID/withdraw \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":10000,\"description\":\"From inactive pocket\",\"transaction_date\":\"$TODAY\",\"destination_account_id\":\"$ACCOUNT_ID\"}")
[ "$INACT_WD_CODE" = "422" ]
echo -e "${GREEN}✓ Withdrawal from inactive pocket correctly rejected (HTTP $INACT_WD_CODE)${NC}\n"

# ═══════════════════════════════════════════════════════════
# 12. MAX 20 POCKETS
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ MAX 20 POCKETS LIMIT ═══${NC}\n"

# Count current active pockets to know how many more to create
# CountByHousehold only counts active pockets (is_active = TRUE)
CURRENT_LIST=$(api_call $CURL_FLAGS $BASE_URL/api/pockets -b $COOKIES_FILE)
CURRENT_COUNT=$(echo "$CURRENT_LIST" | jq 'length')
echo -e "${CYAN}  Current active pocket count: $CURRENT_COUNT${NC}"

NEEDED=$((20 - CURRENT_COUNT))

run_test "Create pockets to reach limit of 20"
CREATED=0
for i in $(seq 1 $NEEDED); do
  CREATE_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/pockets \
    -H "Content-Type: application/json" \
    -b $COOKIES_FILE \
    -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Limit Test $TIMESTAMP $i\",\"icon\":\"📦\"}")
  if [ "$CREATE_CODE" = "201" ]; then
    CREATED=$((CREATED + 1))
  elif [ "$CREATE_CODE" = "422" ]; then
    echo -e "${YELLOW}  Reached limit at pocket $i (HTTP 422) — total created this round: $CREATED${NC}"
    break
  else
    echo -e "${RED}  Unexpected HTTP $CREATE_CODE at pocket $i${NC}"
    false
  fi
done
echo -e "${GREEN}✓ Created $CREATED additional pockets (total active: $((CURRENT_COUNT + CREATED)))${NC}\n"

run_test "Attempt to Create Pocket Beyond Limit → 422"
LIMIT_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Over Limit $TIMESTAMP\",\"icon\":\"🚫\"}")
[ "$LIMIT_CODE" = "422" ]
echo -e "${GREEN}✓ Pocket beyond limit correctly rejected (HTTP $LIMIT_CODE, max 20 reached)${NC}\n"

# ═══════════════════════════════════════════════════════════
# 6. EDIT DEPOSIT REDUCING AMOUNT — BALANCE CHECK
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ EDIT DEPOSIT → NEGATIVE BALANCE CHECK ═══${NC}\n"

run_test "Create Pocket for Negative Balance Test"
POCKET_NB_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Neg Balance Test\",\"icon\":\"⚠️\"}")
# This may fail with 422 if we already hit 20 pocket limit; deactivate one first
NB_CREATE_CODE=$(echo "$POCKET_NB_RESPONSE" | jq -r 'if .id then "ok" else "error" end')
if [ "$NB_CREATE_CODE" != "ok" ]; then
  # Deactivate one of the limit-test pockets to make room
  FIRST_LIMIT_POCKET=$(api_call $CURL_FLAGS $BASE_URL/api/pockets -b $COOKIES_FILE | jq -r '[.[] | select(.name | startswith("Limit Test"))][0].id')
  curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/api/pockets/$FIRST_LIMIT_POCKET" -b $COOKIES_FILE > /dev/null
  POCKET_NB_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
    -H "Content-Type: application/json" \
    -b $COOKIES_FILE \
    -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Neg Balance Test\",\"icon\":\"⚠️\"}")
fi
POCKET_NB_ID=$(echo "$POCKET_NB_RESPONSE" | jq -r '.id')
[ "$POCKET_NB_ID" != "null" ] && [ -n "$POCKET_NB_ID" ]
echo -e "${GREEN}✓ Pocket created: $POCKET_NB_ID${NC}\n"

run_test "Deposit 100000"
DEP_NB_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_NB_ID/deposit \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":100000,\"description\":\"Initial deposit\",\"transaction_date\":\"$TODAY\",\"source_account_id\":\"$ACCOUNT_ID\"}")
DEP_NB_ID=$(echo "$DEP_NB_RESPONSE" | jq -r '.id')
[ "$DEP_NB_ID" != "null" ] && [ -n "$DEP_NB_ID" ]
echo -e "${GREEN}✓ Deposit created: $DEP_NB_ID (100000)${NC}\n"

run_test "Withdraw 30000 (balance → 70000)"
WD_NB_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_NB_ID/withdraw \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":30000,\"description\":\"Partial wd\",\"transaction_date\":\"$TODAY\",\"destination_account_id\":\"$ACCOUNT_ID\"}")
WD_NB_ID=$(echo "$WD_NB_RESPONSE" | jq -r '.id')
[ "$WD_NB_ID" != "null" ] && [ -n "$WD_NB_ID" ]
echo -e "${GREEN}✓ Withdrawal created: $WD_NB_ID (30000, balance now 70000)${NC}\n"

run_test "Edit Deposit Amount to 20000 → SHOULD be 422 (balance would be -10000)"
# Reducing deposit from 100k to 20k while 30k withdrawal exists would
# make balance = 20k - 30k = -10k (negative). The service checks this.
EDIT_NB_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X PATCH $BASE_URL/api/pocket-transactions/$DEP_NB_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"amount":20000}')
[ "$EDIT_NB_CODE" = "422" ]
echo -e "${GREEN}✓ Edit correctly rejected with HTTP 422 (balance would go negative)${NC}\n"

# ═══════════════════════════════════════════════════════════
# 8. CASCADE DELETE FROM GASTOS BLOCKED IF WOULD CAUSE OVERDRAFT
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ CASCADE DELETE OVERDRAFT FROM GASTOS ═══${NC}\n"

run_test "Create Pocket for Overdraft Cascade Test"
POCKET_OD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Overdraft Cascade\",\"icon\":\"💣\"}")
# May need to make room again
OD_CREATE_CODE=$(echo "$POCKET_OD_RESPONSE" | jq -r 'if .id then "ok" else "error" end')
if [ "$OD_CREATE_CODE" != "ok" ]; then
  SECOND_LIMIT_POCKET=$(api_call $CURL_FLAGS $BASE_URL/api/pockets -b $COOKIES_FILE | jq -r '[.[] | select(.name | startswith("Limit Test"))][0].id')
  curl $CURL_FLAGS -o /dev/null -X DELETE "$BASE_URL/api/pockets/$SECOND_LIMIT_POCKET" -b $COOKIES_FILE > /dev/null
  POCKET_OD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
    -H "Content-Type: application/json" \
    -b $COOKIES_FILE \
    -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Overdraft Cascade\",\"icon\":\"💣\"}")
fi
POCKET_OD_ID=$(echo "$POCKET_OD_RESPONSE" | jq -r '.id')
[ "$POCKET_OD_ID" != "null" ] && [ -n "$POCKET_OD_ID" ]
echo -e "${GREEN}✓ Pocket created: $POCKET_OD_ID${NC}\n"

run_test "Deposit 100000"
DEP_OD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_OD_ID/deposit \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":100000,\"description\":\"Overdraft cascade deposit\",\"transaction_date\":\"$TODAY\",\"source_account_id\":\"$ACCOUNT_ID\"}")
DEP_OD_ID=$(echo "$DEP_OD_RESPONSE" | jq -r '.id')
DEP_OD_LINKED_MOV=$(echo "$DEP_OD_RESPONSE" | jq -r '.linked_movement_id')
[ "$DEP_OD_ID" != "null" ] && [ -n "$DEP_OD_ID" ]
[ "$DEP_OD_LINKED_MOV" != "null" ] && [ -n "$DEP_OD_LINKED_MOV" ]
echo -e "${GREEN}✓ Deposit created: $DEP_OD_ID (100000)${NC}\n"

run_test "Withdraw 30000 (balance → 70000)"
WD_OD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_OD_ID/withdraw \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":30000,\"description\":\"Overdraft cascade wd\",\"transaction_date\":\"$TODAY\",\"destination_account_id\":\"$ACCOUNT_ID\"}")
WD_OD_ID=$(echo "$WD_OD_RESPONSE" | jq -r '.id')
[ "$WD_OD_ID" != "null" ] && [ -n "$WD_OD_ID" ]
echo -e "${GREEN}✓ Withdrawal created: $WD_OD_ID (30000, balance now 70000)${NC}\n"

run_test "Delete Linked Movement from Gastos → SHOULD fail (would cause -30k overdraft)"
# The pockets service returns ErrDeleteWouldOverdraft from DeleteTransactionByMovementID,
# and the movements service now propagates this as ErrPocketDeleteWouldOverdraft (HTTP 422).
DELETE_OD_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/movements/$DEP_OD_LINKED_MOV" \
  -b $COOKIES_FILE)
[ "$DELETE_OD_CODE" = "422" ]
echo -e "${GREEN}✓ Delete correctly rejected (HTTP 422) — cascade overdraft prevented${NC}\n"

# ═══════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════

rm -f $COOKIES_FILE
rm -f $COOKIES_FILE_2

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║     ✅ ALL POCKETS EXTENDED TESTS PASSED! ✅            ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  ✓ Linked movement properties (source_pocket_id, type, description, payer, category)"
echo "  ✓ Withdrawal has no linked movement"
echo "  ✓ Edit deposit description → linked movement description updated"
echo "  ✓ Cascade delete from Gastos side"
echo "  ✓ Household member authorization (deposit, withdraw, update, delete → allowed)"
echo "  ✓ Deposit/withdraw to inactive pocket → 422"
echo "  ✓ Max 20 pockets limit → 422"
echo "  ✓ Edit deposit reducing amount below withdrawal total → 422"
echo "  ✓ Cascade delete from Gastos blocked by pocket overdraft → 422"
echo -e "${NC}\n"
