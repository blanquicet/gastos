#!/bin/bash
# Pockets (Ahorros/Bolsillos) API Integration Test Suite
# Tests pocket CRUD, deposits, withdrawals, edit/delete transactions, and deactivation

set -e
set -o pipefail

BASE_URL="${API_BASE_URL:-http://localhost:8080}"
COOKIES_FILE="/tmp/pockets-test-cookies.txt"
TIMESTAMP=$(date +%s%N)
EMAIL="pockets-test+${TIMESTAMP}@test.com"
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
echo "║     🐷 Pockets (Ahorros) API Integration Tests        ║"
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
# SETUP: Register user, create household, account
# (No category setup needed — categories are auto-resolved on first deposit)
# ═══════════════════════════════════════════════════════════

echo -e "${BLUE}═══ SETUP ═══${NC}\n"

run_test "Register User"
REGISTER_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"name\":\"Pocket Tester\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE)
echo "$REGISTER_RESPONSE" | jq -e '.message' > /dev/null
echo -e "${GREEN}✓ User registered${NC}\n"

run_test "Get Current User"
ME_RESPONSE=$(api_call $CURL_FLAGS $BASE_URL/me -b $COOKIES_FILE)
USER_ID=$(echo "$ME_RESPONSE" | jq -r '.id')
[ "$USER_ID" != "null" ] && [ -n "$USER_ID" ]
echo -e "${GREEN}✓ User ID: $USER_ID${NC}\n"

run_test "Create Household"
HOUSEHOLD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Test Household Pockets"}')
HOUSEHOLD_ID=$(echo "$HOUSEHOLD_RESPONSE" | jq -r '.id')
[ "$HOUSEHOLD_ID" != "null" ] && [ -n "$HOUSEHOLD_ID" ]
echo -e "${GREEN}✓ Household created: $HOUSEHOLD_ID${NC}\n"

run_test "Create Savings Account"
ACCOUNT_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/accounts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Savings Account Pockets\",\"type\":\"savings\",\"initial_balance\":1000000}")
ACCOUNT_ID=$(echo "$ACCOUNT_RESPONSE" | jq -r '.id')
[ "$ACCOUNT_ID" != "null" ] && [ -n "$ACCOUNT_ID" ]
echo -e "${GREEN}✓ Savings account created: $ACCOUNT_ID${NC}\n"

TODAY=$(date +%Y-%m-%d)

# ═══════════════════════════════════════════════════════════
# TEST POCKET CRUD
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ POCKET CRUD ═══${NC}\n"

run_test "Create Pocket"
POCKET_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Vacaciones\",\"icon\":\"🏖️\",\"goal_amount\":500000}")
POCKET_ID=$(echo "$POCKET_RESPONSE" | jq -r '.id')
POCKET_NAME=$(echo "$POCKET_RESPONSE" | jq -r '.name')
POCKET_ICON=$(echo "$POCKET_RESPONSE" | jq -r '.icon')
[ "$POCKET_ID" != "null" ] && [ -n "$POCKET_ID" ]
[ "$POCKET_NAME" = "Vacaciones" ]
[ "$POCKET_ICON" = "🏖️" ]
echo -e "${GREEN}✓ Pocket created: $POCKET_ID (name=$POCKET_NAME)${NC}\n"

run_test "Create Duplicate Pocket Name → 409"
DUP_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Vacaciones\",\"icon\":\"🏖️\"}")
[ "$DUP_CODE" = "409" ]
echo -e "${GREEN}✓ Duplicate pocket name correctly rejected (HTTP 409)${NC}\n"

run_test "List Pockets"
LIST_RESPONSE=$(api_call $CURL_FLAGS $BASE_URL/api/pockets -b $COOKIES_FILE)
POCKET_COUNT=$(echo "$LIST_RESPONSE" | jq 'length')
[ "$POCKET_COUNT" -eq "1" ]
echo -e "${GREEN}✓ Listed $POCKET_COUNT pocket(s)${NC}\n"

run_test "Get Pocket by ID"
GET_POCKET=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_ID -b $COOKIES_FILE)
GOT_ID=$(echo "$GET_POCKET" | jq -r '.id')
GOT_NAME=$(echo "$GET_POCKET" | jq -r '.name')
GOT_BALANCE=$(echo "$GET_POCKET" | jq -r '.balance')
[ "$GOT_ID" = "$POCKET_ID" ]
[ "$GOT_NAME" = "Vacaciones" ]
[ "$GOT_BALANCE" = "0" ]
echo -e "${GREEN}✓ Got pocket: name=$GOT_NAME, balance=$GOT_BALANCE${NC}\n"

run_test "Update Pocket"
UPDATE_RESPONSE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/api/pockets/$POCKET_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Vacaciones 2026","icon":"✈️","goal_amount":600000}')
UPDATED_NAME=$(echo "$UPDATE_RESPONSE" | jq -r '.name')
UPDATED_ICON=$(echo "$UPDATE_RESPONSE" | jq -r '.icon')
UPDATED_GOAL=$(echo "$UPDATE_RESPONSE" | jq -r '.goal_amount')
[ "$UPDATED_NAME" = "Vacaciones 2026" ]
[ "$UPDATED_ICON" = "✈️" ]
[ "$UPDATED_GOAL" = "600000" ]
echo -e "${GREEN}✓ Pocket updated: name=$UPDATED_NAME, icon=$UPDATED_ICON, goal=$UPDATED_GOAL${NC}\n"

run_test "Get Summary (empty pockets)"
SUMMARY=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/summary -b $COOKIES_FILE)
TOTAL_BALANCE=$(echo "$SUMMARY" | jq -r '.total_balance')
SUMMARY_COUNT=$(echo "$SUMMARY" | jq -r '.pocket_count')
[ "$TOTAL_BALANCE" = "0" ]
[ "$SUMMARY_COUNT" = "1" ]
echo -e "${GREEN}✓ Summary: total_balance=$TOTAL_BALANCE, pocket_count=$SUMMARY_COUNT${NC}\n"

# ═══════════════════════════════════════════════════════════
# TEST DEPOSIT
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ DEPOSITS ═══${NC}\n"

run_test "Deposit 100000"
DEPOSIT_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_ID/deposit \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":100000,\"description\":\"First deposit\",\"transaction_date\":\"$TODAY\",\"source_account_id\":\"$ACCOUNT_ID\"}")
DEPOSIT_ID=$(echo "$DEPOSIT_RESPONSE" | jq -r '.id')
DEPOSIT_TYPE=$(echo "$DEPOSIT_RESPONSE" | jq -r '.type')
DEPOSIT_AMOUNT=$(echo "$DEPOSIT_RESPONSE" | jq -r '.amount')
DEPOSIT_LINKED_MOV=$(echo "$DEPOSIT_RESPONSE" | jq -r '.linked_movement_id')
[ "$DEPOSIT_ID" != "null" ] && [ -n "$DEPOSIT_ID" ]
[ "$DEPOSIT_TYPE" = "DEPOSIT" ]
[ "$DEPOSIT_AMOUNT" = "100000" ]
[ "$DEPOSIT_LINKED_MOV" != "null" ] && [ -n "$DEPOSIT_LINKED_MOV" ]
echo -e "${GREEN}✓ Deposit created: id=$DEPOSIT_ID, amount=$DEPOSIT_AMOUNT, linked_movement=$DEPOSIT_LINKED_MOV${NC}\n"

run_test "Verify Pocket Balance after Deposit"
GET_POCKET_AFTER_DEP=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_ID -b $COOKIES_FILE)
BALANCE_AFTER_DEP=$(echo "$GET_POCKET_AFTER_DEP" | jq -r '.balance')
[ "$BALANCE_AFTER_DEP" = "100000" ]
echo -e "${GREEN}✓ Pocket balance = $BALANCE_AFTER_DEP (expected 100000)${NC}\n"

run_test "List Pocket Transactions"
TXN_LIST=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_ID/transactions -b $COOKIES_FILE)
TXN_COUNT=$(echo "$TXN_LIST" | jq 'length')
FIRST_TXN_TYPE=$(echo "$TXN_LIST" | jq -r '.[0].type')
[ "$TXN_COUNT" -eq "1" ]
[ "$FIRST_TXN_TYPE" = "DEPOSIT" ]
echo -e "${GREEN}✓ Found $TXN_COUNT transaction(s), type=$FIRST_TXN_TYPE${NC}\n"

run_test "Verify Account Balance Decreased (deposit from account)"
ACCOUNT_AFTER_DEP=$(api_call $CURL_FLAGS $BASE_URL/accounts/$ACCOUNT_ID -b $COOKIES_FILE)
ACCOUNT_BALANCE_AFTER_DEP=$(echo "$ACCOUNT_AFTER_DEP" | jq -r '.current_balance')
[ "$ACCOUNT_BALANCE_AFTER_DEP" = "900000" ]
echo -e "${GREEN}✓ Account balance = $ACCOUNT_BALANCE_AFTER_DEP (expected 900000)${NC}\n"

run_test "Verify Linked Movement Exists"
MOVEMENTS_RESPONSE=$(api_call $CURL_FLAGS "$BASE_URL/movements" -b $COOKIES_FILE)
MOV_WITH_POCKET=$(echo "$MOVEMENTS_RESPONSE" | jq --arg pid "$POCKET_ID" '[.movements[] | select(.source_pocket_id == $pid)] | length')
[ "$MOV_WITH_POCKET" -ge "1" ]
echo -e "${GREEN}✓ Found $MOV_WITH_POCKET linked movement(s) with source_pocket_id${NC}\n"

# ═══════════════════════════════════════════════════════════
# TEST WITHDRAWAL
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ WITHDRAWALS ═══${NC}\n"

run_test "Withdraw 30000"
WITHDRAW_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET_ID/withdraw \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":30000,\"description\":\"Partial withdrawal\",\"transaction_date\":\"$TODAY\",\"destination_account_id\":\"$ACCOUNT_ID\"}")
WITHDRAW_ID=$(echo "$WITHDRAW_RESPONSE" | jq -r '.id')
WITHDRAW_TYPE=$(echo "$WITHDRAW_RESPONSE" | jq -r '.type')
WITHDRAW_AMOUNT=$(echo "$WITHDRAW_RESPONSE" | jq -r '.amount')
[ "$WITHDRAW_ID" != "null" ] && [ -n "$WITHDRAW_ID" ]
[ "$WITHDRAW_TYPE" = "WITHDRAWAL" ]
[ "$WITHDRAW_AMOUNT" = "30000" ]
echo -e "${GREEN}✓ Withdrawal created: id=$WITHDRAW_ID, amount=$WITHDRAW_AMOUNT${NC}\n"

run_test "Verify Pocket Balance after Withdrawal"
GET_POCKET_AFTER_WD=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_ID -b $COOKIES_FILE)
BALANCE_AFTER_WD=$(echo "$GET_POCKET_AFTER_WD" | jq -r '.balance')
[ "$BALANCE_AFTER_WD" = "70000" ]
echo -e "${GREEN}✓ Pocket balance = $BALANCE_AFTER_WD (expected 70000)${NC}\n"

run_test "Verify Account Balance after Withdrawal"
ACCOUNT_AFTER_WD=$(api_call $CURL_FLAGS $BASE_URL/accounts/$ACCOUNT_ID -b $COOKIES_FILE)
ACCOUNT_BALANCE_AFTER_WD=$(echo "$ACCOUNT_AFTER_WD" | jq -r '.current_balance')
[ "$ACCOUNT_BALANCE_AFTER_WD" = "930000" ]
echo -e "${GREEN}✓ Account balance = $ACCOUNT_BALANCE_AFTER_WD (expected 930000)${NC}\n"

run_test "Attempt Overdraft → 422"
OVERDRAFT_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/pockets/$POCKET_ID/withdraw \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":100000,\"description\":\"Overdraft attempt\",\"transaction_date\":\"$TODAY\",\"destination_account_id\":\"$ACCOUNT_ID\"}")
[ "$OVERDRAFT_CODE" = "422" ]
echo -e "${GREEN}✓ Overdraft correctly rejected (HTTP 422)${NC}\n"

# ═══════════════════════════════════════════════════════════
# TEST EDIT TRANSACTION
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ EDIT TRANSACTION ═══${NC}\n"

run_test "Get Deposit Transaction ID from List"
TXN_LIST2=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_ID/transactions -b $COOKIES_FILE)
DEPOSIT_TXN_ID=$(echo "$TXN_LIST2" | jq -r '[.[] | select(.type == "DEPOSIT")][0].id')
[ "$DEPOSIT_TXN_ID" != "null" ] && [ -n "$DEPOSIT_TXN_ID" ]
echo -e "${GREEN}✓ Deposit transaction ID: $DEPOSIT_TXN_ID${NC}\n"

run_test "Edit Deposit Amount to 150000"
EDIT_RESPONSE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/api/pocket-transactions/$DEPOSIT_TXN_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"amount":150000}')
EDITED_AMOUNT=$(echo "$EDIT_RESPONSE" | jq -r '.amount')
[ "$EDITED_AMOUNT" = "150000" ]
echo -e "${GREEN}✓ Transaction edited: amount=$EDITED_AMOUNT${NC}\n"

run_test "Verify Pocket Balance after Edit"
GET_POCKET_AFTER_EDIT=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_ID -b $COOKIES_FILE)
BALANCE_AFTER_EDIT=$(echo "$GET_POCKET_AFTER_EDIT" | jq -r '.balance')
[ "$BALANCE_AFTER_EDIT" = "120000" ]
echo -e "${GREEN}✓ Pocket balance = $BALANCE_AFTER_EDIT (expected 120000 = 150000 - 30000)${NC}\n"

run_test "Verify Linked Movement Amount Updated"
MOVEMENTS_AFTER_EDIT=$(api_call $CURL_FLAGS "$BASE_URL/movements" -b $COOKIES_FILE)
LINKED_MOV_AMOUNT=$(echo "$MOVEMENTS_AFTER_EDIT" | jq --arg mid "$DEPOSIT_LINKED_MOV" '[.movements[] | select(.id == $mid)][0].amount')
[ "$LINKED_MOV_AMOUNT" = "150000" ]
echo -e "${GREEN}✓ Linked movement amount also updated to $LINKED_MOV_AMOUNT${NC}\n"

# ═══════════════════════════════════════════════════════════
# TEST DELETE TRANSACTION
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ DELETE TRANSACTION ═══${NC}\n"

run_test "Delete the Withdrawal"
DELETE_WD_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/api/pocket-transactions/$WITHDRAW_ID \
  -b $COOKIES_FILE)
[ "$DELETE_WD_CODE" = "204" ]
echo -e "${GREEN}✓ Withdrawal deleted (HTTP 204)${NC}\n"

run_test "Verify Pocket Balance after Withdrawal Deletion"
GET_POCKET_AFTER_DEL_WD=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_ID -b $COOKIES_FILE)
BALANCE_AFTER_DEL_WD=$(echo "$GET_POCKET_AFTER_DEL_WD" | jq -r '.balance')
[ "$BALANCE_AFTER_DEL_WD" = "150000" ]
echo -e "${GREEN}✓ Pocket balance = $BALANCE_AFTER_DEL_WD (expected 150000)${NC}\n"

# Count movements before deposit deletion
MOVEMENTS_BEFORE_DEL=$(api_call $CURL_FLAGS "$BASE_URL/movements" -b $COOKIES_FILE)
MOV_COUNT_BEFORE=$(echo "$MOVEMENTS_BEFORE_DEL" | jq '.movements | length')

run_test "Delete the Deposit"
DELETE_DEP_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/api/pocket-transactions/$DEPOSIT_TXN_ID \
  -b $COOKIES_FILE)
[ "$DELETE_DEP_CODE" = "204" ]
echo -e "${GREEN}✓ Deposit deleted (HTTP 204)${NC}\n"

run_test "Verify Linked Movement Also Deleted"
MOVEMENTS_AFTER_DEL=$(api_call $CURL_FLAGS "$BASE_URL/movements" -b $COOKIES_FILE)
MOV_COUNT_AFTER=$(echo "$MOVEMENTS_AFTER_DEL" | jq '.movements | length')
LINKED_MOV_STILL_EXISTS=$(echo "$MOVEMENTS_AFTER_DEL" | jq --arg mid "$DEPOSIT_LINKED_MOV" '[.movements[] | select(.id == $mid)] | length')
[ "$LINKED_MOV_STILL_EXISTS" = "0" ]
[ "$MOV_COUNT_AFTER" -lt "$MOV_COUNT_BEFORE" ]
echo -e "${GREEN}✓ Linked movement deleted (movements count: $MOV_COUNT_BEFORE → $MOV_COUNT_AFTER)${NC}\n"

run_test "Verify Pocket Balance is Zero"
GET_POCKET_AFTER_DEL_ALL=$(api_call $CURL_FLAGS $BASE_URL/api/pockets/$POCKET_ID -b $COOKIES_FILE)
BALANCE_AFTER_DEL_ALL=$(echo "$GET_POCKET_AFTER_DEL_ALL" | jq -r '.balance')
[ "$BALANCE_AFTER_DEL_ALL" = "0" ]
echo -e "${GREEN}✓ Pocket balance = $BALANCE_AFTER_DEL_ALL (expected 0)${NC}\n"

# ═══════════════════════════════════════════════════════════
# TEST DEACTIVATE POCKET
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ DEACTIVATE POCKET ═══${NC}\n"

run_test "Create Second Pocket for Deactivation Test"
POCKET2_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Emergencia\",\"icon\":\"🚨\"}")
POCKET2_ID=$(echo "$POCKET2_RESPONSE" | jq -r '.id')
[ "$POCKET2_ID" != "null" ] && [ -n "$POCKET2_ID" ]
echo -e "${GREEN}✓ Second pocket created: $POCKET2_ID${NC}\n"

run_test "Deposit into Second Pocket"
DEP2_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/pockets/$POCKET2_ID/deposit \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"amount\":50000,\"description\":\"Emergency fund\",\"transaction_date\":\"$TODAY\",\"source_account_id\":\"$ACCOUNT_ID\"}")
DEP2_ID=$(echo "$DEP2_RESPONSE" | jq -r '.id')
[ "$DEP2_ID" != "null" ] && [ -n "$DEP2_ID" ]
echo -e "${GREEN}✓ Deposited 50000 into second pocket${NC}\n"

run_test "Delete Pocket Without Force → 422 (has balance)"
DELETE_NO_FORCE_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/api/pockets/$POCKET2_ID \
  -b $COOKIES_FILE)
[ "$DELETE_NO_FORCE_CODE" = "422" ]
echo -e "${GREEN}✓ Delete without force rejected (HTTP 422)${NC}\n"

run_test "Delete Pocket With ?force=true → 204"
DELETE_FORCE_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/api/pockets/$POCKET2_ID?force=true" \
  -b $COOKIES_FILE)
[ "$DELETE_FORCE_CODE" = "204" ]
echo -e "${GREEN}✓ Pocket force-deleted (HTTP 204)${NC}\n"

run_test "Verify Deactivated Pocket Not in Active List"
LIST_AFTER_DELETE=$(api_call $CURL_FLAGS $BASE_URL/api/pockets -b $COOKIES_FILE)
DEACTIVATED_IN_LIST=$(echo "$LIST_AFTER_DELETE" | jq --arg id "$POCKET2_ID" '[.[] | select(.id == $id)] | length')
[ "$DEACTIVATED_IN_LIST" = "0" ]
REMAINING_COUNT=$(echo "$LIST_AFTER_DELETE" | jq 'length')
echo -e "${GREEN}✓ Deactivated pocket not in active list (remaining: $REMAINING_COUNT)${NC}\n"

# ═══════════════════════════════════════════════════════════
# TEST: DELETE POCKET WITH ZERO BALANCE (no force needed)
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ DELETE POCKET (ZERO BALANCE) ═══${NC}\n"

run_test "Deactivate Empty Pocket (no force needed)"
# The first pocket (Vacaciones 2026) has zero balance — should delete without force
DELETE_EMPTY_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/api/pockets/$POCKET_ID \
  -b $COOKIES_FILE)
[ "$DELETE_EMPTY_CODE" = "204" ]
echo -e "${GREEN}✓ Empty pocket deleted without force (HTTP 204)${NC}\n"

run_test "Verify All Pockets Deactivated"
FINAL_LIST=$(api_call $CURL_FLAGS $BASE_URL/api/pockets -b $COOKIES_FILE)
FINAL_COUNT=$(echo "$FINAL_LIST" | jq 'length')
[ "$FINAL_COUNT" = "0" ]
echo -e "${GREEN}✓ No active pockets remaining (count: $FINAL_COUNT)${NC}\n"

# ═══════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════

rm -f $COOKIES_FILE

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║         ✅ ALL POCKETS TESTS PASSED! ✅                ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"
