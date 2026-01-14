#!/bin/bash
# Simplified API Integration Test Suite
# Fails immediately on first error

set -e  # Exit on any error
set -o pipefail  # Exit on pipe failure

BASE_URL="${API_BASE_URL:-http://localhost:8080}"
COOKIES_FILE="/tmp/gastos-cookies.txt"
CARO_COOKIES_FILE="/tmp/gastos-cookies-caro.txt"
JOSE_EMAIL="jose+$(date +%s%N)@test.com"
CARO_EMAIL="caro+$(date +%s%N)@test.com"
PASSWORD="Test1234!"
CLEANUP="${CLEANUP:-false}"
DEBUG="${DEBUG:-false}"
DATABASE_URL="${DATABASE_URL:-postgresql://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable}"

# Curl flags based on debug mode
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
echo "║     🧪 Gastos Households API Integration Tests        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Clean up
rm -f $COOKIES_FILE $CARO_COOKIES_FILE

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
# SUCCESS SCENARIOS
# ═══════════════════════════════════════════════════════════

run_test "Health Check"
HEALTH=$(api_call $CURL_FLAGS $BASE_URL/health)
echo "$HEALTH" | jq -e '.status == "healthy"' > /dev/null
echo -e "${GREEN}✓ Server is healthy${NC}\n"

run_test "Register Jose"
REGISTER_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$JOSE_EMAIL\",\"name\":\"Jose\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE)
echo "$REGISTER_RESPONSE" | jq -e '.message' > /dev/null
echo -e "${GREEN}✓ Jose registered${NC}\n"

run_test "Get Current User (/me)"
ME_RESPONSE=$(api_call $CURL_FLAGS $BASE_URL/me -b $COOKIES_FILE)
JOSE_ID=$(echo "$ME_RESPONSE" | jq -r '.id')
[ "$JOSE_ID" != "null" ] && [ -n "$JOSE_ID" ]
echo -e "${GREEN}✓ Current user verified with ID: $JOSE_ID${NC}\n"

run_test "Register Caro"
CARO_REGISTER=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$CARO_EMAIL\",\"name\":\"Caro\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $CARO_COOKIES_FILE)
echo "$CARO_REGISTER" | jq -e '.message' > /dev/null
CARO_ME=$(api_call $CURL_FLAGS $BASE_URL/me -b $CARO_COOKIES_FILE)
CARO_ID=$(echo "$CARO_ME" | jq -r '.id')
[ "$CARO_ID" != "null" ] && [ -n "$CARO_ID" ]
echo -e "${GREEN}✓ Caro registered with ID: $CARO_ID${NC}\n"

run_test "Register Maria (for auto-link test)"
MARIA_EMAIL="maria+$(date +%s%N)@test.com"
MARIA_REGISTER=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$MARIA_EMAIL\",\"name\":\"Maria\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}")
echo "$MARIA_REGISTER" | jq -e '.message' > /dev/null
echo -e "${GREEN}✓ Maria registered${NC}\n"

run_test "Logout"
LOGOUT_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/auth/logout -b $COOKIES_FILE)
[ "$LOGOUT_CODE" = "200" ]
echo -e "${GREEN}✓ Logged out successfully${NC}\n"

run_test "Login as Jose"
LOGIN_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$JOSE_EMAIL\",\"password\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE)
echo "$LOGIN_RESPONSE" | jq -e '.message' > /dev/null
LOGIN_ME=$(api_call $CURL_FLAGS $BASE_URL/me -b $COOKIES_FILE)
LOGIN_ID=$(echo "$LOGIN_ME" | jq -r '.id')
[ "$LOGIN_ID" = "$JOSE_ID" ]
echo -e "${GREEN}✓ Login successful${NC}\n"

run_test "Create Household"
HOUSEHOLD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Casa de Jose y Caro"}')
HOUSEHOLD_ID=$(echo "$HOUSEHOLD_RESPONSE" | jq -r '.id')
[ "$HOUSEHOLD_ID" != "null" ] && [ -n "$HOUSEHOLD_ID" ]
echo -e "${GREEN}✓ Household created with ID: $HOUSEHOLD_ID${NC}\n"

run_test "List Households"
LIST_RESPONSE=$(api_call $CURL_FLAGS $BASE_URL/households -b $COOKIES_FILE)
HOUSEHOLD_COUNT=$(echo "$LIST_RESPONSE" | jq '.households | length')
[ "$HOUSEHOLD_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Found $HOUSEHOLD_COUNT household(s)${NC}\n"

run_test "Get Household Details"
DETAILS_RESPONSE=$(api_call $CURL_FLAGS $BASE_URL/households/$HOUSEHOLD_ID -b $COOKIES_FILE)
DETAILS_ID=$(echo "$DETAILS_RESPONSE" | jq -r '.id')
[ "$DETAILS_ID" = "$HOUSEHOLD_ID" ]
echo -e "${GREEN}✓ Retrieved household details${NC}\n"

run_test "Update Household Name"
UPDATE_RESPONSE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/households/$HOUSEHOLD_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Mi Hogar Actualizado"}')
NAME=$(echo "$UPDATE_RESPONSE" | jq -r '.name')
[ "$NAME" = "Mi Hogar Actualizado" ]
echo -e "${GREEN}✓ Household name updated${NC}\n"

run_test "Add Member (Caro)"
MEMBER_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD_ID/members \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"email\":\"$CARO_EMAIL\"}")
MEMBER_USER_ID=$(echo "$MEMBER_RESPONSE" | jq -r '.user_id')
[ "$MEMBER_USER_ID" = "$CARO_ID" ]
echo -e "${GREEN}✓ Caro added as member${NC}\n"

run_test "Promote Member to Owner"
PROMOTE_RESPONSE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/households/$HOUSEHOLD_ID/members/$CARO_ID/role \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"role":"owner"}')
ROLE=$(echo "$PROMOTE_RESPONSE" | jq -r '.role')
[ "$ROLE" = "owner" ]
echo -e "${GREEN}✓ Member promoted to owner${NC}\n"

run_test "Demote Owner to Member"
DEMOTE_RESPONSE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/households/$HOUSEHOLD_ID/members/$CARO_ID/role \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"role":"member"}')
ROLE=$(echo "$DEMOTE_RESPONSE" | jq -r '.role')
[ "$ROLE" = "member" ]
echo -e "${GREEN}✓ Owner demoted to member${NC}\n"

run_test "Create Unlinked Contact"
CONTACT_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD_ID/contacts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Papá","email":"papa@test.com","phone":"+57 300 123 4567"}')
CONTACT_ID=$(echo "$CONTACT_RESPONSE" | jq -r '.id')
IS_REGISTERED=$(echo "$CONTACT_RESPONSE" | jq -r '.is_registered')
[ "$CONTACT_ID" != "null" ] && [ "$IS_REGISTERED" = "false" ]
echo -e "${GREEN}✓ Unlinked contact created${NC}\n"

run_test "Create Auto-Linked Contact"
LINKED_CONTACT=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD_ID/contacts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Maria\",\"email\":\"$MARIA_EMAIL\"}")
LINKED_ID=$(echo "$LINKED_CONTACT" | jq -r '.id')
IS_REGISTERED=$(echo "$LINKED_CONTACT" | jq -r '.is_registered')
[ "$IS_REGISTERED" = "true" ] && [ "$LINKED_ID" != "null" ]
echo -e "${GREEN}✓ Contact auto-linked to Maria${NC}\n"

run_test "List Contacts"
CONTACTS_LIST=$(api_call $CURL_FLAGS $BASE_URL/households/$HOUSEHOLD_ID/contacts -b $COOKIES_FILE)
CONTACT_COUNT=$(echo "$CONTACTS_LIST" | jq 'length')
[ "$CONTACT_COUNT" -ge "2" ]
echo -e "${GREEN}✓ Found $CONTACT_COUNT contact(s)${NC}\n"

run_test "Update Contact"
UPDATE_CONTACT=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/households/$HOUSEHOLD_ID/contacts/$CONTACT_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Papa Juan","email":"papa@test.com","phone":"+57 300 999 8888"}')
NAME=$(echo "$UPDATE_CONTACT" | jq -r '.name')
[ "$NAME" = "Papa Juan" ]
echo -e "${GREEN}✓ Contact updated${NC}\n"

run_test "Delete Contact"
DELETE_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/households/$HOUSEHOLD_ID/contacts/$CONTACT_ID \
  -b $COOKIES_FILE)
[ "$DELETE_CODE" = "204" ]
echo -e "${GREEN}✓ Contact deleted${NC}\n"

run_test "Remove Member from Household"
REMOVE_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/households/$HOUSEHOLD_ID/members/$CARO_ID \
  -b $COOKIES_FILE)
[ "$REMOVE_CODE" = "204" ]
echo -e "${GREEN}✓ Member removed${NC}\n"

run_test "Add Caro Back and Promote to Owner"
MEMBER_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD_ID/members \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"email\":\"$CARO_EMAIL\"}")
PROMOTE_RESPONSE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/households/$HOUSEHOLD_ID/members/$CARO_ID/role \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"role":"owner"}')
echo -e "${GREEN}✓ Caro re-added and promoted to owner${NC}\n"

run_test "Leave Household (as non-last owner)"
LEAVE_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST \
  $BASE_URL/households/$HOUSEHOLD_ID/leave \
  -b $CARO_COOKIES_FILE)
[ "$LEAVE_CODE" = "204" ]
echo -e "${GREEN}✓ Caro left the household${NC}\n"

run_test "Delete Household (as owner)"
DELETE_HOUSEHOLD_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/households/$HOUSEHOLD_ID \
  -b $COOKIES_FILE)
[ "$DELETE_HOUSEHOLD_CODE" = "204" ]
echo -e "${GREEN}✓ Household deleted${NC}\n"

run_test "Create New Household for Contact Promotion Test"
HOUSEHOLD2=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Test Household 2"}')
HOUSEHOLD2_ID=$(echo "$HOUSEHOLD2" | jq -r '.id')
echo -e "${GREEN}✓ New household created${NC}\n"

run_test "Promote Linked Contact to Member"
PROMOTE_CONTACT=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD2_ID/contacts/$LINKED_ID/promote \
  -b $COOKIES_FILE)
PROMOTED_USER_ID=$(echo "$PROMOTE_CONTACT" | jq -r '.user_id')
[ "$PROMOTED_USER_ID" != "null" ] && [ -n "$PROMOTED_USER_ID" ]
echo -e "${GREEN}✓ Contact promoted to member${NC}\n"

# ═══════════════════════════════════════════════════════════
# ERROR SCENARIOS
# ═══════════════════════════════════════════════════════════

echo -e "${YELLOW}Testing error scenarios...${NC}\n"

run_test "Unauthorized Access (No Session)"
UNAUTH_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST \
  $BASE_URL/households \
  -H "Content-Type: application/json" \
  -d '{"name":"Unauthorized Test"}')
[ "$UNAUTH_CODE" = "401" ]
echo -e "${GREEN}✓ Correctly rejected with HTTP 401${NC}\n"

run_test "Register with Duplicate Email"
DUPLICATE_CODE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$JOSE_EMAIL\",\"name\":\"Jose Duplicate\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}")
[ "$DUPLICATE_CODE" = "400" ] || [ "$DUPLICATE_CODE" = "409" ]
echo -e "${GREEN}✓ Correctly rejected duplicate email${NC}\n"

run_test "Get Non-Existent Household"
NOT_FOUND=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" \
  $BASE_URL/households/00000000-0000-0000-0000-000000000000 \
  -b $COOKIES_FILE)
[ "$NOT_FOUND" = "404" ] || [ "$NOT_FOUND" = "401" ] || [ "$NOT_FOUND" = "403" ]
echo -e "${GREEN}✓ Correctly returned HTTP 404/401/403${NC}\n"

run_test "Delete Non-Existent Contact"
DELETE_BAD=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/households/$HOUSEHOLD2_ID/contacts/00000000-0000-0000-0000-000000000000 \
  -b $COOKIES_FILE)
[ "$DELETE_BAD" = "404" ]
echo -e "${GREEN}✓ Correctly returned HTTP 404${NC}\n"

run_test "Cannot Promote Unregistered Contact"
UNLINKED=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD2_ID/contacts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Unregistered Person"}')
UNLINKED_ID=$(echo "$UNLINKED" | jq -r '.id')
PROMOTE_FAIL=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST \
  $BASE_URL/households/$HOUSEHOLD2_ID/contacts/$UNLINKED_ID/promote \
  -b $COOKIES_FILE)
[ "$PROMOTE_FAIL" = "400" ] || [ "$PROMOTE_FAIL" = "409" ]
echo -e "${GREEN}✓ Correctly rejected promoting unregistered contact${NC}\n"

run_test "Cannot Remove Last Owner"
REMOVE_LAST=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/households/$HOUSEHOLD2_ID/members/$JOSE_ID \
  -b $COOKIES_FILE)
[ "$REMOVE_LAST" = "400" ] || [ "$REMOVE_LAST" = "403" ] || [ "$REMOVE_LAST" = "409" ]
echo -e "${GREEN}✓ Correctly prevented removing last owner${NC}\n"

run_test "Cannot Leave as Last Owner"
LEAVE_LAST=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" -X POST \
  $BASE_URL/households/$HOUSEHOLD2_ID/leave \
  -b $COOKIES_FILE)
[ "$LEAVE_LAST" = "400" ] || [ "$LEAVE_LAST" = "403" ] || [ "$LEAVE_LAST" = "409" ]
echo -e "${GREEN}✓ Correctly prevented last owner from leaving${NC}\n"

run_test "Delete Account (Self-Delete)"
# Register a temporary user for deletion test
TEMP_EMAIL="temp+$(date +%s%N)@test.com"
TEMP_COOKIES="/tmp/gastos-cookies-temp.txt"
api_call $CURL_FLAGS -c $TEMP_COOKIES -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEMP_EMAIL\",\"name\":\"TempUser\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" > /dev/null
# Delete the account
DELETE_ACCOUNT=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X DELETE $BASE_URL/auth/account -b $TEMP_COOKIES)
[ "$DELETE_ACCOUNT" = "204" ]
# Verify user is deleted (session should be invalid)
ME_AFTER_DELETE=$(curl $CURL_FLAGS -o /dev/null -w "%{http_code}" $BASE_URL/me -b $TEMP_COOKIES)
[ "$ME_AFTER_DELETE" = "401" ]
rm -f $TEMP_COOKIES
echo -e "${GREEN}✓ Successfully deleted account and invalidated session${NC}\n"

# ═══════════════════════════════════════════════════════════
# PAYMENT METHODS TESTS
# ═══════════════════════════════════════════════════════════

run_test "Create Payment Method (Personal)"
PM_CREATE=$(api_call $CURL_FLAGS -X POST $BASE_URL/payment-methods \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Débito Jose","type":"debit_card","is_shared_with_household":false,"last4":"1234","institution":"Banco de Bogotá"}')
PM1_ID=$(echo "$PM_CREATE" | jq -r '.id')
[ "$PM1_ID" != "null" ] && [ -n "$PM1_ID" ]
echo -e "${GREEN}✓ Created personal payment method${NC}\n"

run_test "Create Payment Method (Shared)"
PM_SHARED=$(api_call $CURL_FLAGS -X POST $BASE_URL/payment-methods \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Efectivo","type":"cash","is_shared_with_household":true}')
PM2_ID=$(echo "$PM_SHARED" | jq -r '.id')
[ "$PM2_ID" != "null" ] && [ -n "$PM2_ID" ]
echo -e "${GREEN}✓ Created shared payment method${NC}\n"

run_test "List Payment Methods"
PM_LIST=$(api_call $CURL_FLAGS $BASE_URL/payment-methods -b $COOKIES_FILE)
PM_COUNT=$(echo "$PM_LIST" | jq '. | length')
[ "$PM_COUNT" -ge "2" ]
echo -e "${GREEN}✓ Listed payment methods (found $PM_COUNT)${NC}\n"

run_test "Get Single Payment Method"
PM_GET=$(api_call $CURL_FLAGS $BASE_URL/payment-methods/$PM1_ID -b $COOKIES_FILE)
PM_NAME=$(echo "$PM_GET" | jq -r '.name')
[ "$PM_NAME" = "Débito Jose" ]
echo -e "${GREEN}✓ Retrieved payment method${NC}\n"

run_test "Update Payment Method"
PM_UPDATE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/payment-methods/$PM1_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Débito Jose Principal","is_shared_with_household":true}')
PM_UPDATED_NAME=$(echo "$PM_UPDATE" | jq -r '.name')
PM_UPDATED_SHARED=$(echo "$PM_UPDATE" | jq -r '.is_shared_with_household')
[ "$PM_UPDATED_NAME" = "Débito Jose Principal" ]
[ "$PM_UPDATED_SHARED" = "true" ]
echo -e "${GREEN}✓ Updated payment method${NC}\n"

run_test "Prevent Duplicate Payment Method Names"
PM_DUP=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X POST $BASE_URL/payment-methods \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Efectivo","type":"cash","is_shared_with_household":true}')
[ "$PM_DUP" = "409" ]
echo -e "${GREEN}✓ Prevented duplicate payment method name${NC}\n"

run_test "Delete Payment Method"
PM_DELETE=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X DELETE $BASE_URL/payment-methods/$PM2_ID -b $COOKIES_FILE)
[ "$PM_DELETE" = "204" ]
echo -e "${GREEN}✓ Deleted payment method${NC}\n"

# ═══════════════════════════════════════════════════════════
# HOUSEHOLD SHARED PAYMENT METHODS TESTS
# ═══════════════════════════════════════════════════════════

run_test "Verify Household Includes Shared Payment Methods"
HH_DETAILS=$(api_call $CURL_FLAGS $BASE_URL/households/$HOUSEHOLD2_ID -b $COOKIES_FILE)
SHARED_PM_COUNT=$(echo "$HH_DETAILS" | jq '.shared_payment_methods | length')
[ "$SHARED_PM_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Household includes shared payment methods (found $SHARED_PM_COUNT)${NC}\n"

run_test "Verify Shared Payment Method Details"
FIRST_SHARED_PM=$(echo "$HH_DETAILS" | jq -r '.shared_payment_methods[0]')
SHARED_PM_NAME=$(echo "$FIRST_SHARED_PM" | jq -r '.name')
SHARED_PM_SHARED=$(echo "$FIRST_SHARED_PM" | jq -r '.is_shared_with_household')
SHARED_PM_ACTIVE=$(echo "$FIRST_SHARED_PM" | jq -r '.is_active')
[ "$SHARED_PM_SHARED" = "true" ]
[ "$SHARED_PM_ACTIVE" = "true" ]
echo -e "${GREEN}✓ Shared payment method has correct properties (name: $SHARED_PM_NAME)${NC}\n"

run_test "Create Inactive Shared Payment Method"
PM3=$(api_call $CURL_FLAGS -X POST $BASE_URL/payment-methods \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Tarjeta Bloqueada","type":"credit_card","is_shared_with_household":true,"is_active":false}')
PM3_ID=$(echo "$PM3" | jq -r '.id')
[ "$PM3_ID" != "null" ]
echo -e "${GREEN}✓ Created inactive shared payment method${NC}\n"

run_test "Verify Inactive Shared PM Not in Household List"
HH_DETAILS2=$(api_call $CURL_FLAGS $BASE_URL/households/$HOUSEHOLD2_ID -b $COOKIES_FILE)
INACTIVE_PM_IN_LIST=$(echo "$HH_DETAILS2" | jq --arg id "$PM3_ID" '.shared_payment_methods[] | select(.id == $id)')
[ -z "$INACTIVE_PM_IN_LIST" ]
echo -e "${GREEN}✓ Inactive shared payment methods are filtered out${NC}\n"

run_test "Create Personal (Non-Shared) Payment Method"
PM4=$(api_call $CURL_FLAGS -X POST $BASE_URL/payment-methods \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Cuenta Personal","type":"other","is_shared_with_household":false}')
PM4_ID=$(echo "$PM4" | jq -r '.id')
[ "$PM4_ID" != "null" ]
echo -e "${GREEN}✓ Created personal payment method${NC}\n"

run_test "Verify Personal PM Not in Household Shared List"
HH_DETAILS3=$(api_call $CURL_FLAGS $BASE_URL/households/$HOUSEHOLD2_ID -b $COOKIES_FILE)
PERSONAL_PM_IN_LIST=$(echo "$HH_DETAILS3" | jq --arg id "$PM4_ID" '.shared_payment_methods[] | select(.id == $id)')
[ -z "$PERSONAL_PM_IN_LIST" ]
echo -e "${GREEN}✓ Personal payment methods are not in shared list${NC}\n"

# ═══════════════════════════════════════════════════════════
# CONTACT ACTIVATION TESTS
# ═══════════════════════════════════════════════════════════

run_test "Create Contact for Activation Test"
CONTACT_CREATE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households/$HOUSEHOLD2_ID/contacts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Pedro\",\"email\":\"pedro@example.com\"}")
CONTACT_ID=$(echo "$CONTACT_CREATE" | jq -r '.id')
[ "$CONTACT_ID" != "null" ] && [ -n "$CONTACT_ID" ]
echo -e "${GREEN}✓ Created contact for activation test${NC}\n"

run_test "Deactivate Contact"
CONTACT_DEACTIVATE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/households/$HOUSEHOLD2_ID/contacts/$CONTACT_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Pedro\",\"is_active\":false}")
CONTACT_ACTIVE=$(echo "$CONTACT_DEACTIVATE" | jq -r '.is_active')
[ "$CONTACT_ACTIVE" = "false" ]
echo -e "${GREEN}✓ Deactivated contact${NC}\n"

run_test "Reactivate Contact"
CONTACT_REACTIVATE=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/households/$HOUSEHOLD2_ID/contacts/$CONTACT_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Pedro\",\"is_active\":true}")
CONTACT_ACTIVE=$(echo "$CONTACT_REACTIVATE" | jq -r '.is_active')
[ "$CONTACT_ACTIVE" = "true" ]
echo -e "${GREEN}✓ Reactivated contact${NC}\n"

# ═══════════════════════════════════════════════════════════
# MOVEMENT FORM CONFIG TESTS
# ═══════════════════════════════════════════════════════════

run_test "Get Movement Form Config"
FORM_CONFIG=$(api_call $CURL_FLAGS $BASE_URL/movement-form-config -b $COOKIES_FILE)
USERS_COUNT=$(echo "$FORM_CONFIG" | jq '.users | length')
PM_COUNT=$(echo "$FORM_CONFIG" | jq '.payment_methods | length')
CATEGORY_GROUPS_COUNT=$(echo "$FORM_CONFIG" | jq '.category_groups | length')
[ "$USERS_COUNT" -ge "1" ]
[ "$PM_COUNT" -ge "1" ]
[ "$CATEGORY_GROUPS_COUNT" -ge "0" ]
echo -e "${GREEN}✓ Retrieved form config (users: $USERS_COUNT, payment_methods: $PM_COUNT, category_groups: $CATEGORY_GROUPS_COUNT)${NC}\n"

run_test "Verify Form Config Structure"
HAS_MEMBERS=$(echo "$FORM_CONFIG" | jq '.users[] | select(.type=="member")' | jq -s 'length')
HAS_CONTACTS=$(echo "$FORM_CONFIG" | jq '.users[] | select(.type=="contact")' | jq -s 'length')
[ "$HAS_MEMBERS" -ge "1" ]
echo -e "${GREEN}✓ Form config has correct structure (members: $HAS_MEMBERS, contacts: $HAS_CONTACTS)${NC}\n"

# ═══════════════════════════════════════════════════════════
# ACCOUNTS MANAGEMENT
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ ACCOUNTS MANAGEMENT ═══${NC}\n"

run_test "Create Savings Account"
CREATE_ACCOUNT=$(api_call $CURL_FLAGS -X POST $BASE_URL/accounts \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"owner_id\":\"$JOSE_ID\",\"name\":\"Cuenta de ahorros Bancolombia\",\"type\":\"savings\",\"institution\":\"Bancolombia\",\"last4\":\"1234\",\"initial_balance\":5000000,\"notes\":\"Cuenta principal\"}")
echo "$CREATE_ACCOUNT" | jq -e '.id' > /dev/null
ACCOUNT_ID=$(echo "$CREATE_ACCOUNT" | jq -r '.id')
echo -e "${GREEN}✓ Created savings account ($ACCOUNT_ID)${NC}\n"

run_test "Create Cash Account"
CREATE_CASH=$(api_call $CURL_FLAGS -X POST $BASE_URL/accounts \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"owner_id\":\"$JOSE_ID\",\"name\":\"Efectivo en Casa\",\"type\":\"cash\",\"initial_balance\":200000}")
echo "$CREATE_CASH" | jq -e '.id' > /dev/null
CASH_ACCOUNT_ID=$(echo "$CREATE_CASH" | jq -r '.id')
echo -e "${GREEN}✓ Created cash account ($CASH_ACCOUNT_ID)${NC}\n"

run_test "List Accounts"
ACCOUNTS=$(api_call $CURL_FLAGS -X GET $BASE_URL/accounts -b $COOKIES_FILE)
ACCOUNTS_COUNT=$(echo "$ACCOUNTS" | jq 'length')
[ "$ACCOUNTS_COUNT" -ge "2" ]
echo -e "${GREEN}✓ Listed $ACCOUNTS_COUNT accounts${NC}\n"

run_test "Get Account by ID"
GET_ACCOUNT=$(api_call $CURL_FLAGS -X GET $BASE_URL/accounts/$ACCOUNT_ID -b $COOKIES_FILE)
echo "$GET_ACCOUNT" | jq -e '.id == "'$ACCOUNT_ID'"' > /dev/null
echo "$GET_ACCOUNT" | jq -e '.current_balance == 5000000' > /dev/null
echo -e "${GREEN}✓ Retrieved account details${NC}\n"

run_test "Update Account"
UPDATE_ACCOUNT=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/accounts/$ACCOUNT_ID \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d '{"name":"Cuenta de ahorros Bancolombia Principal","initial_balance":5500000}')
echo "$UPDATE_ACCOUNT" | jq -e '.name == "Cuenta de ahorros Bancolombia Principal"' > /dev/null
echo "$UPDATE_ACCOUNT" | jq -e '.initial_balance == 5500000' > /dev/null
echo -e "${GREEN}✓ Updated account${NC}\n"

run_test "Prevent Duplicate Account Name"
DUPLICATE_STATUS=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X POST $BASE_URL/accounts \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"owner_id\":\"$JOSE_ID\",\"name\":\"Cuenta de ahorros Bancolombia Principal\",\"type\":\"savings\"}")
[ "$DUPLICATE_STATUS" = "409" ]
echo -e "${GREEN}✓ Prevented duplicate account name${NC}\n"

run_test "Delete Account (Will create new account for deletion test)"
DELETE_TEST_ACCOUNT=$(api_call $CURL_FLAGS -X POST $BASE_URL/accounts \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"owner_id\":\"$JOSE_ID\",\"name\":\"Account to Delete\",\"type\":\"savings\"}")
DELETE_TEST_ID=$(echo "$DELETE_TEST_ACCOUNT" | jq -r '.id')
DELETE_STATUS=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X DELETE $BASE_URL/accounts/$DELETE_TEST_ID -b $COOKIES_FILE)
[ "$DELETE_STATUS" = "204" ]
echo -e "${GREEN}✓ Deleted account ($DELETE_TEST_ID)${NC}\n"

# ═══════════════════════════════════════════════════════════
# INCOME MANAGEMENT
# ═══════════════════════════════════════════════════════════

echo -e "\n${BLUE}═══ INCOME MANAGEMENT ═══${NC}\n"

run_test "Create Salary Income"
CREATE_INCOME=$(api_call $CURL_FLAGS -X POST $BASE_URL/income \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"member_id\":\"$JOSE_ID\",\"account_id\":\"$ACCOUNT_ID\",\"type\":\"salary\",\"amount\":5000000,\"description\":\"Salario Enero 2026\",\"income_date\":\"2026-01-15\"}")
echo "$CREATE_INCOME" | jq -e '.id' > /dev/null
INCOME_ID=$(echo "$CREATE_INCOME" | jq -r '.id')
echo "$CREATE_INCOME" | jq -e '.type == "salary"' > /dev/null
echo "$CREATE_INCOME" | jq -e '.amount == 5000000' > /dev/null
echo -e "${GREEN}✓ Created salary income ($INCOME_ID)${NC}\n"

run_test "Create Freelance Income"
CREATE_FREELANCE=$(api_call $CURL_FLAGS -X POST $BASE_URL/income \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"member_id\":\"$JOSE_ID\",\"account_id\":\"$ACCOUNT_ID\",\"type\":\"freelance\",\"amount\":800000,\"description\":\"Proyecto X\",\"income_date\":\"2026-01-22\"}")
echo "$CREATE_FREELANCE" | jq -e '.id' > /dev/null
FREELANCE_ID=$(echo "$CREATE_FREELANCE" | jq -r '.id')
echo -e "${GREEN}✓ Created freelance income ($FREELANCE_ID)${NC}\n"

run_test "Create Internal Movement (Savings Withdrawal)"
CREATE_WITHDRAWAL=$(api_call $CURL_FLAGS -X POST $BASE_URL/income \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"member_id\":\"$JOSE_ID\",\"account_id\":\"$ACCOUNT_ID\",\"type\":\"savings_withdrawal\",\"amount\":1000000,\"description\":\"Retiro de bolsillo\",\"income_date\":\"2026-01-10\"}")
echo "$CREATE_WITHDRAWAL" | jq -e '.id' > /dev/null
WITHDRAWAL_ID=$(echo "$CREATE_WITHDRAWAL" | jq -r '.id')
echo -e "${GREEN}✓ Created savings withdrawal ($WITHDRAWAL_ID)${NC}\n"

run_test "List Income (No Filters)"
INCOME_LIST=$(api_call $CURL_FLAGS -X GET $BASE_URL/income -b $COOKIES_FILE)
INCOME_COUNT=$(echo "$INCOME_LIST" | jq '.income_entries | length')
[ "$INCOME_COUNT" -ge "3" ]
echo -e "${GREEN}✓ Listed $INCOME_COUNT income entries${NC}\n"

run_test "Verify Income Totals"
TOTAL_AMOUNT=$(echo "$INCOME_LIST" | jq -r '.totals.total_amount')
REAL_INCOME=$(echo "$INCOME_LIST" | jq -r '.totals.real_income_amount')
INTERNAL_MOVEMENTS=$(echo "$INCOME_LIST" | jq -r '.totals.internal_movements_amount')
echo "$INCOME_LIST" | jq -e '.totals.total_amount == 6800000' > /dev/null
echo "$INCOME_LIST" | jq -e '.totals.real_income_amount == 5800000' > /dev/null
echo "$INCOME_LIST" | jq -e '.totals.internal_movements_amount == 1000000' > /dev/null
echo -e "${GREEN}✓ Totals verified (total: $TOTAL_AMOUNT, real: $REAL_INCOME, internal: $INTERNAL_MOVEMENTS)${NC}\n"

run_test "Filter Income by Member"
MEMBER_INCOME=$(api_call $CURL_FLAGS -X GET "$BASE_URL/income?member_id=$JOSE_ID" -b $COOKIES_FILE)
MEMBER_COUNT=$(echo "$MEMBER_INCOME" | jq '.income_entries | length')
[ "$MEMBER_COUNT" -ge "3" ]
echo -e "${GREEN}✓ Filtered by member: $MEMBER_COUNT entries${NC}\n"

run_test "Filter Income by Account"
ACCOUNT_INCOME=$(api_call $CURL_FLAGS -X GET "$BASE_URL/income?account_id=$ACCOUNT_ID" -b $COOKIES_FILE)
ACCOUNT_COUNT=$(echo "$ACCOUNT_INCOME" | jq '.income_entries | length')
[ "$ACCOUNT_COUNT" -ge "3" ]
echo -e "${GREEN}✓ Filtered by account: $ACCOUNT_COUNT entries${NC}\n"

run_test "Filter Income by Month"
MONTH_INCOME=$(api_call $CURL_FLAGS -X GET "$BASE_URL/income?month=2026-01" -b $COOKIES_FILE)
MONTH_COUNT=$(echo "$MONTH_INCOME" | jq '.income_entries | length')
[ "$MONTH_COUNT" -ge "3" ]
echo -e "${GREEN}✓ Filtered by month: $MONTH_COUNT entries${NC}\n"

run_test "Get Income by ID"
GET_INCOME=$(api_call $CURL_FLAGS -X GET $BASE_URL/income/$INCOME_ID -b $COOKIES_FILE)
echo "$GET_INCOME" | jq -e '.id == "'$INCOME_ID'"' > /dev/null
echo "$GET_INCOME" | jq -e '.member_name' > /dev/null
echo "$GET_INCOME" | jq -e '.account_name' > /dev/null
echo -e "${GREEN}✓ Retrieved income details with enriched data${NC}\n"

run_test "Update Income"
UPDATE_INCOME=$(api_call $CURL_FLAGS -X PATCH $BASE_URL/income/$INCOME_ID \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d '{"amount":5200000,"description":"Salario Enero + Bono"}')
echo "$UPDATE_INCOME" | jq -e '.amount == 5200000' > /dev/null
echo "$UPDATE_INCOME" | jq -e '.description == "Salario Enero + Bono"' > /dev/null
echo -e "${GREEN}✓ Updated income${NC}\n"

run_test "Prevent Income to Checking Account"
CREATE_CHECKING=$(api_call $CURL_FLAGS -X POST $BASE_URL/accounts \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"owner_id\":\"$JOSE_ID\",\"name\":\"Cuenta Corriente\",\"type\":\"checking\"}")
CHECKING_ID=$(echo "$CREATE_CHECKING" | jq -r '.id')
if [ "$CHECKING_ID" = "null" ] || [ -z "$CHECKING_ID" ]; then
  echo -e "${RED}Failed to create checking account${NC}"
  echo "$CREATE_CHECKING" | jq '.'
  exit 1
fi
INVALID_INCOME_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/income \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"member_id\":\"$JOSE_ID\",\"account_id\":\"$CHECKING_ID\",\"type\":\"salary\",\"amount\":1000000,\"description\":\"Test\",\"income_date\":\"2026-01-15\"}")
INVALID_INCOME_STATUS=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X POST $BASE_URL/income \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "{\"member_id\":\"$JOSE_ID\",\"account_id\":\"$CHECKING_ID\",\"type\":\"salary\",\"amount\":1000000,\"description\":\"Test\",\"income_date\":\"2026-01-15\"}")
if [ "$INVALID_INCOME_STATUS" != "400" ]; then
  echo -e "${RED}Expected HTTP 400, got $INVALID_INCOME_STATUS${NC}"
  echo -e "${YELLOW}Response body:${NC}"
  echo "$INVALID_INCOME_RESPONSE" | jq '.' 2>/dev/null || echo "$INVALID_INCOME_RESPONSE"
  echo -e "${YELLOW}This indicates a backend bug - the API should return 400 for validation errors, not crash with 500${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Prevented income to checking account${NC}\n"

run_test "Delete Income"
DELETE_INCOME_STATUS=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X DELETE $BASE_URL/income/$WITHDRAWAL_ID -b $COOKIES_FILE)
[ "$DELETE_INCOME_STATUS" = "204" ]
echo -e "${GREEN}✓ Deleted income ($WITHDRAWAL_ID)${NC}\n"

run_test "Verify Account Balance After Income"
BALANCE_ACCOUNT=$(api_call $CURL_FLAGS -X GET $BASE_URL/accounts/$ACCOUNT_ID -b $COOKIES_FILE)
# Initial balance 5500000 + income (5200000 + 800000) = 11500000
echo "$BALANCE_ACCOUNT" | jq -e '.current_balance == 11500000' > /dev/null
echo -e "${GREEN}✓ Account balance updated correctly after income${NC}\n"

# ═══════════════════════════════════════════════════════════
# AUDIT LOGGING VERIFICATION
# ═══════════════════════════════════════════════════════════

run_test "Verify audit logs for user registration (AUTH)"
AUTH_REGISTER_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'AUTH_LOGIN' 
    AND user_id = '$JOSE_ID'
    AND success = true
")
AUTH_REGISTER_COUNT=$(echo "$AUTH_REGISTER_COUNT" | xargs)
[ "$AUTH_REGISTER_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Found $AUTH_REGISTER_COUNT audit log(s) for Jose's login${NC}\n"

run_test "Verify audit logs for household creation"
HOUSEHOLD_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'HOUSEHOLD_CREATED' 
    AND resource_id = '$HOUSEHOLD_ID'
    AND success = true
")
HOUSEHOLD_AUDIT_COUNT=$(echo "$HOUSEHOLD_AUDIT_COUNT" | xargs)
[ "$HOUSEHOLD_AUDIT_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Found audit log for household creation${NC}\n"

run_test "Verify audit log has full household snapshot"
HOUSEHOLD_SNAPSHOT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT new_values::text 
  FROM audit_logs 
  WHERE action = 'HOUSEHOLD_CREATED' 
    AND resource_id = '$HOUSEHOLD_ID' 
  LIMIT 1
")
echo "$HOUSEHOLD_SNAPSHOT" | grep -q "Casa de Jose"
echo -e "${GREEN}✓ Audit log contains household snapshot${NC}\n"

run_test "Verify audit logs for household member addition"
MEMBER_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'HOUSEHOLD_MEMBER_ADDED'
    AND success = true
    AND created_at > NOW() - INTERVAL '5 minutes'
")
MEMBER_AUDIT_COUNT=$(echo "$MEMBER_AUDIT_COUNT" | xargs)
[ "$MEMBER_AUDIT_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Found $MEMBER_AUDIT_COUNT audit log(s) for member additions${NC}\n"

run_test "Verify audit logs for account creation"
ACCOUNT_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'ACCOUNT_CREATED'
    AND resource_id = '$ACCOUNT_ID'
    AND success = true
")
ACCOUNT_AUDIT_COUNT=$(echo "$ACCOUNT_AUDIT_COUNT" | xargs)
[ "$ACCOUNT_AUDIT_COUNT" = "1" ]
echo -e "${GREEN}✓ Found audit log for account creation${NC}\n"

run_test "Verify audit log contains account snapshot with initial balance"
ACCOUNT_SNAPSHOT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT new_values::text 
  FROM audit_logs 
  WHERE action = 'ACCOUNT_CREATED' 
    AND resource_id = '$ACCOUNT_ID'
  LIMIT 1
")
echo "$ACCOUNT_SNAPSHOT" | grep -q "5000000"  # Initial balance
echo "$ACCOUNT_SNAPSHOT" | grep -q "Bancolombia"  # Institution
echo -e "${GREEN}✓ Account audit log contains full snapshot${NC}\n"

run_test "Verify audit logs for income creation"
INCOME_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'INCOME_CREATED'
    AND resource_id IN ('$INCOME_ID', '$FREELANCE_ID', '$WITHDRAWAL_ID')
    AND success = true
")
INCOME_AUDIT_COUNT=$(echo "$INCOME_AUDIT_COUNT" | xargs)
[ "$INCOME_AUDIT_COUNT" = "3" ]  # We created 3 income entries
echo -e "${GREEN}✓ Found $INCOME_AUDIT_COUNT audit log(s) for income creation${NC}\n"

run_test "Verify audit logs for income deletion"
INCOME_DELETE_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'INCOME_DELETED'
    AND resource_id = '$WITHDRAWAL_ID'
    AND success = true
")
INCOME_DELETE_COUNT=$(echo "$INCOME_DELETE_COUNT" | xargs)
[ "$INCOME_DELETE_COUNT" = "1" ]
echo -e "${GREEN}✓ Found audit log for income deletion${NC}\n"

run_test "Verify income deletion audit has old values"
INCOME_DELETE_SNAPSHOT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT old_values::text 
  FROM audit_logs 
  WHERE action = 'INCOME_DELETED' 
    AND resource_id = '$WITHDRAWAL_ID'
  LIMIT 1
")
echo "$INCOME_DELETE_SNAPSHOT" | grep -q "$WITHDRAWAL_ID"
echo -e "${GREEN}✓ Income deletion audit log contains old values${NC}\n"

run_test "Verify audit logs for category creation"
CATEGORY_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'CATEGORY_CREATED'
    AND success = true
    AND created_at > NOW() - INTERVAL '5 minutes'
")
CATEGORY_AUDIT_COUNT=$(echo "$CATEGORY_AUDIT_COUNT" | xargs)
[ "$CATEGORY_AUDIT_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Found $CATEGORY_AUDIT_COUNT audit log(s) for category creation${NC}\n"

run_test "Verify audit logs for payment method creation"
PM_CREATE_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'PAYMENT_METHOD_CREATED'
    AND resource_id = '$PM1_ID'
    AND success = true
")
PM_CREATE_AUDIT_COUNT=$(echo "$PM_CREATE_AUDIT_COUNT" | xargs)
[ "$PM_CREATE_AUDIT_COUNT" = "1" ]
echo -e "${GREEN}✓ Found audit log for payment method creation${NC}\n"

run_test "Verify payment method audit log contains snapshot"
PM_SNAPSHOT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT new_values::text 
  FROM audit_logs 
  WHERE action = 'PAYMENT_METHOD_CREATED' 
    AND resource_id = '$PM1_ID'
  LIMIT 1
")
echo "$PM_SNAPSHOT" | grep -q "Débito Jose"
echo "$PM_SNAPSHOT" | grep -q "1234"  # last4
echo "$PM_SNAPSHOT" | grep -q "Banco de Bogotá"
echo -e "${GREEN}✓ Payment method audit log contains full snapshot${NC}\n"

run_test "Verify audit logs for payment method update"
PM_UPDATE_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'PAYMENT_METHOD_UPDATED'
    AND resource_id = '$PM1_ID'
    AND success = true
")
PM_UPDATE_AUDIT_COUNT=$(echo "$PM_UPDATE_AUDIT_COUNT" | xargs)
[ "$PM_UPDATE_AUDIT_COUNT" = "1" ]
echo -e "${GREEN}✓ Found audit log for payment method update${NC}\n"

run_test "Verify payment method update has old and new values"
PM_UPDATE_LOG=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT 
    old_values->>'name' as old_name,
    new_values->>'name' as new_name,
    old_values->>'is_shared_with_household' as old_shared,
    new_values->>'is_shared_with_household' as new_shared
  FROM audit_logs 
  WHERE action = 'PAYMENT_METHOD_UPDATED' 
    AND resource_id = '$PM1_ID'
  LIMIT 1
")
echo "$PM_UPDATE_LOG" | grep -q "Débito Jose"
echo "$PM_UPDATE_LOG" | grep -q "Principal"
echo -e "${GREEN}✓ Payment method update audit log has old and new values${NC}\n"

run_test "Verify audit logs for payment method deletion"
PM_DELETE_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'PAYMENT_METHOD_DELETED'
    AND resource_id = '$PM2_ID'
    AND success = true
")
PM_DELETE_AUDIT_COUNT=$(echo "$PM_DELETE_AUDIT_COUNT" | xargs)
[ "$PM_DELETE_AUDIT_COUNT" = "1" ]
echo -e "${GREEN}✓ Found audit log for payment method deletion${NC}\n"

run_test "Verify payment method deletion has old values"
PM_DELETE_SNAPSHOT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT old_values::text 
  FROM audit_logs 
  WHERE action = 'PAYMENT_METHOD_DELETED' 
    AND resource_id = '$PM2_ID'
  LIMIT 1
")
echo "$PM_DELETE_SNAPSHOT" | grep -q "Efectivo"
echo -e "${GREEN}✓ Payment method deletion audit log contains old values${NC}\n"

run_test "Verify audit logs for budget creation"
BUDGET_AUDIT_COUNT=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'BUDGET_CREATED'
    AND success = true
    AND created_at > NOW() - INTERVAL '5 minutes'
")
BUDGET_AUDIT_COUNT=$(echo "$BUDGET_AUDIT_COUNT" | xargs)
[ "$BUDGET_AUDIT_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Found $BUDGET_AUDIT_COUNT audit log(s) for budget creation${NC}\n"

run_test "List all audit logs via admin API"
AUDIT_LIST=$(api_call $CURL_FLAGS "$BASE_URL/admin/audit-logs?limit=50")
AUDIT_LIST_COUNT=$(echo "$AUDIT_LIST" | jq '.logs | length')
[ "$AUDIT_LIST_COUNT" -ge "10" ]
echo -e "${GREEN}✓ Admin API returned $AUDIT_LIST_COUNT audit logs${NC}\n"

run_test "Verify audit logs can be filtered by action"
HOUSEHOLD_CREATE_LOGS=$(api_call $CURL_FLAGS "$BASE_URL/admin/audit-logs?action=HOUSEHOLD_CREATED&limit=10")
HOUSEHOLD_CREATE_COUNT=$(echo "$HOUSEHOLD_CREATE_LOGS" | jq '.logs | length')
[ "$HOUSEHOLD_CREATE_COUNT" -ge "1" ]
echo -e "${GREEN}✓ Found $HOUSEHOLD_CREATE_COUNT filtered audit log(s)${NC}\n"

run_test "Verify audit logs contain user_id tracking"
USER_LOGS=$(PAGER=cat psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE user_id = '$JOSE_ID'
")
USER_LOGS=$(echo "$USER_LOGS" | xargs)
[ "$USER_LOGS" -ge "10" ]
echo -e "${GREEN}✓ Found $USER_LOGS audit logs for Jose's user ID${NC}\n"

# ═══════════════════════════════════════════════════════════
# CLEANUP (if requested)
# ═══════════════════════════════════════════════════════════

if [ "$CLEANUP" = "true" ]; then
  echo -e "\n${YELLOW}🧹 Cleaning up test data...${NC}\n"

  run_test "Delete Test Households"
  # Delete households created during tests (some may already be deleted)
  api_call $CURL_FLAGS -X DELETE $BASE_URL/households/$HOUSEHOLD_ID -b $COOKIES_FILE > /dev/null 2>&1 || true
  api_call $CURL_FLAGS -X DELETE $BASE_URL/households/$HOUSEHOLD2_ID -b $COOKIES_FILE > /dev/null 2>&1 || true
  echo -e "${GREEN}✓ Deleted test households${NC}\n"

  run_test "Delete Jose's Account"
  DELETE_JOSE=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X DELETE $BASE_URL/auth/account -b $COOKIES_FILE)
  [ "$DELETE_JOSE" = "204" ]
  echo -e "${GREEN}✓ Deleted Jose's account ($JOSE_EMAIL)${NC}\n"

  run_test "Delete Caro's Account"
  DELETE_CARO=$(curl $CURL_FLAGS -w "%{http_code}" -o /dev/null -X DELETE $BASE_URL/auth/account -b $CARO_COOKIES_FILE)
  [ "$DELETE_CARO" = "204" ]
  echo -e "${GREEN}✓ Deleted Caro's account ($CARO_EMAIL)${NC}\n"
fi

# Clean up cookie files
rm -f $COOKIES_FILE $CARO_COOKIES_FILE

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║              ✅ ALL TESTS PASSED! ✅                   ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"
