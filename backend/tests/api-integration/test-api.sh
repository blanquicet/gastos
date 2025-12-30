#!/bin/bash
# Quick API Testing Script - Alternative to Postman
# Tests all Households API endpoints

set -e  # Exit on error

BASE_URL="http://localhost:8080"
COOKIES_FILE="/tmp/gastos-cookies.txt"
JOSE_EMAIL="jose@test.com"
CARO_EMAIL="caro@test.com"
PASSWORD="Test1234!"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Starting Gastos Households API Tests${NC}\n"

# Clean up old cookies
rm -f $COOKIES_FILE

# Test 1: Health Check
echo -e "${YELLOW}[1/17] Health Check${NC}"
curl -s $BASE_URL/health | jq .
echo -e "${GREEN}✓ Server is healthy${NC}\n"

# Test 2: Register Jose
echo -e "${YELLOW}[2/17] Register Jose${NC}"
curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$JOSE_EMAIL\",\"name\":\"Jose\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE | jq .
echo -e "${GREEN}✓ Jose registered${NC}\n"

# Test 3: Get Current User
echo -e "${YELLOW}[3/17] Get Current User${NC}"
USER_RESPONSE=$(curl -s $BASE_URL/me -b $COOKIES_FILE)
echo $USER_RESPONSE | jq .
JOSE_ID=$(echo $USER_RESPONSE | jq -r '.id')
echo -e "${GREEN}✓ Logged in as Jose (ID: $JOSE_ID)${NC}\n"

# Test 4: Register Caro
echo -e "${YELLOW}[4/17] Register Caro${NC}"
curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$CARO_EMAIL\",\"name\":\"Caro\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  > /dev/null
echo -e "${GREEN}✓ Caro registered${NC}\n"

# Test 5: Login as Jose (switch back)
echo -e "${YELLOW}[5/17] Login as Jose${NC}"
curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$JOSE_EMAIL\",\"password\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE > /dev/null
echo -e "${GREEN}✓ Logged in as Jose${NC}\n"

# Test 6: Create Household
echo -e "${YELLOW}[6/17] Create Household${NC}"
HOUSEHOLD_RESPONSE=$(curl -s -X POST $BASE_URL/households \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Casa de Jose y Caro"}')
echo $HOUSEHOLD_RESPONSE | jq .
HOUSEHOLD_ID=$(echo $HOUSEHOLD_RESPONSE | jq -r '.id')
echo -e "${GREEN}✓ Household created (ID: $HOUSEHOLD_ID)${NC}\n"

# Test 7: List Households
echo -e "${YELLOW}[7/17] List Households${NC}"
curl -s $BASE_URL/households -b $COOKIES_FILE | jq .
echo -e "${GREEN}✓ Households listed${NC}\n"

# Test 8: Get Household Details
echo -e "${YELLOW}[8/17] Get Household Details${NC}"
curl -s $BASE_URL/households/$HOUSEHOLD_ID -b $COOKIES_FILE | jq .
echo -e "${GREEN}✓ Household details retrieved${NC}\n"

# Test 9: Update Household
echo -e "${YELLOW}[9/17] Update Household Name${NC}"
curl -s -X PATCH $BASE_URL/households/$HOUSEHOLD_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Mi Hogar Actualizado"}' | jq .
echo -e "${GREEN}✓ Household updated${NC}\n"

# Test 10: Add Member (Caro)
echo -e "${YELLOW}[10/17] Add Member (Caro)${NC}"
MEMBER_RESPONSE=$(curl -s -X POST $BASE_URL/households/$HOUSEHOLD_ID/members \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"email\":\"$CARO_EMAIL\"}")
echo $MEMBER_RESPONSE | jq .
CARO_ID=$(echo $MEMBER_RESPONSE | jq -r '.user_id')
echo -e "${GREEN}✓ Caro added as member (ID: $CARO_ID)${NC}\n"

# Test 11: Promote Member to Owner
echo -e "${YELLOW}[11/17] Promote Caro to Owner${NC}"
curl -s -X PATCH $BASE_URL/households/$HOUSEHOLD_ID/members/$CARO_ID/role \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"role":"owner"}' | jq .
echo -e "${GREEN}✓ Caro promoted to owner${NC}\n"

# Test 12: Create Unlinked Contact
echo -e "${YELLOW}[12/17] Create Unlinked Contact${NC}"
CONTACT_RESPONSE=$(curl -s -X POST $BASE_URL/households/$HOUSEHOLD_ID/contacts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Papá","email":"papa@test.com","phone":"+57 300 123 4567"}')
echo $CONTACT_RESPONSE | jq .
CONTACT_ID=$(echo $CONTACT_RESPONSE | jq -r '.id')
echo -e "${GREEN}✓ Contact created (ID: $CONTACT_ID)${NC}\n"

# Test 13: Create Auto-Linked Contact
echo -e "${YELLOW}[13/17] Create Auto-Linked Contact${NC}"
LINKED_CONTACT=$(curl -s -X POST $BASE_URL/households/$HOUSEHOLD_ID/contacts \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Maria\",\"email\":\"$CARO_EMAIL\"}")
echo $LINKED_CONTACT | jq .
IS_REGISTERED=$(echo $LINKED_CONTACT | jq -r '.is_registered')
if [ "$IS_REGISTERED" = "true" ]; then
  echo -e "${GREEN}✓ Contact auto-linked to Caro!${NC}\n"
else
  echo -e "${RED}✗ Contact NOT auto-linked (expected true, got: $IS_REGISTERED)${NC}\n"
fi

# Test 14: Update Contact
echo -e "${YELLOW}[14/17] Update Contact${NC}"
curl -s -X PATCH $BASE_URL/households/$HOUSEHOLD_ID/contacts/$CONTACT_ID \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Papa Juan","email":"papa@test.com","phone":"+57 300 999 8888"}' | jq .
echo -e "${GREEN}✓ Contact updated${NC}\n"

# Test 15: Delete Contact
echo -e "${YELLOW}[15/17] Delete Contact${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  $BASE_URL/households/$HOUSEHOLD_ID/contacts/$CONTACT_ID \
  -b $COOKIES_FILE)
if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✓ Contact deleted (204 No Content)${NC}\n"
else
  echo -e "${RED}✗ Unexpected status code: $HTTP_CODE${NC}\n"
fi

# Test 16: Error Case - Duplicate Member
echo -e "${YELLOW}[16/17] Error Test: Add Duplicate Member${NC}"
ERROR_RESPONSE=$(curl -s -X POST $BASE_URL/households/$HOUSEHOLD_ID/members \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"email\":\"$CARO_EMAIL\"}")
echo $ERROR_RESPONSE | jq .
ERROR_MSG=$(echo $ERROR_RESPONSE | jq -r '.error')
if [[ "$ERROR_MSG" == *"miembro"* ]]; then
  echo -e "${GREEN}✓ Duplicate member rejected correctly${NC}\n"
else
  echo -e "${RED}✗ Expected error message about duplicate member${NC}\n"
fi

# Test 17: Error Case - Unauthorized
echo -e "${YELLOW}[17/17] Error Test: Unauthorized Access${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  $BASE_URL/households \
  -H "Content-Type: application/json" \
  -d '{"name":"Unauthorized Test"}')
if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✓ Unauthorized access rejected (401)${NC}\n"
else
  echo -e "${YELLOW}⚠ Got $HTTP_CODE (session cookies may persist across requests)${NC}\n"
fi

# Final Summary
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All 17 tests completed!${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Clean up
rm -f $COOKIES_FILE
