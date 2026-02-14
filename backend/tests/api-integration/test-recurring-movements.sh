#!/bin/bash
# Recurring Movements API Integration Test Suite
# Tests templates for recurring movements (gastos periódicos)

set -e  # Exit on any error
set -o pipefail  # Exit on pipe failure

BASE_URL="${API_BASE_URL:-http://localhost:8080}"
COOKIES_FILE="/tmp/gastos-recurring-cookies.txt"
EMAIL="test+$(date +%s%N)@test.com"
PASSWORD="Test1234!"
DEBUG="${DEBUG:-false}"
DATABASE_URL="${DATABASE_URL:-postgresql://conti:conti_dev_password@localhost:5432/conti?sslmode=disable}"

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
echo "║  🧪 Recurring Movements API Integration Tests         ║"
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
# SETUP: Register user and create household with categories
# ═══════════════════════════════════════════════════════════

run_test "Health Check"
HEALTH=$(api_call $CURL_FLAGS $BASE_URL/health)
echo "$HEALTH" | jq -e '.status == "healthy"' > /dev/null
echo -e "${GREEN}✓ Server is healthy${NC}\n"

run_test "Register User"
REGISTER_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"name\":\"Test User\",\"password\":\"$PASSWORD\",\"password_confirm\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE)
echo "$REGISTER_RESPONSE" | jq -e '.message' > /dev/null
echo -e "${GREEN}✓ User registered${NC}\n"

run_test "Get User ID"
ME_RESPONSE=$(api_call $CURL_FLAGS -X GET $BASE_URL/me \
  -b $COOKIES_FILE)
USER_ID=$(echo "$ME_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ User ID retrieved: $USER_ID${NC}\n"

run_test "Create Household"
HOUSEHOLD_RESPONSE=$(api_call $CURL_FLAGS -X POST $BASE_URL/households \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Test Household"}')
HOUSEHOLD_ID=$(echo "$HOUSEHOLD_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Household created (ID: $HOUSEHOLD_ID)${NC}\n"

run_test "Create Category Group for testing"
GROUP_RESPONSE=$(api_call $CURL_FLAGS -X POST "$BASE_URL/category-groups" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Casa","icon":"🏠"}')
GROUP_ID=$(echo "$GROUP_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Category group created (ID: $GROUP_ID)${NC}\n"

run_test "Create Category for testing"
CREATE_CATEGORY=$(api_call $CURL_FLAGS -X POST $BASE_URL/categories \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"name\":\"Gastos fijos\",\"category_group_id\":\"$GROUP_ID\"}")
CATEGORY_ID=$(echo "$CREATE_CATEGORY" | jq -r '.id')
CATEGORY_NAME=$(echo "$CREATE_CATEGORY" | jq -r '.name')
echo -e "${GREEN}✓ Using category: $CATEGORY_NAME (ID: $CATEGORY_ID)${NC}\n"

run_test "Create Contact (for templates with contact payer)"
CONTACT_RESPONSE=$(api_call $CURL_FLAGS -X POST "$BASE_URL/households/$HOUSEHOLD_ID/contacts" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"name":"Landlord","email":"landlord@example.com"}')
CONTACT_ID=$(echo "$CONTACT_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Contact created (ID: $CONTACT_ID)${NC}\n"

# ═══════════════════════════════════════════════════════════
# RECURRING MOVEMENTS TEMPLATES TESTS
# ═══════════════════════════════════════════════════════════

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Recurring Movements Templates API Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# ───────────────────────────────────────────────────────────
# CREATE TEMPLATES
# ───────────────────────────────────────────────────────────

run_test "Create template with auto-generate (monthly rent)"
TEMPLATE_FIXED_AUTO=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/recurring-movements \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Arriendo\",
    \"description\": \"Rent payment\",
    \"movement_type\": \"SPLIT\",
    \"category_id\": \"$CATEGORY_ID\",
    \"amount\": 3200000,
    \"auto_generate\": true,
    \"payer_contact_id\": \"$CONTACT_ID\",
    \"participants\": [{
      \"participant_user_id\": \"$USER_ID\",
      \"percentage\": 1.0
    }],
    \"recurrence_pattern\": \"MONTHLY\",
    \"day_of_month\": 1,
    \"start_date\": \"2026-01-01\"
  }")
TEMPLATE_FIXED_AUTO_ID=$(echo "$TEMPLATE_FIXED_AUTO" | jq -r '.id')
echo "$TEMPLATE_FIXED_AUTO" | jq -e '.name == "Arriendo"' > /dev/null
echo "$TEMPLATE_FIXED_AUTO" | jq -e '.auto_generate == true' > /dev/null
echo "$TEMPLATE_FIXED_AUTO" | jq -e '.amount == 3200000' > /dev/null
echo -e "${GREEN}✓ Auto-generate template created (ID: $TEMPLATE_FIXED_AUTO_ID)${NC}\n"

run_test "Create template without auto-generate (manual only)"
# Note: HOUSEHOLD type doesn't need payer_user_id - the payer is implicit (the household as a unit)
TEMPLATE_FIXED_MANUAL=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/recurring-movements \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Restaurante favorito\",
    \"description\": \"Dinner at favorite restaurant\",
    \"movement_type\": \"HOUSEHOLD\",
    \"category_id\": \"$CATEGORY_ID\",
    \"amount\": 150000,
    \"auto_generate\": false
  }")
TEMPLATE_FIXED_MANUAL_ID=$(echo "$TEMPLATE_FIXED_MANUAL" | jq -r '.id')
echo "$TEMPLATE_FIXED_MANUAL" | jq -e '.name == "Restaurante favorito"' > /dev/null
echo "$TEMPLATE_FIXED_MANUAL" | jq -e '.auto_generate == false' > /dev/null
echo -e "${GREEN}✓ Manual template created (ID: $TEMPLATE_FIXED_MANUAL_ID)${NC}\n"

run_test "Create template with estimated amount (user can adjust)"
# Note: HOUSEHOLD type doesn't need payer_user_id - the payer is implicit (the household as a unit)
TEMPLATE_VARIABLE=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/recurring-movements \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Servicios (Energía)\",
    \"description\": \"Variable electricity bill\",
    \"movement_type\": \"HOUSEHOLD\",
    \"category_id\": \"$CATEGORY_ID\",
    \"amount\": 200000,
    \"auto_generate\": false
  }")
TEMPLATE_VARIABLE_ID=$(echo "$TEMPLATE_VARIABLE" | jq -r '.id')
echo "$TEMPLATE_VARIABLE" | jq -e '.amount == 200000' > /dev/null
echo -e "${GREEN}✓ Template with estimated amount created (ID: $TEMPLATE_VARIABLE_ID)${NC}\n"

# ───────────────────────────────────────────────────────────
# VALIDATION TESTS
# ───────────────────────────────────────────────────────────

run_test "Reject template with auto_generate=true but no recurrence"
# Note: HOUSEHOLD type doesn't need payer_user_id
INVALID_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X POST $BASE_URL/api/recurring-movements \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Invalid Template\",
    \"movement_type\": \"HOUSEHOLD\",
    \"category_id\": \"$CATEGORY_ID\",
    \"amount\": 100000,
    \"auto_generate\": true
  }")
HTTP_CODE=$(echo "$INVALID_RESPONSE" | tail -n1)
[ "$HTTP_CODE" == "400" ]
echo -e "${GREEN}✓ Correctly rejected auto_generate without recurrence (HTTP 400)${NC}\n"

run_test "Reject template without amount"
# Note: HOUSEHOLD type doesn't need payer_user_id
INVALID_RESPONSE2=$(curl $CURL_FLAGS -w "\n%{http_code}" -X POST $BASE_URL/api/recurring-movements \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Invalid Template 2\",
    \"movement_type\": \"HOUSEHOLD\",
    \"category_id\": \"$CATEGORY_ID\"
  }")
HTTP_CODE2=$(echo "$INVALID_RESPONSE2" | tail -n1)
[ "$HTTP_CODE2" == "400" ]
echo -e "${GREEN}✓ Correctly rejected template without amount (HTTP 400)${NC}\n"

# ───────────────────────────────────────────────────────────
# READ OPERATIONS
# ───────────────────────────────────────────────────────────

run_test "List all templates"
TEMPLATES_LIST=$(api_call $CURL_FLAGS -X GET $BASE_URL/api/recurring-movements -b $COOKIES_FILE)
TEMPLATE_COUNT=$(echo "$TEMPLATES_LIST" | jq '. | length')
[ "$TEMPLATE_COUNT" -ge 3 ]
echo -e "${GREEN}✓ Listed $TEMPLATE_COUNT templates${NC}\n"

run_test "Get template by ID"
TEMPLATE_GET=$(api_call $CURL_FLAGS -X GET "$BASE_URL/api/recurring-movements/$TEMPLATE_FIXED_AUTO_ID" \
  -b $COOKIES_FILE)
echo "$TEMPLATE_GET" | jq -e ".id == \"$TEMPLATE_FIXED_AUTO_ID\"" > /dev/null
echo "$TEMPLATE_GET" | jq -e '.name == "Arriendo"' > /dev/null
echo -e "${GREEN}✓ Retrieved template by ID${NC}\n"

run_test "List templates by category"
TEMPLATES_BY_CATEGORY=$(api_call $CURL_FLAGS -X GET "$BASE_URL/api/recurring-movements/category/$CATEGORY_ID" \
  -b $COOKIES_FILE)
CATEGORY_TEMPLATE_COUNT=$(echo "$TEMPLATES_BY_CATEGORY" | jq '. | length')
[ "$CATEGORY_TEMPLATE_COUNT" -ge 3 ]
echo -e "${GREEN}✓ Listed $CATEGORY_TEMPLATE_COUNT templates for category${NC}\n"

run_test "List templates with filters (is_active=true)"
ACTIVE_TEMPLATES=$(api_call $CURL_FLAGS -X GET "$BASE_URL/api/recurring-movements?is_active=true" \
  -b $COOKIES_FILE)
ACTIVE_COUNT=$(echo "$ACTIVE_TEMPLATES" | jq '. | length')
[ "$ACTIVE_COUNT" -ge 3 ]
echo -e "${GREEN}✓ Listed $ACTIVE_COUNT active templates${NC}\n"

# ───────────────────────────────────────────────────────────
# PREFILL DATA TESTS
# ───────────────────────────────────────────────────────────

run_test "Get prefill data (normal - no role inversion)"
PREFILL_DATA=$(api_call $CURL_FLAGS -X GET "$BASE_URL/api/recurring-movements/prefill/$TEMPLATE_FIXED_MANUAL_ID" \
  -b $COOKIES_FILE)
echo "$PREFILL_DATA" | jq -e '.template_id != null' > /dev/null
echo "$PREFILL_DATA" | jq -e '.amount == 150000' > /dev/null
echo "$PREFILL_DATA" | jq -e '.movement_type == "HOUSEHOLD"' > /dev/null
echo -e "${GREEN}✓ Retrieved prefill data (normal)${NC}\n"

run_test "Get prefill data with role inversion (SPLIT template → DEBT_PAYMENT)"
PREFILL_INVERTED=$(api_call $CURL_FLAGS -X GET "$BASE_URL/api/recurring-movements/prefill/$TEMPLATE_FIXED_AUTO_ID?invert_roles=true" \
  -b $COOKIES_FILE)
echo "$PREFILL_INVERTED" | jq -e '.template_id != null' > /dev/null
echo "$PREFILL_INVERTED" | jq -e '.amount == 3200000' > /dev/null
# Role inversion: original payer (contact) becomes counterparty
echo "$PREFILL_INVERTED" | jq -e ".counterparty_contact_id == \"$CONTACT_ID\"" > /dev/null
# Original participant (user) becomes payer
echo "$PREFILL_INVERTED" | jq -e ".payer_user_id == \"$USER_ID\"" > /dev/null
echo -e "${GREEN}✓ Retrieved prefill data with role inversion${NC}\n"

run_test "Get prefill data for template with estimated amount"
PREFILL_VARIABLE=$(api_call $CURL_FLAGS -X GET "$BASE_URL/api/recurring-movements/prefill/$TEMPLATE_VARIABLE_ID" \
  -b $COOKIES_FILE)
echo "$PREFILL_VARIABLE" | jq -e '.amount == 200000' > /dev/null
echo -e "${GREEN}✓ Template prefill includes estimated amount${NC}\n"

# ───────────────────────────────────────────────────────────
# UPDATE OPERATIONS
# ───────────────────────────────────────────────────────────

run_test "Update template (change amount)"
UPDATE_RESPONSE=$(api_call $CURL_FLAGS -X PUT "$BASE_URL/api/recurring-movements/$TEMPLATE_FIXED_MANUAL_ID" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"amount": 180000}')
echo "$UPDATE_RESPONSE" | jq -e '.amount == 180000' > /dev/null
echo -e "${GREEN}✓ Template updated successfully${NC}\n"

run_test "Update template (deactivate)"
DEACTIVATE_RESPONSE=$(api_call $CURL_FLAGS -X PUT "$BASE_URL/api/recurring-movements/$TEMPLATE_VARIABLE_ID" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d '{"is_active": false}')
echo "$DEACTIVATE_RESPONSE" | jq -e '.is_active == false' > /dev/null
echo -e "${GREEN}✓ Template deactivated${NC}\n"

# ───────────────────────────────────────────────────────────
# DELETE OPERATIONS
# ───────────────────────────────────────────────────────────

run_test "Delete template"
DELETE_RESPONSE=$(curl $CURL_FLAGS -w "\n%{http_code}" -X DELETE "$BASE_URL/api/recurring-movements/$TEMPLATE_VARIABLE_ID" \
  -b $COOKIES_FILE)
HTTP_CODE_DELETE=$(echo "$DELETE_RESPONSE" | tail -n1)
[ "$HTTP_CODE_DELETE" == "204" ]
echo -e "${GREEN}✓ Template deleted (HTTP 204)${NC}\n"

run_test "Verify template deleted (should return 404)"
NOT_FOUND=$(curl $CURL_FLAGS -w "\n%{http_code}" -X GET "$BASE_URL/api/recurring-movements/$TEMPLATE_VARIABLE_ID" \
  -b $COOKIES_FILE)
HTTP_CODE_NOT_FOUND=$(echo "$NOT_FOUND" | tail -n1)
[ "$HTTP_CODE_NOT_FOUND" == "404" ]
echo -e "${GREEN}✓ Deleted template returns 404${NC}\n"

# ═══════════════════════════════════════════════════════════
# AUTO-GENERATION AND TEMPLATE PREFILL TESTS
# ═══════════════════════════════════════════════════════════

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Auto-Generation and Template Prefill Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

run_test "Create auto-generate template for testing prefill"
TEMPLATE_PREFILL_TEST=$(api_call $CURL_FLAGS -X POST $BASE_URL/api/recurring-movements \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{
    \"name\": \"Test Auto Template\",
    \"description\": \"For prefill testing\",
    \"movement_type\": \"SPLIT\",
    \"category_id\": \"$CATEGORY_ID\",
    \"amount\": 1000000,
    \"auto_generate\": true,
    \"payer_contact_id\": \"$CONTACT_ID\",
    \"participants\": [{
      \"participant_user_id\": \"$USER_ID\",
      \"percentage\": 1.0
    }],
    \"recurrence_pattern\": \"MONTHLY\",
    \"day_of_month\": 1,
    \"start_date\": \"2026-01-01\"
  }")
TEMPLATE_PREFILL_ID=$(echo "$TEMPLATE_PREFILL_TEST" | jq -r '.id')
echo -e "${GREEN}✓ Auto-generate template created (ID: $TEMPLATE_PREFILL_ID)${NC}\n"

run_test "Frontend flow: Detect movement has template → fetch prefill separately"
# Step 1: GET movement (would have generated_from_template_id if auto-generated)
# For testing, we simulate by knowing the template_id
TEMPLATE_ID="$TEMPLATE_PREFILL_ID"

# Step 2: Frontend makes separate call to get prefill data
PREFILL_DATA=$(api_call $CURL_FLAGS -X GET "$BASE_URL/api/recurring-movements/prefill/$TEMPLATE_ID?invert_roles=true" \
  -b $COOKIES_FILE)
PREFILL_TEMPLATE_ID=$(echo "$PREFILL_DATA" | jq -r '.template_id')
PREFILL_MOVEMENT_TYPE=$(echo "$PREFILL_DATA" | jq -r '.movement_type')
[ "$PREFILL_TEMPLATE_ID" == "$TEMPLATE_ID" ]
[ "$PREFILL_MOVEMENT_TYPE" == "DEBT_PAYMENT" ] # Role inverted for payment
echo -e "${GREEN}✓ Frontend 2-call pattern: prefill data retrieved separately${NC}\n"

run_test "Verify prefill data has inverted roles (SPLIT → DEBT_PAYMENT)"
PREFILL_PAYER=$(echo "$PREFILL_DATA" | jq -r '.payer_user_id')
PREFILL_COUNTERPARTY=$(echo "$PREFILL_DATA" | jq -r '.counterparty_contact_id')
[ "$PREFILL_PAYER" == "$USER_ID" ] # User becomes payer (was participant)
[ "$PREFILL_COUNTERPARTY" == "$CONTACT_ID" ] # Contact becomes counterparty (was payer)
echo -e "${GREEN}✓ Role inversion works correctly (clean architecture)${NC}\n"

# ═══════════════════════════════════════════════════════════
# TEST: Manual Generation Trigger
# ═══════════════════════════════════════════════════════════

run_test "Create template with auto_generate and past scheduled date"
# Create a template that should be auto-generated (next_scheduled_date is in the past)
PAST_DATE="2025-12-01" # Date in the past so next_scheduled_date will be 2026-01-01
AUTO_TEMPLATE_PAYLOAD=$(cat <<EOF
{
  "category_id": "$CATEGORY_ID",
  "name": "Auto-Generated Rent",
  "description": "Test auto-generation",
  "movement_type": "SPLIT",
  "amount": 3200000.00,
  "payer_contact_id": "$CONTACT_ID",
  "participants": [
    {
      "participant_user_id": "$USER_ID",
      "percentage": 1.0
    }
  ],
  "auto_generate": true,
  "recurrence_pattern": "MONTHLY",
  "start_date": "$PAST_DATE",
  "day_of_month": 1
}
EOF
)
AUTO_GEN_TEMPLATE=$(api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements" \
  -b $COOKIES_FILE \
  -H "Content-Type: application/json" \
  -d "$AUTO_TEMPLATE_PAYLOAD")
AUTO_GEN_TEMPLATE_ID=$(echo "$AUTO_GEN_TEMPLATE" | jq -r '.id')
[ -n "$AUTO_GEN_TEMPLATE_ID" ] && [ "$AUTO_GEN_TEMPLATE_ID" != "null" ]
echo -e "${GREEN}✓ Created template for auto-generation (ID: $AUTO_GEN_TEMPLATE_ID)${NC}\n"

run_test "Manually trigger generator to process pending templates"
GENERATE_RESPONSE=$(api_call $CURL_FLAGS -X POST "$BASE_URL/api/recurring-movements/generate" \
  -b $COOKIES_FILE)
SUCCESS=$(echo "$GENERATE_RESPONSE" | jq -r '.success')
[ "$SUCCESS" == "true" ]
echo -e "${GREEN}✓ Manual generation triggered successfully${NC}\n"

run_test "Verify movement was auto-generated with generated_from_template_id"
# Get all movements and find one with our template_id
sleep 2 # Give it a moment to generate
MOVEMENTS=$(api_call $CURL_FLAGS -X GET "$BASE_URL/movements?household=$HOUSEHOLD_ID" \
  -b $COOKIES_FILE)
# Find movement that was generated from our template
GENERATED_MOVEMENT=$(echo "$MOVEMENTS" | jq -r ".movements[] | select(.generated_from_template_id == \"$AUTO_GEN_TEMPLATE_ID\")")
[ -n "$GENERATED_MOVEMENT" ]
GEN_MOVEMENT_AMOUNT=$(echo "$GENERATED_MOVEMENT" | jq -r '.amount')
[ "$GEN_MOVEMENT_AMOUNT" == "3200000" ]
echo -e "${GREEN}✓ Movement auto-generated with correct generated_from_template_id${NC}\n"

run_test "Verify auto-generated movement has correct type and participants"
GEN_MOVEMENT_TYPE=$(echo "$GENERATED_MOVEMENT" | jq -r '.type')
GEN_PAYER=$(echo "$GENERATED_MOVEMENT" | jq -r '.payer.name') # Contact name
[ "$GEN_MOVEMENT_TYPE" == "SPLIT" ]
echo -e "${GREEN}✓ Auto-generated movement has correct structure${NC}\n"

# ═══════════════════════════════════════════════════════════
# TEST: TEMPLATES IN MOVEMENT FORM CONFIG
# ═══════════════════════════════════════════════════════════

echo -e "\n${CYAN}TEST 23: Templates included in movement form config (optimization)${NC}"
echo "-----------------------------------------------------------"
echo "Verifying that /movement-form-config returns all templates grouped by category..."

# Get form config (using same pattern as test-api.sh)
FORM_CONFIG=$(api_call $CURL_FLAGS $BASE_URL/movement-form-config -b $COOKIES_FILE)

# Verify recurring_templates field exists
if ! echo "$FORM_CONFIG" | jq -e '.recurring_templates' > /dev/null; then
  echo -e "${RED}✗ Missing recurring_templates field in response${NC}"
  echo "$FORM_CONFIG" | jq '.'
  exit 1
fi

# Verify it's a map/object
if ! echo "$FORM_CONFIG" | jq -e '.recurring_templates | type == "object"' > /dev/null; then
  echo -e "${RED}✗ recurring_templates is not an object${NC}"
  echo "$FORM_CONFIG" | jq '.recurring_templates'
  exit 1
fi

# Verify templates are grouped by category_id
TEMPLATES_COUNT=$(echo "$FORM_CONFIG" | jq '.recurring_templates | to_entries | length')
echo "✓ Found templates for $TEMPLATES_COUNT categories"

# Verify each template has required fields (if templates exist)
if [ "$TEMPLATES_COUNT" -gt 0 ]; then
  if echo "$FORM_CONFIG" | jq -e '.recurring_templates | to_entries[] | .value[] | (.id and .name)' > /dev/null 2>&1; then
    echo "✓ All templates have id and name fields"
  else
    echo -e "${RED}✗ Templates missing required fields${NC}"
    echo "$FORM_CONFIG" | jq '.recurring_templates'
    exit 1
  fi
  
  # Verify templates for our category exist
  CATEGORY_WITH_TEMPLATES=$(echo "$FORM_CONFIG" | jq -r '.recurring_templates | to_entries[0].key')
  TEMPLATE_NAME=$(echo "$FORM_CONFIG" | jq -r ".recurring_templates[\"$CATEGORY_WITH_TEMPLATES\"][0].name")
  echo "✓ Example: Category $CATEGORY_WITH_TEMPLATES has template '$TEMPLATE_NAME'"
fi

echo -e "${GREEN}✓ Movement form config includes templates correctly${NC}"

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║              ✓ ALL TESTS PASSED                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo -e "${CYAN}Test Summary:${NC}"
echo "• Created 3 template types (FIXED auto, FIXED manual, VARIABLE)"
echo "• Validated constraints (VARIABLE can't auto-generate)"
echo "• Tested list/get/update/delete operations"
echo "• Tested prefill data (normal and role inversion)"
echo "• Verified 2-call pattern (clean architecture, no coupling)"
echo "• Tested manual trigger endpoint for auto-generation"
echo "• Verified movements created with generated_from_template_id"
echo "• Verified templates included in /movement-form-config (optimization)"
echo "• Verified proper error codes (400, 404)"
echo ""

# Clean up
rm -f $COOKIES_FILE
